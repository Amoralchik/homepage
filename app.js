'use strict';

/* ================= config ================= */

const CONFIG = {
  // preview a time of day regardless of the clock: 'morning' | 'day' | 'evening' | 'night'
  // (also settable via ?phase=day in the URL)
  forcePhase: new URLSearchParams(location.search).get('phase'),
};

const PROVIDERS = [
  { id: 'google',     name: 'Google',     letter: 'G', suggest: 'google', url: 'https://www.google.com/search?q=' },
  { id: 'ddg',        name: 'DuckDuckGo', letter: 'D', suggest: 'ddg',    url: 'https://duckduckgo.com/?q=' },
  { id: 'perplexity', name: 'Perplexity', letter: 'P', suggest: 'google', url: 'https://www.perplexity.ai/search?q=' },
];

/* ================= day cycle ================= */
/* Four phases driven by the local clock; each blends into the next near its end. */

const DayCycle = (() => {
  const PHASES = [
    { name: 'morning', start: 6 },  // 06:00–11:00 — sunny, warm light
    { name: 'day',     start: 11 }, // 11:00–17:00 — bright blue
    { name: 'evening', start: 17 }, // 17:00–21:00 — sunset
    { name: 'night',   start: 21 }, // 21:00–06:00 — stars and moon
  ];

  const PALETTES = {
    morning: {
      skyTop: [143, 208, 255], skyBot: [255, 231, 190],
      gridDim: [152, 192, 236], gridBright: [21, 101, 214],
      sparkle: [255, 255, 255], starA: 0.06,
      sun: true, sunGlow: [255, 214, 130], moon: false,
    },
    day: {
      skyTop: [96, 186, 255], skyBot: [214, 240, 255],
      gridDim: [140, 186, 235], gridBright: [18, 98, 214],
      sparkle: [255, 255, 255], starA: 0,
      sun: true, sunGlow: [255, 235, 160], moon: false,
    },
    evening: {
      skyTop: [56, 40, 84], skyBot: [255, 152, 96],
      gridDim: [186, 116, 138], gridBright: [255, 148, 88],
      sparkle: [255, 214, 180], starA: 0.5,
      sun: true, sunGlow: [255, 150, 88], moon: false,
    },
    night: {
      skyTop: [5, 10, 24], skyBot: [11, 21, 49],
      gridDim: [58, 74, 152], gridBright: [96, 140, 255],
      sparkle: [190, 210, 255], starA: 1,
      sun: false, sunGlow: [255, 200, 120], moon: true,
    },
  };

  // representative hours used when a phase is forced via config/?phase=
  const FORCE_HOUR = { morning: 8.5, day: 14, evening: 19.5, night: 2 };

  function clockHour(date, forced) {
    return forced && FORCE_HOUR[forced] !== undefined
      ? FORCE_HOUR[forced]
      : date.getHours() + date.getMinutes() / 60;
  }

  const lerp = (a, b, k) => a + (b - a) * k;
  const lerpColor = (a, b, k) => [0, 1, 2].map(i => Math.round(lerp(a[i], b[i], k)));

  function current(date, forced) {
    if (forced && PALETTES[forced]) {
      return { name: forced, next: forced, f: 0.5, k: 0 };
    }
    const h = date.getHours() + date.getMinutes() / 60;
    let idx = PHASES.length - 1;
    for (let i = 0; i < PHASES.length; i++) {
      if (h >= PHASES[i].start) idx = i;
    }
    const cur = PHASES[idx];
    const next = PHASES[(idx + 1) % PHASES.length];
    const end = next.start > cur.start ? next.start : next.start + 24;
    const f = ((h < cur.start ? h + 24 : h) - cur.start) / (end - cur.start);
    const k = f < 0.75 ? 0 : (f - 0.75) / 0.25; // blend into the next phase near its end
    return { name: cur.name, next: next.name, f, k };
  }

  function palette(date, forced) {
    const { name, next, k } = current(date, forced);
    const a = PALETTES[name], b = PALETTES[next];
    const out = { phase: name, next, k };
    for (const key of ['skyTop', 'skyBot', 'gridDim', 'gridBright', 'sparkle', 'sunGlow']) {
      out[key] = lerpColor(a[key], b[key], k);
    }
    out.starA = lerp(a.starA, b.starA, k);
    // star/sparklesOn are normally overwritten by tintPalette/applyDayCycle,
    // but the engine's reduced-motion first draw runs on this raw palette
    out.star = [150, 175, 255];
    out.sparklesOn = true;
    out.sun = k < 0.5 ? a.sun : b.sun;
    out.moon = k < 0.5 ? a.moon : b.moon;
    return out;
  }

  // both luminaries travel left → right: the sun from 06:00 to 21:00,
  // the moon across the night from 21:00 to 06:00 (fractions of the screen)
  function sunPos(date, forced) {
    const p = Math.max(0, Math.min(1, (clockHour(date, forced) - 6) / 15));
    return { x: 0.14 + 0.72 * p, y: 0.55 - 0.45 * Math.sin(p * Math.PI) };
  }

  function moonPos(date, forced) {
    const p = Math.max(0, Math.min(1, ((clockHour(date, forced) - 21 + 24) % 24) / 9));
    return { x: 0.14 + 0.72 * p, y: 0.52 - 0.40 * Math.sin(p * Math.PI) };
  }

  return { current, palette, sunPos, moonPos, lerpColor };
})();

/* ================= themes ================= */
/* Each theme recolors the celestial body (planet/sun) and the UI accents;
   the day/night phases keep controlling sky brightness and sun position. */

const THEMES = {
  classic: {
    hue: 0, sat: 1, lum: 1,
    moonRamp: ['#24348c', '#4160c8', '#7492f0', '#b3c6ff'],
    sunRamp: ['#ff8f2e', '#ffb03a', '#ffd45e', '#fff2c8'],
    glow: [99, 132, 255],
  },
  /* dark & bright are the monochrome pair: near-zero saturation drains the
     palette to grayscale while lum sets the mood */
  dark: {
    hue: 0, sat: 0.1, lum: 0.65,
    moonRamp: ['#161616', '#2e2e2e', '#4d4d4d', '#7a7a7a'],
    sunRamp: ['#333333', '#525252', '#7d7d7d', '#b0b0b0'],
    glow: [110, 110, 110],
  },
  bright: {
    hue: 0, sat: 0.08, lum: 1.2,
    // the night/evening palettes are too dark to multiply into a white world,
    // so bright lifts luminance toward white — keyed by phase, because
    // morning/day are already white and would wash out
    liftByPhase: { morning: 0.08, day: 0.05, evening: 0.32, night: 0.38 },
    moonRamp: ['#c9c9c9', '#e0e0e0', '#f2f2f2', '#ffffff'],
    sunRamp: ['#e9e9e9', '#f3f3f3', '#fafafa', '#ffffff'],
    glow: [240, 240, 240],
  },
  cyberpunk: {
    hue: 75, sat: 1.5, lum: 1.05,
    moonRamp: ['#14002e', '#6a0dad', '#e0189a', '#00fff0'],
    sunRamp: ['#4a0080', '#e0189a', '#ff6ec7', '#aef6ff'],
    glow: [224, 24, 154],
  },
  violet: {
    hue: 50, sat: 1.25, lum: 1.02,
    moonRamp: ['#2a1a5e', '#5e2bc8', '#9257f0', '#c9a8ff'],
    sunRamp: ['#3a2373', '#7a4fd0', '#b28aff', '#e2d0ff'],
    glow: [146, 87, 240],
  },
  red: {
    hue: 135, sat: 1.15, lum: 0.95,
    moonRamp: ['#4a120c', '#8f2318', '#d1482e', '#ffb08a'],
    sunRamp: ['#7a1f0f', '#c33a1a', '#f06a2e', '#ffd0a0'],
    glow: [224, 83, 54],
  },
  amber: {
    hue: 183, sat: 0.95, lum: 1.0,
    moonRamp: ['#4a2e08', '#8f5a12', '#d99a2b', '#ffe0a0'],
    sunRamp: ['#7a4a0f', '#c77a17', '#f0a830', '#fff0c8'],
    glow: [240, 170, 60],
  },
  teal: {
    hue: 320, sat: 0.82, lum: 1.0,
    moonRamp: ['#06302e', '#0f6b66', '#22b3a8', '#a8f5ec'],
    sunRamp: ['#0d4a46', '#178a80', '#3cc9bb', '#d0fff8'],
    glow: [50, 200, 185],
  },
  green: {
    hue: 265, sat: 1.1, lum: 1.0,
    moonRamp: ['#0e3324', '#166b47', '#2fa869', '#a8f0c8'],
    sunRamp: ['#1a4d2e', '#2e8b57', '#4bc981', '#d0ffe0'],
    glow: [63, 188, 122],
  },
  blue: {
    hue: 25, sat: 1.3, lum: 1.05,
    moonRamp: ['#0f2a5e', '#1f5ec8', '#3f9af0', '#a8d8ff'],
    sunRamp: ['#1a3a7a', '#2e6bc8', '#5a9af0', '#d0e8ff'],
    glow: [63, 154, 240],
  },
  rose: {
    hue: 105, sat: 1.2, lum: 1.06,
    moonRamp: ['#4a1330', '#a82660', '#e05a94', '#ffd0e0'],
    sunRamp: ['#6b1a3a', '#d14a7e', '#ff8ab0', '#ffe4ee'],
    glow: [240, 111, 168],
  },
  /* image: rebuilt from the wallpaper's own colors by setImageTheme(); these
     classic-like values only show until a wallpaper has been sampled */
  image: {
    hue: 0, sat: 1, lum: 1,
    moonRamp: ['#24348c', '#4160c8', '#7492f0', '#b3c6ff'],
    sunRamp: ['#ff8f2e', '#ffb03a', '#ffd45e', '#fff2c8'],
    glow: [99, 132, 255],
  },
};

/* ---------- image theme: palette extraction ---------- */
/* Samples the wallpaper at ~64px, bins chromatic pixels by hue (24 × 15°),
   weighting vivid mid-tones most, and picks the strongest bin as the accent
   plus a second bin ≥60° away as the secondary. Mostly-gray images come back
   as `mono` and theme like Dark/Bright. Returns null for tainted canvases. */
function extractImagePalette(img) {
  const N = 64;
  const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
  if (!w0 || !h0) return null;
  const ar = w0 / h0;
  const c = document.createElement('canvas');
  c.width = ar >= 1 ? N : Math.max(8, Math.round(N * ar));
  c.height = ar >= 1 ? Math.max(8, Math.round(N / ar)) : N;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, c.width, c.height);
  let data;
  try { data = x.getImageData(0, 0, c.width, c.height).data; } catch (e) { return null; }

  const BINS = 24;
  const bins = Array.from({ length: BINS }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
  let px = 0, lumSum = 0, satSum = 0, chroma = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const [h, s, l] = rgbToHsl(r, g, b);
    px++; lumSum += l; satSum += s;
    if (s < 15 || l < 10 || l > 92) continue;
    chroma++;
    const w = (s / 100) * (1 - Math.abs(l - 55) / 60);
    const bin = bins[Math.floor(h / (360 / BINS)) % BINS];
    bin.w += w; bin.r += r * w; bin.g += g * w; bin.b += b * w;
  }
  if (!px) return null;
  const avgL = lumSum / px, avgS = satSum / px;

  const mono = chroma / px < 0.08 || avgS < 10;
  if (mono) return { mono: true, avgL, avgS };

  // smooth across neighbours so a hue straddling two bins isn't split
  const score = bins.map((_, i) =>
    bins[i].w + 0.5 * (bins[(i + 1) % BINS].w + bins[(i + BINS - 1) % BINS].w));
  const order = score.map((s, i) => i).sort((a, b) => score[b] - score[a]);
  const colorOf = i => {
    let w = 0, r = 0, g = 0, b = 0;
    for (const j of [i - 1, i, i + 1]) {
      const bn = bins[(j + BINS) % BINS];
      w += bn.w; r += bn.r; g += bn.g; b += bn.b;
    }
    return [r / w, g / w, b / w];
  };
  const top = order[0];
  const second = order.find(i => {
    const d = Math.min(Math.abs(i - top), BINS - Math.abs(i - top));
    return d >= 4 && score[i] >= score[top] * 0.06; // a small vivid sun still counts
  });
  return {
    mono: false, avgL, avgS,
    primary: colorOf(top),
    secondary: second != null ? colorOf(second) : null,
  };
}

// turns an extracted palette into the THEMES.image entry plus the UI accent
// colors the CSS derives everything else from
function buildImageTheme(p) {
  const hex = c => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  if (!p || p.mono) {
    const l = p ? clamp(p.avgL, 20, 80) : 50;
    const ramp = [l * 0.3, l * 0.55, l * 0.85, Math.min(100, l * 0.85 + 30)]
      .map(v => hex(hslToRgb(0, 0, v)));
    const g = Math.round(clamp(l * 2.55 + 60, 110, 230));
    return {
      theme: { hue: 0, sat: 0.12, lum: p && p.avgL > 60 ? 1.15 : 0.8, moonRamp: ramp, sunRamp: ramp, glow: [g, g, g] },
      accent: hex([g, g, g]), accent2: hex([g, g, g]), mono: true,
    };
  }
  const [h1, s1] = rgbToHsl(...p.primary);
  const [h2, s2] = p.secondary ? rgbToHsl(...p.secondary) : [(h1 + 35) % 360, s1];
  // accents are normalised into a legible band; the image's own saturation
  // still decides how loud the world gets
  const as1 = clamp(s1, 40, 85), as2 = clamp(s2, 40, 85);
  const accent = hslToRgb(h1, as1, 60);
  const accent2 = hslToRgb(h2, as2, 64);
  const ramp = (h, s, lift) => [14, 32, 54, 84].map((l, i) =>
    hex(hslToRgb(h, clamp(s - i * 6, 25, 90), Math.min(96, l + lift))));
  return {
    theme: {
      hue: ((h1 - HUE_REF) % 360 + 360) % 360 || 360, // 0 would mean pass-through
      sat: clamp(0.55 + p.avgS / 80, 0.6, 1.25),
      lum: 1,
      moonRamp: ramp(h1, as1, 0),
      sunRamp: ramp(h2, as2, 6),
      glow: accent,
    },
    accent: hex(accent), accent2: hex(accent2), mono: false,
  };
}

// installs a built image theme: THEMES.image for the canvas, CSS variables
// and the settings swatch for the chrome
function setImageTheme(built) {
  THEMES.image = built.theme;
  const s = document.body.style;
  s.setProperty('--img-accent', built.accent);
  s.setProperty('--img-accent-2', built.accent2);
  document.body.toggleAttribute('data-img-mono', !!built.mono);
  const sw = document.getElementById('img-sw');
  if (sw) sw.style.setProperty('--sw', `linear-gradient(135deg, ${built.accent} 50%, ${built.accent2} 50%)`);
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d > 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
      case g: h = ((b - r) / d + 2) * 60; break;
      default: h = ((r - g) / d + 4) * 60;
    }
  }
  return [h, s * 100, l * 100];
}

function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

// applies the theme's hue/saturation/lightness transform. Chromatic themes
// anchor every color on their own hue: these palettes are built around a
// blue family (~215°), and rotating base oranges by a fixed delta dragged
// them clean off-theme — a "red" evening sunset went mint green. Anchoring
// keeps sat/lum as multipliers, so phases still differ by brightness.
const HUE_REF = 215;

function tintRGB(c, t) {
  const [h, s, l] = rgbToHsl(c[0], c[1], c[2]);
  const nh = t.hue ? (HUE_REF + t.hue) % 360 : h;
  const ns = Math.max(0, Math.min(100, s * t.sat));
  let nl = Math.max(0, Math.min(100, l * t.lum));
  if (t.lift) nl += (100 - nl) * t.lift;
  return hslToRgb(nh, ns, nl);
}

// applies the theme transform to a whole phase palette
function tintPalette(pal, themeKey) {
  const t = THEMES[themeKey] || THEMES.classic;
  // blend an optional phase-keyed lift the same way palette colors blend,
  // so the transition between lifted phases stays seamless
  let tt = t;
  if (t.liftByPhase && pal.phase) {
    const a = t.liftByPhase[pal.phase] ?? 0;
    const b = t.liftByPhase[pal.next] ?? 0;
    tt = { ...t, lift: a + (b - a) * (pal.k || 0) };
  }
  const out = { ...pal };
  for (const key of ['skyTop', 'skyBot', 'gridDim', 'gridBright', 'sparkle', 'sunGlow']) {
    out[key] = tintRGB(pal[key], tt);
  }
  out.star = tintRGB([150, 175, 255], tt);
  return out;
}

/* ================= flickering-grid background ================= */
/* Fullscreen canvas take on Velora's flickering grid: a grid of squares
   fading in and out on staggered timers, plus pixel stars and a sun/moon
   themed by the time of day. */

