# Homepage Themes

Passes designed through the theme-creator 3-stage process (2026-10-01).

1. **Reading Lamp** — the Lamp background mode.

---

# 1. Lamp Theme — "Reading Lamp"

The redo of the **Lamp** background mode.

## Qualities

**Cozy + Quiet** (from the color-psychology interview). A lamp on a start page
is about evening comfort; it's glanced at for seconds, so calm beats spectacle.

## Core decision: the lamp follows the clock, not the theme

`drawLamp` no longer tints its warm color through `tintRGB(THEMES[themeKey])`.
Like a real lamp, its light is independent of the theme picker and keyed to the
day/night cycle instead. `DayCycle.palette()` now also returns `next` and `k`,
and `DayCycle` exports `lerpColor`, so the lamp blends into the next phase the
same way the sky does (last 25% of each phase).

## Palette (phase-keyed, in `LAMP_PHASES`)

| Phase   | Cone color          | Intensity | Reads as                          |
|---------|---------------------|-----------|-----------------------------------|
| morning | `#FFD9A6`           | 35%       | faint afterglow, someone left it on |
| day     | `#FFE2B0`           | 8%        | effectively off                   |
| evening | `#FFBC72`           | 75%       | switching on through dusk         |
| night   | `#FFC584`, core `#FFF3D9` | 100% | the hero — full Reading Lamp amber |

## Beyond color

- **Soft beam** — the cone is pre-rendered once per palette change to an
  offscreen canvas with `blur(26px)` (stacked semi-transparent polygons band
  visibly; per-frame blur would cost). Rebuilt on mode switch, resize, and
  `setPalette` (30s cadence).
- **Gentle flicker** — ±2.5% at slow periods (was ±6% fast): a bulb settles,
  it doesn't sputter. Disabled under `prefers-reduced-motion`, which also
  skips the dust motes (the lamp renders as a static glow).
- **Dust motes** (signature moment) — 40 tiny bright squares drifting down the
  beam with sway and twinkle, seeded in `buildModeExtras` (mode switch/resize
  only, so palette rebuilds don't reset them mid-drift). Alpha scales with
  phase intensity: none by day.

## Rules for future changes

- Keep large surfaces calm; saturation lives in the cone and accents.
- Nothing in lamp mode may fight the UI for attention — panels and text keep
  their own backgrounds; verify legibility at all four phases when tuning.
- Canvas work in this file favors pre-render + blit over per-frame effects
  once an effect involves more than two gradient fills.

## Considered and deferred

- **Search-focus warmth** (lamp brightens ~15% while the search box is
  focused) — designed, not implemented; add a `setBoost()` on `bgApi` plus
  `focusin`/`focusout` listeners if wanted.
- Lamp fixture silhouette, floor light pool, cursor-warm glow — proposed in
  the stage-2 interview, not selected.

## Files

- `app.js` — `DayCycle.palette`/`lerpColor`, `LAMP_PHASES`, `lampNow`,
  `buildLamp`, `drawLamp`, `buildModeExtras` lamp branch, `setPalette` hook.
- `README.md` — background list describes the new Lamp behavior.
