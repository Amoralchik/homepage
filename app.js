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
};

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
  let dotSize = 14;

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
      case 'photo': return drawPhoto(t);
    }
  }

  /* photo — the wallpaper itself, cover-fit with a slow Ken Burns drift and a
     phase-tinted veil so it still follows the day/night cycle and the theme */
  const PHOTO_VEIL = { morning: 0.16, day: 0.08, evening: 0.34, night: 0.5 };

  function buildPhoto() {
    const src = wallpaperImg;
    if (!src || !src.width) { modeState.photo = null; return; }
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const OVER = 1.06; // headroom for the drift
    const c = document.createElement('canvas');
    c.width = Math.round(W * OVER * dpr);
    c.height = Math.round(H * OVER * dpr);
    const oc = c.getContext('2d');
    const scale = Math.max(c.width / src.width, c.height / src.height);
    const dw = src.width * scale, dh = src.height * scale;
    oc.imageSmoothingQuality = 'high';
    oc.drawImage(src, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
    modeState.photo = { img: c, over: OVER };
  }

  function drawPhoto(t) {
    const p = modeState.photo;
    const pw = W * p.over, ph = H * p.over;
    const drift = reduced ? 0 : 1;
    const ox = (pw - W) / 2 * (1 + 0.9 * Math.sin(t / 23000) * drift);
    const oy = (ph - H) / 2 * (1 + 0.9 * Math.sin(t / 31000 + 1.3) * drift);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(p.img, -ox, -oy, pw, ph);
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

  function buildHalftoneSample() {
    const src = wallpaperImg;
    const cols = Math.ceil(W / dotSize) + 1;
    const rows = Math.ceil(H / dotSize) + 1;
    const off = document.createElement('canvas');
    off.width = cols;
    off.height = rows;
    const oc = off.getContext('2d');
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
      buildModeExtras();
      if (reduced) draw(0);
    },
    setWallpaper(img) {
      wallpaperImg = img;
      if (bgMode === 'halftone') buildHalftoneSample();
      if (bgMode === 'photo') buildPhoto();
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
    provider = PROVIDERS.find(p => p.id === saved) || provider;
  } catch (e) { /* storage unavailable */ }

  /* ---------- day/night theming ---------- */

  const VALID_PHASES = ['morning', 'day', 'evening', 'night'];
  const DEFAULT_SHOW = { celestial: true, stars: true, input: true, time: true, help: true, pulse: true };

  function forcedPhase() {
    // URL preview wins, then a phase frozen in settings, then the real clock
    if (CONFIG.forcePhase && VALID_PHASES.includes(CONFIG.forcePhase)) return CONFIG.forcePhase;
    try {
      const p = localStorage.getItem('home:phase');
      if (p && VALID_PHASES.includes(p)) return p;
    } catch (e) { }
    return null;
  }

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
  }
  applyDayCycle();
  setInterval(applyDayCycle, 30 * 1000);

  /* ---------- settings ---------- */

  const settingsBtn = document.getElementById('settings-btn');
  const settingsEl = document.getElementById('settings');
  const labelInput = document.getElementById('set-label');
  const pillLabel = document.getElementById('pill-label');
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

  // pill text
  const savedLabel = (loadStored('home:label') || '').trim() || 'home';
  pillLabel.textContent = savedLabel;
  labelInput.value = savedLabel === 'home' ? '' : savedLabel;
  labelInput.addEventListener('input', () => {
    const v = labelInput.value.trim() || 'home';
    pillLabel.textContent = v;
    store('home:label', v);
  });

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
    applyDayCycle();
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
  const bgOpts = document.getElementById('bg-opts');
  const VALID_BGS = ['scene', 'aurora', 'grid', 'lamp', 'noise', 'particles', 'retro', 'shooting', 'grain', 'halftone', 'photo'];
  const WALL_BGS = ['halftone', 'photo']; // modes that draw the wallpaper
  function currentBg() {
    const b = loadStored('home:bg');
    return VALID_BGS.includes(b) ? b : 'scene';
  }
  function renderBgOpts() {
    const cur = currentBg();
    for (const b of bgOpts.children) {
      b.classList.toggle('active', b.dataset.bg === cur);
    }
    // only show the knobs that do something in the current mode
    document.getElementById('wall-row').hidden = !WALL_BGS.includes(cur);
    document.getElementById('dots-row').hidden = cur !== 'halftone';
  }
  function setBg(mode) {
    store('home:bg', mode);
    bgApi.setMode(mode);
    renderBgOpts();
  }
  bgOpts.addEventListener('click', e => {
    const b = e.target.closest('button[data-bg]');
    if (!b) return;
    setBg(b.dataset.bg);
  });
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

  // resolves true once the image is decoded and handed to the background
  function applyWallpaper(src) {
    if (!src) { bgApi.setWallpaper(null); return Promise.resolve(false); }
    return new Promise(resolve => {
      const img = new Image();
      if (!src.startsWith('data:')) img.crossOrigin = 'anonymous';
      img.onload = () => { bgApi.setWallpaper(img); resolve(true); };
      img.onerror = () => resolve(false);
      img.src = src;
    });
  }

  // a new wallpaper on a mode that ignores it would look like nothing
  // happened — hop to Photo so the pick is visible right away
  function showWallpaperMode() {
    if (!WALL_BGS.includes(currentBg())) setBg('photo');
  }

  async function saveWallpaper(src) {
    const ok = await applyWallpaper(src);
    if (!ok) {
      wallUrl.value = '';
      wallUrl.placeholder = "couldn't load that image — try another";
      return;
    }
    try { await idbSet('wallpaper', src); } catch (e) { }
    wallUrl.placeholder = 'paste image URL…';
    showWallpaperMode();
    setWallModal(false);
  }

  async function clearWallpaper() {
    try { await idbSet('wallpaper', null); } catch (e) { }
    bgApi.setWallpaper(null);
  }

  function setWallModal(open) {
    wallModal.classList.toggle('open', open);
    wallModal.setAttribute('aria-hidden', String(!open));
  }
  wallOpenBtn.addEventListener('click', () => setWallModal(true));
  document.getElementById('wall-close').addEventListener('click', () => setWallModal(false));
  wallModal.addEventListener('click', e => { if (e.target === wallModal) setWallModal(false); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && wallModal.classList.contains('open')) setWallModal(false);
  });

  function loadWallFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => saveWallpaper(reader.result);
    reader.readAsDataURL(file);
  }

  ['dragenter', 'dragover'].forEach(ev =>
    wallDrop.addEventListener(ev, e => { e.preventDefault(); wallDrop.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(ev =>
    wallDrop.addEventListener(ev, e => { e.preventDefault(); wallDrop.classList.remove('drag'); }));
  wallDrop.addEventListener('drop', e => loadWallFile(e.dataTransfer.files && e.dataTransfer.files[0]));
  wallBrowse.addEventListener('click', () => wallInput.click());
  wallInput.addEventListener('change', () => loadWallFile(wallInput.files && wallInput.files[0]));

  function loadWallUrl() {
    const u = wallUrl.value.trim();
    if (!u || !/^(https?:|data:image\/)/i.test(u)) return;
    wallUrl.value = '';
    saveWallpaper(u); // URLs persist too (previously lost on the next tab)
  }
  document.getElementById('wall-url-load').addEventListener('click', loadWallUrl);
  wallUrl.addEventListener('keydown', e => { if (e.key === 'Enter') loadWallUrl(); });

  wallClearBtn.addEventListener('click', clearWallpaper);
  wallClearModalBtn.addEventListener('click', () => { clearWallpaper(); setWallModal(false); });
  idbGet('wallpaper').then(applyWallpaper).catch(() => { });

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
  const VALID_TAB_MODES = ['off', 'top', 'recent', 'bookmarks'];
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

  async function stripItems(mode) {
    const api = tabsApi();
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
  async function refreshTabStrip(force) {
    if (document.body.classList.contains('no-tabs')) return;
    if (stripMenu) return; // don't yank an open menu from under the cursor
    let items = [];
    try { items = await stripItems(currentTabMode()); } catch (e) { items = []; }
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
    document.body.classList.toggle('no-tabs', mode === 'off' || !tabsApi());
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
    if (!confirm('Reset all Home settings, search history and the wallpaper?')) return;
    try {
      Object.keys(localStorage).filter(k => k.startsWith('home:')).forEach(k => localStorage.removeItem(k));
    } catch (e) { }
    try { await idbSet('wallpaper', null); } catch (e) { }
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
  document.addEventListener('click', e => {
    if (!settingsEl.contains(e.target) && !settingsBtn.contains(e.target)) setSettings(false);
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
    head.appendChild(name);
    head.appendChild(rm);
    card.appendChild(head);
    card.dataset.type = type;

    const body = document.createElement('div');
    body.className = 'mod-card-body';
    card.appendChild(body);
    modBody.appendChild(card);

    widgetCleanups.set(id, def.mount ? def.mount(body) : null);

    if (!restore) {
      const list = loadWidgets();
      list.push(type);
      saveWidgets(list);
      renderAddMenu();
      renderEmptyHint();
    }
  }

  function removeWidget(id, type) {
    const card = modBody.querySelector(`.mod-card[data-idx="${id}"]`);
    if (card) card.remove();
    widgetCleanups.get(id)?.();
    widgetCleanups.delete(id);
    const list = loadWidgets();
    const pos = list.indexOf(type);
    if (pos !== -1) list.splice(pos, 1);
    saveWidgets(list);
    renderAddMenu();
    renderEmptyHint();
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

  // personal local mods: a gitignored mods.js registers extra widgets here
  // (missing file is normal — the script tag silently removes itself)
  window.HOME_MODS = {
    register(id, def) {
      if (!id || !def || typeof def.mount !== 'function' || WIDGETS[id]) return;
      WIDGETS[id] = { name: def.name || id, blurb: def.blurb || '', mount: def.mount };
      const mounted = [...modBody.querySelectorAll('.mod-card')].map(c => c.dataset.type);
      loadWidgets().forEach(t => {
        if (t === id && !mounted.includes(id)) addWidget(id, true);
      });
      renderAddMenu();
      renderEmptyHint();
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
  for (const p of PROVIDERS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.engine = p.id;
    b.textContent = p.name;
    engineOpts.appendChild(b);
  }
  engineOpts.addEventListener('click', e => {
    const b = e.target.closest('button[data-engine]');
    if (b) setProvider(PROVIDERS.find(p => p.id === b.dataset.engine), false);
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
  for (const p of PROVIDERS) {
    const li = document.createElement('li');
    li.dataset.id = p.id;
    li.setAttribute('role', 'option');
    li.innerHTML = `<span class="provider-ico">${p.letter}</span><span>${p.name}</span><span class="menu-bang">!${PROVIDER_BANG[p.id] || ''}</span>${CHECK}`;
    li.addEventListener('click', () => setProvider(p));
    menu.appendChild(li);
  }

  let menuIdx = -1;
  function renderMenuActive() {
    [...menu.children].forEach((li, i) => li.classList.toggle('active', i === menuIdx));
  }
  function open() {
    wrap.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    menuIdx = PROVIDERS.indexOf(provider);
    renderMenuActive();
  }
  function close() { wrap.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }
  const isOpen = () => wrap.classList.contains('open');

  btn.addEventListener('click', e => { e.stopPropagation(); isOpen() ? close() : open(); });
  btn.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen()) { open(); return; }
      const n = PROVIDERS.length;
      menuIdx = (menuIdx + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
      renderMenuActive();
    } else if ((e.key === 'Enter' || e.key === ' ') && isOpen() && menuIdx >= 0) {
      e.preventDefault();
      setProvider(PROVIDERS[menuIdx]);
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
    navigate(provider.url + encodeURIComponent(q), mode);
  }

  // a picked suggestion always searches (even if it looks like a domain),
  // through the bang that was active when it was offered
  function searchTerm(s, bang, mode) {
    remember(bang ? `!${bang.key} ${s}` : s);
    navigate(bang ? bangUrl(bang, s) : provider.url + encodeURIComponent(s), mode);
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
      const n = PROVIDERS.length;
      const i = PROVIDERS.indexOf(provider);
      setProvider(PROVIDERS[(i + (e.key === 'ArrowDown' ? 1 : -1) + n) % n]);
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

  // clock pill
  const clock = document.getElementById('clock');
  const date = document.getElementById('date');
  const clockOpts = document.getElementById('clock-opts');
  const clockFmt = () => { const v = loadStored('home:clock'); return v === '12' || v === 'sec' ? v : '24'; };
  function tick() {
    const now = new Date();
    const fmt = clockFmt();
    clock.textContent = fmt === '12'
      ? now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })
      : now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false, ...(fmt === 'sec' ? { second: '2-digit' } : {}) });
    date.textContent = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function renderClockOpts() {
    for (const b of clockOpts.children) b.classList.toggle('active', b.dataset.clock === clockFmt());
  }
  clockOpts.addEventListener('click', e => {
    const b = e.target.closest('button[data-clock]');
    if (!b) return;
    store('home:clock', b.dataset.clock);
    renderClockOpts();
    tick();
  });
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
    wxSeg.title = title;
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
        '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day&timezone=auto';
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) return null;
      const j = await res.json();
      const cur = j && j.current;
      if (!cur || !isFinite(cur.temperature_2m)) return null;
      const prev = wxCache();
      return {
        ts: Date.now(),
        tempC: cur.temperature_2m,
        feelsC: isFinite(cur.apparent_temperature) ? cur.apparent_temperature : cur.temperature_2m,
        wind: isFinite(cur.wind_speed_10m) ? cur.wind_speed_10m : 0,
        code: cur.weather_code || 0,
        isDay: !!cur.is_day,
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
})();
