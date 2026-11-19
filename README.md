<div align="center">

# Home

**A pixel-art new tab page for Chrome — a living sky that follows your clock, wrapped around a fast, keyboard-first search box.**

[![Live demo](https://img.shields.io/badge/demo-live-6c8cff?style=flat-square&logo=githubpages&logoColor=white)](https://amoralchik.github.io/homepage/) [![Manifest V3](https://img.shields.io/badge/chrome-manifest%20v3-4285F4?style=flat-square&logo=googlechrome&logoColor=white)](manifest.json) [![Version](https://img.shields.io/badge/version-1.5.0-f0a830?style=flat-square)](manifest.json) [![No build step](https://img.shields.io/badge/build-none%20·%20vanilla%20JS-2fa869?style=flat-square)](#project-structure) [![License: MIT](https://img.shields.io/badge/license-MIT-e05a94?style=flat-square)](LICENSE)

[**Live demo**](https://amoralchik.github.io/homepage/) · [Install](#installation) · [Features](#features) · [Shortcuts](#keyboard-shortcuts) · [Customize](#customizing) · [Contributing](CONTRIBUTING.md)

<br>

<img src="docs/screenshots/hero.png" alt="Home new tab page at night: a pixel moon over a flickering star grid with a centred search box" width="900">

</div>

<br>

## Highlights

- **A sky that keeps time** — morning, day, evening and night palettes blend with the local clock; the pixel sun and moon arc across the screen.
- **13 backgrounds × 12 themes** — Scene, Aurora, Retro, Lamp, Dither, Halftone, Particles, Solid and more, every one theme- and phase-aware — plus your own **photos and videos** with blur / brightness controls.
- **An omnibox, not just a box** — autocomplete, bangs (`!yt`, `!gh`, …), recent searches, URL detection, an instant calculator, and your open tabs and bookmarks — bring your own engine with a `{q}` URL template.
- **Live weather** — temperature in the pill (click it for feels-like, humidity, wind, sun times and the next hours) and rain, snow, fog or storms drawn into the scenery, via [Open-Meteo](https://open-meteo.com) with no API key.
- **Widgets that work** — a greeting that knows your name, a quote of the day, Markdown-lite notes and to-dos, a pomodoro timer with focus mode and a tab-title countdown — pin any widget to the page and drag it wherever you like.
- **Your links, your page** — a custom quick-links bar with folders and drag-reorder, `Alt`+`1`–`9` to open, a right-click menu on the page, custom CSS / fonts, and settings you can export, import and share.
- **Private by design** — no accounts, no telemetry; everything lives in `localStorage` / IndexedDB on your machine.
- **Zero dependencies** — plain HTML, CSS and JavaScript. No bundler, no framework, nothing to build.

## Screenshots

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/morning.png" alt="Morning phase"></td>
    <td width="50%"><img src="docs/screenshots/day.png" alt="Day phase"></td>
  </tr>
  <tr>
    <td align="center"><sub><b>Morning</b> · 06–11</sub></td>
    <td align="center"><sub><b>Day</b> · 11–17</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/evening.png" alt="Evening phase"></td>
    <td width="50%"><img src="docs/screenshots/night.png" alt="Night phase"></td>
  </tr>
  <tr>
    <td align="center"><sub><b>Evening</b> · 17–21</sub></td>
    <td align="center"><sub><b>Night</b> · 21–06</sub></td>
  </tr>
</table>

### Backgrounds & themes

<table>
  <tr>
    <td width="25%"><img src="docs/screenshots/bg-retro.png" alt="Retro background, Cyberpunk theme"></td>
    <td width="25%"><img src="docs/screenshots/bg-aurora.png" alt="Aurora background, Teal theme"></td>
    <td width="25%"><img src="docs/screenshots/bg-lamp.png" alt="Lamp background at night"></td>
    <td width="25%"><img src="docs/screenshots/bg-dither.png" alt="Dither background"></td>
  </tr>
  <tr>
    <td align="center"><sub><b>Retro</b> · Cyberpunk</sub></td>
    <td align="center"><sub><b>Aurora</b> · Teal</sub></td>
    <td align="center"><sub><b>Lamp</b> · night</sub></td>
    <td align="center"><sub><b>Dither</b> · Classic</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/bg-halftone.png" alt="Halftone background, Violet theme"></td>
    <td><img src="docs/screenshots/bg-particles.png" alt="Particles background, Rose theme"></td>
    <td><img src="docs/screenshots/bg-shooting.png" alt="Shooting stars background, Blue theme"></td>
    <td><img src="docs/screenshots/bg-grain.png" alt="Grain background, Amber theme"></td>
  </tr>
  <tr>
    <td align="center"><sub><b>Halftone</b> · Violet</sub></td>
    <td align="center"><sub><b>Particles</b> · Rose</sub></td>
    <td align="center"><sub><b>Shooting</b> · Blue</sub></td>
    <td align="center"><sub><b>Grain</b> · Amber</sub></td>
  </tr>
</table>

### In use

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/feat-suggest.png" alt="Autocomplete suggestions dropping down under the search box"></td>
    <td width="50%"><img src="docs/screenshots/feat-bangs.png" alt="Bang list shown after typing an exclamation mark"></td>
  </tr>
  <tr>
    <td align="center"><sub><b>Autocomplete</b> — debounced, cached, keyboard-driven</sub></td>
    <td align="center"><sub><b>Bangs</b> — type <code>!</code> to search another site</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/feat-calc.png" alt="Instant calculator card showing 15% of 80 = 12"></td>
    <td><img src="docs/screenshots/feat-settings.png" alt="Settings panel open on the Look tab"></td>
  </tr>
  <tr>
    <td align="center"><sub><b>Instant calculator</b> — <code>Enter</code> copies the answer</sub></td>
    <td align="center"><sub><b>Settings</b> — theme, phase, background, motion</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/feat-widgets.png" alt="Widget layer with a bus tracker and good-vibes card"></td>
    <td valign="middle">
      <b>Widget layer</b><br>
      <sub>Press <kbd>W</kbd> for a HUD of small persistent widgets — a quote of the day,
      Markdown-lite notes, a pomodoro timer, a bus tracker, or your own via
      <a href="#personal-mods-local-only"><code>mods.js</code></a>. Drag a widget by its
      header to pin it anywhere on the page.</sub>
    </td>
  </tr>
</table>

## Installation

> [!TIP]
> Just want a look? The [**live demo**](https://amoralchik.github.io/homepage/) runs the same page in any browser — no install needed.
> Outside the extension the quick bar is hidden and autocomplete falls back to Google's JSONP endpoint; everything else is identical.

### As the New Tab page (recommended)

1. Clone or [download](https://github.com/Amoralchik/homepage/archive/refs/heads/main.zip) this repository.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the project folder.
4. Open a new tab — done.

### As the Home / startup page

- **Home button:** `chrome://settings/appearance` → enable *Show home button* → enter the `file:///` URL of `index.html`.
- **On startup:** `chrome://settings/onStartup` → *Open a specific page* → add the same `file:///` URL.

> [!NOTE]
> Chrome doesn't let a plain settings URL replace the new-tab page — the unpacked extension is the only way to get a true new-tab override.

### Local development

```bash
python serve.py   # http://localhost:8419 — serves the folder with no-cache headers
```

Append `?phase=morning` / `day` / `evening` / `night` to preview a phase without waiting for the clock.

## Features

<details open>
<summary><b>Search</b> — providers, bangs, history, autocomplete</summary>

<br>

- **Providers:** Google · DuckDuckGo · Perplexity. The choice is remembered; <kbd>Alt</kbd>+<kbd>↑</kbd>/<kbd>↓</kbd> switches engine without leaving the box.
- **Bangs:** start (or end) a query with a bang to search elsewhere — `!yt lofi beats`, `rust lifetimes !so`. Typing `!` lists them (<kbd>Tab</kbd> completes one) and a bang alone (`!gh`) opens the site. The chip on the left follows the active bang.

  | Bang | Site | Bang | Site | Bang | Site |
  |---|---|---|---|---|---|
  | `!g` | Google | `!yt` | YouTube | `!so` | Stack Overflow |
  | `!d` | DuckDuckGo | `!w` | Wikipedia | `!mdn` | MDN |
  | `!p` | Perplexity | `!gh` | GitHub | `!npm` | npm |
  | `!b` | Bing | `!r` | Reddit | `!a` | Amazon |
  | `!m` | Maps | `!i` | Images | `!tr` | Translate |
  | `!x` | X | | | | |

- **Recent searches:** kept locally (never synced). Click into the empty box or press <kbd>↓</kbd> to see them; matching ones float to the top with a clock icon. Remove one with <kbd>×</kbd> or <kbd>Shift</kbd>+<kbd>Delete</kbd>.
- **Autocomplete:** suggestions after two characters, Google-style. Google and DuckDuckGo use their own APIs, the rest fall back to Google's. Requests are debounced, cached and aborted when superseded; offline, typing still works.
- **Omnibox behaviour:** URL-shaped input (`github.com`, `localhost:3000`) shows an **OPEN LINK** row — `https://` is added for you.
- **Instant calculator:** `4+4`, `2^10`, `sqrt(16)`, `15% of 80`, `sin(pi/2)`, `log2(1024)`, `3x4`, `2pi`… A small hand-written parser — nothing is ever `eval`'d.
- **Tabs & bookmarks** *(extension only)*: matches open tabs (**SWITCH TO TAB**) and bookmarks (**BOOKMARK**), like Chrome's omnibox.
- **Animated placeholder:** cycles through hint phrases while the box is empty (static under `prefers-reduced-motion`).

</details>

<details>
<summary><b>Day / night cycle</b> — phases, sun and moon</summary>

<br>

| Phase | Hours | Sky |
|---|---|---|
| Morning | 06–11 | warm and sunny |
| Day | 11–17 | clear blue |
| Evening | 17–21 | dusky orange |
| Night | 21–06 | starry, with the moon |

The sun (06–21) and moon (21–06) travel left → right, arcing high at mid-phase. Panel, text and accents adapt per phase and blend near boundaries; phases re-evaluate every 30 seconds, so a tab left open rolls over on its own. Freeze a phase in **Settings → Look → Phase**, or preview with `?phase=…` / `CONFIG.forcePhase`.

</details>

<details>
<summary><b>Backgrounds</b> — 12 styles</summary>

<br>

| Style | Description |
|---|---|
| **Scene** | The default pixel world — flickering grid, twinkling stars, sun and moon |
| **Aurora** | Drifting light blobs |
| **Grid** | Clean graph paper that drifts slowly, with glowing intersections |
| **Lamp** | A warm light cone that follows the clock, with dust motes in the beam |
| **Noise** | Film grain over a slowly breathing light |
| **Particles** | Floating dust linking into faint constellations |
| **Retro** | Synthwave floor with a striped sun sinking into the horizon |
| **Shooting** | Dense starfield with occasional meteors |
| **Grain** | Vivid gradient with film grain |
| **Halftone** | Your wallpaper as glowing dot-matrix art |
| **Dither** | Bayer-dithered pixel art of your wallpaper, fading out behind the search |
| **Photo** | Your wallpaper as-is — image or muted looping video — with a slow drift and a phase-tinted veil |
| **Solid** | A two-color gradient of your choosing, stars still twinkle |

Every background is theme- and phase-aware — except the Lamp, which ignores the theme picker like a real lamp would.
**Pointer effects:** grids, dots, dither pixels and particles light up around the cursor and clicks send a ripple through the scene (off under **Look → Motion** or with `prefers-reduced-motion`).

</details>

<details>
<summary><b>Themes & wallpaper</b></summary>

<br>

- **Themes:** Classic, Dark, Bright, Cyberpunk, Violet, Red, Amber, Green, Teal, Blue, Rose — each recolours the planet, glow, sky, grid, stars and UI accents while the day cycle keeps running.
- **Image theme:** samples your wallpaper's dominant colour (accent, planet) and a second distinct hue (sun, borders); mostly-gray pictures give a neutral monochrome theme.
- **Wallpapers:** save up to 5 — pick files (images **and videos**), drag & drop or paste a URL — stored locally in IndexedDB, never synced. Used by **Photo**, **Halftone** and **Dither**; the Look tab adds **blur** and **brightness** sliders.
  - **Shuffle:** a random one shows on every new tab (never the same twice in a row), or set it to change every 1 / 5 / 15 / 60 minutes with a crossfade.
  - **Schedule:** daily rules like *from 18:00 show #3*; rules take priority over shuffling, and clicking a thumbnail overrides them until the next rule starts.

</details>

<details>
<summary><b>Weather</b></summary>

<br>

A pixel icon and temperature in the time pill, powered by [Open-Meteo](https://open-meteo.com) (free, no key, no account).

- **Location:** *Auto* uses browser geolocation and silently falls back to a coarse IP city lookup; *Pick…* searches Open-Meteo's city index.
- **In the scenery:** rain streaks with wind, drifting snow, pixel clouds, fog banks and lightning — on every background.
- **Freeze it:** pin the condition (Clear, Clouds, Rain, Snow, Storm, Fog) and temperature, just like freezing the phase.
- Refreshes every 10 minutes while visible; the last reading is cached so the pill fills in instantly. Works on the hosted demo too.

</details>

<details>
<summary><b>Quick bar</b> <i>(extension only)</i></summary>

<br>

A line of shortcuts pinned to the top of the page:

- **Recent** — the tabs you had open last, across windows; click to focus that exact tab.
- **Most used** — your top sites, ranked by a tiny background tracker of tab activations and page loads.
- **Bookmarks** — mirrors your bookmarks bar, with real folder nesting, item counts and **Open all**.
- **My links** — your own links, managed in **Settings → Links**: add with label, URL and an emoji/letter icon; drag a row onto the top or bottom edge of another to reorder, onto its middle to fold both into a folder (or into an existing folder). `Alt`+`1`–`9` opens the first ones, right-click a chip to edit or remove it.

Overflow tucks into a "··· more" chip, favicons come from Chrome's cache, and the bar is fully keyboard-navigable (<kbd>←</kbd>/<kbd>→</kbd> between chips, <kbd>↓</kbd> opens a menu, <kbd>Esc</kbd> closes).

</details>

<details>
<summary><b>Widgets & personal touches</b> — greeting, quotes, notes, pomodoro</summary>

<br>

Open the panel with <kbd>W</kbd> (or switch widgets on in **Settings → Widgets**), and press a widget's **pin** to put it on the page — drag its header to move it anywhere (it snaps to a small grid and keeps its place when the window resizes). Pinned widgets stay when the side panel is closed; unpin, double-click the header or drop it back over the panel to dock it. Happy with the layout? **Lock pinned widgets & alerts in place** (Settings → Widgets, or right-click the page) and stray drags or double-clicks won't move them.

- **Greeting** — a phase-aware line above the search ("Good evening, Ada"); type your name in **Settings → Layout** and it switches on (toggle it under **Show → Greeting**).
- **Quote** — a quote of the day from the built-in set plus your own (`Author, quote` per line, right under the Quote switch in **Settings → Widgets**); click the card or pick "Next quote" in the right-click menu for another.
- **Notes** — Markdown-lite: `#`/`##`/`###` headings, `-` bullets and `- [ ]`/`- [x]` checkboxes you can tick straight in the card. <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+`1`–`5` prefix the current line while editing.
- **Pomodoro** — work / short / long sessions (durations in settings), an alarm when a session ends, a **focus mode** that hides the noisy chrome, a countdown in the browser tab's title, and it keeps running across closed tabs.

**Clock:** keep it **small** in the info bar or make it **big** above the search — the big one can be a pixel **digital** clock or an **analog** face, with an optional seconds display. Tick **Show another time zone** to run the clock in any zone (the info bar names it). The **More** tab adds a custom browser-**tab title** with a `{time}` placeholder and an **emoji favicon**.

</details>

<details>
<summary><b>Own the page</b> — context menu, custom CSS, import/export</summary>

<br>

- **Right-click the page** — add/manage links, next wallpaper, next quote, toggle widgets, settings, help. Right-clicking one of *your* links edits or removes it.
- **Fonts & custom CSS** — a font picker for the whole page (pixel, sans, mono, serif and handwritten families from Google Fonts, your system font, or **any installed font** — Chrome can list them for you), with an option to keep the pixel font for small labels; plus a **Custom CSS** box under **More**.
- **Custom search engine** (**Search → +Engine**) — any site with a `{q}` URL template joins Google / DuckDuckGo / Perplexity everywhere: the dropdown, <kbd>Alt</kbd>+<kbd>↑</kbd>/<kbd>↓</kbd> and providers.
- **Presets & backup** (**More** tab) — **save your current setup as a named preset** and switch back to it any time (presets leave your notes, links and quotes alone), three starter presets (Midnight, Sunrise, Paper), and a full backup: download / copy every `home:*` key as JSON and import it from a file or pasted text.
- **Help overlay** — <kbd>?</kbd> lists every shortcut.

</details>

<details>
<summary><b>Settings & layout</b></summary>

<br>

The gear in the bottom-right opens a tabbed panel — **Look** (theme, phase, a background dropdown with only the knobs that matter for it — wallpaper, dot size, blur / brightness, solid colors — motion and font), **Layout** (clock size / face / format / time zone, greeting name, show/hide toggles, quick bar), **Links** (your own quick links with folders and drag-reorder), **Search** (default engine, your own engine, where results open, suggestions, history, bang cheat sheet), **Widgets** (switch each widget on or off, pin it to the page, its settings, and weather) and **More** (presets, backup, browser-tab title & icon, custom CSS, reset).

**Show/hide** toggles the clock, greeting, search box, info bar, widgets, planet, stars, hints and the pulsing search border — for a completely minimal (or maximal) layout. **Reset all settings…** (under **More**) wipes everything.

</details>

## Keyboard shortcuts

| Keys | Action |
|---|---|
| <kbd>/</kbd> or <kbd>Ctrl</kbd>+<kbd>K</kbd> | Focus the search box |
| <kbd>Enter</kbd> | Search / open link / copy calculator result |
| <kbd>Ctrl</kbd>+<kbd>Enter</kbd> or <kbd>Alt</kbd>+<kbd>Enter</kbd> | Open in a new tab |
| <kbd>Shift</kbd>+<kbd>Enter</kbd> | Open in a background tab |
| <kbd>Alt</kbd>+<kbd>↑</kbd> / <kbd>↓</kbd> | Switch search engine |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Move through suggestions |
| <kbd>Tab</kbd> | Complete a bang |
| <kbd>Shift</kbd>+<kbd>Delete</kbd> | Remove a recent search |
| <kbd>Esc</kbd> | Dismiss suggestions / close panels |
| <kbd>W</kbd> | Toggle the widget layer |
| <kbd>Alt</kbd>+<kbd>1</kbd>–<kbd>9</kbd> | Open one of the first quick-bar links |
| <kbd>?</kbd> | Help overlay with every shortcut |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>1</kbd>–<kbd>5</kbd> (in Notes) | Heading / bullet / to-do prefix |

## Privacy & permissions

No accounts and no telemetry. All settings, history and wallpapers stay on your machine.

| Permission | Why |
|---|---|
| `tabs` | Quick bar *Recent* mode and "switch to tab" (Chrome labels this *Read your browsing activity*) |
| `bookmarks` | Quick bar *Bookmarks* mode and bookmark matches in the search box |
| `favicon` | Reads Chrome's local favicon cache |
| `storage` | Keeps the local tab/site counts behind *Most used* |
| `geolocation` | Only when weather location is set to *Auto* — decline and it falls back to an IP city lookup |

The only network calls are search suggestions, Open-Meteo (forecast and city search) and [ipwho.is](https://ipwho.is) (IP fallback).

<details>
<summary>Autocomplete outside the extension</summary>

<br>

As an installed extension, suggestions load via `fetch` using the manifest's `host_permissions`. Opened as a plain `file://` or served page those fetches are CORS-blocked, so the page falls back to Google's JSONP suggest endpoint — same suggestions, no install needed.

</details>

## Customizing

| What | Where |
|---|---|
| Search providers | `PROVIDERS` array in `app.js` (name, letter chip, URL template) |
| Bangs | `BANGS` array in `app.js` |
| Placeholder hints | `PLACEHOLDERS` array in `app.js` |
| Widgets | `WIDGETS` registry in `app.js` — `name`, `blurb`, `mount(body)` returning an optional cleanup |
| Grid look | `PITCH` / `SIZE` (spacing), `DIM` / `BRIGHT` (colours) in `app.js` |
| Theme palettes | `THEMES` in `app.js` (design notes in [THEME.md](THEME.md)) |

### Personal mods (local only)

Want a private widget that never lands in the repo? Create `mods.js` next to `index.html` — it's gitignored and loaded automatically if present:

```js
HOME_MODS.register('my-widget', {
  name: 'My widget',
  blurb: 'shows up in the layer’s + menu',
  mount(body) {
    // draw into body; return a cleanup function (optional)
  },
});
```

Need a pop-up? Create an element with the `mod-alert` class (toggle `show` to display it) and append it to `HOME_MODS.alertHost`. All widget alerts share that dock: the visible ones stack without gaps, and you can drag the stack anywhere (double-click an alert to put it back).

<details>
<summary>Example: a live De Lijn bus tracker</summary>

<br>

The default example tracks a specific stop with **real-time arrivals** from the official [De Lijn Open Data API](https://data.delijn.be) (free key from [developer.delijn.be](https://developer.delijn.be), kept in the gitignored `mods.js` / `.env`). It shows a green LIVE tag on real-time passages, pops a small alert when the next bus is within 30 minutes, and falls back to an editable timetable if the API is unreachable.

</details>

## Project structure

```
.
├── index.html       # page markup
├── style.css        # layout, search box, dropdown, pill, settings
├── app.js           # backgrounds, day cycle, search, settings, widgets
├── background.js    # service worker — counts tab/site usage for "Most used"
├── manifest.json    # Manifest V3 — makes the folder a load-unpacked extension
├── serve.py         # optional dev server with no-cache headers
├── THEME.md         # design notes for the background themes
└── docs/screenshots # images used in this README
```

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for local setup and guidelines.

## License

Released under the [MIT License](LICENSE).

<div align="center">
<br>
<sub>Built with plain HTML, CSS & JavaScript · inspired by the opencode launcher and Velora UI</sub>
</div>
