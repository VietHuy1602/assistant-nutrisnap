---
name: NutriSnap
description: The Everyday Nutrition Companion — friendly, fresh, encouraging nutrition tools.
colors:
  nutri-green: "#107C41"
  deep-leaf: "#0B522B"
  selected-green: "#F0FDF4"
  emerald-action: "#059669"
  emerald-action-hover: "#047857"
  emerald-tint: "#ECFDF5"
  cool-slate: "#F8FAFC"
  panel: "#FFFFFF"
  ink: "#0F172A"
  muted: "#475569"
  caption: "#64748B"
  subtle: "#94A3B8"
  border: "#CBD5E1"
  divider: "#E2E8F0"
  track: "#F1F5F9"
  calorie-orange: "#EA580C"
  protein-blue: "#2563EB"
  carbohydrate-amber: "#F59E0B"
  over-target-amber: "#D97706"
  fat-violet: "#9333EA"
  error: "#B91C1C"
typography:
  headline:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: "2rem"
    letterSpacing: "-0.025em"
  dashboard-headline:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 800
    lineHeight: "2.25rem"
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: "1.75rem"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
  input:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: "1.5rem"
  button:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: "1.25rem"
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: "1rem"
    letterSpacing: "0.05em"
  metric:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 800
    lineHeight: "2.25rem"
    letterSpacing: "-0.025em"
rounded:
  lg: "0.5rem"
  xl: "0.75rem"
  2xl: "1rem"
  3xl: "1.5rem"
  full: "9999px"
spacing:
  1: "0.25rem"
  1.5: "0.375rem"
  2: "0.5rem"
  2.5: "0.625rem"
  3: "0.75rem"
  3.5: "0.875rem"
  4: "1rem"
  5: "1.25rem"
  6: "1.5rem"
  8: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.nutri-green}"
    textColor: "{colors.panel}"
    typography: "{typography.button}"
    rounded: "{rounded.xl}"
    padding: "0.5rem 0.75rem"
  button-primary-hover:
    backgroundColor: "{colors.deep-leaf}"
  button-secondary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.xl}"
    padding: "0.5rem 0.75rem"
  button-text:
    textColor: "{colors.nutri-green}"
    typography: "{typography.button}"
    rounded: "{rounded.xl}"
    padding: "0.5rem 0"
  input:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    typography: "{typography.input}"
    rounded: "{rounded.xl}"
    padding: "0.625rem 0.875rem"
  choice-selected:
    backgroundColor: "{colors.selected-green}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "0.75rem"
  metric-card:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.3xl}"
    padding: "1.5rem"
  estimate-chip:
    backgroundColor: "{colors.track}"
    textColor: "{colors.muted}"
    rounded: "{rounded.full}"
    padding: "0.25rem 0.625rem"
  navigation-active:
    backgroundColor: "{colors.emerald-tint}"
    textColor: "{colors.nutri-green}"
    rounded: "{rounded.lg}"
    padding: "0.5rem 0.75rem"
---

# Design System: NutriSnap

## Overview

**Creative North Star: "The Everyday Nutrition Companion"**

Friendly, fresh, and encouraging; soft containers with visible progress. NutriSnap groups everyday nutrition tasks into white cards on a pale slate canvas. Green marks actions and selection, while distinct nutrition accents help users recognize calories and macronutrients.

The controls are soft and approachable, with clear actions and visible progress. Depth is layered: small ambient shadows on cards; stronger shadows for overlays. This record describes the incumbent React/Capacitor interface, using the descriptive language confirmed by the user. It does not introduce a redesign or certify native Android compliance.

**Key Characteristics:**
- Green actions and selections against cool neutral surfaces.
- Rounded containers, outlined fields, and compact supporting labels.
- Visible nutrition progress with stable semantic colors.
- Gentle card elevation and stronger overlay separation.

Evidence: `src/frontend/tailwind.config.js`, `src/frontend/src/index.css`, `src/frontend/index.html`, `src/frontend/src/components/MealLogging.module.css`, and the components cited below. Values were extracted from source and resolved Tailwind configuration; rendered screens and Android hardware were not verified in this documentation pass. No visual anti-reference was supplied.

## Colors

The palette combines Nutri Green and Deep Leaf with Cool Slate neutrals and functional nutrition accents. Exact values live in the frontmatter.

