# Cents — Design Tokens

Extracted from `reference_images/A1 + Assistant-first · Forest green@2x.png` with Pillow (pixel sampling + bounding boxes).
The image is **@2x: 2720×2800 px → 1360×1400 CSS px**. All values below are CSS px.

## Font

**Figtree** (Google Fonts, variable). Chosen by rendering Figtree, Instrument Sans, Geist and Hanken Grotesk next to the reference header: Figtree matches the spurred `G`, flagged `1`, double-story `a` and the overall width.
Money uses `font-variant-numeric: tabular-nums`.

## Colors (sampled)

| Token | Hex | Used for |
|---|---|---|
| `--bg` | `#EFEDE8` | page background |
| `--sidebar` | `#E7E4DD` | sidebar background |
| `--surface` | `#F8F7F4` | cards, outlined buttons |
| `--border` | `#DDD9D0` | 1px card borders, dividers, chip borders (anti-aliased samples `#D9D5CB`–`#E3E0D8`) |
| `--nav-active` | `#DAD6CC` | active nav pill |
| `--muted-fill` | `#E7E4DD` | category pills, bar tracks, active range tab |
| `--text` | `#2B2A27` | primary text, logo tile, Money-out bar |
| `--text-secondary` | `#55514A` | subtitle, sidebar icons, "Personal" line |
| `--text-muted` | `#6B675F` | date, labels, dates in rows, "Assistant" label |
| `--placeholder` | `#757575` | chat placeholder |
| `--accent` | `#2F6B4F` | primary buttons, bars, avatar, positive amounts, links |
| `--accent-hover` | `#285C44` | primary button hover (not in mockup) |
| `--ink-bar` | `#2B2A27` | Money-out bar |
| `--warning` / `--warning-fill` | `#A0661C` / `#F3E7D0` | warnings (not in mockup; muted amber) |
| `--danger` / `--danger-fill` | `#A3443A` / `#F2DFDA` | overruns, "behind" (not in mockup; muted brick) |

Flat: no gradients, no glass, no heavy shadows. Light mode only.

## Radii

| Element | Radius |
|---|---|
| Cards | 14px |
| Buttons (primary, outlined, send) | 9px |
| Logo tile | 7px |
| Nav pill | 9px |
| Chips, category pills, bars | full |
| Range tab pill | 8px |

## Layout (desktop, 1360×1400 reference)

**Sidebar:** 232px wide incl. 1px right border.
- Logo tile 28×28 at (22, 20); app name 16px/500 at x 61.
- Nav pills inset 14px from both sides, 44px tall, 2px gap (46px pitch), first pill top at 72.
- Icon 18px at pill-left + 12; label 14px at pill-left + 40.
- Bottom: Settings item, 1px divider at y ≈ 1322, then user block: avatar 32px at (24, 1335); name 13px/500; second line 12px `--text-secondary`.

**Main:** padding 40px left/right, ≈ 40px top. Content width 1048px at 1360 viewport.

| Block | Top (y) | Height | Notes |
|---|---:|---:|---|
| Date | cap-top 44.5 | — | 13px muted |
| H1 greeting | cap-top 72 | — | 32px / 600 / −0.02em |
| Subtitle | cap-top 114.5 | — | 15px `--text-secondary`; amount 600 accent |
| Primary header button | 87.5 | 43 | 117 wide, 14px/600, right-aligned |
| Chatbox card | 155 | 130 | padding 20; placeholder 17px; send button 43×43 inset 16 |
| Chips row | 301.5 | 44 | 8px gap, 14px text, padding-x 17, 1px border |
| Worth a look | 372.5 | 104 | padding 24; label 13px muted; body 15px/22px; buttons 43 tall, 10px gap |
| Balance + Cash flow | 506 | 291 | 638 + 20 gap + 389 (≈ 62/38) |
| Spending + Recent | 826.5 | 337 | 395 + 20 gap + 631 (≈ 38/62) |

Vertical gaps between blocks: chat→chips 16, chips→worth 27, worth→row 30, row→row 30.

**Card internals** (padding 24):
- Total balance: label 13px `--text-secondary`; range tabs 13px/500, active pill 44×31 `--muted-fill`, 47px pitch; balance 40px/500/−0.02em; delta 13px (amount 600 accent, "this month" muted); line chart 2px accent stroke, ≈ 105px tall, edge to edge of the padding box.
- Cash flow: label 13px muted; row labels 14px; bars 8px full-round; divider; "Net" 14px muted; net amount 24px/600.
- Spending: title 14px/600; subtitle 13px muted; rows 50px pitch, label 14px, bar 6px.
- Recent: title 14px/600 + "View all" 14px/500 accent; rows 56px pitch with 1px dividers; columns at 0 / 39.4% / 64.6% / right; pill 12px text, 21px tall, padding-x 10; date 14px muted; amount 14px/500 tabular.

## Mobile (< 768px)

Top bar (logo + name + menu → left sheet). Single column in the order header → chatbox → chips (horizontal scroll) → Worth a look (buttons below) → balance → cash flow → spending → recent. Simulate button full width under the greeting. Transaction rows: merchant + date stacked, amount right, pill hidden. Side gutter 16px.
