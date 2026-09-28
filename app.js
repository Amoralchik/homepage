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
    moon = {
      img: pixelDisc(['#24348c', '#4160c8', '#7492f0', '#b3c6ff'], [[10, 9, 2.6], [20, 12, 2.2], [14, 19, 1.8], [22, 20, 1.4], [9, 15, 1.5], [18, 6, 1.3]]),
      size: 22 * PITCH,
    };
    sun = {
      img: pixelDisc(['#ff8f2e', '#ffb03a', '#ffd45e', '#fff2c8'], null),
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

  function draw(t) {
    // sky gradient
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgba(pal.skyTop));
    g.addColorStop(1, rgba(pal.skyBot));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

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
        ctx.fillStyle = `rgba(150,175,255,${a.toFixed(3)})`;
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
    for (const s of sparkles) {
      const a = s.base + (1 - s.base) * Math.pow(Math.max(0, Math.sin(t / 1000 * s.w + s.ph)), 4);
      ctx.fillStyle = rgba(pal.sparkle, a);
      ctx.fillRect(s.x + half, s.y + half, SIZE, SIZE);
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
      drawGlow(mx, my, moon.size, [99, 132, 255], 0.12);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(moon.img, mx - moon.size / 2, my - moon.size / 2, moon.size, moon.size);
    }
  }

  let raf = null, last = 0;
  function frame(now) {
    const dt = Math.min(now - last, 100);
    last = now;
    step(dt);
    draw(now);
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

  function forcedPhase() {
    // URL preview wins, then a phase frozen in settings, then the real clock
    if (CONFIG.forcePhase && VALID_PHASES.includes(CONFIG.forcePhase)) return CONFIG.forcePhase;
    try {
      const p = localStorage.getItem('home:phase');
      if (p && VALID_PHASES.includes(p)) return p;
    } catch (e) { }
    return null;
  }

  function applyDayCycle() {
    const now = new Date();
    const forced = forcedPhase();
    const info = DayCycle.current(now, forced);
    if (document.body.dataset.phase !== info.name) {
      document.body.dataset.phase = info.name;
    }
    bgApi.setPalette(DayCycle.palette(now, forced), DayCycle.sunPos(now, forced), DayCycle.moonPos(now, forced));
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
    closeSuggestions();
    const q = input.value.trim();
    if (!q) { input.focus(); return; }
    // omnibox behavior: a URL goes straight to the site, anything else searches
    if (looksLikeUrl(q)) { location.href = normalizeUrl(q); return; }
    location.href = provider.url + encodeURIComponent(q);
  }

  document.getElementById('submit').addEventListener('click', submit);

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

  let suggestItems = [], urlEntry = null, suggestActive = -1, suggestQuery = '', suggestReqId = 0, suggestTimer = 0;
  const suggestCache = new Map();

  const suggestOpenState = () => searchEl.classList.contains('suggest-open');

  function closeSuggestions() {
    clearTimeout(suggestTimer);
    searchEl.classList.remove('suggest-open');
    suggestEl.innerHTML = '';
    suggestItems = [];
    urlEntry = null;
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
      urlEntry = looksLikeUrl(qq) ? normalizeUrl(qq) : null;
      suggestActive = -1;
      if (list.length || urlEntry) {
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
    if (urlEntry) rows.push({ type: 'url', text: urlEntry });
    for (const s of suggestItems) rows.push({ type: 'sug', text: s });

    rows.forEach((row, i) => {
      const item = document.createElement('div');
      item.className = 'suggest-item';
      item.setAttribute('role', 'option');

      if (row.type === 'url') {
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
      item.addEventListener('click', () => (row.type === 'url' ? openUrl() : chooseSuggestion(row.text)));
      suggestEl.appendChild(item);
    });
  }

  function allRows() {
    const rows = [];
    if (urlEntry) rows.push(urlEntry);
    rows.push(...suggestItems);
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
    input.value = suggestActive >= 0 ? allRows()[suggestActive] : suggestQuery;
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

  input.addEventListener('input', () => {
    clearTimeout(suggestTimer);
    const q = input.value.trim();
    if (q.length < 2) { closeSuggestions(); return; }
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
        if (urlEntry && suggestActive === 0) openUrl();
        else chooseSuggestion(suggestItems[suggestActive - (urlEntry ? 1 : 0)]);
        return;
      }
      if (e.key === 'Escape') { closeSuggestions(); return; }
    }
    if (e.key === 'Enter') submit();
    if (e.key === 'Escape') {
      if (isOpen()) close();
      else if (input.value) { input.value = ''; closeSuggestions(); }
      else input.blur();
    }
  });

  // global shortcuts: "/" or Ctrl/Cmd+K focuses the box (not while typing elsewhere)
  document.addEventListener('keydown', e => {
    const inField = document.activeElement instanceof HTMLInputElement;
    if (e.key === '/' && document.activeElement !== input && !inField) {
      e.preventDefault();
      input.focus();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
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