### Primary

- **Nutri Green:** brand text, primary meal-flow actions, focus rings, selected navigation text, and choice borders.
- **Deep Leaf:** primary-action hover and supporting text on green-tinted notices.
- **Selected Green:** selected choices and informational meal-flow surfaces.
- **Emerald Action / Emerald Action Hover:** existing dashboard capture and retry actions. These are visibly different from Nutri Green and remain documented as an incumbent variation.
- **Emerald Tint:** logo tiles, navigation selection, and dashboard eyebrow backgrounds.

### Secondary

- **Calorie Orange:** the daily calorie ring at or below target.
- **Protein Blue:** protein progress; blue-tinted tracks and darker blue labels support it.
- **Carbohydrate Amber:** carbohydrate progress fill; darker amber supports labels.
- **Fat Violet:** fat progress; purple-tinted tracks and darker purple labels support it.
- **Over-target Amber:** calorie ring when the daily target is exceeded. This is distinct from the carbohydrate fill.
- **Error:** semantic field-error token. Some older authentication alerts use lighter red utilities; do not describe them as already unified.

### Neutral

- **Cool Slate:** application canvas and subdued field/secondary-button states.
- **Panel:** cards, fields, and the assistant drawer.
- **Ink:** headings and primary content.
- **Muted:** current semantic supporting-text token; **Caption** and **Subtle** also remain in older page copy.
- **Border:** semantic control borders. **Divider:** lighter container boundaries, often rendered with partial opacity. **Track:** quiet progress tracks and estimate chips.

**The Nutrition Meaning Rule.** Keep the implemented nutrient colors tied to their data roles. Exceeding a calorie target uses amber and supportive messaging, rather than an alarming red treatment.

## Typography

**Display and Body Font:** Inter, with system-ui and sans-serif fallbacks. There is no separate display or mono family established by the current implementation. The HTML loads Inter weights 300–700 from Google Fonts; the dashboard requests 800, which may be synthesized. Offline availability of Inter is not guaranteed.

The hierarchy uses weight, compact captions, and clear numerical emphasis. The frontmatter records representative observed combinations; it is not a claim that every screen consumes a shared typography component.

- **Headline:** authentication heading; the dashboard instead uses a responsive heading, moving from the smaller heading size to `dashboard-headline` at the small breakpoint, with weight 800.
- **Title:** subsection headings; some branding and meal-flow headings use the intermediate 1.25rem size.
- **Body:** general task copy. Meal-flow supporting paragraphs sometimes use a roomier 1.5rem line height.
- **Input:** newer shared fields and meal editing. Authentication fields retain the smaller body size.
- **Button:** meal-flow primary and secondary controls. Login uses weight 500; dashboard shortcuts use smaller, bolder labels.
- **Label:** uppercase form labels with wider tracking. Compact captions also use the label size without uppercase styling.
- **Metric:** large calorie values; meal-flow totals use weight 700 with tabular numbers, while the ring uses weight 800.

Bottom navigation captions are an observed exception at 10px; estimate chips use 14px with a 24px line height. These values document current code and are not Android accessibility targets.

## Layout

The shared shell is fluid with an 80rem maximum width, centered horizontally. Horizontal padding changes from 1rem to 1.5rem at 640px and to 2rem at 1024px. Its standard vertical padding is 2rem, with 6rem reserved below content on smaller layouts for fixed navigation. The dashboard adds its own centered 64rem container and padding; do not silently flatten these nested gutters when reproducing it.

Authentication uses a centered 28rem card with 2rem padding. Daily calorie and macro cards stack, then become two columns at 768px. The meal-flow capture/review layout becomes a 1.5:1 two-column grid at 1024px. Spacing follows the inherited Tailwind scale, including half steps; recurring card gaps and padding are 1rem to 1.5rem.

The top navigation remains present on compact layouts and can wrap; labels hide below 640px. A five-position fixed bottom navigation is additionally shown below 1024px, with a raised central capture action. The assistant drawer occupies full dynamic viewport height with a 28rem maximum width.

