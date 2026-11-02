---
name: AthleteOS minimal tracker
description: A quiet training journal with a seven-day rhythm
colors:
  green: "#315d48"
  chalk: "#f8f9f6"
  ink: "#24352f"
  muted: "#69736c"
  secondary-text: "#5c6b56"
  sage: "#eaf0e6"
  observation: "#eaf0e2"
  line: "#e2e6df"
  paper: "#ffffff"
  fencing: "#365f49"
  strength: "#486183"
  conditioning: "#8b632d"
  recovery: "#6c6283"
  other: "#626c69"
  focus: "#809f73"
  intensity-light-bg: "#edf2e7"
  intensity-light-text: "#456039"
  intensity-moderate-bg: "#edf0f3"
  intensity-moderate-text: "#425a70"
  intensity-hard-bg: "#f4ecdf"
  intensity-hard-text: "#795524"
  rest-bg: "#eef0ec"
typography:
  setup:
    fontFamily: '"DM Sans Variable", "DM Sans", sans-serif'
    fontSize: "46px"
    fontWeight: 450
    lineHeight: 1.16
    letterSpacing: "-1.6px"
  headline:
    fontFamily: '"DM Sans Variable", "DM Sans", sans-serif'
    fontSize: "38px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-1.2px"
  title:
    fontSize: "16px"
    fontWeight: 550
    letterSpacing: "-0.25px"
  body:
    fontFamily: '"DM Sans Variable", "DM Sans", sans-serif'
    fontWeight: 400
  observation-body:
    fontSize: "13px"
    lineHeight: 1.85
  button:
    fontSize: "14px"
    fontWeight: 550
rounded:
  control: "8px"
  choice: "7px"
  chip: "5px"
  panel: "12px"
spacing:
  small-gap: "8px"
  field-padding: "12px"
  panel-padding: "24px"
components:
  button-primary:
    backgroundColor: "{colors.green}"
    textColor: "{colors.paper}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "12px 21px"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "12px 21px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "{spacing.field-padding}"
  session:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.panel}"
    padding: "21px 23px 0"
  intensity-label:
    rounded: "{rounded.chip}"
    padding: "5px 9px"
  daily-demand:
    rounded: "{rounded.choice}"
    padding: "8px 13px"
  observation:
    backgroundColor: "{colors.observation}"
    rounded: "{rounded.panel}"
    padding: "25px 24px"
---

# Design System: AthleteOS minimal tracker

## Overview

**Creative North Star: "A quiet training journal"**

This active system retains AthleteOS's self-hosted DM Sans and evergreen identity on a chalk workspace. It uses restrained category tints, generous space and familiar labeled controls. Extracted from `src/minimal/tracker.css` and the minimal UI; [MINIMAL_TRACKER.md](MINIMAL_TRACKER.md) covers the current product. The original design document is preserved below as legacy reference.

**Key Characteristics:**

- Calm evergreen actions and chalk/sage surfaces.
- One locally served type family with a restrained weight range.
- Flat session surfaces, visible focus and large controls.

## Colors

Primary green identifies active navigation and main actions. Chalk is the workspace; paper separates session surfaces; ink carries headings. Muted and secondary text support the hierarchy. Sage supports selected/contextual states, while the observation surface has its own light tint. Lines separate days and surfaces. Fencing, strength, conditioning, recovery and other retain distinct category colors, reinforced with text and icons. The same muted sage for Light, slate for Moderate and warm amber for Hard is shared by daily demand, session suggestions, overrides and actual-effort controls. Neutral Rest denotes an empty day, not a fourth intensity. Category and completion status remain separate.

**The Category Context Rule.** Category color accompanies a label or icon; it does not replace the session's type or status text.

## Typography

DM Sans Variable, DM Sans, sans-serif is the display and body stack, served locally. Setup headings use the setup role; page headings use headline; session names use title. Supporting text commonly uses 11–14px and generous line height. Tabular numerals support dates. Mobile setup headings reduce to 39px and page headings to 30px; a 950px breakpoint uses 33px page headings. These are role-specific sizes, not a new global type scale.

## Layout

The header and workspace share a 1160px maximum width with 40px desktop side padding. Desktop content pairs a flexible primary column with a 294px supporting column and a 54px gap; at 1350px the support column becomes 304px and the gap 66px. At 950px the supporting column becomes 260px with a 28px gap. Below 740px, content stacks with 22px side padding. Setup uses a 680px maximum content width.

