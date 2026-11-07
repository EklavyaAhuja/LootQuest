import https from 'https';
import http from 'http';

// Vercel Serverless Function - Hardened CORS Proxy for Claimr Web
const ALLOWED_DOMAINS = [
  'reddit.com',
  'photon-reddit.com',
  'feeder.co',
  'steampowered.com',
  'steamstatic.com',
  'steamcommunity.com',
  'akamaihd.net',
  'epicgames.com',
  'epicgames.dev',
  'gamerpower.com',
  'steamspy.com',
];

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024; // 5 MB cap
const RATE_LIMIT_WINDOW_MS = 60 * 1000;    // 1 minute
const MAX_REQUESTS_PER_WINDOW = 120;       // 120 reqs/min per IP

// In-memory rate limiting map (IP -> { count, resetTime })
const ipRateLimitMap = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const record = ipRateLimitMap.get(ip);
  if (!record || now > record.resetTime) {
    ipRateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (record.count >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }
  record.count += 1;
  return true;
}

// Cleanup rate limit map every 5 minutes to prevent memory leaks
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of ipRateLimitMap.entries()) {
      if (now > record.resetTime) {
        ipRateLimitMap.delete(ip);
      }
    }
  }, 5 * 60 * 1000).unref?.();
}

function doNativeRequest(targetUrl, opts, timeoutMs = 9000) {
  return new Promise((resolve, reject) => {
    const isHttps = targetUrl.protocol === 'https:';
    const client = isHttps ? https : http;

    const headers = { ...opts.headers };
    if (opts.body) {
      headers['Content-Length'] = Buffer.byteLength(opts.body);
    }

    const req = client.request(targetUrl, {
      method: opts.method || 'GET',
      headers,
      timeout: timeoutMs,
    }, res => {
      const chunks = [];
      let totalLength = 0;
      res.on('data', chunk => {
        totalLength += chunk.length;
        if (totalLength > MAX_RESPONSE_SIZE) {
          req.destroy(new Error('Payload Too Large'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode || 200,
          headers: res.headers,
          buffer: Buffer.concat(chunks),
        });
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('Request timed out'));
    });
    req.on('error', reject);

    if (opts.body) {
      req.write(opts.body);
    }
    req.end();
  });
}

export default async function handler(req, res) {
  // 1. Enforce GET and POST only
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Accept');
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET,POST,OPTIONS');
    return res.status(405).json({ error: 'Method Not Allowed. Proxy supports GET and POST only.' });
  }

  // 2. In-memory IP Rate Limiting
  const clientIp =
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown-ip';

  if (!checkRateLimit(clientIp)) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Too Many Requests. Rate limit exceeded.' });
  }

  // 3. Validate url parameter
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'Missing url query parameter' });
  }

  let parsedTarget;
  try {
    parsedTarget = new URL(decodeURIComponent(url));
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  // 4. Enforce strict Domain Whitelist (No Open Proxy)
  const isAllowedHost = ALLOWED_DOMAINS.some(
    (domain) => parsedTarget.hostname === domain || parsedTarget.hostname.endsWith('.' + domain)
  );

  if (!isAllowedHost) {
    return res.status(403).json({
      error: `Host '${parsedTarget.hostname}' is not permitted. Proxy is restricted to approved gaming APIs.`,
      allowedDomains: ALLOWED_DOMAINS,
    });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);

    // 6. Forward request with clean headers and redirect validation
    const forwardHeaders = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json, text/plain, */*',
    };
    if (req.headers && req.headers['content-type']) {
      forwardHeaders['Content-Type'] = req.headers['content-type'];
    }

    const fetchOpts = {
      method: req.method,
      signal: controller.signal,
      redirect: 'manual',
      headers: forwardHeaders,
    };
    if (req.method === 'POST') {
      fetchOpts.body = typeof req.body === 'object' ? JSON.stringify(req.body) : req.body;
    }

    // For epicgames.com or general TLS/Cloudflare sensitive domains, use native https to bypass undici fingerprinting
    let responseStatus = 200;
    let contentType = 'application/json';
    let responseBuffer = null;

    if (parsedTarget.hostname.includes('epicgames.com')) {
      const nativeRes = await doNativeRequest(parsedTarget, fetchOpts, 9000);
      responseStatus = nativeRes.status;
      contentType = (nativeRes.headers['content-type'] || 'application/json');
      responseBuffer = nativeRes.buffer;
    } else {
      let response = await fetch(parsedTarget.toString(), fetchOpts);

      // Prevent open redirect bypass: validate Location against ALLOWED_DOMAINS
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const redirectLocation = response.headers.get('location');
        if (redirectLocation) {
          const redirectUrl = new URL(redirectLocation, parsedTarget);
          const isAllowedRedirect = ALLOWED_DOMAINS.some(
            (host) => redirectUrl.hostname === host || redirectUrl.hostname.endsWith('.' + host)
          );
          if (!isAllowedRedirect) {
            clearTimeout(timeout);
            return res.status(403).json({
              error: `Redirect to unauthorized host '${redirectUrl.hostname}' is blocked.`,
            });
          }
          response = await fetch(redirectUrl.toString(), {
            ...fetchOpts,
            redirect: 'error',
          });
        }
      }

      if (response.status === 403) {
        // Fallback to native https
        try {
          const nativeRes = await doNativeRequest(parsedTarget, fetchOpts, 9000);
          responseStatus = nativeRes.status;
          contentType = (nativeRes.headers['content-type'] || 'application/json');
          responseBuffer = nativeRes.buffer;
        } catch {
          responseStatus = response.status;
          contentType = response.headers.get('content-type') || 'application/json';
          const arr = await response.arrayBuffer();
          responseBuffer = Buffer.from(arr);
        }
      } else {
        responseStatus = response.status;
        contentType = response.headers.get('content-type') || 'application/json';
        const arr = await response.arrayBuffer();
        responseBuffer = Buffer.from(arr);
      }
    }

    clearTimeout(timeout);

    // 7. Enforce response size cap
    if (responseBuffer.byteLength > MAX_RESPONSE_SIZE) {
      return res.status(413).json({ error: 'Payload Too Large. Response exceeds 5 MB cap.' });
    }

    // 8. Set sensible caching & security headers (do NOT forward set-cookie)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    return res.status(responseStatus).send(responseBuffer);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Proxy request failed' });
  }
}
