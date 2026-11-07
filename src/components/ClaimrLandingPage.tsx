import React, { useState, useEffect } from 'react';

interface ClaimrLandingPageProps {
  onLaunchApp: () => void;
  onNavigate?: (route: 'home' | 'feed' | 'vault' | 'alerts' | 'settings' | 'prime') => void;
  activeDealsCount?: number;
  totalSavingsValue?: number;
}

const VELOS_CLAIMR_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');

:root {
  --bg-dark: #0a0a0c;
  --bg-card: rgba(12, 12, 15, 0.75);
  --border-glass: rgba(255, 255, 255, 0.1);
  --border-subtle: rgba(255, 255, 255, 0.06);
  --text-main: #fafafa;
  --text-dim: #a1a1aa;
  --emerald-live: #10b981;
}

* {
  box-sizing: border-box;
}

body {
  background-color: var(--bg-dark);
  color: var(--text-main);
  font-family: 'Inter', -apple-system, sans-serif;
  overflow-x: hidden;
  margin: 0;
  padding: 0;
}

::selection {
  background-color: rgba(255, 255, 255, 0.2);
  color: #ffffff;
}

.font-heading {
  font-family: 'Bricolage Grotesque', sans-serif;
}

.font-body {
  font-family: 'Inter', sans-serif;
}

.font-mono {
  font-family: 'JetBrains Mono', monospace;
}

/* Hide scrollbar */
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}
.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

/* Accessible focus outline */
button:focus-visible, a:focus-visible, summary:focus-visible {
  outline: 2px solid #10b981 !important;
  outline-offset: 3px !important;
}

/* High contrast glassmorphic cards */
.glass-card {
  background-color: var(--bg-card);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid var(--border-glass);
}

.glass-card:hover {
  border-color: rgba(255, 255, 255, 0.25);
}

/* Fixed noise grain overlay */
.bg-grain {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9999;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.035'/%3E%3C/svg%3E");
  mix-blend-mode: overlay;
}

/* Hero entrance zoom */
@keyframes cinematicZoom {
  0% { transform: scale(1.15); filter: blur(10px); }
  100% { transform: scale(1.0); filter: blur(0px); }
}