const bgApi = (function background() {
  const canvas = document.getElementById('bg');
  const ctx = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const PITCH = 12;   // distance between squares
  const SIZE = 6;     // square side
  const LEVELS = 32;  // opacity quantization for cached colors

  let pal = DayCycle.palette(new Date());
  let sunAt = DayCycle.sunPos(new Date());
  let moonAt = DayCycle.moonPos(new Date());
  let colorCache = [];
  let themeKey = 'classic';
  let bgMode = 'scene';
  let modeState = {};
  let wallpaperImg = null;
  let wallpaperVideo = null; // video wallpapers play live in photo mode; the img stays a static sample
  let dotSize = 14;
  // user filters for wallpaper modes (blur/brightness) + the solid gradient colors
  let filters = { blur: 0, bright: 1 };
  let solidA = '#101a3a', solidB = '#3a2a6a';
  // `scale` = target-canvas pixels per screen pixel, so the blur slider means the
  // same on-screen softness on a full-res photo canvas and a tiny dither grid
  const filterCss = (scale = 1) =>
    (filters.blur > 0 || filters.bright !== 1)
      ? `blur(${+(filters.blur * scale).toFixed(2)}px) brightness(${filters.bright})` : 'none';

  // pointer interplay: the grid/dots/particles brighten softly around the
  // cursor, and a click on empty background sends a ripple through the scene.
  // Strength eases in/out so the glow never pops; off under reduced motion.
  const pointer = { x: -1e4, y: -1e4, on: false, k: 0, enabled: true };
  let ripples = [];
  let focusBoost = 0, focusTarget = 0; // search-focus warmth (lamp)
  const POINTER_R = 150;

  addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.on = true;
  }, { passive: true });
  document.addEventListener('pointerleave', () => { pointer.on = false; });
  addEventListener('blur', () => { pointer.on = false; });

  // 0..1 extra brightness at (x, y) from the cursor glow and any live ripples
  function boostAt(x, y, now) {
    let b = 0;
    if (pointer.k > 0.01) {
      const d = Math.hypot(x - pointer.x, y - pointer.y);
      if (d < POINTER_R) b += (1 - d / POINTER_R) ** 2 * 0.55 * pointer.k;
    }
    for (const r of ripples) {
      const age = Math.max(0, now - r.t0) / 1000; // frame time can precede the click
      const ring = age * 520;
      const d = Math.abs(Math.hypot(x - r.x, y - r.y) - ring);
      if (d < 26) b += (1 - d / 26) * 0.7 * Math.max(0, 1 - age / 1.4);
    }
    return b;
  }

  const rgba = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  function buildColorCache() {
    colorCache = [];
    for (let i = 0; i < LEVELS; i++) {
      const t = i / (LEVELS - 1);
      const c = [0, 1, 2].map(j => Math.round(pal.gridDim[j] + (pal.gridBright[j] - pal.gridDim[j]) * t));
      colorCache.push(`rgba(${c[0]},${c[1]},${c[2]},${t.toFixed(3)})`);
    }
  }

  let W = 0, H = 0, cols = 0, rows = 0;
  let o, target, speed, floor; // per-cell opacity state
  let stars = [], sparkles = [];
  let moon = null, sun = null;

  function buildGrid() {
    cols = Math.ceil(W / PITCH) + 1;
    rows = Math.ceil(H / PITCH) + 1;
    const n = cols * rows;
    o = new Float32Array(n);
    target = new Float32Array(n);
    speed = new Float32Array(n);
    floor = new Float32Array(n);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        // sky stays dark, bottom rows glow like water
        floor[i] = 0.035 + 0.22 * Math.pow(r / rows, 1.8) + Math.random() * 0.04;
        speed[i] = 1.2 + Math.random() * 2.3;
        target[i] = floor[i] * (0.4 + Math.random() * 0.6);
        o[i] = target[i];
      }
    }
  }

  function buildStars() {
    stars = [];
    sparkles = [];
    const nStars = 8 + Math.round((W * H) / 300000);
    for (let i = 0; i < nStars; i++) {
      stars.push({
        x: Math.round(Math.random() * (W / PITCH)) * PITCH,
        y: Math.round(Math.random() * H * 0.55 / PITCH) * PITCH,
        s: 1 + Math.round(Math.random() * 2),           // length in cells
        base: 0.2 + Math.random() * 0.3,
        w: 0.4 + Math.random() * 1.2,
        ph: Math.random() * Math.PI * 2,
        plus: Math.random() < 0.55,                      // plus-sign or dot
      });
    }
    const nSpark = 26;
    for (let i = 0; i < nSpark; i++) {
      sparkles.push({
        x: Math.round(Math.random() * (W / PITCH)) * PITCH,
        y: Math.round((H * 0.62 + Math.random() * H * 0.36) / PITCH) * PITCH,
        base: 0.15 + Math.random() * 0.35,
        w: 0.6 + Math.random() * 1.6,
        ph: Math.random() * Math.PI * 2,
      });
    }
  }

  // builds a pixel circle (like the moon) with a color ramp and optional craters
  function pixelDisc(ramp, craters) {
    const RES = 30, R = 13, C = RES / 2;
    const off = document.createElement('canvas');
    off.width = off.height = RES;
    const octx = off.getContext('2d');

    for (let y = 0; y < RES; y++) {
      for (let x = 0; x < RES; x++) {
        const dx = x - C + 0.5, dy = y - C + 0.5;
        const dist = Math.hypot(dx, dy);
        if (dist > R) continue;
        let lvl;
        if (craters) {
          // moon: highlight top-left, shade bottom-right, dark rim, craters
          lvl = 2;
          if (dist < R * 0.72 && dx < -1 && dy < -1) lvl = 3;
          if (dx * 0.5 + dy * 0.65 > R * 0.42 || dist > R - 1.3) lvl = Math.min(lvl, 1);
          for (const [cx, cy, cr] of craters) {
            if (Math.hypot(x - cx, y - cy) < cr) { lvl = 0; break; }
          }
        } else {
          // sun: hot core, softer rim
          lvl = dist < R * 0.62 ? 3 : dist < R - 1.6 ? 2 : 1;
        }
        if (Math.random() < 0.08) lvl += Math.random() < 0.5 ? -1 : 0; // light dither
        octx.fillStyle = ramp[Math.max(0, Math.min(ramp.length - 1, lvl))];
        octx.fillRect(x, y, 1, 1);
      }
    }
    return off;
  }

  function buildCelestial() {
    const th = THEMES[themeKey] || THEMES.classic;
    moon = {
      img: pixelDisc(th.moonRamp, [[10, 9, 2.6], [20, 12, 2.2], [14, 19, 1.8], [22, 20, 1.4], [9, 15, 1.5], [18, 6, 1.3]]),
      size: 22 * PITCH,
    };
    sun = {
      img: pixelDisc(th.sunRamp, null),
      size: 20 * PITCH,
    };
  }

  function drawGlow(x, y, size, color, alpha) {
    const glow = ctx.createRadialGradient(x, y, size * 0.2, x, y, size * 0.85);
    glow.addColorStop(0, rgba(color, alpha));
    glow.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(x - size, y - size, size * 3, size * 3);
  }

  function step(dt) {
    const n = cols * rows;
    for (let i = 0; i < n; i++) {
      const bright = target[i] > 0.5;
      const rate = bright ? 0.85 : 0.11; // flips per second
      if (Math.random() < rate * dt / 1000) {
        target[i] = bright
          ? floor[i] * (0.35 + Math.random() * 0.5)
          : Math.min(0.8, 0.5 + Math.random() * 0.3);
      }
      o[i] += (target[i] - o[i]) * Math.min(1, dt / 1000 * speed[i]);
    }
  }

  function draw(t, dt = 16) {
    // ease the pointer glow and focus warmth, retire finished ripples
    const want = pointer.on && pointer.enabled && !reduced ? 1 : 0;
    pointer.k += (want - pointer.k) * Math.min(1, dt / 180);
    focusBoost += (focusTarget - focusBoost) * Math.min(1, dt / 400);
    if (ripples.length) ripples = ripples.filter(r => t - r.t0 < 1400);

    // base sky for every mode
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgba(pal.skyTop));
    g.addColorStop(1, rgba(pal.skyBot));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    if (bgMode === 'scene') drawScene(t);
    else if (bgMode === 'photo' && !modeState.photo) drawScene(t); // no wallpaper yet
    else drawAltMode(t, dt);
    drawWeather(t, dt);
  }

  function drawScene(t) {
    // grid squares — cells near the cursor or a ripple ring glow brighter
    const half = (PITCH - SIZE) / 2;
    const live = pointer.k > 0.01 || ripples.length > 0;
    const pr0 = Math.floor((pointer.y - POINTER_R) / PITCH), pr1 = Math.ceil((pointer.y + POINTER_R) / PITCH);
    const pc0 = Math.floor((pointer.x - POINTER_R) / PITCH), pc1 = Math.ceil((pointer.x + POINTER_R) / PITCH);
    for (let r = 0; r < rows; r++) {
      const y = r * PITCH;
      const rowLive = live && (ripples.length > 0 || (r >= pr0 && r <= pr1));
      for (let c = 0; c < cols; c++) {
        let v = o[r * cols + c];
        if (rowLive && (ripples.length > 0 || (c >= pc0 && c <= pc1))) {
          v = Math.min(1, v + boostAt(c * PITCH + PITCH / 2, y + PITCH / 2, t));
        }
        if (v < 0.02) continue;
        ctx.fillStyle = colorCache[Math.round(v * (LEVELS - 1))];
        ctx.fillRect(c * PITCH + half, y + half, SIZE, SIZE);
      }
    }

    // twinkling plus-stars and dots
    if (pal.starA > 0.01) {
      for (const s of stars) {
        const a = (s.base + (1 - s.base) * Math.pow(Math.max(0, Math.sin(t / 1000 * s.w + s.ph)), 3)) * pal.starA;
        ctx.fillStyle = rgba(pal.star, +a.toFixed(3));
        if (s.plus) {
          for (let k = -s.s; k <= s.s; k++) {
            ctx.fillRect(s.x + half, s.y + k * PITCH + half, SIZE, SIZE);
            if (k !== 0) ctx.fillRect(s.x + k * PITCH + half, s.y + half, SIZE, SIZE);
          }
        } else {
          ctx.fillRect(s.x + half, s.y + half, SIZE, SIZE);
        }
      }
    }

    // sparkles on the water
    if (pal.sparklesOn !== false) {
      for (const s of sparkles) {
        const a = s.base + (1 - s.base) * Math.pow(Math.max(0, Math.sin(t / 1000 * s.w + s.ph)), 4);
        ctx.fillStyle = rgba(pal.sparkle, a);
        ctx.fillRect(s.x + half, s.y + half, SIZE, SIZE);
      }
    }

    // sun by day, moon by night — both drift right → left with the clock
    if (pal.sun) {
      const sx = Math.round(sunAt.x * W / PITCH) * PITCH;
      const sy = Math.round(sunAt.y * H / PITCH) * PITCH;
      drawGlow(sx, sy, sun.size, pal.sunGlow, 0.24);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sun.img, sx - sun.size / 2, sy - sun.size / 2, sun.size, sun.size);
    } else if (pal.moon && moon) {
      const mx = Math.round(moonAt.x * W / PITCH) * PITCH;
      const my = Math.round(moonAt.y * H / PITCH) * PITCH;
      drawGlow(mx, my, moon.size, (THEMES[themeKey] || THEMES.classic).glow, 0.12);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(moon.img, mx - moon.size / 2, my - moon.size / 2, moon.size, moon.size);
    }
  }

  /* ---------- alternative backgrounds (Velora-inspired) ---------- */

  function drawAltMode(t, dt) {
    switch (bgMode) {
      case 'aurora': return drawAurora(t);
      case 'grid': return drawGridPattern(t);
      case 'lamp': return drawLamp(t, dt);
      case 'noise': return drawNoise(t);
      case 'particles': return drawParticles(t, dt);
      case 'retro': return drawRetro(t);
      case 'shooting': return drawShooting(t, dt);
      case 'grain': return drawGrain(t, dt);
      case 'halftone': return drawHalftone(t);
      case 'dither': return drawDither();
      case 'photo': return drawPhoto(t);
      case 'solid': return drawSolid(t);
    }
  }

  /* solid — a two-color gradient that still breathes with the phase stars */
  function drawSolid(t) {
    const g = ctx.createLinearGradient(0, 0, W * 0.25, H);
    g.addColorStop(0, solidA);
    g.addColorStop(1, solidB);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    drawStarsFaint(t, 0.8);
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }

  // a video wallpaper only needs to play while Photo draws it live; the other
  // wallpaper modes use a still frame, so don't burn CPU decoding it there
  function syncVideoPlayback() {
    if (!wallpaperVideo) return;
    if (bgMode === 'photo' && !reduced) wallpaperVideo.play().catch(() => { });
    else wallpaperVideo.pause();
  }

  /* photo — the wallpaper itself, cover-fit with a slow Ken Burns drift and a
     phase-tinted veil so it still follows the day/night cycle and the theme */
  const PHOTO_VEIL = { morning: 0.16, day: 0.08, evening: 0.34, night: 0.5 };

  function buildPhoto() {
    if (wallpaperVideo) { modeState.photo = { video: wallpaperVideo, over: 1.06 }; return; }
    const src = wallpaperImg;
    if (!src || !src.width) { modeState.photo = null; return; }
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const OVER = 1.06; // headroom for the drift
    const c = document.createElement('canvas');
    c.width = Math.round(W * OVER * dpr);
    c.height = Math.round(H * OVER * dpr);
    const oc = c.getContext('2d');
    oc.filter = filterCss(dpr);
    // blur pulls in transparent pixels at the edges; overdraw by ~2 radii so
    // the frame stays opaque instead of getting a dark halo
    const pad = filters.blur * dpr * 2;
    const scale = Math.max((c.width + pad * 2) / src.width, (c.height + pad * 2) / src.height);
    const dw = src.width * scale, dh = src.height * scale;
    oc.imageSmoothingQuality = 'high';
    oc.drawImage(src, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
    modeState.photo = { img: c, over: OVER };
  }

  function drawPhoto(t) {
    const p = modeState.photo;
    if (!p) return;
    const pw = W * p.over, ph = H * p.over;
    const drift = reduced ? 0 : 1;
    const ox = (pw - W) / 2 * (1 + 0.9 * Math.sin(t / 23000) * drift);
    const oy = (ph - H) / 2 * (1 + 0.9 * Math.sin(t / 31000 + 1.3) * drift);
    ctx.imageSmoothingEnabled = true;
    if (p.video) {
      const v = p.video;
      if (v.readyState >= 2 && v.videoWidth) {
        ctx.filter = filterCss();
        const scale = Math.max(pw / v.videoWidth, ph / v.videoHeight);
        ctx.drawImage(v, (pw - v.videoWidth * scale) / 2 - ox, (ph - v.videoHeight * scale) / 2 - oy,
          v.videoWidth * scale, v.videoHeight * scale);
        ctx.filter = 'none';
      } else {
        ctx.fillStyle = '#04070f';
        ctx.fillRect(0, 0, W, H);
      }
    } else {
      ctx.drawImage(p.img, -ox, -oy, pw, ph);
    }
    const A = PHOTO_VEIL[pal.phase] ?? 0.3, B = PHOTO_VEIL[pal.next] ?? A;
    const a = A + (B - A) * (pal.k || 0);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgba(pal.skyTop, a));
    g.addColorStop(1, rgba(pal.skyBot, a * 0.7));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // vignette keeps the centered UI readable on busy photos
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, `rgba(0,0,0,${(0.18 + a * 0.4).toFixed(3)})`);
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
    drawStarsFaint(t, 0.5);
  }

  function drawStarsFaint(t, factor) {
    if (pal.starA <= 0.01) return;
    const half = (PITCH - SIZE) / 2;
    for (const s of stars) {
      const a = (s.base + (1 - s.base) * Math.pow(Math.max(0, Math.sin(t / 1000 * s.w + s.ph)), 3)) * pal.starA * factor;
      ctx.fillStyle = rgba(pal.star, +a.toFixed(3));
      ctx.fillRect(s.x + half, s.y + half, SIZE, SIZE);
    }
  }

  function drawAurora(t) {
    drawStarsFaint(t, 0.6);
    // one aurora color set per theme, cached until the theme changes
    if (modeState.auroraFor !== themeKey) {
      modeState.auroraFor = themeKey;
      modeState.auroraCols = [
        tintRGB([64, 224, 160], THEMES[themeKey]),
        tintRGB([120, 96, 255], THEMES[themeKey]),
        tintRGB([36, 160, 255], THEMES[themeKey]),
      ];
    }
    ctx.globalCompositeOperation = 'lighter';
    modeState.auroraCols.forEach((c, i) => {
      const ph = i * 2.1;
      const x = W * (0.25 + 0.25 * i) + Math.sin(t / 9000 + ph) * W * 0.12;
      const y = H * (0.30 + 0.08 * Math.sin(t / 7000 + ph * 1.7));
      const r = Math.min(W, H) * (0.42 + 0.06 * Math.sin(t / 6000 + ph));
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(c, 0.15));
      g.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    });
    ctx.globalCompositeOperation = 'source-over';
  }

  /* grid — graph paper that drifts very slowly, with brighter intersection
     ticks and a soft spotlight that follows the cursor */
  function drawGridPattern(t) {
    const step = 44;
    const shift = reduced ? 0 : (t / 1000 * 3) % step; // ~3px/s diagonal drift
    const path = new Path2D();
    for (let x = step - shift; x < W; x += step) { path.moveTo(x + 0.5, 0); path.lineTo(x + 0.5, H); }
    for (let y = step - shift; y < H; y += step) { path.moveTo(0, y + 0.5); path.lineTo(W, y + 0.5); }
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(pal.gridBright, 0.13);
    ctx.stroke(path);

    // intersection ticks, fading toward the top like the scene's water glow
    for (let y = step - shift; y < H; y += step) {
      const a = 0.12 + 0.22 * (y / H);
      ctx.fillStyle = rgba(pal.gridBright, +a.toFixed(3));
      for (let x = step - shift; x < W; x += step) ctx.fillRect(x - 1, y - 1, 3, 3);
    }

    if (pointer.k > 0.01) {
      const R = POINTER_R * 1.8;
      const g = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, R);
      g.addColorStop(0, rgba(pal.gridBright, 0.55 * pointer.k));
      g.addColorStop(1, rgba(pal.gridBright, 0));
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.5;
      ctx.stroke(path);
    }
    for (const r of ripples) {
      const age = Math.max(0, t - r.t0) / 1000; // frame time can precede the click
      ctx.strokeStyle = rgba(pal.gridBright, Math.max(0, 0.5 * (1 - age / 1.4)));
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(r.x, r.y, age * 520, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  /* lamp — warm light follows the clock instead of the theme tint:
     a faint afterglow in the morning, effectively off by day,
     switching on through dusk, full Reading-Lamp amber at night */
  const LAMP_PHASES = {
    morning: { cone: [255, 217, 166], a: 0.35 },
    day:     { cone: [255, 226, 176], a: 0.08 },
    evening: { cone: [255, 188, 114], a: 0.75 },
    night:   { cone: [255, 197, 132], a: 1 },
  };
  const LAMP_CORE = [255, 243, 217];

  function lampNow() {
    const A = LAMP_PHASES[pal.phase] || LAMP_PHASES.night;
    const B = LAMP_PHASES[pal.next] || A;
    const k = pal.k || 0;
    return {
      cone: DayCycle.lerpColor(A.cone, B.cone, k),
      a: A.a + (B.a - A.a) * k,
    };
  }

  // the cone is pre-rendered and blurred once per palette change — stacked
  // semi-transparent polygons band visibly, and per-frame blur would cost
  function buildLamp() {
    const { cone, a } = lampNow();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const c = document.createElement('canvas');
    c.width = W * dpr;
    c.height = H * dpr;
    const oc = c.getContext('2d');
    oc.scale(dpr, dpr);
    oc.filter = 'blur(26px)';
    const g = oc.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgba(cone, 0.42 * a));
    g.addColorStop(0.55, rgba(cone, 0.16 * a));
    g.addColorStop(1, rgba(cone, 0.03 * a));
    oc.fillStyle = g;
    oc.beginPath();
    oc.moveTo(W / 2 - 26, -10);
    oc.lineTo(W / 2 + 26, -10);
    oc.lineTo(W / 2 + W * 0.42, H);
    oc.lineTo(W / 2 - W * 0.42, H);
    oc.closePath();
    oc.fill();
    modeState.lamp = c;
  }

  function drawLamp(t, dt = 16) {
    const { cone, a } = lampNow();
    // gentler than the old ±6%: a bulb settles, it doesn't sputter
    const flick = reduced ? 1 : 0.975 + 0.025 * Math.sin(t / 420) * Math.sin(t / 173);
    if (modeState.lamp) {
      ctx.globalAlpha = flick;
      ctx.drawImage(modeState.lamp, 0, 0, W, H);
      // search-focus warmth: the lamp brightens ~15% while you type
      if (focusBoost > 0.01) {
        ctx.globalAlpha = 0.15 * focusBoost;
        ctx.drawImage(modeState.lamp, 0, 0, W, H);
      }
      ctx.globalAlpha = 1;
    }

    // dust motes drifting through the beam — the theme's signature moment
    const motes = modeState.lampMotes;
    if (motes && a > 0.05 && !reduced) {
      const topHalf = 26, botHalf = W * 0.42;
      for (const m of motes) {
        m.fy += (m.sp * dt) / (1000 * H);
        if (m.fy > 1) {
          m.fy -= 1;
          m.fx = Math.random() * 1.7 - 0.85;
        }
        const half = (topHalf + (botHalf - topHalf) * m.fy) * 0.85;
        const x = W / 2 + (m.fx + 0.06 * Math.sin(t / 1000 * m.sw + m.ph)) * half;
        const y = m.fy * H;
        const tw = 0.55 + 0.45 * Math.sin(t / 1000 * m.w + m.ph);
        ctx.fillStyle = rgba(LAMP_CORE, +(m.a * tw * a).toFixed(3));
        ctx.fillRect(x, y, m.s, m.s);
      }
    }

    const lx = W / 2, ly = -10;
    const rg = ctx.createRadialGradient(lx, ly + 24, 0, lx, ly + 24, 130);
    rg.addColorStop(0, rgba(LAMP_CORE, Math.min(1, 0.8 * a * flick * (1 + 0.15 * focusBoost))));
    rg.addColorStop(1, rgba(cone, 0));
    ctx.fillStyle = rg;
    ctx.fillRect(lx - 140, ly - 116, 280, 280);
  }

  function drawNoise(t) {
    const n = modeState.noise;
    if (!n) return;
    // a slow breathing light under the grain gives the static texture depth
    const br = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t / 5200);
    const lx = W * (0.5 + 0.18 * Math.sin(t / 17000)), ly = H * (0.42 + 0.08 * Math.cos(t / 13000));
    const lg = ctx.createRadialGradient(lx, ly, 0, lx, ly, Math.max(W, H) * 0.6);
    lg.addColorStop(0, rgba(pal.gridBright, 0.10 + 0.06 * br));
    lg.addColorStop(1, rgba(pal.gridBright, 0));
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, W, H);
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
    const ox = reduced ? 0 : Math.floor(Math.random() * n.width);
    const oy = reduced ? 0 : Math.floor(Math.random() * n.height);
    for (let x = -n.width; x < W + n.width; x += n.width) {
      for (let y = -n.height; y < H + n.height; y += n.height) {
        ctx.drawImage(n, x - ox, y - oy);
      }
    }
  }

  /* particles — rising dust that links into faint constellations when motes
     drift close, and reaches toward the cursor */
  function drawParticles(t, dt) {
    const parts = modeState.parts;
    for (const p of parts) {
      p.y -= (p.sp * dt) / 1000;
      p.x += Math.sin(t / 1000 + p.sw) * 0.35;
      if (p.y < -6) { p.y = H + 6; p.x = Math.random() * W; }
      if (p.x < -6) p.x = W + 6;
      if (p.x > W + 6) p.x = -6;
    }
    const LINK = 96;
    ctx.lineWidth = 1;
    for (let i = 0; i < parts.length; i++) {
      const a = parts[i];
      for (let j = i + 1; j < parts.length; j++) {
        const b = parts[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        if (dx > LINK || dx < -LINK || dy > LINK || dy < -LINK) continue;
        const d = Math.hypot(dx, dy);
        if (d >= LINK) continue;
        ctx.strokeStyle = rgba(pal.sparkle, +((1 - d / LINK) * 0.16).toFixed(3));
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      if (pointer.k > 0.01) {
        const d = Math.hypot(a.x - pointer.x, a.y - pointer.y);
        if (d < POINTER_R * 1.2) {
          ctx.strokeStyle = rgba(pal.sparkle, +((1 - d / (POINTER_R * 1.2)) * 0.35 * pointer.k).toFixed(3));
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(pointer.x, pointer.y); ctx.stroke();
        }
      }
    }
    for (const p of parts) {
      ctx.fillStyle = rgba(pal.sparkle, p.a);
      ctx.fillRect(p.x, p.y, p.r * 2, p.r * 2);
    }
  }

  function drawRetro(t) {
    const hz = H * 0.44;
    const c = pal.gridBright;
    drawStarsFaint(t, 0.8);

    // synthwave sun sinking into the horizon, striped toward its base;
    // colored by the theme's sun ramp (moon ramp at night)
    if (pal.sun || pal.moon) {
      const th = THEMES[themeKey] || THEMES.classic;
      const ramp = pal.sun ? th.sunRamp : th.moonRamp;
      const R = Math.min(W, H) * 0.17;
      const cx = W / 2, cy = hz - R * 0.28;
      drawGlow(cx, cy, R * 2.2, pal.sun ? pal.sunGlow : th.glow, pal.sun ? 0.22 : 0.14);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, hz);
      ctx.clip();
      const sg = ctx.createLinearGradient(0, cy - R, 0, cy + R);
      sg.addColorStop(0, ramp[3]);
      sg.addColorStop(0.5, ramp[2]);
      sg.addColorStop(1, ramp[1]);
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();
      // stripes cut out of the lower half, thickening and scrolling downward
      ctx.globalCompositeOperation = 'destination-out';
      const scroll = reduced ? 0 : (t / 1000 * 6) % 14;
      for (let y = cy + scroll; y < cy + R; y += 14) {
        const f = (y - cy) / R;
        ctx.fillRect(cx - R, y, R * 2, 1 + f * 6);
      }
      ctx.restore();
      // the cut-outs punched through the sky too — repaint it behind the sun
      ctx.save();
      ctx.globalCompositeOperation = 'destination-over';
      const g0 = ctx.createLinearGradient(0, 0, 0, H);
      g0.addColorStop(0, rgba(pal.skyTop));
      g0.addColorStop(1, rgba(pal.skyBot));
      ctx.fillStyle = g0;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    const g = ctx.createLinearGradient(0, hz - 70, 0, hz + 2);
    g.addColorStop(0, rgba(c, 0));
    g.addColorStop(1, rgba(c, 0.35));
    ctx.fillStyle = g;
    ctx.fillRect(0, hz - 70, W, 72);
    ctx.strokeStyle = rgba(c, 0.55);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, hz); ctx.lineTo(W, hz);
    ctx.stroke();
    ctx.strokeStyle = rgba(c, 0.22);
    ctx.beginPath();
    const vp = W / 2;
    for (let i = -12; i <= 12; i++) {
      ctx.moveTo(vp + i * 26, hz);
      ctx.lineTo(vp + i * W * 0.14, H);
    }
    ctx.stroke();
    const speed = t / 1000 * 0.6;
    ctx.strokeStyle = rgba(c, 0.30);
    ctx.beginPath();
    for (let i = 0; i < 14; i++) {
      const f = (i + (speed % 1)) / 14;
      const y = hz + (H - hz) * f * f;
      ctx.moveTo(0, y); ctx.lineTo(W, y);
    }
    ctx.stroke();
  }

  function drawShooting(t, dt) {
    // dense starfield backdrop
    for (const s of modeState.shootStars) {
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(t / 1000 * s.w + s.ph));
      ctx.fillStyle = rgba(pal.star, +(s.a * tw).toFixed(3));
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
    if (!modeState.meteor && Math.random() < (dt / 1000) * 0.3) {
      const fromLeft = Math.random() < 0.5;
      modeState.meteor = {
        x: W * (0.15 + Math.random() * 0.7),
        y: H * (0.04 + Math.random() * 0.25),
        vx: (fromLeft ? 1 : -1) * (W * 0.28) / 1000,
        vy: (H * 0.16) / 1000,
        life: 900,
      };
    }
    const m = modeState.meteor;
    if (!m) return;
    m.x += m.vx * dt; m.y += m.vy * dt; m.life -= dt;
    const len = 130;
    const tailX = m.x - m.vx / Math.hypot(m.vx, m.vy) * len;
    const tailY = m.y - m.vy / Math.hypot(m.vx, m.vy) * len;
    const fade = Math.min(1, m.life / 500);
    const g = ctx.createLinearGradient(m.x, m.y, tailX, tailY);
    g.addColorStop(0, rgba(pal.sparkle, 0.9 * fade));
    g.addColorStop(1, rgba(pal.sparkle, 0));
    ctx.strokeStyle = g;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(m.x, m.y); ctx.lineTo(tailX, tailY);
    ctx.stroke();
    if (m.life <= 0 || m.y > H + 40 || m.x < -60 || m.x > W + 60) modeState.meteor = null;
  }

  function drawGrain(t, dt) {
    // vivid drifting blobs, like a living gradient wallpaper
    if (modeState.grainFor !== themeKey) {
      modeState.grainFor = themeKey;
      modeState.grainCols = [
        tintRGB([255, 110, 170], THEMES[themeKey]),
        tintRGB([110, 150, 255], THEMES[themeKey]),
        tintRGB([255, 200, 110], THEMES[themeKey]),
        tintRGB([120, 230, 200], THEMES[themeKey]),
      ];
    }
    ctx.globalCompositeOperation = 'lighter';
    modeState.grainCols.forEach((c, i) => {
      const ph = i * 1.7;
      const x = W * (0.2 + 0.2 * i) + Math.sin(t / 7000 + ph) * W * 0.16;
      const y = H * (0.3 + 0.1 * Math.sin(t / 5200 + ph * 1.4));
      const r = Math.min(W, H) * (0.38 + 0.08 * Math.sin(t / 4500 + ph));
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(c, 0.30));
      g.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    });
    ctx.globalCompositeOperation = 'source-over';
    // film grain
    const n = modeState.noise;
    if (!n) return;
    const ox = reduced ? 0 : Math.floor(Math.random() * n.width);
    const oy = reduced ? 0 : Math.floor(Math.random() * n.height);
    ctx.globalAlpha = 0.55;
    for (let x = -n.width; x < W + n.width; x += n.width) {
      for (let y = -n.height; y < H + n.height; y += n.height) {
        ctx.drawImage(n, x - ox, y - oy);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawHalftone(t) {
    const sample = modeState.halftone;
    if (!sample) return;
    const cell = dotSize;
    // bright dots mixed with the theme accent so they read on any sky
    const base = [0, 1, 2].map(i => Math.round(pal.star[i] * 0.45 + 255 * 0.55));
    const warm = pal.sunGlow;
    const live = pointer.k > 0.01 || ripples.length > 0;
    for (let gy = 0; gy < sample.rows; gy++) {
      for (let gx = 0; gx < sample.cols; gx++) {
        const cx = gx * cell + cell / 2;
        const cy = gy * cell + cell / 2;
        let lum = sample.data[gy * sample.cols + gx];
        // dots swell around the cursor — the image "lights up" under it
        if (live) lum = Math.min(1, lum + boostAt(cx, cy, t) * 0.8);
        if (lum < 0.03) continue;
        const r = cell * 0.46 * (0.25 + lum * 0.75);
        const mixX = gx / sample.cols;
        const col = [0, 1, 2].map(i => Math.round(base[i] + (warm[i] - base[i]) * mixX));
        ctx.fillStyle = rgba(col, +(0.35 + lum * 0.55).toFixed(3));
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /* dither — the wallpaper as an ordered (Bayer 8×8) dither of tiny square
     pixels in the photo's own colours, faded out towards the bottom and calmed
     behind the centre column so the clock and search stay readable. Baked once
     per resize / wallpaper; the cursor lifts a soft lit patch out of it. */
  const BAYER8 = (() => {
    const m = [[0, 2], [3, 1]];
    let b = m;
    while (b.length < 8) {
      const n = b.length, nb = [];
      for (let y = 0; y < n * 2; y++) {
        nb.push([]);
        for (let x = 0; x < n * 2; x++) {
          nb[y].push(4 * b[y % n][x % n] + m[(y / n) | 0][(x / n) | 0]);
        }
      }
      b = nb;
    }
    return b.map(r => r.map(v => (v + 0.5) / 64));
  })();
  const DITHER_CELL = 2;      // CSS px per dither pixel
  const DITHER_OPACITY = 0.55;

  // tiny value noise for the no-wallpaper fallback scene
  function vnoise(seed) {
    const g = new Float32Array(256);
    let s = seed;
    for (let i = 0; i < 256; i++) { s = (s * 16807) % 2147483647; g[i] = s / 2147483647; }
    const at = (x, y) => g[((x & 15) + (y & 15) * 16) & 255];
    const sm = t => t * t * (3 - 2 * t);
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
      const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
      return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
    };
  }
  function fbm(n, x, y, oct) {
    let v = 0, amp = 0.5, f = 1;
    for (let i = 0; i < oct; i++) { v += amp * n(x * f, y * f); amp *= 0.5; f *= 2; }
    return v;
  }

  // a cloudy mountain range in low-res RGB, used until a wallpaper is set
  function ditherFallback(cols, rows) {
    const n = vnoise(1337);
    const out = new Uint8ClampedArray(cols * rows * 4);
    const sx = 6 / cols;
    for (let y = 0; y < rows; y++) {
      const fy = y / rows;
      for (let x = 0; x < cols; x++) {
        const fx = x / cols;
        // sky: cloud banks, brighter up top
        const cloud = Math.max(0, fbm(n, x * sx, y * sx * 1.6, 5) - 0.38) * 2.2;
        let r = 70 + 90 * cloud, g = 84 + 96 * cloud, b = 100 + 104 * cloud;
        let lum = (0.35 + 0.65 * cloud) * (1 - fy * 0.7);
        // two ridges: far blue-grey, near dark with a warm glint on the right
        const far = 0.26 + 0.22 * fbm(n, fx * 4 + 10, 3, 4) - 0.08 * Math.sin(fx * 3.1);
        const near = 0.48 + 0.18 * fbm(n, fx * 3 + 40, 7, 5) + 0.05 * Math.cos(fx * 5);
        if (fy > far) {
          // snowy far range: bright crests streaked by rock
          const rock = fbm(n, x * sx * 3, y * sx * 2 + 20, 5);
          const crest = Math.max(0, 1 - (fy - far) * 5);
          lum = 0.2 + 0.55 * crest * rock + 0.6 * Math.max(0, rock - 0.5);
          r = 150; g = 166; b = 186;
        }
        if (fy > near) {
          const rock = fbm(n, x * sx * 4 + 5, y * sx * 3, 5);
          lum = 0.06 + 0.8 * Math.max(0, rock - 0.45) * (0.5 + fx * 0.8);
          r = 170 + 40 * fx; g = 160 + 20 * fx; b = 100;
        }
        lum = Math.max(0, Math.min(1, lum));
        const i = (y * cols + x) * 4;
        out[i] = r * lum; out[i + 1] = g * lum; out[i + 2] = b * lum; out[i + 3] = 255;
      }
    }
    return out;
  }

  function buildDither() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const cols = Math.ceil(W / DITHER_CELL), rows = Math.ceil(H / DITHER_CELL);
    // a hidden/unlaid-out window reports 0×0; the next resize rebuilds
    if (!cols || !rows) { modeState.dither = null; return; }
    // sample the source at one texel per dither pixel
    let d = null;
    const src = wallpaperImg;
    if (src && src.width) {
      const off = document.createElement('canvas');
      off.width = cols; off.height = rows;
      const oc = off.getContext('2d');
      oc.imageSmoothingQuality = 'high';
      oc.filter = filterCss(cols / W);
      const scale = Math.max(cols / src.width, rows / src.height);
      const dw = src.width * scale, dh = src.height * scale;
      oc.drawImage(src, (cols - dw) / 2, (rows - dh) / 2, dw, dh);
      // a cross-origin wallpaper without CORS taints the canvas
      try { d = oc.getImageData(0, 0, cols, rows).data; } catch (err) { d = null; }
    }
    if (!d) d = ditherFallback(cols, rows);

    // masks: opaque top third fading out by ~94% of the height, and a calm
    // ellipse behind the centre column (26% strength inside, full outside)
    const ecx = W / 2, ecy = H * 0.42;
    const erx = Math.min(580, W * 0.42), ery = Math.min(300, H * 0.3);
    const out = new ImageData(cols, rows);
    const o = out.data;
    for (let y = 0; y < rows; y++) {
      const py = (y + 0.5) * DITHER_CELL;
      const fy = py / H;
      const fade = fy <= 0.3 ? 1 : Math.max(0, 1 - (fy - 0.3) / 0.64);
      if (fade <= 0) continue;
      const brow = BAYER8[y & 7];
      for (let x = 0; x < cols; x++) {
        const i = (y * cols + x) * 4;
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        // gentle contrast lift so mid-tones split into readable patterns
        const v = Math.min(1, Math.max(0, (lum - 0.04) * 1.25));
        if (v <= brow[x & 7]) continue;
        const px = (x + 0.5) * DITHER_CELL;
        const dx = (px - ecx) / erx, dy = (py - ecy) / ery;
        const e = Math.sqrt(dx * dx + dy * dy);
        const calm = e <= 0.4 ? 0.26 : e >= 1 ? 1 : 0.26 + 0.74 * ((e - 0.4) / 0.6);
        // lift each pixel to a bright version of its source hue, so dark
        // photo areas still read as coloured dots rather than mud
        const k = (150 + 105 * v) / Math.max(r, g, b, 1);
        o[i] = Math.min(255, r * k * 0.85 + 38);
        o[i + 1] = Math.min(255, g * k * 0.85 + 38);
        o[i + 2] = Math.min(255, b * k * 0.85 + 38);
        o[i + 3] = Math.round(255 * fade * calm);
      }
    }
    // blow the low-res buffer up to device pixels with hard edges
    const small = document.createElement('canvas');
    small.width = cols; small.height = rows;
    small.getContext('2d').putImageData(out, 0, 0);
    const big = document.createElement('canvas');
    big.width = Math.round(cols * DITHER_CELL * dpr);
    big.height = Math.round(rows * DITHER_CELL * dpr);
    const bc = big.getContext('2d');
    bc.imageSmoothingEnabled = false;
    bc.drawImage(small, 0, 0, big.width, big.height);
    const R = POINTER_R * 1.3;
    const lamp = document.createElement('canvas'); // scratch for the cursor glow
    lamp.width = lamp.height = Math.ceil(R * 2 * dpr);
    modeState.dither = { img: big, w: cols * DITHER_CELL, h: rows * DITHER_CELL, lamp, R, dpr };
  }

  function drawDither() {
    const s = modeState.dither;
    if (!s) return;
    // near-black base (keeps a hint of the phase sky) so the pixels pop
    ctx.fillStyle = 'rgba(12,12,14,0.82)';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = DITHER_OPACITY;
    ctx.drawImage(s.img, 0, 0, s.w, s.h);
    ctx.globalAlpha = 1;
    // cursor: the same pixels again, added on top inside a soft circle
    if (pointer.k > 0.01) {
      const { lamp, R, dpr } = s;
      const lc = lamp.getContext('2d');
      const x0 = pointer.x - R, y0 = pointer.y - R;
      lc.globalCompositeOperation = 'source-over';
      lc.clearRect(0, 0, lamp.width, lamp.height);
      lc.imageSmoothingEnabled = false;
      lc.drawImage(s.img, Math.round(-x0 * dpr), Math.round(-y0 * dpr));
      lc.globalCompositeOperation = 'destination-in';
      const c = R * dpr;
      const g = lc.createRadialGradient(c, c, 0, c, c, c);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      lc.fillStyle = g;
      lc.fillRect(0, 0, lamp.width, lamp.height);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.6 * pointer.k;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(lamp, x0, y0, R * 2, R * 2);
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  function buildHalftoneSample() {
    const src = wallpaperImg;
    const cols = Math.ceil(W / dotSize) + 1;
    const rows = Math.ceil(H / dotSize) + 1;
    const off = document.createElement('canvas');
    off.width = cols;
    off.height = rows;
    const oc = off.getContext('2d');
    oc.filter = filterCss(cols / W);
    if (src && src.width) {
      const scale = Math.max(cols / src.width, rows / src.height);
      const dw = src.width * scale;
      const dh = src.height * scale;
      oc.drawImage(src, (cols - dw) / 2, (rows - dh) / 2, dw, dh);
    } else {
      // no wallpaper yet: a dark procedural scene so the dots glow sparsely
      oc.fillStyle = '#04070f';
      oc.fillRect(0, 0, cols, rows);
      const band = oc.createLinearGradient(0, rows * 0.55, 0, rows);
      band.addColorStop(0, 'rgba(255,255,255,0)');
      band.addColorStop(1, 'rgba(255,220,180,0.85)');
      oc.fillStyle = band;
      oc.fillRect(0, rows * 0.55, cols, rows * 0.45);
      const glow = oc.createRadialGradient(cols * 0.72, rows * 0.2, 1, cols * 0.72, rows * 0.2, cols * 0.3);
      glow.addColorStop(0, 'rgba(255,255,255,0.95)');
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      oc.fillStyle = glow;
      oc.fillRect(0, 0, cols, rows);
    }
    let d = null;
    try { d = oc.getImageData(0, 0, cols, rows).data; }
    catch (err) {
      // cross-origin wallpaper without CORS headers taints the sample buffer
      d = null;
    }
    const data = new Float32Array(cols * rows);
    if (d) {
      for (let i = 0; i < cols * rows; i++) {
        const lum = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255;
        data[i] = Math.max(0, Math.min(1, (lum - 0.02) / 0.95));
      }
    }
    modeState.halftone = { data, cols, rows };
  }

  function buildModeExtras() {
    modeState = { meteor: null };
    if (bgMode === 'halftone') buildHalftoneSample();
    if (bgMode === 'dither') buildDither();
    if (bgMode === 'photo') buildPhoto();
    if (bgMode === 'lamp') {
      buildLamp();
      // motes are seeded per mode-switch/resize; the cone rebuild in
      // setPalette must not reset them mid-drift
      modeState.lampMotes = Array.from({ length: 40 }, () => ({
        fx: Math.random() * 1.7 - 0.85, // fraction of the beam's half-width
        fy: Math.random(),
        sp: 7 + Math.random() * 14,     // downward px/s
        sw: 0.3 + Math.random() * 0.5,  // sway speed
        w: 0.6 + Math.random() * 1.6,   // twinkle speed
        ph: Math.random() * Math.PI * 2,
        s: Math.random() < 0.8 ? 1 : 2, // square side
        a: 0.12 + Math.random() * 0.22,
      }));
    }
    if (bgMode === 'shooting') {
      modeState.shootStars = Array.from({ length: 150 }, () => ({
        x: Math.random() * W,
        y: Math.random() * H * 0.9,
        r: Math.random() < 0.85 ? 2 : 3,
        a: 0.25 + Math.random() * 0.75,
        w: 0.5 + Math.random() * 1.5,
        ph: Math.random() * Math.PI * 2,
      }));
    }
    if (bgMode === 'particles') {
      modeState.parts = Array.from({ length: 90 }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        r: 1 + Math.random() * 1.5,
        sp: 8 + Math.random() * 26,
        sw: Math.random() * Math.PI * 2,
        a: 0.25 + Math.random() * 0.5,
      }));
    }
    if (bgMode === 'grain' || bgMode === 'noise') {
      const n = document.createElement('canvas');
      n.width = n.height = 200;
      const nc = n.getContext('2d');
      const img = nc.createImageData(n.width, n.height);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 60 + Math.random() * 140;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 22;
      }
      nc.putImageData(img, 0, 0);
      modeState.noise = n;
    }
    if (bgMode === 'aurora') modeState.auroraFor = null; // force color rebuild
  }

  /* ---------- weather overlay (driven by ui via bgApi.setWeather) ----------
     One layer over every background mode: rain streaks, drifting snow, pixel
     clouds, mist blobs and lightning. Particles reseed only when the effect
     or the viewport changes, then advance cheaply in the frame loop. */

  const WX_FX_VALID = ['none', 'clear', 'clouds', 'fog', 'drizzle', 'rain', 'snow', 'storm'];
  let wxFx = 'none';
  let wxParts = [], wxClouds = [], wxFogs = [];
  let wxFlash = 0, wxNextFlash = 0;

  // crisp pixel-cloud sprite: rows of squares, narrow on top, ragged edges
  function buildCloudSprite() {
    const cell = 5;
    const cw = 10 + Math.floor(Math.random() * 9);
    const ch = 4 + Math.floor(Math.random() * 3);
    const off = document.createElement('canvas');
    off.width = cw * cell;
    off.height = ch * cell;
    const c2 = off.getContext('2d');
    c2.fillStyle = '#ffffff';
    for (let y = 0; y < ch; y++) {
      const inset = Math.round((1 - y / (ch - 1)) * cw * 0.3);
      const x0 = inset + (Math.random() < 0.5 ? 0 : 1);
      const x1 = cw - inset - (Math.random() < 0.5 ? 0 : 1);
      for (let x = x0; x < x1; x++) {
        if (Math.random() < 0.12) continue;
        c2.fillRect(x * cell, y * cell, cell, cell);
      }
    }
    return off;
  }

  function buildWeather() {
    wxParts = []; wxClouds = []; wxFogs = []; wxFlash = 0;
    const scale = (W * H) / 921600; // seed density tracks the viewport (720p = 1)
    if (wxFx === 'rain' || wxFx === 'storm' || wxFx === 'drizzle') {
      const count = Math.round(scale * (wxFx === 'drizzle' ? 70 : wxFx === 'storm' ? 150 : 105));
      for (let i = 0; i < count; i++) wxParts.push({
        x: Math.random() * W,
        y: Math.random() * H,
        len: wxFx === 'drizzle' ? 2 + Math.random() * 3 : wxFx === 'storm' ? 6 + Math.random() * 6 : 4 + Math.random() * 5,
        sp: wxFx === 'drizzle' ? 340 + Math.random() * 140 : 520 + Math.random() * (wxFx === 'storm' ? 260 : 160),
        a: 0.14 + Math.random() * 0.22,
      });
    } else if (wxFx === 'snow') {
      const count = Math.round(scale * 85);
      for (let i = 0; i < count; i++) wxParts.push({
        x: Math.random() * W,
        y: Math.random() * H,
        s: Math.random() < 0.72 ? 1 : 2,
        sp: 22 + Math.random() * 40,
        sw: 6 + Math.random() * 16,
        w: 0.3 + Math.random() * 0.9,
        ph: Math.random() * Math.PI * 2,
        a: 0.3 + Math.random() * 0.4,
      });
    } else if (wxFx === 'clouds') {
      for (let i = 0; i < 6; i++) wxClouds.push({
        img: buildCloudSprite(),
        x: Math.random() * W,
        y: Math.random() * H * 0.45,
        sp: 4 + Math.random() * 9,
        a: 0.05 + Math.random() * 0.05,
      });
    } else if (wxFx === 'fog') {
      for (let i = 0; i < 10; i++) wxFogs.push({
        x0: Math.random() * (W + 400),
        y: H * (0.15 + Math.random() * 0.75),
        r: 160 + Math.random() * 240,
        sp: (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 9),
        a: 0.05 + Math.random() * 0.06,
      });
    }
    if (wxFx === 'storm') wxNextFlash = performance.now() + 2000 + Math.random() * 3000;
  }

  function drawWeather(t, dt) {
    if (wxFx === 'none' || wxFx === 'clear') return;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (wxFx === 'rain' || wxFx === 'storm' || wxFx === 'drizzle') {
      const wind = wxFx === 'storm' ? 90 : 45;
      for (const p of wxParts) {
        p.y += (p.sp * dt) / 1000;
        p.x += (wind * dt) / 1000;
        if (p.y > H + 12) { p.y = -12 - Math.random() * 60; p.x = Math.random() * (W + 100) - 50; }
        if (p.x > W + 12) p.x -= W + 24;
        ctx.fillStyle = rgba(pal.star, p.a);
        ctx.fillRect(p.x, p.y, 1, p.len);
      }
    } else if (wxFx === 'snow') {
      for (const p of wxParts) {
        p.y += (p.sp * dt) / 1000;
        if (p.y > H + 4) { p.y = -4; p.x = Math.random() * W; }
        const sway = Math.sin(t / 1000 * p.w + p.ph) * p.sw;
        ctx.fillStyle = rgba(pal.star, p.a);
        ctx.fillRect(p.x + sway, p.y, p.s, p.s);
      }
    } else if (wxFx === 'clouds') {
      for (const c of wxClouds) {
        c.x += (c.sp * dt) / 1000;
        if (c.x > W + 10) c.x = -c.img.width - Math.random() * 80;
        ctx.globalAlpha = c.a;
        ctx.drawImage(c.img, Math.round(c.x), Math.round(c.y));
      }
      ctx.globalAlpha = 1;
    } else if (wxFx === 'fog') {
      const span = W + 400;
      for (const b of wxFogs) {
        const x = (((b.x0 + (t / 1000) * b.sp) % span) + span) % span - 200;
        const g = ctx.createRadialGradient(x, b.y, 20, x, b.y, b.r);
        g.addColorStop(0, rgba(pal.star, b.a));
        g.addColorStop(1, rgba(pal.star, 0));
        ctx.fillStyle = g;
        ctx.fillRect(x - b.r, b.y - b.r, b.r * 2, b.r * 2);
      }
    }
    if (wxFx === 'storm') {
      if (t >= wxNextFlash) {
        wxFlash = 0.9;
        wxNextFlash = t + 3200 + Math.random() * 5200;
      }
      if (wxFlash > 0) {
        wxFlash = Math.max(0, wxFlash - (dt / 1000) * 3.2);
        ctx.fillStyle = rgba([255, 255, 255], Math.min(0.3, wxFlash * 0.32));
        ctx.fillRect(0, 0, W, H);
      }
    }
    ctx.restore();
  }

  let raf = null, last = 0;
  function frame(now) {
    const dt = Math.min(now - last, 100);
    last = now;
    step(dt);
    draw(now, dt);
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (reduced) { draw(0); return; } // rest at static dim pattern
    cancelAnimationFrame(raf);
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  document.addEventListener('visibilitychange', () => {
    if (reduced) return;
    if (document.hidden) cancelAnimationFrame(raf);
    else start();
  });

  let resizeTimer;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
  });

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildGrid();
    buildStars();
    buildCelestial();
    buildModeExtras();
    buildWeather();
    buildColorCache();
    start();
  }

  resize();

  return {
    setPalette(nextPal, nextSun, nextMoon) {
      pal = nextPal;
      sunAt = nextSun;
      moonAt = nextMoon;
      buildColorCache();
      if (bgMode === 'lamp') buildLamp();
      if (reduced) draw(0);
    },
    setTheme(key) {
      if (!THEMES[key]) return;
      themeKey = key;
      buildCelestial();
      modeState.grainFor = null;
      modeState.auroraFor = null;
      if (reduced) draw(0);
    },
    setMode(mode) {
      if (mode === bgMode) return;
      bgMode = mode;
      syncVideoPlayback();
      buildModeExtras();
      if (reduced) draw(0);
    },
    setWallpaper(img) {
      // stop and release the previous video, or it keeps decoding in the background
      if (wallpaperVideo && wallpaperVideo !== img) {
        wallpaperVideo.pause();
        wallpaperVideo.removeAttribute('src');
        wallpaperVideo.load();
      }
      wallpaperImg = img;
      wallpaperVideo = img instanceof HTMLVideoElement ? img : null;
      syncVideoPlayback();
      if (wallpaperVideo) {
        // keep a static frame as the sample for dither/halftone once data arrives
        const snap = () => {
          if (wallpaperVideo.readyState >= 2 && wallpaperVideo.videoWidth) {
            const c = document.createElement('canvas');
            c.width = 320;
            c.height = Math.max(1, Math.round(320 * wallpaperVideo.videoHeight / wallpaperVideo.videoWidth));
            c.getContext('2d').drawImage(wallpaperVideo, 0, 0, c.width, c.height);
            wallpaperImg = c;
            if (bgMode === 'halftone') buildHalftoneSample();
            if (bgMode === 'dither') buildDither();
            if (reduced) draw(0);
          }
        };
        wallpaperVideo.addEventListener('loadeddata', snap, { once: true });
        snap();
      }
      if (bgMode === 'halftone') buildHalftoneSample();
      if (bgMode === 'dither') buildDither();
      if (bgMode === 'photo') buildPhoto();
      if (reduced) draw(0);
    },
    // blur/brightness over wallpaper modes, set from Settings → Look
    setFilters(blur, bright) {
      filters = { blur: Math.max(0, Math.min(24, +blur || 0)), bright: Math.max(0.5, Math.min(1.5, +bright || 1)) };
      if (bgMode === 'photo') buildPhoto();
      if (bgMode === 'halftone') buildHalftoneSample();
      if (bgMode === 'dither') buildDither();
      if (reduced) draw(0);
    },
    setSolid(a, b) {
      if (a) solidA = a;
      if (b) solidB = b;
      if (reduced) draw(0);
    },
    // cursor glow + click ripples (persisted on/off from settings)
    setPointer(enabled) { pointer.enabled = !!enabled; },
    ripple(x, y) {
      if (reduced || !pointer.enabled) return;
      ripples.push({ x, y, t0: performance.now() });
      if (ripples.length > 4) ripples.shift();
    },
    // the search box is focused: lamp warms up a touch
    setFocus(on) { focusTarget = on ? 1 : 0; },
    setDotSize(v) {
      const n = Math.max(8, Math.min(26, Math.round(v) || 14));
      if (n === dotSize) return;
      dotSize = n;
      if (bgMode === 'halftone') buildHalftoneSample();
      if (reduced) draw(0);
    },
    setWeather(fx) {
      if (!WX_FX_VALID.includes(fx)) fx = 'none';
      if (fx === wxFx) return;
      wxFx = fx;
      buildWeather();
      if (reduced) draw(0);
    },
  };
})();

