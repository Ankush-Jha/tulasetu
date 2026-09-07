---
name: Luminous Fintech
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#434655'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#737686'
  outline-variant: '#c3c6d7'
  surface-tint: '#0053db'
  primary: '#004ac6'
  on-primary: '#ffffff'
  primary-container: '#2563eb'
  on-primary-container: '#eeefff'
  inverse-primary: '#b4c5ff'
  secondary: '#5f5e5e'
  on-secondary: '#ffffff'
  secondary-container: '#e5e2e1'
  on-secondary-container: '#656464'
  tertiary: '#005e6e'
  on-tertiary: '#ffffff'
  tertiary-container: '#00788c'
  on-tertiary-container: '#d7f6ff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea8'
  secondary-fixed: '#e5e2e1'
  secondary-fixed-dim: '#c9c6c5'
  on-secondary-fixed: '#1c1b1b'
  on-secondary-fixed-variant: '#474646'
  tertiary-fixed: '#acedff'
  tertiary-fixed-dim: '#4cd7f6'
  on-tertiary-fixed: '#001f26'
  on-tertiary-fixed-variant: '#004e5c'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 56px
    fontWeight: '700'
    lineHeight: 64px
    letterSpacing: -0.03em
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '600'
    lineHeight: 48px
    letterSpacing: -0.025em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 30px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0em
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0em
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.02em
  metric-display:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '500'
    lineHeight: 40px
    letterSpacing: -0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  space-2xs: 0.25rem
  space-xs: 0.5rem
  space-sm: 0.75rem
  space-md: 1rem
  space-lg: 1.25rem
  space-xl: 1.5rem
  space-2xl: 2rem
  space-3xl: 2.5rem
  card-padding: 1.5rem
  outer-margin: 2rem
  gutter: 1.25rem
---

## Brand & Style
This design system embodies a soft neo-fintech aesthetic centered around clarity, calm authority, and frictionless data observation. Designed for modern analytical dashboards, financial workspaces, and high-velocity management tools, it strips away the harsh visual noise of legacy enterprise software in favor of airy ambient pastels, luminous gradient data visualizations, and pill-shaped floating surfaces.