**The Platform Evidence Rule.** This is the current CSS layout, not proof of native Android behavior. `PRODUCT.md` requires native Android interactions, insets, text scaling, and accessible touch targets. The completed Dashboard, Capture, Assistant and Reports surfaces target 48px controls. Shared nutri-input/nutri-choice and food-swap controls now also target 48px. These CSS measurements are not verified dp measurements. Bottom navigation uses explicit env(safe-area-inset-bottom) spacing. System Back, keyboard clearance, TalkBack, dark theme, and device rendering remain unverified here.

## Elevation & Depth

Layered: small ambient shadows on cards; stronger shadows for overlays. White surfaces, thin slate borders, and subtle background shifts provide most everyday grouping. Metric and login cards use the small ambient shadow; the bottom bar and raised capture circle use medium shadows; the assistant drawer uses the strongest observed overlay shadow.

The exact shadow values live in `.impeccable/design.json`, extracted from the resolved Tailwind theme. Sprint 7 defines shadow-xs and shadow-2xs as compatibility aliases of the existing Tailwind shadow-sm value: 0 1px 2px 0 rgb(0 0 0 / 0.05). The older extracted sidecar is historical and does not include these aliases. Bottom navigation uses a translucent white surface and a 12px backdrop blur. Sidecar color strips use the corresponding inherited Tailwind families; Nutri Green and Deep Leaf strips are synthesized in OKLCH for preview only, not additional application tokens.

## Shapes

Gently rounded controls use the `xl` radius; navigation items and small notices often use `lg`. Authentication and chart cards use `2xl`, while the daily calorie and macro cards use `3xl`. Pills, progress-bar ends, and the capture action use fully rounded geometry. Borders are typically a single CSS pixel; camera placeholders and empty entry areas use dashed boundaries.

Lucide outline icons support labels and actions, typically at 16px or 20px, with larger brand and state icons. Images and camera previews use contained fitting inside bounded, rounded regions.

## Components

### Buttons

Soft and approachable, with clear actions and visible progress. The meal-flow primary uses Nutri Green, white text, the `xl` radius, and Deep Leaf on hover. Its outlined secondary uses Panel, Ink, and Border, with a Cool Slate hover surface. The text variant is green and underlined. All three have a 2.75rem minimum CSS height in the meal flow.

The login submit is full-width with different padding and weight; dashboard shortcuts use Emerald Action. These are existing variants rather than interchangeable canonical values. Meal-flow controls have a two-pixel green focus ring with two-pixel offset. Disabled meal-flow buttons use half opacity and a blocked cursor; login uses 60% opacity.

### Inputs and Choices

The opt-in `.nutri-input` foundation is white, outlined, rounded, and uses the `input` type role with a 2.75rem minimum height. Focus-visible adds a two-pixel Nutri Green ring and offset. Invalid fields change border and focus color to Error; disabled fields use Cool Slate with muted text. Login fields have separate smaller styling and red error utilities.

Choice rows have a rounded border, a leading control, and flexible label content. Selection changes the border to Nutri Green and the background to Selected Green; focus within adds the green ring. Padding grows from 0.75rem to 1rem at 640px. Disabled choices use 60% opacity. Source: `src/frontend/src/index.css`.

### Cards and Containers

Cards group related tasks with rounded white surfaces and slate boundaries. Metric cards use the `metric-card` frontmatter values plus a small shadow and partially transparent Divider border. Authentication cards have larger internal padding; chart cards use 1.25rem. Meal-flow subcards use the smaller control radius and responsive padding. Do not imply that a shared Card component enforces all of these variants.

### Chips and Notices

Estimate chips are quiet slate pills, with compact text and an optional outlined information icon. The preview records the medium chip, with a one-pixel partially transparent border; both variants use 14px text with a 24px line height. Disclaimer notices remain visible near nutrition content. Green informational notices and amber advisory notices use tinted surfaces rather than heavy elevation.

### Navigation

Top navigation uses rounded link surfaces, small outline icons, and green-on-tinted-green selection. Hover adds a pale slate surface; keyboard focus adds a green ring. Compact bottom navigation uses five positions with a raised circular capture action, green active labels, and muted inactive labels. Active ordinary icons increase stroke weight and scale; capture presses scale to 95%. Source: `Navbar.tsx` and `BottomNav.tsx`.

### Nutrition Progress

