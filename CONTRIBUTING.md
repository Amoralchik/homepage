# Contributing to Home

Thanks for considering a contribution! This is a small, dependency-free
project — vanilla HTML/CSS/JS plus one optional Python preview server.

## Getting started

1. Clone the repo and open the folder in your editor — there is nothing to build.
2. Start the local preview server (serves with no-cache headers so edits show up on refresh):

   ```bash
   python serve.py
   ```

   Then open <http://localhost:8419>. You can preview a fixed time of day with
   `?phase=morning` / `day` / `evening` / `night`.
3. For end-to-end testing, load the folder as an unpacked extension
   (`chrome://extensions` → Developer mode → Load unpacked) and hit its ↻
   reload button after every change.

## Making changes

- `app.js` — day/night palettes (`DayCycle`), canvas background, search,
  autocomplete, and provider list (`PROVIDERS`).
- `style.css` — all theming. Colors live in CSS custom properties grouped by
  phase (`body[data-phase="…"]`); keep new colors in that system.
- `index.html` — markup only; scripts and styles are external (required by
  Chrome MV3).

## Guidelines

- No build step and no runtime dependencies — keep it that way.
- Test in both contexts: as an extension (real fetch + permissions) and via
  the preview server (exercises the JSONP fallback).
- Check the four `?phase=` themes after visual changes; mind contrast on the
  light (morning/day) themes.
- Keep `prefers-reduced-motion` behavior working.

## Submitting

Open a pull request with a short description of what changed and why.
Small, focused PRs land fastest.
