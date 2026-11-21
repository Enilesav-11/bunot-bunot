# Design System

**Status:** Implemented in the local app; full route and device visual QA remains open.

## Art direction

Build a Filipino Christmas identity around a parol-lit night street, using the supplied Christmas-tree palette as the site's primary colors. The app uses original SVG parol artwork recolored to match; approved photography can be added later.

Use restrained decoration: one star motif at a time, fine light strings or warm edge details, and photography where available. Keep data screens legible and quieter than the landing page. Party mode may use a darker stage and ambient parol details while keeping the result and remaining count dominant.

## Color tokens

| Token | Value | Use |
|---|---|---|
| `marshmallow` | `#FFFBE9` | Main page and form background |
| `ribbon` | `#8F0500` | Primary action and festive accent |
| `garland` | `#044529` | Header, hero, and green surfaces |
| `sugar-cookie` | `#FFECC5` | Content cards and warm highlights |
| `hot-cacao` | `#562400` | Body text and dark contrast surfaces |

Use hot cacao on marshmallow or sugar-cookie surfaces, and marshmallow on garland or hot cacao. Primary buttons use ribbon with marshmallow text. Do not use color alone to convey status. Verify text and control contrast against WCAG AA before release.

## Type and layout

- Display: Fraunces; use for page titles and winner reveal only.
- UI/body: DM Sans; use for navigation, labels, tables, and controls.
- Use a compact type scale; reserve oversized type for landing and party-mode headlines.
- Mobile-first layout; retain framework breakpoints. Stack forms and controls on narrow screens, collapse tables into readable rows, and keep primary actions within thumb reach.
- On projector layouts, prioritize high contrast, large names, clear remaining count, and generous spacing.

## Shape, depth, motion

- Use modest radii for controls and panels; avoid turning every surface into a pill or card.
- Prefer borders and tonal surfaces over heavy shadows or glass effects.
- Keep animation short and purposeful. The reveal reflects a server result; it never determines the selected participant.
- Respect `prefers-reduced-motion`; replace movement with a brief state change and immediate result.

## Interaction tokens

- Primary button: ribbon fill, marshmallow text; visible hover, pressed, focus, disabled, and loading states.
- Secondary button: transparent or tonal fill with a visible border.
- Inputs: persistent label, clear error text, visible focus ring, and adequate touch target.
- Status: pair color with text/icon; errors and destructive actions require explicit wording.
- Toasts: brief success/connection feedback; do not use for errors requiring user action.