/* ================= ui ================= */

(function ui() {
  const input = document.getElementById('query');
  const searchEl = document.getElementById('search');
  const wrap = document.getElementById('provider-wrap');
  const btn = document.getElementById('provider-btn');
  const menu = document.getElementById('menu');
  const ico = document.getElementById('provider-ico');
  const nameEl = document.getElementById('provider-name');
  const suggestEl = document.getElementById('suggest');

  let provider = PROVIDERS[0];
  try {
    const saved = localStorage.getItem('home:provider');
    provider = PROVIDERS.find(p => p.id === saved) || (saved === 'custom' ? customProvider() : null) || provider;
  } catch (e) { /* storage unavailable */ }

  /* ---------- day/night theming ---------- */

  const VALID_PHASES = ['morning', 'day', 'evening', 'night'];
  // greeting is opt-in (typing a name switches it on); the rest default on
  const DEFAULT_SHOW = {
    celestial: true, stars: true, input: true, time: true, help: true, pulse: true,
    clock: true, greeting: false, widgets: true,
  };

  function forcedPhase() {
    // URL preview wins, then a phase frozen in settings, then the real clock
    if (CONFIG.forcePhase && VALID_PHASES.includes(CONFIG.forcePhase)) return CONFIG.forcePhase;
    try {
      const p = localStorage.getItem('home:phase');
      if (p && VALID_PHASES.includes(p)) return p;
    } catch (e) { }
    return null;
  }

  // the Image theme's last extraction is cached so it paints on the first
  // frame instead of waiting for IndexedDB to hand the wallpaper back
  const IMAGE_THEME_DEFAULT = THEMES.image;
  let hasWallpaper = false;
  try {
    const cached = JSON.parse(localStorage.getItem('home:imgtheme'));
    if (cached && cached.theme && cached.accent) setImageTheme(cached);
  } catch (e) { }

  function activeTheme() {
    const t = loadStored('home:theme');
    return THEMES[t] ? t : 'classic';
  }

  function applyDayCycle() {
    const now = new Date();
    const forced = forcedPhase();
    const theme = activeTheme();
    const info = DayCycle.current(now, forced);
    if (document.body.dataset.phase !== info.name) {
      document.body.dataset.phase = info.name;
    }
    if (document.body.dataset.theme !== theme) {
      document.body.dataset.theme = theme;
      bgApi.setTheme(theme);
    }
    const pal = tintPalette(DayCycle.palette(now, forced), theme);
    const show = loadShow();
    if (!show.celestial) { pal.sun = false; pal.moon = false; }
    if (!show.stars) pal.starA = 0;
    pal.sparklesOn = show.stars;
    bgApi.setPalette(pal, DayCycle.sunPos(now, forced), DayCycle.moonPos(now, forced));
    renderGreeting();
  }
  applyDayCycle();
  setInterval(applyDayCycle, 30 * 1000);

  /* ---------- settings ---------- */

  const settingsBtn = document.getElementById('settings-btn');
  const settingsEl = document.getElementById('settings');
  const phaseOpts = document.getElementById('phase-opts');

  function store(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { }
  }
  function loadStored(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  // single-key shortcuts must not fire while typing anywhere
  function isTypingTarget(el) {
    return !!el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
      || el instanceof HTMLSelectElement || el.isContentEditable);
  }

  // frozen phase
  function renderPhaseOpts() {
    const cur = loadStored('home:phase') || 'auto';
    for (const b of phaseOpts.children) {
      b.classList.toggle('active', b.dataset.phase === cur);
    }
  }
  phaseOpts.addEventListener('click', e => {
    const b = e.target.closest('button[data-phase]');
    if (!b) return;
    store('home:phase', b.dataset.phase);
    renderPhaseOpts();
    applyDayCycle();
  });
  renderPhaseOpts();

  // celestial theme
  const themeOpts = document.getElementById('theme-opts');
  function renderThemeOpts() {
    const cur = activeTheme();
    for (const b of themeOpts.children) {
      b.classList.toggle('active', b.dataset.theme === cur);
    }
  }
  themeOpts.addEventListener('click', e => {
    const b = e.target.closest('button[data-theme]');
    if (!b) return;
    store('home:theme', b.dataset.theme);
    renderThemeOpts();
    applyDayCycle();
    // the Image theme has nothing to read yet: ask for a picture
    if (b.dataset.theme === 'image' && !hasWallpaper) setWallModal(true);
  });
  renderThemeOpts();

  // show/hide toggles: planet, stars, input, time, help
  const showOpts = document.getElementById('show-opts');

  function loadShow() {
    try {
      const v = JSON.parse(loadStored('home:show'));
      return v && typeof v === 'object' ? { ...DEFAULT_SHOW, ...v } : { ...DEFAULT_SHOW };
    } catch (e) { return { ...DEFAULT_SHOW }; }
  }

  function applyShow(show) {
    document.body.classList.toggle('no-input', !show.input);
    document.body.classList.toggle('no-time', !show.time);
    document.body.classList.toggle('no-help', !show.help);
    document.body.classList.toggle('no-pulse', !show.pulse);
    document.body.classList.toggle('no-clock', !show.clock);
    document.body.classList.toggle('no-widgets', !show.widgets);
    applyDayCycle(); // also re-renders the greeting
    if (typeof tick === 'function' && clockReady) tick();
  }

  function renderShowOpts() {
    const show = loadShow();
    for (const b of showOpts.children) {
      b.classList.toggle('active', !!show[b.dataset.show]);
    }
  }

  showOpts.addEventListener('click', e => {
    const b = e.target.closest('button[data-show]');
    if (!b) return;
    const show = loadShow();
    show[b.dataset.show] = !show[b.dataset.show];
    store('home:show', JSON.stringify(show));
    applyShow(show);
    renderShowOpts();
  });
  renderShowOpts();
  applyShow(loadShow());

  // background style
  const bgSelect = document.getElementById('bg-select');
  const VALID_BGS = ['scene', 'aurora', 'grid', 'lamp', 'noise', 'particles', 'retro', 'shooting', 'grain', 'halftone', 'dither', 'photo', 'solid'];
  const WALL_BGS = ['halftone', 'dither', 'photo']; // modes that draw the wallpaper
  function currentBg() {
    const b = loadStored('home:bg');
    return VALID_BGS.includes(b) ? b : 'scene';
  }
  function renderBgOpts() {
    const cur = currentBg();
    bgSelect.value = cur;
    // only show the knobs that do something in the current mode
    document.getElementById('wall-row').hidden = !WALL_BGS.includes(cur);
    document.getElementById('dots-row').hidden = cur !== 'halftone';
    document.getElementById('solid-row').hidden = cur !== 'solid';
    const wallKnobs = WALL_BGS.includes(cur);
    document.getElementById('bg-blur-row').hidden = !wallKnobs;
    document.getElementById('bg-bright-row').hidden = !wallKnobs;
  }
  function setBg(mode) {
    store('home:bg', mode);
    bgApi.setMode(mode);
    renderBgOpts();
  }
  bgSelect.addEventListener('change', () => setBg(bgSelect.value));
  renderBgOpts();
  bgApi.setMode(currentBg());

  // pointer glow / click ripples
  const motionOpts = document.getElementById('motion-opts');
  const motionOn = () => loadStored('home:motion') !== 'off';
  function renderMotionOpts() {
    for (const b of motionOpts.children) b.classList.toggle('active', (b.dataset.motion === 'on') === motionOn());
    bgApi.setPointer(motionOn());
  }
  motionOpts.addEventListener('click', e => {
    const b = e.target.closest('button[data-motion]');
    if (!b) return;
    store('home:motion', b.dataset.motion);
    renderMotionOpts();
  });
  renderMotionOpts();
  // a click on empty background sends a ripple through the scene
  document.querySelector('.page').addEventListener('pointerdown', e => {
    if (e.target.closest('.center-wrap')) return;
    bgApi.ripple(e.clientX, e.clientY);
  });

  // wallpaper for the halftone/photo backgrounds (stored locally in IndexedDB)
  const wallOpenBtn = document.getElementById('wall-open');
  const wallClearBtn = document.getElementById('wall-clear');
  const wallClearModalBtn = document.getElementById('wall-clear-modal');
  const wallBrowse = document.getElementById('wall-browse');
  const wallInput = document.getElementById('wall-input');
  const wallModal = document.getElementById('wall-modal');
  const wallDrop = document.getElementById('wall-drop');
  const wallUrl = document.getElementById('wall-url');

  function idbOpen() {
    return new Promise((res, rej) => {
      const req = indexedDB.open('homepage', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }
  async function idbSet(key, val) {
    const db = await idbOpen();
    return new Promise((res, rej) => {
      const tx = db.transaction('kv', 'readwrite');
      if (val === null) tx.objectStore('kv').delete(key);
      else tx.objectStore('kv').put(val, key);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }
  async function idbGet(key) {
    const db = await idbOpen();
    return new Promise((res, rej) => {
      const tx = db.transaction('kv', 'readonly');
      const req = tx.objectStore('kv').get(key);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }

  // a stored video (data:video/…) or a pasted link to a video file
  function isVideoSrc(src) {
    return typeof src === 'string' &&
      (src.startsWith('data:video/') || /^https?:\/\/[^?#]+\.(mp4|webm|ogv|ogg|mov|m4v)([?#]|$)/i.test(src));
  }

  // cheap identity for a wallpaper source (data: URLs are megabytes long)
  function wallKey(src) {
    return typeof src === 'string' ? `${src.length}:${src.slice(0, 48)}…${src.slice(-48)}` : '';
  }

  /* fast first paint: the wallpaper the NEXT new tab will show is prepared
     ahead of time — already cover-fitted to the screen, encoded as a small
     WebP, with its Image-theme colors — and kept under one IndexedDB key.
     A new tab reads just that (not the whole multi-MB list), decodes it off
     the main thread and paints it; the full list loads afterwards. With
     several wallpapers the next pick is made in advance, so shuffling never
     needs a visible second swap. */
  const READY_KEY = 'wallReady';
  let readyTimer = 0;
  function scheduleReady() {
    clearTimeout(readyTimer);
    // after the page settles, so preparing never competes with first paint
    readyTimer = setTimeout(() => {
      const run = () => prepareReady().catch(() => { });
      'requestIdleCallback' in window ? requestIdleCallback(run, { timeout: 4000 }) : run();
    }, 1500);
  }
  function readyTargetSize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    let w = Math.round(Math.max(screen.width, innerWidth) * dpr);
    let h = Math.round(Math.max(screen.height, innerHeight) * dpr);
    const k = Math.min(1, 3840 / Math.max(w, h)); // 4K is plenty for a background
    return { w: Math.round(w * k), h: Math.round(h * k) };
  }
  // a decoded still of any wallpaper source (videos give their first frame)
  function loadStill(src) {
    return new Promise(resolve => {
      if (isVideoSrc(src)) {
        const v = document.createElement('video');
        v.muted = true; v.playsInline = true; v.preload = 'auto';
        if (!src.startsWith('data:')) v.crossOrigin = 'anonymous';
        v.onloadeddata = () => resolve(v);
        v.onerror = () => resolve(null);
        v.src = src;
        return;
      }
      const img = new Image();
      if (!src.startsWith('data:')) img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }
  async function prepareReady() {
    if (!walls.length) return;
    // which wallpaper will the next tab show? a schedule rule, else (with
    // shuffle) a random one other than the current, else the current one
    const r = activeRule();
    const i = r ? r.i : walls.length > 1 ? pickRandomWall() : 0;
    const src = walls[i];
    if (!src) return;
    const key = wallKey(src);
    const size = readyTargetSize();
    // prepared stills are kept per wallpaper ('wallStill:<key>'), so each
    // image is processed once; the pointer just says which one is next
    const ptr = (await idbGet(READY_KEY).catch(() => null)) || {};
    const live = new Set(walls.map(wallKey));
    const kept = (ptr.keys || []).filter(k => live.has(k));
    for (const k of ptr.keys || []) if (!live.has(k)) await idbSet('wallStill:' + k, null).catch(() => { });
    const have = kept.includes(key) ? await idbGet('wallStill:' + key).catch(() => null) : null;
    const point = theme => {
      if (theme && i !== wallShown) { // the next tab paints this one first: cache its colors
        store('home:imgtheme', JSON.stringify(theme));
        store('home:imgthemeKey', key);
      }
      return idbSet(READY_KEY, { key, i, count: walls.length, keys: kept.includes(key) ? kept : [...kept, key] });
    };
    if (have && have.w >= size.w * 0.9 && have.h >= size.h * 0.9) return point(have.theme); // nothing to process
    const still = await loadStill(src);
    if (!still) return;
    const sw = still.videoWidth || still.naturalWidth || still.width;
    const sh = still.videoHeight || still.naturalHeight || still.height;
    if (!sw || !sh) return;
    const c = document.createElement('canvas');
    c.width = size.w;
    c.height = size.h;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    const s = Math.max(size.w / sw, size.h / sh);
    g.drawImage(still, (size.w - sw * s) / 2, (size.h - sh * s) / 2, sw * s, sh * s);
    let blob = null;
    try { blob = await new Promise(res => c.toBlob(res, 'image/webp', 0.9)); } catch (e) { return; } // CORS-tainted
    if (!blob) return;
    let theme = null;
    try { const p = extractImagePalette(still); if (p) theme = buildImageTheme(p); } catch (e) { }
    if (isVideoSrc(src)) { still.removeAttribute('src'); still.load(); }
    await idbSet('wallStill:' + key, { blob, w: size.w, h: size.h, theme });
    await point(theme);
  }
  // drop every prepared still (Clear all)
  async function clearReady() {
    const ptr = await idbGet(READY_KEY).catch(() => null);
    for (const k of (ptr && ptr.keys) || []) await idbSet('wallStill:' + k, null).catch(() => { });
    await idbSet(READY_KEY, null).catch(() => { });
  }

  // resolves true once the image is decoded and handed to the background
  function applyWallpaper(src) {
    if (!src) { bgApi.setWallpaper(null); return Promise.resolve(false); }
    // video wallpapers play muted & looped in the Photo background
    if (isVideoSrc(src)) {
      const load = cors => new Promise(resolve => {
        const v = document.createElement('video');
        v.muted = true; v.loop = true; v.playsInline = true;
        // remote videos: ask for CORS first so the frame can be sampled for the
        // Image theme / dither / halftone; retry without it if the host refuses
        if (cors) v.crossOrigin = 'anonymous';
        v.onloadeddata = () => {
          bgApi.setWallpaper(v);
          hasWallpaper = true;
          const c = document.createElement('canvas');
          c.width = 320;
          c.height = Math.max(1, Math.round(320 * v.videoHeight / v.videoWidth));
          c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
          if (loadStored('home:imgthemeKey') !== wallKey(src)) {
            try { refreshImageTheme(c, wallKey(src)); } catch (e) { /* tainted frame: keep the current theme */ }
          }
          resolve(true); // playback is started/paused by the background per mode
        };
        v.onerror = () => {
          v.removeAttribute('src'); v.load();
          resolve(cors ? load(false) : false);
        };
        v.src = src;
      });
      return load(!src.startsWith('data:'));
    }
    return new Promise(resolve => {
      const img = new Image();
      if (!src.startsWith('data:')) img.crossOrigin = 'anonymous';
      img.onload = () => {
        bgApi.setWallpaper(img);
        hasWallpaper = true;
        // same picture as last time → its colors are already cached
        if (loadStored('home:imgthemeKey') !== wallKey(src)) refreshImageTheme(img, wallKey(src));
        resolve(true);
      };
      img.onerror = () => resolve(false);
      img.src = src;
    });
  }

  // up to WALL_MAX wallpapers live in IndexedDB as a list of image sources;
  // every page load shows one of them at random (never the same one twice in
  // a row when there's a choice), so a new tab feels a little different
  const WALL_MAX = 5;
  const VIDEO_MAX_BYTES = 40 * 1048576;
  const wallStrip = document.getElementById('wall-strip');
  const wallCount = document.getElementById('wall-count');
  let walls = [];      // image sources (data: URLs or http(s) URLs)
  let wallShown = -1;  // index of the one on screen
  let wallChangedAt = Date.now(); // when the shown one last changed (for the timer)

  /* crossfade: freeze the current frame in an overlay canvas, swap the
     wallpaper underneath, then fade the frozen frame out */
  const bgCanvas = document.getElementById('bg');
  function snapshotBg() {
    if (!bgCanvas.width || matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
    document.querySelectorAll('.bg-fade').forEach(el => el.remove());
    const c = document.createElement('canvas');
    c.className = 'bg-fade';
    c.setAttribute('aria-hidden', 'true');
    c.width = bgCanvas.width;
    c.height = bgCanvas.height;
    try { c.getContext('2d').drawImage(bgCanvas, 0, 0); } catch (e) { return null; }
    bgCanvas.after(c);
    return c;
  }
  function releaseFade(c) {
    c.getBoundingClientRect(); // flush layout so the opacity change transitions
    c.classList.add('out');
    c.addEventListener('transitionend', () => c.remove(), { once: true });
    setTimeout(() => c.remove(), 3000); // in case transitionend never fires
  }

  /* timed rotation: 0 = only a new tab picks a new one */
  const ROTATE_OPTS = [0, 1, 5, 15, 60]; // minutes
  function rotateMins() {
    const m = parseInt(loadStored('home:wallRotate'), 10);
    return ROTATE_OPTS.includes(m) ? m : 0;
  }

  /* schedule rules: "from HH:MM show image #n", repeating daily. The rule in
     force is the latest one at or before now (before the first rule of the
     day, last night's final rule still holds). Rules beat the random pick
     and the timer; a manual pick sticks until the next rule kicks in. */
  function loadRules() {
    try {
      const r = JSON.parse(loadStored('home:wallRules'));
      return Array.isArray(r) ? r.filter(x => x && /^\d\d:\d\d$/.test(x.t) && Number.isInteger(x.i) && x.i >= 0) : [];
    } catch (e) { return []; }
  }
  let rules = loadRules();
  function saveRules() { store('home:wallRules', JSON.stringify(rules)); }
  const toMin = t => +t.slice(0, 2) * 60 + +t.slice(3, 5);
  function activeRule(now = new Date(), count = walls.length) {
    const valid = rules.filter(r => r.i < count).sort((a, b) => toMin(a.t) - toMin(b.t));
    if (!valid.length) return null;
    const m = now.getHours() * 60 + now.getMinutes();
    let cur = valid[valid.length - 1];
    for (const r of valid) if (toMin(r.t) <= m) cur = r;
    return cur;
  }
  const ruleKey = r => (r ? `${r.t}>${r.i}` : null);
  let ruleApplied = null;

  function wallTick() {
    if (!walls.length || document.hidden) return;
    const r = activeRule();
    if (r) {
      const k = ruleKey(r);
      if (k !== ruleApplied) {
        ruleApplied = k;
        if (r.i !== wallShown) showWall(r.i, true);
      }
      return;
    }
    ruleApplied = null;
    const mins = rotateMins();
    if (mins && walls.length > 1 && Date.now() - wallChangedAt >= mins * 60000) showWall(pickRandomWall(), true);
  }
  setInterval(wallTick, 15000);
  document.addEventListener('visibilitychange', wallTick);

  function persistWalls() {
    return idbSet('wallpapers', walls.length ? walls.slice() : null).catch(() => { });
  }

  function pickRandomWall() {
    if (!walls.length) return -1;
    if (walls.length === 1) return 0;
    const last = parseInt(loadStored('home:wallLast'), 10);
    let i;
    do { i = Math.floor(Math.random() * walls.length); } while (i === last);
    return i;
  }

  // fade only when the change would be visible (a wallpaper mode, one already up)
  async function showWall(i, fade) {
    wallShown = i;
    wallChangedAt = Date.now();
    store('home:wallLast', String(i));
    renderWallStrip();
    const shot = fade && hasWallpaper && WALL_BGS.includes(currentBg()) ? snapshotBg() : null;
    const ok = await applyWallpaper(walls[i]);
    if (shot) releaseFade(shot);
    scheduleReady();
    return ok;
  }

  // video thumbnails are reused across re-renders (the strip is rebuilt on every
  // wallpaper change, and re-parsing a multi-MB data: URL each time is wasteful)
  const videoThumbs = new Map();
  function videoThumb(src) {
    let vid = videoThumbs.get(src);
    if (!vid) {
      vid = document.createElement('video');
      vid.muted = true; vid.playsInline = true; vid.preload = 'metadata';
      vid.src = src;
      videoThumbs.set(src, vid);
    }
    return vid;
  }

  function renderWallStrip() {
    wallStrip.textContent = '';
    for (const [src, vid] of videoThumbs) {
      if (!walls.includes(src)) { vid.removeAttribute('src'); vid.load(); videoThumbs.delete(src); }
    }
    walls.forEach((src, i) => {
      const cell = document.createElement('div');
      cell.className = 'wall-thumb' + (i === wallShown ? ' active' : '');
      const pick = document.createElement('button');
      pick.type = 'button';
      pick.className = 'wall-thumb-pick';
      pick.title = 'Show this one now';
      pick.setAttribute('aria-label', `Show wallpaper ${i + 1}`);
      if (isVideoSrc(src)) {
        pick.appendChild(videoThumb(src));
      } else {
        pick.style.backgroundImage = `url("${src.replace(/"/g, '%22')}")`;
      }
      pick.addEventListener('click', () => showWall(i, true));
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'wall-thumb-del';
      del.textContent = '×';
      del.title = 'Remove';
      del.setAttribute('aria-label', `Remove wallpaper ${i + 1}`);
      del.addEventListener('click', () => removeWall(i));
      const num = document.createElement('span');
      num.className = 'wall-thumb-num';
      num.textContent = i + 1;
      cell.append(pick, num, del);
      wallStrip.appendChild(cell);
    });
    wallStrip.hidden = !walls.length;
    wallCount.textContent = walls.length
      ? `${walls.length} / ${WALL_MAX} · a random one shows on each new tab`
      : `add up to ${WALL_MAX} — a random one shows on each new tab`;
    const full = walls.length >= WALL_MAX;
    wallDrop.classList.toggle('full', full);
    wallBrowse.disabled = full;
    document.getElementById('wall-url-load').disabled = full;
    renderWallSched();
  }

  // ---- "Change" timer + schedule rules UI ----
  const wallSched = document.getElementById('wall-sched');
  const wallRotate = document.getElementById('wall-rotate');
  const wallRuleList = document.getElementById('wall-rule-list');
  const wallSchedHint = document.getElementById('wall-sched-hint');

  function renderWallSched() {
    wallSched.hidden = walls.length < 2;
    const mins = rotateMins();
    for (const b of wallRotate.children) b.classList.toggle('active', +b.dataset.min === mins);
    const live = activeRule();
    wallRuleList.textContent = '';
    rules.forEach((r, k) => {
      const row = document.createElement('div');
      row.className = 'wall-rule' + (live === r ? ' live' : '') + (r.i >= walls.length ? ' broken' : '');
      const from = document.createElement('span');
      from.textContent = 'from';
      const time = timePicker(r.t, v => { r.t = v; rulesChanged(); });
      time.dataset.focus = `t${k}`;
      const show = document.createElement('span');
      show.textContent = 'show';
      const sel = wallPicker(r.i, v => { r.i = v; rulesChanged(); });
      sel.dataset.focus = `i${k}`;
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'mod-icon-btn';
      del.textContent = '×';
      del.setAttribute('aria-label', 'Remove rule');
      del.addEventListener('click', () => { rules.splice(k, 1); rulesChanged(); });
      row.append(from, time, show, sel, del);
      wallRuleList.appendChild(row);
    });
    wallSchedHint.textContent = rules.length
      ? 'Repeats daily. Rules win over the random pick and the timer.'
      : 'e.g. from 18:00 show #3 — repeats every day.';
    wallRotate.classList.toggle('muted', rules.length > 0);
  }

  /* ---- custom pickers: a chip that opens a small popover inside the
     dialog, instead of the browser's native time/select controls ---- */
  const wallBox = wallModal.querySelector('.wall-box');
  let pop = null;
  let popAnchor = null;
  let popOnClose = null;
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    if (tag === 'button') n.type = 'button';
    return n;
  }
  // closes the open popover; refocus puts focus back on its chip (found again
  // by data-focus, since committing a change re-renders the rule rows)
  function closePop(refocus = true) {
    if (!pop) return false;
    const anchor = popAnchor, done = popOnClose;
    pop.remove();
    pop = popAnchor = popOnClose = null;
    anchor.setAttribute('aria-expanded', 'false');
    const key = anchor.dataset.focus;
    if (done) done();
    if (refocus) {
      const again = key && wallBox.querySelector(`[data-focus="${key}"]`);
      (again || anchor).focus();
    }
    return true;
  }
  function openPop(anchor, label, fill) {
    const same = popAnchor === anchor;
    closePop(false);
    if (same) return;
    pop = el('div', 'wall-pop');
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', label);
    popOnClose = fill(pop) || null;
    wallBox.appendChild(pop);
    const b = wallBox.getBoundingClientRect(), a = anchor.getBoundingClientRect();
    let top = a.bottom - b.top + 6;
    if (a.bottom + pop.offsetHeight + 12 > innerHeight) top = a.top - b.top - pop.offsetHeight - 6;
    pop.style.top = `${Math.max(8, top)}px`;
    pop.style.left = `${Math.max(8, Math.min(a.left - b.left, b.width - pop.offsetWidth - 8))}px`;
    popAnchor = anchor;
    anchor.setAttribute('aria-expanded', 'true');
    (pop.querySelector('.sel') || pop.querySelector('button')).focus();
  }
  document.addEventListener('pointerdown', e => {
    if (pop && !pop.contains(e.target) && !popAnchor.contains(e.target)) closePop(false);
  });
  // arrow keys move between the cells of a popover grid
  function gridKeys(grid, cols) {
    grid.addEventListener('keydown', e => {
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[e.key];
      if (!step) return;
      const cells = [...grid.children];
      const i = cells.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      const next = cells[Math.max(0, Math.min(cells.length - 1, i + step))];
      next.focus();
    });
  }

  const pad2 = n => String(n).padStart(2, '0');
  // hour grid (00–23) + minute grid (5-minute steps); picking a minute
  // commits and closes, picking only an hour commits when the popover closes
  function timePicker(value, onChange) {
    const btn = el('button', 'wall-pick wall-time', value);
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', `Start time ${value}`);
    btn.addEventListener('click', () => openPop(btn, 'Pick a time', p => {
      let h = +value.slice(0, 2), m = +value.slice(3, 5);
      const hg = el('div', 'pop-grid hours'), mg = el('div', 'pop-grid mins');
      const mark = () => {
        [...hg.children].forEach(c => c.classList.toggle('sel', +c.dataset.v === h));
        [...mg.children].forEach(c => c.classList.toggle('sel', +c.dataset.v === m));
        btn.textContent = `${pad2(h)}:${pad2(m)}`;
      };
      for (let i = 0; i < 24; i++) {
        const c = el('button', null, pad2(i));
        c.dataset.v = i;
        c.addEventListener('click', () => { h = i; mark(); mg.querySelector('.sel, button').focus(); });
        hg.appendChild(c);
      }
      for (let i = 0; i < 60; i += 5) {
        const c = el('button', null, `:${pad2(i)}`);
        c.dataset.v = i;
        c.addEventListener('click', () => { m = i; mark(); closePop(); });
        mg.appendChild(c);
      }
      gridKeys(hg, 6);
      gridKeys(mg, 6);
      p.append(el('div', 'pop-label', 'Hour'), hg, el('div', 'pop-label', 'Minute'), mg);
      mark();
      return () => {
        const v = `${pad2(h)}:${pad2(m)}`;
        if (v !== value) onChange(v);
      };
    }));
    return btn;
  }

  // a thumbnail chip that opens a grid of the saved wallpapers
  function wallPicker(index, onChange) {
    const btn = el('button', 'wall-pick wall-img');
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', `Wallpaper #${index + 1}`);
    const sw = el('i', 'pick-sw');
    if (walls[index]) {
      if (isVideoSrc(walls[index])) sw.textContent = '▶';
      else sw.style.backgroundImage = `url("${walls[index].replace(/"/g, '%22')}")`;
    }
    btn.append(sw, el('span', null, `#${index + 1}`));
    btn.addEventListener('click', () => openPop(btn, 'Pick a wallpaper', p => {
      const g = el('div', 'pop-grid walls');
      walls.forEach((src, i) => {
        const c = el('button', i === index ? 'sel' : null);
        c.setAttribute('aria-label', `Wallpaper #${i + 1}`);
        if (isVideoSrc(src)) c.appendChild(el('span', null, '▶ ' + (i + 1)));
        else {
          c.style.backgroundImage = `url("${src.replace(/"/g, '%22')}")`;
          c.appendChild(el('span', null, i + 1));
        }
        c.addEventListener('click', () => {
          closePop();
          if (i !== index) onChange(i);
        });
        g.appendChild(c);
      });
      gridKeys(g, 5);
      p.appendChild(g);
    }));
    return btn;
  }

  function rulesChanged() {
    saveRules();
    ruleApplied = null; // re-evaluate right away
    renderWallSched();
    wallTick();
  }

  wallRotate.addEventListener('click', e => {
    const b = e.target.closest('button[data-min]');
    if (!b) return;
    store('home:wallRotate', b.dataset.min);
    wallChangedAt = Date.now();
    renderWallSched();
  });

  document.getElementById('wall-rule-add').addEventListener('click', () => {
    // default: the hour after the latest rule (or the next full hour)
    const last = rules.length ? Math.max(...rules.map(r => toMin(r.t))) : new Date().getHours() * 60;
    const h = Math.floor(last / 60 + 1) % 24;
    rules.push({ t: `${String(h).padStart(2, '0')}:00`, i: Math.max(0, wallShown) });
    rulesChanged();
  });

  // a new wallpaper on a mode that ignores it would look like nothing
  // happened — hop to Photo so the pick is visible right away
  function showWallpaperMode() {
    if (!WALL_BGS.includes(currentBg())) setBg('photo');
  }

  async function addWallpaper(src) {
    if (walls.includes(src)) { await showWall(walls.indexOf(src)); return true; }
    if (walls.length >= WALL_MAX) return false;
    const ok = await applyWallpaper(src);
    if (!ok) {
      wallUrl.value = '';
      wallUrl.placeholder = "couldn't load that image — try another";
      return false;
    }
    walls.push(src);
    await persistWalls();
    wallShown = walls.length - 1;
    store('home:wallLast', String(wallShown));
    wallUrl.placeholder = 'paste image URL…';
    renderWallStrip();
    showWallpaperMode();
    scheduleReady();
    return true;
  }

  async function removeWall(i) {
    walls.splice(i, 1);
    rules = rules.filter(r => r.i !== i).map(r => (r.i > i ? { t: r.t, i: r.i - 1 } : r));
    saveRules();
    if (!walls.length) { clearWallpaper(); return; }
    await persistWalls();
    if (i === wallShown) await showWall(Math.min(i, walls.length - 1));
    else {
      if (i < wallShown) wallShown--;
      store('home:wallLast', String(wallShown));
      renderWallStrip();
      scheduleReady(); // the prepared next one may have been the removed image
    }
  }

  async function clearWallpaper() {
    walls = [];
    wallShown = -1;
    rules = [];
    saveRules();
    try { await idbSet('wallpapers', null); } catch (e) { }
    try { await idbSet('wallpaper', null); } catch (e) { }
    try { await clearReady(); } catch (e) { }
    bgApi.setWallpaper(null);
    hasWallpaper = false;
    resetImageTheme();
    renderWallStrip();
  }

  // re-sample the wallpaper's colors into the Image theme; a tainted
  // (cross-origin, no CORS) image keeps whatever was there before
  function refreshImageTheme(img, key) {
    const p = extractImagePalette(img);
    if (!p) return;
    const built = buildImageTheme(p);
    setImageTheme(built);
    store('home:imgtheme', JSON.stringify(built));
    store('home:imgthemeKey', key || '');
    if (activeTheme() === 'image') { bgApi.setTheme('image'); applyDayCycle(); }
  }

  function resetImageTheme() {
    THEMES.image = IMAGE_THEME_DEFAULT;
    try { localStorage.removeItem('home:imgtheme'); localStorage.removeItem('home:imgthemeKey'); } catch (e) { }
    document.body.style.removeProperty('--img-accent');
    document.body.style.removeProperty('--img-accent-2');
    document.body.removeAttribute('data-img-mono');
    const sw = document.getElementById('img-sw');
    if (sw) sw.style.removeProperty('--sw');
    if (activeTheme() === 'image') { bgApi.setTheme('image'); applyDayCycle(); }
  }

  function setWallModal(open) {
    if (!open) closePop(false);
    wallModal.classList.toggle('open', open);
    wallModal.setAttribute('aria-hidden', String(!open));
  }
  wallOpenBtn.addEventListener('click', () => setWallModal(true));
  document.getElementById('wall-close').addEventListener('click', () => setWallModal(false));
  wallModal.addEventListener('click', e => { if (e.target === wallModal) setWallModal(false); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !wallModal.classList.contains('open')) return;
    if (closePop()) return; // Esc closes an open picker before the dialog
    setWallModal(false);
  });

  function readAsDataURL(file) {
    return new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result);
      reader.onerror = () => rej(reader.error);
      reader.readAsDataURL(file);
    });
  }
  // several files can be dropped or picked at once; extras past the cap are skipped
  async function loadWallFiles(files) {
    for (const file of Array.from(files || [])) {
      if (walls.length >= WALL_MAX) break;
      if (!/^(image|video)\//.test(file.type)) continue;
      // videos are kept as data: URLs (in memory + IndexedDB), so keep them small
      if (file.type.startsWith('video/') && file.size > VIDEO_MAX_BYTES) {
        alert(`“${file.name}” is ${Math.round(file.size / 1048576)} MB — videos up to ${VIDEO_MAX_BYTES / 1048576} MB are supported. Trim or compress it, or paste a link to it instead.`);
        continue;
      }
      try { await addWallpaper(await readAsDataURL(file)); } catch (e) { }
    }
  }

  ['dragenter', 'dragover'].forEach(ev =>
    wallDrop.addEventListener(ev, e => { e.preventDefault(); wallDrop.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(ev =>
    wallDrop.addEventListener(ev, e => { e.preventDefault(); wallDrop.classList.remove('drag'); }));
  wallDrop.addEventListener('drop', e => loadWallFiles(e.dataTransfer.files));
  wallBrowse.addEventListener('click', () => wallInput.click());
  wallInput.addEventListener('change', async () => { await loadWallFiles(wallInput.files); wallInput.value = ''; });

  function loadWallUrl() {
    const u = wallUrl.value.trim();
    if (!u || !/^(https?:|data:(image|video)\/)/i.test(u)) return;
    wallUrl.value = '';
    addWallpaper(u); // URLs persist too
  }
  document.getElementById('wall-url-load').addEventListener('click', loadWallUrl);
  wallUrl.addEventListener('keydown', e => { if (e.key === 'Enter') loadWallUrl(); });

  wallClearBtn.addEventListener('click', clearWallpaper);
  wallClearModalBtn.addEventListener('click', () => { clearWallpaper(); setWallModal(false); });
  // startup: paint the prepared wallpaper first (one small read + an
  // off-thread decode), then load the full list for the strip, rotation and
  // rules. Without a usable prepared copy, fall back to the full load.
  (async () => {
    let fast = null;
    try {
      const ptr = await idbGet(READY_KEY);
      // a schedule rule in force for another image wins over the prepared pick
      const rr = ptr ? activeRule(new Date(), ptr.count || 0) : null;
      const still = ptr && Number.isInteger(ptr.i) && (!rr || rr.i === ptr.i)
        ? await idbGet('wallStill:' + ptr.key) : null;
      if (still && still.blob) {
        bgApi.setWallpaper(await createImageBitmap(still.blob)); // decoded off the main thread
        hasWallpaper = true;
        // its colors were cached when it was prepared — no re-sampling
        if (still.theme && loadStored('home:imgthemeKey') !== ptr.key) {
          setImageTheme(still.theme);
          store('home:imgtheme', JSON.stringify(still.theme));
          store('home:imgthemeKey', ptr.key);
          if (activeTheme() === 'image') { bgApi.setTheme('image'); applyDayCycle(); }
        }
        fast = ptr;
      }
    } catch (e) { fast = null; }

    try {
      let list = await idbGet('wallpapers');
      if (!Array.isArray(list)) {
        const legacy = await idbGet('wallpaper');
        list = legacy ? [legacy] : [];
        if (legacy) { await idbSet('wallpapers', list); await idbSet('wallpaper', null); }
      }
      walls = list.slice(0, WALL_MAX);
    } catch (e) { walls = []; }
    const r = activeRule();
    ruleApplied = ruleKey(r);

    // the prepared copy is still one of the wallpapers: keep it on screen
    if (fast && walls[fast.i] && wallKey(walls[fast.i]) === fast.key && (!r || r.i === fast.i)) {
      wallShown = fast.i;
      wallChangedAt = Date.now();
      store('home:wallLast', String(fast.i));
      renderWallStrip();
      // a video plays over its own still (same picture, so no visible swap)
      if (isVideoSrc(walls[fast.i])) await applyWallpaper(walls[fast.i]);
      scheduleReady(); // line up the one after
      return;
    }
    // stale or missing prepared copy: the normal path, crossfading if
    // something (a now-outdated still) is already on screen
    const i = r ? r.i : pickRandomWall();
    if (i >= 0) showWall(i, !!fast);
    else {
      if (fast) { bgApi.setWallpaper(null); hasWallpaper = false; }
      renderWallStrip();
    }
  })();

  // halftone dot size slider
  const dotSlider = document.getElementById('dot-size');
  const dotVal = document.getElementById('dot-size-val');
  const savedDots = Math.max(8, Math.min(26, +(loadStored('home:dots') || 14)));
  dotSlider.value = String(savedDots);
  dotVal.textContent = String(savedDots);
  bgApi.setDotSize(savedDots);
  dotSlider.addEventListener('input', () => {
    const v = +dotSlider.value;
    dotVal.textContent = String(v);
    store('home:dots', String(v));
    bgApi.setDotSize(v);
  });

  /* ---------- quick bar (middle top) ---------- */

  // A line of shortcuts on the middle top: "recent" lists the tabs you had
  // open last (click focuses that tab), "top" lists your most used sites,
  // ranked by background.js, and "bookmarks" mirrors the bookmarks bar with
  // its real folder tree. Ctrl/Cmd/middle click opens in a background tab.

  const stripEl = document.getElementById('tab-strip');
  const tabsRow = document.getElementById('tabs-row');
  const tabsOpts = document.getElementById('tabs-opts');
  const VALID_TAB_MODES = ['off', 'top', 'recent', 'bookmarks', 'custom'];
  const STRIP_MAX = 8;        // recent / most used are top-N lists
  const BOOKMARKS_MAX = 40;   // bookmarks show what fits, the rest → "more" chip
  const OPEN_ALL_CONFIRM = 12;

  function tabsApi() {
    return typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query ? chrome : null;
  }

  function currentTabMode() {
    const m = loadStored('home:tabs');
    return VALID_TAB_MODES.includes(m) ? m : 'recent';
  }

  function renderTabOpts() {
    const cur = currentTabMode();
    for (const b of tabsOpts.children) {
      b.classList.toggle('active', b.dataset.tabs === cur);
    }
  }

  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return url; }
  }

  // storage key background.js ranks sites by (origin with trailing slash)
  function originKey(url) {
    try {
      const u = new URL(url);
      return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin + '/' : null;
    } catch (e) { return null; }
  }

  // Chrome's own favicon cache (MV3 "favicon" permission) knows every site
  // you've visited — far more reliable than favicons the tracker happened to see
  const HAS_FAVICON_API = (() => {
    try { return chrome.runtime.getManifest().permissions.includes('favicon'); } catch (e) { return false; }
  })();
  function faviconFor(pageUrl) {
    if (!HAS_FAVICON_API || !/^https?:/.test(pageUrl || '')) return '';
    return chrome.runtime.getURL('/_favicon/?pageUrl=' + encodeURIComponent(pageUrl) + '&size=32');
  }

  // bookmarks mode: the bookmarks bar (or the newest bookmarks when the bar
  // is empty). Folders keep their nesting — menus drill into subfolders.
  async function bookmarkItems(api) {
    if (!(api.bookmarks && api.bookmarks.getTree)) return [];
    const toItem = n => {
      if (n.url) {
        return /^https?:/.test(n.url) ? { kind: 'bookmark', label: n.title || hostOf(n.url), url: n.url, exact: true } : null;
      }
      return { kind: 'folder', label: n.title || 'Folder', children: (n.children || []).map(toItem).filter(Boolean) };
    };
    let barKids = [];
    try {
      const tree = await api.bookmarks.getTree();
      const barId = api.bookmarks.BAR_FOLDER_ID || '1';
      const bar = ((tree[0] && tree[0].children) || []).find(c => c.id === barId);
      barKids = (bar && bar.children) || [];
    } catch (e) { barKids = []; }

    let items = barKids.map(toItem).filter(Boolean);
    // no bookmarks bar content — fall back to the newest bookmarks overall
    if (!items.length) {
      try {
        const recent = await api.bookmarks.getRecent(STRIP_MAX * 4);
        items = recent.map(toItem).filter(it => it && it.kind === 'bookmark');
      } catch (e) { items = []; }
    }
    items = items.slice(0, BOOKMARKS_MAX);

    let tracked = {};
    try {
      if (api.storage && api.storage.local) {
        const got = await api.storage.local.get('home:tabCounts');
        tracked = (got && got['home:tabCounts']) || {};
      }
    } catch (e) { }
    const decorate = list => {
      for (const it of list) {
        if (it.kind === 'folder') decorate(it.children);
        else it.fav = faviconFor(it.url) || (tracked[originKey(it.url)] || {}).fav || '';
      }
    };
    decorate(items);
    return items;
  }

  // "custom" mode shows the links the user manages in Settings → Links
  function loadLinks() {
    try {
      const v = JSON.parse(loadStored('home:links'));
      return Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : [];
    } catch (e) { return []; }
  }
  function saveLinks(list) { store('home:links', JSON.stringify(list.slice(0, 60))); }
  function toStripItem(l) {
    if (l.kind === 'folder') {
      return { kind: 'folder', label: l.label || 'Folder', children: (l.children || []).map(toStripItem), custom: true };
    }
    return {
      label: l.label || hostOf(l.url),
      url: l.url,
      fav: faviconFor(l.url),
      icon: l.icon || '',
      custom: true,
    };
  }

  async function stripItems(mode) {
    const api = tabsApi();
    if (mode === 'custom') return loadLinks().map(toStripItem);
    if (!api) return [];
    if (mode === 'bookmarks') return bookmarkItems(api);
    if (mode === 'top') {
      if (!(api.storage && api.storage.local)) return [];
      const got = await api.storage.local.get('home:tabCounts');
      const data = (got && got['home:tabCounts']) || {};
      return Object.values(data)
        .sort((a, b) => b.count - a.count || b.last - a.last)
        .slice(0, STRIP_MAX)
        .map(e => ({ label: hostOf(e.url), url: e.url, fav: faviconFor(e.url) || e.fav || '' }));
    }
    const selfPrefix = location.origin + '/';
    const tabs = await api.tabs.query({});
    return tabs
      .filter(t => t.url
        && !t.url.startsWith(selfPrefix)
        // Chrome reports overridden new-tab pages as chrome://newtab/ — that's us
        && !/^chrome:\/\/newtab\/?$/.test(t.url)
        && t.url !== 'about:blank')
      .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))
      .slice(0, STRIP_MAX)
      .map(t => ({ label: t.title || hostOf(t.url), url: t.url, fav: t.favIconUrl || faviconFor(t.url), tabId: t.id, windowId: t.windowId }));
  }

  function stripFavicon(it) {
    const holder = document.createElement('span');
    holder.className = 'tab-fav';
    if (it.icon) { holder.textContent = it.icon; return holder; } // custom emoji/letter icon
    holder.textContent = (it.label[0] || '·').toUpperCase();
    if (it.fav && /^(https?:|chrome-extension:|data:)/.test(it.fav)) {
      const img = document.createElement('img');
      img.src = it.fav;
      img.alt = '';
      img.addEventListener('error', () => img.remove());
      holder.appendChild(img);
    }
    return holder;
  }

  function stripFolderIcon() {
    const holder = document.createElement('span');
    holder.className = 'tab-fav';
    holder.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 6.5V18a1.5 1.5 0 0 0 1.5 1.5h15A1.5 1.5 0 0 0 21 18V9a1.5 1.5 0 0 0-1.5-1.5h-7L10 5H4.5A1.5 1.5 0 0 0 3 6.5z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
    return holder;
  }

  // mode: undefined (focus an open tab, else open here), 'new' or 'bg'
  async function openStripItem(it, mode) {
    const api = tabsApi();
    if (!api) { if (it.url) location.href = it.url; return; }
    if (it.tabId != null) {
      try {
        await api.tabs.update(it.tabId, { active: true });
        if (it.windowId != null) await api.windows.update(it.windowId, { focused: true });
      } catch (e) { /* tab closed since the last refresh */ }
      return;
    }
    if (mode === 'new' || mode === 'bg') {
      try { await api.tabs.create({ url: it.url, active: mode === 'new' }); } catch (e) { }
      return;
    }
    // already open in some tab? focus it (exact URL for bookmarks, site-wide for most used)
    try {
      const open = await api.tabs.query(it.exact ? {} : { url: it.url + '*' });
      const hit = it.exact ? open.find(t => t.url === it.url) : open[0];
      if (hit) {
        await api.tabs.update(hit.id, { active: true });
        await api.windows.update(hit.windowId, { focused: true });
        return;
      }
    } catch (e) { }
    location.href = it.url;
  }

  // every bookmark directly inside a folder, each in a background tab
  async function openAll(list) {
    const urls = list.filter(it => it.kind !== 'folder').map(it => it.url);
    if (!urls.length) return;
    if (urls.length > OPEN_ALL_CONFIRM && !confirm(`Open ${urls.length} tabs?`)) return;
    const api = tabsApi();
    for (const url of urls) {
      try { await api.tabs.create({ url, active: false }); } catch (e) { }
    }
  }

  /* ---------- bar menus (folder + overflow dropdowns) ---------- */

  // One dropdown at a time, anchored under its chip. Folder rows drill into
  // the next level with a back row on top, so the "more" chip can park whole
  // folders too. Fully keyboard driven: ↑/↓ move, → enters a folder,
  // ←/Backspace goes back, Esc closes.

  let stripMenu = null;

  function closeStripMenu() {
    if (!stripMenu) return;
    const chip = stripMenu._chip;
    stripMenu.remove();
    stripMenu = null;
    if (chip) { chip.classList.remove('menu-open'); chip.setAttribute('aria-expanded', 'false'); }
    kickStrip(); // catch up on changes skipped while the menu was open
  }

  function labelSpan(text) {
    const s = document.createElement('span');
    s.className = 'tab-chip-label';
    s.textContent = text;
    return s;
  }

  function caretSpan(direction) {
    const d = direction === 'right' ? 'M9 6l6 6-6 6' : direction === 'left' ? 'M15 6l-6 6 6 6' : 'M6 9l6 6 6-6';
    const s = document.createElement('span');
    s.className = 'tab-caret';
    s.innerHTML = `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="${d}" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    return s;
  }

  function countSpan(n) {
    const s = document.createElement('span');
    s.className = 'tab-menu-count';
    s.textContent = String(n);
    return s;
  }

  function menuRow(cls) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'tab-menu-item' + (cls ? ' ' + cls : '');
    row.setAttribute('role', 'menuitem');
    return row;
  }

  function openStripMenu(chip, entries, title, focusFirst) {
    const wasOpen = stripMenu && stripMenu._chip === chip;
    closeStripMenu();
    if (wasOpen) return;
    const menu = document.createElement('div');
    menu.className = 'tab-menu';
    menu.setAttribute('role', 'menu');
    menu._chip = chip;
    const stack = [{ entries, title }];

    const renderList = focus => {
      const level = stack[stack.length - 1];
      menu.innerHTML = '';
      if (stack.length > 1) {
        const back = menuRow('tab-menu-back');
        back.addEventListener('click', () => { stack.pop(); renderList(true); });
        back.append(caretSpan('left'), labelSpan(level.title));
        menu.appendChild(back);
      }
      for (const it of level.entries) {
        const row = menuRow();
        if (it.kind === 'folder') {
          row.dataset.folder = '1';
          row.addEventListener('click', () => {
            stack.push({ entries: it.children, title: it.label });
            renderList(true);
          });
          row.append(stripFolderIcon(), labelSpan(it.label), countSpan(it.children.length), caretSpan('right'));
        } else {
          row.title = it.label + (it.url && it.url !== it.label ? '\n' + it.url : '');
          row.addEventListener('click', e => { const m = mouseMode(e); closeStripMenu(); openStripItem(it, m); });
          row.addEventListener('auxclick', e => { if (e.button === 1) { e.preventDefault(); openStripItem(it, 'bg'); } });
          row.append(stripFavicon(it), labelSpan(it.label));
        }
        menu.appendChild(row);
      }
      if (!level.entries.length) {
        const empty = document.createElement('div');
        empty.className = 'tab-menu-empty';
        empty.textContent = 'empty folder';
        menu.appendChild(empty);
      }
      const marks = level.entries.filter(it => it.kind !== 'folder' && !it.tabId);
      if (marks.length > 1 && tabsApi()) {
        const all = menuRow('tab-menu-openall');
        all.append(labelSpan(`open all (${marks.length})`));
        all.addEventListener('click', () => { closeStripMenu(); openAll(marks); });
        menu.appendChild(all);
      }
      // anchor under the chip; flip to its right edge near the screen edge
      menu.style.left = chip.offsetLeft + 'px';
      menu.style.right = 'auto';
      const box = menu.getBoundingClientRect();
      if (box.right > innerWidth - 8) {
        menu.style.left = 'auto';
        menu.style.right = Math.max(0, stripEl.clientWidth - chip.offsetLeft - chip.offsetWidth) + 'px';
      }
      if (focus) { const first = menu.querySelector('.tab-menu-item'); if (first) first.focus(); }
    };

    menu.addEventListener('click', e => e.stopPropagation());
    menu.addEventListener('keydown', e => {
      const items = [...menu.querySelectorAll('.tab-menu-item')];
      const i = items.indexOf(document.activeElement);
      const go = j => { e.preventDefault(); items[(j + items.length) % items.length].focus(); };
      if (e.key === 'ArrowDown') go(i + 1);
      else if (e.key === 'ArrowUp') go(i - 1);
      else if (e.key === 'Home') go(0);
      else if (e.key === 'End') go(items.length - 1);
      else if (e.key === 'ArrowRight' && document.activeElement && document.activeElement.dataset.folder) {
        e.preventDefault();
        document.activeElement.click();
      } else if ((e.key === 'ArrowLeft' || e.key === 'Backspace') && stack.length > 1) {
        e.preventDefault();
        stack.pop();
        renderList(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeStripMenu();
        chip.focus();
      } else if (e.key === 'Tab') {
        closeStripMenu();
      }
    });

    stripEl.appendChild(menu);
    stripMenu = menu;
    chip.classList.add('menu-open');
    chip.setAttribute('aria-expanded', 'true');
    renderList(focusFirst);
  }

  document.addEventListener('click', e => { if (stripMenu && !stripEl.contains(e.target)) closeStripMenu(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeStripMenu(); });

  // ←/→ walk the chips, ↓ opens a folder/more chip's menu
  stripEl.addEventListener('keydown', e => {
    if (!e.target.classList || !e.target.classList.contains('tab-chip')) return;
    const chips = [...stripEl.querySelectorAll('.tab-chip')];
    const i = chips.indexOf(e.target);
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      chips[(i + (e.key === 'ArrowRight' ? 1 : -1) + chips.length) % chips.length].focus();
    } else if (e.key === 'ArrowDown' && e.target._menu) {
      e.preventDefault();
      e.target._menu(true);
    }
  });

  function buildChip(it) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'tab-chip';
    chip._item = it;
    if (it.kind === 'folder') {
      chip.classList.add('tab-chip-folder');
      chip.title = `${it.label} — ${it.children.length} item${it.children.length === 1 ? '' : 's'}`;
      chip.setAttribute('aria-haspopup', 'menu');
      chip.setAttribute('aria-expanded', 'false');
      chip._menu = focus => openStripMenu(chip, it.children, it.label, focus);
      chip.addEventListener('click', e => { e.stopPropagation(); chip._menu(e.detail === 0); });
      chip.append(stripFolderIcon(), labelSpan(it.label), caretSpan());
    } else {
      chip.title = it.label + (it.url && it.url !== it.label ? '\n' + it.url : '');
      chip.addEventListener('click', e => openStripItem(it, mouseMode(e)));
      chip.addEventListener('auxclick', e => { if (e.button === 1) { e.preventDefault(); openStripItem(it, 'bg'); } });
      chip.append(stripFavicon(it), labelSpan(it.label));
    }
    return chip;
  }

  function buildMoreChip(overflow) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'tab-chip tab-chip-more';
    chip.title = 'More';
    chip.setAttribute('aria-haspopup', 'menu');
    chip.setAttribute('aria-expanded', 'false');
    chip._menu = focus => openStripMenu(chip, overflow, 'more', focus);
    chip.addEventListener('click', e => { e.stopPropagation(); chip._menu(e.detail === 0); });
    const holder = document.createElement('span');
    holder.className = 'tab-fav';
    holder.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';
    chip.append(holder, labelSpan('more'), caretSpan());
    return chip;
  }

  // rebuild only when the content actually changed — the old 5s full
  // re-render reloaded every favicon and dropped hover/focus mid-gesture
  let stripSig = '';
  var lastStripItems = []; // for the Alt+1..9 quick-open shortcut
  async function refreshTabStrip(force) {
    if (document.body.classList.contains('no-tabs')) return;
    if (stripMenu) return; // don't yank an open menu from under the cursor
    let items = [];
    try { items = await stripItems(currentTabMode()); } catch (e) { items = []; }
    lastStripItems = items;
    const sig = currentTabMode() + innerWidth + JSON.stringify(items, ['kind', 'label', 'url', 'fav', 'tabId', 'children']);
    if (!force && sig === stripSig) return;
    stripSig = sig;
    const focusedIdx = [...stripEl.querySelectorAll('.tab-chip')].indexOf(document.activeElement);
    stripEl.innerHTML = '';
    stripEl.classList.toggle('has-items', items.length > 0);
    const chips = items.map(buildChip);
    const overflow = [];
    const moreChip = buildMoreChip(overflow);
    for (const c of chips) stripEl.appendChild(c);
    stripEl.appendChild(moreChip);
    // whatever doesn't fit the line tucks into the "more" chip
    while (stripEl.scrollWidth > stripEl.clientWidth + 1 && chips.length) {
      const popped = chips.pop();
      overflow.unshift(popped._item);
      popped.remove();
    }
    if (!overflow.length) moreChip.remove();
    if (focusedIdx >= 0) {
      const again = stripEl.querySelectorAll('.tab-chip')[focusedIdx];
      if (again) again.focus();
    }
  }

  let stripKickTimer = 0;
  function kickStrip() {
    clearTimeout(stripKickTimer);
    stripKickTimer = setTimeout(() => { if (!document.hidden) refreshTabStrip(); }, 250);
  }

  function applyTabStrip() {
    const mode = currentTabMode();
    document.body.classList.toggle('no-tabs', mode === 'off' || (!tabsApi() && mode !== 'custom'));
    closeStripMenu();
    refreshTabStrip(true);
  }

  tabsOpts.addEventListener('click', e => {
    const b = e.target.closest('button[data-tabs]');
    if (!b) return;
    store('home:tabs', b.dataset.tabs);
    renderTabOpts();
    applyTabStrip();
  });
  if (!tabsApi()) tabsRow.hidden = true; // no tab data outside the extension
  renderTabOpts();
  applyTabStrip();

  // live updates: react to bookmark/tab/usage changes as they happen; a slow
  // poll remains only as a safety net
  (function watchStrip() {
    const api = tabsApi();
    if (!api) return;
    const on = ev => { try { if (ev && ev.addListener) ev.addListener(kickStrip); } catch (e) { } };
    if (api.bookmarks) ['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onChildrenReordered'].forEach(k => on(api.bookmarks[k]));
    ['onActivated', 'onRemoved', 'onCreated'].forEach(k => on(api.tabs[k]));
    try {
      api.tabs.onUpdated.addListener((id, info) => {
        if (info.title || info.favIconUrl || info.status === 'complete') kickStrip();
      });
    } catch (e) { }
    try {
      api.storage.onChanged.addListener(ch => { if (ch['home:tabCounts'] && currentTabMode() === 'top') kickStrip(); });
    } catch (e) { }
  })();
  setInterval(() => { if (!document.hidden) refreshTabStrip(); }, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kickStrip(); });
  let stripResizeTimer;
  addEventListener('resize', () => {
    clearTimeout(stripResizeTimer);
    stripResizeTimer = setTimeout(() => { closeStripMenu(); refreshTabStrip(true); }, 150);
  });

  // settings are split into tabs (Look / Layout / Search / Weather); the
  // last tab you used is where the panel reopens
  const setTabs = document.getElementById('set-tabs');
  const SET_TABS = [...setTabs.querySelectorAll('[data-tab]')].map(b => b.dataset.tab);
  function showSetTab(tab, focus) {
    if (!SET_TABS.includes(tab)) tab = SET_TABS[0];
    for (const b of setTabs.children) {
      const on = b.dataset.tab === tab;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    }
    for (const p of settingsEl.querySelectorAll('.set-pane')) p.hidden = p.dataset.pane !== tab;
    store('home:setTab', tab);
  }
  setTabs.addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (b) showSetTab(b.dataset.tab);
  });
  setTabs.addEventListener('keydown', e => {
    const i = SET_TABS.indexOf(loadStored('home:setTab'));
    if (e.key === 'ArrowRight') { e.preventDefault(); showSetTab(SET_TABS[(i + 1) % SET_TABS.length], true); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); showSetTab(SET_TABS[(i - 1 + SET_TABS.length) % SET_TABS.length], true); }
  });
  showSetTab(loadStored('home:setTab'));

  // wipe every home:* key (and the wallpaper) after a confirm, then reload
  document.getElementById('reset-all').addEventListener('click', async () => {
    if (!confirm('Reset all Home settings, search history and wallpapers?')) return;
    try {
      Object.keys(localStorage).filter(k => k.startsWith('home:')).forEach(k => localStorage.removeItem(k));
    } catch (e) { }
    try { await idbSet('wallpaper', null); await idbSet('wallpapers', null); } catch (e) { }
    location.reload();
  });

  function setSettings(open) {
    settingsEl.classList.toggle('open', open);
    settingsBtn.setAttribute('aria-expanded', String(open));
  }
  settingsBtn.addEventListener('click', e => {
    e.stopPropagation();
    setSettings(!settingsEl.classList.contains('open'));
  });
  // (a click on a control that re-rendered itself away isn't an outside click)
  document.addEventListener('click', e => {
    if (e.target.isConnected && !settingsEl.contains(e.target) && !settingsBtn.contains(e.target)) setSettings(false);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && settingsEl.classList.contains('open')) setSettings(false);
  });

  /* ---------- mod layer (widgets) ---------- */

  // Add a widget by registering it here: mount(cardBody) draws the content
  // and may return a cleanup function; persistence is handled by the layer.
  const WIDGETS = {
    vibes: {
      name: 'Good vibes',
      blurb: 'random little reminders',
      mount(body) {
        const MESSAGES = [
          'be happy', 'good to see you', 'remember i love you', 'stay happy',
          'be safe', "you've got this", 'proud of you', 'drink some water',
          'take a deep breath', 'you are enough', 'stay cozy', 'shine on',
          'one step at a time', 'smile — it looks good on you',
          'you built something beautiful today', 'the world is better with you in it',
          'your future self is proud of you',
        ];

        const msg = document.createElement('div');
        msg.className = 'wg-vibes-msg';
        msg.textContent = pick(); // show one right away, more follow on the timer
        const hint = document.createElement('div');
        hint.className = 'wg-vibes-hint';
        hint.textContent = 'click for another';
        const card = document.createElement('div');
        card.className = 'wg-vibes';
        card.appendChild(msg);
        card.appendChild(hint);
        card.title = 'Show another message';
        body.appendChild(card);

        const toasts = new Set();
        const timers = [];
        const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

        function pick() {
          return MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
        }

        function safeSpot() {
          for (let i = 0; i < 12; i++) {
            const fx = 0.06 + Math.random() * 0.88;
            const fy = 0.10 + Math.random() * 0.72;
            const inCenterX = fx > 0.22 && fx < 0.78;
            const inCenterY = fy > 0.30 && fy < 0.68;
            if (!(inCenterX && inCenterY)) return { x: fx * innerWidth, y: fy * innerHeight };
          }
          return { x: innerWidth * 0.12, y: innerHeight * 0.15 };
        }

        function spawn(custom) {
          const text = custom || pick();
          msg.textContent = text;
          if (reduced) return;
          const t = document.createElement('div');
          t.className = 'vibe-toast';
          t.textContent = '♥ ' + text;
          const spot = safeSpot();
          t.style.left = Math.round(spot.x) + 'px';
          t.style.top = Math.round(spot.y) + 'px';
          document.body.appendChild(t);
          toasts.add(t);
          requestAnimationFrame(() => t.classList.add('show'));
          timers.push(setTimeout(() => {
            t.classList.remove('show');
            timers.push(setTimeout(() => { t.remove(); toasts.delete(t); }, 600));
          }, 5200));
        }

        function loop() {
          spawn();
          timers.push(setTimeout(loop, 20000 + Math.random() * 25000));
        }

        card.addEventListener('click', () => spawn());
        timers.push(setTimeout(loop, 6000)); // first one shows up shortly after load

        return () => {
          timers.forEach(clearTimeout);
          toasts.forEach(t => t.remove());
          toasts.clear();
        };
      },
    },

    bus: {
      name: 'Bus tracker',
      blurb: 'Next arrivals, simulated feed',
      mount(body) {
        const lines = [
          { n: '8', dest: 'Center' },
          { n: '15', dest: 'Station' },
          { n: '23', dest: 'Airport' },
        ];
        const head = document.createElement('div');
        head.className = 'wg-bus-head';
        head.innerHTML = '<span class="live-dot"></span><span>NEXT ARRIVALS · SIM</span>';
        const list = document.createElement('div');
        list.className = 'wg-bus-list';
        body.appendChild(head);
        body.appendChild(list);

        const rows = lines.map(l => ({ ...l, at: Date.now() + (45 + Math.random() * 840) * 1000 }));
        const fmt = ms => {
          const s = Math.max(0, Math.round(ms / 1000));
          return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
        };

        const render = () => {
          const now = Date.now();
          list.innerHTML = '';
          for (const r of rows) {
            if (r.at - now < 0) r.at = now + (480 + Math.random() * 900) * 1000;
            const row = document.createElement('div');
            row.className = 'wg-bus-row';
            row.innerHTML =
              `<span class="wg-badge">${r.n}</span>` +
              `<span class="wg-dest">${r.dest}</span>` +
              `<span class="wg-eta">${fmt(r.at - now)}</span>`;
            list.appendChild(row);
          }
        };
        render();
        const timer = setInterval(render, 1000);
        return () => clearInterval(timer);
      },
    },

    quotes: {
      name: 'Quote',
      blurb: 'a quote of the day — click for another',
      mount(body) {
        const BUILTIN = [
          ['The best way to predict the future is to invent it.', 'Alan Kay'],
          ['Simplicity is the soul of efficiency.', 'Austin Freeman'],
          ['Well begun is half done.', 'Aristotle'],
          ['It always seems impossible until it is done.', 'Nelson Mandela'],
          ['Do or do not — there is no try.', 'Yoda'],
          ['Stay hungry, stay foolish.', 'Steve Jobs'],
          ['The only way out is through.', 'Robert Frost'],
          ['What we think, we become.', 'Buddha'],
          ['Everything you can imagine is real.', 'Pablo Picasso'],
          ['Make it work, make it right, make it fast.', 'Kent Beck'],
          ['Premature optimization is the root of all evil.', 'Donald Knuth'],
          ['Talk is cheap. Show me the code.', 'Linus Torvalds'],
          ['The quieter you become, the more you can hear.', 'Ram Dass'],
          ['Fall seven times, stand up eight.', 'Japanese proverb'],
          ['A journey of a thousand miles begins with a single step.', 'Laozi'],
          ['You miss 100% of the shots you don’t take.', 'Wayne Gretzky'],
          ['The best time to plant a tree was 20 years ago. The second best time is now.', 'Chinese proverb'],
          ['Small deeds done are better than great deeds intended.', 'Peter Marshall'],
          ['Not all those who wander are lost.', 'J.R.R. Tolkien'],
          ['In the middle of difficulty lies opportunity.', 'Albert Einstein'],
          ['The only limit to our realization of tomorrow is our doubts of today.', 'F. D. Roosevelt'],
          ['Happiness is not something ready-made. It comes from your own actions.', 'Dalai Lama'],
          ['Turn your wounds into wisdom.', 'Oprah Winfrey'],
          ['Dream big and dare to fail.', 'Norman Vaughan'],
        ].map(([q, a]) => ({ q, a }));
        // custom quotes: one per line, "Author, quote"
        const custom = () => (loadStored('home:quotesCustom') || '')
          .split('\n').map(l => l.trim()).filter(Boolean)
          .map(l => {
            const i = l.indexOf(',');
            return i > 0 ? { q: l.slice(i + 1).trim(), a: l.slice(0, i).trim() } : { q: l, a: '' };
          });
        const all = () => [...BUILTIN, ...custom()];
        let idx = 0;
        const card = document.createElement('div');
        card.className = 'wg-quote';
        card.title = 'Click for another quote';
        const q = document.createElement('div');
        q.className = 'wg-quote-text';
        const a = document.createElement('div');
        a.className = 'wg-quote-author';
        const hint = document.createElement('div');
        hint.className = 'wg-vibes-hint';
        hint.textContent = 'click for another';
        card.append(q, a, hint);
        body.appendChild(card);
        function show() {
          const list = all();
          if (!list.length) { q.textContent = 'Add your own quotes in Settings → Widgets'; a.textContent = ''; return; }
          idx = ((idx % list.length) + list.length) % list.length;
          q.textContent = '“' + list[idx].q + '”';
          a.textContent = list[idx].a ? '— ' + list[idx].a : '';
        }
        function next() {
          const list = all();
          if (list.length < 2) return show();
          let n = idx;
          while (n === idx) n = Math.floor(Math.random() * list.length);
          idx = n;
          show();
        }
        // quote of the day on load
        const d = new Date();
        const day = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
        idx = ((day % all().length) + all().length) % all().length;
        card.addEventListener('click', next);
        const onNext = () => next();
        document.addEventListener('home:next-quote', onNext);
        show();
        return () => document.removeEventListener('home:next-quote', onNext);
      },
    },

    notes: {
      name: 'Notes',
      blurb: 'markdown-ish notes & to-dos',
      mount(body) {
        const KEY = 'home:notes';
        const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        const view = document.createElement('div');
        view.className = 'wg-notes-view';
        view.title = 'Click to edit';
        const ta = document.createElement('textarea');
        ta.className = 'wg-notes-edit';
        ta.spellcheck = false;
        ta.placeholder = '# heading\n- bullet\n- [ ] todo';
        ta.hidden = true;
        body.appendChild(view);
        body.appendChild(ta);
        function render() {
          const src = loadStored(KEY) || '';
          const todos = [];
          const html = src.split('\n').map((line, li) => {
            let m;
            if ((m = line.match(/^###\s+(.*)/))) return `<h4>${esc(m[1])}</h4>`;
            if ((m = line.match(/^##\s+(.*)/))) return `<h3>${esc(m[1])}</h3>`;
            if ((m = line.match(/^#\s+(.*)/))) return `<h2>${esc(m[1])}</h2>`;
            if ((m = line.match(/^-\s+\[x\]\s+(.*)/i))) { todos.push(li); return `<label class="wg-todo done"><input type="checkbox" checked> ${esc(m[1])}</label>`; }
            if ((m = line.match(/^-\s+\[ \]\s+(.*)/))) { todos.push(li); return `<label class="wg-todo"><input type="checkbox"> ${esc(m[1])}</label>`; }
            if ((m = line.match(/^-\s+(.*)/))) return `<div class="wg-li">•&nbsp;${esc(m[1])}</div>`;
            if (!line.trim()) return '<div class="wg-gap"></div>';
            return `<p>${esc(line)}</p>`;
          }).join('');
          view.innerHTML = html || '<span class="wg-notes-empty">click to write…</span>';
          view.querySelectorAll('.wg-todo input').forEach((cb, k) => {
            cb.addEventListener('change', () => {
              const lines = (loadStored(KEY) || '').split('\n');
              const li = todos[k];
              if (li == null || !lines[li]) return;
              lines[li] = lines[li].replace(/^-\s+\[[ xX]\]/, cb.checked ? '- [x]' : '- [ ]');
              store(KEY, lines.join('\n'));
              render();
            });
          });
        }
        function edit() {
          ta.value = loadStored(KEY) || '';
          view.hidden = true;
          ta.hidden = false;
          ta.focus();
        }
        function done() {
          store(KEY, ta.value);
          ta.hidden = true;
          view.hidden = false;
          render();
        }
        // ticking a to-do must not bubble up and open the editor (which would
        // load the pre-tick text and save it back over the tick on blur)
        view.addEventListener('click', e => { if (!e.target.closest('.wg-todo')) edit(); });
        ta.addEventListener('blur', done);
        ta.addEventListener('keydown', e => {
          // Ctrl/Cmd+Shift+1..5 prefix the current line, like Bonjourr's notes
          if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
            // e.code, not e.key: with Shift held the key is '!', '@', … not a digit
            const prefixes = { Digit1: '# ', Digit2: '## ', Digit3: '### ', Digit4: '- ', Digit5: '- [ ] ',
              Numpad1: '# ', Numpad2: '## ', Numpad3: '### ', Numpad4: '- ', Numpad5: '- [ ] ' };
            const p = prefixes[e.code];
            if (p) {
              e.preventDefault();
              const s = ta.selectionStart;
              const lineStart = ta.value.lastIndexOf('\n', s - 1) + 1;
              ta.value = ta.value.slice(0, lineStart) + p + ta.value.slice(lineStart);
              ta.selectionStart = ta.selectionEnd = lineStart + p.length;
            }
          }
          if (e.key === 'Escape') done();
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') done();
        });
        render();
      },
    },

    pomo: {
      name: 'Pomodoro',
      blurb: 'focus timer — countdown also in the tab title',
      mount(body) {
        const KEY = 'home:pomo';
        const load = () => { try { return JSON.parse(loadStored(KEY)); } catch (e) { return null; } };
        const save = s => store(KEY, JSON.stringify(s));
        const cfg = () => loadPomoCfg();
        const fresh = () => ({ mode: 'work', running: false, endsAt: 0, left: cfg().work * 60000, focus: false, done: 0 });
        // localStorage is the single source of truth, so several open new tabs
        // share one timer instead of each running (and ringing) their own
        const sync = () => { const v = load(); st = v && typeof v === 'object' ? v : fresh(); };
        let st = null;
        sync();
        // a session that ended while no tab was open just advances silently
        // (render isn't touched here — the card elements don't exist yet)
        if (st.running && st.endsAt <= Date.now()) advance(true);
        function advance(silent) {
          sync();
          // another tab may have advanced it already — then just follow along
          if (silent !== 'skip' && !(st.running && st.endsAt <= Date.now())) return false;
          if (st.mode === 'work') { st.done = (st.done || 0) + 1; st.mode = st.done % 4 === 0 ? 'long' : 'short'; }
          else st.mode = 'work';
          st.left = cfg()[st.mode] * 60000;
          st.endsAt = Date.now() + st.left;
          st.running = true;
          save(st);
          if (silent !== true) ring();
          return true;
        }
        function ring() {
          try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            ring.ac = ring.ac || new AC();
            const ac = ring.ac;
            for (let i = 0; i < 3; i++) {
              const o = ac.createOscillator(), g = ac.createGain();
              o.type = 'square';
              o.frequency.value = i % 2 ? 660 : 880;
              o.connect(g); g.connect(ac.destination);
              const t0 = ac.currentTime + i * 0.3;
              g.gain.setValueAtTime(0.0001, t0);
              g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);
              g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.26);
              o.start(t0); o.stop(t0 + 0.28);
            }
          } catch (e) { }
        }
        const card = document.createElement('div');
        card.className = 'wg-pomo';
        const time = document.createElement('div');
        time.className = 'wg-pomo-time';
        const mode = document.createElement('div');
        mode.className = 'wg-pomo-mode';
        const btns = document.createElement('div');
        btns.className = 'wg-pomo-btns';
        const start = document.createElement('button');
        start.type = 'button'; start.className = 'wall-btn';
        const skip = document.createElement('button');
        skip.type = 'button'; skip.className = 'wall-btn'; skip.textContent = 'skip';
        const focus = document.createElement('button');
        focus.type = 'button'; focus.className = 'wall-btn';
        const doneEl = document.createElement('div');
        doneEl.className = 'wg-pomo-done';
        btns.append(start, skip, focus);
        card.append(time, mode, btns, doneEl);
        body.appendChild(card);
        const fmt = ms => {
          const s = Math.max(0, Math.ceil(ms / 1000));
          return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
        };
        function render() {
          const ms = st.running ? st.endsAt - Date.now() : (st.left || cfg()[st.mode] * 60000);
          time.textContent = fmt(ms);
          mode.textContent = st.mode + (st.running ? '' : ' · paused');
          start.textContent = st.running ? 'pause' : 'start';
          focus.textContent = st.focus ? 'focus on' : 'focus off';
          focus.classList.toggle('active', !!st.focus);
          doneEl.textContent = st.done ? `${st.done} pomodoro${st.done === 1 ? '' : 's'} done` : '';
          document.body.classList.toggle('pomo-focus', !!st.focus && st.running);
          renderTabTitle();
        }
        start.addEventListener('click', () => {
          sync();
          if (st.running) { st.left = Math.max(0, st.endsAt - Date.now()); st.running = false; st.endsAt = 0; }
          else { st.endsAt = Date.now() + (st.left || cfg()[st.mode] * 60000); st.running = true; }
          save(st); render();
        });
        skip.addEventListener('click', () => { advance('skip'); render(); });
        focus.addEventListener('click', () => { sync(); st.focus = !st.focus; save(st); render(); });
        const timer = setInterval(() => {
          sync();
          // whichever tab notices first advances (and rings); advance() re-reads
          // storage, so the others then see the new session and stay quiet
          if (st.running && st.endsAt <= Date.now()) advance(false);
          render();
        }, 500);
        render();
        return () => {
          clearInterval(timer);
          document.body.classList.remove('pomo-focus');
          renderTabTitle();
        };
      },
    },
  };

  const modTab = document.getElementById('mod-tab');
  const modLayer = document.getElementById('mod-layer');
  const modBody = document.getElementById('mod-body');
  const modAdd = document.getElementById('mod-add');
  const modHide = document.getElementById('mod-hide');
  const modAddMenu = document.getElementById('mod-add-menu');

  let widgetSeq = 0;
  const widgetCleanups = new Map();

  function loadWidgets() {
    try {
      const v = JSON.parse(localStorage.getItem('home:widgets'));
      // unknown types are kept — they may be provided by personal mods.js later
      return Array.isArray(v) ? [...new Set(v)] : [];
    } catch (e) { return []; }
  }
  function saveWidgets(list) { store('home:widgets', JSON.stringify([...new Set(list)])); }

  function addWidget(type, restore = false) {
    const def = WIDGETS[type];
    if (!def) return;
    const id = ++widgetSeq;

    const card = document.createElement('div');
    card.className = 'mod-card';
    card.dataset.idx = id;

    const head = document.createElement('div');
    head.className = 'mod-card-head';
    const name = document.createElement('span');
    name.textContent = def.name;
    const rm = document.createElement('button');
    rm.className = 'mod-remove';
    rm.type = 'button';
    rm.textContent = '×';
    rm.title = 'Remove widget';
    rm.addEventListener('click', () => removeWidget(id, type));
    const pin = document.createElement('button');
    pin.className = 'mod-pin';
    pin.type = 'button';
    pin.title = 'Pin to the page';
    pin.setAttribute('aria-label', 'Pin widget to the page');
    pin.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 3h6l-1 6 4 4H6l4-4-1-6zM12 13v8" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/></svg>';
    pin.addEventListener('click', e => { e.stopPropagation(); togglePin(type); });
    head.appendChild(name);
    head.appendChild(pin);
    head.appendChild(rm);
    card.appendChild(head);
    card.dataset.type = type;

    const body = document.createElement('div');
    body.className = 'mod-card-body';
    card.appendChild(body);
    modBody.appendChild(card);

    widgetCleanups.set(id, def.mount ? def.mount(body) : null);

    // free placement: a saved spot pins the card onto the page instead of the panel
    const savedPos = posToPx(loadWidgetPos()[type]);
    if (savedPos) pinCard(card, savedPos.x, savedPos.y);
    bindCardDrag(card, type);

    if (!restore) {
      const list = loadWidgets();
      list.push(type);
      saveWidgets(list);
      renderAddMenu();
      renderEmptyHint();
    }
    renderWidgetList();
  }

  function removeWidget(id, type) {
    const card = document.querySelector(`.mod-card[data-idx="${id}"]`);
    if (card) card.remove();
    widgetCleanups.get(id)?.();
    widgetCleanups.delete(id);
    const list = loadWidgets();
    const pos = list.indexOf(type);
    if (pos !== -1) list.splice(pos, 1);
    saveWidgets(list);
    const pp = loadWidgetPos();
    delete pp[type];
    saveWidgetPos(pp);
    renderAddMenu();
    renderEmptyHint();
    renderWidgetList();
  }

  function renderEmptyHint() {
    modBody.querySelector('.mod-empty')?.remove();
    if (modBody.querySelector('.mod-card')) return;
    const hint = document.createElement('div');
    hint.className = 'mod-empty';
    hint.textContent = 'Empty layer — add a widget with +';
    modBody.appendChild(hint);
  }

  function renderAddMenu() {
    const counts = {};
    loadWidgets().forEach(t => { counts[t] = (counts[t] || 0) + 1; });
    modAddMenu.innerHTML = '';
    for (const [type, def] of Object.entries(WIDGETS)) {
      const b = document.createElement('button');
      b.type = 'button';
      const added = (counts[type] || 0) > 0;
      if (added) b.disabled = true;
      b.innerHTML = `<strong>${def.name}</strong><span>${added ? 'already on the layer' : def.blurb}</span>`;
      b.addEventListener('click', () => {
        if (b.disabled) return;
        addWidget(type);
        modAddMenu.classList.remove('open');
      });
      modAddMenu.appendChild(b);
    }
  }

  function setLayer(open) {
    modLayer.classList.toggle('open', open);
    modTab.setAttribute('aria-expanded', String(open));
    store('home:layerOpen', open ? '1' : '0');
  }

  modTab.addEventListener('click', () => setLayer(!modLayer.classList.contains('open')));
  modHide.addEventListener('click', () => setLayer(false));
  modAdd.addEventListener('click', e => {
    e.stopPropagation();
    renderAddMenu();
    modAddMenu.classList.toggle('open');
    // the panel sits near the bottom of the screen: cap the list to the room
    // left below its top edge so it scrolls instead of running off-screen
    if (modAddMenu.classList.contains('open')) {
      modAddMenu.style.maxHeight = '';
      const top = modAddMenu.getBoundingClientRect().top;
      modAddMenu.style.maxHeight = Math.max(140, innerHeight - top - 14) + 'px';
    }
  });
  document.addEventListener('click', e => {
    if (!modAddMenu.contains(e.target) && e.target !== modAdd) modAddMenu.classList.remove('open');
  });
  document.addEventListener('keydown', e => {
    const inField = isTypingTarget(document.activeElement);
    if ((e.key === 'w' || e.key === 'W') && !inField && !e.ctrlKey && !e.metaKey && !e.altKey) {
      setLayer(!modLayer.classList.contains('open'));
    }
  });

  // first run seeds the bus tracker; afterwards the saved set is restored as-is
  if (loadStored('home:widgets') === null) saveWidgets(['bus']);
  loadWidgets().forEach(t => addWidget(t, true));
  saveWidgets(loadWidgets()); // normalize any legacy duplicates
  renderAddMenu();
  renderEmptyHint();
  setLayer(loadStored('home:layerOpen') !== '0');

  /* ---------- widget alerts dock ---------- */

  // widgets (e.g. bus trackers in mods.js) pop alerts at the bottom of the
  // page. They all live in one dock: it stacks the visible ones without gaps
  // (a switched-off widget leaves no hole) and can be dragged anywhere —
  // the spot is remembered; double-click an alert to put the dock back.
  const alertDock = document.createElement('div');
  alertDock.className = 'mod-alerts';
  alertDock.id = 'mod-alerts';
  alertDock.title = 'Drag to move · double-click to reset';
  document.body.appendChild(alertDock);
  function adoptAlert(el) {
    el.style.bottom = ''; // older mods positioned each alert themselves
    el.style.top = '';
    if (el.parentElement !== alertDock) alertDock.appendChild(el);
  }
  // any .mod-alert added straight to <body> (older mods.js) is moved in
  new MutationObserver(muts => {
    for (const m of muts) for (const n of m.addedNodes) {
      if (n.nodeType === 1 && n.classList.contains('mod-alert')) adoptAlert(n);
    }
  }).observe(document.body, { childList: true });
  function placeAlertDock() {
    let p = null;
    try { p = JSON.parse(loadStored('home:alertPos')); } catch (e) { }
    if (!p || !isFinite(p.fx) || !isFinite(p.fy)) {
      alertDock.classList.remove('moved');
      alertDock.style.left = alertDock.style.top = '';
      return;
    }
    alertDock.classList.add('moved');
    const r = alertDock.getBoundingClientRect();
    alertDock.style.left = Math.max(8, Math.min(innerWidth - r.width - 8, p.fx * innerWidth)) + 'px';
    alertDock.style.top = Math.max(8, Math.min(innerHeight - r.height - 8, p.fy * innerHeight)) + 'px';
  }
  alertDock.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !e.target.closest('.mod-alert')) return;
    const r = alertDock.getBoundingClientRect();
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    let moved = false;
    const move = ev => {
      if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 5) return;
      moved = true;
      alertDock.classList.add('moved', 'dragging');
      const w = alertDock.offsetWidth, h = alertDock.offsetHeight;
      alertDock.style.left = Math.max(8, Math.min(innerWidth - w - 8, ev.clientX - dx)) + 'px';
      alertDock.style.top = Math.max(8, Math.min(innerHeight - h - 8, ev.clientY - dy)) + 'px';
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      alertDock.classList.remove('dragging');
      if (moved) store('home:alertPos', JSON.stringify({
        fx: parseFloat(alertDock.style.left) / innerWidth,
        fy: parseFloat(alertDock.style.top) / innerHeight,
      }));
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  });
  alertDock.addEventListener('dblclick', e => {
    if (!e.target.closest('.mod-alert')) return;
    try { localStorage.removeItem('home:alertPos'); } catch (err) { }
    placeAlertDock();
  });
  addEventListener('resize', placeAlertDock);
  // the dock is often empty when first placed; once alerts show up (and it
  // grows) re-clamp a moved dock so it never spills past the screen edge
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => {
      if (alertDock.classList.contains('moved') && !alertDock.classList.contains('dragging')) placeAlertDock();
    }).observe(alertDock);
  }
  placeAlertDock();

  // personal local mods: a gitignored mods.js registers extra widgets here
  // (missing file is normal — the script tag silently removes itself)
  window.HOME_MODS = {
    // where a widget should put its alert element (see .mod-alert)
    alertHost: alertDock,
    register(id, def) {
      if (!id || !def || typeof def.mount !== 'function' || WIDGETS[id]) return;
      WIDGETS[id] = { name: def.name || id, blurb: def.blurb || '', mount: def.mount };
      const mounted = [...document.querySelectorAll('.mod-card')].map(c => c.dataset.type);
      loadWidgets().forEach(t => {
        if (t === id && !mounted.includes(id)) addWidget(id, true);
      });
      renderAddMenu();
      renderEmptyHint();
      renderWidgetList();
    },
  };
  const modsScript = document.createElement('script');
  modsScript.src = 'mods.js';
  modsScript.addEventListener('error', () => modsScript.remove());
  document.head.appendChild(modsScript);

  /* ================= search ================= */

  // bangs: "!yt cats" (or "cats !yt") searches another site without touching
  // the default engine. g / d / p mirror the provider dropdown.
  const BANGS = [
    { key: 'g',   name: 'Google',         url: 'https://www.google.com/search?q=' },
    { key: 'd',   name: 'DuckDuckGo',     url: 'https://duckduckgo.com/?q=', alias: ['ddg'], suggest: 'ddg' },
    { key: 'p',   name: 'Perplexity',     url: 'https://www.perplexity.ai/search?q=' },
    { key: 'b',   name: 'Bing',           url: 'https://www.bing.com/search?q=' },
    { key: 'yt',  name: 'YouTube',        url: 'https://www.youtube.com/results?search_query=' },
    { key: 'w',   name: 'Wikipedia',      url: 'https://en.wikipedia.org/w/index.php?search=' },
    { key: 'gh',  name: 'GitHub',         url: 'https://github.com/search?q=' },
    { key: 'r',   name: 'Reddit',         url: 'https://www.reddit.com/search/?q=' },
    { key: 'm',   name: 'Maps',           url: 'https://www.google.com/maps/search/' },
    { key: 'i',   name: 'Images',         url: 'https://www.google.com/search?tbm=isch&q=' },
    { key: 'so',  name: 'Stack Overflow', url: 'https://stackoverflow.com/search?q=' },
    { key: 'mdn', name: 'MDN',            url: 'https://developer.mozilla.org/en-US/search?q=' },
    { key: 'npm', name: 'npm',            url: 'https://www.npmjs.com/search?q=' },
    { key: 'a',   name: 'Amazon',         url: 'https://www.amazon.com/s?k=' },
    { key: 'tr',  name: 'Translate',      url: 'https://translate.google.com/?sl=auto&tl=en&text=' },
    { key: 'x',   name: 'X',              url: 'https://x.com/search?q=' },
  ];
  const PROVIDER_BANG = { google: 'g', ddg: 'd', perplexity: 'p' };

  const bangLetter = b => b.letter || b.name[0].toUpperCase();
  const findBang = k => BANGS.find(b => b.key === k || (b.alias || []).includes(k));

  function parseBang(q) {
    let m = q.match(/^!(\S+)(?:\s+([\s\S]*))?$/);
    if (m) { const b = findBang(m[1].toLowerCase()); if (b) return { b, q: (m[2] || '').trim() }; }
    m = q.match(/^([\s\S]*\S)\s+!(\S+)$/);
    if (m) { const b = findBang(m[2].toLowerCase()); if (b) return { b, q: m[1].trim() }; }
    return null;
  }
  // "!yt" alone opens the site itself
  const bangUrl = (b, q) => (q ? b.url + encodeURIComponent(q) : new URL(b.url).origin + '/');

  /* ---------- search prefs (settings → Search) ---------- */

  const openPref = () => (loadStored('home:open') === 'new' ? 'new' : 'same');
  const suggestOn = () => loadStored('home:suggest') !== 'off';
  const historyOn = () => loadStored('home:history') !== 'off';

  // generic one-of-N option row bound to a localStorage key
  function bindOpts(el, attr, key, def, after) {
    const cur = () => loadStored(key) || def;
    const render = () => {
      for (const b of el.querySelectorAll(`button[data-${attr}]`)) b.classList.toggle('active', b.dataset[attr] === cur());
    };
    el.addEventListener('click', e => {
      const b = e.target.closest(`button[data-${attr}]`);
      if (!b) return;
      store(key, b.dataset[attr]);
      render();
      if (after) after();
    });
    render();
  }
  bindOpts(document.getElementById('open-opts'), 'open', 'home:open', 'same');
  bindOpts(document.getElementById('suggest-opts'), 'suggest', 'home:suggest', 'on', () => closeSuggestions());
  bindOpts(document.getElementById('history-opts'), 'history', 'home:history', 'on');

  /* ---------- recent searches (local only) ---------- */

  const HISTORY_KEY = 'home:searches';
  const HISTORY_MAX = 60;

  function loadHistory() {
    try {
      const v = JSON.parse(loadStored(HISTORY_KEY));
      return Array.isArray(v) ? v.filter(x => x && typeof x.q === 'string') : [];
    } catch (e) { return []; }
  }
  function saveHistory(list) { store(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_MAX))); }
  function remember(q) {
    if (!historyOn() || !q) return;
    const low = q.toLowerCase();
    const list = loadHistory().filter(x => x.q.toLowerCase() !== low);
    list.unshift({ q, ts: Date.now() });
    saveHistory(list);
  }
  function forget(q) { saveHistory(loadHistory().filter(x => x.q !== q)); }
  function historyMatches(q, n) {
    if (!historyOn()) return [];
    const low = q.toLowerCase();
    const list = loadHistory().map(x => x.q).filter(s => s.toLowerCase() !== low);
    const pre = list.filter(s => s.toLowerCase().startsWith(low));
    const mid = list.filter(s => !s.toLowerCase().startsWith(low) && s.toLowerCase().includes(low));
    return [...pre, ...mid].slice(0, n);
  }

  const historyClear = document.getElementById('history-clear');
  historyClear.addEventListener('click', () => {
    saveHistory([]);
    closeSuggestions();
    historyClear.textContent = 'Cleared ✓';
    historyClear.classList.add('flashed');
    setTimeout(() => { historyClear.textContent = 'Clear'; historyClear.classList.remove('flashed'); }, 1400);
  });

  // bang cheat sheet in the Search tab
  (function renderBangSheet() {
    const el = document.getElementById('set-bangs');
    const title = document.createElement('div');
    title.className = 'bang-title';
    title.textContent = 'Bangs — start (or end) a search with one to jump to another site:';
    el.appendChild(title);
    for (const b of BANGS) {
      const row = document.createElement('div');
      row.className = 'bang-row';
      const code = document.createElement('code');
      code.textContent = '!' + b.key;
      const name = document.createElement('span');
      name.textContent = b.name;
      row.append(code, name);
      el.appendChild(row);
    }
  })();

  /* ---------- provider dropdown + engine row ---------- */

  const engineOpts = document.getElementById('engine-opts');
  function renderEngineOpts() {
    engineOpts.innerHTML = '';
    for (const p of allProviders()) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.engine = p.id;
      b.textContent = p.name;
      engineOpts.appendChild(b);
    }
    renderProvider();
  }
  renderEngineOpts();
  engineOpts.addEventListener('click', e => {
    const b = e.target.closest('button[data-engine]');
    if (b) setProvider(allProviders().find(p => p.id === b.dataset.engine), false);
  });

  function renderProvider() {
    // a bang typed in the box temporarily takes over the chip
    const bang = parseBang(input.value.trim());
    btn.classList.toggle('bang-on', !!bang);
    ico.textContent = bang ? bangLetter(bang.b) : provider.letter;
    nameEl.textContent = bang ? bang.b.name : provider.name;
    for (const li of menu.children) {
      li.setAttribute('aria-selected', li.dataset.id === provider.id ? 'true' : 'false');
    }
    for (const b of engineOpts.children) b.classList.toggle('active', b.dataset.engine === provider.id);
  }

  function setProvider(p, refocus = true) {
    if (!p) return;
    provider = p;
    store('home:provider', p.id);
    renderProvider();
    close();
    if (refocus) {
      input.focus();
      if (input.value.trim()) onInput(); // re-ask the new engine for suggestions
    }
  }

  const CHECK = '<svg class="check" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5 9-10" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function renderProviderMenu() {
    menu.innerHTML = '';
    for (const p of allProviders()) {
      const li = document.createElement('li');
      li.dataset.id = p.id;
      li.setAttribute('role', 'option');
      // the custom engine's name is user text: escape it before it hits innerHTML
      const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      li.innerHTML = `<span class="provider-ico">${esc(p.letter)}</span><span>${esc(p.name)}</span><span class="menu-bang">${PROVIDER_BANG[p.id] ? '!' + PROVIDER_BANG[p.id] : ''}</span>${CHECK}`;
      li.addEventListener('click', () => setProvider(p));
      menu.appendChild(li);
    }
  }
  renderProviderMenu();

  let menuIdx = -1;
  function renderMenuActive() {
    [...menu.children].forEach((li, i) => li.classList.toggle('active', i === menuIdx));
  }
  function open() {
    wrap.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    // by id: the custom provider is rebuilt from storage, so it's never === provider
    menuIdx = allProviders().findIndex(p => p.id === provider.id);
    renderMenuActive();
  }
  function close() { wrap.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }
  const isOpen = () => wrap.classList.contains('open');

  btn.addEventListener('click', e => { e.stopPropagation(); isOpen() ? close() : open(); });
  btn.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen()) { open(); return; }
      const n = allProviders().length;
      menuIdx = (menuIdx + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
      renderMenuActive();
    } else if ((e.key === 'Enter' || e.key === ' ') && isOpen() && menuIdx >= 0) {
      e.preventDefault();
      const p = allProviders()[menuIdx];
      if (p) setProvider(p);
    } else if (e.key === 'Escape' && isOpen()) {
      e.preventDefault();
      close();
    }
  });
  document.addEventListener('click', e => { if (!wrap.contains(e.target)) close(); });
  btn.title = 'Search engine — Alt+↑/↓ in the box switches it';
  renderProvider();

  /* ---------- navigation ---------- */

  // mode: 'same' (this tab), 'new' (foreground tab), 'bg' (background tab);
  // undefined follows the Open setting
  function navigate(url, mode) {
    closeSuggestions();
    if (!mode) mode = openPref();
    if (mode === 'same') { location.href = url; return; }
    const api = tabsApi();
    if (api && api.tabs.create) api.tabs.create({ url, active: mode !== 'bg' });
    else window.open(url, '_blank', 'noopener');
    input.value = '';
    updatePhVisibility();
    renderProvider();
  }

  // Ctrl/Cmd/middle click → background tab, Shift click → new tab
  const mouseMode = e => (e.ctrlKey || e.metaKey || e.button === 1 ? 'bg' : e.shiftKey ? 'new' : undefined);
  // Ctrl/Cmd/Alt+Enter → new tab (like the omnibox), Shift+Enter → background
  const keyMode = e => (e.ctrlKey || e.metaKey || e.altKey ? 'new' : e.shiftKey ? 'bg' : undefined);

  // the one place a typed query turns into a destination
  function go(text, mode) {
    const q = text.trim();
    if (!q) return;
    remember(q);
    const bang = parseBang(q);
    if (bang) return navigate(bangUrl(bang.b, bang.q), mode);
    if (looksLikeUrl(q)) return navigate(normalizeUrl(q), mode);
    navigate(engineUrl(q), mode);
  }

  // a picked suggestion always searches (even if it looks like a domain),
  // through the bang that was active when it was offered
  function searchTerm(s, bang, mode) {
    remember(bang ? `!${bang.key} ${s}` : s);
    navigate(bang ? bangUrl(bang, s) : engineUrl(s), mode);
  }

  function submit(mode) {
    const q = input.value.trim();
    if (!q) { input.focus(); return; }
    const calc = parseBang(q) ? null : tryCalc(q);
    if (calc && !looksLikeUrl(q)) {
      // a pure math expression shows its result card, copied for you
      baseQuery = input.value;
      show(compose(q, extrasFor(q)));
      copyCalc(calc);
      return;
    }
    go(q, mode);
  }

  document.getElementById('submit').addEventListener('click', e => submit(mouseMode(e)));

  /* ---------- vanishing placeholder ---------- */

  const PLACEHOLDERS = [
    'Search the web…',
    "Try '!yt lofi beats'",
    'Paste a link — Enter opens it',
    "Type 'sqrt(2) * pi' for instant math",
    'Ctrl+Enter opens results in a new tab',
    "End with '!w' to search Wikipedia",
    'Alt+↑/↓ switches the search engine',
  ];
  const phEl = document.getElementById('vanish-ph');
  let phIdx = 0, phBusy = false;
  const phReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function phApply() {
    phEl.textContent = PLACEHOLDERS[phIdx];
  }

  function updatePhVisibility() {
    const empty = input.value === '';
    if (empty) phApply();
    else if (phBusy) {
      // a hint mid-swap would animate back over the typed text
      phEl.getAnimations().forEach(a => a.cancel());
      phBusy = false;
    }
    phEl.style.opacity = empty ? '1' : '0';
  }

  function phNext() {
    if (phBusy) return;
    phBusy = true;
    const out = phEl.animate(
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-10px)' }],
      { duration: 240, easing: 'ease-in' }
    );
    out.onfinish = () => {
      phIdx = (phIdx + 1) % PLACEHOLDERS.length;
      phApply();
      const inn = phEl.animate(
        [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }],
        { duration: 260, easing: 'ease-out' }
      );
      inn.onfinish = () => { phBusy = false; };
    };
  }

  function phTick() {
    if (input.value === '' && !phBusy) phNext();
    setTimeout(phTick, 3500);
  }

  // the animated overlay takes over from the static placeholder attribute
  input.placeholder = '';
  phApply();
  phEl.style.opacity = '1';
  if (!phReduced) setTimeout(phTick, 3500);

  /* ---------- calculator ---------- */

  // A tiny recursive-descent evaluator — no eval/Function. Supports + - * / ^,
  // implicit multiplication (2pi, 3(4+1)), "x" as times between numbers,
  // postfix % (percent), "15% of 80", constants pi/e/tau and common functions.
  const CALC_FUNCS = {
    sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil,
    ln: Math.log, log: Math.log10, log2: Math.log2, exp: Math.exp,
    sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  };
  const CALC_CONSTS = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 };

  function tryCalc(q) {
    const shown = q.trim().replace(/=\s*$/, '').trim().replace(/\s+/g, ' ');
    let s = shown.replace(/[×✕]/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/,/g, '');
    if (!s || s.length > 80) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return null; // an ISO date, not a subtraction
    s = s.replace(/(\d+(?:\.\d+)?)\s*%\s*of\s+/gi, '($1/100)*');

    const toks = [];
    for (let i = 0; i < s.length;) {
      const rest = s.slice(i);
      if (/^\s/.test(rest)) { i++; continue; }
      let m;
      if ((m = /^(\d+\.?\d*|\.\d+)/.exec(rest))) { toks.push({ t: 'n', v: parseFloat(m[0]) }); i += m[0].length; continue; }
      if ((m = /^(?:log2|[a-z]+)/i.exec(rest))) {
        const id = m[0].toLowerCase();
        const prev = toks[toks.length - 1];
        if (id === 'x' && prev && (prev.t === 'n' || prev.v === ')')) toks.push({ t: 'op', v: '*' });
        else if (id in CALC_FUNCS || id in CALC_CONSTS) toks.push({ t: 'id', v: id });
        else return null;
        i += m[0].length;
        continue;
      }
      if (rest.startsWith('**')) { toks.push({ t: 'op', v: '^' }); i += 2; continue; }
      if ('+-*/^%()'.includes(rest[0])) { toks.push({ t: 'op', v: rest[0] }); i++; continue; }
      return null;
    }

    let pos = 0, work = false;
    const peek = () => toks[pos];
    const isOp = (v) => peek() && peek().t === 'op' && peek().v === v;
    const fail = () => { throw new Error('calc'); };

    function expr() {
      let v = term();
      while (isOp('+') || isOp('-')) { const o = toks[pos++].v; work = true; const r = term(); v = o === '+' ? v + r : v - r; }
      return v;
    }
    function term() {
      let v = unary();
      for (;;) {
        if (isOp('*') || isOp('/')) { const o = toks[pos++].v; work = true; const r = unary(); v = o === '*' ? v * r : v / r; }
        else if (peek() && (peek().t === 'id' || peek().t === 'n' || isOp('('))) { work = true; v *= unary(); } // implicit ×
        else return v;
      }
    }
    function unary() {
      if (isOp('-')) { pos++; return -unary(); }
      if (isOp('+')) { pos++; return unary(); }
      return power();
    }
    function power() {
      const b = postfix();
      if (isOp('^')) { pos++; work = true; return b ** unary(); }
      return b;
    }
    function postfix() {
      let v = primary();
      while (isOp('%')) { pos++; work = true; v /= 100; }
      return v;
    }
    function primary() {
      const tk = toks[pos++];
      if (!tk) fail();
      if (tk.t === 'n') return tk.v;
      if (tk.t === 'op' && tk.v === '(') {
        const v = expr();
        if (!isOp(')')) fail();
        pos++;
        return v;
      }
      if (tk.t === 'id') {
        if (tk.v in CALC_CONSTS) return CALC_CONSTS[tk.v];
        work = true;
        return CALC_FUNCS[tk.v](isOp('(') ? primary() : unary());
      }
      return fail();
    }

    try {
      const v = expr();
      if (pos !== toks.length || !work || typeof v !== 'number' || !isFinite(v)) return null;
      return { expr: shown, value: Math.round(v * 1e10) / 1e10 };
    } catch (e) { return null; }
  }

  /* ---------- omnibox helpers ---------- */

  const SUGGEST_MAX = 8;
  const MAG = '<span class="mag"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="M20 20l-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>';
  const GLOBE = '<span class="mag"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><ellipse cx="12" cy="12" rx="4" ry="9" stroke="currentColor" stroke-width="2"/><path d="M3 12h18" stroke="currentColor" stroke-width="2"/></svg></span>';
  const CLOCK = '<span class="mag"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="2"/><path d="M12 7.5V12l3 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';

  function looksLikeUrl(t) {
    if (!t || /\s/.test(t)) return false;
    const s = t.replace(/^https?:\/\//i, '');
    // host with a dot (or localhost / IP), optional port, optional path
    return /^(localhost|\d{1,3}(?:\.\d{1,3}){3}|[a-z0-9-]+(?:\.[a-z0-9-]+)+)(:\d+)?(?:[\/?#].*)?$/i.test(s)
      && !/^\d+(\.\d+)+$/.test(s); // "3.14" / "1.5.2" are numbers, not hosts
  }

  function normalizeUrl(t) {
    const s = t.trim();
    return /^https?:\/\//i.test(s) ? s : 'https://' + s;
  }

  /* ---------- suggestions ---------- */

  // rows: { type, text, fill (echoed into the box on ↑/↓), run(mode), ... }
  //   head (label, not selectable) · calc · bang · bangpick · url · tab ·
  //   mark (bookmark) · history · sug (remote suggestion)
  let rows = [], active = -1, baseQuery = '', reqId = 0, suggestTimer = 0;
  let extras = { q: '', remote: [], tabs: [], marks: [] };
  const suggestCache = new Map();

  const suggestOpenState = () => searchEl.classList.contains('suggest-open');

  function closeSuggestions() {
    clearTimeout(suggestTimer);
    searchEl.classList.remove('suggest-open');
    suggestEl.innerHTML = '';
    rows = [];
    active = -1;
  }

  function show(list) {
    rows = list;
    active = -1;
    if (rows.some(r => r.type !== 'head')) {
      searchEl.classList.add('suggest-open');
      renderSuggestions();
    } else {
      closeSuggestions();
    }
  }

  // assemble every row kind for a query; network results arrive via `ex`
  function compose(q, ex = {}) {
    const out = [];
    if (!q) {
      const hist = historyOn() ? loadHistory().slice(0, 6) : [];
      if (hist.length) {
        out.push({ type: 'head', text: 'Recent searches' });
        for (const h of hist) out.push({ type: 'history', text: h.q, fill: h.q, run: m => go(h.q, m) });
      }
      return out;
    }

    // "!" + a partial key → pick a bang
    const bm = q.match(/^!(\S*)$/);
    if (bm) {
      const k = bm[1].toLowerCase();
      const list = BANGS.filter(b => b.key.startsWith(k) || (b.alias || []).some(a => a.startsWith(k)) || b.name.toLowerCase().startsWith(k));
      for (const b of list.slice(0, 8)) {
        out.push({
          type: 'bangpick', b, text: b.name, fill: `!${b.key} `,
          run: () => { input.value = `!${b.key} `; onInput(); },
        });
      }
      if (out.length) return out;
    }

    const bang = parseBang(q);
    const term = bang ? bang.q : q;
    const calc = bang ? null : tryCalc(q);
    if (calc) out.push({ type: 'calc', calc, text: `${calc.expr} = ${calc.value}`, fill: `${calc.expr} = ${calc.value}`, run: () => copyCalc(calc) });
    if (bang) out.push({ type: 'bang', b: bang.b, text: term, fill: q, run: m => go(q, m) });
    else if (looksLikeUrl(q)) out.push({ type: 'url', text: normalizeUrl(q), fill: q, run: m => go(q, m) });

    const seenUrls = new Set();
    for (const t of ex.tabs || []) {
      seenUrls.add(t.url);
      out.push({ type: 'tab', text: t.title || hostOf(t.url), meta: hostOf(t.url), fav: t.fav, fill: t.url, run: () => openStripItem(t) });
    }
    for (const b of ex.marks || []) {
      if (seenUrls.has(b.url)) continue;
      out.push({ type: 'mark', text: b.title || hostOf(b.url), meta: hostOf(b.url), fav: b.fav, fill: b.url, run: m => navigate(b.url, m) });
    }

    const seen = new Set();
    for (const h of historyMatches(q, 3)) {
      seen.add(h.toLowerCase());
      out.push({ type: 'history', text: h, fill: h, run: m => go(h, m) });
    }
    let n = 0;
    for (const s of ex.remote || []) {
      const low = s.toLowerCase();
      const full = bang ? `!${bang.b.key} ${s}`.toLowerCase() : low;
      if (seen.has(full)) continue;
      seen.add(full);
      if (++n > SUGGEST_MAX) break;
      out.push({ type: 'sug', text: s, hl: term, fill: bang ? `!${bang.b.key} ${s}` : s, run: m => searchTerm(s, bang && bang.b, m) });
    }
    return out;
  }

  // network-free stand-in while a fetch is in flight: last results that still
  // match, so the list narrows smoothly instead of blinking empty
  function extrasFor(q) {
    if (extras.q === q) return extras;
    const bang = parseBang(q);
    const term = (bang ? bang.q : q).toLowerCase();
    const kind = bang ? (bang.b.suggest || 'google') : (provider.suggest || 'google');
    const cached = suggestCache.get(kind + '|' + term);
    const low = q.toLowerCase();
    const hit = x => (x.title || '').toLowerCase().includes(low) || x.url.toLowerCase().includes(low);
    return {
      q: null,
      remote: cached || extras.remote.filter(s => s.toLowerCase().startsWith(term)),
      tabs: bang ? [] : extras.tabs.filter(hit),
      marks: bang ? [] : extras.marks.filter(hit),
    };
  }

  function onInput() {
    updatePhVisibility();
    renderProvider();
    clearTimeout(suggestTimer);
    baseQuery = input.value;
    const q = input.value.trim();
    if (!q) { closeSuggestions(); return; }
    show(compose(q, extrasFor(q)));
    if (q.length >= 2 || q.startsWith('!')) suggestTimer = setTimeout(() => fetchExtras(q), 130);
  }

  async function fetchExtras(q) {
    const id = ++reqId;
    const bang = parseBang(q);
    const term = bang ? bang.q : q;
    const picking = /^!\S*$/.test(q);
    const [remote, tabs, marks] = await Promise.all([
      suggestOn() && !picking && term.length >= 2 ? remoteSuggestions(term, bang ? (bang.b.suggest || 'google') : (provider.suggest || 'google')) : [],
      bang || picking ? [] : matchTabs(q),
      bang || picking ? [] : matchBookmarks(q),
    ]);
    if (id !== reqId || input.value.trim() !== q) return; // superseded
    extras = { q, remote, tabs, marks };
    show(compose(q, extras));
  }

  function parseSuggestions(data) {
    // google "client=chrome": ["q", ["s1", "s2"]] — ddg "type=list": same shape
    if (Array.isArray(data) && Array.isArray(data[1])) {
      return data[1].map(s => (Array.isArray(s) ? s[0] : s)).filter(s => typeof s === 'string');
    }
    // ddg default: [{ phrase: "s1" }, ...]
    if (Array.isArray(data) && typeof data[0] === 'object') {
      return data.map(x => x && x.phrase).filter(s => typeof s === 'string');
    }
    return [];
  }

  async function remoteSuggestions(q, kind) {
    const key = kind + '|' + q.toLowerCase();
    if (suggestCache.has(key)) return suggestCache.get(key);
    let items = [];
    try {
      items = await fetchSuggestions(q, kind);
    } catch (err) {
      // fetch can be CORS-blocked outside the extension (file://, http preview) —
      // fall back to Google's JSONP suggest endpoint, which works from any origin
      try { items = parseSuggestions(await jsonpSuggestions(q)).slice(0, SUGGEST_MAX); } catch (err2) { items = []; }
    }
    if (suggestCache.size > 150) suggestCache.clear();
    suggestCache.set(key, items);
    return items;
  }

  async function fetchSuggestions(q, kind) {
    const enc = encodeURIComponent(q);
    const url = kind === 'ddg'
      ? 'https://ac.duckduckgo.com/ac/?type=list&q=' + enc
      : 'https://suggestqueries.google.com/complete/search?client=chrome&q=' + enc;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      return parseSuggestions(await res.json()).slice(0, SUGGEST_MAX);
    } finally {
      clearTimeout(timer);
    }
  }

  function jsonpSuggestions(q) {
    return new Promise((resolve, reject) => {
      const cb = '__sg' + Math.random().toString(36).slice(2);
      const s = document.createElement('script');
      const done = data => {
        clearTimeout(timer);
        delete window[cb];
        s.remove();
        data === undefined ? reject(new Error('suggest unavailable')) : resolve(data);
      };
      const timer = setTimeout(() => done(undefined), 2500);
      window[cb] = data => done(data);
      s.onerror = () => done(undefined);
      s.src = 'https://suggestqueries.google.com/complete/search?client=chrome&q=' + encodeURIComponent(q) + '&callback=' + cb;
      document.head.appendChild(s);
    });
  }

  // open tabs whose title/URL match — "switch to tab", like the omnibox
  async function matchTabs(q) {
    const api = tabsApi();
    if (!api || q.length < 2) return [];
    try {
      const low = q.toLowerCase();
      const selfPrefix = location.origin + '/';
      const tabs = await api.tabs.query({});
      return tabs
        .filter(t => t.url && !t.url.startsWith(selfPrefix) && !/^chrome:\/\/newtab\/?$/.test(t.url)
          && ((t.title || '').toLowerCase().includes(low) || t.url.toLowerCase().includes(low)))
        .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))
        .slice(0, 2)
        .map(t => ({ title: t.title, url: t.url, fav: t.favIconUrl || faviconFor(t.url), tabId: t.id, windowId: t.windowId }));
    } catch (e) { return []; }
  }

  async function matchBookmarks(q) {
    const api = tabsApi();
    if (!api || !api.bookmarks || !api.bookmarks.search || q.length < 2) return [];
    try {
      const hits = await api.bookmarks.search(q);
      return hits
        .filter(b => b.url && /^https?:/.test(b.url))
        .slice(0, 3)
        .map(b => ({ title: b.title, url: b.url, fav: faviconFor(b.url) }));
    } catch (e) { return []; }
  }

  function tagEl(text, extra) {
    const tag = document.createElement('span');
    tag.className = 'open-tag' + (extra ? ' ' + extra : '');
    tag.textContent = text;
    return tag;
  }

  function textEl(text, hl) {
    const wrapEl = document.createElement('span');
    wrapEl.className = 's-text';
    const low = text.toLowerCase();
    const q = (hl || '').toLowerCase();
    const matched = q && low.startsWith(q);
    if (matched) {
      const typed = document.createElement('span');
      typed.className = 'typed';
      typed.textContent = text.slice(0, q.length);
      wrapEl.appendChild(typed);
    }
    const done = document.createElement('span');
    done.className = 'done';
    done.textContent = matched ? text.slice(q.length) : text;
    wrapEl.appendChild(done);
    return wrapEl;
  }

  function favEl(fav, label) {
    const f = document.createElement('span');
    f.className = 's-fav';
    f.textContent = (label[0] || '·').toUpperCase();
    if (fav && /^(https?:|chrome-extension:|data:)/.test(fav)) {
      const img = document.createElement('img');
      img.src = fav;
      img.alt = '';
      img.addEventListener('error', () => img.remove());
      f.appendChild(img);
    }
    return f;
  }

  function renderSuggestions() {
    suggestEl.innerHTML = '';
    const typed = baseQuery.trim();
    rows.forEach((row, i) => {
      if (row.type === 'head') {
        const h = document.createElement('div');
        h.className = 'suggest-head';
        h.textContent = row.text;
        suggestEl.appendChild(h);
        return;
      }
      const item = document.createElement('div');
      item.className = 'suggest-item ' + row.type + '-row';
      item.setAttribute('role', 'option');
      item.dataset.i = i;

      if (row.type === 'calc') {
        item.innerHTML = '<span class="mag calc-sym">=</span>';
        const t = document.createElement('span');
        t.className = 'done';
        t.textContent = row.text;
        item.append(t, tagEl('copy', 'copy-tag'));
      } else if (row.type === 'url') {
        item.innerHTML = GLOBE;
        const t = document.createElement('span');
        t.className = 'done';
        t.textContent = row.text;
        item.append(t, tagEl('open link'));
      } else if (row.type === 'bang' || row.type === 'bangpick') {
        const chip = document.createElement('span');
        chip.className = 'provider-ico';
        chip.textContent = bangLetter(row.b);
        const t = document.createElement('span');
        t.className = 's-text';
        if (row.type === 'bangpick') {
          t.innerHTML = '<span class="done"></span>';
          t.firstChild.textContent = row.b.name;
        } else {
          const d = document.createElement('span');
          d.className = 'done';
          d.textContent = row.text ? `Search ${row.b.name} for “${row.text}”` : `Open ${row.b.name}`;
          t.appendChild(d);
        }
        item.append(chip, t, tagEl('!' + row.b.key));
      } else if (row.type === 'tab' || row.type === 'mark') {
        const t = document.createElement('span');
        t.className = 's-text';
        t.innerHTML = '<span class="done"></span>';
        t.firstChild.textContent = row.text;
        const meta = document.createElement('span');
        meta.className = 's-meta';
        meta.textContent = row.meta;
        item.append(favEl(row.fav, row.text), t, meta, tagEl(row.type === 'tab' ? 'switch to tab' : 'bookmark'));
      } else if (row.type === 'history') {
        item.innerHTML = CLOCK;
        item.appendChild(textEl(row.text, typed));
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 's-del';
        del.title = 'Remove from history (Shift+Del)';
        del.setAttribute('aria-label', 'Remove from history');
        del.textContent = '×';
        del.addEventListener('mousedown', e => e.preventDefault());
        del.addEventListener('click', e => { e.stopPropagation(); removeHistoryRow(i); });
        item.appendChild(del);
      } else {
        item.innerHTML = MAG;
        item.appendChild(textEl(row.text, row.hl));
      }

      item.addEventListener('mousedown', e => e.preventDefault()); // keep input focus
      item.addEventListener('mouseenter', () => { active = i; renderActive(); });
      item.addEventListener('click', e => row.run(mouseMode(e)));
      item.addEventListener('auxclick', e => { if (e.button === 1) { e.preventDefault(); row.run('bg'); } });
      suggestEl.appendChild(item);
    });
    // never run past the bottom of short windows — scroll inside instead
    suggestEl.style.maxHeight = Math.max(160, innerHeight - searchEl.getBoundingClientRect().bottom - 22) + 'px';
    renderActive();
  }

  function removeHistoryRow(i) {
    const row = rows[i];
    if (!row || row.type !== 'history') return;
    forget(row.text);
    const q = baseQuery.trim();
    show(compose(q, extrasFor(q)));
    input.value = baseQuery;
  }

  function renderActive() {
    for (const el of suggestEl.querySelectorAll('.suggest-item')) {
      const on = +el.dataset.i === active;
      el.classList.toggle('active', on);
      el.setAttribute('aria-selected', on ? 'true' : 'false');
    }
  }

  function moveActive(dir) {
    const sel = rows.map((r, i) => (r.type === 'head' ? -1 : i)).filter(i => i >= 0);
    if (!sel.length) return;
    let p = sel.indexOf(active);
    if (dir > 0) p = p >= sel.length - 1 ? -1 : p + 1;
    else p = p <= -1 ? sel.length - 1 : p - 1;
    active = p < 0 ? -1 : sel[p];
    input.value = active < 0 ? baseQuery : rows[active].fill;
    const el = suggestEl.querySelector(`[data-i="${active}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
    const len = input.value.length;
    input.setSelectionRange(len, len);
    updatePhVisibility();
    renderActive();
  }

  function copyCalc(calc) {
    copyText(String(calc.value), () => {
      const tag = suggestEl.querySelector('.calc-row .copy-tag');
      if (!tag) return;
      tag.textContent = 'copied ✓';
      tag.classList.add('flashed');
      setTimeout(() => {
        tag.textContent = 'copy';
        tag.classList.remove('flashed');
      }, 1400);
    });
  }

  function copyText(text, onDone) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(onDone, onDone);
      return;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { }
    ta.remove();
    onDone();
  }

  input.addEventListener('input', onInput);

  // recent searches appear when you click into (or ↓ in) an empty box — not
  // on the automatic focus of a fresh tab, which would be noisy
  input.addEventListener('mousedown', () => {
    if (input.value === '' && !suggestOpenState()) setTimeout(() => { baseQuery = ''; show(compose('')); }, 0);
  });
  input.addEventListener('focus', () => bgApi.setFocus(true));
  input.addEventListener('blur', () => bgApi.setFocus(false));

  document.addEventListener('mousedown', e => {
    if (!searchEl.contains(e.target)) closeSuggestions();
  });

  input.addEventListener('keydown', e => {
    // Alt+↑/↓ cycles the default engine without leaving the box
    if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const list = allProviders();
      const i = Math.max(0, list.findIndex(p => p.id === provider.id));
      setProvider(list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]);
      return;
    }
    if (!suggestOpenState() && e.key === 'ArrowDown') {
      e.preventDefault();
      baseQuery = input.value;
      const q = input.value.trim();
      show(compose(q, q ? extrasFor(q) : {}));
      return;
    }
    if (suggestOpenState()) {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveActive(1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); moveActive(-1); return; }
      if (e.key === 'Delete' && e.shiftKey && active >= 0 && rows[active].type === 'history') {
        e.preventDefault();
        removeHistoryRow(active);
        return;
      }
      if (e.key === 'Tab' && !e.shiftKey && active >= 0 && rows[active].type === 'bangpick') {
        e.preventDefault(); // Tab completes a bang, like a shell
        rows[active].run();
        return;
      }
      if (e.key === 'Enter' && active >= 0) {
        e.preventDefault();
        rows[active].run(keyMode(e));
        return;
      }
      if (e.key === 'Escape') {
        if (active >= 0) input.value = baseQuery;
        closeSuggestions();
        return;
      }
    }
    if (e.key === 'Enter') { e.preventDefault(); submit(keyMode(e)); }
    if (e.key === 'Escape') {
      if (isOpen()) close();
      else if (input.value) { input.value = ''; closeSuggestions(); updatePhVisibility(); renderProvider(); }
      else input.blur();
    }
  });

  // global shortcuts: "/" or Ctrl/Cmd+K focuses the box (not while typing
  // elsewhere, and not when the input is hidden in settings)
  document.addEventListener('keydown', e => {
    const inField = isTypingTarget(document.activeElement);
    const inputHidden = document.body.classList.contains('no-input');
    if (e.key === '/' && document.activeElement !== input && !inField && !inputHidden) {
      e.preventDefault();
      input.focus();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !inputHidden) {
      e.preventDefault();
      input.focus();
      input.select();
    }
  });

  input.focus({ preventScroll: true });

  /* ---------- clock: small (in the info bar) or big (above the search) ---------- */

  // settings: home:clockSize small|big · home:clockFace digital|analog (big only)
  // · home:clock 24|12 · home:clockSec 1 · home:tz an IANA zone ('' = this computer's)
  const clock = document.getElementById('clock');
  const date = document.getElementById('date');
  const clockOpts = document.getElementById('clock-opts');
  const bigClock = document.getElementById('big-clock');
  const bigDigits = document.getElementById('big-digits');
  const analogCv = document.getElementById('analog-clock');
  const clockCfg = () => {
    const legacy = loadStored('home:clock'); // older builds: 24 | 12 | sec | analog
    const size = loadStored('home:clockSize') || (legacy === 'analog' ? 'big' : 'small');
    return {
      size: size === 'big' ? 'big' : 'small',
      face: (loadStored('home:clockFace') || (legacy === 'analog' ? 'analog' : 'digital')) === 'analog' ? 'analog' : 'digital',
      h12: legacy === '12',
      sec: loadStored('home:clockSec') === '1' || legacy === 'sec',
      tz: validZone(loadStored('home:tz') || ''),
    };
  };
  function validZone(z) {
    if (!z) return '';
    try { new Intl.DateTimeFormat([], { timeZone: z }); return z; } catch (e) { return ''; }
  }
  // h/m/s as seen in the chosen zone (for the analog hands)
  function zoneParts(now, tz) {
    if (!tz) return { h: now.getHours(), m: now.getMinutes(), s: now.getSeconds() };
    const p = {};
    for (const x of new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' }).formatToParts(now)) p[x.type] = +x.value;
    return { h: p.hour % 24, m: p.minute, s: p.second };
  }
  const zoneLabel = tz => tz ? tz.split('/').pop().replace(/_/g, ' ') : '';
  function tick() {
    const now = new Date();
    const c = clockCfg();
    const show = loadShow();
    const big = c.size === 'big' && show.clock;
    const tzOpt = c.tz ? { timeZone: c.tz } : {};
    const opts = c.h12
      ? { hour: 'numeric', minute: '2-digit', hour12: true, ...tzOpt }
      : { hour: '2-digit', minute: '2-digit', hour12: false, ...tzOpt };
    document.body.classList.toggle('clock-big', c.size === 'big');
    bigClock.hidden = !big;
    if (big) {
      const analog = c.face === 'analog';
      analogCv.hidden = !analog;
      bigDigits.hidden = analog;
      if (analog) drawAnalogClock(zoneParts(now, c.tz), c.sec);
      else {
        // big digits: hh:mm, with seconds / am-pm as small trailing marks
        const parts = new Intl.DateTimeFormat([], { ...opts, ...(c.sec ? { second: '2-digit' } : {}) }).formatToParts(now);
        let main = '', sec = '', ampm = '';
        let seenMin = false;
        for (const p of parts) {
          if (p.type === 'dayPeriod') ampm = p.value;
          else if (p.type === 'second') sec = p.value;
          else if (p.type === 'minute') { main += p.value; seenMin = true; }
          else if (!seenMin) main += p.value;
        }
        bigDigits.innerHTML = '';
        bigDigits.append(main.trim());
        if (sec) { const s = document.createElement('span'); s.className = 'sec'; s.textContent = sec; bigDigits.append(s); }
        if (ampm) { const s = document.createElement('span'); s.className = 'ampm'; s.textContent = ampm; bigDigits.append(s); }
      }
      bigClock.title = c.tz ? `Time in ${zoneLabel(c.tz)}` : '';
    } else {
      clock.textContent = now.toLocaleTimeString([], { ...opts, ...(c.sec ? { second: '2-digit' } : {}) })
        + (c.tz ? ' ' + zoneLabel(c.tz) : '');
    }
    date.textContent = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', ...tzOpt });
    renderTabTitle();
  }
  function renderClockOpts() {
    const c = clockCfg();
    for (const b of clockOpts.children) b.classList.toggle('active', (b.dataset.clock === '12') === c.h12);
    for (const b of document.getElementById('clock-size-opts').children) b.classList.toggle('active', b.dataset.csize === c.size);
    for (const b of document.getElementById('clock-face-opts').children) b.classList.toggle('active', b.dataset.cface === c.face);
    // the analog face only exists as the big clock; a 12/24h format means nothing on it
    document.getElementById('clock-face-row').hidden = c.size !== 'big';
    document.getElementById('clock-scale-row').hidden = c.size !== 'big';
    document.getElementById('clock-fmt-row').querySelector('.phase-opts').hidden = c.size === 'big' && c.face === 'analog';
    document.getElementById('clock-sec').checked = c.sec;
    const tzOn = document.getElementById('tz-on');
    tzOn.checked = !!c.tz || tzOn.dataset.pending === '1';
    document.getElementById('tz-row').hidden = !tzOn.checked;
  }
  // a click sets one knob; the legacy combined key is normalized to 24|12
  function setClock(key, val) {
    const c = clockCfg();
    store('home:clockSize', c.size);
    store('home:clockFace', c.face);
    store('home:clockSec', c.sec ? '1' : '0');
    store('home:clock', c.h12 ? '12' : '24');
    store(key, val);
    renderClockOpts();
    tick();
  }
  clockOpts.addEventListener('click', e => {
    const b = e.target.closest('button[data-clock]');
    if (b) setClock('home:clock', b.dataset.clock);
  });
  document.getElementById('clock-size-opts').addEventListener('click', e => {
    const b = e.target.closest('button[data-csize]');
    if (!b) return;
    setClock('home:clockSize', b.dataset.csize);
    // picking a clock is a clear wish to see it
    const show = loadShow();
    if (!show.clock) { show.clock = true; store('home:show', JSON.stringify(show)); applyShow(show); renderShowOpts(); }
  });
  document.getElementById('clock-face-opts').addEventListener('click', e => {
    const b = e.target.closest('button[data-cface]');
    if (b) setClock('home:clockFace', b.dataset.cface);
  });
  document.getElementById('clock-sec').addEventListener('change', e => setClock('home:clockSec', e.target.checked ? '1' : '0'));
  (function wireZone() {
    const on = document.getElementById('tz-on');
    const sel = document.getElementById('tz-select');
    let zones = [];
    try { zones = Intl.supportedValuesOf('timeZone'); } catch (e) { }
    const here = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (!zones.length) zones = [here, 'UTC', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo'].filter(Boolean);
    const now = new Date();
    const offset = z => {
      try {
        return new Intl.DateTimeFormat('en-US', { timeZone: z, timeZoneName: 'shortOffset' })
          .formatToParts(now).find(p => p.type === 'timeZoneName').value.replace('GMT', 'UTC');
      } catch (e) { return ''; }
    };
    // grouped by region, each labeled "City (UTC+9)"
    const groups = {};
    for (const z of zones) (groups[z.includes('/') ? z.split('/')[0] : 'Other'] ||= []).push(z);
    for (const [g, list] of Object.entries(groups)) {
      const og = document.createElement('optgroup');
      og.label = g;
      for (const z of list) {
        const o = document.createElement('option');
        o.value = z;
        o.textContent = `${z.split('/').slice(1).join(' / ').replace(/_/g, ' ') || z} (${offset(z)})`;
        og.appendChild(o);
      }
      sel.appendChild(og);
    }
    sel.value = validZone(loadStored('home:tz') || '') || here;
    on.addEventListener('change', () => {
      if (on.checked) { on.dataset.pending = '1'; store('home:tz', sel.value); }
      else { on.dataset.pending = ''; store('home:tz', ''); }
      renderClockOpts();
      tick();
    });
    sel.addEventListener('change', () => { store('home:tz', sel.value); tick(); });
  })();
  var clockReady = true; // eslint-disable-line no-var — read by applyShow before this block runs
  renderClockOpts();
  tick();
  setInterval(tick, 1000);

  /* ---------- weather pill (open-meteo, keyless) ---------- */

  // current conditions next to the clock: auto location (browser GPS, then
  // IP city) or a hand-picked city, °C/°F — restyled in every theme by the
  // pill variables, the icon is a pixel bitmap drawn in currentColor
  const wxSeg = document.getElementById('wx');
  const wxDot = document.getElementById('wx-dot');
  const wxOpts = document.getElementById('wx-opts');
  const wxLocRow = document.getElementById('wx-loc-row');
  const wxLocOpts = document.getElementById('wx-loc-opts');
  const wxPickBtn = document.getElementById('wx-pick-btn');
  const wxCityRow = document.getElementById('wx-city-row');
  const wxCityInput = document.getElementById('wx-city-input');
  const wxCityResults = document.getElementById('wx-city-results');
  const wxUnitsRow = document.getElementById('wx-units-row');
  const wxUnitsOpts = document.getElementById('wx-units-opts');
  const wxSkyRow = document.getElementById('wx-sky-row');
  const wxSkyOpts = document.getElementById('wx-sky-opts');
  const wxTempRow = document.getElementById('wx-temp-row');
  const wxTempInput = document.getElementById('wx-temp-input');

  const WX_STALE_MS = 10 * 60 * 1000;           // refetch readings older than 10 min
  const WX_COORDS_TTL_MS = 24 * 60 * 60 * 1000; // re-resolve auto coords daily
  let wxBusy = false;
  let wxQueued = null; // a refresh swallowed while busy is rerun when it frees

  const WX_ICONS = {
    sun: [
      '.....#.....',
      '.#...#...#.',
      '....###....',
      '...#####...',
      '#..#####..#',
      '#.#######.#',
      '#..#####..#',
      '...#####...',
      '....###....',
      '.#...#...#.',
      '.....#.....',
    ],
    moon: [
      '....###....',
      '..#####....',
      '..###......',
      '.###.......',
      '.###.......',
      '.###.......',
      '.###.......',
      '.###.......',
      '..###......',
      '..#####....',
      '....###....',
    ],
    cloudsun: [
      '......###..',
      '.....#####.',
      '......###..',
      '...........',
      '...####....',
      '.#######...',
      '#########..',
      '#########..',
      '#########..',
      '...........',
      '...........',
    ],
    cloudmoon: [
      '......###..',
      '.....##....',
      '.....#.....',
      '...........',
      '...####....',
      '.#######...',
      '#########..',
      '#########..',
      '#########..',
      '...........',
      '...........',
    ],
    cloud: [
      '...........',
      '...........',
      '....####...',
      '..#######..',
      '.#########.',
      '###########',
      '###########',
      '...........',
      '...........',
      '...........',
      '...........',
    ],
    fog: [
      '....####...',
      '..#######..',
      '.#########.',
      '###########',
      '...........',
      '..#######..',
      '...........',
      '....####...',
      '...........',
      '...........',
      '...........',
    ],
    drizzle: [
      '....####...',
      '..#######..',
      '.#########.',
      '###########',
      '...........',
      '..#..#..#..',
      '...........',
      '...#..#..#.',
      '...........',
      '..#..#..#..',
      '...........',
    ],
    rain: [
      '....####...',
      '..#######..',
      '.#########.',
      '###########',
      '...........',
      '.#..#..#...',
      '.#..#..#...',
      '...........',
      '.#..#..#...',
      '.#..#..#...',
      '...........',
    ],
    snow: [
      '....####...',
      '..#######..',
      '.#########.',
      '###########',
      '...........',
      '.#...#...#.',
      '...........',
      '...#...#...',
      '...........',
      '.#...#...#.',
      '...........',
    ],
    thunder: [
      '....####...',
      '..#######..',
      '.#########.',
      '###########',
      '....#......',
      '...##......',
      '..######...',
      '.....##....',
      '....##.....',
      '...##......',
      '...........',
    ],
  };

  // WMO weather codes → label + icon (is_day picks the sun/moon variant)
  function wxDescribe(code, isDay) {
    if (code === 0) return { icon: isDay ? 'sun' : 'moon', label: 'Clear sky' };
    if (code === 1) return { icon: isDay ? 'sun' : 'moon', label: 'Mainly clear' };
    if (code === 2) return { icon: isDay ? 'cloudsun' : 'cloudmoon', label: 'Partly cloudy' };
    if (code === 3) return { icon: 'cloud', label: 'Overcast' };
    if (code === 45 || code === 48) return { icon: 'fog', label: 'Fog' };
    if (code >= 51 && code <= 57) return { icon: 'drizzle', label: 'Drizzle' };
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) {
      return { icon: 'rain', label: code >= 80 ? 'Rain showers' : 'Rain' };
    }
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { icon: 'snow', label: 'Snow' };
    if (code >= 95) return { icon: 'thunder', label: 'Thunderstorm' };
    return { icon: 'cloud', label: 'Cloudy' };
  }

  // pinned conditions — the display analog of freezing the time of day
  const WX_MANUAL = {
    clear:  { icon: 'sun', night: 'moon', label: 'Clear' },
    clouds: { icon: 'cloudsun', night: 'cloudmoon', label: 'Partly cloudy' },
    rain:   { icon: 'rain', label: 'Rain' },
    snow:   { icon: 'snow', label: 'Snow' },
    storm:  { icon: 'thunder', label: 'Thunderstorm' },
    fog:    { icon: 'fog', label: 'Fog' },
  };

  function wxCondKey() {
    const c = loadStored('home:wxCond');
    return WX_MANUAL[c] ? c : 'auto';
  }

  function wxManualTempC() {
    const v = parseFloat(loadStored('home:wxTemp'));
    return isFinite(v) ? v : null;
  }

  // live WMO code → background effect key (pinned keys already match)
  function wxEffectFromCode(code) {
    if (code === 0 || code === 1) return 'clear';
    if (code === 2 || code === 3) return 'clouds';
    if (code === 45 || code === 48) return 'fog';
    if (code >= 51 && code <= 57) return 'drizzle';
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
    if (code >= 95) return 'storm';
    return 'clear';
  }

  function wxEffect() {
    if (!wxOn()) return 'none';
    const cond = wxCondKey();
    if (cond !== 'auto') return cond; // clear/clouds/rain/snow/storm/fog are the fx keys
    const c = wxCache();
    return c ? wxEffectFromCode(c.code) : 'none';
  }

  const wxOn = () => loadStored('home:wxMode') !== 'off';
  const wxUnits = () => (loadStored('home:wxUnits') === 'f' ? 'f' : 'c');

  function wxManual() {
    try {
      const v = JSON.parse(loadStored('home:wxLoc'));
      return v && isFinite(v.lat) && isFinite(v.lon) ? v : null;
    } catch (e) { return null; }
  }
  function wxCache() {
    try {
      const v = JSON.parse(loadStored('home:wx'));
      return v && typeof v === 'object' ? v : null;
    } catch (e) { return null; }
  }
  function wxSaveCache(c) { store('home:wx', JSON.stringify(c)); }

  function wxTemp(c) { return wxUnits() === 'f' ? Math.round(c * 9 / 5 + 32) : Math.round(c); }

  // one paint path for live and pinned weather alike: icon bitmap + temp
  function wxPaint(icon, tempC, title) {
    let path = '';
    for (const [y, row] of WX_ICONS[icon].entries()) {
      for (let x = 0; x < row.length; x++) if (row[x] === '#') path += `M${x} ${y}h1v1h-1z`;
    }
    const temp = tempC === null ? '' : ` ${wxTemp(tempC)}°`;
    wxSeg.innerHTML =
      `<svg width="11" height="11" viewBox="0 0 11 11" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true"><path d="${path}"/></svg>` +
      temp;
    wxSeg.title = title + ' · click for details';
    wxSeg.hidden = false;
    wxDot.hidden = false;
  }

  function wxRender(c) {
    const d = wxDescribe(c.code, c.isDay);
    const updated = new Date(c.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    wxPaint(d.icon, c.tempC,
      `${d.label} · feels ${wxTemp(c.feelsC)}° · wind ${Math.round(c.wind)} km/h · ${c.place || 'your location'} · updated ${updated}`);
  }

  function wxRenderManual(cond) {
    const m = WX_MANUAL[cond];
    // sun/moon variant follows the page phase — a frozen Night phase pins the
    // moon icon, matching how the celestial body behaves
    const phase = DayCycle.current(new Date(), forcedPhase()).name;
    const icon = m.night && (phase === 'evening' || phase === 'night') ? m.night : m.icon;
    wxPaint(icon, wxManualTempC(), `${m.label} · pinned — set in Settings (Sky)`);
  }

  // the single decision point for what the pill shows right now
  function wxPaintCurrent() {
    if (!wxOn()) { wxHide(); bgApi.setWeather('none'); return; }
    const cond = wxCondKey();
    if (cond !== 'auto') { wxRenderManual(cond); bgApi.setWeather(cond); return; }
    const c = wxCache();
    if (c) { wxRender(c); bgApi.setWeather(wxEffectFromCode(c.code)); }
    else { wxHide(); bgApi.setWeather('none'); }
  }

  function wxHide() {
    wxSeg.hidden = true;
    wxDot.hidden = true;
  }

  async function wxGeo() {
    if (!navigator.geolocation) throw new Error('geolocation unavailable');
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        p => resolve({ lat: +p.coords.latitude.toFixed(3), lon: +p.coords.longitude.toFixed(3), place: null }),
        reject,
        { timeout: 8000, maximumAge: 10 * 60 * 1000 }
      );
    });
  }

  async function wxIp() {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
      const res = await fetch('https://ipwho.is/', { signal: ctrl.signal });
      const j = await res.json();
      if (!j || j.success === false || !isFinite(j.latitude) || !isFinite(j.longitude)) throw new Error('ip locate failed');
      return { lat: +Number(j.latitude).toFixed(3), lon: +Number(j.longitude).toFixed(3), place: j.city || null };
    } finally { clearTimeout(timer); }
  }

  async function wxLocate() {
    const manual = wxManual();
    if (manual) return { ...manual, place: manual.name, manual: true };
    // reuse the coords stored with the last auto reading for a day — a fresh
    // GPS/IP fix on every new tab would be wasteful
    const c = wxCache();
    if (c && c.auto && Date.now() - c.ts < WX_COORDS_TTL_MS && isFinite(c.lat)) {
      return { lat: c.lat, lon: c.lon, place: c.place };
    }
    try { return { ...(await wxGeo()), auto: true }; }
    catch (e) {
      try { return { ...(await wxIp()), auto: true }; }
      catch (e2) { return null; }
    }
  }

  async function wxFetch(loc) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
      const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + loc.lat + '&longitude=' + loc.lon +
        '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day' +
        '&hourly=temperature_2m,weather_code&daily=sunrise,sunset,temperature_2m_max,temperature_2m_min&forecast_days=2&timezone=auto';
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) return null;
      const j = await res.json();
      const cur = j && j.current;
      if (!cur || !isFinite(cur.temperature_2m)) return null;
      const prev = wxCache();
      // next hours for the details popover
      const hourly = (j.hourly && j.hourly.time && j.hourly.temperature_2m)
        ? j.hourly.time.map((t, i) => ({ t, tempC: j.hourly.temperature_2m[i], code: j.hourly.weather_code[i] }))
        : [];
      // hourly times are in the location's local time (timezone=auto), so compare
      // against the API's own local "now", not the browser's UTC ISO string;
      // two forecast days keep the list full late in the evening
      const nowHour = String(cur.time || '').slice(0, 13) || new Date().toISOString().slice(0, 13);
      const nextHours = hourly.filter(h => h.t >= nowHour).slice(0, 6);
      const daily = j.daily || {};
      return {
        ts: Date.now(),
        tempC: cur.temperature_2m,
        feelsC: isFinite(cur.apparent_temperature) ? cur.apparent_temperature : cur.temperature_2m,
        humidity: isFinite(cur.relative_humidity_2m) ? cur.relative_humidity_2m : null,
        wind: isFinite(cur.wind_speed_10m) ? cur.wind_speed_10m : 0,
        code: cur.weather_code || 0,
        isDay: !!cur.is_day,
        nextHours,
        sunrise: (daily.sunrise && daily.sunrise[0]) || null,
        sunset: (daily.sunset && daily.sunset[0]) || null,
        tMax: (daily.temperature_2m_max && daily.temperature_2m_max[0]) ?? null,
        tMin: (daily.temperature_2m_min && daily.temperature_2m_min[0]) ?? null,
        lat: loc.lat,
        lon: loc.lon,
        auto: !loc.manual,
        place: loc.place || (prev && prev.place) || null,
      };
    } catch (e) { return null; }
    finally { clearTimeout(timer); }
  }

  async function wxRefresh(force) {
    // pinned weather never hits the network
    if (!wxOn() || wxCondKey() !== 'auto') return;
    if (wxBusy) { wxQueued = wxQueued || force; return; }
    const cached = wxCache();
    if (!force && cached && Date.now() - cached.ts < WX_STALE_MS) { wxRender(cached); return; }
    wxBusy = true;
    try {
      const loc = await wxLocate();
      const fresh = loc ? await wxFetch(loc) : null;
      if (fresh) { wxSaveCache(fresh); wxRender(fresh); bgApi.setWeather(wxEffectFromCode(fresh.code)); }
      else if (cached) { wxRender(cached); bgApi.setWeather(wxEffectFromCode(cached.code)); } // keep the last reading on failure
      else { wxHide(); bgApi.setWeather('none'); }
    } finally {
      wxBusy = false;
      if (wxQueued !== null) { const f = wxQueued; wxQueued = null; wxRefresh(f); }
    }
  }

  // paint instantly (pinned weather or the last reading, any age), then refresh if stale
  wxPaintCurrent();
  wxRefresh(false);
  setInterval(() => { if (!document.hidden) wxRefresh(false); }, 10 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) wxRefresh(false); });

  // settings: on/off, auto/manual location, °C/°F — same button-row pattern
  // as phase/theme/show
  function wxRenderOpts() {
    const on = wxOn();
    for (const b of wxOpts.children) b.classList.toggle('active', (b.dataset.wx === 'on') === on);
    wxLocRow.hidden = !on;
    wxUnitsRow.hidden = !on;
    wxSkyRow.hidden = !on;
    if (!on) { wxCityRow.hidden = true; wxCityResults.hidden = true; }
    const manual = wxManual();
    wxPickBtn.textContent = manual ? manual.name : 'Pick…';
    for (const b of wxLocOpts.children) {
      b.classList.toggle('active', manual ? b.dataset.wxloc === 'pick' : b.dataset.wxloc === 'auto');
    }
    const cond = wxCondKey();
    for (const b of wxSkyOpts.children) b.classList.toggle('active', b.dataset.wxsky === cond);
    wxTempRow.hidden = !on || cond === 'auto';
    if (cond !== 'auto' && document.activeElement !== wxTempInput) {
      const t = wxManualTempC() ?? (wxCache() ? wxCache().tempC : 10);
      wxTempInput.value = Math.round(wxUnits() === 'f' ? t * 9 / 5 + 32 : t);
    }
    const u = wxUnits();
    for (const b of wxUnitsOpts.children) b.classList.toggle('active', b.dataset.units === u);
  }

  wxOpts.addEventListener('click', e => {
    const b = e.target.closest('button[data-wx]');
    if (!b) return;
    store('home:wxMode', b.dataset.wx);
    wxRenderOpts();
    wxPaintCurrent();
    if (wxOn()) wxRefresh(true);
  });

  wxLocOpts.addEventListener('click', e => {
    const b = e.target.closest('button[data-wxloc]');
    if (!b) return;
    if (b.dataset.wxloc === 'auto') {
      store('home:wxLoc', 'auto');
      wxCityRow.hidden = true;
      wxCityResults.hidden = true;
      wxRenderOpts();
      wxRefresh(true);
    } else {
      wxCityRow.hidden = false;
      wxCityInput.focus();
      wxRenderOpts();
    }
  });

  let wxSearchId = 0;
  let wxDebounce = 0;
  wxCityInput.addEventListener('input', () => {
    clearTimeout(wxDebounce);
    const q = wxCityInput.value.trim();
    if (q.length < 3) { wxCityResults.hidden = true; wxCityResults.innerHTML = ''; return; }
    wxDebounce = setTimeout(() => wxSearchCities(q), 300);
  });
  wxCityInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      wxCityRow.hidden = true;
      wxCityResults.hidden = true;
      wxCityInput.value = '';
    }
  });

  async function wxSearchCities(q) {
    const id = ++wxSearchId;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
      const url = 'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(q) + '&count=5&language=en&format=json';
      const res = await fetch(url, { signal: ctrl.signal });
      const j = await res.json();
      if (id !== wxSearchId) return; // a newer keystroke superseded this search
      wxCityResults.innerHTML = '';
      for (const r of (j.results || [])) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = [r.name, r.admin1, r.country].filter(Boolean).join(' · ');
        b.addEventListener('click', () => {
          store('home:wxLoc', JSON.stringify({
            name: r.name,
            lat: +Number(r.latitude).toFixed(3),
            lon: +Number(r.longitude).toFixed(3),
          }));
          wxCityInput.value = '';
          wxCityRow.hidden = true;
          wxCityResults.hidden = true;
          wxRenderOpts();
          wxRefresh(true);
        });
        wxCityResults.appendChild(b);
      }
      wxCityResults.hidden = !wxCityResults.children.length;
    } catch (e) {
      if (id === wxSearchId) wxCityResults.hidden = true;
    } finally { clearTimeout(timer); }
  }

  wxSkyOpts.addEventListener('click', e => {
    const b = e.target.closest('button[data-wxsky]');
    if (!b) return;
    store('home:wxCond', b.dataset.wxsky);
    // seed the pinned temp from the last reading so the pill is complete at once
    if (b.dataset.wxsky !== 'auto' && wxManualTempC() === null) {
      const c = wxCache();
      store('home:wxTemp', String(c ? c.tempC : 10));
    }
    wxRenderOpts();
    wxPaintCurrent();
    if (b.dataset.wxsky === 'auto') wxRefresh(false);
  });

  wxTempInput.addEventListener('input', () => {
    const v = parseFloat(wxTempInput.value);
    if (!isFinite(v)) return;
    store('home:wxTemp', String(wxUnits() === 'f' ? (v - 32) * 5 / 9 : v));
    wxPaintCurrent();
  });

  wxUnitsOpts.addEventListener('click', e => {
    const b = e.target.closest('button[data-units]');
    if (!b) return;
    store('home:wxUnits', b.dataset.units);
    wxRenderOpts();
    wxPaintCurrent(); // converting needs no refetch
  });

  wxRenderOpts();

  /* =====================================================================
     Bonjourr-inspired additions, part of the ui() closure: greeting by
     name, quotes/notes/pomodoro widgets, free widget placement, custom
     quick links, page context menu, help overlay, analog + world clocks,
     tab title / emoji favicon, custom font / CSS / search engine,
     settings export-import + presets, weather details, solid / blur.
     ===================================================================== */

  const escHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- greeting (phase word + your name) ---------- */

  // no outer consts here: applyDayCycle calls this before the appended
  // section has run, so everything it needs lives inside the function
  function renderGreeting() {
    const el = document.getElementById('greeting');
    if (!el) return;
    const words = { morning: 'Good morning', day: 'Good afternoon', evening: 'Good evening', night: 'Good night' };
    const name = (loadStored('home:greet') || '').trim();
    const phase = DayCycle.current(new Date(), forcedPhase()).name;
    const word = words[phase] || 'Hello';
    el.textContent = name ? `${word}, ${name}` : word;
    el.hidden = !loadShow().greeting; // Layout → Show → Greeting
  }
  (function wireGreet() {
    const inp = document.getElementById('set-greet');
    inp.value = loadStored('home:greet') || '';
    inp.addEventListener('input', () => {
      store('home:greet', inp.value.trim());
      // typing a name is a clear wish to see the greeting
      const show = loadShow();
      if (inp.value.trim() && !show.greeting) {
        show.greeting = true;
        store('home:show', JSON.stringify(show));
        applyShow(show);
        renderShowOpts();
      }
      renderGreeting();
    });
  })();

  /* ---------- big clock + greeting: size and ink ---------- */

  // stored as percent; a function (not a const table) because the clock
  // block calls it before this part of the file has run
  function displayScale(key) {
    const lim = key === 'home:greetScale' ? [80, 260] : [60, 220];
    const v = parseInt(loadStored(key), 10);
    return (isFinite(v) ? Math.max(lim[0], Math.min(lim[1], v)) : 100) / 100;
  }
  function applyDisplayScales() {
    const root = document.documentElement.style;
    root.setProperty('--clock-scale', String(displayScale('home:clockScale')));
    root.setProperty('--greet-scale', String(displayScale('home:greetScale')));
  }
  (function wireScales() {
    for (const [id, key] of [['clock-scale', 'home:clockScale'], ['greet-scale', 'home:greetScale']]) {
      const sl = document.getElementById(id);
      const val = document.getElementById(id + '-val');
      sl.value = String(Math.round(displayScale(key) * 100));
      val.textContent = sl.value + '%';
      sl.addEventListener('input', () => {
        store(key, sl.value);
        val.textContent = sl.value + '%';
        applyDisplayScales();
        tick(); // redraw the analog face at its new size
        sampleInk();
      });
    }
    applyDisplayScales();
  })();

  // ink: 'auto' samples the background right behind the clock/greeting and
  // picks light or dark text; light/dark/accent force one; 'theme' keeps the
  // theme's panel text color (the old look)
  const INKS = ['auto', 'light', 'dark', 'accent', 'theme'];
  const inkMode = () => { const v = loadStored('home:ink'); return INKS.includes(v) ? v : 'auto'; };
  const inkProbe = document.createElement('canvas');
  inkProbe.width = 24; inkProbe.height = 8;
  let inkAuto = 'light';
  function setInkClass(name) {
    for (const n of ['light', 'dark', 'accent']) document.body.classList.toggle('ink-' + n, n === name);
  }
  function sampleInk() {
    const mode = inkMode();
    if (mode !== 'auto') { setInkClass(mode === 'theme' ? null : mode); return; }
    const stack = document.querySelector('.top-stack');
    const bg = document.getElementById('bg');
    const r = stack && stack.getBoundingClientRect();
    if (r && r.width && r.height && bg && bg.width) {
      // the area actually covered by text, a little padded
      const items = [...stack.children].filter(el => !el.hidden).map(el => el.getBoundingClientRect()).filter(b => b.width);
      if (items.length) {
        const x0 = Math.min(...items.map(b => b.left)) - 16, x1 = Math.max(...items.map(b => b.right)) + 16;
        const y0 = Math.min(...items.map(b => b.top)) - 8, y1 = Math.max(...items.map(b => b.bottom)) + 8;
        const sx = bg.width / innerWidth, sy = bg.height / innerHeight;
        try {
          const g = inkProbe.getContext('2d', { willReadFrequently: true });
          g.clearRect(0, 0, 24, 8);
          g.drawImage(bg, Math.max(0, x0 * sx), Math.max(0, y0 * sy), Math.max(1, (x1 - x0) * sx), Math.max(1, (y1 - y0) * sy), 0, 0, 24, 8);
          const d = g.getImageData(0, 0, 24, 8).data;
          let lum = 0, n = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 16) continue;
            lum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
            n++;
          }
          if (n) {
            const L = lum / n;
            // hysteresis so a drifting photo doesn't flip the ink back and forth
            if (L > 0.62) inkAuto = 'dark';
            else if (L < 0.5) inkAuto = 'light';
          }
        } catch (e) { /* tainted canvas (cross-origin wallpaper): keep the last pick */ }
      }
    }
    setInkClass(inkAuto);
  }
  (function wireInk() {
    const opts = document.getElementById('ink-opts');
    const render = () => { for (const b of opts.children) b.classList.toggle('active', b.dataset.ink === inkMode()); };
    opts.addEventListener('click', e => {
      const b = e.target.closest('button[data-ink]');
      if (!b) return;
      store('home:ink', b.dataset.ink);
      render();
      sampleInk();
    });
    render();
    sampleInk(); // a sensible class right away (light until the first sample)
    // the background drifts, crossfades and changes phase: re-check now and then
    setTimeout(sampleInk, 300);
    setTimeout(sampleInk, 1500);
    setInterval(() => { if (!document.hidden) sampleInk(); }, 4000);
  })();

  /* ---------- page font ---------- */

  // stored as a family name ('' = the default Inter + Silkscreen pair). Named
  // fonts come from Google Fonts (same host the page already loads Inter from);
  // anything else is treated as an installed font, with a Google fallback try.
  const FONT_GROUPS = {
    'Pixel': ['Silkscreen', 'Pixelify Sans', 'Press Start 2P', 'VT323', 'Tiny5', 'Jersey 10'],
    'Sans': ['Inter', 'Space Grotesk', 'Outfit', 'Nunito', 'Rubik', 'Manrope'],
    'Mono': ['JetBrains Mono', 'IBM Plex Mono', 'Space Mono', 'Fira Code'],
    'Serif': ['Lora', 'Fraunces', 'Playfair Display', 'Merriweather'],
    'Handwritten': ['Caveat', 'Patrick Hand'],
  };
  const LEGACY_FONTS = { pixel: 'Silkscreen', mono: 'JetBrains Mono', serif: 'Lora', system: 'system-ui' };
  const SYSTEM_FONTS = ['system-ui'];
  const isListedFont = f => SYSTEM_FONTS.includes(f) || Object.values(FONT_GROUPS).some(g => g.includes(f));
  function currentFont() {
    const f = (loadStored('home:font') || '').trim();
    return LEGACY_FONTS[f] || f;
  }
  function loadGoogleFont(family) {
    if (!family || SYSTEM_FONTS.includes(family) || family === 'Inter' || family === 'Silkscreen') return;
    const id = 'gf-' + family.replace(/\W+/g, '-').toLowerCase();
    if (document.getElementById(id)) return;
    const l = document.createElement('link');
    l.id = id;
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(family).replace(/%20/g, '+') +
      ':wght@400;500;600&display=swap';
    // fonts that only ship one weight reject the weight axis — retry plain
    l.onerror = () => { l.onerror = null; l.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(family).replace(/%20/g, '+') + '&display=swap'; };
    document.head.appendChild(l);
  }
  function applyFont() {
    const f = currentFont();
    const root = document.documentElement.style;
    if (!f) {
      root.removeProperty('--font-text');
      root.removeProperty('--font-pixel');
    } else {
      loadGoogleFont(f);
      const stack = f === 'system-ui'
        ? 'system-ui, -apple-system, "Segoe UI", sans-serif'
        : `"${f.replace(/["\\]/g, '')}", system-ui, sans-serif`;
      root.setProperty('--font-text', stack);
      // small labels follow too, unless asked to keep the pixel look
      if (loadStored('home:fontPixel') === '1') root.removeProperty('--font-pixel');
      else root.setProperty('--font-pixel', stack);
    }
    const sel = document.getElementById('set-font');
    const custom = document.getElementById('set-font-custom');
    const isCustom = !!f && !isListedFont(f);
    sel.value = isCustom || sel.dataset.custom === '1' ? '__custom' : f;
    document.getElementById('font-custom-row').hidden = sel.value !== '__custom';
    if (isCustom && document.activeElement !== custom) custom.value = f;
    document.getElementById('set-font-pixel').checked = loadStored('home:fontPixel') === '1';
    document.getElementById('set-font-pixel').disabled = !f;
  }
  (function wireFont() {
    const sel = document.getElementById('set-font');
    const add = (parent, value, label) => {
      const o = document.createElement('option');
      o.value = value;
      o.textContent = label;
      parent.appendChild(o);
    };
    add(sel, '', 'Default — Inter + pixel labels');
    add(sel, 'system-ui', 'System font');
    for (const [g, list] of Object.entries(FONT_GROUPS)) {
      const og = document.createElement('optgroup');
      og.label = g;
      for (const f of list) add(og, f, f);
      sel.appendChild(og);
    }
    add(sel, '__custom', 'Custom / installed font…');
    const custom = document.getElementById('set-font-custom');
    sel.addEventListener('change', () => {
      if (sel.value === '__custom') {
        sel.dataset.custom = '1';
        document.getElementById('font-custom-row').hidden = false;
        custom.focus();
        return;
      }
      sel.dataset.custom = '';
      store('home:font', sel.value);
      applyFont();
    });
    let deb = 0;
    custom.addEventListener('input', () => {
      clearTimeout(deb);
      deb = setTimeout(() => { store('home:font', custom.value.trim()); applyFont(); }, 400);
    });
    document.getElementById('set-font-pixel').addEventListener('change', e => {
      store('home:fontPixel', e.target.checked ? '1' : '0');
      applyFont();
    });
    // Chrome's Local Font Access: list what's installed (asks permission once)
    const localBtn = document.getElementById('font-local');
    if ('queryLocalFonts' in window) {
      localBtn.hidden = false;
      localBtn.addEventListener('click', async () => {
        try {
          const fonts = await window.queryLocalFonts();
          const list = document.getElementById('font-list');
          list.innerHTML = '';
          for (const fam of [...new Set(fonts.map(f => f.family))].sort()) {
            const o = document.createElement('option');
            o.value = fam;
            list.appendChild(o);
          }
          localBtn.textContent = `${list.children.length} fonts`;
          custom.focus();
          custom.showPicker?.();
        } catch (e) { localBtn.textContent = 'Not allowed'; }
      });
    }
  })();

  function applyUserCss() {
    let st = document.getElementById('user-css');
    if (!st) { st = document.createElement('style'); st.id = 'user-css'; document.head.appendChild(st); }
    st.textContent = loadStored('home:css') || '';
  }
  (function wireCss() {
    const ta = document.getElementById('set-css');
    ta.value = loadStored('home:css') || '';
    let deb = 0;
    ta.addEventListener('input', () => {
      clearTimeout(deb);
      deb = setTimeout(() => { store('home:css', ta.value); applyUserCss(); }, 300);
    });
  })();

  /* ---------- tab title + emoji favicon ---------- */

  function loadPomoState() {
    try { const v = JSON.parse(loadStored('home:pomo')); return v && typeof v === 'object' ? v : null; } catch (e) { return null; }
  }
  function loadPomoCfg() {
    try { return { work: 25, short: 5, long: 15, ...((JSON.parse(loadStored('home:pomoCfg'))) || {}) }; }
    catch (e) { return { work: 25, short: 5, long: 15 }; }
  }
  function renderTabTitle() {
    const pomo = loadPomoState();
    const tpl = (loadStored('home:tabTitle') || '').trim();
    const hhmm = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    let t = tpl ? tpl.split('{time}').join(hhmm) : (window.__origTitle || document.title);
    if (pomo && pomo.running && pomo.endsAt > Date.now()) {
      const s = Math.max(0, Math.ceil((pomo.endsAt - Date.now()) / 1000));
      t = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} · ` + t;
    }
    if (document.title !== t) document.title = t;
  }
  function renderFavicon() {
    const link = document.querySelector('link[rel="icon"]');
    if (!link) return;
    const emoji = (loadStored('home:favicon') || '').trim();
    if (emoji) {
      link.href = 'data:image/svg+xml,' + encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${escHtml(emoji)}</text></svg>`);
    } else if (window.__origFav) {
      link.href = window.__origFav;
    }
  }
  (function wireTitleFav() {
    const t = document.getElementById('set-tabtitle');
    const f = document.getElementById('set-favicon');
    t.value = loadStored('home:tabTitle') || '';
    f.value = loadStored('home:favicon') || '';
    t.addEventListener('input', () => { store('home:tabTitle', t.value); renderTabTitle(); });
    f.addEventListener('input', () => { store('home:favicon', f.value); renderFavicon(); });
  })();

  /* ---------- analog clock face (big clock) ---------- */

  // t = { h, m, s } in the chosen time zone; showSec draws the seconds hand
  function drawAnalogClock(t, showSec) {
    const cv = document.getElementById('analog-clock');
    if (!cv || !cv.getContext) return;
    // back the face with device pixels so it stays crisp on HiDPI screens;
    // it's drawn in a 132-unit space and scaled to the Layout → Scale size
    const S = 132, C = S / 2;
    const k = displayScale('home:clockScale');
    const dpr = Math.min(devicePixelRatio || 1, 3) * k;
    if (cv.width !== Math.round(S * dpr)) {
      cv.width = cv.height = Math.round(S * dpr);
      cv.style.width = cv.style.height = Math.round(S * k) + 'px';
    }
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cs = getComputedStyle(document.body);
    const panel = cs.getPropertyValue('--panel').trim() || 'rgba(9,16,36,0.82)';
    const border = cs.getPropertyValue('--border-strong').trim() || '#6c8cff';
    const text = cs.getPropertyValue('--text').trim() || '#d7e0fb';
    const accent = cs.getPropertyValue('--accent').trim() || '#6c8cff';
    c.clearRect(0, 0, S, S);
    c.beginPath(); c.arc(C, C, C - 4, 0, Math.PI * 2);
    c.fillStyle = panel; c.fill();
    c.lineWidth = 3; c.strokeStyle = border; c.stroke();
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      const r1 = C - 13, r0 = i % 3 === 0 ? C - 24 : C - 18;
      c.strokeStyle = i % 3 === 0 ? accent : border;
      c.lineWidth = i % 3 === 0 ? 4 : 2.5;
      c.beginPath();
      c.moveTo(C + Math.sin(a) * r0, C - Math.cos(a) * r0);
      c.lineTo(C + Math.sin(a) * r1, C - Math.cos(a) * r1);
      c.stroke();
    }
    const hand = (frac, len, w, color) => {
      const a = frac * Math.PI * 2;
      c.strokeStyle = color; c.lineWidth = w; c.lineCap = 'round';
      c.beginPath(); c.moveTo(C, C);
      c.lineTo(C + Math.sin(a) * len, C - Math.cos(a) * len);
      c.stroke();
    };
    hand((t.h % 12) / 12 + t.m / 720, C * 0.45, 7, text);
    hand(t.m / 60 + t.s / 3600, C * 0.68, 5, text);
    if (showSec) hand(t.s / 60, C * 0.78, 2, accent);
    c.beginPath(); c.arc(C, C, 5, 0, Math.PI * 2);
    c.fillStyle = accent; c.fill();
  }

  /* ---------- Look pane knobs: solid colors, blur, brightness ---------- */

  (function wireBgKnobs() {
    const a = document.getElementById('solid-a');
    const b = document.getElementById('solid-b');
    a.value = loadStored('home:solidA') || '#101a3a';
    b.value = loadStored('home:solidB') || '#3a2a6a';
    bgApi.setSolid(a.value, b.value);
    const applySolid = () => {
      store('home:solidA', a.value);
      store('home:solidB', b.value);
      bgApi.setSolid(a.value, b.value);
    };
    a.addEventListener('input', applySolid);
    b.addEventListener('input', applySolid);

    const blur = document.getElementById('bg-blur');
    const blurVal = document.getElementById('bg-blur-val');
    const bright = document.getElementById('bg-bright');
    const brightVal = document.getElementById('bg-bright-val');
    const sb = Math.max(0, Math.min(24, +(loadStored('home:bgBlur') || 0)));
    const br = Math.max(50, Math.min(150, +(loadStored('home:bgBright') || 100)));
    blur.value = String(sb); blurVal.textContent = String(sb);
    bright.value = String(br); brightVal.textContent = br + '%';
    bgApi.setFilters(sb, br / 100);
    blur.addEventListener('input', () => {
      blurVal.textContent = blur.value;
      store('home:bgBlur', blur.value);
      bgApi.setFilters(+blur.value, +bright.value / 100);
    });
    bright.addEventListener('input', () => {
      brightVal.textContent = bright.value + '%';
      store('home:bgBright', bright.value);
      bgApi.setFilters(+blur.value, +bright.value / 100);
    });
  })();

  /* ---------- custom search engine ---------- */

  function customProvider() {
    try {
      const v = JSON.parse(loadStored('home:cengine'));
      if (v && v.name && v.url && /^https?:\/\//.test(v.url)) {
        return { id: 'custom', name: String(v.name).slice(0, 20), letter: (String(v.name)[0] || '?').toUpperCase(), url: String(v.url) };
      }
    } catch (e) { }
    return null;
  }
  function allProviders() {
    const c = customProvider();
    return c ? [...PROVIDERS, c] : [...PROVIDERS];
  }
  // {q} in the template is the query; without it the query is appended
  function engineUrl(q) {
    const enc = encodeURIComponent(q);
    const u = provider.url;
    return u.includes('{q}') ? u.split('{q}').join(enc) : u + enc;
  }
  (function wireCustomEngine() {
    const nameIn = document.getElementById('set-cengine-name');
    const urlIn = document.getElementById('set-cengine-url');
    let v = null;
    try { v = JSON.parse(loadStored('home:cengine')); } catch (e) { }
    nameIn.value = (v && v.name) || '';
    urlIn.value = (v && v.url) || '';
    let deb = 0;
    const apply = () => {
      clearTimeout(deb);
      deb = setTimeout(() => {
        const name = nameIn.value.trim(), url = urlIn.value.trim();
        if (name && url) store('home:cengine', JSON.stringify({ name, url }));
        else try { localStorage.removeItem('home:cengine'); } catch (e) { }
        if (provider.id === 'custom') {
          // pick up the edited name/URL, or fall back when the engine was removed
          const c = customProvider();
          if (c) provider = c; else setProvider(PROVIDERS[0], false);
        }
        renderEngineOpts();
        renderProviderMenu();
        renderProvider();
      }, 200);
    };
    nameIn.addEventListener('input', apply);
    urlIn.addEventListener('input', apply);
  })();

  /* ---------- Widgets tab: on/off + pin per widget, their settings ---------- */

  // one card per registered widget: switch it on/off, pin it to the page, and
  // (for quotes / pomodoro) its own settings right underneath
  function renderWidgetList() {
    const host = document.getElementById('widget-list');
    if (!host) return;
    const on = new Set(loadWidgets());
    const pinned = loadWidgetPos();
    // per-widget settings blocks live in the markup; keep them across re-renders
    const sets = {};
    document.querySelectorAll('.wl-set[data-for]').forEach(s => { sets[s.dataset.for] = s; });
    host.textContent = '';
    for (const [type, def] of Object.entries(WIDGETS)) {
      const item = document.createElement('div');
      item.className = 'wl-item' + (on.has(type) ? ' on' : '');
      const head = document.createElement('div');
      head.className = 'wl-head';
      const text = document.createElement('div');
      text.className = 'wl-text';
      const nm = document.createElement('div');
      nm.className = 'wl-name';
      nm.textContent = def.name;
      const bl = document.createElement('div');
      bl.className = 'wl-blurb';
      bl.textContent = def.blurb || '';
      text.append(nm, bl);
      const pin = document.createElement('button');
      pin.type = 'button';
      pin.className = 'wl-pin' + (pinned[type] ? ' active' : '');
      pin.textContent = pinned[type] ? 'Pinned' : 'Pin';
      pin.title = pinned[type] ? 'Back into the side panel' : 'Put it on the page';
      pin.disabled = !on.has(type);
      pin.addEventListener('click', () => togglePin(type));
      const sw = document.createElement('label');
      sw.className = 'set-check';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = on.has(type);
      cb.setAttribute('aria-label', `Show ${def.name}`);
      cb.addEventListener('change', () => {
        if (cb.checked) {
          addWidget(type);
          // a freshly enabled widget should be visible right away
          if (!modLayer.classList.contains('open') && !loadWidgetPos()[type]) setLayer(true);
        } else {
          const card = document.querySelector(`.mod-card[data-type="${type}"]`);
          if (card) removeWidget(+card.dataset.idx, type);
        }
      });
      sw.appendChild(cb);
      head.append(text, pin, sw);
      item.appendChild(head);
      if (sets[type]) { sets[type].hidden = !on.has(type); item.appendChild(sets[type]); }
      host.appendChild(item);
    }
    for (const [t, s] of Object.entries(sets)) if (!WIDGETS[t]) s.hidden = true;
  }

  (function wireWidgetSettings() {
    const q = document.getElementById('set-quotes');
    q.value = loadStored('home:quotesCustom') || '';
    q.addEventListener('input', () => store('home:quotesCustom', q.value));
    const cfg = loadPomoCfg();
    const w = document.getElementById('pomo-work');
    const s = document.getElementById('pomo-short');
    const l = document.getElementById('pomo-long');
    w.value = cfg.work; s.value = cfg.short; l.value = cfg.long;
    const applyCfg = () => store('home:pomoCfg', JSON.stringify({
      work: Math.max(1, Math.min(180, +w.value || 25)),
      short: Math.max(1, Math.min(60, +s.value || 5)),
      long: Math.max(1, Math.min(120, +l.value || 15)),
    }));
    w.addEventListener('input', applyCfg);
    s.addEventListener('input', applyCfg);
    l.addEventListener('input', applyCfg);
    document.getElementById('widget-reset').addEventListener('click', () => {
      document.querySelectorAll('.mod-card.mod-float').forEach(card => dockCard(card, card.dataset.type));
      saveWidgetPos({});
      renderWidgetList();
    });
    document.getElementById('alert-reset').addEventListener('click', e => {
      try { localStorage.removeItem('home:alertPos'); } catch (err) { }
      placeAlertDock(); // back to bottom center
      const b = e.currentTarget, label = b.textContent;
      b.textContent = 'Reset ✓';
      setTimeout(() => { b.textContent = label; }, 1200);
    });
    renderWidgetList();
  })();

  /* ---------- pinned widgets: placed anywhere on the page ---------- */

  // positions are stored as fractions of the viewport ({fx, fy}) so a pinned
  // widget keeps its place relative to the screen when the window resizes;
  // older builds stored pixels ({x, y}) and still load
  function loadWidgetPos() {
    try { const v = JSON.parse(loadStored('home:widgetPos')); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; }
  }
  function saveWidgetPos(p) { store('home:widgetPos', JSON.stringify(p)); }
  function posToPx(p) {
    if (!p) return null;
    if (isFinite(p.fx) && isFinite(p.fy)) return { x: p.fx * innerWidth, y: p.fy * innerHeight };
    if (isFinite(p.x) && isFinite(p.y)) return { x: p.x, y: p.y };
    return null;
  }
  // pinned widgets snap to an 8px grid so rows line up neatly. (A literal, not a
  // const: restored widgets are pinned before this part of the file has run.)
  function clampPos(card, x, y) {
    const w = card.offsetWidth || 250, h = card.offsetHeight || 120;
    return {
      x: Math.max(8, Math.min(innerWidth - w - 8, Math.round(x / 8) * 8)),
      y: Math.max(8, Math.min(innerHeight - Math.min(h, 120) - 8, Math.round(y / 8) * 8)),
    };
  }
  function savePinned(card, type) {
    const p = loadWidgetPos();
    p[type] = { fx: (parseFloat(card.style.left) || 0) / innerWidth, fy: (parseFloat(card.style.top) || 0) / innerHeight };
    saveWidgetPos(p);
  }
  function syncPinBtn(card) {
    const b = card.querySelector('.mod-pin');
    if (!b) return;
    const on = card.classList.contains('mod-float');
    b.classList.toggle('active', on);
    b.title = on ? 'Unpin — back into the side panel' : 'Pin to the page';
  }
  function pinCard(card, x, y) {
    card.classList.add('mod-float');
    document.body.appendChild(card);
    const p = clampPos(card, x, y);
    card.style.left = p.x + 'px';
    card.style.top = p.y + 'px';
    syncPinBtn(card);
  }
  function dockCard(card, type) {
    card.classList.remove('mod-float');
    card.style.left = '';
    card.style.top = '';
    modBody.appendChild(card);
    const p = loadWidgetPos();
    delete p[type];
    saveWidgetPos(p);
    syncPinBtn(card);
    renderEmptyHint();
  }
  // first free spot for a newly pinned card: down the left edge, then the right
  function freeSpot(card) {
    const w = card.offsetWidth || 250, h = card.offsetHeight || 140;
    const taken = [...document.querySelectorAll('.mod-card.mod-float')]
      .filter(c => c !== card).map(c => c.getBoundingClientRect());
    const hit = (x, y) => taken.some(r => x < r.right + 12 && x + w + 12 > r.left && y < r.bottom + 12 && y + h + 12 > r.top);
    for (const x of [24, innerWidth - w - 24]) {
      for (let y = 72; y + h < innerHeight - 24; y += 16) if (!hit(x, y)) return { x, y };
    }
    return { x: 24, y: 72 };
  }
  function togglePin(type) {
    const card = document.querySelector(`.mod-card[data-type="${type}"]`);
    if (!card) return;
    if (card.classList.contains('mod-float')) dockCard(card, type);
    else {
      const s = freeSpot(card);
      pinCard(card, s.x, s.y);
      savePinned(card, type);
      renderEmptyHint();
      // make sure it's actually visible
      const show = loadShow();
      if (!show.widgets) { show.widgets = true; store('home:show', JSON.stringify(show)); applyShow(show); renderShowOpts(); }
    }
    renderWidgetList();
  }
  // keep pinned cards on screen (and in proportion) when the window resizes
  addEventListener('resize', () => {
    const pos = loadWidgetPos();
    document.querySelectorAll('.mod-card.mod-float').forEach(card => {
      const px = posToPx(pos[card.dataset.type]);
      if (!px) return;
      const p = clampPos(card, px.x, px.y);
      card.style.left = p.x + 'px';
      card.style.top = p.y + 'px';
    });
  });
  function bindCardDrag(card, type) {
    const head = card.querySelector('.mod-card-head');
    if (!head) return;
    head.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('.mod-remove, .mod-pin')) return;
      const sx = e.clientX, sy = e.clientY;
      const rect = card.getBoundingClientRect();
      let moved = false;
      const move = ev => {
        if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 7) return;
        if (!moved) {
          moved = true;
          if (card.parentElement === modBody) pinCard(card, rect.left, rect.top);
          card.classList.add('dragging');
        }
        const p = clampPos(card, rect.left + ev.clientX - sx, rect.top + ev.clientY - sy);
        card.style.left = p.x + 'px';
        card.style.top = p.y + 'px';
      };
      const up = ev => {
        removeEventListener('pointermove', move);
        removeEventListener('pointerup', up);
        card.classList.remove('dragging');
        if (!moved) return;
        const r = modLayer.getBoundingClientRect();
        if (modLayer.classList.contains('open') &&
            ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) {
          dockCard(card, type);
        } else {
          savePinned(card, type);
          renderEmptyHint();
        }
        renderWidgetList();
      };
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
    });
    head.addEventListener('dblclick', e => {
      if (e.target.closest('.mod-remove, .mod-pin')) return;
      if (card.classList.contains('mod-float')) { dockCard(card, type); renderWidgetList(); }
    });
  }

  /* ---------- custom quick links (Settings → Links) ---------- */

  function removeCustomLink(url) {
    saveLinks(loadLinks().filter(l => !(l.kind !== 'folder' && l.url === url)));
    refreshTabStrip(true);
    renderLinkList();
  }
  function renderLinkList() {
    const list = document.getElementById('link-list');
    if (!list) return;
    const links = loadLinks();
    list.innerHTML = '';
    if (!links.length) {
      const p = document.createElement('p');
      p.className = 'set-note';
      p.textContent = 'No links yet — add one above, or right-click the page and pick “Add / manage links”.';
      list.appendChild(p);
      return;
    }
    links.forEach((l, i) => list.appendChild(linkRow(l, i, -1)));
  }
  // path ([i] or [folder, child]) of the row being dragged in Settings → Links
  let linkDragPath = null;
  // move the link/folder at path `from` relative to the row at path `to`:
  // zone 'before'/'after' reorders, 'into' groups into (or creates) a folder
  function moveLink(from, to, zone) {
    if (from.join('.') === to.join('.')) return;
    const links = loadLinks();
    const at = p => p.length === 1 ? links[p[0]] : (links[p[0]] && (links[p[0]].children || [])[p[1]]);
    const dragged = at(from), target = at(to);
    if (!dragged || !target) return;
    // folders only live at the top level, and never inside themselves
    if (dragged.kind === 'folder' && (to.length > 1 || zone === 'into')) return;
    if (to.length > 1 && to[0] === from[0] && from.length === 1) return;
    // detach the dragged item
    const srcList = from.length === 1 ? links : links[from[0]].children;
    srcList.splice(srcList.indexOf(dragged), 1);
    if (zone === 'into') {
      if (target.kind === 'folder') {
        target.children = [...(target.children || []), dragged];
      } else {
        const list = to.length === 1 ? links : links[to[0]].children;
        list.splice(list.indexOf(target), 1,
          { kind: 'folder', label: 'Folder', children: [target, dragged] });
      }
    } else {
      const list = to.length === 1 ? links : links[to[0]].children;
      const idx = list.indexOf(target);
      if (idx < 0) return;
      list.splice(zone === 'after' ? idx + 1 : idx, 0, dragged);
    }
    // a folder emptied by the move disappears
    saveLinks(links.filter(x => x.kind !== 'folder' || (x.children && x.children.length)));
    renderLinkList();
    refreshTabStrip(true);
  }
  // one row for a link or a folder (folder children are nested rows)
  function linkRow(l, i, parent) {
    const row = document.createElement('div');
    row.className = 'link-row' + (l.kind === 'folder' ? ' folder' : '') + (parent >= 0 ? ' sub' : '');
    row.draggable = true;
    const grip = document.createElement('span');
    grip.className = 'drag-h';
    grip.textContent = '⠿';
    grip.title = l.kind === 'folder'
      ? 'Drag to reorder · drop links onto this folder to add them'
      : 'Drag to reorder (drop on a row edge) · drop onto the middle of a row to group into a folder';
    row.appendChild(grip);
    const label = document.createElement('input');
    label.className = 'set-input';
    label.value = l.label || '';
    label.maxLength = 32;
    label.placeholder = 'Label';
    const url = document.createElement('input');
    url.className = 'set-input';
    url.value = l.url || '';
    url.maxLength = 300;
    url.placeholder = 'https://…';
    const icon = document.createElement('input');
    icon.className = 'set-input link-icon-in';
    icon.value = l.icon || '';
    icon.maxLength = 4;
    icon.placeholder = '🌤';
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'mod-icon-btn';
    del.textContent = '×';
    del.title = 'Remove';
    row.append(label, url, icon, del);
    if (l.kind === 'folder') {
      url.remove(); icon.remove();
      const badge = document.createElement('span');
      badge.className = 'wg-badge';
      badge.textContent = String((l.children || []).length);
      row.appendChild(badge);
    }
    const commit = () => {
      const links = loadLinks();
      if (parent >= 0) {
        const f = links[parent];
        if (f && f.kind === 'folder' && f.children[i]) {
          f.children[i].label = label.value.trim();
          f.children[i].url = url.value.trim();
          f.children[i].icon = icon.value.trim();
        }
      } else if (links[i]) {
        if (links[i].kind === 'folder') links[i].label = label.value.trim() || 'Folder';
        else {
          links[i].label = label.value.trim();
          links[i].url = url.value.trim();
          links[i].icon = icon.value.trim();
        }
      }
      saveLinks(links);
      refreshTabStrip(true);
    };
    [label, url, icon].forEach(el => el.addEventListener('input', commit));
    del.addEventListener('click', () => {
      const links = loadLinks();
      if (parent >= 0) {
        const f = links[parent];
        if (f && f.kind === 'folder') f.children.splice(i, 1);
      } else links.splice(i, 1);
      saveLinks(links);
      renderLinkList();
      refreshTabStrip(true);
    });
    // drag & drop: the top/bottom edge of a row reorders (before/after), the
    // middle of a link folds both into a new folder, the middle of a folder's
    // header drops the link into it; children can be reordered or dragged out
    const path = parent >= 0 ? [parent, i] : [i];
    row.dataset.path = path.join('.');
    const zoneOf = e => {
      const r = (l.kind === 'folder' ? label : row).getBoundingClientRect();
      const y = (e.clientY - r.top) / r.height;
      if (y < 0.3) return 'before';
      if (l.kind === 'folder' || parent < 0) return y > 0.7 && l.kind !== 'folder' ? 'after' : 'into';
      return y < 0.5 ? 'before' : 'after'; // inside a folder: reorder only
    };
    const clearMarks = () => row.classList.remove('drag-over', 'drag-before', 'drag-after');
    row.addEventListener('dragstart', e => {
      e.stopPropagation();
      linkDragPath = path;
      e.dataTransfer.setData('text/plain', row.dataset.path);
      e.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragend', () => { linkDragPath = null; });
    row.addEventListener('dragover', e => {
      if (!linkDragPath) return;
      e.preventDefault();
      e.stopPropagation();
      clearMarks();
      const z = zoneOf(e);
      row.classList.add(z === 'into' ? 'drag-over' : 'drag-' + z);
    });
    row.addEventListener('dragleave', e => { if (!row.contains(e.relatedTarget)) clearMarks(); });
    row.addEventListener('drop', e => {
      e.preventDefault();
      e.stopPropagation();
      clearMarks();
      const from = linkDragPath;
      linkDragPath = null;
      if (from) moveLink(from, path, zoneOf(e));
    });
    if (l.kind === 'folder') {
      (l.children || []).forEach((child, ci) => {
        row.appendChild(linkRow(child, ci, i));
      });
    }
    return row;
  }
  (function wireLinkAdd() {
    const label = document.getElementById('link-label');
    const url = document.getElementById('link-url');
    const icon = document.getElementById('link-icon');
    const add = document.getElementById('link-add');
    const doAdd = () => {
      let u = url.value.trim();
      if (!u) return;
      if (!/^(https?:|chrome:\/\/|edge:\/\/|about:)/i.test(u)) u = 'https://' + u;
      try { new URL(u); } catch (e) { url.focus(); return; }
      const links = loadLinks();
      links.push({ kind: 'link', label: label.value.trim() || hostOf(u), url: u, icon: icon.value.trim() });
      saveLinks(links);
      label.value = ''; url.value = ''; icon.value = '';
      renderLinkList();
      refreshTabStrip(true);
    };
    add.addEventListener('click', doAdd);
    url.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });
    label.addEventListener('keydown', e => { if (e.key === 'Enter') url.focus(); });
    renderLinkList();
  })();

  /* ---------- More tab: presets, backup (export / import) ---------- */

  (function wireData() {
    const imTa = document.getElementById('data-import-ta');
    const exportObj = () => {
      const obj = {};
      try {
        for (const k of Object.keys(localStorage)) if (k.startsWith('home:')) obj[k] = localStorage.getItem(k);
      } catch (e) { }
      return obj;
    };
    const exportJson = () => JSON.stringify(exportObj(), null, 2);

    // backup
    const flash = (btn, label) => {
      const prev = btn.textContent;
      btn.textContent = label;
      setTimeout(() => { btn.textContent = prev; }, 1400);
    };
    document.getElementById('data-copy').addEventListener('click', async e => {
      try { await navigator.clipboard.writeText(exportJson()); flash(e.currentTarget, 'Copied ✓'); }
      catch (err) { flash(e.currentTarget, 'Copy failed'); }
    });
    document.getElementById('data-download').addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([exportJson()], { type: 'application/json' }));
      a.download = `home-settings-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    });
    function importText(text) {
      let obj;
      try { obj = JSON.parse(text); } catch (e) { alert('That is not valid JSON.'); return; }
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) { alert('Expected a JSON object of home:* keys.'); return; }
      if (!confirm('Import these settings? Your current settings are overwritten.')) return;
      for (const [k, v] of Object.entries(obj)) {
        if (!k.startsWith('home:')) continue;
        try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) { }
      }
      location.reload();
    }
    document.getElementById('data-import').addEventListener('click', () => importText(imTa.value));
    const fileIn = document.getElementById('data-import-input');
    document.getElementById('data-import-file').addEventListener('click', () => fileIn.click());
    fileIn.addEventListener('change', async () => {
      const f = fileIn.files && fileIn.files[0];
      fileIn.value = '';
      if (f) importText(await f.text());
    });

    // presets: named snapshots of how the page looks & behaves. Your content
    // (notes, links, quotes), running state and caches are left out, so
    // switching presets never loses a to-do or a link.
    const PRESET_SKIP = new Set([
      'home:presets', 'home:notes', 'home:links', 'home:quotesCustom', 'home:pomo', 'home:searches',
      'home:tabCounts', 'home:wallLast', 'home:wx', 'home:imgtheme', 'home:setTab', 'home:layerOpen',
    ]);
    const loadPresets = () => {
      try { const v = JSON.parse(loadStored('home:presets')); return Array.isArray(v) ? v.filter(p => p && p.name && p.data) : []; }
      catch (e) { return []; }
    };
    const savePresets = list => store('home:presets', JSON.stringify(list.slice(0, 20)));
    const snapshot = () => {
      const o = exportObj();
      for (const k of Object.keys(o)) if (PRESET_SKIP.has(k)) delete o[k];
      return o;
    };
    function applyPreset(data, merge) {
      try {
        // a saved preset replaces the whole setup; a starter only nudges a few keys
        if (!merge) {
          for (const k of Object.keys(localStorage)) {
            if (k.startsWith('home:') && !PRESET_SKIP.has(k)) localStorage.removeItem(k);
          }
        }
        for (const [k, v] of Object.entries(data)) if (k.startsWith('home:') && !PRESET_SKIP.has(k)) localStorage.setItem(k, v);
      } catch (e) { }
      location.reload();
    }
    const nameIn = document.getElementById('preset-name');
    const listEl = document.getElementById('preset-list');
    function renderPresets() {
      const list = loadPresets();
      listEl.textContent = '';
      if (!list.length) {
        const p = document.createElement('p');
        p.className = 'set-note';
        p.style.margin = '0';
        p.textContent = 'No saved presets yet — set things up the way you like, name it and press “Save current”.';
        listEl.appendChild(p);
        return;
      }
      list.forEach((p, i) => {
        const row = document.createElement('div');
        row.className = 'preset-row';
        const nm = document.createElement('span');
        nm.className = 'p-name';
        nm.textContent = p.name;
        const dt = document.createElement('span');
        dt.className = 'p-date';
        dt.textContent = p.ts ? new Date(p.ts).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';
        const btn = (label, title, fn) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'wall-btn';
          b.textContent = label;
          b.title = title;
          b.addEventListener('click', fn);
          return b;
        };
        row.append(nm, dt,
          btn('Apply', 'Switch to this preset', () => {
            if (confirm(`Switch to “${p.name}”? Unsaved changes to your current setup are lost.`)) applyPreset(p.data, false);
          }),
          btn('Update', 'Overwrite it with the current setup', e => {
            const l = loadPresets();
            if (!l[i]) return;
            l[i] = { ...l[i], data: snapshot(), ts: Date.now() };
            savePresets(l);
            flash(e.currentTarget, 'Saved ✓');
          }),
          btn('×', 'Delete this preset', () => {
            if (!confirm(`Delete the preset “${p.name}”?`)) return;
            const l = loadPresets();
            l.splice(i, 1);
            savePresets(l);
            renderPresets();
          }));
        listEl.appendChild(row);
      });
    }
    function saveCurrent() {
      const name = nameIn.value.trim() || `Preset ${loadPresets().length + 1}`;
      const list = loadPresets();
      const i = list.findIndex(p => p.name.toLowerCase() === name.toLowerCase());
      const entry = { name, data: snapshot(), ts: Date.now() };
      if (i >= 0) {
        if (!confirm(`Replace the preset “${list[i].name}”?`)) return;
        list[i] = entry;
      } else list.unshift(entry);
      savePresets(list);
      nameIn.value = '';
      renderPresets();
    }
    document.getElementById('preset-save').addEventListener('click', saveCurrent);
    nameIn.addEventListener('keydown', e => { if (e.key === 'Enter') saveCurrent(); });
    renderPresets();

    const STARTERS = {
      midnight: { 'home:theme': 'dark', 'home:phase': 'night', 'home:bg': 'scene', 'home:motion': 'on' },
      sunrise: { 'home:theme': 'amber', 'home:phase': 'morning', 'home:bg': 'grain', 'home:motion': 'on' },
      paper: {
        'home:theme': 'bright', 'home:phase': 'day', 'home:bg': 'grid', 'home:motion': 'off',
        'home:show': JSON.stringify({ ...DEFAULT_SHOW, pulse: false }),
      },
    };
    document.getElementById('profile-opts').addEventListener('click', e => {
      const b = e.target.closest('button[data-profile]');
      if (!b || !STARTERS[b.dataset.profile]) return;
      if (!confirm(`Apply the “${b.textContent}” starter? It changes your theme, phase and background.`)) return;
      applyPreset(STARTERS[b.dataset.profile], true);
    });
  })();

  /* ---------- help overlay ---------- */

  function toggleHelp(force) {
    const ov = document.getElementById('help-overlay');
    ov.hidden = force !== undefined ? !force : !ov.hidden;
  }
  document.getElementById('help-close').addEventListener('click', () => toggleHelp(false));
  document.getElementById('help-overlay').addEventListener('click', e => { if (e.target.id === 'help-overlay') toggleHelp(false); });

  /* ---------- page context menu (Bonjourr-style) ---------- */

  const ctxEl = document.getElementById('ctx-menu');
  function closeCtx() { ctxEl.hidden = true; ctxEl.innerHTML = ''; }
  function openCtx(x, y, items) {
    ctxEl.innerHTML = '';
    for (const [label, fn] of items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ctx-item';
      b.textContent = label;
      b.addEventListener('click', () => { closeCtx(); fn(); });
      ctxEl.appendChild(b);
    }
    ctxEl.hidden = false;
    const r = ctxEl.getBoundingClientRect();
    ctxEl.style.left = Math.max(4, Math.min(x, innerWidth - r.width - 8)) + 'px';
    ctxEl.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 8)) + 'px';
  }
  document.addEventListener('contextmenu', e => {
    if (isTypingTarget(e.target)) return; // fields keep the native menu
    const chip = e.target.closest('.tab-chip');
    const own = chip && chip._item && chip._item.custom && chip._item.kind !== 'folder';
    // real links and bookmark/recent chips keep the browser's menu
    // ("Open in new tab", "Copy link address", …); only *your* links get ours
    if (!own && (chip || e.target.closest('a[href]'))) return;
    e.preventDefault();
    if (own) {
      openCtx(e.clientX, e.clientY, [
        ['Edit / manage links', () => { setSettings(true); showSetTab('links'); }],
        ['Remove this link', () => removeCustomLink(chip._item.url)],
      ]);
      return;
    }
    const items = [
      ['Add / manage links', () => {
        if (currentTabMode() !== 'custom') { store('home:tabs', 'custom'); renderTabOpts(); applyTabStrip(); }
        setSettings(true);
        showSetTab('links');
      }],
    ];
    if (walls.length > 1) items.push(['Next wallpaper', () => showWall((wallShown + 1) % walls.length, true)]);
    if (document.querySelector('.mod-card[data-type="quotes"]')) {
      items.push(['Next quote', () => document.dispatchEvent(new Event('home:next-quote'))]);
    }
    items.push(['Toggle widgets  (W)', () => setLayer(!modLayer.classList.contains('open'))]);
    items.push(['Settings', () => setSettings(true)]);
    items.push(['Help  (?)', () => toggleHelp(true)]);
    openCtx(e.clientX, e.clientY, items);
  });
  document.addEventListener('click', e => { if (!ctxEl.hidden && !ctxEl.contains(e.target)) closeCtx(); });

  /* ---------- page-wide keys: help, ctx, Alt+1..9 ---------- */

  document.addEventListener('keydown', e => {
    const inField = isTypingTarget(document.activeElement);
    // "?" alone (as the footer hint says) or Ctrl/Cmd+Shift+?
    if (e.key === '?' && !inField && !e.altKey) {
      e.preventDefault();
      toggleHelp();
      return;
    }
    if (e.key === 'Escape') {
      if (!ctxEl.hidden) { closeCtx(); return; }
      const ov = document.getElementById('help-overlay');
      if (ov && !ov.hidden) { toggleHelp(false); return; }
    }
    // Alt+1..9 opens the first links of the quick bar
    if (e.altKey && !e.ctrlKey && !e.metaKey && !inField && /^[1-9]$/.test(e.key)) {
      const flat = lastStripItems.filter(it => it.kind !== 'folder' && it.url);
      const it = flat[+e.key - 1];
      if (!it) return;
      e.preventDefault();
      openStripItem(it, undefined);
    }
  });

  /* ---------- weather details popover ---------- */

  function wxIconSvg(icon, size) {
    let path = '';
    const rows = WX_ICONS[icon] || WX_ICONS.cloud;
    for (const [y, row] of rows.entries()) {
      for (let x = 0; x < row.length; x++) if (row[x] === '#') path += `M${x} ${y}h1v1h-1z`;
    }
    return `<svg width="${size}" height="${size}" viewBox="0 0 11 11" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true"><path d="${path}"/></svg>`;
  }
  function renderWxPop() {
    const pop = document.getElementById('wx-pop');
    if (!pop) return;
    const c = wxCache();
    if (!c) {
      pop.innerHTML = '<div class="wx-pop-empty">no reading yet — weather refreshes every 10 minutes</div>';
      return;
    }
    const d = wxDescribe(c.code, c.isDay);
    const fmtT = v => v === null || v === undefined || !isFinite(v) ? '—' : `${wxTemp(v)}°`;
    const hm = iso => { try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }); } catch (e) { return '—'; } };
    const rows = [
      ['Feels like', fmtT(c.feelsC)],
      ['Humidity', c.humidity != null ? Math.round(c.humidity) + '%' : '—'],
      ['Wind', isFinite(c.wind) ? Math.round(c.wind) + ' km/h' : '—'],
      ['Sunrise', c.sunrise ? hm(c.sunrise) : '—'],
      ['Sunset', c.sunset ? hm(c.sunset) : '—'],
      ['Today', c.tMin != null && c.tMax != null ? `${fmtT(c.tMin)} – ${fmtT(c.tMax)}` : '—'],
    ];
    const hours = (c.nextHours || []).map(h => {
      const hd = wxDescribe(h.code, true);
      return `<span class="wx-h" title="${escHtml(hd.label)}">${hm(h.t)} ${wxIconSvg(hd.icon, 10)} ${fmtT(h.tempC)}</span>`;
    }).join('');
    const place = c.place || (isFinite(c.lat) ? `${c.lat}, ${c.lon}` : '');
    const detail = 'https://wttr.in/' + encodeURIComponent(place || '');
    pop.innerHTML =
      `<div class="wx-pop-head">${wxIconSvg(d.icon, 16)} <strong>${fmtT(c.tempC)}</strong> ${escHtml(d.label)}</div>` +
      `<div class="wx-pop-place">${escHtml(place || 'your location')} · updated ${hm(new Date(c.ts).toISOString())}</div>` +
      `<div class="wx-grid">${rows.map(r => `<span>${r[0]}</span><b>${r[1]}</b>`).join('')}</div>` +
      (hours ? `<div class="wx-hourly">${hours}</div>` : '') +
      `<a class="wx-link" href="${detail}" target="_blank" rel="noopener">detailed forecast ↗</a>`;
  }
  (function wireWxPop() {
    const pop = document.getElementById('wx-pop');
    if (!pop) return;
    wxSeg.style.cursor = 'pointer';
    wxSeg.addEventListener('click', e => {
      e.stopPropagation();
      const show = pop.hidden;
      pop.hidden = !show;
      if (show) renderWxPop();
    });
    document.addEventListener('click', e => {
      if (!pop.hidden && !pop.contains(e.target) && !wxSeg.contains(e.target)) pop.hidden = true;
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') pop.hidden = true; });
  })();

  /* ---------- first paint ---------- */

  renderGreeting();
  applyFont();
  applyUserCss();
  renderFavicon();
  renderTabTitle();
})();
