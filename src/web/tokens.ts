// Design tokens for Claimr Web
// HARD RULES: No green, no pills, orange (--time: #FF8A5B) ONLY for time pressure (< 12h).

export const WEB_TOKENS = {
  colors: {
    bg: '#000000',
    tx: '#EDEDEB',
    mu: '#86868B',
    dim: '#4D4D52',
    hl: '#1C1C1E',
    bd: '#3A3A3D',
    time: '#FF8A5B', // Time pressure ONLY (< 12h)
    art: '#0F0F10',
  },
  radius: {
    r: '8px',
  },
  fonts: {
    sans: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    serif: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    mono: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
} as const;

export const WEB_CSS = `
/* Web CSS matching pure hallmark design */
:root {
  --bg: #000000;
  --tx: #EDEDEB;
  --mu: #9E9EA5;
  --dim: #717178;
  --hl: #1C1C1E;
  --bd: #3A3A3D;
  --time: #FF8A5B;
  --art: #0F0F10;
  --r: 8px;
  /* motion-anything tokens (zero-bloat GPU timing & easing scale) */
  --ma-instant: 100ms;
  --ma-fast: 180ms;
  --ma-base: 260ms;
  --ma-ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ma-ease-in: cubic-bezier(0.4, 0, 1, 1);
  --ma-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
}

* { box-sizing: border-box; }
html {
  scroll-padding-top: 88px;
}
body {
  margin: 0;
  background: var(--bg);
  color: var(--tx);
  font: 400 15px/1.5 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
a { color: inherit; text-decoration: none; }
:focus-visible { outline: 2px solid var(--tx); outline-offset: 3px; }

/* Thin, dark, subtle scrollbars for timeline, media strip, and tabs */
.tl,
.media,
.tabs,
.feed-sidebar {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.16) transparent;
}

.tl::-webkit-scrollbar,
.media::-webkit-scrollbar,
.tabs::-webkit-scrollbar,
.feed-sidebar::-webkit-scrollbar {
  height: 5px;
  width: 5px;
}

.tl::-webkit-scrollbar-track,
.media::-webkit-scrollbar-track,
.tabs::-webkit-scrollbar-track,
.feed-sidebar::-webkit-scrollbar-track {
  background: transparent;
}

.tl::-webkit-scrollbar-thumb,
.media::-webkit-scrollbar-thumb,
.tabs::-webkit-scrollbar-thumb,
.feed-sidebar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.16);
  border-radius: 4px;
}

.tl::-webkit-scrollbar-thumb:hover,
.media::-webkit-scrollbar-thumb:hover,
.tabs::-webkit-scrollbar-thumb:hover,
.feed-sidebar::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.32);
}

.s { font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 700; letter-spacing: -0.02em; }
.m { font: 600 11px/1.4 'Plus Jakarta Sans', sans-serif; text-transform: uppercase; letter-spacing: .08em; color: var(--mu); }
.wrap { max-width: 1200px; margin: 0 auto; padding: 0 32px; }

header.desktop-header {
  border-bottom: 1px solid var(--hl);
  position: sticky;
  top: 0;
  background: rgba(0, 0, 0, 0.88);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  z-index: 100;
}
.desktop-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  min-height: 72px;
  flex-wrap: wrap;
}
.desktop-logo {
  display: flex;
  align-items: center;
  cursor: pointer;
}
.desktop-nav-links {
  display: flex;
  gap: 32px;
  flex-wrap: wrap;
  align-items: center;
}
.desktop-nav-links a {
  font: 600 12px 'Plus Jakarta Sans', sans-serif;
  text-transform: uppercase;
  letter-spacing: .08em;
  color: rgba(237, 237, 235, 0.72);
  padding: 6px 0;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: color 150ms ease, border-color 150ms ease;
}
.desktop-nav-links a:hover {
  color: var(--tx);
}
.desktop-nav-links a.on {
  color: var(--tx);
  border-bottom: 2px solid var(--tx);
}

.btn {
  display: inline-block;
  background: var(--tx);
  color: #000;
  border: 0;
  border-radius: var(--r);
  padding: 12px 20px;
  font: 600 14px 'Plus Jakarta Sans', sans-serif;
  cursor: pointer;
  text-align: center;
  text-decoration: none;
  transform: scale(1);
  transition: transform var(--ma-fast) var(--ma-ease-out), opacity var(--ma-fast) ease, border-color var(--ma-fast) ease;
  will-change: transform;
}
.btn.o { background: none; color: var(--mu); border: 1px solid var(--bd); }
.btn.g { background: none; color: var(--tx); border: 1px solid var(--bd); }
.btn:hover { opacity: 0.94; transform: translateY(-1px); }
.btn:active { transform: scale(0.975); }

/* Clean dot-separated tags - NO borders or backgrounds */
.tag {
  border: 0 !important;
  background: transparent !important;
  padding: 0 !important;
  font: 600 11px/1.3 'Plus Jakarta Sans', sans-serif !important;
  letter-spacing: .08em !important;
  text-transform: uppercase !important;
  color: var(--mu) !important;
  display: inline !important;
}
.tag.dlc::before { content: "+ "; }
.tag.beta { border: none !important; }
.tag.mobile { color: #38BDF8 !important; border: none !important; }
.tag-sep {
  color: var(--dim);
  margin: 0 4px;
  user-select: none;
  display: inline-block;
}

.ic {
  width: 16px;
  height: 16px;
  border: 1px solid var(--mu);
  border-radius: 3px;
  display: inline-grid;
  place-items: center;
  font: 700 9px 'Plus Jakarta Sans', sans-serif;
  flex-shrink: 0;
}
.row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

/* Clean artwork cards - NO inset frame/padding, edge-to-edge 16/9 */
.art {
  background: var(--art);
  border: 1px solid var(--hl);
  border-radius: var(--r);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--mu);
  text-align: center;
  padding: 0;
  aspect-ratio: 16/9;
  width: 100%;
  overflow: hidden;
  position: relative;
  transition: border-color var(--ma-fast) ease;
}
.art img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.art-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 16px;
  background: #111113;
  color: var(--mu);
  text-align: center;
  box-sizing: border-box;
}
.art-fallback-title {
  font: 600 13px/1.3 'Plus Jakarta Sans', sans-serif;
  color: var(--tx);
  max-width: 90%;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.old { font: 400 13px 'Plus Jakarta Sans', sans-serif; color: var(--mu); text-decoration: line-through; }
.free { font: 700 13px 'Plus Jakarta Sans', sans-serif; letter-spacing: .04em; }

/* shiny-text recipe (motion-anything) — subtle kinetic highlight sweep */
.shiny-text {
  --shiny-base: #86868B;
  --shiny-hi: #FFFFFF;
  background: linear-gradient(100deg, var(--shiny-base) 35%, var(--shiny-hi) 50%, var(--shiny-base) 65%);
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: ma-shiny 3.5s var(--ma-ease-out) infinite;
}
@keyframes ma-shiny {
  0% { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}

/* attention-pulse recipe (motion-anything) — restrained ambient urgency */
.hot-pulse {
  position: relative;
}
.hot-pulse::after {
  content: "";
  position: absolute;
  inset: -2px;
  border-radius: inherit;
  border: 1px solid var(--time);
  opacity: 0;
  transform: scale(1);
  animation: ma-pulse 2.4s var(--ma-ease-out) infinite;
  pointer-events: none;
  will-change: transform, opacity;
}
@keyframes ma-pulse {
  0%   { opacity: 0.6; transform: scale(1); }
  60%  { opacity: 0;   transform: scale(1.08); }
  100% { opacity: 0;   transform: scale(1.08); }
}

@property --beam-angle {
  syntax: "<angle>";
  initial-value: 0deg;
  inherits: false;
}

/* border-beam recipe (motion-anything) — traveling comet edge highlight */
.border-beam {
  --beam-color: rgba(237, 237, 235, 0.7);
  --beam-size: 1.5px;
  position: relative;
  isolation: isolate;
}
.border-beam::before {
  content: "";
  position: absolute;
  inset: -1px;
  z-index: 10;
  border-radius: inherit;
  padding: var(--beam-size);
  background: conic-gradient(from var(--beam-angle, 0deg), transparent 280deg, var(--beam-color) 360deg);
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  animation: ma-beam 6s linear infinite;
  pointer-events: none;
}
@keyframes ma-beam {
  to { --beam-angle: 360deg; }
}

.dock-zoom {
  transition: transform var(--ma-fast) var(--ma-ease-out), border-color var(--ma-fast) ease;
  will-change: transform;
}
.dock-zoom:hover {
  transform: translateY(-3px) scale(1.03);
}

/* spotlight-card recipe (motion-anything) — cursor-following radial specular sheen */
.spotlight-card {
  position: relative;
}
.spotlight-card::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  opacity: 0;
  background: radial-gradient(320px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(255, 255, 255, 0.09), transparent 75%);
  pointer-events: none;
  transition: opacity var(--ma-fast) var(--ma-ease-out);
  z-index: 3;
}
.spotlight-card:hover::after {
  opacity: 1;
}

/* radar-ping recipe — live status beacon */
.radar-ping {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.radar-ping::before {
  content: "";
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: inherit;
  opacity: 0.6;
  animation: ma-radar 2s var(--ma-ease-out) infinite;
}
@keyframes ma-radar {
  0% { transform: scale(1); opacity: 0.7; }
  100% { transform: scale(2.4); opacity: 0; }
}

/* stagger-item recipe — smooth cascading entrance */
.stagger-item {
  animation: ma-stagger-in var(--ma-base) var(--ma-ease-out) both;
  animation-delay: calc(var(--stagger-i, 0) * 35ms);
  will-change: transform, opacity;
}
@keyframes ma-stagger-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.rule { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; padding: 16px 0; border-bottom: 1px solid var(--hl); }
.sec { border-top: 1px solid var(--hl); padding: 32px 0 56px; }
.sec > .m { margin-bottom: 20px; display: block; }

.grid { display: grid; gap: 28px 24px; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); }
/* card-lift-hover recipe (motion-anything) — pure GPU transform */
.card {
  display: block;
  min-width: 0;
  cursor: pointer;
  color: inherit;
  text-decoration: none;
  transform: translateY(0);
  transition: transform var(--ma-fast) var(--ma-ease-out), opacity var(--ma-fast) var(--ma-ease-out);
  will-change: transform;
}
.card:hover { transform: translateY(-3px); }
.card:active { transform: translateY(-1px) scale(0.995); }
.card:hover .art { border-color: var(--bd); }
.quick-claim-pill {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(12, 12, 15, 0.85);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: #EDEDEB;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 9999px;
  padding: 4px 10px;
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  z-index: 4;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  text-decoration: none;
  transition: all var(--ma-fast) var(--ma-ease-out);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
}
.card:hover .quick-claim-pill {
  border-color: rgba(255, 255, 255, 0.35);
}
.quick-claim-pill:hover {
  background: #EDEDEB !important;
  color: #09090B !important;
  border-color: #EDEDEB !important;
  transform: scale(1.05);
  box-shadow: 0 4px 16px rgba(255, 255, 255, 0.25);
}
.card .t {
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1.25;
  margin: 12px 0 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card .row { flex-wrap: nowrap; }
.card .row > span:last-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Full-Page Hero (first screen of desktop site) */
.full-hero {
  min-height: calc(100svh - 73px);
  min-height: calc(100vh - 73px);
  display: grid;
  grid-template-columns: 44% 56%;
  gap: 48px;
  align-items: center;
  padding: 32px 0 48px;
}
.hero-art-container {
  width: 100%;
  aspect-ratio: 16/9;
  min-height: 380px;
  max-height: 520px;
  position: relative;
  border-radius: var(--r);
  overflow: hidden;
  border: 1px solid var(--hl);
  background: #000000;
}
.hero-art-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: opacity 400ms ease;
}
.hero-art-gradient {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(to right, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 35%, transparent 65%),
              linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 40%);
}

.cd { display: flex; gap: 40px; margin: 24px 0; }
.cd b {
  display: block;
  font: 700 clamp(44px, 6vw, 84px)/1 'Plus Jakarta Sans', sans-serif;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
  letter-spacing: -0.03em;
}
.hot b { color: var(--time); }
.bar { height: 2px; background: var(--hl); }
.bar i { display: block; height: 2px; background: var(--tx); }
.hot .bar i { background: var(--time); }
.big { font-size: 40px; line-height: 1; font-weight: 700; letter-spacing: -0.02em; }

/* Feed Layout with Sticky Sidebar */
.layout {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: 48px;
  padding: 40px 0 56px;
  align-items: start;
}
.feed-sidebar {
  position: sticky;
  top: 88px;
  align-self: start;
  max-height: calc(100vh - 100px);
  overflow-y: auto;
  padding-right: 8px;
}
.filter-group {
  margin-bottom: 24px;
}
.filter-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  color: var(--mu);
  font: 500 13px 'Plus Jakarta Sans', sans-serif;
  transition: background 150ms ease, color 150ms ease;
  user-select: none;
}
.filter-row:hover {
  background: rgba(255, 255, 255, 0.04);
  color: var(--tx);
}
.filter-row.active {
  background: rgba(237, 237, 235, 0.08);
  color: var(--tx);
  font-weight: 600;
}
.filter-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.filter-check {
  font-size: 13px;
  color: var(--tx);
  width: 14px;
  text-align: center;
  opacity: 0;
}
.filter-row.active .filter-check {
  opacity: 1;
}
.filter-count {
  font: 600 11px 'Plus Jakarta Sans', sans-serif;
  color: #A1A1A8;
  background: rgba(255, 255, 255, 0.07);
  padding: 2px 7px;
  border-radius: 4px;
}
.filter-row.active .filter-count {
  color: #EDEDEB;
  background: rgba(255, 255, 255, 0.14);
}
.store-search-box {
  margin: 8px 0 10px;
  position: relative;
}
.store-search-input {
  width: 100%;
  background: #111113;
  border: 1px solid var(--hl);
  border-radius: 6px;
  padding: 6px 10px;
  color: var(--tx);
  font: 400 12px 'Plus Jakarta Sans', sans-serif;
  outline: none;
  box-sizing: border-box;
}
.store-search-input:focus {
  border-color: var(--bd);
}
.store-toggle-btn {
  background: none;
  border: none;
  color: var(--mu);
  font: 600 11px 'Plus Jakarta Sans', sans-serif;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  cursor: pointer;
  padding: 6px 10px;
  width: 100%;
  text-align: left;
  transition: color 150ms ease;
}
.store-toggle-btn:hover {
  color: var(--tx);
}
.active-filters-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 20px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--hl);
}
.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #18181A;
  border: 1px solid var(--bd);
  border-radius: 4px;
  padding: 4px 8px;
  font: 500 11px 'Plus Jakarta Sans', sans-serif;
  color: var(--tx);
  cursor: pointer;
}
.filter-chip:hover {
  border-color: var(--tx);
}
.clear-filters-btn {
  background: none;
  border: none;
  color: var(--mu);
  font: 600 11px 'Plus Jakarta Sans', sans-serif;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  cursor: pointer;
  padding: 4px 8px;
}
.clear-filters-btn:hover {
  color: var(--tx);
}

.tabs { display: flex; gap: 24px; overflow-x: auto; margin-bottom: 24px; }
.claimed { font: 600 13px 'Plus Jakarta Sans', sans-serif; color: var(--mu); }

.sw {
  width: 44px;
  height: 26px;
  border-radius: 13px;
  background: var(--hl);
  border: 1px solid var(--bd);
  position: relative;
  cursor: pointer;
  flex: none;
  padding: 0;
}
.sw i {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--mu);
  transition: left 150ms ease, background 150ms ease;
}
.sw[aria-checked=true] { background: var(--tx); }
.sw[aria-checked=true] i { left: 21px; background: #000; }

.inp {
  background: none;
  border: 0;
  border-bottom: 1px solid var(--bd);
  color: var(--tx);
  font: 400 16px 'Plus Jakarta Sans', sans-serif;
  padding: 8px 0;
  width: 100%;
}
.inp:focus { outline: none; border-bottom-color: var(--tx); }

/* Detail Page Layout: Side-by-side above the fold */
.cols {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(360px, 1fr);
  gap: 48px;
  padding: 24px 0 56px;
  align-items: start;
}
.cols > * {
  min-width: 0;
}
.detail-prose {
  max-width: 68ch;
  line-height: 1.65;
  word-break: break-word;
  color: #A8A8B0;
  font-size: 15px;
}
footer.desktop-footer { border-top: 1px solid var(--hl); padding: 28px 0; }

.stats {
  display: grid;
  border-top: 1px solid var(--hl);
  border-bottom: 1px solid var(--hl);
  margin: 20px 0;
}
.stats div {
  padding: 12px 0 12px 14px;
  border-left: 1px solid var(--hl);
}
.stats div:first-child { border: 0; padding-left: 0; }
.stats b {
  display: block;
  font-size: 28px;
  line-height: 1.1;
  font-weight: 700;
  font-family: 'Plus Jakarta Sans', sans-serif;
  letter-spacing: -0.02em;
}

.media {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  margin: 0;
  padding: 4px 0 10px;
  width: 100%;
  box-sizing: border-box;
}
.tile {
  flex: none;
  width: 136px;
  height: 76px;
  border: 1px solid var(--hl);
  border-radius: 6px;
  background: var(--art);
  position: relative;
  cursor: pointer;
  overflow: hidden;
  transform: translateY(0);
  transition: transform var(--ma-fast) var(--ma-ease-out), border-color var(--ma-fast) ease;
  will-change: transform;
}
.tile:hover { transform: translateY(-2px); border-color: var(--tx); }
.tile:active { transform: scale(0.98); }
.tile.v { background: #161617; }
.tile .pl {
  position: absolute;
  left: 8px;
  bottom: 6px;
  font: 600 10px 'Plus Jakarta Sans', sans-serif;
  text-transform: uppercase;
  letter-spacing: .08em;
  background: rgba(0, 0, 0, 0.6);
  padding: 2px 6px;
  border-radius: 3px;
}

.lightbox-nav-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(15, 15, 16, 0.85);
  border: 1px solid var(--bd);
  border-radius: 50%;
  color: #EDEDEB;
  width: 44px;
  height: 44px;
  font-size: 26px;
  line-height: 1;
  display: grid;
  place-items: center;
  cursor: pointer;
  z-index: 10;
  transition: background 150ms ease, transform 150ms ease;
  user-select: none;
}
.lightbox-nav-btn:hover {
  background: rgba(40, 40, 45, 0.95);
  transform: translateY(-50%) scale(1.08);
}
.lightbox-nav-btn.prev { left: 16px; }
.lightbox-nav-btn.next { right: 16px; }

.prow {
  display: flex;
  align-items: center;
  gap: 8px;
  border-top: 1px solid var(--hl);
  border-bottom: 1px solid var(--hl);
  padding: 12px 0;
  margin-bottom: 32px;
}
.prow-link {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  color: inherit;
  text-decoration: none;
}
.x {
  width: 48px;
  height: 48px;
  background: none;
  border: 0;
  color: var(--mu);
  font-size: 24px;
  cursor: pointer;
  display: grid;
  place-items: center;
}
.x:hover { color: var(--tx); }

.tl {
  position: relative;
  height: 130px;
  border-bottom: 1px solid var(--bd);
  overflow-x: auto;
  overflow-y: hidden;
  padding-right: 32px;
}
.tk {
  position: absolute;
  bottom: 0;
  width: 12px;
  border-left: 1px solid var(--bd);
  cursor: pointer;
  text-decoration: none;
  color: inherit;
  transition: border-color 150ms ease;
}
.tk.h1 { height: 60px; }
.tk.h2 { height: 110px; }
.tk .lb {
  position: absolute;
  top: 0;
  left: 8px;
  max-width: 150px;
  pointer-events: none;
}
.tk .lb .s {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 150px;
  font-size: 14px;
}
.tk:hover, .tk:focus-visible { border-color: var(--tx); }
.tk.hot, .tk.hot:hover { border-color: var(--time); }
.tk.hot .m { color: var(--time); }
.axl { position: relative; height: 22px; margin-top: 8px; }
.axl span { position: absolute; }

#sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  background: #000;
  border-top: 1px solid var(--hl);
  padding: 24px 0;
  z-index: 9999;
}

@media (max-width: 900px) {
  .full-hero, .cols, .layout { grid-template-columns: 1fr; gap: 32px; }
  .feed-sidebar { position: static; max-height: none; }
  .wrap { padding: 0 20px; }
  .cd { gap: 24px; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
  .card:hover, .card:active, .btn:hover, .btn:active, .tile:hover, .tile:active {
    transform: none !important;
  }
  .hot-pulse::after, .border-beam::before {
    animation: none !important;
    display: none !important;
  }
  .shiny-text {
    animation: none !important;
    -webkit-text-fill-color: initial !important;
    background: none !important;
    color: var(--tx) !important;
  }
}
`;
