import React, { useState, useEffect, useRef } from 'react';
import { Deal } from '../models/Deal';
import { PRIME_GAMING_CONFIG } from '../config/primeGaming';
import { cleanDisplayTitle, parseDateToMs, getTimeLeft } from '../utils/dealUtils';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EXTENSIBLE HOME SECTIONS ARCHITECTURE GUIDE
 * To add a new section to the Claimr Desktop Home:
 * 1. Define a React component that takes HomeSectionProps (see below).
 * 2. In your component, use design tokens (var(--hl), var(--mu), etc.) and pure typography.
 * 3. Give your section an entry in the HOME_SECTIONS array:
 *    { id: 'yourSectionId', title: 'Your Section Title', component: YourComponent, enabled: true }
 * 4. Sections render in array order. To reorder or disable a section, adjust the array.
 * 5. Every section is automatically wrapped in <Section> which uses IntersectionObserver
 *    to lazy-mount when it scrolls within 200px of the viewport for peak performance.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface HomeSectionProps {
  activeDeals: Deal[];
  claimedDeals: Deal[];
  heroDeal: Deal | null;
  topRatedDeals: Deal[];
  endingSoonDeals: Deal[];
  primeHidden: boolean;
  onHidePrime: () => void;
  onNavigate: (route: string, id?: string) => void;
  renderCard: (deal: Deal, extraMeta?: string) => React.ReactNode;
}

export interface SectionDefinition {
  id: string;
  title: string;
  component: React.ComponentType<HomeSectionProps>;
  enabled: boolean;
}

// ─── Section Lazy Mount Wrapper ──────────────────────────────────────────────
export function SectionWrapper({
  children,
  className = 'sec',
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px 0px' }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section ref={containerRef} id={id} className={className}>
      {isVisible ? children : <div style={{ minHeight: '120px' }} />}
    </section>
  );
}

// ─── 1. Stats / Right Now Section ────────────────────────────────────────────
export function StatsSection({ activeDeals, claimedDeals }: HomeSectionProps) {
  const liveCount = activeDeals.length;
  const claimedCount = claimedDeals.length;
  const toClaimCount = Math.max(0, liveCount - claimedCount);

  const totalValue = activeDeals
    .filter((d) => !d.isEstimated)
    .reduce((sum, d) => {
      const val = typeof d.worth === 'number' ? d.worth : parseFloat(String(d.worth || 0).replace(/[^0-9.]/g, '')) || 0;
      return sum + val;
    }, 0);

  return (
    <SectionWrapper id="home-stats" className="sec">
      <span className="m">Right now</span>
      <div className="stats" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div>
          <b className="s">{liveCount}</b>
          <span className="m">Live right now</span>
        </div>
        <div>
          <b className="s">{toClaimCount}</b>
          <span className="m">To claim</span>
        </div>
        <div>
          <b className="s">{claimedCount}</b>
          <span className="m">Claimed</span>
        </div>
        <div>
          <b className="s">${totalValue.toFixed(2)}</b>
          <span className="m">Total value</span>
        </div>
      </div>
    </SectionWrapper>
  );
}

// ─── 2. Prime Gaming Row Section ─────────────────────────────────────────────
export function PrimeRowSection({ primeHidden, onHidePrime, onNavigate }: HomeSectionProps) {
  if (primeHidden) return null;

  return (
    <div className="prow">
      <a
        href="#prime"
        className="prow-link"
        onClick={(e) => {
          e.preventDefault();
          onNavigate('prime');
        }}
      >
        <span className="ic">P</span>
        <span>
          <span className="s" style={{ fontSize: '24px' }}>
            Prime Gaming
          </span>
          <br />
          <span style={{ color: 'var(--mu)', fontSize: '14px' }}>
            Free games available now
          </span>
        </span>
        <span className="m" style={{ marginLeft: 'auto' }}>
          &rarr;
        </span>
      </a>
      <button
        className="x"
        onClick={onHidePrime}
        aria-label="Hide Prime Gaming row"
        title="Hide Prime notice"
      >
        &times;
      </button>
    </div>
  );
}