The calorie ring is a 192px visual with a 128-unit SVG view box, radius 54, ten-unit stroke, and rounded ends. It pairs a prominent remaining-calorie value with a textual consumed/target summary. The role and accessible label describe the numerical status. Macro bars are 10px high with rounded ends and textual consumed/target values alongside the semantic colors.

Ring and bar progress transitions use 500ms ease-out and are removed for reduced-motion preferences in these components. Ordinary color transitions inherit Tailwind's 150ms standard easing. Reduced-motion support is not demonstrated uniformly across all controls.

### Assistant Drawer

The assistant uses a white panel, green-tinted icon tile, bordered controls, and a strong overlay shadow. It is full-height with a compact maximum width, and includes an accessible close action with a visible focus treatment. The sidecar previews representative primitives; it does not recreate the running chat or demonstrate its interaction correctness.

## Do's and Don'ts

### Do:

- **Do** preserve Nutri Green and Deep Leaf for the established brand-action variant.
- **Do** retain the semantic calorie and nutrient colors, visible values, and estimate notices.
- **Do** use the observed rounded controls, white cards, and lighter slate canvas.
- **Do** preserve visible keyboard focus and the implemented reduced-motion progress treatment.
- **Do** distinguish extracted CSS behavior from native Android requirements awaiting device verification.

### Don't:

- **Don't** turn an exceeded calorie target into an alarming red state.
- **Don't** describe Emerald Action and Nutri Green as the same token.
- **Don't** replace missing utility definitions with invented shadow or safe-area values.
- **Don't** present the current light theme, font loading, or compact labels as verified Android accessibility compliance.
- **Don't** introduce a new visual identity while extending this documented incumbent system.

## Implemented UI system — Sprints P1/P2 and 3–7 (2026-10-30)

This section takes precedence over historical preview descriptions above. The live frontend is the source of truth; `.impeccable/design.json` and preview artifacts were not regenerated during the frontend-only sprints.

- **Typography:** Inter/system sans; body and supporting copy generally 14px/24px on completed surfaces; form entry 16px; titles 16–24px; tabular figures for nutrition/date tables. Bottom-navigation captions remain compact exceptions. Shared estimate badges now use 14px/24px in both sizes.
- **Color:** Nutri Green #107C41 and Deep Leaf #0B522B for brand actions/focus; Emerald Action remains an intentional incumbent variant. Muted text #475569, surface #F8FAFC, white panels and border #CBD5E1. Calorie orange, protein blue, carbohydrate amber and fat violet remain unchanged. No global palette replacement was made.
- **Controls:** target minimum 48×48 CSS px for touch actions; shared inputs/choices have a 48px minimum height. Focus uses a 2px Nutri Green ring with a 2px offset, with destructive/error variants where already implemented. Scope styles live in CaptureSurface, AssistantSurface and ReportSurface CSS modules; they intentionally do not rewrite every legacy component.
- **Surfaces:** ordinary cards typically 16px radius, 16–24px padding and small ambient shadows; capture/empty containers sometimes retain 24px radius. Overlays retain stronger shadows. shadow-xs and shadow-2xs now resolve to the existing shadow-sm geometry, rather than remaining undefined.
- **Dashboard/Diary:** selected-date controls persist across states; reference targets are distinguished from personal goals. Diary cards retain safe deletion, wrapping food names, larger calorie values, optional backend macro totals and expandable food rows. No saved-meal edit route is implied.
- **Capture:** complete-image preview, responsive action rows, readable captions/focus, essential nutrition/confirmation before optional voice notes. Existing flow/cleanup limitations remain behavior work.
- **Assistant:** full-height mobile/448px desktop drawer, two-column wrapping suggestions, bounded suggestion/history region, safe-area composer and 48px controls. Existing modal effect covers BottomNav through its background wrapper. AI prompt payloads and confirmation state machine are unchanged.
- **Reports:** readable chart labels, keyboard-focusable table scrolling, wrapped range/month/export controls, and consistent screen-only report typography. `/reports` remains the monthly summary/export experience; `/monthly-report` remains daily nutrition details/printing. Print/export behavior is unchanged.
- **States and accessibility:** existing alerts/status semantics and reduced-motion handling are scoped to completed surfaces. This is not a claim of uniform WCAG conformance. Weight-dialog isolation/Escape, failure-versus-empty report conclusions, Capture recovery, real keyboard insets and native Android behavior remain documented limitations.
