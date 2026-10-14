# LootQuest Visual Redesign — Design Spec

## Macrostructure / Theme / Style
- **Hallmark macrostructure:** Aurora — premium loot hunt. A glowing, playfully powerful free-game feed read against a dark-space canvas.
- **ui-ux-pro-max style:** Aurora UI / Gradient Mesh — flowing northern-lights gradients, iridescent color, dark-first, high contrast. NOT terminal brutalism, NOT neon-slop, NOT generic dark SaaS.

## Concept
LootQuest is a night-sky loot hunt. Screens float over an ambient animated aurora backdrop; cards are rounded, softly elevated panels that feel touchable. Data readouts stay crisp in JetBrains Mono while everything else speaks in Inter. Status and urgency glow like neon signs on the dark sky.

---

## Color Tokens (see `src/theme/theme.ts` — single source of truth)

```
BASE LAYER — deep space
  Background:         #0B0E14 (deep space black — also the aurora base)
  Surface:            #13161D (cards)
  Surface Raised:     #1A1E27 (modals, tab bar, elevated panels)
  Border:             #252A34 (subtle dividers)
  Border Active:      #6C5CE7 (indigo — interactive focus)

AURORA ACCENTS (flowing mesh palette)
  Indigo:             #6C5CE7 (primary — vibrant indigo)
  Violet:             #8B5CF6
  Blue:               #3B82F6
  Teal:               #00D2A0 (success — loot green)
  Rose:               #FF6B6B (warning/urgency)

PRIMARY ACCENT — Indigo (the premium signal)
  Primary:            #6C5CE7
  Primary Muted:      rgba(108, 92, 231, 0.15)
  Primary Text:       #A29BFE

TEXT
  Text Primary:       #F0F0F0 (headlines, primary content)
  Text Secondary:     #8B8FA3 (descriptions, metadata)
  Text Muted:         #5A5E72 (labels, timestamps)

PLATFORM COLORS (hallmark — muted, no status collisions)
  Steam:              #1B3A57   → text #7FA8DC
  Epic Games:         #1B4D3E   → text #4CAF7D
  GOG:                #4D2A33   → text #C78FA6
  Itch.io:            #8B5E3C   → text #D9A066
  PlayStation:        #1A3A5C   → text #7FA8DC
  Xbox:               #107C10   → text #66BB6A
  Nintendo:           #E60012   → text #FF9AA0
  Mobile / Web:       #2A2E3D   → text #8B8FA3
  Other:              #252A34   → text #8B8FA3

STATUS GLOW RULES (urgency signal on top of the panel)
  High worth:       Indigo glow — SHADOWS.floating (indigo-tinted)
  EXPIRING_SOON:    Rose glow — rgba(255, 107, 107, 0.2)
  Normal/Active:    No glow
  Claimed:          Dimmed (Vault archive treatment)
  EXPIRED:          Dimmed to 0.5 opacity, warningLight badge
```

---

## Typography

```
HEADINGS — Inter
  H1 (screen title):   Inter 800 ExtraBold, 26px, #F0F0F0, letter-spacing -0.5
                       Feed header rendered as an indigo gradient (text→accent)
  H2 (section):        Inter 700 Bold, 20px, #F0F0F0
  H3 (card title):     Inter 700 Bold, 16px, #F0F0F0

DATA — JetBrains Mono (EVERY number/status/readout)
  Data Large:          JetBrains Mono 700, 16px, #F0F0F0 or indigo
  Data Medium:         JetBrains Mono 400, 13px, #8B8FA3
  Data Small:          JetBrains Mono 400, 11px, #5A5E72
  Used for:            prices, worth, countdown timers, platform labels,
                       claim counts, timestamps, status text, badges

BODY — Inter
  Body:                Inter 400, 14px, line-height 1.5
  Secondary:           Inter 400, 13px, #8B8FA3
```

---

## Shape Language

```
RADIUS (src/theme/theme.ts)
  Cards:           16 (RADIUS.lg) — panels: 20 (RADIUS.xl) — buttons: pill (999)
  Touch targets:   minimum 44pt

SHADOWS (real, no-op-free)
  card:      #000 0 2 rgba 0.3 radius 8, elevation 3
  elevated:  #000 0 8 rgba 0.5 radius 24, elevation 8  (modals, tab bar)
  floating:  #6C5CE7 0 4 rgba 0.2 radius 16, elevation 6 (CTAs, glow)
```

---

## Aurora Background — `AuroraBackground.tsx`

```
Ambient animated northern-lights backdrop rendered once at App root.
  Base:      LinearGradient #0B0E14 → #0E1120 → #0B0E14
  Blobs:     react-native-svg RadialGradient circles in
             indigo (380), violet (340), teal (300), blue (260) —
             slowly drifting + rotating via Animated (native driver)
  Stars:     Twinkling starfield overlay
  pointerEvents: none — pure backdrop
Every screen container sets backgroundColor: 'transparent' so the aurora
shows through. Detail modal gets its own AuroraBackground instance.
```

