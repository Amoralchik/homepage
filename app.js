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
    const out = { phase: name };
    for (const key of ['skyTop', 'skyBot', 'gridDim', 'gridBright', 'sparkle', 'sunGlow']) {
      out[key] = lerpColor(a[key], b[key], k);
    }
    out.starA = lerp(a.starA, b.starA, k);
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

  return { current, palette, sunPos, moonPos };
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
  dark: {
    hue: 0, sat: 0.45, lum: 0.72,
    moonRamp: ['#12182b', '#232f4d', '#37456b', '#4e5f8a'],
    sunRamp: ['#37456b', '#4e5f8a', '#6d82ad', '#93a6cc'],
    glow: [90, 110, 160],
  },
  bright: {
    hue: 0, sat: 0.9, lum: 1.2,
    moonRamp: ['#8fa8d9', '#b0c4ea', '#d2e0fb', '#ffffff'],
    sunRamp: ['#ffd98a', '#ffe7ae', '#fff3d2', '#ffffff'],
    glow: [220, 235, 255],
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

// shifts a [r,g,b] color by the theme's hue/saturation/lightness transform
function tintRGB(c, t) {
  const [h, s, l] = rgbToHsl(c[0], c[1], c[2]);
  const nh = (h + t.hue + 360) % 360;
  const ns = Math.max(0, Math.min(100, s * t.sat));
  const nl = Math.max(0, Math.min(100, l * t.lum));
  return hslToRgb(nh, ns, nl);
}

// applies the theme transform to a whole phase palette
function tintPalette(pal, themeKey) {
  const t = THEMES[themeKey] || THEMES.classic;
  const out = { ...pal };
  for (const key of ['skyTop', 'skyBot', 'gridDim', 'gridBright', 'sparkle', 'sunGlow']) {
    out[key] = tintRGB(pal[key], t);
  }
  out.star = tintRGB([150, 175, 255], t);
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
    // base sky for every mode
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgba(pal.skyTop));
    g.addColorStop(1, rgba(pal.skyBot));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    if (bgMode === 'scene') drawScene(t);
    else drawAltMode(t, dt);
  }

  function drawScene(t) {
    // grid squares
    const half = (PITCH - SIZE) / 2;
    for (let r = 0; r < rows; r++) {
      const y = r * PITCH;
      for (let c = 0; c < cols; c++) {
        const v = o[r * cols + c];
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
      case 'grid': return drawGridPattern();
      case 'lamp': return drawLamp(t);
      case 'noise': return drawNoise(t);
      case 'particles': return drawParticles(t, dt);
      case 'retro': return drawRetro(t);
      case 'shooting': return drawShooting(t, dt);
      case 'grain': return drawGrain(t, dt);
      case 'halftone': return drawHalftone(t);
    }
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

  function drawGridPattern() {
    ctx.strokeStyle = rgba(pal.gridBright, 0.15);
    ctx.lineWidth = 1;
    const step = 44;
    ctx.beginPath();
    for (let x = step; x < W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = step; y < H; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
  }

  function drawLamp(t) {
    const flick = 0.94 + 0.06 * Math.sin(t / 260) * Math.sin(t / 97);
    const lx = W / 2, ly = -10;
    const warm = tintRGB([255, 196, 120], THEMES[themeKey]);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgba(warm, 0.26 * flick));
    g.addColorStop(0.55, rgba(warm, 0.10 * flick));
    g.addColorStop(1, rgba(warm, 0.02 * flick));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(lx - 26, ly);
    ctx.lineTo(lx + 26, ly);
    ctx.lineTo(lx + W * 0.34, H);
    ctx.lineTo(lx - W * 0.34, H);
    ctx.closePath();
    ctx.fill();
    const rg = ctx.createRadialGradient(lx, ly + 24, 0, lx, ly + 24, 130);
    rg.addColorStop(0, rgba([255, 240, 200], 0.85 * flick));
    rg.addColorStop(1, rgba(warm, 0));
    ctx.fillStyle = rg;
    ctx.fillRect(lx - 140, ly - 116, 280, 280);
  }

  function drawNoise(t) {
    const n = modeState.noise;
    if (!n) return;
    const ox = reduced ? 0 : Math.floor(Math.random() * n.width);
    const oy = reduced ? 0 : Math.floor(Math.random() * n.height);
    for (let x = -n.width; x < W + n.width; x += n.width) {
      for (let y = -n.height; y < H + n.height; y += n.height) {
        ctx.drawImage(n, x - ox, y - oy);
      }
    }
  }

  function drawParticles(t, dt) {
    for (const p of modeState.parts) {
      p.y -= (p.sp * dt) / 1000;
      p.x += Math.sin(t / 1000 + p.sw) * 0.35;
      if (p.y < -6) { p.y = H + 6; p.x = Math.random() * W; }
      if (p.x < -6) p.x = W + 6;
      if (p.x > W + 6) p.x = -6;
      ctx.fillStyle = rgba(pal.sparkle, p.a);
      ctx.fillRect(p.x, p.y, p.r * 2, p.r * 2);
    }
  }

  function drawRetro(t) {
    const hz = H * 0.44;
    const c = pal.gridBright;
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

  function drawHalftone() {
    const sample = modeState.halftone;
    if (!sample) return;
    const cell = 14;
    // bright dots mixed with the theme accent so they read on any sky
    const base = [0, 1, 2].map(i => Math.round(pal.star[i] * 0.45 + 255 * 0.55));
    const warm = pal.sunGlow;
    for (let gy = 0; gy < sample.rows; gy++) {
      for (let gx = 0; gx < sample.cols; gx++) {
        const lum = sample.data[gy * sample.cols + gx];
        if (lum < 0.03) continue;
        const r = cell * 0.46 * (0.25 + lum * 0.75);
        const cx = gx * cell + cell / 2;
        const cy = gy * cell + cell / 2;
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
    const cols = Math.ceil(W / 14) + 1;
    const rows = Math.ceil(H / 14) + 1;
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
    const d = oc.getImageData(0, 0, cols, rows).data;
    const data = new Float32Array(cols * rows);
    for (let i = 0; i < cols * rows; i++) {
      const lum = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255;
      data[i] = Math.max(0, Math.min(1, (lum - 0.02) / 0.95));
    }
    modeState.halftone = { data, cols, rows };
  }

  function buildModeExtras() {
    modeState = { meteor: null };
    if (bgMode === 'halftone') buildHalftoneSample();
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
  const VALID_BGS = ['scene', 'aurora', 'grid', 'lamp', 'noise', 'particles', 'retro', 'shooting', 'grain', 'halftone'];
  function currentBg() {
    const b = loadStored('home:bg');
    return VALID_BGS.includes(b) ? b : 'scene';
  }
  function renderBgOpts() {
    const cur = currentBg();
    for (const b of bgOpts.children) {
      b.classList.toggle('active', b.dataset.bg === cur);
    }
  }
  bgOpts.addEventListener('click', e => {
    const b = e.target.closest('button[data-bg]');
    if (!b) return;
    store('home:bg', b.dataset.bg);
    bgApi.setMode(b.dataset.bg);
    renderBgOpts();
  });
  renderBgOpts();
  bgApi.setMode(currentBg());

  // wallpaper for the halftone background (stored locally in IndexedDB)
  const wallSet = document.getElementById('wall-set');
  const wallClear = document.getElementById('wall-clear');
  const wallInput = document.getElementById('wall-input');

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

  function applyWallpaper(dataUrl) {
    if (!dataUrl) { bgApi.setWallpaper(null); return; }
    const img = new Image();
    img.onload = () => bgApi.setWallpaper(img);
    img.src = dataUrl;
  }

  wallSet.addEventListener('click', () => wallInput.click());
  wallInput.addEventListener('change', () => {
    const file = wallInput.files && wallInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      await idbSet('wallpaper', reader.result);
      applyWallpaper(reader.result);
    };
    reader.readAsDataURL(file);
    wallInput.value = '';
  });
  wallClear.addEventListener('click', async () => {
    await idbSet('wallpaper', null);
    bgApi.setWallpaper(null);
  });
  idbGet('wallpaper').then(applyWallpaper).catch(() => { });

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
    const inField = document.activeElement instanceof HTMLInputElement;
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

  function renderProvider() {
    ico.textContent = provider.letter;
    nameEl.textContent = provider.name;
    for (const li of menu.children) {
      li.setAttribute('aria-selected', li.dataset.id === provider.id ? 'true' : 'false');
    }
  }

  // build the dropdown
  const CHECK = '<svg class="check" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5 9-10" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  for (const p of PROVIDERS) {
    const li = document.createElement('li');
    li.dataset.id = p.id;
    li.setAttribute('role', 'option');
    li.innerHTML = `<span class="provider-ico">${p.letter}</span><span>${p.name}</span>${CHECK}`;
    li.addEventListener('click', () => {
      provider = p;
      try { localStorage.setItem('home:provider', p.id); } catch (e) { }
      renderProvider();
      close();
      closeSuggestions();
      input.focus();
    });
    menu.appendChild(li);
  }
  renderProvider();

  function open() { wrap.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); }
  function close() { wrap.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }
  const isOpen = () => wrap.classList.contains('open');

  btn.addEventListener('click', e => { e.stopPropagation(); isOpen() ? close() : open(); });
  document.addEventListener('click', e => { if (!wrap.contains(e.target)) close(); });

  function submit() {
    const q = input.value.trim();
    if (!q) { input.focus(); return; }
    // omnibox: URL opens directly…
    if (looksLikeUrl(q)) {
      closeSuggestions();
      location.href = normalizeUrl(q);
      return;
    }
    // …and a pure math expression shows its result card, copied for you
    const c = tryCalc(q);
    if (c) {
      suggestQuery = q;
      suggestItems = [];
      urlEntry = null;
      calcEntry = c;
      suggestActive = -1;
      searchEl.classList.add('suggest-open');
      renderSuggestions();
      copyCalc();
      return;
    }
    closeSuggestions();
    location.href = provider.url + encodeURIComponent(q);
  }

  document.getElementById('submit').addEventListener('click', submit);

  /* ---------- vanishing placeholder ---------- */

  const PLACEHOLDERS = [
    'Search the web…',
    "Try 'weather tomorrow'",
    'Paste a link — Enter opens it',
    'Ask Perplexity anything…',
    "Type 'github.com' and hit Enter",
    'Search privately with DuckDuckGo',
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
    setTimeout(phTick, 3000);
  }

  // the animated overlay takes over from the static placeholder attribute
  input.placeholder = '';
  phApply();
  phEl.style.opacity = '1';
  if (!phReduced) setTimeout(phTick, 3000);

  /* ---------- autocomplete ---------- */

  const SUGGEST_MAX = 8;
  const MAG = '<span class="mag"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="M20 20l-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>';
  const GLOBE = '<span class="mag"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><ellipse cx="12" cy="12" rx="4" ry="9" stroke="currentColor" stroke-width="2"/><path d="M3 12h18" stroke="currentColor" stroke-width="2"/></svg></span>';

  function looksLikeUrl(t) {
    if (!t || /\s/.test(t)) return false;
    const s = t.replace(/^https?:\/\//i, '');
    // host with a dot (or localhost / IP), optional port, optional path
    return /^(localhost|\d{1,3}(?:\.\d{1,3}){3}|[a-z0-9-]+(?:\.[a-z0-9-]+)+)(:\d+)?(?:[\/?#].*)?$/i.test(s);
  }

  function normalizeUrl(t) {
    const s = t.trim();
    return /^https?:\/\//i.test(s) ? s : 'https://' + s;
  }

  // safe math evaluator for the calculator row: digits and math tokens only
  function tryCalc(q) {
    let s = q.split('=')[0].trim().replace(/×/g, '*').replace(/÷/g, '/').replace(/,/g, '');
    if (!s || s.length > 60) return null;
    if (!/^[0-9+\-*/(). ^%\ssqrtpi]+$/i.test(s)) return null; // math chars only
    if (!/\d/.test(s)) return null;
    if (!/[+*/^%-]/.test(s) && !/^sqrt/i.test(s)) return null; // needs an operator
    const js = s.replace(/\^/g, '**').replace(/sqrt/ig, 'Math.sqrt').replace(/\bpi\b/ig, 'Math.PI');
    if (!/^(?:Math\.(?:sqrt|PI)|[\d+\-*/().\s])+$/.test(js)) return null;
    try {
      const v = Function('"use strict"; return (' + js + ')')();
      if (typeof v !== 'number' || !isFinite(v)) return null;
      return { expr: s, value: Math.round(v * 1e10) / 1e10 };
    } catch (e) { return null; }
  }

  let suggestItems = [], urlEntry = null, calcEntry = null, suggestActive = -1, suggestQuery = '', suggestReqId = 0, suggestTimer = 0;
  const suggestCache = new Map();

  const suggestOpenState = () => searchEl.classList.contains('suggest-open');

  function closeSuggestions() {
    clearTimeout(suggestTimer);
    searchEl.classList.remove('suggest-open');
    suggestEl.innerHTML = '';
    suggestItems = [];
    urlEntry = null;
    calcEntry = null;
    suggestActive = -1;
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

  async function requestSuggestions(q) {
    const reqId = ++suggestReqId;
    const kind = provider.suggest || 'google';
    const key = kind + '|' + q.toLowerCase();
    if (suggestCache.has(key)) { apply(q, suggestCache.get(key)); return; }

    let items = [];
    try {
      items = await fetchSuggestions(q, kind);
    } catch (err) {
      // fetch can be CORS-blocked outside the extension (file://, http preview) —
      // fall back to Google's JSONP suggest endpoint, which works from any origin
      try { items = parseSuggestions(await jsonpSuggestions(q)).slice(0, SUGGEST_MAX); } catch (err2) { items = []; }
    }
    if (suggestCache.size > 120) suggestCache.clear();
    suggestCache.set(key, items);
    if (reqId === suggestReqId) apply(q, items);

    function apply(qq, list) {
      if (input.value.trim().toLowerCase() !== qq.toLowerCase()) return;
      suggestQuery = qq;
      suggestItems = list;
      calcEntry = tryCalc(qq);
      urlEntry = looksLikeUrl(qq) ? normalizeUrl(qq) : null;
      suggestActive = -1;
      if (list.length || urlEntry || calcEntry) {
        searchEl.classList.add('suggest-open');
        renderSuggestions();
      } else {
        closeSuggestions();
      }
    }
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

  function renderSuggestions() {
    suggestEl.innerHTML = '';
    const q = suggestQuery.toLowerCase();
    const rows = [];
    if (calcEntry) rows.push({ type: 'calc', text: `${calcEntry.expr} = ${calcEntry.value}` });
    if (urlEntry) rows.push({ type: 'url', text: urlEntry });
    for (const s of suggestItems) rows.push({ type: 'sug', text: s });

    rows.forEach((row, i) => {
      const item = document.createElement('div');
      item.className = 'suggest-item';
      item.setAttribute('role', 'option');

      if (row.type === 'calc') {
        item.classList.add('calc-row');
        item.innerHTML = '<span class="mag calc-sym">=</span>';
        const text = document.createElement('span');
        text.className = 'done';
        text.textContent = row.text;
        item.appendChild(text);
        const tag = document.createElement('span');
        tag.className = 'open-tag copy-tag';
        tag.textContent = 'copy';
        item.appendChild(tag);
      } else if (row.type === 'url') {
        item.classList.add('url-row');
        item.innerHTML = GLOBE;
        const text = document.createElement('span');
        text.className = 'done';
        text.textContent = row.text;
        item.appendChild(text);
        const tag = document.createElement('span');
        tag.className = 'open-tag';
        tag.textContent = 'open link';
        item.appendChild(tag);
      } else {
        const low = row.text.toLowerCase();
        const matched = q && low.startsWith(q);
        item.innerHTML = MAG;
        const text = document.createElement('span');
        text.className = 's-text';
        if (matched) {
          const typed = document.createElement('span');
          typed.className = 'typed';
          typed.textContent = row.text.slice(0, q.length);
          text.appendChild(typed);
        }
        const done = document.createElement('span');
        done.className = 'done';
        done.textContent = matched ? row.text.slice(q.length) : row.text;
        text.appendChild(done);
        item.appendChild(text);
      }

      item.addEventListener('mousedown', e => e.preventDefault()); // keep input focus
      item.addEventListener('mouseenter', () => { suggestActive = i; renderActive(); });
      if (row.type === 'calc') item.addEventListener('click', () => copyCalc());
      else if (row.type === 'url') item.addEventListener('click', () => openUrl());
      else item.addEventListener('click', () => chooseSuggestion(row.text));
      suggestEl.appendChild(item);
    });
  }

  function allRows() {
    const rows = [];
    if (calcEntry) rows.push({ type: 'calc' });
    if (urlEntry) rows.push({ type: 'url' });
    for (const s of suggestItems) rows.push({ type: 'sug', text: s });
    return rows;
  }

  function renderActive() {
    [...suggestEl.children].forEach((el, i) => {
      el.classList.toggle('active', i === suggestActive);
      el.setAttribute('aria-selected', i === suggestActive ? 'true' : 'false');
    });
  }

  function moveActive(dir) {
    const n = suggestEl.children.length;
    if (!n) return;
    if (dir > 0) suggestActive = suggestActive >= n - 1 ? -1 : suggestActive + 1;
    else suggestActive = suggestActive <= -1 ? n - 1 : suggestActive - 1;
    const sugIdx = suggestActive - (calcEntry ? 1 : 0) - (urlEntry ? 1 : 0);
    if (suggestActive < 0) input.value = suggestQuery;
    else if (calcEntry && suggestActive === 0) input.value = calcEntry.expr + ' = ' + calcEntry.value;
    else if (urlEntry && suggestActive === (calcEntry ? 1 : 0)) input.value = urlEntry;
    else if (suggestItems[sugIdx] !== undefined) input.value = suggestItems[sugIdx];
    const len = input.value.length;
    input.setSelectionRange(len, len);
    renderActive();
  }

  function chooseSuggestion(s) {
    // a picked suggestion always searches, even if it looks like a domain
    input.value = s;
    closeSuggestions();
    const q = input.value.trim();
    if (!q) return;
    location.href = provider.url + encodeURIComponent(q);
  }

  function openUrl() {
    input.value = urlEntry;
    submit();
  }

  function copyCalc() {
    copyText(String(calcEntry.value), () => {
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

  input.addEventListener('input', () => {
    updatePhVisibility();
    clearTimeout(suggestTimer);
    const q = input.value.trim();
    if (q.length < 2) { closeSuggestions(); return; }
    // instant local rows — the calculator and URL opening need no network
    suggestQuery = q;
    suggestItems = [];
    calcEntry = tryCalc(q);
    urlEntry = looksLikeUrl(q) ? normalizeUrl(q) : null;
    suggestActive = -1;
    if (calcEntry || urlEntry) {
      searchEl.classList.add('suggest-open');
      renderSuggestions();
    }
    suggestTimer = setTimeout(() => requestSuggestions(q), 130);
  });

  document.addEventListener('mousedown', e => {
    if (!searchEl.contains(e.target)) closeSuggestions();
  });

  input.addEventListener('keydown', e => {
    if (suggestOpenState()) {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveActive(1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); moveActive(-1); return; }
      if (e.key === 'Enter' && suggestActive >= 0) {
        e.preventDefault();
        if (calcEntry && suggestActive === 0) copyCalc();
        else if (urlEntry && suggestActive === (calcEntry ? 1 : 0)) openUrl();
        else {
          const s = suggestItems[suggestActive - (calcEntry ? 1 : 0) - (urlEntry ? 1 : 0)];
          if (s) chooseSuggestion(s);
        }
        return;
      }
      if (e.key === 'Escape') { closeSuggestions(); return; }
    }
    if (e.key === 'Enter') submit();
    if (e.key === 'Escape') {
      if (isOpen()) close();
      else if (suggestOpenState()) closeSuggestions();
      else if (input.value) { input.value = ''; closeSuggestions(); updatePhVisibility(); }
      else input.blur();
    }
  });

  // global shortcuts: "/" or Ctrl/Cmd+K focuses the box (not while typing
  // elsewhere, and not when the input is hidden in settings)
  document.addEventListener('keydown', e => {
    const inField = document.activeElement instanceof HTMLInputElement;
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
  function tick() {
    const now = new Date();
    clock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    date.textContent = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  }
  tick();
  setInterval(tick, 1000);
})();