The visual style blends refined soft minimalism with tactile floating layers:
- **Atmospheric Calm:** Soft periwinkle and lavender tinted backdrops (#EBF0F9) ground the viewport, providing gentle contrast without the clinical glare of pure stark white or the heaviness of dark mode.
- **Floating Crispness:** Crisp pure white (#FFFFFF) container cards emerge with generous internal breathing room, ultra-smooth corner radiuses (16px–24px), and featherweight, diffused periwinkle-tinted shadows.
- **Precision Anchors:** Deep obsidian black pill CTAs (#0A0A0A) establish instant visual hierarchy and clear call-to-action polarity against the soft, pastel surroundings.
- **Luminous Energy:** Data metrics, segmented progress gauges, and chart lines transition smoothly along a signature gradient spectrum—from bright electric cyan (#06B6D4) and mint turquoise (#2DD4BF) through royal blue (#2563EB) and deep indigo-violet (#4F46E5).

## Colors
The palette relies on high-contrast anchors surrounded by delicate atmospheric hues.

### Functional Palette
- **Canvas Base:** `#EBF0F9` (Soft tinted periwinkle-gray page background canvas).
- **Surface Crisp:** `#FFFFFF` (Primary floating cards, popovers, navigation containers).
- **Primary Vibrant:** `#2563EB` (Primary brand accents, active states, key interactive indicators).
- **Primary Dark (Anchor):** `#0A0A0A` (High-contrast pill buttons, primary metric typography, active state icons).
- **Tertiary Accent:** `#06B6D4` (Electric turquoise, used in gradient starts and metric trend highlights).
- **Secondary Accent:** `#4F46E5` (Deep indigo, used in gradient endpoints and specialized trend lines).
- **Success Mint:** `#10B981` / Soft pill `#DCFCE7` (Growth badges, positive delta chips).
- **Borders & Dividers:** `#E2E8F0` (Ultra-subtle structure lines, pill outlines, chart axis baselines).
- **Subtle Foreground:** `#64748B` (Secondary descriptions, dates, non-active tab labels, chart labels).
- **Muted Foreground:** `#94A3B8` (Disabled states, tick marks, tertiary hints).

### Gradient Specifications
- **Metric Gradient (Progress/Gauge):** Linear gradient from `#2DD4BF` (0%) to `#06B6D4` (35%) to `#3B82F6` (70%) to `#4F46E5` (100%).
- **Interactive Glass Callout:** `rgba(255, 255, 255, 0.72)` background with `backdrop-filter: blur(16px)` and border `1px solid rgba(255, 255, 255, 0.8)`.

## Typography
The system uses Plus Jakarta Sans across all typographic roles to preserve geometric clarity, high legibility in numeric dashboards, and an approachable modern voice.

- **KPI Readouts:** Major numeric summaries use `display-xl` (56px) or `metric-display` (32px) with medium-to-bold weights and tight negative tracking (`-0.02em` to `-0.03em`) to keep multi-digit figures compact and punchy.
- **Section Headers & Salutations:** Greeting lines employ `body-md` in muted slate (`#64748B`), stacked immediately above `headline-lg` in `#0A0A0A` for strong hierarchy without redundant borders.
- **Badges & Labels:** Micro-metrics, status tags, and time indicators leverage `label-sm` (11px) with uppercase or title casing and slightly open letter-spacing for crisp legibility against tinted fills.

## Layout & Spacing
The layout relies on a soft-nested card paradigm. The outer application shell rests within a padded desktop stage (`outer-margin: 2rem`), framed by a primary container card with smooth outer corners.

### Grid & Structure
- **Global Canvas:** A high-level 12-column fluid grid system with `1.25rem` (20px) gutters.
- **Sidebar Integration:** An ultra-compact vertical icon rail (`56px` to `64px` width) is placed either detached or seamlessly inside the master card container, keeping content expansive.
- **Horizontal Navigation Island:** Top-level page switching uses a connected or floating horizontal pill row with `0.5rem` internal padding and `0.5rem` gaps between pill triggers.
- **Metric Row Composition:** The standard analytical row distributes 3 to 4 modular stat cards evenly (spans of 3 or 4 columns each), maintaining consistent vertical height and symmetric `card-padding: 1.5rem`.

### Form Factor Adaptability
- **Desktop (≥ 1280px):** Multi-column multi-metric row layouts; side-by-side display of secondary trends (e.g., employee lists alongside task summary chart widgets).
- **Tablet (768px – 1279px):** Stat cards reflow into a 2x2 grid; top pill navigation converts to a horizontally scrollable ribbon with hidden scrollbars.
- **Mobile (< 768px):** Stat cards stack into single columns; outer margins contract from `2rem` to `1rem`; chart widgets preserve horizontal pan with pinned axis values.

## Elevation & Depth
Depth in this system is conveyed through soft ambient daylight illumination rather than heavy structural borders.

- **Canvas Floor (Level 0):** `#EBF0F9` solid background with a faint ambient background grid pattern or soft radial color wash.
- **Master Stage (Level 1):** The overarching dashboard frame has an ultra-diffused drop shadow: `0 20px 40px -15px rgba(100, 116, 139, 0.08)`.
- **Floating Metric Cards (Level 2):** Pure white surfaces `#FFFFFF` with a crisp micro-border (`1px solid rgba(226, 232, 240, 0.6)`) and a delicate shadow: `0 8px 24px -4px rgba(79, 70, 229, 0.04), 0 2px 6px -1px rgba(15, 23, 42, 0.02)`.
- **Frosted Data Overlays (Level 3):** Floating interactive chart markers and inspection popovers use glassmorphism: `background: rgba(255, 255, 255, 0.75)`, `backdrop-filter: blur(12px)`, `border: 1px solid rgba(255, 255, 255, 0.9)`, and shadow `0 12px 28px -6px rgba(37, 99, 235, 0.12)`.
- **Interactive High-Contrast Pills (Level 4):** Primary CTAs `#0A0A0A` maintain a crisp, sharp presence with no downward shadow blur, utilizing only a faint inner rim light (`inset 0 1px 0 rgba(255, 255, 255, 0.15)`) for tactile presence.

## Shapes
The shape language features squircle geometry and continuous curved fillets.

- **Primary Cards & Containers:** Standardized with an extra-smooth `20px` to `24px` radius (`rounded-2xl` to `rounded-3xl`), eliminating sharp intersections.
- **Interactive Elements & Badges:** Buttons, navigation filters, segmented tabs, and avatar chips adopt complete pill silhouettes (`rounded-full` / `9999px`).
- **Data Segment Indicators:** Gauge progress bars feature rounded terminal ends on each individual segment, maintaining continuous pill harmony across technical widgets.
- **Icon Pods & Quick Action Triggers:** Small action triggers (such as top-right arrow links `↗` inside cards) use squircle or circle bounds with `10px` to `12px` corner curvature.

## Components

### 1. Navigation Pill Bar
- **Container:** Enclosed in a shallow rounded border or pill container with transparent or soft white fill.
- **Tab Items:** Fully rounded pill buttons (`px-4 py-2`). Default state has subtle slate icon and text (`#64748B`). Active state receives a pure white card fill with a hairline border `#E2E8F0` and black text `#0A0A0A`.
- **Icons:** Thin `1.5px` stroke linear glyphs paired with `label-md` weight text.

### 2. Primary Buttons (Action CTAs)
- **Visuals:** High-contrast solid `#0A0A0A` pill (`rounded-full`, `px-5 py-2.5`), crisp white typography, paired with a miniature white icon (e.g., download / export tray).
- **Hover/Active:** Subtle scale up (`1.02`), transitioning background smoothly to `#1E1E1E`.

### 3. Metric & Stat Cards
- **Structure:** Floating white card with `20px` border radius, `card-padding: 1.5rem`.
- **Header:** Category icon housed in a soft-tinted circular badge on the left, paired with an outward link icon button (`↗`) aligned to the far right in a subtle `rounded-lg` bounding box.
- **Content:** Card title in `label-md` slate typography, placed directly above a prominent numerical value styled in `metric-display` (`32px`, weight 500, `#0A0A0A`).

### 4. Segmented Rainbow Progress Gauge
- **Structure:** A horizontal sequence of distinct colored segments separated by thin `2px` gaps.
- **Gradient Fill:** Segment 1 (#2DD4BF), Segment 2 (#06B6D4), Segment 3 (#3B82F6), Segment 4 (#6366F1), Segment 5 (#4F46E5).
- **Indicator:** An active pinpoint marker (vertical arrow / diamond indicator) hovering precisely over the target progress threshold, complemented by numeric tick markers underneath in `label-sm`.

### 5. Multi-line Charts & Floating Frosted Callouts
- **Chart Lines:** Smooth Bézier curves with `2.5px` stroke thickness, using cyan (`#06B6D4`), royal blue (`#3B82F6`), and indigo (`#4F46E5`). Under-line gradient fills fade down to `rgba(255, 255, 255, 0)`.
- **Floating Tooltip Callout:** Frosted translucent pill (`rounded-2xl`, `backdrop-filter: blur(16px)`) positioned at data intersection vertices, displaying the primary metric value in bold black text with a supporting muted label beneath.

### 6. Directory / List Items
- **Structure:** Row layouts with transparent hover states.
- **Avatar:** Circular user image (`36px × 36px`) paired with a title (`label-md` `#0A0A0A`) and subtitle (`body-sm` `#64748B`).
- **Trailing Data:** Right-aligned financial or status indicators with primary figures stacked above location or category tags.

### 7. Chips & Delta Badges
- **Visuals:** Compact pill chips (`px-2.5 py-0.5`, `rounded-full`). Positive trend indicators utilize a soft mint fill (`#DCFCE7`) with emerald text (`#15803D`) and a miniature upward arrow. Neutral filter chips utilize soft slate borders with `#64748B` typography.