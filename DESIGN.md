---
name: strongsuit
description: A CLI landing as a menswear lookbook; gold on near-black with cream paper spec strips.
colors:
  ink: "#0d0c0a"
  ink-light: "#14120f"
  gold: "#e0a82e"
  gold-deep: "#b28414"
  paper: "#f3ecdc"
  paper-ink: "#221d14"
  text-primary: "#efe9db"
  text-muted: "rgba(239, 233, 219, 0.82)"
  text-quiet: "rgba(239, 233, 219, 0.6)"
  thread: "rgba(224, 168, 46, 0.28)"
  hair: "rgba(243, 236, 220, 0.16)"
typography:
  display:
    fontFamily: "Bodoni Moda, Georgia, serif"
    fontSize: "clamp(2.7rem, 12vw, 10.5rem)"
    fontWeight: 800
    lineHeight: 0.92
    letterSpacing: "0.005em"
  tagline:
    fontFamily: "Bodoni Moda, Georgia, serif"
    fontSize: "clamp(1.4rem, 3.2vw, 2.4rem)"
    fontWeight: 500
    fontStyle: italic
    lineHeight: 1.2
  headline:
    fontFamily: "Bodoni Moda, Georgia, serif"
    fontSize: "clamp(1.7rem, 3.5vw, 2.6rem)"
    fontWeight: 700
    lineHeight: 1.05
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(1rem, 1.35vw, 1.15rem)"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.78rem"
    fontWeight: 600
    letterSpacing: "0.22em"
    textTransform: uppercase
  mono:
    fontFamily: "ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "0.86rem"
    lineHeight: 1.55
spacing:
  sm: "1.1rem"
  md: "1.6rem"
  lg: "2.2rem"
  xl: "clamp(3rem, 9vh, 5.5rem)"
  padding-edge: "clamp(1.25rem, 5vw, 4rem)"
rounded:
  sm: "3px"
components:
  button-primary:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.ink}"
    padding: "0.95rem 2.2rem"
    rounded: "{rounded.sm}"
  button-primary-hover:
    backgroundColor: "#f0bd4a"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-primary}"
    padding: "0.2rem 0"
  link-underline:
    textColor: "{colors.text-primary}"
    borderBottom: "1px solid {colors.thread}"
    padding: "2px 0"
  link-underline-hover:
    textColor: "{colors.gold}"
    borderBottom: "1px solid {colors.gold}"
  card-spec:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.paper-ink}"
    padding: "1.4rem 1.5rem 1.1rem"
    borderWidth: "1px solid rgba(34, 29, 20, 0.3)"
---

# Design System: strongsuit

## Overview

**Creative North Star: "The Menswear Lookbook"**

The strongsuit landing is designed as a fashion collection lookbook, treating agent customization like tailored suiting. The visual world is deliberately print-influenced: near-black grounds anchor gold accents that own complete sections, cream paper spec strips mimic garment tags, and a single typeface pairing (Bodoni Moda + Archivo) carries both editorial presence and functional clarity. The form refuses the dark-SaaS formula (hero + six feature cards) in favor of a narrative sequence of three numbered "Looks" showing real usage patterns, with a front-and-center "care label" stating honest limits before features. Flat surfaces, hairline borders, and tonal layering replace shadows—a print grammar applied to web.

**Key Characteristics:**
- Print-influenced grid and fabric treatment (spec strips as garment tags)
- Gold accent is precious and rare (~10% of surface area)
- Two-tone structure: dark backgrounds with cream spec strips, or full-spread gold sections
- Honest-limits-first content ordering (care label before features)
- Fluid typography that scales with viewport; no fixed breakpoints in the type itself

## Colors