// ─── 3. Time Axis / Timeline Section (next 168 hours) ────────────────────────
export function TimelineSection({ activeDeals, claimedDeals, onNavigate }: HomeSectionProps) {
  const claimedSet = new Set(claimedDeals.map((d) => d.id));
  const H = 3600 * 1000;
  const now = Date.now();
  const maxWindow = 168 * H; // 7 days

  const upcomingTimed = activeDeals
    .filter((d) => {
      if (!d.endDate || claimedSet.has(d.id)) return false;
      const end = parseDateToMs(d.endDate);
      const remaining = end - now;
      return remaining > 0 && remaining <= maxWindow;
    })
    .sort((a, b) => parseDateToMs(a.endDate!) - parseDateToMs(b.endDate!));

  if (upcomingTimed.length === 0) return null;

  const getPercent = (deal: Deal) => {
    const end = parseDateToMs(deal.endDate!);
    const diff = Math.max(0, end - now);
    return Math.min(94, Math.max(3, (diff / maxWindow) * 100));
  };

  const isHot = (deal: Deal) => {
    const end = parseDateToMs(deal.endDate!);
    return end - now < 12 * H;
  };

  // Group deals ending within ~12 hours (or within 10% timeline distance) into a single cluster
  interface TimelineCluster {
    id: string;
    deals: Deal[];
    leftPct: number;
    leftStr: string;
    hot: boolean;
  }

  const clusters: TimelineCluster[] = [];
  for (const d of upcomingTimed) {
    const rawPct = getPercent(d);
    const existing = clusters.find((c) => Math.abs(c.leftPct - rawPct) < 10);
    if (existing) {
      existing.deals.push(d);
    } else if (clusters.length < 5) {
      clusters.push({
        id: d.id,
        deals: [d],
        leftPct: rawPct,
        leftStr: getTimeLeft(d.endDate!),
        hot: isHot(d),
      });
    }
  }

  // Enforce minimum visual gap between clusters (20%) so labels NEVER collide
  let lastPct = -25;
  for (const c of clusters) {
    if (c.leftPct < lastPct + 20) {
      c.leftPct = Math.min(84, lastPct + 20);
    }
    lastPct = c.leftPct;
  }

  return (
    <SectionWrapper id="home-timeline" className="sec">
      <span className="m">Ending in the next 7 days</span>
      <div className="tl" tabIndex={0} aria-label="Ending soon timeline">
        {clusters.map((cluster, index) => {
          const isH2 = index % 2 === 1;
          const firstDeal = cluster.deals[0];
          const hasMultiple = cluster.deals.length > 1;
          const tooltip = cluster.deals.map((d) => cleanDisplayTitle(d.title)).join(', ') + ` - ${cluster.leftStr}`;
          const isNearRightEdge = cluster.leftPct > 68 || (index === clusters.length - 1 && cluster.leftPct > 52);

          return (
            <a
              key={cluster.id}
              href={`#game/${firstDeal.id}`}
              className={`tk ${isH2 ? 'h2' : 'h1'} ${cluster.hot ? 'hot' : ''}`}
              style={{ left: `${cluster.leftPct}%` }}
              title={tooltip}
              onClick={(e) => {
                e.preventDefault();
                onNavigate('game', firstDeal.id);
              }}
            >
              <span
                className="lb"
                style={
                  isNearRightEdge
                    ? { left: 'auto', right: '8px', textAlign: 'right' }
                    : { left: '8px', right: 'auto', textAlign: 'left' }
                }
              >
                <span className="s" style={{ fontSize: '14px', fontWeight: 700, display: 'block', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {hasMultiple && isNearRightEdge && (
                    <span style={{ opacity: 0.7, fontSize: '12px', marginRight: '6px' }}>
                      +{cluster.deals.length - 1} more
                    </span>
                  )}
                  {cleanDisplayTitle(firstDeal.title)}
                  {hasMultiple && !isNearRightEdge && (
                    <span style={{ opacity: 0.7, fontSize: '12px', marginLeft: '6px' }}>
                      +{cluster.deals.length - 1} more
                    </span>
                  )}
                </span>
                <span className="m" style={{ display: 'block', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}>
                  {cluster.leftStr}{hasMultiple ? ` (${cluster.deals.length} games)` : ''}
                </span>
              </span>
            </a>
          );
        })}
      </div>
      <div className="axl">
        <span className="m" style={{ left: '0' }}>Now</span>
        <span className="m" style={{ left: '14.3%' }}>1d</span>
        <span className="m" style={{ left: '42.9%' }}>3d</span>
        <span className="m" style={{ right: '0' }}>7d</span>
      </div>
    </SectionWrapper>
  );
}

// ─── 4. Top Rated Section ────────────────────────────────────────────────────
export function TopRatedSection({ topRatedDeals, renderCard }: HomeSectionProps) {
  if (topRatedDeals.length === 0) return null;

  return (
    <SectionWrapper id="home-top-rated" className="sec">
      <span className="m">Top rated</span>
      <div className="grid">
        {topRatedDeals.map((d) =>
          renderCard(
            d,
            d.steamRatingPercent ? `★ ${d.steamRatingPercent}% Steam` : '★ Top rated'
          )
        )}
      </div>
    </SectionWrapper>
  );
}

// ─── 5. Ending Soon Section ──────────────────────────────────────────────────
export function EndingSoonSection({ endingSoonDeals, renderCard }: HomeSectionProps) {
  if (endingSoonDeals.length === 0) return null;

  return (
    <SectionWrapper id="home-ending-soon" className="sec">
      <span className="m">Ending soon</span>
      <div className="grid">
        {endingSoonDeals.map((d) =>
          renderCard(d, d.endDate ? getTimeLeft(d.endDate) : undefined)
        )}
      </div>
    </SectionWrapper>
  );
}

// ─── REGISTRY: All home sections in display order ────────────────────────────
export const HOME_SECTIONS: SectionDefinition[] = [
  {
    id: 'stats',
    title: 'Stats / Right Now',
    component: StatsSection,
    enabled: true,
  },
  {
    id: 'prime-row',
    title: 'Prime Gaming Row',
    component: PrimeRowSection,
    enabled: true,
  },
  {
    id: 'timeline',
    title: 'Time Axis (7 Days)',
    component: TimelineSection,
    enabled: true,
  },
  {
    id: 'top-rated',
    title: 'Top Rated',
    component: TopRatedSection,
    enabled: true,
  },
  {
    id: 'ending-soon',
    title: 'Ending Soon',
    component: EndingSoonSection,
    enabled: true,
  },
];
