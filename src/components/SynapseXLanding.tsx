import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, useScroll, useSpring, useTransform, useMotionTemplate } from 'framer-motion';

// --- Video URLs ---
const VIDEOS = {
  hero: 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260622_083515_290e5a10-0b95-41af-a5e2-32b6389baa4d.mp4',
  cinematic: 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260622_092455_089c54f8-3b03-4966-9df1-e9746063d0ef.mp4',
  metrics: 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260622_095810_ecea3dd2-fc5e-4e41-8696-4219290b6589.mp4',
  tech: 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260622_095750_32a52ce0-2005-45c9-9093-41f03fde9530.mp4',
  footer: 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260622_080203_fd7f4f85-3a86-4837-8192-85e7bfe68e75.mp4',
};

const SCRAMBLE_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+~|}{[]:;?><';

// --- Custom 4-Fold Rotationally Symmetric SVG Logo ---
export function SynapseXLogo({ className = 'w-[18px] h-[18px]', color = '#FFFFFF', size = 18 }: { className?: string; color?: string; size?: number }) {
  const quadrantPath = 'M 1.5,23 L 1.5,33 C 1.5,38.5 6,43 11.5,43 L 16.5,43 C 22,43 26.5,38.5 26.5,33 Q 28,28 33,26.5 C 38.5,26.5 43,22 43,16.5 L 43,11.5 C 43,6 38.5,1.5 33,1.5 L 23,1.5 Q 12,12 1.5,23 Z';
  return (
    <svg
      viewBox="-50 -50 100 100"
      width={size}
      height={size}
      style={{ width: size, height: size, minWidth: size, minHeight: size, display: 'inline-block', flexShrink: 0 }}
      className={className}
      fill={color}
    >
      <g>
        <path d={quadrantPath} />
        <path d={quadrantPath} transform="rotate(90)" />
        <path d={quadrantPath} transform="rotate(180)" />
        <path d={quadrantPath} transform="rotate(270)" />
      </g>
    </svg>
  );
}

// --- Animated Hamburger Component ---
export function SquashHamburger({ isOpen, onClick }: { isOpen: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Toggle navigation menu"
      className="relative flex items-center justify-center w-[18px] h-[12px] sm:w-[18px] sm:h-[12px] cursor-pointer focus:outline-none bg-transparent border-0 p-0"
    >
      <motion.span
        className="absolute left-0 w-full h-[1.5px] bg-white rounded-full"
        animate={isOpen ? { rotate: 45, y: 0 } : { rotate: 0, y: -5 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      />
      <motion.span
        className="absolute left-0 w-full h-[1.5px] bg-white rounded-full"
        animate={isOpen ? { opacity: 0, scale: 0.5 } : { opacity: 1, scale: 1 }}
        transition={{ duration: 0.15 }}
      />
      <motion.span
        className="absolute left-0 w-full h-[1.5px] bg-white rounded-full"
        animate={isOpen ? { rotate: -45, y: 0 } : { rotate: 0, y: 5 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      />
    </button>
  );
}

// --- Text Animation: ScrambleIn ---
export function ScrambleIn({ text, delay = 0, triggered = true, className = '' }: { text: string; delay?: number; triggered?: boolean; className?: string }) {
  const [displayText, setDisplayText] = useState('');
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    if (!triggered) {
      setDisplayText('');
      return;
    }

    const timer = setTimeout(() => {
      setHasStarted(true);
      let revealCursor = 0;
      const totalChars = text.length;

      const interval = setInterval(() => {
        revealCursor += 0.5;
        let result = '';

        for (let i = 0; i < totalChars; i++) {
          if (text[i] === ' ') {
            result += ' ';
          } else if (i < Math.floor(revealCursor)) {
            result += text[i];
          } else if (i < Math.floor(revealCursor) + 3) {
            result += SCRAMBLE_CHARSET[Math.floor(Math.random() * SCRAMBLE_CHARSET.length)];
          } else {
            result += '';
          }
        }

        setDisplayText(result);

        if (revealCursor >= totalChars + 2) {
          clearInterval(interval);
          setDisplayText(text);
        }
      }, 25);

      return () => clearInterval(interval);
    }, delay);

    return () => clearTimeout(timer);
  }, [text, delay, triggered]);

  if (!triggered || !hasStarted) {
    return <span className={className}>&nbsp;</span>;
  }

  return <span className={className}>{displayText || text}</span>;
}

// --- Text Animation: ScrambleText (Hover-driven) ---
export function ScrambleText({ text, isHovered, className = '' }: { text: string; isHovered: boolean; className?: string }) {
  const [output, setOutput] = useState(text);

  useEffect(() => {
    if (!isHovered) {
      setOutput(text);
      return;
    }

    let frame = 0;
    const totalFramesPerChar = 4;
    const totalChars = text.length;

    const interval = setInterval(() => {
      frame++;
      const revealedCount = Math.floor(frame / totalFramesPerChar);

      let result = '';
      for (let i = 0; i < totalChars; i++) {
        if (text[i] === ' ') {
          result += ' ';
        } else if (i < revealedCount) {
          result += text[i];
        } else {
          result += SCRAMBLE_CHARSET[Math.floor(Math.random() * SCRAMBLE_CHARSET.length)];
        }
      }

      setOutput(result);

      if (revealedCount >= totalChars) {
        clearInterval(interval);
        setOutput(text);
      }
    }, 25);

    return () => clearInterval(interval);
  }, [isHovered, text]);

  return <span className={className}>{output}</span>;
}

interface SynapseXLandingProps {
  onLaunchApp: () => void;
  onDownloadApk?: () => void;
  onOpenPwaGuide?: () => void;
}

export default function SynapseXLanding({
  onLaunchApp,
  onDownloadApk,
  onOpenPwaGuide,
}: SynapseXLandingProps) {
  const [entranceComplete, setEntranceComplete] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hoveredLink, setHoveredLink] = useState<string | null>(null);

  // Hero Video Mouse Scrubbing
  const heroVideoRef = useRef<HTMLVideoElement>(null);
  const isSeekingRef = useRef(false);
  const targetTimeRef = useRef(0);
  const lastMouseXRef = useRef<number | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setEntranceComplete(true);
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  // Setup video scrub listener
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const video = heroVideoRef.current;
    if (!video || !video.duration) return;

    const currentX = e.clientX;
    if (lastMouseXRef.current === null) {
      lastMouseXRef.current = currentX;
      return;
    }

    const deltaX = currentX - lastMouseXRef.current;
    lastMouseXRef.current = currentX;

    const sensitivity = 0.8;
    const deltaSeconds = (deltaX / window.innerWidth) * video.duration * sensitivity;
    targetTimeRef.current = Math.max(0, Math.min(video.duration, (targetTimeRef.current || video.currentTime) + deltaSeconds));

    if (!isSeekingRef.current) {
      isSeekingRef.current = true;
      video.currentTime = targetTimeRef.current;
    }
  }, []);

  const handleSeeked = useCallback(() => {
    const video = heroVideoRef.current;
    if (!video) return;

    if (Math.abs(video.currentTime - targetTimeRef.current) > 0.05) {
      video.currentTime = targetTimeRef.current;
    } else {
      isSeekingRef.current = false;
    }
  }, []);

  // Section 2 3D Perspective Scroll Setup
  const section2Ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: section2Ref,
    offset: ['start end', 'end start'],
  });

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 35,
    damping: 24,
    mass: 1.2,
  });

  // Dynamic transforms responsive to scroll
  const yScaleValue = useTransform(smoothProgress, [0, 0.5, 1], [100, 0, -140]);
  const rotateXValue = useTransform(smoothProgress, [0, 0.5, 1], [32, 12, -18]);
  const translateZValue = useTransform(smoothProgress, [0, 0.5, 1], [0, 30, 0]);
  const scaleValue = useTransform(smoothProgress, [0, 0.5, 1], [0.90, 1.04, 0.94]);
  const section2Opacity = useTransform(smoothProgress, [0.08, 0.35, 0.7, 0.95], [0, 1, 1, 0]);

  // Mouse Parallax for Section 2
  const [mouseTilt, setMouseTilt] = useState({ x: 0, y: 0 });
  const handleSection2MouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!section2Ref.current) return;
    const rect = section2Ref.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setMouseTilt({ x: x * 12, y: -y * 12 });
  }, []);
  const handleSection2MouseLeave = useCallback(() => {
    setMouseTilt({ x: 0, y: 0 });
  }, []);

  const scrollToSection = (offset: number) => {
    window.scrollTo({ top: offset, behavior: 'smooth' });
    setMenuOpen(false);
  };

  return (
    <div
      className="bg-black text-white min-h-screen selection:bg-white selection:text-black overflow-x-hidden"
      style={{ fontFamily: '"Space Mono", monospace' }}
    >
      {/* Inject Google Fonts & Bootstrap Icons */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Anton+SC&family=Space+Mono:ital,wght@0,400;0,700;1,400;1,700&display=swap');
        @import url('https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css');

        * {
          box-sizing: border-box;
          font-family: 'Space Mono', monospace;
        }

        .watermark-text {
          font-family: 'Anton SC', sans-serif;
          background: radial-gradient(circle, rgba(142,127,148,0) 0%, #8E7F94 70%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
      `}</style>

      {/* =========================================================================
          NAVBAR (Fixed, z-50)
      ========================================================================= */}
      <motion.header
        initial={{ opacity: 0 }}
        animate={{ opacity: entranceComplete ? 1 : 0 }}
        transition={{ duration: 0.8 }}
        className="fixed top-0 left-0 w-full h-20 z-50 px-4 sm:px-8 flex items-center justify-between pointer-events-none bg-transparent"
      >
        {/* Left Pill Group */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Logo Pill */}
          <motion.div
            whileHover={{ scale: 1.02, backgroundColor: 'rgba(255,255,255,0.22)' }}
            whileTap={{ scale: 0.98 }}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className={`h-12 px-5 bg-white/15 backdrop-blur-md rounded-[14px] flex items-center gap-2.5 cursor-pointer border border-white/10 ${
              menuOpen ? 'hidden md:flex' : 'flex'
            }`}
          >
            <SynapseXLogo className="w-[18px] h-[18px]" color="#FFFFFF" />
            <span className="text-[15px] font-medium tracking-tight text-white">LootQuest</span>
          </motion.div>

          {/* Expanding Menu Pill */}
          <motion.div
            animate={{ width: menuOpen ? 300 : 48 }}
            transition={{ type: 'spring', stiffness: 350, damping: 28 }}
            className="h-12 bg-white/15 backdrop-blur-md rounded-[14px] flex items-center overflow-hidden border border-white/10"
          >
            {/* Hamburger Button */}
            <div
              onClick={() => setMenuOpen(!menuOpen)}
              className={`flex items-center justify-center cursor-pointer transition-all ${
                menuOpen ? 'w-9 h-9 rounded-[11px] bg-white/10 hover:bg-white/20 ml-1.5' : 'w-12 h-12 rounded-[14px]'
              }`}
            >
              <SquashHamburger isOpen={menuOpen} onClick={() => setMenuOpen(!menuOpen)} />
            </div>

            {/* Menu Links */}
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, x: 15 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25, delay: 0.05 }}
                className="flex items-center gap-4 px-4 whitespace-nowrap"
              >
                <button
                  onMouseEnter={() => setHoveredLink('about')}
                  onMouseLeave={() => setHoveredLink(null)}
                  onClick={() => scrollToSection(window.innerHeight)}
                  className="text-[14px] font-normal text-white/85 hover:text-white bg-transparent border-0 cursor-pointer p-0"
                >
                  <ScrambleText text="Radar" isHovered={hoveredLink === 'about'} />
                </button>

                <button
                  onMouseEnter={() => setHoveredLink('metrics')}
                  onMouseLeave={() => setHoveredLink(null)}
                  onClick={() => scrollToSection(window.innerHeight * 2)}
                  className="text-[14px] font-normal text-white/85 hover:text-white bg-transparent border-0 cursor-pointer p-0"
                >
                  <ScrambleText text="Metrics" isHovered={hoveredLink === 'metrics'} />
                </button>

                <button
                  onMouseEnter={() => setHoveredLink('tech')}
                  onMouseLeave={() => setHoveredLink(null)}
                  onClick={() => scrollToSection(window.innerHeight * 3)}
                  className="text-[14px] font-normal text-white/85 hover:text-white bg-transparent border-0 cursor-pointer p-0"
                >
                  <ScrambleText text="Engine" isHovered={hoveredLink === 'tech'} />
                </button>

                <button
                  onClick={onLaunchApp}
                  className="text-[13px] font-bold text-black bg-white px-3 py-1.5 rounded-full cursor-pointer hover:bg-white/90"
                >
                  Launch App
                </button>
              </motion.div>
            )}
          </motion.div>
        </div>

        {/* Right Button: Launch App & Downloads */}
        <div className="flex items-center gap-3 pointer-events-auto">
          {/* Main Launch Web App CTA */}
          <motion.button
            whileHover={{ scale: 1.03, backgroundColor: '#ffffff', color: '#000000' }}
            whileTap={{ scale: 0.97 }}
            onClick={onLaunchApp}
            onMouseEnter={() => setHoveredLink('launch')}
            onMouseLeave={() => setHoveredLink(null)}
            className="h-12 px-6 bg-white text-black font-bold text-[14px] rounded-full flex items-center gap-2 cursor-pointer shadow-lg border-0 transition-colors"
          >
            <i className="bi bi-controller text-[16px]"></i>
            <ScrambleText text="Launch App" isHovered={hoveredLink === 'launch'} />
          </motion.button>

          {/* Apple / PWA Guide Modal */}
          {onOpenPwaGuide && (
            <motion.button
              whileHover={{ scale: 1.05, backgroundColor: 'rgba(255,255,255,0.22)' }}
              whileTap={{ scale: 0.95 }}
              onClick={onOpenPwaGuide}
              aria-label="iOS PWA Instructions"
              className="h-12 w-12 hidden sm:flex items-center justify-center bg-white/15 backdrop-blur-md rounded-full border border-white/10 text-white cursor-pointer"
            >
              <i className="bi bi-apple text-[18px]"></i>
            </motion.button>
          )}
        </div>
      </motion.header>

      {/* =========================================================================
          SECTION 1: HERO (Full Viewport Height + Mouse-Scrubbed Video)
      ========================================================================= */}
      <section
        onMouseMove={handleMouseMove}
        className="relative w-full h-screen h-[100dvh] flex flex-col justify-between overflow-hidden px-4 sm:px-6 md:px-8 pt-20 sm:pt-24 pb-8 sm:pb-12 select-none"
      >
        {/* Mouse Scrubbed Video #1 Background */}
        <video
          ref={heroVideoRef}
          src={VIDEOS.hero}
          onSeeked={handleSeeked}
          playsInline
          muted
          preload="auto"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        />

        {/* Dot Grid Overlay */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.06]"
          style={{
            backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />

        {/* Large Background Watermark Text */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 mt-[50px]">
          <span className="watermark-text text-[clamp(120px,28vw,480px)] uppercase tracking-[-4px] font-bold opacity-10">
            LOOTQUEST
          </span>
        </div>

        {/* Top Spacer */}
        <div className="flex-1" />

        {/* Hero Bottom Row */}
        <div className="relative z-10 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          {/* Left Column: Title & Description */}
          <div className="flex flex-col gap-4 max-w-xl">
            <h1 className="text-white font-light leading-[0.95] tracking-[-0.03em] text-[clamp(38px,8vw,90px)]">
              <ScrambleIn text="Zero Cost" delay={200} triggered={entranceComplete} />
              <br />
              <ScrambleIn text="Infinite Play" delay={500} triggered={entranceComplete} />
            </h1>

            <motion.p
              initial={{ opacity: 0, y: 25 }}
              animate={entranceComplete ? { opacity: 1, y: 0 } : { opacity: 0, y: 25 }}
              transition={{ duration: 0.9, delay: 0.2, ease: [0.215, 0.610, 0.355, 1.000] }}
              className="max-w-sm text-[13px] sm:text-[15px] text-white/60 leading-relaxed"
            >
              Built for gamers who never miss a drop. LootQuest continuously tracks 100% free game giveaways, limited-time promotions, and store drops across Steam, Epic Games, GOG, and PlayStation into a single real-time radar.
            </motion.p>

            {/* Direct Web App Launch & Download CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={entranceComplete ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="flex items-center gap-3 pt-2"
            >
              <button
                onClick={onLaunchApp}
                className="px-6 py-3 bg-white text-black font-bold text-[14px] rounded-full flex items-center gap-2 cursor-pointer hover:bg-white/90 border-0 transition-all shadow-xl"
              >
                <i className="bi bi-play-fill text-[18px]"></i>
                Open Web App
              </button>

              {onDownloadApk && (
                <button
                  onClick={onDownloadApk}
                  className="px-5 py-3 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white font-medium text-[13px] rounded-full flex items-center gap-2 cursor-pointer border border-white/15 transition-all"
                >
                  <i className="bi bi-android2 text-[15px]"></i>
                  Download APK
                </button>
              )}
            </motion.div>
          </div>

          {/* Right Column: Title */}
          <div className="text-left md:text-right">
            <h1 className="text-white font-light leading-[0.95] tracking-[-0.03em] text-[clamp(38px,8vw,90px)]">
              <ScrambleIn text="Claim" delay={700} triggered={entranceComplete} />
              <br />
              <ScrambleIn text="Forever" delay={1000} triggered={entranceComplete} />
            </h1>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION 2: CINEMATIC TEXT (Full Viewport Height + 3D Perspective)
      ========================================================================= */}
      <section
        ref={section2Ref}
        onMouseMove={handleSection2MouseMove}
        onMouseLeave={handleSection2MouseLeave}
        className="relative w-full h-screen h-[100dvh] flex items-center justify-center overflow-hidden px-6"
      >
        {/* Video #2 Background */}
        <video
          src={VIDEOS.cinematic}
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        />

        {/* Top Gradient Overlay */}
        <div className="absolute top-0 left-0 w-full h-[180px] bg-gradient-to-b from-[#010103] to-transparent z-10 pointer-events-none" />

        {/* 3D Perspective Paragraph with dynamic scroll & mouse reactivity */}
        <motion.div
          style={{
            transformPerspective: 600,
            rotateX: rotateXValue,
            translateY: yScaleValue,
            translateZ: translateZValue,
            scale: scaleValue,
            opacity: section2Opacity,
          }}
          animate={{
            rotateY: mouseTilt.x,
          }}
          transition={{ type: 'spring', stiffness: 120, damping: 14 }}
          className="relative z-20 max-w-5xl text-center select-none px-6 sm:px-12 pointer-events-auto"
        >
          <p className="font-sans font-normal text-[22px] sm:text-[30px] md:text-[36px] lg:text-[42px] text-white leading-[1.35] tracking-[-0.02em]">
            An automated game intelligence radar built to track zero-dollar drops across the digital universe. LootQuest filters noise, validates real promotions, and delivers instant claim alerts before keys run out. Every Steam promotion, Epic mystery drop, and indie giveaway is structured, verified, and delivered directly to your vault.
          </p>
        </motion.div>
      </section>

      {/* =========================================================================
          SECTION 3: METRICS (Min-H-Screen + Video #3)
      ========================================================================= */}
      <section className="relative w-full min-h-screen flex items-center justify-center overflow-hidden py-32 px-6">
        {/* Video #3 Background */}
        <video
          src={VIDEOS.metrics}
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        />

        <div className="relative z-10 max-w-6xl w-full mx-auto text-center">
          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 1.2 }}
            className="text-white/40 text-[13px] sm:text-[14px] tracking-[0.2em] uppercase mb-20 text-center"
          >
            Live Radar Telemetry
          </motion.p>

          {/* Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-16 md:gap-8">
            {[
              { val: '$1,450+', label: 'Avg. Saved Per Gamer' },
              { val: '0ms', label: 'Radar Alert Latency' },
              { val: '1,200+', label: 'Free Titles Tracked' },
            ].map((metric, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.8, delay: idx * 0.15 }}
                className="flex flex-col items-center justify-center"
              >
                <span className="text-white text-[clamp(48px,10vw,96px)] font-light tracking-[-0.04em] leading-none">
                  {metric.val}
                </span>
                <span className="text-white/40 text-[13px] sm:text-[15px] mt-4 tracking-wide">
                  {metric.label}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION 4: TECHNOLOGY / RADAR ENGINE (Video #4)
      ========================================================================= */}
      <section className="relative w-full h-screen h-[100dvh] flex flex-col justify-between overflow-hidden px-8 sm:px-12 md:px-16 py-12 sm:py-16 select-none">
        {/* Video #4 Background */}
        <video
          src={VIDEOS.tech}
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        />

        {/* Top Area */}
        <div className="relative z-10 flex flex-col md:flex-row md:justify-between md:items-start gap-6">
          <motion.h2
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 1.0 }}
            className="text-white font-light text-[clamp(36px,8vw,72px)] leading-[0.95] tracking-[-0.03em]"
          >
            Autonomous<br />Game Radar
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 1.0, delay: 0.2 }}
            className="text-white/50 text-[13px] sm:text-[15px] leading-relaxed max-w-xs md:text-right md:pt-2"
          >
            The engine scans r/FreeGameFindings, Steam Storefront API, and Epic Games Store webhooks 24/7. Never miss a limited-time 100% discount again.
          </motion.p>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Bottom Feature Grid */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 1.0, delay: 0.3 }}
          className="relative z-10 grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-6"
        >
          {[
            {
              title: 'Storefront Ingestion',
              desc: 'Instant multi-platform discovery across Steam, Epic Games, GOG, and Prime Gaming.',
            },
            {
              title: 'Community Intel',
              desc: 'Direct community-verified feeds from r/FreeGameFindings with zero API restrictions.',
            },
            {
              title: '1-Click Claim Direct',
              desc: 'Direct deep links into official store pages with step-by-step claiming guides.',
            },
            {
              title: 'Zero-Noise Filtering',
              desc: 'Separates permanent keep-forever freebies from free weekends and DLC tasks.',
            },
          ].map((item, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: idx * 0.1 }}
              className="flex flex-col"
            >
              <h3 className="text-white text-[14px] sm:text-[16px] font-normal mb-2">
                {item.title}
              </h3>
              <p className="text-white/40 text-[12px] sm:text-[14px] leading-relaxed">
                {item.desc}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* =========================================================================
          SECTION 5: ARCHITECTURE / HOW IT WORKS (Pure Black Background)
      ========================================================================= */}
      <section className="relative w-full min-h-screen bg-black flex items-center justify-center py-32 px-6">
        <div className="max-w-3xl w-full mx-auto text-center">
          {/* Heading Block */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 1.0 }}
          >
            <p className="text-white/40 text-[13px] sm:text-[14px] tracking-[0.2em] uppercase mb-8">
              Radar Architecture
            </p>
            <h2 className="text-white font-light text-[clamp(28px,6vw,56px)] leading-[1.15] tracking-[-0.02em] mb-10">
              Three steps. Zero missed drops.
            </h2>
            <p className="text-white/45 text-[15px] sm:text-[17px] leading-relaxed max-w-xl mx-auto">
              Detection layer indexes active giveaways in real-time. Validation layer strips expired links. Delivery layer notifies you instantly so you claim before time runs out.
            </p>
          </motion.div>

          {/* Layer Cards */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 1.2, delay: 0.4 }}
            className="mt-20 flex flex-col items-center gap-4"
          >
            {[
              { layer: 'Layer 1', name: 'Detection — Scans Steam, Epic, GOG, Reddit 24/7' },
              { layer: 'Layer 2', name: 'Validation — Filters Keep-Forever vs Free Weekend' },
              { layer: 'Layer 3', name: 'Instant Claim — 1-Click Storefront Deep Links' },
            ].map((card, idx) => (
              <div
                key={idx}
                className="w-full max-w-xl h-[72px] border border-white/10 rounded-lg flex items-center justify-between px-6 bg-white/[0.02] hover:bg-white/[0.05] transition-colors"
              >
                <span className="text-white/30 text-[12px] tracking-[0.15em] uppercase">
                  {card.layer}
                </span>
                <span className="text-white text-[14px] sm:text-[16px] font-light text-right">
                  {card.name}
                </span>
              </div>
            ))}
          </motion.div>

          {/* Direct Web App Button in Architecture */}
          <div className="mt-14 flex justify-center">
            <button
              onClick={onLaunchApp}
              className="px-8 py-4 bg-white text-black font-bold text-[14px] rounded-full cursor-pointer hover:bg-white/90 border-0 transition-all shadow-xl"
            >
              Experience LootQuest Live App →
            </button>
          </div>
        </div>
      </section>

      {/* =========================================================================
          FOOTER (Video #5 Left + Details Right)
      ========================================================================= */}
      <footer className="relative w-full bg-black border-t border-white/10 overflow-hidden flex flex-col md:flex-row min-h-[400px]">
        {/* Left: Video #5 */}
        <div className="w-full md:w-1/2 h-[300px] md:h-auto relative overflow-hidden">
          <video
            src={VIDEOS.footer}
            autoPlay
            muted
            loop
            playsInline
            className="w-full h-full object-cover"
          />
        </div>

        {/* Right: Brand and Details */}
        <div className="w-full md:w-1/2 p-10 sm:p-16 flex flex-col justify-between bg-black">
          <div>
            <div className="flex items-center gap-2.5 mb-8">
              <SynapseXLogo className="w-[18px] h-[18px]" color="#FFFFFF" />
              <span className="text-[15px] font-medium text-white/70 tracking-tight">
                LootQuest Radar
              </span>
            </div>

            <p className="text-white/40 text-[14px] sm:text-[15px] leading-relaxed max-w-sm">
              The open-source radar for 100% free games, limited-time promotions, and digital loot. Built for gamers who refuse to miss out.
            </p>

            <div className="mt-6 flex gap-4">
              <button
                onClick={onLaunchApp}
                className="text-[13px] text-white hover:underline bg-transparent border-0 cursor-pointer p-0"
              >
                Launch App
              </button>
              <span className="text-white/20">•</span>
              <a
                href="https://github.com/EklavyaAhuja/LootQuest"
                target="_blank"
                rel="noreferrer"
                className="text-[13px] text-white/60 hover:text-white hover:underline"
              >
                GitHub
              </a>
              <span className="text-white/20">•</span>
              <a
                href="https://discord.gg/pXxnhKWdGH"
                target="_blank"
                rel="noreferrer"
                className="text-[13px] text-white/60 hover:text-white hover:underline"
              >
                Discord
              </a>
            </div>
          </div>

          <p className="text-white/25 text-[12px] mt-12">
            &copy; 2026 LootQuest. 100% Free & Open Source.
          </p>
        </div>
      </footer>
    </div>
  );
}
