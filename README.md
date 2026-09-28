# Home — pixel-art Chrome start page

A minimal pixel-art start page for Chrome, styled after the opencode launcher: a full-screen
**flickering grid** (Velora-style staggered fades), twinkling pixel stars, a pixel sun/moon
that arcs with the clock, and a centered search box with a **provider dropdown**.

| Night | Morning |
|---|---|
| ![Night theme](docs/screenshots/night.png) | ![Morning theme](docs/screenshots/morning.png) |
| **Day** | **Evening** |
| ![Day theme](docs/screenshots/day.png) | ![Evening theme](docs/screenshots/evening.png) |

Providers: **Google · DuckDuckGo · Perplexity**
The choice is remembered (localStorage). `Enter` searches, `/` or `Ctrl+K` focuses the box.

**Autocomplete:** suggestions drop down as you type (2+ characters), Google-style with
keyboard navigation — `↑`/`↓` to pick (the input echoes the highlighted suggestion),
`Enter` to search it, `Esc` to dismiss. Google and DuckDuckGo use their own suggestion
APIs; the other providers fall back to Google's. Requests are debounced, cached, and
aborted when superseded. If remote suggestions are unavailable (offline), typing still
works normally.

**Omnibox behavior:** type something URL-shaped — `github.com`, `example.com/page`,
`localhost:3000` — and a globe row with an `OPEN LINK` tag appears above the suggestions;
`Enter` opens the site directly (`https://` is added for you). Plain text just searches.

**Day/night cycle:** the whole page follows the local clock — sunny warm **morning**
(06–11), clear blue **day** (11–17), dusky orange **evening** (17–21), and the starry
**night** (21–06) with the moon. The sun and moon both travel **left → right** across
the sky with the clock (sun 06–21, moon 21–06, arcing high at mid-phase); the UI colors
(panel, text, logo) adapt per phase, and palettes blend near phase boundaries. Phases
re-evaluate every 30 seconds, so a tab left open rolls over on its own. Preview a phase
anytime with `?phase=morning` / `day` / `evening` / `night` in the URL (or set
`CONFIG.forcePhase` in `app.js`).

## Files

| File           | Purpose                                          |
|----------------|--------------------------------------------------|
| `index.html`   | Page markup                                      |
| `style.css`    | Layout, search box, dropdown, pill, hints        |
| `app.js`       | Flickering-grid canvas, sun/moon, search logic   |
| `manifest.json` | Makes the folder a load-unpacked Chrome extension |
| `serve.py`     | Optional dev preview server (no-cache headers)   |

## Install as the New Tab page (recommended)

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select this folder
4. Open a new tab — done.

## Or set it as the Home / startup page

- **Home button:** `chrome://settings/appearance` → enable *Show home button* →
  enter the `file:///` URL of `index.html` on your machine
- **On startup:** `chrome://settings/onStartup` → *Open a specific page* → add the same `file:///` URL.

Note: Chrome does not allow extensions to replace the new-tab page from a plain settings URL —
the unpacked-extension route above is the only way to get a true new-tab override.

### A note on autocomplete outside the extension

As an installed extension, suggestions load via `fetch` using the manifest's
`host_permissions` (no CORS restrictions). Opened as a plain `file://` or served page,
those fetches are CORS-blocked, so the page automatically falls back to Google's JSONP
suggest endpoint — same suggestions, no install needed.

## Customizing

- **Providers:** edit the `PROVIDERS` array in `app.js` (name, letter chip, search URL template).
- **Grid look:** `PITCH` / `SIZE` (square spacing), `DIM` / `BRIGHT` (colors) in `app.js`.
- Reduced-motion users get a static dim grid (animation disabled), same as Velora's component.

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md)
for local setup and guidelines.

## License

Released under the [MIT License](LICENSE).