The palette is built on two committed pairs: ink and paper for text and structure, gold and dark for emphasis and dominance. Gold (#e0a82e) is the single brand accent; it is never neutral.

### Primary
- **Bullion Gold** (#e0a82e): The one accent color. Used on taglines, section labels, underlines, buttons, and as full-spread backgrounds in alternating Looks. Approximately 10% of any surface area.
- **Deep Gold** (#b28414): Darker variant for button hover states, subtle emphasis where the base gold would compete.

### Neutral
- **Near-Black** (#0d0c0a): Default ground color. Text on this background uses off-white (#efe9db).
- **Lighter Near-Black** (#14120f): Used for terminal blocks (`.lb-term`) to create depth hierarchy within dark sections without breaking the print aesthetic.
- **Cream Paper** (#f3ecdc): Spec strip backgrounds (the garment-tag detail). All type on cream uses paper-ink.
- **Paper Ink** (#221d14): Text on cream. Darker than primary text to maintain crisp contrast on light ground.
- **Text Primary** (#efe9db): Default text color on dark backgrounds. Warm cream tone, not pure white.
- **Text Muted** (rgba(239, 233, 219, 0.82)): For supporting text, captions, and lighter prose.
- **Text Quiet** (rgba(239, 233, 219, 0.6)): Footer and very subtle secondary content.
- **Thread** (rgba(224, 168, 46, 0.28)): Subtle gold at 28% opacity. Used on borders and dividers to suggest gold presence without claiming attention.
- **Hair** (rgba(243, 236, 220, 0.16)): Hairline borders and dividers on dark backgrounds; the cream at 16% opacity.

### Named Rules

**The Rare Accent Rule.** Gold is strategic, not ambient. It lives in section labels, taglines, CTA buttons, and as full-spread backgrounds (Looks 02, for instance). Nowhere else. The rarity keeps it memorable and signals genuine interaction points.

**The Spec-Strip Rule.** Cream paper sections (the care label, spec metadata in the looks) are always visually separated as horizontal bands with dashed left/right borders, mimicking garment labels. These break the dark-gold pattern and introduce a distinct, supporting voice.

## Typography

**Display Font:** Bodoni Moda (serif, Didone style)
**Body Font:** Archivo (sans-serif, geometric)
**Mono Font:** ui-monospace system stack (SF Mono, Menlo, Consolas)

**Character:** Bodoni Moda brings editorial authority and menswear-catalog gravity. Archivo provides clean, tracked labels and functional clarity. The pairing is unapologetic about its print heritage; it leans into formality, not friendliness. Mono is restricted to terminal examples and code snippets—never used for UI labels or body prose.

### Hierarchy
- **Display** (Bodoni Moda, 800, clamp(2.7rem, 12vw, 10.5rem), line-height 0.92): The "STRONGSUIT" masthead. Fills viewport width on first load; compresses on mobile. Used only once per page.
- **Tagline** (Bodoni Moda, 500 italic, clamp(1.4rem, 3.2vw, 2.4rem), line-height 1.2): "Dress your agent for the occasion." Gold color. Below the masthead.
- **Headline** (Bodoni Moda, 700, clamp(1.7rem, 3.5vw, 2.6rem), line-height 1.05): Section titles ("Look 01 Coding", "The fitting", "Availability"). Scales fluidly; gold accent on label above (`.lb-look-kind`).
- **Body** (Archivo, 400, clamp(1rem, 1.35vw, 1.15rem), line-height 1.6): Prose paragraphs (`.lb-look-copy`, `.lb-standfirst`). Max width 68ch for readability. Warm cream (#efe9db) on dark.
- **Label** (Archivo, 600, 0.78rem, letter-spacing 0.22em, uppercase): Section category labels ("Look 01", "Coding", "Care label"). Always gold on dark, or dark on cream/gold backgrounds.

### Named Rules

**The Typeface Commitment Rule.** Bodoni Moda is non-negotiable for display and primary headlines. It carries the editorial voice and print identity. Archivo is the workhorse; all UI labels, body prose, and functional text use it (never mixing serif for body). Mono is reserved for code blocks and terminal output—never for prose or labels.

**The Fluid Scale Rule.** All display and headline sizes use `clamp()` with viewport-responsive minimums and maximums. No media-query breakpoints for type. Labels and body prose are similarly fluid to maintain rhythm across all viewport sizes.

## Layout

The layout is two-tier: a masthead section that fills the viewport, followed by a sequence of full-width bands (each with its own background color and padding). Content maxes out at 68ch for prose readability but allows full-width hero and spec sections.

### Structure
- **Top bar** (`.lb-bar`): Fixed flexbox, `space-between`. Left: logo + wordmark. Right: nav links (Docs, GitHub). Border-bottom hairline in cream at 16% opacity.
- **Cover** (`.lb-cover`): Full viewport height on first load (clamp(3rem, 8vh, 6rem) vertical padding). Centered content with masthead, tagline, standfirst, CTA, and logo positioned absolute bottom-right.
- **Looks grid** (`.lb-look`): Two-column grid (minmax(0, 1.6fr) minmax(15rem, 1fr)) with 4vw gap on larger screens. Left column: body copy + terminal block. Right column: spec strip (`.lb-spec`). On <860px, stacks to single column.
- **Spec strip** (`.lb-spec`): Cream-paper card with dashed side borders, anchor dot at top center. Internal padding 1.4rem 1.5rem. Sits at `align-self: start` to pin to top of its grid cell.
- **Terminal blocks** (`.lb-term`): Monospace, dark ink-2 background, cream text, gold-thread border. Padding 1.1rem 1.3rem. Max-width 44rem (normal) or 56rem (wide variant). Inline code retains the cream ink while sitting in dark background.
- **Edge padding:** All sections use `clamp(1.25rem, 5vw, 4rem)` for responsive left/right margins. Vertical padding varies by section: `clamp(3rem, 9vh, 5.5rem)` for major sections.

### Responsive Behavior
- **860px and below:** Look grids stack to single column. Spec strip width capped at 26rem. Logo moves from absolute to static (96px width).
- **480px and below:** Navigation gap tightens (1.1rem). CTA button shrinks padding (0.85rem 1.6rem). Terminal blocks reduce font-size (0.78rem) to fit narrow screens.

### Density & Spacing
- **Vertical rhythm:** Sections separated by hairline borders (1px cream at 16% opacity). Content gaps use `clamp()` values that scale with viewport.
- **Grid gaps:** 4vw between text and spec strips (clamped 1.5rem–4rem).
- **List items:** No bullets. Dashed top/bottom borders separate items within spec strips and care label.

## Elevation & Depth

This system uses **flat surfaces with tonal layering; no shadows.** Depth is conveyed through background color changes, hairline borders, and strategic use of opacity. The print aesthetic forbids `box-shadow` entirely.

### Depth Hierarchy
1. **Primary ground:** Near-black (#0d0c0a), used for most background content.
2. **Secondary layer:** Lighter near-black (#14120f) for terminal blocks, creating visual separation without breaking the dark palette.
3. **Accent layers:** Gold (#e0a82e) for full-spread sections (alternating Looks), and cream paper (#f3ecdc) for spec strips and care label.
4. **Borders:** Hairline rules (1px) in cream at 16% opacity separate sections. Gold at 28% opacity borders terminal blocks.

### Named Rules

**The No-Shadow Rule.** The system is entirely flat. Depth comes from background color change, opacity variation, and hairline borders—the print grammar of a lookbook. Hover states on buttons use `transform: translateY(-1px)` for a subtle lift, but never `box-shadow`.

**The Hair-Border Rule.** Section dividers and subtle boundaries are 1px solid in cream at 16% opacity (`rgba(243, 236, 220, 0.16)`). Stronger accent borders use gold at 28% opacity. No gradient or feathered edges.

## Shapes

The form language is rectilinear and architectural—no organic curves. Corners are either sharp (0px radius) or minimal (3px for inline code only). The recurring garment-tag motif (spec strips with dashed side borders and center anchor dot) is the signature shape detail.

### Corner Treatment
- **Sharp corners:** Default for all major containers (sections, cards, terminal blocks).
- **Minimal rounding:** 3px only on inline code tags (`.lb code`) and in one hover state. No broader radius vocabulary.
- **No curves:** Headlines, buttons, and containers have 0px radius.

### Spec Strip Detail
- **Border:** 1px solid cream with transparency. Left and right sides use dashed pattern. Top and bottom use solid line.
- **Anchor dot:** 7px circle, positioned absolute at top-center, inset 0.65rem. Suggests the safety pin of a garment tag.
- **Padding & spacing:** Internal padding 1.4rem 1.5rem 1.1rem; margin between spec header and content varies.

### Print Rules
- **Hairline rules:** 1px borders only; 2px maximum is never used.
- **Dashed details:** Dashed borders appear only on spec strips (the garment tag) to emphasize their function as "printed tags."
- **Grid alignments:** Large background numbers (look labels like "01", "02", "03") positioned absolute with massive font-size (clamp(5rem, 16vw, 13rem)) and 12% opacity. They sit behind content as watermark-style depth.

## Components

### Buttons
- **Character:** Bold, uppercase, tracked. Always use the gold background on dark to command attention. Minimal padding, not a large touch target.
- **Primary** (`.lb-btn`): Gold background, ink text, 0.95rem 2.2rem padding, letter-spacing 0.12em, uppercase, font-weight 700, font-size 0.9rem. Transition on background and transform (160ms cubic-bezier).
- **Primary Hover:** Background shifts to lighter gold (#f0bd4a); transform translateY(-1px). No shadow, no border change.
- **Ghost** (`.lb-quiet`): Transparent background, text-primary color, gold underline (1px solid thread), 0.82rem font-size. Used for secondary CTAs ("Read the source").
- **Ghost Hover:** Text and border shift to gold. Same cubic-bezier timing as primary button.
- **Focus Visible:** 2px solid gold outline, 3px offset. On gold backgrounds, outline shifts to ink.

### Links & Underlines
- **Default:** Text inherits current color, bottom border 1px solid thread (subtle gold at 28%), padding-bottom 2px. Used in navigation and footer.
- **Hover:** Text and border shift to gold. Gold underline is the only underline visible at rest (kept subtle via thread opacity).

### Spec Strips (`.lb-spec`)
- **Background:** Cream paper (#f3ecdc).
- **Text:** Paper-ink (#221d14).
- **Border:** 1px solid rgba(34, 29, 20, 0.3); dashed on left and right, solid on top and bottom.
- **Anchor dot:** Absolute 7px circle, top-center, 0.65rem inset, 1px solid border.
- **Head:** Uppercase label, 0.72rem, 700 weight, 0.26em letter-spacing. Centered. Bottom border cream at 25% opacity separates head from content.
- **Content:** Definition list with dashed row dividers. Right-aligned values.
- **Note:** Italicized fine print at bottom, centered, smaller type (0.85rem), cream at 65% opacity.

### Terminal Blocks (`.lb-term`)
- **Background:** Lighter near-black (#14120f).
- **Text:** Cream (#e6dfcd).
- **Border:** 1px solid thread (gold at 28% opacity).
- **Padding:** 1.1rem 1.3rem.
- **Font:** Monospace system stack, 0.86rem, line-height 1.55.
- **Max-width:** 44rem (normal) or 56rem (`.lb-term--wide`).
- **Code inside:** No background highlight, inherit font-size, no padding.
- **Overflow:** Horizontal scroll on narrow screens.

### Navigation (`.lb-nav`)
- **Layout:** Flex row with 1.75rem gap.
- **Items:** 0.78rem uppercase, 600 weight, 0.14em letter-spacing. Transparent background, inherit text color.
- **Underline:** 1px transparent at rest, sits 2px below text. On hover/focus-visible, underline becomes gold.

### Logo & Wordmark (`.lb-mark`)
- **Font:** Bodoni Moda, 1.35rem, 700 weight, 0.01em letter-spacing.
- **Color:** Defaults to text-primary (#efe9db). `<span>` inside (the word "suit") is gold.
- **Position:** Left side of top bar. Text decoration none (link element).

## Do's and Don'ts

### Do:
- **Do** use Bodoni Moda for all display and headline copy. Its Didone weight carries the editorial voice.
- **Do** use gold for strategic accents only: section labels, taglines, CTA buttons, and as full-spread background colors on alternating Looks. Never more than ~10% of any surface.
- **Do** add hairline borders (1px) in cream at 16% opacity to separate major sections and create vertical rhythm.
- **Do** use the spec strip (cream paper card with dashed borders and anchor dot) for metadata and supporting detail. It is the signature component.
- **Do** keep prose max-width at 68ch for readability. Use `clamp()` for all type sizes to maintain fluid scaling across viewports.
- **Do** use cream (#efe9db) for text on dark backgrounds, not pure white. It pairs with the gold and warm paper tones.
- **Do** apply the one authored motion moment: looks settle in on scroll via `animation-timeline: view()` with a subtle opacity and translateY. Respect `prefers-reduced-motion`.

### Don't:
- **Don't** add drop shadows or `box-shadow` anywhere. The system is flat with tonal layering only.
- **Don't** use monospace font for prose, labels, or UI text. Mono is reserved for terminal examples and code snippets.
- **Don't** mix rounded corners across components. Keep corners sharp (0px) except for 3px on inline code tags.
- **Don't** use more than the committed typeface pair (Bodoni Moda + Archivo). No display sans-serif.
- **Don't** apply transitions or animations to anything except buttons (on background/transform) and the scroll-triggered settle animation on Looks. No slide-ins, no fade-in cascade.
- **Don't** increase the color palette. The nine named colors (ink, ink-light, gold, gold-deep, paper, paper-ink, text variants, thread, hair) are the complete system. No secondary or tertiary accent colors.
- **Don't** break the print grammar by using GUIs, bevels, gradients, or depth effects. The aesthetic is flat and editorial.