Today leads with a prominent daily-demand label and visible provisional context; session guidance and actual logging follow. Week shows full daily-demand labels in seven cells; at 1000px and below the grid wraps into four then three cells, including on phone. Session details remain in the agenda, with complete names, plan and actual status/effort retained in accessible day labels. Mobile Week places its strategy after the daily overview and before the agenda. Main controls, chips, icon actions and navigation have at least 44px targets; fields and main buttons normally use 48px.

## Elevation & Depth

Depth comes mainly from white surfaces, pale tints and thin borders. The selected navigation tab has a small shadow (`0 2px 5px #273c2910`); the fixed feedback toast uses `0 7px 24px #20352920`. A disclosed daily-demand explanation uses a local panel shadow (`0 6px 18px #24352f12`). These shadows communicate selected state, temporary feedback or an opened explanation. Background transitions use 160ms ease; the main content's 300ms blur arrival uses `cubic-bezier(0.16, 1, 0.3, 1)`. Reduced-motion preferences disable transitions and animation.

## Shapes

Controls use gently rounded corners, choices are slightly tighter, and session/observation surfaces are broader and softly rounded. Chips are compact rectangles rather than pills. One-pixel borders and day separators keep grouping visible without nested surfaces.

## Components

Primary and secondary buttons share a 48px minimum height, with green fill or a white bordered surface. Hover darkens green or lightly tints the surface. Inputs are white with a thin border, local-font text and 48px minimum height. Keyboard focus uses a 3px green outline with a 4px offset.

Today/Week navigation is a compact segmented header group; the active destination is white with green text. Session rows expose a category icon, title and status. Actual Light/Moderate/Hard choices share semantic tints with the plan. A 2px current-color border and weight 650 mark selected effort or overrides, rather than changing the semantic color. Completed and skipped rows use distinct pale surfaces and explicit status text. Routine chips preserve category color and support individual removal. One weekly strategy uses a pale sage surface with an expandable explanation. Session guidance uses small rounded intensity labels (12px, weight 550), with a native explanation/override disclosure. Compact Week rows keep the intensity and disclosure side by side, expanding details across the row. Plan choices retain 44px targets; actual-effort logging remains a separate control group. Daily badges use 15px type at weight 600, with a 24px Today label (22px on phone) and 12px full labels in the weekly overview. Today visibly includes provisional context; native disclosures explain the relative plan. Duration fields and summaries are absent.

## Do's and Don'ts

- **Do** retain locally served DM Sans and the active evergreen/chalk palette.
- **Do** pair category color with labels and explicit status text.
- **Do** preserve visible keyboard focus and minimum 44px interaction targets.
- **Do** label suggested intensity, personal plan choices and actual effort separately, using the shared Light/Moderate/Hard colors.
- **Do** keep daily demand visually primary, session guidance secondary and Rest neutral.
- **Don't** import the legacy dashboard's density or navigation into this MVP.
- **Don't** add decorative image assets, scores or metric grids to the daily task.

---

# Legacy reference — retained unchanged

The following text describes the previous broader application, including its old palette and dashboard composition. It is not the active token system.

# AthleteOS visual system

Mode: Operate. User delegated design decisions in the explicit brief; code-first app implementation.
Grounded systems considered: fencing club identity; competition program; sports journal; training camp wayfinding; quiet modern training facility; technical apparel label; federation publication. Direction 5 is the quiet modern training facility: dark evergreen navigation, chalk-colored workspace, sage planning area and clean, generously spaced DM Sans. The concept service ran degraded without external challengers; the brief remains authority.

Tokens: evergreen #183c32; ink #202e29; ground #f4f6f4; panel #ffffff; sage #e5eee7; accent #39785b. Category colors distinguish fencing green, strength blue, conditioning amber and mobility violet. Dark theme uses green-black grounds with pale text. Self-host DM Sans for all typography. Normal web controls and familiar navigation; no decorative interface metaphors.

Signature: a compact 42-day competition horizon, with preparation spans and priority markers. First viewport: sidebar, page title and quick actions, phase with rationale, next competition, workload trend, today's plan and recovery. Dashboard uses asymmetric sections rather than a repeated tile grid. Mobile bottom navigation. Modal dialogs protect fast focused entry; larger settings remain inline. Keyboard focus and labels are mandatory.