---

## Components

### BouncyPressable
```
Spring scale 1 → 0.98 on press-in; border color interpolates to
COLORS.borderActive (indigo) while pressed. Default radius RADIUS.md,
SHADOWS.card. Used for all pressable panels/buttons/CTAs.
```

### CartoonCard
```
LinearGradient fill #13161D → #141924, radius RADIUS.lg (16), SHADOWS.card.
statusGlow: high = primary (indigo), urgent = warning (rose), glow radius 14.
Platform identity + status urgency remain two separate channels:
  Signal 1 — PLATFORM BORDER: hairline in platform color (identity)
  Signal 2 — STATUS GLOW: indigo/rose outer glow (urgency)
```

### HourglassLoader
```
Aurora "loot orb": pulsing halo + orbiting ring with a teal dot +
indigo→violet→blue gradient orb. Replaces the old hourglass.
```

### StoreIcon
```
Ionicons glyphs (see mapping below), single consistent weight.
Default color #8B8FA3 (inactive) or platform color (active/highlighted).
Sizes: 14 inline · 20 navigation · 28 headers.

PLATFORM ICON MAPPING — one visually distinct glyph per platform
  Steam:              hardware-chip-outline
  Epic Games:         cube-outline
  GOG:                diamond-outline
  itch.io:            flame-outline
  PlayStation:        logo-playstation
  Xbox:               logo-xbox
  Nintendo:           game-controller-outline
  Mobile:             phone-portrait-outline
  Web:                globe-outline
  Other:              ellipsis-horizontal-outline

STATUS ICONS
  Live:               pulse-dot (animated, teal — only animated element)
  Expired:            remove-outline (dash)
  Claimed:            archive-outline (box with lid)
  Expiring Soon:      time-outline (clock)
```

---

## Screen-Specific Rules

### HomeScreen (feed — used by App)
- Screen title: "Free Games" in Inter 800 with an indigo gradient (text→accent)
- Greeting line: "Guest · hunting drops for you" (mono, muted)
- Hero card: RADIUS.xl panel over aurora, hero overlay LinearGradient
  rgba(11,14,20,0) → rgba(0.4) → rgba(0.95), worth readout in accent
- Game cards: CartoonCard panels, data in JetBrains Mono
- Platform filter: pill chips, active = indigo fill/border
- Live pill: pill radius with teal dot

### VaultScreen
- Stats row: mono tally — claimed / total value / active
- Claimed items: dimmed archive panels (Vault archive treatment)
- Empty state: shield-checkmark in indigo over aurora

### AlertsScreen
- Rounded cards (RADIUS.lg) over aurora
- Each alert: timestamp in mono, message in Inter
- Urgency via card color (teal/indigo tint) + live teal pulse dot on new items
- Claimed alerts tinted accent

### SettingsScreen
- Rounded grouped cards over aurora
- Toggles: indigo active state
- Labels/values: JetBrains Mono for all setting values
- Avatar: 28px circular indigo badge, name in Inter 800
- Danger actions (wipe data): rose-tinted button

### DetailScreen
- Hero image full-bleed with LinearGradient overlay (0 → 0.3 → 0.92)
- Data panel: worth, platform, expiry — all JetBrains Mono
- Back button: 44px circular, rgba(19,22,29,0.85) glass over hero
- CTA button: indigo, pill radius, SHADOWS.floating glow
- EXPIRING_SOON badge: warningLight bg + warning text

### OnboardingScreen
- Both steps wrapped in AuroraBackground
- Icon circles: indigo→violet gradient (sparkles / person icons)
- CTA buttons: pill radius, indigo fill
- Active dot: 24px wide pill

---

## Tab Bar (App.tsx)
```
Floating pill over aurora: rgba(26,30,39,0.92), radius RADIUS.xl,
border #252A34, SHADOWS.elevated. Active tab = indigo pill fill.
Alert badge: rose (#FF6B6B) pill with mono count.
```

---

## Explicitly Forbidden

- Amber/gold terminal palette, hard 2-4px beveled corners, no-shadow panels
- SpaceMono / Plus Jakarta Sans (superseded by JetBrains Mono / Inter)
- Using `FONTS.monoRegular` or any font key not present in `src/theme/theme.ts`
- Broken CSS-style `background` shorthand on gradients (use LinearGradient)
- Flat/opaque screen backgrounds that hide the aurora
- No-op shadow styles (`shadowOpacity: 0` or missing offsets)
- Glassmorphism or frosted-glass effects as a primary surface treatment
- Neon glow applied uniformly (must have hierarchy)
- Standard hard-edged bottom tab bar
- Re-introducing the old `modalSafeArea` View (Detail modal wraps in AuroraBackground instead)

---

## Coverage Status Bar

Small persistent row showing which sources are being watched:
```
STEAM:ON  EPIC:ON  GOG:ON  itch:ON  Reddit:ON  PS:ON  Xbox:ON
```
JetBrains Mono 400, 10px, #5A5E72 — rendered as a subtle status line.
