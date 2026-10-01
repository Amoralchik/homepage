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

---

# 2. Themed Surfaces — UI chrome accord

**Problem:** the 9 themes only recolored accents (borders, glow, selection,
submit button) while every surface stayed phase-fixed blue-navy glass — under
Green or Cyberpunk the themed canvas sat behind blue UI panels.

**Decision (interview):** subtle tint (~12% of the theme hue) on the glass
surfaces, in **every phase** — night, morning/day and evening alike. Text
colors stay phase-fixed to preserve contrast; only glass takes the hue.

**Architecture** (style.css): each phase block keeps its neutral glass twice —
as the working variable (`--panel`) and as `--panel-base` (same for
`suggest-bg`, `pill-bg`, `key-bg`, `edge`, `hover`, `chip-bg`). One derivation
block after the theme overrides recomputes the working variables for all
non-Classic themes:

    --panel: color-mix(in srgb, var(--panel-base) 88%, var(--accent));

Because custom properties resolve per element, one rule covers every phase —
no per-theme-per-phase tables. `--accent` is the tint source, so any future
theme needs only an accent to get full surface accord. The low-alpha washes
(`--hover`, `--chip-bg`) use relative-color syntax to keep their alpha from
rising when mixed; browsers without `color-mix`/relative-color simply fall
back to the neutral phase palettes. Classic is untouched by definition.

**Verified:** Cyberpunk×night (plum-black glass), Green×evening (forest-dusk),
Rose×morning and Violet×day (blush/lavender white glass) — legible throughout.

**Deferred:** theme-switch cross-fade transitions on panels (currently only
body background fades), and per-background-mode UI accents.

---

# 3. Theme Hue Audit (2026-10-01)

**Report:** "red becomes green at evening" — chromatic themes drifted far off
their expected color depending on time of day.

**Root cause:** `tintRGB` *rotated* every base color by a fixed hue delta
(`h + t.hue`). The deltas were calibrated on the night palette's navy
(~224°), so they only worked there. The evening sunset is orange (~21°):
under Red (+135°) it landed at 156° — mint green. Every chromatic theme had
warm-phase offenders:

| Theme  | Evening sunset was | Now  |
|--------|--------------------|------|
| red    | `#4effb9` mint     | `#ff4e6c` |
| green  | `#da60ff` purple   | `#60ff60` |
| violet | `#e3ff67` chartreuse | `#a667ff` |
| cyberpunk | `#aaff72` light green | `#e772ff` |
| rose   | `#75ff83` green    | `#ff75d1` |
| blue   | `#ffde72` gold     | `#7272ff` |

**Fix:** chromatic themes (`hue != 0`) now *anchor* every tinted color on the
theme's own hue — `HUE_REF (215°) + t.hue` — instead of rotating further away
from it. `hue: 0` themes (classic/dark/bright) pass hues through unchanged, so
their look is bit-identical. Saturation/lightness multipliers are untouched:
phases keep differing by brightness and vividness, and each theme's absolute
`sunRamp`/`moonRamp` colors (already hand-picked per theme) confirm the
anchor is the original design intent.

**Verified:** red×evening (crimson world), green×evening (green dusk, was
purple), classic×evening (regression: unchanged orange sunset).

**Knob:** chromatic themes keep their existing `sat` multipliers, so Green's
evening is loud (100% base saturation × 1.1). If a theme ever feels neon,
tune its `sat` — hue is now guaranteed on-theme.