.hero-bg-anim {
  animation: cinematicZoom 3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

/* Feature card subtle hover animations */
@keyframes rotateScanner {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@keyframes rotateScannerFast {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@keyframes rotateHex {
  0% { transform: rotate(0deg); }
  50% { transform: rotate(180deg) scale(0.96); }
  100% { transform: rotate(360deg); }
}

@keyframes orbitEllipse {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@keyframes pulseGlow {
  0%, 100% { opacity: 0.35; transform: scale(0.92); }
  50% { opacity: 1; transform: scale(1.12); }
}

.anim-rotate-scanner {
  animation: rotateScanner 16s linear infinite;
  transform-origin: 60px 60px;
}

.feature-radar-card:hover .anim-rotate-scanner {
  animation: rotateScannerFast 3.5s linear infinite;
}

.anim-hex {
  animation: rotateHex 20s ease-in-out infinite;
  transform-origin: center;
}

.feature-shield-card:hover .anim-hex {
  filter: drop-shadow(0 0 14px rgba(16, 185, 129, 0.65));
}

.anim-orbit {
  animation: orbitEllipse 12s linear infinite;
  transform-origin: center;
}

.feature-vault-card:hover .anim-orbit {
  animation: orbitEllipse 4s linear infinite;
  filter: drop-shadow(0 0 16px rgba(16, 185, 129, 0.75));
}

.anim-pulse-glow {
  animation: pulseGlow 2.5s ease-in-out infinite;
}

/* Game Card Hover Polish */
.game-card-hover {
  transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.35s ease, box-shadow 0.35s ease;
}

.game-card-hover:hover {
  transform: translateY(-6px);
  border-color: rgba(255, 255, 255, 0.28);
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.65);
}

.game-card-hover:hover .game-card-img {
  transform: scale(1.05);
  filter: grayscale(0%);
}

.game-card-hover:hover .game-savings-tag {
  background-color: rgba(16, 185, 129, 0.22) !important;
  border-color: rgba(16, 185, 129, 0.6) !important;
  box-shadow: 0 0 14px rgba(16, 185, 129, 0.35);
}

/* Primary Button Glow */
.btn-primary-solid {
  background-color: #ffffff;
  color: #09090b;
  box-shadow: 0 0 24px rgba(255, 255, 255, 0.22);
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.btn-primary-solid:hover {
  box-shadow: 0 0 36px rgba(255, 255, 255, 0.45);
  transform: translateY(-2px);
}

.btn-secondary-outline {
  background-color: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: #ffffff;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.btn-secondary-outline:hover {
  background-color: rgba(255, 255, 255, 0.09);
  border-color: rgba(255, 255, 255, 0.35);
  transform: translateY(-2px);
}

/* Accordion Smooth Transition */
details summary::-webkit-details-marker {
  display: none;
}

details summary {
  list-style: none;
}

details[open] .faq-icon {
  transform: rotate(45deg);
  color: #10b981 !important;
}

details p {
  animation: faqSlideDown 0.25s ease-out;
}

@keyframes faqSlideDown {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Section scroll fade */
.section-fade-in {
  opacity: 1;
  transform: translateY(0);
  transition: opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

/* Store card hover */
.store-pill {
  transition: all 0.2s ease;
}
.store-pill:hover {
  border-color: rgba(255, 255, 255, 0.3) !important;
  transform: translateY(-2px);
}

/* Timeline marker subtle slide animation */
@keyframes timelineMarkerSlide {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.timeline-row-marker {
  animation: timelineMarkerSlide 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

/* Revolving Store Carousel / Marquee */
@keyframes storeRevolve {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(-50%);
  }
}

.store-revolving-container {
  overflow: hidden;
  position: relative;
  width: 100%;
  padding: 12px 0;
  margin-bottom: 40px;
  mask-image: linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%);
  -webkit-mask-image: linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%);
}

.store-revolving-track {
  display: flex;
  gap: 14px;
  width: max-content;
  animation: storeRevolve 32s linear infinite;
  will-change: transform;
}

.store-revolving-track:hover {
  animation-play-state: paused;
}

/* Reduced motion preference */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  .timeline-row-marker {
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
  }
  .store-revolving-track {
    animation: none !important;
    overflow-x: auto;
    width: 100%;
    justify-content: center;
    flex-wrap: wrap;
  }
}

@media (min-width: 1024px) {
  .bento-hero-left { grid-column: span 7 !important; }
  .bento-hero-right { grid-column: span 5 !important; }
}

@media (min-width: 768px) {
  .bento-third { grid-column: span 4 !important; }
}
`;

// 11 Supported Store Brand Vector Icons (Clean SVGs)
const STORE_ICONS: Record<string, { path: string; viewBox?: string }> = {
  Steam: {
    path: "M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z",
    viewBox: "0 0 24 24"
  },
  'Epic Games': {
    path: "M3.537 0C2.165 0 1.66.506 1.66 1.879V18.44a4.262 4.262 0 00.02.433c.031.3.037.59.316.92.027.033.311.245.311.245.153.075.258.13.43.2l8.335 3.491c.433.199.614.276.928.27h.002c.314.006.495-.071.928-.27l8.335-3.492c.172-.07.277-.124.43-.2 0 0 .284-.211.311-.243.28-.33.285-.621.316-.92a4.261 4.261 0 00.02-.434V1.879c0-1.373-.506-1.88-1.878-1.88zm13.366 3.11h.68c1.138 0 1.688.553 1.688 1.696v1.88h-1.374v-1.8c0-.369-.17-.54-.523-.54h-.235c-.367 0-.537.17-.537.539v5.81c0 .369.17.54.537.54h.262c.353 0 .523-.171.523-.54V8.619h1.373v2.143c0 1.144-.562 1.71-1.7 1.71h-.694c-1.138 0-1.7-.566-1.7-1.71V4.82c0-1.144.562-1.709 1.7-1.709zm-12.186.08h3.114v1.274H6.117v2.603h1.648v1.275H6.117v2.774h1.74v1.275h-3.14zm3.816 0h2.198c1.138 0 1.7.564 1.7 1.708v2.445c0 1.144-.562 1.71-1.7 1.71h-.799v3.338h-1.4zm4.53 0h1.4v9.201h-1.4zm-3.13 1.235v3.392h.575c.354 0 .523-.171.523-.54V4.965c0-.368-.17-.54-.523-.54zm-3.74 10.147a1.708 1.708 0 01.591.108 1.745 1.745 0 01.49.299l-.452.546a1.247 1.247 0 00-.308-.195.91.91 0 00-.363-.068.658.658 0 00-.28.06.703.703 0 00-.224.163.783.783 0 00-.151.243.799.799 0 00-.056.299v.008a.852.852 0 00.056.31.7.7 0 00.157.245.736.736 0 00.238.16.774.774 0 00.303.058.79.79 0 00.445-.116v-.339h-.548v-.565H7.37v1.255a2.019 2.019 0 01-.524.307 1.789 1.789 0 01-.683.123 1.642 1.642 0 01-.602-.107 1.46 1.46 0 01-.478-.3 1.371 1.371 0 01-.318-.455 1.438 1.438 0 01-.115-.58v-.008a1.426 1.426 0 01.113-.57 1.449 1.449 0 01.312-.46 1.418 1.418 0 01.474-.309 1.58 1.58 0 01.598-.111 1.708 1.708 0 01.045 0zm11.963.008a2.006 2.006 0 01.612.094 1.61 1.61 0 01.507.277l-.386.546a1.562 1.562 0 00-.39-.205 1.178 1.178 0 00-.388-.07.347.347 0 00-.208.052.154.154 0 00-.07.127v.008a.158.158 0 00.022.084.198.198 0 00.076.066.831.831 0 00.147.06c.062.02.14.04.236.061a3.389 3.389 0 01.43.122 1.292 1.292 0 01.328.17.678.678 0 01.207.24.739.739 0 01.071.337v.008a.865.865 0 01-.081.382.82.82 0 01-.229.285 1.032 1.032 0 01-.353.18 1.606 1.606 0 01-.46.061 2.16 2.16 0 01-.71-.116 1.718 1.718 0 01-.593-.346l.43-.514c.277.223.578.335.9.335a.457.457 0 00.236-.05.157.157 0 00.082-.142v-.008a.15.15 0 00-.02-.077.204.204 0 00-.073-.066.753.753 0 00-.143-.062 2.45 2.45 0 00-.233-.062 5.036 5.036 0 01-.413-.113 1.26 1.26 0 01-.331-.16.72.72 0 01-.222-.243.73.73 0 01-.082-.36v-.008a.863.863 0 01.074-.359.794.794 0 01.214-.283 1.007 1.007 0 01.34-.185 1.423 1.423 0 01.448-.066 2.006 2.006 0 01.025 0zm-9.358.025h.742l1.183 2.81h-.825l-.203-.499H8.623l-.198.498h-.81zm2.197.02h.814l.663 1.08.663-1.08h.814v2.79h-.766v-1.602l-.711 1.091h-.016l-.707-1.083v1.593h-.754zm3.469 0h2.235v.658h-1.473v.422h1.334v.61h-1.334v.442h1.493v.658h-2.255zm-5.3.897l-.315.793h.624zm-1.145 5.19h8.014l-4.09 1.348z",
    viewBox: "0 0 24 24"
  },
  GOG: {
    path: "M7.15 15.24H4.36a.4.4 0 0 0-.4.4v2c0 .21.18.4.4.4h2.8v1.32h-3.5c-.56 0-1.02-.46-1.02-1.03v-3.39c0-.56.46-1.02 1.03-1.02h3.48v1.32zM8.16 11.54c0 .58-.47 1.05-1.05 1.05H2.63v-1.35h3.78a.4.4 0 0 0 .4-.4V6.39a.4.4 0 0 0-.4-.4H4.39a.4.4 0 0 0-.41.4v2.02c0 .23.18.4.4.4H6v1.35H3.68c-.58 0-1.05-.46-1.05-1.04V5.68c0-.57.47-1.04 1.05-1.04H7.1c.58 0 1.05.47 1.05 1.04v5.86zM21.36 19.36h-1.32v-4.12h-.93a.4.4 0 0 0-.4.4v3.72h-1.33v-4.12h-.93a.4.4 0 0 0-.4.4v3.72h-1.33v-4.42c0-.56.46-1.02 1.03-1.02h5.61v5.44zM21.37 11.54c0 .58-.47 1.05-1.05 1.05h-4.48v-1.35h3.78a.4.4 0 0 0 .4-.4V6.39a.4.4 0 0 0-.4-.4h-2.03a.4.4 0 0 0-.4.4v2.02c0 .23.18.4.4.4h1.62v1.35H16.9c-.58 0-1.05-.46-1.05-1.04V5.68c0-.57.47-1.04 1.05-1.04h3.43c.58 0 1.05.47 1.05 1.04v5.86zM13.72 4.64h-3.44c-.58 0-1.04.47-1.04 1.04v3.44c0 .58.46 1.04 1.04 1.04h3.44c.57 0 1.04-.46 1.04-1.04V5.68c0-.57-.47-1.04-1.04-1.04m-.3 1.75v2.02a.4.4 0 0 1-.4.4h-2.03a.4.4 0 0 1-.4-.4V6.4c0-.22.17-.4.4-.4H13c.23 0 .4.18.4.4zM12.63 13.92H9.24c-.57 0-1.03.46-1.03 1.02v3.39c0 .57.46 1.03 1.03 1.03h3.39c.57 0 1.03-.46 1.03-1.03v-3.39c0-.56-.46-1.02-1.03-1.02m-.3 1.72v2a.4.4 0 0 1-.4.4v-.01H9.94a.4.4 0 0 1-.4-.4v-1.99c0-.22.18-.4.4-.4h2c.22 0 .4.18.4.4zM23.49 1.1a1.74 1.74 0 0 0-1.24-.52H1.75A1.74 1.74 0 0 0 0 2.33v19.34a1.74 1.74 0 0 0 1.75 1.75h20.5A1.74 1.74 0 0 0 24 21.67V2.33c0-.48-.2-.92-.51-1.24m0 20.58a1.23 1.23 0 0 1-1.24 1.24H1.75A1.23 1.23 0 0 1 .5 21.67V2.33a1.23 1.23 0 0 1 1.24-1.24h20.5a1.24 1.24 0 0 1 1.24 1.24v19.34z",
    viewBox: "0 0 24 24"
  },
  'itch.io': {
    path: "M3.13 1.338C2.08 1.96.02 4.328 0 4.95v1.03c0 1.303 1.22 2.45 2.325 2.45 1.33 0 2.436-1.102 2.436-2.41 0 1.308 1.07 2.41 2.4 2.41 1.328 0 2.362-1.102 2.362-2.41 0 1.308 1.137 2.41 2.466 2.41h.024c1.33 0 2.466-1.102 2.466-2.41 0 1.308 1.034 2.41 2.363 2.41 1.33 0 2.4-1.102 2.4-2.41 0 1.308 1.106 2.41 2.435 2.41C22.78 8.43 24 7.282 24 5.98V4.95c-.02-.62-2.082-2.99-3.13-3.612-3.253-.114-5.508-.134-8.87-.133-3.362 0-7.945.053-8.87.133zm6.376 6.477a2.74 2.74 0 0 1-.468.602c-.5.49-1.19.795-1.947.795a2.786 2.786 0 0 1-1.95-.795c-.182-.178-.32-.37-.446-.59-.127.222-.303.412-.486.59a2.788 2.788 0 0 1-1.95.795c-.092 0-.187-.025-.264-.052-.107 1.113-.152 2.176-.168 2.95v.005l-.006 1.167c.02 2.334-.23 7.564 1.03 8.85 1.952.454 5.545.662 9.15.663 3.605 0 7.198-.21 9.15-.664 1.26-1.284 1.01-6.514 1.03-8.848l-.006-1.167v-.004c-.016-.775-.06-1.838-.168-2.95-.077.026-.172.052-.263.052a2.788 2.788 0 0 1-1.95-.795c-.184-.178-.36-.368-.486-.59-.127.22-.265.412-.447.59a2.786 2.786 0 0 1-1.95.794c-.76 0-1.446-.303-1.948-.793a2.74 2.74 0 0 1-.468-.602 2.738 2.738 0 0 1-.463.602 2.787 2.787 0 0 1-1.95.794h-.16a2.787 2.787 0 0 1-1.95-.793 2.738 2.738 0 0 1-.464-.602zm-2.004 2.59v.002c.795.002 1.5 0 2.373.953.687-.072 1.406-.108 2.125-.107.72 0 1.438.035 2.125.107.873-.953 1.578-.95 2.372-.953.376 0 1.876 0 2.92 2.934l1.123 4.028c.832 2.995-.266 3.068-1.636 3.07-2.03-.075-3.156-1.55-3.156-3.025-1.124.184-2.436.276-3.748.277-1.312 0-2.624-.093-3.748-.277 0 1.475-1.125 2.95-3.156 3.026-1.37-.004-2.468-.077-1.636-3.072l1.122-4.027c1.045-2.934 2.545-2.934 2.92-2.934zM12 12.714c-.002.002-2.14 1.964-2.523 2.662l1.4-.056v1.22c0 .056.56.033 1.123.007.562.026 1.124.05 1.124-.008v-1.22l1.4.055C14.138 14.677 12 12.713 12 12.713z",
    viewBox: "0 0 24 24"
  },
  Ubisoft: {
    path: "M23.561 11.988C23.301-.304 6.954-4.89.656 6.634c.282.206.661.477.943.672a11.747 11.747 0 00-.976 3.067 11.885 11.885 0 00-.184 2.071C.439 18.818 5.621 24 12.005 24c6.385 0 11.556-5.17 11.556-11.556v-.455zm-20.27 2.06c-.152 1.246-.054 1.636-.054 1.788l-.282.098c-.108-.206-.37-.932-.488-1.908C2.163 10.308 4.7 6.96 8.57 6.33c3.544-.52 6.937 1.68 7.728 4.758l-.282.098c-.087-.087-.228-.336-.77-.878-4.281-4.281-11.002-2.32-11.956 3.74zm11.002 2.081a3.145 3.145 0 01-2.59 1.355 3.15 3.15 0 01-3.155-3.155 3.159 3.159 0 012.927-3.144c1.018-.043 1.972.51 2.416 1.398a2.58 2.58 0 01-.455 2.95c.293.205.575.4.856.595zm6.58.12c-1.669 3.782-5.106 5.766-8.77 5.712-7.034-.347-9.083-8.466-4.38-11.393l.207.206c-.076.108-.358.325-.791 1.182-.51 1.041-.672 2.081-.607 2.732.369 5.67 8.314 6.83 11.045 1.214C21.057 8.217 11.822.401 3.626 6.374l-.184-.184C5.599 2.808 9.816 1.3 13.837 2.309c6.147 1.55 9.453 7.956 7.035 13.94z",
    viewBox: "0 0 24 24"
  },
  Stove: {
    path: "M12 2.8c.9 3.1-2.3 4.4-2.3 7.5a2.4 2.4 0 0 0 4.8 0c0-.9-.3-1.7-.8-2.5 2.3 1.4 4.1 3.8 4.1 6.9a5.9 5.9 0 0 1-11.8 0c0-4.7 4.4-6.5 6-11.9z",
    viewBox: "0 0 24 24"
  },
  'Alienware Arena': {
    path: "M20.382 9.4054c-.0649-.6486-.1297-1.3622-.2595-2.0108-.1297-.6487-.2594-1.2973-.5189-1.946-.1297-.3243-.2595-.6486-.3892-.908-.1297-.3244-.3243-.5838-.454-.9082-.1946-.2594-.3892-.5838-.5838-.8432-.1946-.2595-.454-.519-.7135-.7135-.454-.3892-.973-.7784-1.5568-1.1027-.5838-.3244-1.2324-.5838-1.881-.7135C13.3765.0649 12.7278 0 12.0143 0c-.7135 0-1.3621.0649-2.0108.2595C9.355.3892 8.7712.6486 8.1874.973c-.6487.3243-1.1676.7135-1.6865 1.1675-.2595.1946-.454.454-.7135.7136l-.5838.7783c-.1297.3244-.3243.5838-.454.9081l-.3892.973c-.1946.6487-.3892 1.2973-.519 1.946-.1297.6486-.1946 1.2973-.2594 2.0108-.0649.7135 0 1.2973 0 1.946 0 .6486.0648 1.2972.1946 2.0107l.1946.973c.0648.3243.1946.6486.3243.973.454 1.2324 1.1676 2.4 1.881 3.5027.3893.5838.7785 1.1027 1.1676 1.6216.3892.519.7784 1.1027 1.2325 1.5568.1946.2594.454.454.7135.7135.2594.1946.519.3892.8432.5837.2595.1946.5838.3244.9081.4541.1298.0649.3244.1297.4541.1297.1946 0 .3243.0649.519.0649.1945 0 .3242 0 .5188-.0649.1946 0 .3244-.0648.454-.1297.3244-.1297.6487-.2595.9082-.454.2595-.1946.5838-.3892.8432-.5838.2595-.1946.519-.454.7136-.7135.454-.519.8432-1.0379 1.2324-1.5568.3892-.519.7784-1.1027 1.1676-1.6216.7135-1.1027 1.427-2.2703 1.881-3.5027.1298-.3244.2595-.6487.3244-.973.0648-.3243.1946-.6486.1946-.973.1297-.6486.1945-1.2973.1945-2.0108 0-.6486 0-1.3621-.0648-2.0108zM4.8144 12.0649s3.6973.8432 6.0973 5.8378c-.0649 0-6.4216-.1297-6.0973-5.8378zm8.3676 5.8378c2.3351-4.9946 6.0973-5.8378 6.0973-5.8378.3243 5.708-6.0973 5.8378-6.0973 5.8378z",
    viewBox: "0 0 24 24"
  },
  'Prime Gaming': {
    path: "M3.5 8.2l4.2 3.6L12 5.2l4.3 6.6 4.2-3.6-1.9 10H5.4z",
    viewBox: "0 0 24 24"
  },
  PlayStation: {
    path: "M8.984 2.596v17.547l3.915 1.261V6.688c0-.69.304-1.151.794-.991.636.18.76.814.76 1.505v5.875c2.441 1.193 4.362-.002 4.362-3.152 0-3.237-1.126-4.675-4.438-5.827-1.307-.448-3.728-1.186-5.39-1.502zm4.656 16.241l6.296-2.275c.715-.258.826-.625.246-.818-.586-.192-1.637-.139-2.357.123l-4.205 1.5V14.98l.24-.085s1.201-.42 2.913-.615c1.696-.18 3.785.03 5.437.661 1.848.601 2.04 1.472 1.576 2.072-.465.6-1.622 1.036-1.622 1.036l-8.544 3.107V18.86zM1.807 18.6c-1.9-.545-2.214-1.668-1.352-2.32.801-.586 2.16-1.052 2.16-1.052l5.615-2.013v2.313L4.205 17c-.705.271-.825.632-.239.826.586.195 1.637.15 2.343-.12L8.247 17v2.074c-.12.03-.256.044-.39.073-1.939.331-3.996.196-6.038-.479z",
    viewBox: "0 0 24 24"
  },
  Xbox: {
    path: "M7.202 15.967a8 8 0 0 1-3.552-1.26c-.898-.585-1.101-.826-1.101-1.306 0-.965 1.062-2.656 2.879-4.583C6.459 7.723 7.897 6.44 8.052 6.475c.302.068 2.718 2.423 3.622 3.531 1.43 1.753 2.088 3.189 1.754 3.829-.254.486-1.83 1.437-2.987 1.802-.954.301-2.207.429-3.239.33m-5.866-3.57C.589 11.253.212 10.127.03 8.497c-.06-.539-.038-.846.137-1.95.218-1.377 1.002-2.97 1.945-3.95.401-.417.437-.427.926-.263.595.2 1.23.638 2.213 1.528l.574.519-.313.385C4.056 6.553 2.52 9.086 1.94 10.653c-.315.852-.442 1.707-.306 2.063.091.24.007.15-.3-.319Zm13.101.195c.074-.36-.019-1.02-.238-1.687-.473-1.443-2.055-4.128-3.508-5.953l-.457-.575.494-.454c.646-.593 1.095-.948 1.58-1.25.381-.237.927-.448 1.161-.448.145 0 .654.528 1.065 1.104a8.4 8.4 0 0 1 1.343 3.102c.153.728.166 2.286.024 3.012a9.5 9.5 0 0 1-.6 1.893c-.179.393-.624 1.156-.82 1.404-.1.128-.1.127-.043-.148ZM7.335 1.952c-.67-.34-1.704-.705-2.276-.803a4 4 0 0 0-.759-.043c-.471.024-.45 0 .306-.358A7.8 7.8 0 0 1 6.47.128c.8-.169 2.306-.17 3.094-.005.85.18 1.853.552 2.418.9l.168.103-.385-.02c-.766-.038-1.88.27-3.078.853-.361.176-.676.316-.699.312a12 12 0 0 1-.654-.319Z",
    viewBox: "0 0 16 16"
  },
  Others: {
    path: "M6 6a4 4 0 0 0-4 4v4a4 4 0 0 0 4 4c1.5 0 2.5-1 3.5-2.5l1-1.5h3l1 1.5c1 1.5 2 2.5 3.5 2.5a4 4 0 0 0 4-4v-4a4 4 0 0 0-4-4H6zm1 4h2v1h1v2H9v1H7v-1H6v-2h1v-1zm10 1a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm-2 2a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm4 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm-2 2a1 1 0 1 1 0 2 1 1 0 0 1 0-2z",
    viewBox: "0 0 24 24"
  }
};

// 11 Supported Stores list for strip and text sync
const SUPPORTED_STORES = [
  { name: 'Steam' },
  { name: 'Epic Games' },
  { name: 'GOG' },
  { name: 'itch.io' },
  { name: 'Ubisoft' },
  { name: 'Stove' },
  { name: 'Alienware Arena' },
  { name: 'Prime Gaming' },
  { name: 'PlayStation' },
  { name: 'Xbox' },
  { name: 'Others' },
];

export default function ClaimrLandingPage({
  onLaunchApp,
  onNavigate,
  activeDealsCount = 95,
  totalSavingsValue = 668.81,
}: ClaimrLandingPageProps) {
  const [showIosModal, setShowIosModal] = useState(false);
  const [legalModal, setLegalModal] = useState<'privacy' | 'terms' | 'disclaimer' | null>(null);
  const [activeSection, setActiveSection] = useState<'hero' | 'stores' | 'missed-games' | 'the-gap' | 'systems' | 'faq'>('hero');

  // Track active section for floating navbar highlighting
  useEffect(() => {
    const sectionIds = ['hero', 'stores', 'missed-games', 'the-gap', 'systems', 'faq'];
    const handleScroll = () => {
      const scrollY = window.scrollY + 200;
      for (let i = sectionIds.length - 1; i >= 0; i--) {
        const id = sectionIds[i];
        const el = document.getElementById(id);
        if (el && el.offsetTop <= scrollY) {
          setActiveSection(id as any);
          break;
        }
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollTo = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      try {
        window.history.replaceState(null, '', `#${id}`);
      } catch {}
    }
  };

  return (
    <div
      className="hide-scrollbar"
      style={{
        backgroundColor: '#0a0a0c',
        color: '#fafafa',
        minHeight: '100vh',
        width: '100%',
        position: 'relative',
        overflowX: 'hidden',
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: VELOS_CLAIMR_CSS }} />

      {/* BACKGROUND NOISE GRAIN (z-9999, pointer-events-none) */}
      <div className="bg-grain" />

      {/* NAVIGATION: Fixed top pill with active section highlighting */}
      <div
        style={{
          position: 'fixed',
          top: '20px',
          left: 0,
          right: 0,
          zIndex: 50,
          display: 'flex',
          justifyContent: 'center',
          padding: '0 16px',
          pointerEvents: 'none',
        }}
      >
        <nav
          className="glass-card"
          style={{
            pointerEvents: 'auto',
            width: '100%',
            maxWidth: '68rem',
            borderRadius: '9999px',
            padding: '8px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'nowrap',
            gap: '12px',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.65)',
          }}
        >
          {/* Brand Logo */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
                flexShrink: 0,
              }}
            >
              <img
                src="/Icon_Latest.png"
                alt="Claimr Icon"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            </div>
            <div>
              <span
                className="font-heading"
                style={{
                  fontSize: '17px',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  color: '#ffffff',
                }}
              >
                CLAIMR
              </span>
            </div>
          </div>

          {/* Nav Links with Current Section Highlighting */}
          <div
            className="hidden lg:flex"
            style={{
              alignItems: 'center',
              gap: '6px',
              fontFamily: 'Inter',
              fontSize: '13px',
              color: '#a1a1aa',
              flexShrink: 1,
            }}
          >
            <a
              href="#stores"
              onClick={scrollTo('stores')}
              style={{
                color: activeSection === 'stores' ? '#ffffff' : '#a1a1aa',
                backgroundColor: activeSection === 'stores' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                padding: '6px 14px',
                borderRadius: '9999px',
                textDecoration: 'none',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
              }}
            >
              Stores
            </a>
            <a
              href="#missed-games"
              onClick={scrollTo('missed-games')}
              style={{
                color: activeSection === 'missed-games' ? '#ffffff' : '#a1a1aa',
                backgroundColor: activeSection === 'missed-games' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                padding: '6px 14px',
                borderRadius: '9999px',
                textDecoration: 'none',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
              }}
            >
              Missed Games
            </a>
            <a
              href="#the-gap"
              onClick={scrollTo('the-gap')}
              style={{
                color: activeSection === 'the-gap' ? '#ffffff' : '#a1a1aa',
                backgroundColor: activeSection === 'the-gap' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                padding: '6px 14px',
                borderRadius: '9999px',
                textDecoration: 'none',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
              }}
            >
              The Problem
            </a>
            <a
              href="#systems"
              onClick={scrollTo('systems')}
              style={{
                color: activeSection === 'systems' ? '#ffffff' : '#a1a1aa',
                backgroundColor: activeSection === 'systems' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                padding: '6px 14px',
                borderRadius: '9999px',
                textDecoration: 'none',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
              }}
            >
              How It Works
            </a>
            <a
              href="#faq"
              onClick={scrollTo('faq')}
              style={{
                color: activeSection === 'faq' ? '#ffffff' : '#a1a1aa',
                backgroundColor: activeSection === 'faq' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                padding: '6px 14px',
                borderRadius: '9999px',
                textDecoration: 'none',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
              }}
            >
              FAQ
            </a>
          </div>

          {/* Launch CTA - ONLY gateway to main app */}
          <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <button
              onClick={onLaunchApp}
              className="btn-primary-solid"
              style={{
                padding: '9px 22px',
                borderRadius: '9999px',
                fontFamily: 'Bricolage Grotesque',
                fontSize: '13px',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap',
                minHeight: '40px',
              }}
            >
              <span>Launch App</span>
              <span style={{ fontSize: '14px' }}>→</span>
            </button>
          </div>
        </nav>
      </div>

      {/* SECTION 1 - HERO: Centered Hero Layout without Mockup */}
      <section
        id="hero"
        style={{
          position: 'relative',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '140px 24px 80px 24px',
          overflow: 'hidden',
          zIndex: 10,
        }}
      >
        {/* VELOS Cosmic Particle Sphere Hero Background */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 0,
            overflow: 'hidden',
          }}
        >
          <img
            src="https://hoirqrkdgbmvpwutwuwj.supabase.co/storage/v1/object/public/assets/assets/25904405-aa15-491b-9a03-de5fc75f18b3_3840w.webp"
            alt="Cosmic Particle Background"
            className="hero-bg-anim"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center',
              opacity: 0.88,
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'radial-gradient(circle at 50% 40%, rgba(10, 10, 12, 0.12) 0%, rgba(10, 10, 12, 0.65) 70%, #0a0a0c 100%), linear-gradient(180deg, rgba(10, 10, 12, 0.7) 0%, transparent 25%, transparent 75%, #0a0a0c 100%)',
              pointerEvents: 'none',
            }}
          />
        </div>

        {/* Centered Hero Content Container */}
        <div
          style={{
            position: 'relative',
            zIndex: 10,
            maxWidth: '56rem',
            margin: '0 auto',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: '32px',
          }}
        >
          {/* H1 Headline */}
          <div>
            <h1
              className="font-heading"
              style={{
                fontSize: 'clamp(3rem, 6.5vw, 6.4rem)',
                fontWeight: 800,
                lineHeight: 0.95,
                letterSpacing: '-0.04em',
                color: '#ffffff',
                margin: 0,
                textShadow: '0 10px 40px rgba(0, 0, 0, 0.8)',
              }}
            >
              NEVER MISS
            </h1>
            <div
              className="font-heading"
              style={{
                fontSize: 'clamp(3rem, 6.5vw, 6.4rem)',
                fontWeight: 800,
                lineHeight: 0.95,
                letterSpacing: '-0.04em',
                color: '#ffffff',
                marginTop: '8px',
                textShadow: '0 10px 40px rgba(0, 0, 0, 0.8)',
              }}
            >
              FREE GAMES
            </div>
            <div
              className="font-heading"
              style={{
                fontSize: 'clamp(3rem, 6.5vw, 6.4rem)',
                fontWeight: 800,
                lineHeight: 0.95,
                letterSpacing: '-0.04em',
                color: 'rgba(255, 255, 255, 0.75)',
                marginTop: '8px',
                textShadow: '0 10px 40px rgba(0, 0, 0, 0.8)',
              }}
            >
              AGAIN.
            </div>
          </div>

          {/* "Why Claimr Exists" Box - Centered with Comfortable Spacing */}
          <div
            className="glass-card"
            style={{
              maxWidth: '620px',
              borderRadius: '18px',
              padding: '24px 28px',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              textAlign: 'center',
            }}
          >
            <p
              className="font-body"
              style={{
                fontSize: '15px',
                lineHeight: 1.65,
                color: '#a1a1aa',
                margin: 0,
                fontWeight: 300,
              }}
            >
              Storefronts quietly run limited-time promotional giveaways on major titles like <strong style={{ color: '#ffffff' }}>GTA V</strong>, <strong style={{ color: '#ffffff' }}>Civilization VI</strong>, and <strong style={{ color: '#ffffff' }}>Dead Island 2</strong>. But many players only hear about them after the promotion expires. Claimr notifies you as soon as deals are detected so you have time to claim them.
            </p>
          </div>

          {/* Platform Action Buttons: Stacked & Centered */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', width: '100%', maxWidth: '340px' }}>
            {/* Android APK Download - Primary Solid */}
            <a
              href="https://github.com/EklavyaAhuja/claimr/releases/latest/download/claimr-v1.3.0.apk"
              download="claimr-v1.3.0.apk"
              className="btn-primary-solid"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                padding: '14px 28px',
                borderRadius: '9999px',
                textDecoration: 'none',
                minHeight: '48px',
                cursor: 'pointer',
                width: '100%',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#09090b">
                <path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.551 0 .9993.4482.9993.9993.0001.5511-.4483.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1521-.5676.416.416 0 00-.5676.1521l-2.0223 3.503C15.5902 8.4126 13.8533 8.081 12 8.081s-3.5902.3315-5.1368.8687L4.8409 5.4467a.4161.4161 0 00-.5677-.1521.4157.4157 0 00-.1521.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.741h24c-.3432-4.0821-2.6889-7.5543-6.1185-9.4196" />
              </svg>
              <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                <span className="font-heading" style={{ fontSize: '13px', fontWeight: 700, lineHeight: 1.2 }}>
                  Download Android APK
                </span>
                <span className="font-mono" style={{ fontSize: '10px', color: '#059669', letterSpacing: '0.04em' }}>
                  v1.3.0
                </span>
              </div>
            </a>

            {/* iOS Install - Secondary Outline */}
            <button
              onClick={() => setShowIosModal(true)}
              className="btn-secondary-outline"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                padding: '14px 28px',
                borderRadius: '9999px',
                minHeight: '48px',
                cursor: 'pointer',
                width: '100%',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 170 170" fill="#ffffff">
                <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.7-3.04-7.59-7.71-11.66-14.01-5.77-8.87-10.29-19.12-13.56-30.74-3.27-11.62-4.9-22.68-4.9-33.17 0-14.34 3.52-26.06 10.56-35.17 7.04-9.11 15.82-13.79 26.34-14.03 4.35 0 9.29 1.15 14.82 3.45 5.53 2.3 9.38 3.56 11.55 3.78 1.95-.22 5.86-1.54 11.72-3.97 5.86-2.43 10.74-3.52 14.65-3.26 11.55.77 20.89 5.38 28.02 13.82-10.22 6.19-15.22 14.77-15 25.74.22 8.68 3.58 15.99 10.08 21.93 6.5 5.94 14.28 9.32 23.34 10.14-2.17 6.4-4.83 12.87-7.98 19.42zM119.22 31.84c0-7.39 2.65-14.24 7.95-20.55 5.3-6.31 11.76-10.42 19.38-12.33-.22 1.52-.39 2.93-.52 4.24-.65 7.17-3.41 13.89-8.29 20.17-4.88 6.28-11.08 10.36-18.6 12.24l.08-3.77z" />
              </svg>
              <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                <span className="font-heading" style={{ fontSize: '13px', fontWeight: 700, lineHeight: 1.2 }}>
                  Add to Home Screen (iOS)
                </span>
                <span className="font-mono" style={{ fontSize: '10px', color: '#a1a1aa', letterSpacing: '0.04em' }}>
                  Safari Web App Guide
                </span>
              </div>
            </button>

            {/* Launch Web App Button */}
            <button
              onClick={onLaunchApp}
              className="btn-secondary-outline"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '14px 28px',
                borderRadius: '9999px',
                minHeight: '48px',
                cursor: 'pointer',
                width: '100%',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.16)',
                color: '#EDEDEB',
              }}
            >
              <span className="font-heading" style={{ fontSize: '13px', fontWeight: 600 }}>
                Launch Web App
              </span>
              <span style={{ fontSize: '14px' }}>→</span>
            </button>

            {/* Price & Offer Change Notice */}
            <div
              className="font-body"
              style={{
                fontSize: '11px',
                color: '#71717a',
                marginTop: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                justifyContent: 'center',
              }}
            >
              <span>ℹ</span>
              <span>Prices, availability, and promotional terms are set by storefronts and may change at any time.</span>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION: SUPPORTED STOREFRONTS & WHAT WE TRACK */}
      <section
        id="stores"
        style={{
          maxWidth: '80rem',
          margin: '0 auto',
          padding: '80px 24px 60px 24px',
          position: 'relative',
          zIndex: 10,
        }}
      >
        {/* Section Header */}
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <h2 className="font-heading" style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)', fontWeight: 700, color: '#ffffff', margin: '0 0 10px 0' }}>
            SUPPORTED STOREFRONTS & PLATFORMS
          </h2>
          <p className="font-body" style={{ fontSize: '14px', color: '#a1a1aa', margin: '0 auto', maxWidth: '640px', fontWeight: 300 }}>
            We monitor promotional discount feeds across all major PC, console, and indie storefronts as soon as promotional drops are released.
          </p>
        </div>

        {/* Revolving Store Carousel with Brand Icons */}
        <div className="store-revolving-container">
          <div className="store-revolving-track">
            {[...SUPPORTED_STORES, ...SUPPORTED_STORES, ...SUPPORTED_STORES, ...SUPPORTED_STORES].map((st, idx) => {
              const iconData = STORE_ICONS[st.name];
              return (
                <div
                  key={`${st.name}-${idx}`}
                  className="glass-card store-pill"
                  style={{
                    padding: '11px 20px',
                    borderRadius: '14px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '10px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                    cursor: 'default',
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {iconData && (
                    <svg
                      width="18"
                      height="18"
                      viewBox={iconData.viewBox || '0 0 24 24'}
                      fill="currentColor"
                      style={{
                        color: '#ffffff',
                        flexShrink: 0,
                        opacity: 0.9,
                      }}
                    >
                      <path d={iconData.path} />
                    </svg>
                  )}
                  <span className="font-heading" style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff' }}>
                    {st.name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* "What We Track" Indicator Strip - Single Accent Color for Dots, No // label */}
        <div
          className="glass-card"
          style={{
            maxWidth: '44rem',
            margin: '0 auto',
            borderRadius: '16px',
            padding: '16px 24px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '24px',
            border: '1px solid rgba(255, 255, 255, 0.12)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <span className="font-heading" style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#10b981' }}>●</span> Games
            </span>
            <span className="font-heading" style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#10b981' }}>●</span> DLC & Expansions
            </span>
            <span className="font-heading" style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#10b981' }}>●</span> Betas & Playtests
            </span>
          </div>
        </div>
      </section>

      {/* SECTION 2 - MISSED GAMES: Past Giveaways Shown as Historical Examples */}
      <section
        id="missed-games"
        style={{
          maxWidth: '80rem',
          margin: '0 auto',
          padding: '90px 24px',
          position: 'relative',
          zIndex: 10,
        }}
      >
        {/* Header without // label */}
        <div style={{ marginBottom: '48px' }}>
          <h2
            className="font-heading"
            style={{
              fontSize: 'clamp(2.4rem, 5vw, 4.2rem)',
              fontWeight: 700,
              lineHeight: 0.95,
              letterSpacing: '-0.03em',
              color: '#ffffff',
              margin: '0 0 12px 0',
            }}
          >
            THESE WERE FREE TO CLAIM.
          </h2>
          <p className="font-body" style={{ fontSize: '15px', color: '#a1a1aa', margin: 0, maxWidth: '680px', fontWeight: 300 }}>
            Major storefronts frequently give away complete games for a limited window. Here are historical examples of past promotional giveaways.
          </p>
        </div>

        {/* Mission Grid Cards Layout */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(12, 1fr)',
            gap: '24px',
          }}
        >
          {/* Card 01: Grand Theft Auto V */}
          <div
            className="glass-card bento-hero-left game-card-hover"
            style={{
              gridColumn: 'span 12',
              position: 'relative',
              borderRadius: '24px',
              overflow: 'hidden',
              minHeight: '440px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: '36px',
            }}
          >
            {/* Background Picture with Darkened Gradient */}
            <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
              <img
                src="https://cdn.cloudflare.steamstatic.com/steam/apps/271590/header.jpg"
                alt="Grand Theft Auto V"
                className="game-card-img"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  objectPosition: 'center',
                  filter: 'grayscale(50%)',
                  transition: 'transform 0.5s ease, filter 0.5s ease',
                  opacity: 0.55,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background:
                    'linear-gradient(180deg, rgba(10,10,12,0.15) 0%, rgba(10,10,12,0.7) 45%, rgba(10,10,12,0.98) 100%)',
                }}
              />
            </div>

            {/* Faded Large Number */}
            <div
              className="font-heading"
              style={{
                position: 'absolute',
                top: '-20px',
                right: '20px',
                fontSize: 'clamp(8rem, 20vw, 18rem)',
                fontWeight: 900,
                color: 'rgba(255, 255, 255, 0.15)',
                userSelect: 'none',
                pointerEvents: 'none',
                lineHeight: 1,
                zIndex: 1,
              }}
            >
              01
            </div>

            {/* Top Consistent Price Badge */}
            <div style={{ position: 'relative', zIndex: 2, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
              <span
                className="font-mono game-savings-tag"
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  padding: '4px 12px',
                  borderRadius: '9999px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.25s ease',
                }}
              >
                <span style={{ textDecoration: 'line-through', color: '#a1a1aa' }}>$29.99</span>
                <span style={{ color: '#10b981', fontWeight: 700 }}>FREE</span>
              </span>
            </div>

            {/* Bottom Content HUD */}
            <div style={{ position: 'relative', zIndex: 2, maxWidth: '540px' }}>
              <h3
                className="font-heading"
                style={{
                  fontSize: 'clamp(2rem, 3.8vw, 3.2rem)',
                  fontWeight: 700,
                  letterSpacing: '-0.03em',
                  color: '#ffffff',
                  margin: '0 0 10px 0',
                }}
              >
                Grand Theft Auto V: Premium Edition
              </h3>
              <p
                className="font-body"
                style={{
                  fontSize: '14px',
                  lineHeight: 1.6,
                  color: '#c8c9c1',
                  margin: 0,
                  fontWeight: 300,
                }}
              >
                Epic Games offered GTA V at $0.00 during a massive holiday promotion. Millions claimed it, but many others only discovered it after the promotional window closed and the price reverted.
              </p>
            </div>
          </div>

          {/* Card 02: Civilization VI */}
          <div
            className="glass-card bento-hero-right game-card-hover"
            style={{
              gridColumn: 'span 12',
              position: 'relative',
              borderRadius: '24px',
              overflow: 'hidden',
              minHeight: '440px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: '32px',
            }}
          >
            <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
              <img
                src="https://cdn.cloudflare.steamstatic.com/steam/apps/289070/header.jpg"
                alt="Civilization VI"
                className="game-card-img"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  objectPosition: 'center',
                  filter: 'grayscale(50%)',
                  transition: 'transform 0.5s ease, filter 0.5s ease',
                  opacity: 0.55,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background:
                    'linear-gradient(180deg, rgba(10,10,12,0.15) 0%, rgba(10,10,12,0.7) 45%, rgba(10,10,12,0.98) 100%)',
                }}
              />
            </div>

            <div
              className="font-heading"
              style={{
                position: 'absolute',
                top: '-15px',
                right: '20px',
                fontSize: 'clamp(6rem, 15vw, 12rem)',
                fontWeight: 900,
                color: 'rgba(255, 255, 255, 0.15)',
                userSelect: 'none',
                pointerEvents: 'none',
                lineHeight: 1,
                zIndex: 1,
              }}
            >
              02
            </div>

            {/* Consistent Price Tag */}
            <div style={{ position: 'relative', zIndex: 2, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
              <span
                className="font-mono game-savings-tag"
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  padding: '4px 12px',
                  borderRadius: '9999px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.25s ease',
                }}
              >
                <span style={{ textDecoration: 'line-through', color: '#a1a1aa' }}>$59.99</span>
                <span style={{ color: '#10b981', fontWeight: 700 }}>FREE</span>
              </span>
            </div>

            <div style={{ position: 'relative', zIndex: 2 }}>
              <h3 className="font-heading" style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 6px 0' }}>
                Sid Meier's Civilization VI
              </h3>
              <p className="font-body" style={{ fontSize: '13px', color: '#c8c9c1', margin: 0, lineHeight: 1.5 }}>
                The full turn-based strategy empire game was free to claim for a one-week promotional period. A substantial saving if claimed in time.
              </p>
            </div>
          </div>

          {/* Card 03: Dead Island 2 */}
          <div
            className="glass-card bento-third game-card-hover"
            style={{
              gridColumn: 'span 12',
              position: 'relative',
              borderRadius: '24px',
              overflow: 'hidden',
              minHeight: '340px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: '32px',
            }}
          >
            <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
              <img
                src="https://cdn.cloudflare.steamstatic.com/steam/apps/934700/header.jpg"
                alt="Dead Island 2"
                className="game-card-img"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  objectPosition: 'center',
                  filter: 'grayscale(50%)',
                  transition: 'transform 0.5s ease, filter 0.5s ease',
                  opacity: 0.55,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background:
                    'linear-gradient(180deg, rgba(10,10,12,0.15) 0%, rgba(10,10,12,0.7) 45%, rgba(10,10,12,0.98) 100%)',
                }}
              />
            </div>

            <div
              className="font-heading"
              style={{
                position: 'absolute',
                top: '-15px',
                right: '20px',
                fontSize: 'clamp(6rem, 15vw, 12rem)',
                fontWeight: 900,
                color: 'rgba(255, 255, 255, 0.15)',
                userSelect: 'none',
                pointerEvents: 'none',
                lineHeight: 1,
                zIndex: 1,
              }}
            >
              03
            </div>

            {/* Consistent Price Tag */}
            <div style={{ position: 'relative', zIndex: 2, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
              <span
                className="font-mono game-savings-tag"
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  padding: '4px 12px',
                  borderRadius: '9999px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.25s ease',
                }}
              >
                <span style={{ textDecoration: 'line-through', color: '#a1a1aa' }}>$49.99</span>
                <span style={{ color: '#10b981', fontWeight: 700 }}>FREE</span>
              </span>
            </div>

            <div style={{ position: 'relative', zIndex: 2 }}>
              <h3 className="font-heading" style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 6px 0' }}>
                Dead Island 2
              </h3>
              <p className="font-body" style={{ fontSize: '13px', color: '#c8c9c1', margin: 0, lineHeight: 1.5 }}>
                High-octane zombie survival action across Los Angeles. Full PC license offered for free during a promotional campaign.
              </p>
            </div>
          </div>

          {/* Card 04: Hogwarts Legacy */}
          <div
            className="glass-card bento-third game-card-hover"
            style={{
              gridColumn: 'span 12',
              position: 'relative',
              borderRadius: '24px',
              overflow: 'hidden',
              minHeight: '340px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: '32px',
            }}
          >
            <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
              <img
                src="https://cdn.cloudflare.steamstatic.com/steam/apps/990080/header.jpg"
                alt="Hogwarts Legacy"
                className="game-card-img"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  objectPosition: 'center',
                  filter: 'grayscale(50%)',
                  transition: 'transform 0.5s ease, filter 0.5s ease',
                  opacity: 0.55,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background:
                    'linear-gradient(180deg, rgba(10,10,12,0.15) 0%, rgba(10,10,12,0.7) 45%, rgba(10,10,12,0.98) 100%)',
                }}
              />
            </div>

            <div
              className="font-heading"
              style={{
                position: 'absolute',
                top: '-15px',
                right: '20px',
                fontSize: 'clamp(6rem, 15vw, 12rem)',
                fontWeight: 900,
                color: 'rgba(255, 255, 255, 0.15)',
                userSelect: 'none',
                pointerEvents: 'none',
                lineHeight: 1,
                zIndex: 1,
              }}
            >
              04
            </div>

            {/* Consistent Price Tag */}
            <div style={{ position: 'relative', zIndex: 2, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
              <span
                className="font-mono game-savings-tag"
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  padding: '4px 12px',
                  borderRadius: '9999px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.25s ease',
                }}
              >
                <span style={{ textDecoration: 'line-through', color: '#a1a1aa' }}>$59.99</span>
                <span style={{ color: '#10b981', fontWeight: 700 }}>FREE</span>
              </span>
            </div>

            <div style={{ position: 'relative', zIndex: 2 }}>
              <h3 className="font-heading" style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 6px 0' }}>
                Hogwarts Legacy
              </h3>
              <p className="font-body" style={{ fontSize: '13px', color: '#c8c9c1', margin: 0, lineHeight: 1.5 }}>
                Open-world action RPG set in the wizarding world. Included in store partner drops and promotional trial events.
              </p>
            </div>
          </div>

          {/* Card 05: Death Stranding: Director's Cut */}
          <div
            className="glass-card bento-third game-card-hover"
            style={{
              gridColumn: 'span 12',
              position: 'relative',
              borderRadius: '24px',
              overflow: 'hidden',
              minHeight: '340px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: '32px',
            }}
          >
            <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
              <img
                src="https://cdn.cloudflare.steamstatic.com/steam/apps/1850570/header.jpg"
                alt="Death Stranding: Director's Cut"
                className="game-card-img"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  objectPosition: 'center',
                  filter: 'grayscale(50%)',
                  transition: 'transform 0.5s ease, filter 0.5s ease',
                  opacity: 0.55,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background:
                    'linear-gradient(180deg, rgba(10,10,12,0.15) 0%, rgba(10,10,12,0.7) 45%, rgba(10,10,12,0.98) 100%)',
                }}
              />
            </div>

            <div
              className="font-heading"
              style={{
                position: 'absolute',
                top: '-15px',
                right: '20px',
                fontSize: 'clamp(6rem, 15vw, 12rem)',
                fontWeight: 900,
                color: 'rgba(255, 255, 255, 0.15)',
                userSelect: 'none',
                pointerEvents: 'none',
                lineHeight: 1,
                zIndex: 1,
              }}
            >
              05
            </div>

            {/* Consistent Price Tag */}
            <div style={{ position: 'relative', zIndex: 2, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
              <span
                className="font-mono game-savings-tag"
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  padding: '4px 12px',
                  borderRadius: '9999px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.25s ease',
                }}
              >
                <span style={{ textDecoration: 'line-through', color: '#a1a1aa' }}>$39.99</span>
                <span style={{ color: '#10b981', fontWeight: 700 }}>FREE</span>
              </span>
            </div>

            <div style={{ position: 'relative', zIndex: 2 }}>
              <h3 className="font-heading" style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 6px 0' }}>
                Death Stranding: Director's Cut
              </h3>
              <p className="font-body" style={{ fontSize: '13px', color: '#c8c9c1', margin: 0, lineHeight: 1.5 }}>
                Hideo Kojima's genre-defining cinematic journey. A limited holiday drop that was free to claim before the promotional timer expired.
              </p>
            </div>
          </div>
        </div>

        {/* Legal note under missed games cards */}
        <div
          style={{
            marginTop: '24px',
            fontSize: '12px',
            color: '#71717a',
            lineHeight: 1.5,
          }}
        >
          * Game names, trademarks, logos, and artwork belong to their respective copyright holders and are shown strictly as historical examples of past promotional giveaways.
        </div>
      </section>

      {/* SECTION 3 - THE PROBLEM & STATIC VISUAL TIMELINE */}
      <section
        id="the-gap"
        style={{
          maxWidth: '80rem',
          margin: '0 auto',
          padding: '90px 24px',
          position: 'relative',
          zIndex: 10,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '48px',
            alignItems: 'center',
          }}
        >
          {/* Left Column: Problem & Solution without red X / green check icons */}
          <div>
            <h2
              className="font-heading"
              style={{
                fontSize: 'clamp(2.4rem, 5vw, 4.2rem)',
                fontWeight: 700,
                lineHeight: 0.95,
                letterSpacing: '-0.03em',
                color: '#ffffff',
                margin: '0 0 16px 0',
              }}
            >
              WHY PEOPLE MISS GIVEAWAYS.
            </h2>
            <p className="font-body" style={{ fontSize: '15px', lineHeight: 1.6, color: '#a1a1aa', margin: '0 0 32px 0', fontWeight: 300 }}>
              Promotional giveaways run for limited windows. If you depend on social algorithms or random friend mentions, you often miss out on hundreds of dollars in free games each year.
            </p>

            {/* Plain Headings with Descriptions (No red/green square icon boxes) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '26px' }}>
              <div>
                <h4 className="font-heading" style={{ fontSize: '17px', fontWeight: 600, color: '#ffffff', margin: '0 0 6px 0' }}>
                  Social Media Feeds Are Often Late
                </h4>
                <p className="font-body" style={{ fontSize: '14px', color: '#a1a1aa', margin: 0, lineHeight: 1.6, fontWeight: 300 }}>
                  Algorithms push posts based on viral trends rather than timeliness. By the time a forum or social post reaches your timeline, the promotional window has often expired.
                </p>
              </div>

              <div>
                <h4 className="font-heading" style={{ fontSize: '17px', fontWeight: 600, color: '#ffffff', margin: '0 0 6px 0' }}>
                  Claimr Alerts You as Soon as Deals Are Detected
                </h4>
                <p className="font-body" style={{ fontSize: '14px', color: '#a1a1aa', margin: 0, lineHeight: 1.6, fontWeight: 300 }}>
                  Instant deal notifications the moment our scanners detect a verified promotional discount, giving you direct access to the official store cart before the offer ends.
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Simple Timeline Graphic ("A giveaway window") */}
          <div
            style={{
              borderRadius: '20px',
              padding: '30px 26px',
              border: '1px solid rgba(255, 255, 255, 0.07)',
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
              display: 'flex',
              flexDirection: 'column',
              gap: '26px',
            }}
          >
            {/* Header */}
            <div>
              <h3
                className="font-heading"
                style={{
                  fontSize: '19px',
                  fontWeight: 600,
                  color: '#ffffff',
                  margin: '0 0 4px 0',
                  letterSpacing: '-0.01em',
                }}
              >
                A giveaway window
              </h3>
              <p
                className="font-body"
                style={{
                  fontSize: '13px',
                  color: '#71717a',
                  margin: 0,
                  fontWeight: 400,
                }}
              >
                Illustrative example. Real windows vary by store.
              </p>
            </div>

            {/* Horizontal Timeline Bar representing the limited window */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  height: '6px',
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  borderRadius: '9999px',
                }}
              >
                {/* Active giveaway window (0% to 70%) */}
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: '70%',
                    height: '100%',
                    backgroundColor: '#ffffff',
                    opacity: 0.35,
                    borderRadius: '9999px',
                  }}
                />
              </div>

              {/* Start & End labels aligned perfectly */}
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  height: '16px',
                  fontSize: '12px',
                  color: '#a1a1aa',
                  fontFamily: 'Inter',
                }}
              >
                <span style={{ position: 'absolute', left: 0 }}>Starts ($0.00)</span>
                <span style={{ position: 'absolute', left: '70%', transform: 'translateX(-50%)' }}>
                  Ends
                </span>
              </div>
            </div>

            {/* Two Comparative Rows: Without alerts & With Claimr */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Row 1: Without alerts */}
              <div
                style={{
                  paddingTop: '16px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span
                    className="font-heading"
                    style={{ fontSize: '13px', fontWeight: 600, color: '#a1a1aa' }}
                  >
                    Without alerts
                  </span>
                  <span
                    style={{
                      fontSize: '11px',
                      color: '#71717a',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                    }}
                  >
                    Expired
                  </span>
                </div>

                <div
                  style={{
                    position: 'relative',
                    height: '42px',
                    width: '100%',
                  }}
                >
                  {/* Subtle track guide line */}
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: '10px',
                      height: '2px',
                      backgroundColor: 'rgba(255, 255, 255, 0.08)',
                      borderRadius: '1px',
                    }}
                  />
                  {/* Window end boundary tick mark at 70% */}
                  <div
                    style={{
                      position: 'absolute',
                      left: '70%',
                      top: '3px',
                      transform: 'translateX(-50%)',
                      width: '2px',
                      height: '16px',
                      backgroundColor: 'rgba(255, 255, 255, 0.25)',
                      borderRadius: '1px',
                    }}
                  />

                  {/* Muted grey marker placed after the end of the bar (at 84%) */}
                  <div
                    className="timeline-row-marker"
                    style={{
                      position: 'absolute',
                      left: '84%',
                      top: 0,
                      bottom: 0,
                      transform: 'translateX(-50%)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        top: '11px',
                        transform: 'translateY(-50%)',
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: '#71717a',
                        border: '2px solid #0f0f13',
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        position: 'absolute',
                        top: '24px',
                        fontSize: '11px',
                        color: '#a1a1aa',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      You hear about it
                    </span>
                  </div>
                </div>
              </div>

              {/* Row 2: With Claimr */}
              <div
                style={{
                  paddingTop: '16px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span
                    className="font-heading"
                    style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff' }}
                  >
                    With Claimr
                  </span>
                  <span
                    style={{
                      fontSize: '11px',
                      color: '#10b981',
                      backgroundColor: 'rgba(16, 185, 129, 0.08)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontWeight: 500,
                    }}
                  >
                    Claim in time
                  </span>
                </div>

                <div
                  style={{
                    position: 'relative',
                    height: '42px',
                    width: '100%',
                  }}
                >
                  {/* Subtle track guide line */}
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: '10px',
                      height: '2px',
                      backgroundColor: 'rgba(255, 255, 255, 0.08)',
                      borderRadius: '1px',
                    }}
                  />
                  {/* Window end boundary tick mark at 70% */}
                  <div
                    style={{
                      position: 'absolute',
                      left: '70%',
                      top: '3px',
                      transform: 'translateX(-50%)',
                      width: '2px',
                      height: '16px',
                      backgroundColor: 'rgba(255, 255, 255, 0.25)',
                      borderRadius: '1px',
                    }}
                  />

                  {/* Green marker placed right at the start of the bar (at 0%) */}
                  <div
                    className="timeline-row-marker"
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: '11px',
                        transform: 'translateY(-50%)',
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: '#10b981',
                        boxShadow: '0 0 8px rgba(16, 185, 129, 0.5)',
                        border: '2px solid #0f0f13',
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: '24px',
                        fontSize: '11px',
                        color: '#10b981',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Alert arrives
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4 - CORE SYSTEMS (Unified Green Accent, No // labels) */}
      <section
        id="systems"
        style={{
          maxWidth: '80rem',
          margin: '0 auto',
          padding: '90px 24px',
          position: 'relative',
          zIndex: 10,
        }}
      >
        <div style={{ marginBottom: '64px' }}>
          <h2 className="font-heading" style={{ fontSize: 'clamp(2.4rem, 4.5vw, 3.8rem)', fontWeight: 700, margin: '0 0 12px 0' }}>
            BUILT TO SAVE YOU MONEY.
          </h2>
          <p className="font-body" style={{ fontSize: '15px', color: '#a1a1aa', margin: 0, maxWidth: '620px', fontWeight: 300, lineHeight: 1.6 }}>
            Everything you need to build a massive PC and console game library without missing out on promotional drops.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '32px' }}>
          {/* Card 1: Instant Deal Alerts */}
          <div
            className="glass-card feature-radar-card"
            style={{
              borderRadius: '24px',
              padding: '36px',
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              minHeight: '380px',
              transition: 'border-color 0.3s ease',
            }}
          >
            <div style={{ height: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="120" height="120" viewBox="0 0 120 120" style={{ overflow: 'visible' }}>
                <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(16, 185, 129, 0.15)" strokeWidth="1" />
                <circle cx="60" cy="60" r="34" fill="none" stroke="rgba(16, 185, 129, 0.2)" strokeWidth="1" strokeDasharray="3 3" />
                <circle cx="60" cy="60" r="18" fill="none" stroke="rgba(16, 185, 129, 0.25)" strokeWidth="1" />
                <line x1="10" y1="60" x2="110" y2="60" stroke="rgba(16, 185, 129, 0.25)" strokeWidth="1" strokeDasharray="2 4" />
                <line x1="60" y1="10" x2="60" y2="110" stroke="rgba(16, 185, 129, 0.25)" strokeWidth="1" strokeDasharray="2 4" />
                <g className="anim-rotate-scanner">
                  <line x1="60" y1="60" x2="60" y2="10" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />
                  <polygon points="60,60 50,15 60,10" fill="rgba(16, 185, 129, 0.25)" />
                </g>
                <g className="anim-pulse-glow">
                  <circle cx="78" cy="38" r="4" fill="#10b981" />
                  <circle cx="78" cy="38" r="8" fill="none" stroke="#10b981" strokeWidth="1" opacity="0.6" />
                  <circle cx="42" cy="74" r="3.5" fill="#34d399" />
                  <circle cx="85" cy="75" r="3" fill="#6ee7b7" />
                </g>
                <circle cx="60" cy="60" r="4" fill="#ffffff" style={{ filter: 'drop-shadow(0 0 6px #10b981)' }} />
              </svg>
            </div>

            <div>
              <div className="font-mono" style={{ fontSize: '11px', color: '#10b981', marginBottom: '8px', fontWeight: 700 }}>
                01
              </div>
              <h3 className="font-heading" style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 10px 0' }}>
                Instant Deal Alerts
              </h3>
              <p className="font-body" style={{ fontSize: '13px', color: '#a1a1aa', margin: 0, lineHeight: 1.6, fontWeight: 300 }}>
                We track Steam, Epic Games, GOG, itch.io, Ubisoft, Stove, Alienware Arena, Prime Gaming, PlayStation, Xbox, and more. As soon as a promotional giveaway goes live, you receive a direct notification.
              </p>
            </div>

            <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: '3px', backgroundColor: 'rgba(16, 185, 129, 0.2)' }}>
              <div style={{ height: '100%', width: '100%', backgroundColor: '#10b981', transform: 'scaleX(0.3)', transformOrigin: 'left' }} />
            </div>
          </div>

          {/* Card 2: Direct Store Links (Neutral & Green Accents) */}
          <div
            className="glass-card feature-shield-card"
            style={{
              borderRadius: '24px',
              padding: '36px',
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              minHeight: '380px',
              transition: 'border-color 0.3s ease',
            }}
          >
            <div style={{ height: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="120" height="120" viewBox="0 0 120 120" style={{ overflow: 'visible' }}>
                <polygon points="60,15 100,35 100,80 60,105 20,80 20,35" fill="none" stroke="rgba(16, 185, 129, 0.2)" strokeWidth="1" />
                <polygon points="60,25 90,40 90,75 60,95 30,75 30,40" fill="none" stroke="rgba(16, 185, 129, 0.3)" strokeWidth="1" strokeDasharray="4 3" className="anim-hex" />
                <polygon points="60,35 80,45 80,70 60,85 40,70 40,45" fill="rgba(16, 185, 129, 0.08)" stroke="#10b981" strokeWidth="1.5" />
                <path d="M54 60 L60 66 L70 54" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 8px #10b981)' }} />
              </svg>
            </div>

            <div>
              <div className="font-mono" style={{ fontSize: '11px', color: '#10b981', marginBottom: '8px', fontWeight: 700 }}>
                02
              </div>
              <h3 className="font-heading" style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 10px 0' }}>
                Zero Ads & Direct Store Links
              </h3>
              <p className="font-body" style={{ fontSize: '13px', color: '#a1a1aa', margin: 0, lineHeight: 1.6, fontWeight: 300 }}>
                No tracking cookies, no advertising beacons, and no affiliate link shorteners. Every alert links directly to the real, official storefront checkout cart.
              </p>
            </div>

            <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: '3px', backgroundColor: 'rgba(16, 185, 129, 0.2)' }}>
              <div style={{ height: '100%', width: '100%', backgroundColor: '#10b981', transform: 'scaleX(0.3)', transformOrigin: 'left' }} />
            </div>
          </div>

          {/* Card 3: Collection Vault (Neutral & Green Accents) */}
          <div
            className="glass-card feature-vault-card"
            style={{
              borderRadius: '24px',
              padding: '36px',
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              minHeight: '380px',
              transition: 'border-color 0.3s ease',
            }}
          >
            <div style={{ height: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="120" height="120" viewBox="0 0 120 120" style={{ overflow: 'visible' }}>
                <circle cx="60" cy="60" r="10" fill="none" stroke="rgba(16, 185, 129, 0.4)" strokeWidth="1" />
                <g className="anim-orbit">
                  <ellipse cx="60" cy="60" rx="44" ry="18" fill="none" stroke="#10b981" strokeWidth="1.5" transform="rotate(30 60 60)" />
                  <circle cx="95" cy="45" r="3.5" fill="#ffffff" style={{ filter: 'drop-shadow(0 0 6px #10b981)' }} />
                </g>
                <g className="anim-orbit" style={{ animationDirection: 'reverse', animationDuration: '16s' }}>
                  <ellipse cx="60" cy="60" rx="44" ry="18" fill="none" stroke="rgba(16, 185, 129, 0.5)" strokeWidth="1.5" strokeDasharray="3 3" transform="rotate(-30 60 60)" />
                  <circle cx="25" cy="45" r="3" fill="#34d399" />
                </g>
                <circle cx="60" cy="60" r="5" fill="#ffffff" style={{ filter: 'drop-shadow(0 0 10px #10b981)' }} />
              </svg>
            </div>

            <div>
              <div className="font-mono" style={{ fontSize: '11px', color: '#10b981', marginBottom: '8px', fontWeight: 700 }}>
                03
              </div>
              <h3 className="font-heading" style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 10px 0' }}>
                Track What You Save
              </h3>
              <p className="font-body" style={{ fontSize: '13px', color: '#a1a1aa', margin: 0, lineHeight: 1.6, fontWeight: 300 }}>
                Keep tabs on all the free games, DLC, and betas you've collected in one place and watch your total savings add up over time.
              </p>
            </div>

            <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: '3px', backgroundColor: 'rgba(16, 185, 129, 0.2)' }}>
              <div style={{ height: '100%', width: '100%', backgroundColor: '#10b981', transform: 'scaleX(0.3)', transformOrigin: 'left' }} />
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 5 - FAQ: Honest Answers, First Open by Default, Smooth Accordion */}
      <section
        id="faq"
        style={{
          maxWidth: '80rem',
          margin: '0 auto',
          padding: '90px 24px',
          position: 'relative',
          zIndex: 10,
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <h2 className="font-heading" style={{ fontSize: 'clamp(2.4rem, 5vw, 4.2rem)', fontWeight: 700, margin: '0 0 10px 0' }}>
            FREQUENT QUESTIONS.
          </h2>
          <p className="font-body" style={{ fontSize: '15px', color: '#a1a1aa', margin: '0 auto', maxWidth: '600px', fontWeight: 300 }}>
            Straightforward details on how storefront promotions work and how Claimr operates.
          </p>
        </div>

        <div style={{ maxWidth: '48rem', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* FAQ 1: Open by default */}
          <details open className="glass-card" style={{ borderRadius: '16px', padding: '20px 28px', cursor: 'pointer' }}>
            <summary style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="font-heading" style={{ fontSize: '17px', fontWeight: 600, color: '#ffffff' }}>
                Are all listed promotions keep-forever games?
              </span>
              <span className="faq-icon font-mono" style={{ fontSize: '20px', color: '#a1a1aa', transition: 'transform 0.2s' }}>
                +
              </span>
            </summary>
            <p className="font-body" style={{ fontSize: '14px', lineHeight: 1.6, color: '#a1a1aa', margin: '14px 0 0 0', fontWeight: 300 }}>
              Many promotions are permanent keep-forever licenses once claimed during the store's promotional window. However, storefronts also occasionally offer free play weekends, limited trials, beta access, or subscription perks (such as Prime Gaming). Always verify the offer terms directly on the official store checkout page.
            </p>
          </details>

          {/* FAQ 2 */}
          <details className="glass-card" style={{ borderRadius: '16px', padding: '20px 28px', cursor: 'pointer' }}>
            <summary style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="font-heading" style={{ fontSize: '17px', fontWeight: 600, color: '#ffffff' }}>
                Do I need to sign up or input credit card info for Claimr?
              </span>
              <span className="faq-icon font-mono" style={{ fontSize: '20px', color: '#a1a1aa', transition: 'transform 0.2s' }}>
                +
              </span>
            </summary>
            <p className="font-body" style={{ fontSize: '14px', lineHeight: 1.6, color: '#a1a1aa', margin: '14px 0 0 0', fontWeight: 300 }}>
              No. Claimr requires zero registration, zero accounts, and zero billing information. Redemptions occur directly on the official storefront websites (such as Steam, Epic Games, or GOG), where you use your own official store account.
            </p>
          </details>

          {/* FAQ 3 */}
          <details className="glass-card" style={{ borderRadius: '16px', padding: '20px 28px', cursor: 'pointer' }}>
            <summary style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="font-heading" style={{ fontSize: '17px', fontWeight: 600, color: '#ffffff' }}>
                How does Claimr sustain itself without advertisements?
              </span>
              <span className="faq-icon font-mono" style={{ fontSize: '20px', color: '#a1a1aa', transition: 'transform 0.2s' }}>
                +
              </span>
            </summary>
            <p className="font-body" style={{ fontSize: '14px', lineHeight: 1.6, color: '#a1a1aa', margin: '14px 0 0 0', fontWeight: 300 }}>
              Claimr is an independent passion project built by gamers for gamers. We do not sell user data, run advertising networks, or use affiliate link shorteners. The project is sustained entirely through voluntary community coffee donations on Ko-fi.
            </p>
          </details>

          {/* FAQ 4 */}
          <details className="glass-card" style={{ borderRadius: '16px', padding: '20px 28px', cursor: 'pointer' }}>
            <summary style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="font-heading" style={{ fontSize: '17px', fontWeight: 600, color: '#ffffff' }}>
                Why did an offer expire or show a different price for me?
              </span>
              <span className="faq-icon font-mono" style={{ fontSize: '20px', color: '#a1a1aa', transition: 'transform 0.2s' }}>
                +
              </span>
            </summary>
            <p className="font-body" style={{ fontSize: '14px', lineHeight: 1.6, color: '#a1a1aa', margin: '14px 0 0 0', fontWeight: 300 }}>
              Promotional dates, prices, and availability are controlled entirely by each storefront and publisher. Giveaway windows can terminate early without notice, and availability may vary by country or region. We recommend claiming deals as soon as you receive our alert.
            </p>
          </details>

          {/* FAQ 5 */}
          <details className="glass-card" style={{ borderRadius: '16px', padding: '20px 28px', cursor: 'pointer' }}>
            <summary style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="font-heading" style={{ fontSize: '17px', fontWeight: 600, color: '#ffffff' }}>
                How do push notifications work on Android and iOS?
              </span>
              <span className="faq-icon font-mono" style={{ fontSize: '20px', color: '#a1a1aa', transition: 'transform 0.2s' }}>
                +
              </span>
            </summary>
            <p className="font-body" style={{ fontSize: '14px', lineHeight: 1.6, color: '#a1a1aa', margin: '14px 0 0 0', fontWeight: 300 }}>
              On Android, our native APK sends instant device push notifications whenever a new deal is verified. On iOS, you can add Claimr to your Home Screen via Safari to run it as a standalone progressive web app with full push notification support.
            </p>
          </details>
        </div>
      </section>

      {/* FINAL SECTION - Repeated Download Buttons & Community Links */}
      <section
        style={{
          maxWidth: '80rem',
          margin: '0 auto',
          padding: '80px 24px 100px 24px',
          textAlign: 'center',
          position: 'relative',
          zIndex: 10,
        }}
      >
        <h2
          className="font-heading"
          style={{
            fontSize: 'clamp(2.5rem, 5.5vw, 4.8rem)',
            fontWeight: 800,
            color: '#ffffff',
            margin: '0 0 16px 0',
            lineHeight: 1.05,
          }}
        >
          Never leave a free game behind again.
        </h2>
        <p
          className="font-body"
          style={{
            fontSize: '16px',
            color: '#a1a1aa',
            maxWidth: '560px',
            margin: '0 auto 36px auto',
            lineHeight: 1.6,
            fontWeight: 300,
          }}
        >
          Get instant deal alerts across Steam, Epic Games, GOG, PlayStation, Xbox, and more.
        </p>

        {/* Primary Android & Secondary iOS Buttons Repeated */}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '14px', alignItems: 'center', marginBottom: '16px' }}>
          <a
            href="https://github.com/EklavyaAhuja/claimr/releases/latest/download/claimr-v1.3.0.apk"
            download="claimr-v1.3.0.apk"
            className="btn-primary-solid"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 28px',
              borderRadius: '9999px',
              textDecoration: 'none',
              minHeight: '48px',
              cursor: 'pointer',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#09090b">
              <path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.551 0 .9993.4482.9993.9993.0001.5511-.4483.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1521-.5676.416.416 0 00-.5676.1521l-2.0223 3.503C15.5902 8.4126 13.8533 8.081 12 8.081s-3.5902.3315-5.1368.8687L4.8409 5.4467a.4161.4161 0 00-.5677-.1521.4157.4157 0 00-.1521.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.741h24c-.3432-4.0821-2.6889-7.5543-6.1185-9.4196" />
            </svg>
            <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
              <span className="font-heading" style={{ fontSize: '14px', fontWeight: 700, lineHeight: 1.2 }}>
                Download Android APK
              </span>
              <span className="font-mono" style={{ fontSize: '10px', color: '#059669', letterSpacing: '0.04em' }}>
                v1.3.0
              </span>
            </div>
          </a>

          <button
            onClick={() => setShowIosModal(true)}
            className="btn-secondary-outline"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 28px',
              borderRadius: '9999px',
              minHeight: '48px',
              cursor: 'pointer',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 170 170" fill="#ffffff">
              <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.7-3.04-7.59-7.71-11.66-14.01-5.77-8.87-10.29-19.12-13.56-30.74-3.27-11.62-4.9-22.68-4.9-33.17 0-14.34 3.52-26.06 10.56-35.17 7.04-9.11 15.82-13.79 26.34-14.03 4.35 0 9.29 1.15 14.82 3.45 5.53 2.3 9.38 3.56 11.55 3.78 1.95-.22 5.86-1.54 11.72-3.97 5.86-2.43 10.74-3.52 14.65-3.26 11.55.77 20.89 5.38 28.02 13.82-10.22 6.19-15.22 14.77-15 25.74.22 8.68 3.58 15.99 10.08 21.93 6.5 5.94 14.28 9.32 23.34 10.14-2.17 6.4-4.83 12.87-7.98 19.42zM119.22 31.84c0-7.39 2.65-14.24 7.95-20.55 5.3-6.31 11.76-10.42 19.38-12.33-.22 1.52-.39 2.93-.52 4.24-.65 7.17-3.41 13.89-8.29 20.17-4.88 6.28-11.08 10.36-18.6 12.24l.08-3.77z" />
            </svg>
            <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
              <span className="font-heading" style={{ fontSize: '14px', fontWeight: 700, lineHeight: 1.2 }}>
                Add to Home Screen (iOS)
              </span>
              <span className="font-mono" style={{ fontSize: '10px', color: '#a1a1aa', letterSpacing: '0.04em' }}>
                Safari Web App Guide
              </span>
            </div>
          </button>

          <button
            onClick={onLaunchApp}
            className="btn-secondary-outline"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '12px 28px',
              borderRadius: '9999px',
              minHeight: '48px',
              cursor: 'pointer',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.16)',
              color: '#EDEDEB',
            }}
          >
            <span className="font-heading" style={{ fontSize: '14px', fontWeight: 600 }}>
              Launch Web App
            </span>
            <span style={{ fontSize: '14px' }}>→</span>
          </button>
        </div>

        {/* Small Notice */}
        <div style={{ fontSize: '11px', color: '#71717a', marginBottom: '32px' }}>
          Prices, availability, and promotional terms are set by storefronts and may change at any time.
        </div>

        {/* Community & Open-Source Links */}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '14px', alignItems: 'center' }}>
          <a
            href="https://discord.gg/gMATmybhk5"
            target="_blank"
            rel="noreferrer"
            style={{
              backgroundColor: '#5865F2',
              color: '#ffffff',
              padding: '12px 24px',
              borderRadius: '9999px',
              fontFamily: 'Bricolage Grotesque',
              fontSize: '14px',
              fontWeight: 700,
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 0 20px rgba(88, 101, 242, 0.35)',
              minHeight: '44px',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
            <span>Join Discord</span>
          </a>

          <a
            href="https://github.com/EklavyaAhuja/claimr"
            target="_blank"
            rel="noreferrer"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#ffffff',
              padding: '12px 24px',
              borderRadius: '9999px',
              fontFamily: 'Bricolage Grotesque',
              fontSize: '14px',
              fontWeight: 600,
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              minHeight: '44px',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
            <span>GitHub</span>
          </a>

          <a
            href="https://ko-fi.com/eklavyaahuja"
            target="_blank"
            rel="noreferrer"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#ffffff',
              padding: '12px 24px',
              borderRadius: '9999px',
              fontFamily: 'Inter',
              fontSize: '14px',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              minHeight: '44px',
            }}
          >
            <span>☕ Support on Ko-fi</span>
          </a>
        </div>
      </section>

      {/* FOOTER WITH COMPREHENSIVE LEGAL DISCLAIMERS AND POLICY LINKS */}
      <footer
        style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          padding: '60px 24px 44px 24px',
          maxWidth: '80rem',
          margin: '0 auto',
          position: 'relative',
          zIndex: 10,
          fontFamily: 'Inter',
          fontSize: '13px',
          color: '#71717a',
        }}
      >
        {/* Top Footer Row: Brand, Legal Links, Social Links */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '20px',
            marginBottom: '36px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ color: '#ffffff', fontWeight: 700, fontFamily: 'Bricolage Grotesque', fontSize: '15px' }}>
              CLAIMR
            </span>
            <span>· Independent Free Game Radar</span>
          </div>

          {/* Legal Modals Trigger Links */}
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setLegalModal('privacy')}
              style={{ background: 'none', border: 'none', color: '#a1a1aa', padding: 0, cursor: 'pointer', fontSize: '13px' }}
            >
              Privacy Policy
            </button>
            <button
              onClick={() => setLegalModal('terms')}
              style={{ background: 'none', border: 'none', color: '#a1a1aa', padding: 0, cursor: 'pointer', fontSize: '13px' }}
            >
              Terms of Use
            </button>
            <button
              onClick={() => setLegalModal('disclaimer')}
              style={{ background: 'none', border: 'none', color: '#a1a1aa', padding: 0, cursor: 'pointer', fontSize: '13px' }}
            >
              Disclaimer
            </button>
          </div>

          <div style={{ display: 'flex', gap: '20px' }}>
            <a href="https://discord.gg/gMATmybhk5" target="_blank" rel="noreferrer" style={{ color: '#a1a1aa', textDecoration: 'none' }}>
              Discord
            </a>
            <a href="https://github.com/EklavyaAhuja/claimr" target="_blank" rel="noreferrer" style={{ color: '#a1a1aa', textDecoration: 'none' }}>
              GitHub
            </a>
            <a href="https://ko-fi.com/eklavyaahuja" target="_blank" rel="noreferrer" style={{ color: '#a1a1aa', textDecoration: 'none' }}>
              Ko-fi
            </a>
          </div>
        </div>

        {/* Detailed Legal Disclaimer Block */}
        <div
          style={{
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            paddingTop: '28px',
            fontSize: '11px',
            lineHeight: 1.6,
            color: '#52525b',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <p style={{ margin: 0 }}>
            <strong style={{ color: '#a1a1aa' }}>Affiliation Disclaimer:</strong> Claimr is an independent community project and is not affiliated with, endorsed by, or sponsored by Steam, Valve Corporation, Epic Games, GOG, CD PROJEKT, itch.io, Ubisoft, Smilegate (Stove), Alienware, Dell Inc., Amazon.com (Prime Gaming), Sony Interactive Entertainment (PlayStation), Microsoft Corporation (Xbox), or any other game publisher or developer.
          </p>
          <p style={{ margin: 0 }}>
            <strong style={{ color: '#a1a1aa' }}>Trademarks & Artwork:</strong> All trademarks, service marks, logos, brand names, store names, and game promotional artwork belong exclusively to their respective owners and are utilized on this site solely for identification and informational reference purposes.
          </p>
          <p style={{ margin: 0 }}>
            <strong style={{ color: '#a1a1aa' }}>Non-Distribution & Third-Party Store Terms:</strong> Claimr does not host, sell, distribute, or pirate digital games or software. All claims and redemptions happen directly on official storefront checkout pages. Offers, prices, promotional periods, and availability are set exclusively by each storefront and publisher, may change or terminate at any time without notice, and may vary by region, platform, age rating, or account prerequisites. Some offers may require storefront accounts, subscriptions, or memberships (such as Amazon Prime). Claimr does not guarantee that any promotional offer will be active or available when a user visits a link.
          </p>
          <p style={{ margin: 0 }}>
            <strong style={{ color: '#a1a1aa' }}>Privacy & Security:</strong> Claimr does not store storefront passwords or payment details. Contributions made via Ko-fi are purely voluntary donations supporting infrastructure costs and do not purchase games or grant special promotional access.
          </p>
        </div>

        <div style={{ marginTop: '24px', fontSize: '11px', color: '#52525b', textAlign: 'center' }}>
          © 2026 Claimr. Independent community project. Provided "as is" without warranty.
        </div>
      </footer>

      {/* iOS INSTALL INSTRUCTIONS MODAL */}
      {showIosModal && (
        <div
          onClick={() => setShowIosModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            backgroundColor: 'rgba(0, 0, 0, 0.82)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass-card"
            style={{
              width: '100%',
              maxWidth: '460px',
              borderRadius: '24px',
              padding: '28px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.9)',
              position: 'relative',
            }}
          >
            {/* Close Button */}
            <button
              onClick={() => setShowIosModal(false)}
              aria-label="Close modal"
              style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                background: 'rgba(255, 255, 255, 0.08)',
                border: 'none',
                color: '#a1a1aa',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '16px',
              }}
            >
              ✕
            </button>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  flexShrink: 0,
                }}
              >
                <img src="/Icon_Latest.png" alt="Claimr" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <div>
                <h3 className="font-heading" style={{ fontSize: '19px', fontWeight: 700, margin: 0, color: '#ffffff' }}>
                  Install Claimr on iOS
                </h3>
                <p className="font-body" style={{ fontSize: '13px', color: '#a1a1aa', margin: '3px 0 0 0' }}>
                  Add to Home Screen in Safari
                </p>
              </div>
            </div>

            {/* Steps */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: '#10b981', color: '#09090b', fontWeight: 700, fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  1
                </div>
                <div>
                  <div className="font-heading" style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff', marginBottom: '2px' }}>
                    Open in Safari
                  </div>
                  <div className="font-body" style={{ fontSize: '12px', color: '#a1a1aa', lineHeight: 1.5 }}>
                    Open <code style={{ color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '1px 5px', borderRadius: '4px' }}>claimr-app.vercel.app</code> in Safari on your iPhone or iPad.
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: '#10b981', color: '#09090b', fontWeight: 700, fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  2
                </div>
                <div>
                  <div className="font-heading" style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff', marginBottom: '2px' }}>
                    Tap the Share Button
                  </div>
                  <div className="font-body" style={{ fontSize: '12px', color: '#a1a1aa', lineHeight: 1.5 }}>
                    Tap the Share icon <span style={{ color: '#ffffff' }}>[ ⎋ / ↑ ]</span> in Safari's bottom toolbar.
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: '#10b981', color: '#09090b', fontWeight: 700, fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  3
                </div>
                <div>
                  <div className="font-heading" style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff', marginBottom: '2px' }}>
                    Select "Add to Home Screen"
                  </div>
                  <div className="font-body" style={{ fontSize: '12px', color: '#a1a1aa', lineHeight: 1.5 }}>
                    Scroll down the share sheet and select <strong style={{ color: '#ffffff' }}>Add to Home Screen</strong>.
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: '#10b981', color: '#09090b', fontWeight: 700, fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  4
                </div>
                <div>
                  <div className="font-heading" style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff', marginBottom: '2px' }}>
                    Confirm & Enjoy
                  </div>
                  <div className="font-body" style={{ fontSize: '12px', color: '#a1a1aa', lineHeight: 1.5 }}>
                    Tap <strong style={{ color: '#10b981' }}>Add</strong> in the top right. Claimr will launch full-screen like a native app.
                  </div>
                </div>
              </div>
            </div>

            {/* Price Note & Dismiss */}
            <div style={{ fontSize: '11px', color: '#71717a', marginBottom: '16px', lineHeight: 1.4 }}>
              * Promotional offers and prices are determined by storefronts and can change at any time.
            </div>

            <button
              onClick={() => setShowIosModal(false)}
              className="btn-primary-solid font-heading"
              style={{
                width: '100%',
                padding: '13px',
                borderRadius: '12px',
                fontWeight: 700,
                fontSize: '14px',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Got It
            </button>
          </div>
        </div>
      )}

      {/* LEGAL & POLICIES MODAL */}
      {legalModal && (
        <div
          onClick={() => setLegalModal(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass-card"
            style={{
              width: '100%',
              maxWidth: '620px',
              maxHeight: '85vh',
              overflowY: 'auto',
              borderRadius: '24px',
              padding: '32px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.9)',
              position: 'relative',
            }}
          >
            {/* Close Button */}
            <button
              onClick={() => setLegalModal(null)}
              aria-label="Close modal"
              style={{
                position: 'absolute',
                top: '24px',
                right: '24px',
                background: 'rgba(255, 255, 255, 0.08)',
                border: 'none',
                color: '#a1a1aa',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '16px',
              }}
            >
              ✕
            </button>

            {legalModal === 'privacy' && (
              <div>
                <h3 className="font-heading" style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 16px 0', color: '#ffffff' }}>
                  Privacy Policy
                </h3>
                <div className="font-body" style={{ fontSize: '13px', lineHeight: 1.7, color: '#d4d4d8', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <p style={{ margin: 0 }}>
                    <strong>1. No Personal Data Collected:</strong> Claimr does not require an account, username, password, or credit card information. We do not store or process personal identifying details.
                  </p>
                  <p style={{ margin: 0 }}>
                    <strong>2. Local Storage Usage:</strong> Your claimed games vault, hidden deal preferences, and user settings are stored locally on your device via standard browser storage (<code style={{ color: '#10b981' }}>localStorage</code>) and are never sent to external servers.
                  </p>
                  <p style={{ margin: 0 }}>
                    <strong>3. Push Notifications:</strong> If you opt-in to web or Android push notifications, an anonymous subscription token generated by your browser/device is registered with push services exclusively to deliver deal alert notifications. You can unsubscribe at any time in device settings.
                  </p>
                  <p style={{ margin: 0 }}>
                    <strong>4. Third-Party Links & Services:</strong> Claimr links directly to official storefront checkout pages (such as Steam, Epic Games, GOG, itch.io, PlayStation, Xbox, etc.). Those third-party services maintain their own privacy policies. We do not pass tracking parameters or sell browsing data.
                  </p>
                  <p style={{ margin: 0 }}>
                    <strong>5. Contact:</strong> For inquiries regarding this policy or the app, reach out to our team on Discord (<code style={{ color: '#5865F2' }}>discord.gg/gMATmybhk5</code>) or on GitHub (<code style={{ color: '#ffffff' }}>github.com/EklavyaAhuja/claimr</code>).
                  </p>
                </div>
              </div>
            )}

            {legalModal === 'terms' && (
              <div>
                <h3 className="font-heading" style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 16px 0', color: '#ffffff' }}>
                  Terms of Use
                </h3>
                <div className="font-body" style={{ fontSize: '13px', lineHeight: 1.7, color: '#d4d4d8', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <p style={{ margin: 0 }}>
                    <strong>1. Informational Service Provided "As Is":</strong> Claimr is an open-source, community-driven deal discovery tool provided strictly "as is" and "as available", without warranties of any kind, whether express or implied.
                  </p>
                  <p style={{ margin: 0 }}>
                    <strong>2. Storefront Terms Apply:</strong> All game claims, downloads, and redemptions occur solely on official third-party storefronts. Users agree to comply with the terms of service and subscriber agreements of the respective stores when claiming promotions.
                  </p>
                  <p style={{ margin: 0 }}>
                    <strong>3. Limitation of Liability:</strong> In no event shall Claimr, its contributors, or maintainers be liable for missed promotional offers, expired discounts, storefront outages, price changes, or damages resulting from the use or inability to use this service.
                  </p>
                  <p style={{ margin: 0 }}>
                    <strong>4. Acceptable Use:</strong> Users agree not to abuse, disrupt, or excessively scrape Claimr's services, APIs, or infrastructure.
                  </p>
                </div>
              </div>
            )}

            {legalModal === 'disclaimer' && (
              <div>
                <h3 className="font-heading" style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 16px 0', color: '#ffffff' }}>
                  Legal Disclaimer
                </h3>
                <div className="font-body" style={{ fontSize: '13px', lineHeight: 1.7, color: '#d4d4d8', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <p style={{ margin: 0 }}>
                    <strong>Non-Affiliation:</strong> Claimr is an independent software tool and is not affiliated with, endorsed by, sponsored by, or associated with Steam, Valve Corporation, Epic Games, CD PROJEKT (GOG), itch.io, Ubisoft, Smilegate (Stove), Alienware, Dell, Amazon.com (Prime Gaming), Sony Interactive Entertainment (PlayStation), Microsoft Corporation (Xbox), or any publisher or developer.
                  </p>
                  <p style={{ margin: 0 }}>
                    <strong>Intellectual Property:</strong> All game names, trademarks, logos, brand names, and promotional media belong exclusively to their respective copyright and trademark owners. They are used on Claimr under fair nominative use principles for identification and informational comparison only.
                  </p>
                  <p style={{ margin: 0 }}>
                    <strong>Availability & Offer Terms:</strong> Storefront promotions are subject to change, cancellation, or regional restriction by their respective publishers at any time. Claimr does not sell or distribute software and cannot guarantee promotional terms remain valid when you access a store link.
                  </p>
                </div>
              </div>
            )}

            <button
              onClick={() => setLegalModal(null)}
              className="btn-primary-solid font-heading"
              style={{
                width: '100%',
                marginTop: '24px',
                padding: '12px',
                borderRadius: '12px',
                fontWeight: 700,
                fontSize: '14px',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
