/*!
 * cyl-core.js — core library for the First Estimate of Takeoff Weight module (Module 3 of Conceptual Aircraft Design; the
 * same framework as the dynamics modules (Cylindrical Coordinates, Angular Momentum, …); only the page registry, storage namespace, brand, colors and
 * TeX macros differ).
 * Classic script (no modules). Attaches ONE global: window.CYL. The file is split into sections (Errors,
 * Page registry, Persistence, Progress, Theme, Colors, KaTeX, Formatting, Math, DOM + UI helpers, Page shell,
 * Ready); every public function is documented where it is defined.
 * Load in <head> after KaTeX (katex.min.js + auto-render.min.js) so the theme is applied
 * before first paint; the page shell is injected on DOMContentLoaded.
 */
(function (window, document) {
  'use strict';
  if (window.CYL && window.CYL.version) return; // loaded twice: keep the first instance

  var CYL = {};
  var TAU = Math.PI * 2;
  var MINUS = '\u2212';
  var hasOwn = Object.prototype.hasOwnProperty;

  CYL.version = '1.0.0';

  /* ======================================================================
     Errors
     ====================================================================== */
  CYL._errors = [];

  function errText(e) {
    if (e == null) return String(e);
    if (typeof e === 'string') return e;
    if (e instanceof Error) return e.name + ': ' + e.message;
    try { return JSON.stringify(e); } catch (x) { return String(e); }
  }

  /** Log an error (console.error) and record it in CYL._errors (read by the QA harness). */
  CYL.error = function () {
    var parts = [];
    var errs = [];
    for (var i = 0; i < arguments.length; i++) {
      var a = arguments[i];
      parts.push(errText(a));
      if (a instanceof Error) errs.push(a);
    }
    var text = parts.join(' ');
    CYL._errors.push(text);
    try {
      if (window.console && console.error) console.error.apply(console, ['[CYL] ' + text].concat(errs));
    } catch (x) { /* ignore */ }
    return text;
  };

  function safeCall(fn, self, args, label) {
    try {
      return fn.apply(self, args || []);
    } catch (e) {
      CYL.error((label || 'callback') + ' failed:', e);
    }
    return undefined;
  }

  /* ======================================================================
     Page registry: titles, order, lesson minutes and sidebar groups (drives the sidebar and prev/next)
     ====================================================================== */
  var INCLUDE_INSTRUCTOR_GUIDE = false;
  CYL.instructorGuide = INCLUDE_INSTRUCTOR_GUIDE;

  function pg(id, num, title, href, minutes, group, tag) {
    return Object.freeze({ id: id, num: num, title: title, href: href, minutes: minutes, group: group, tag: tag || null });
  }
  CYL.PAGES = Object.freeze([
    pg('home', null, 'Module Home', 'index.html', null, 'start'),
    pg('l01', 1, 'Sizing from a Conceptual Sketch', 'lessons/01-sizing-equation.html', 35, 'lessons'),
    pg('l02', 2, 'The Empty-Weight Fraction', 'lessons/02-empty-weight.html', 40, 'lessons'),
    pg('l03', 3, 'Estimating L/D from the Sketch', 'lessons/03-lift-to-drag.html', 40, 'lessons'),
    pg('l04', 4, 'Engines and Fuel Consumption', 'lessons/04-fuel-consumption.html', 35, 'lessons'),
    pg('l05', 5, 'Mission Segment Weight Fractions', 'lessons/05-fuel-fraction.html', 40, 'lessons'),
    pg('l06', 6, 'Closing the Sizing Loop', 'lessons/06-closing-the-loop.html', 40, 'lessons'),
    pg('l07', 7, 'Sensitivities and Trade Studies', 'lessons/07-sensitivities.html', 35, 'lessons'),
    pg('practice', null, 'Practice Lab', 'practice/practice-lab.html', null, 'practice'),
    pg('quiz', null, 'Self-Check Quiz', 'practice/quiz.html', 35, 'practice'),
    pg('worksheet', null, 'Printable Worksheet', 'practice/worksheet.html', null, 'practice'),
    pg('sizer', null, 'Sizing Calculator', 'tools/sizing-calculator.html', null, 'tools'),
    pg('cheatsheet', null, 'Formula Sheet', 'reference/cheat-sheet.html', null, 'reference'),
    pg('glossary', null, 'Glossary', 'reference/glossary.html', null, 'reference')
  ].filter(function (p) { return INCLUDE_INSTRUCTOR_GUIDE || p.group !== 'instructor'; }));
  /** Sidebar groups, in display order. */
  CYL.GROUPS = Object.freeze([
    Object.freeze({ id: 'start', label: 'Start' }),
    Object.freeze({ id: 'lessons', label: 'Lessons' }),
    Object.freeze({ id: 'practice', label: 'Practice' }),
    Object.freeze({ id: 'tools', label: 'Tools' }),
    Object.freeze({ id: 'reference', label: 'Reference' })
  ]);

  function findPage(id) {
    if (!id) return null;
    for (var i = 0; i < CYL.PAGES.length; i++) if (CYL.PAGES[i].id === id) return CYL.PAGES[i];
    return null;
  }
  function bodyAttr(name) { return document.body ? document.body.getAttribute(name) : null; }

  // CYL.page / CYL.root read <body> lazily (this script runs in <head>, before <body> exists).
  Object.defineProperty(CYL, 'page', {
    enumerable: true,
    get: function () { return findPage(bodyAttr('data-page')); }
  });
  Object.defineProperty(CYL, 'root', {
    enumerable: true,
    get: function () {
      var r = bodyAttr('data-root');
      if (r == null) return '.';
      r = String(r).trim().replace(/\/+$/, '');
      return r === '' ? '.' : r;
    }
  });

  /** Relative URL from the current page to a path given relative to the package root. */
  CYL.url = function (hrefFromRoot) {
    var href = String(hrefFromRoot == null ? '' : hrefFromRoot);
    if (/^([a-z][a-z0-9+.-]*:|#|\/)/i.test(href)) return href;
    href = href.replace(/^(\.\/)+/, '');
    var root = CYL.root;
    if (root === '.') return href || './';
    return root + '/' + href;
  };

  /* ======================================================================
     Persistence (never throws)
     ====================================================================== */
  var NS = 'acd03:';   // storage namespace: keeps this module's progress apart from sibling modules
  var memStore = Object.create(null);
  var lsHandle; // undefined = not probed yet, null = unavailable

  function ls() {
    if (lsHandle !== undefined) return lsHandle;
    try {
      var s = window.localStorage;
      var k = NS + '__probe__';
      s.setItem(k, '1');
      s.removeItem(k);
      lsHandle = s;
    } catch (e) {
      lsHandle = null;
    }
    return lsHandle;
  }
  function jsonClone(v) {
    try { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); } catch (e) { return v; }
  }

  CYL.store = {
    get: function (key, fallback) {
      var s = ls();
      if (s) {
        var raw = null;
        try { raw = s.getItem(NS + key); } catch (e) { raw = null; }
        if (raw != null) {
          try {
            var v = JSON.parse(raw);
            return v == null ? fallback : v;
          } catch (e) { return fallback; }
        }
      }
      if (hasOwn.call(memStore, key)) {
        var m = jsonClone(memStore[key]);
        return m == null ? fallback : m;
      }
      return fallback;
    },
    set: function (key, value) {
      if (value === undefined) { CYL.store.remove(key); return true; }
      memStore[key] = jsonClone(value);
      var s = ls();
      if (!s) return false;
      try { s.setItem(NS + key, JSON.stringify(value)); return true; } catch (e) { return false; }
    },
    remove: function (key) {
      delete memStore[key];
      var s = ls();
      if (!s) return;
      try { s.removeItem(NS + key); } catch (e) { /* ignore */ }
    },
    /** true if values survive a page reload (localStorage usable). */
    available: function () { return !!ls(); }
  };

  /* ======================================================================
     Progress
     ====================================================================== */
  var progressListeners = [];

  function readProgress() {
    var p = CYL.store.get('progress', null);
    var out = {};
    if (p && typeof p === 'object' && !Array.isArray(p)) {
      Object.keys(p).forEach(function (k) { if (p[k]) out[k] = true; });
    }
    return out;
  }
  function emitProgress(id, done) {
    var all = readProgress();
    progressListeners.slice().forEach(function (fn) { safeCall(fn, null, [id, done, all], 'progress.onChange listener'); });
  }

  CYL.progress = {
    all: readProgress,
    isComplete: function (id) { return !!readProgress()[id]; },
    setComplete: function (id, done) {
      if (!id) return;
      done = done === undefined ? true : !!done;
      var p = readProgress();
      if (!!p[id] === done) return;
      if (done) p[id] = true; else delete p[id];
      CYL.store.set('progress', p);
      emitProgress(id, done);
    },
    /** fn(id, isComplete, all) — also fires when another tab changes progress (id = null). */
    onChange: function (fn) {
      if (typeof fn !== 'function') return function () {};
      progressListeners.push(fn);
      return function () {
        var i = progressListeners.indexOf(fn);
        if (i >= 0) progressListeners.splice(i, 1);
      };
    }
  };

  /* ======================================================================
     Theme — applied immediately (this script runs in <head>) to avoid a flash
     ====================================================================== */
  var themeListeners = [];
  var currentTheme = null;
  var mqlDark = null;
  try { mqlDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null; } catch (e) { mqlDark = null; }

  function osTheme() { return mqlDark && mqlDark.matches ? 'dark' : 'light'; }
  function themePref() {
    var p = CYL.store.get('theme', 'auto');
    return p === 'light' || p === 'dark' ? p : 'auto';
  }
  function applyTheme() {
    var pref = themePref();
    var t = pref === 'auto' ? osTheme() : pref;
    var root = document.documentElement;
    if (root.getAttribute('data-theme') !== t) root.setAttribute('data-theme', t);
    var changed = currentTheme !== null && t !== currentTheme;
    currentTheme = t;
    syncThemeButton();
    if (changed) {
      colorCache = null;
      themeListeners.slice().forEach(function (fn) { safeCall(fn, null, [t], 'theme.onChange listener'); });
    }
  }

  CYL.theme = {
    get: function () { return currentTheme; },
    /** 'light' | 'dark' | 'auto' (follow the OS). Persisted. */
    set: function (mode) {
      if (mode === 'light' || mode === 'dark') CYL.store.set('theme', mode);
      else CYL.store.remove('theme');
      applyTheme();
    },
    /** fn(theme) — fires when the effective theme changes (toggle, set(), or OS change in auto mode). */
    onChange: function (fn) {
      if (typeof fn !== 'function') return function () {};
      themeListeners.push(fn);
      return function () {
        var i = themeListeners.indexOf(fn);
        if (i >= 0) themeListeners.splice(i, 1);
      };
    },
    /** The stored preference: 'light' | 'dark' | 'auto'. */
    preference: themePref
  };

  function onOsThemeChange() { if (themePref() === 'auto') applyTheme(); }
  if (mqlDark) {
    if (mqlDark.addEventListener) mqlDark.addEventListener('change', onOsThemeChange);
    else if (mqlDark.addListener) mqlDark.addListener(onOsThemeChange);
  }
  window.addEventListener('storage', function (e) {
    if (!e || !e.key) return;
    if (e.key === NS + 'theme') applyTheme();
    else if (e.key === NS + 'progress') emitProgress(null, null);
  });

  /* ======================================================================
     Colors — resolve CSS custom properties to hex for the current theme
     ====================================================================== */
  var COLOR_VARS = {
    bg: '--bg', bgElev: '--bg-elev', bgSunken: '--bg-sunken',
    ink: '--ink', inkMuted: '--ink-muted', inkFaint: '--ink-faint', muted: '--ink-muted',
    line: '--line', accent: '--accent', accentInk: '--accent-ink',
    r: '--c-r', t: '--c-t', n: '--c-n', z: '--c-z', x: '--c-x', y: '--c-y', v: '--c-v',
    axis: '--c-axis', grid: '--c-grid', point: '--c-point', surface: '--c-surface',
    good: '--c-good', bad: '--c-bad', warn: '--c-warn', vizBg: '--viz-bg'
  };
  // Used only if module.css failed to load (keeps 3D/2D figures legible). Mirrors module.css.
  var FALLBACK_COLORS = {
    light: {
      bg: '#f6f7f9', bgElev: '#ffffff', bgSunken: '#eef1f5', ink: '#18212b', inkMuted: '#556270',
      inkFaint: '#66727f', muted: '#556270', line: '#dde2e8', accent: '#0b6b86', accentInk: '#ffffff',
      r: '#c2410c', t: '#6d44e0', n: '#c2410c', z: '#1769bd', x: '#c2410c', y: '#6d44e0', v: '#b8327a', axis: '#3a4450',
      grid: '#cfd6de', point: '#111820', surface: '#8894a3', good: '#23793a', bad: '#c92a2a',
      warn: '#9a5100', vizBg: '#fbfcfd'
    },
    dark: {
      bg: '#0e1318', bgElev: '#161c23', bgSunken: '#1d242c', ink: '#e5eaf0', inkMuted: '#9ba7b4',
      inkFaint: '#7f8b98', muted: '#9ba7b4', line: '#2a333d', accent: '#4fc0dc', accentInk: '#062530',
      r: '#ff8a4c', t: '#a98bff', n: '#ff8a4c', z: '#5eaaff', x: '#ff8a4c', y: '#a98bff', v: '#ff7ab8', axis: '#b3bdc8',
      grid: '#2e3945', point: '#f3f6f9', surface: '#8d99a8', good: '#5cc26f', bad: '#ff6b6b',
      warn: '#ffb454', vizBg: '#11171d'
    }
  };
  var colorCache = null;
  var colorCacheTheme = null;
  var colorProbe = null;

  function hex2(n) { var h = Math.max(0, Math.min(255, Math.round(n))).toString(16); return h.length < 2 ? '0' + h : h; }
  function colorToHex(str) {
    if (!str) return null;
    var s = String(str).trim().toLowerCase();
    var m = /^#([0-9a-f]{3,8})$/.exec(s);
    if (m) {
      var h = m[1];
      if (h.length === 3 || h.length === 4) return '#' + h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      if (h.length === 6 || h.length === 8) return '#' + h.slice(0, 6);
      return null;
    }
    m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(s);
    if (m) return '#' + hex2(+m[1]) + hex2(+m[2]) + hex2(+m[3]);
    m = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(s);
    if (m) return '#' + hex2(m[1] * 255) + hex2(m[2] * 255) + hex2(m[3] * 255);
    return null;
  }
  function resolveColor(raw) {
    var hex = colorToHex(raw);
    if (hex) return hex;
    // Named colors, hsl(), etc.: let the browser compute them.
    try {
      if (!colorProbe) {
        colorProbe = document.createElement('span');
        colorProbe.setAttribute('aria-hidden', 'true');
        colorProbe.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none';
      }
      var host = document.body || document.documentElement;
      host.appendChild(colorProbe);
      colorProbe.style.color = '';
      colorProbe.style.color = raw;
      hex = colorToHex(getComputedStyle(colorProbe).color);
      host.removeChild(colorProbe);
      if (hex) return hex;
      // Last resort: canvas normalization.
      var ctx = document.createElement('canvas').getContext('2d');
      if (ctx) { ctx.fillStyle = '#000'; ctx.fillStyle = raw; return colorToHex(ctx.fillStyle); }
    } catch (e) { /* ignore */ }
    return null;
  }

  /** Resolved hex colors for the CURRENT theme: {bg, bgElev, ink, inkMuted, line, accent, r, t, z, x, y,
   *  axis, grid, point, surface, good, bad, warn, vizBg} (+ bgSunken, inkFaint, muted, accentInk). */
  CYL.colors = function () {
    if (colorCache && colorCacheTheme === currentTheme) return Object.assign({}, colorCache);
    var out = {};
    var complete = true;
    var fb = FALLBACK_COLORS[currentTheme] || FALLBACK_COLORS.light;
    var cs = null;
    try { cs = getComputedStyle(document.documentElement); } catch (e) { cs = null; }
    Object.keys(COLOR_VARS).forEach(function (k) {
      var raw = cs ? cs.getPropertyValue(COLOR_VARS[k]).trim() : '';
      var hex = raw ? resolveColor(raw) : null;
      if (!hex) { hex = fb[k]; complete = false; }
      out[k] = hex;
    });
    if (complete) { colorCache = out; colorCacheTheme = currentTheme; }
    return Object.assign({}, out);
  };

  /* ======================================================================
     KaTeX: render options and the module's macros (\er, \et, \ez, \colR, …)
     ====================================================================== */
  // Notation lives here ONLY. The module follows Raymer (Aircraft Design: A Conceptual Approach): W_0 takeoff gross
  // weight, W_e empty weight, A aspect ratio, C_{D_0} zero-lift (parasite) drag coefficient, e Oswald efficiency,
  // C specific fuel consumption, Λ sweep. Colors: lift blue, drag orange, weight violet, thrust/power green,
  // speed magenta (module.css --c-z, --c-r, --c-t, --c-good, --c-v).
  var MACROS = {
    '\\CL': 'C_L',
    '\\CD': 'C_D',
    '\\CDz': 'C_{D_0}',
    '\\CLmax': 'C_{L_{\\max}}',
    '\\LD': 'L/D',
    '\\LDmax': '(L/D)_{\\max}',
    '\\Wo': 'W_0',
    '\\We': 'W_e',
    '\\Wf': 'W_f',
    '\\WS': 'W/S',
    '\\TW': 'T/W',
    '\\PW': 'P/W',
    '\\Swet': 'S_{\\text{wet}}',
    '\\Sref': 'S_{\\text{ref}}',
    '\\Minf': 'M_\\infty',
    '\\colL': '\\htmlClass{c-z}{#1}',
    '\\colD': '\\htmlClass{c-r}{#1}',
    '\\colW': '\\htmlClass{c-t}{#1}',
    '\\colT': '\\htmlClass{c-good}{#1}',
    '\\colV': '\\htmlClass{c-v}{#1}',
    '\\colM': '\\htmlClass{c-warn}{#1}',
    '\\dd': '\\mathrm{d}'
  };
  CYL.MACROS = MACROS;
  var MATH_DELIMS = [
    { left: '\\[', right: '\\]', display: true },
    { left: '\\(', right: '\\)', display: false }
  ];
  function katexTrust(ctx) {
    return !!ctx && ctx.command === '\\htmlClass' && /^[\w -]+$/.test(String(ctx['class'] || ''));
  }
  function katexStrict(code) { return code === 'htmlExtension' ? 'ignore' : 'warn'; }
  function katexOptions(displayMode) {
    return {
      displayMode: !!displayMode,
      throwOnError: false,
      macros: Object.assign({}, MACROS),
      trust: katexTrust,
      strict: katexStrict
    };
  }
  var warnedNoKatex = false;
  function katexMissing() {
    if (!warnedNoKatex) {
      warnedNoKatex = true;
      CYL.error('KaTeX is not loaded, so math cannot be rendered. Check the katex.min.js / auto-render.min.js <script> paths.');
    }
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  CYL.escapeHtml = escapeHtml;

  /** Render \( \) and \[ \] math inside el. Idempotent: already-rendered math is skipped. */
  CYL.renderMath = function (el) {
    el = el || document.body;
    if (!el) return;
    if (!window.katex || typeof window.renderMathInElement !== 'function') { katexMissing(); return; }
    var opts = katexOptions(false);
    delete opts.displayMode;
    opts.delimiters = MATH_DELIMS;
    opts.ignoredClasses = ['katex', 'no-math'];
    opts.errorCallback = function (msg, err) { CYL.error(String(msg) + errText(err)); };
    try { window.renderMathInElement(el, opts); } catch (e) { CYL.error('renderMath failed:', e); }
    try { glueMath(el); } catch (e) { /* cosmetic only */ }
  };

  // Keep short inline math together with the text touching it, so a line never starts with "-axis", ","
  // or ")" (browsers may break after the inline-block boxes KaTeX emits: "the z | -axis"). Only math that
  // KaTeX renders as ONE box (it cannot break inside anyway) or that is short (≤ 16 rendered characters)
  // is glued, so long inline math still wraps at its operators. Short math with spaces on both sides is
  // made unbreakable on its own, so "\(\theta = c\)" never ends a line with "θ =".
  function glueMath(root) {
    if (!root || !root.querySelectorAll) return;
    var list = root.querySelectorAll('.katex');
    for (var i = 0; i < list.length; i++) {
      var k = list[i];
      var unit = k.parentNode;
      if (!unit || unit.nodeType !== 1 || unit.classList.contains('katex-display')) continue;
      // auto-render wraps each formula in a bare <span>; math set with CYL.setTex sits directly in its element
      if (!(unit.tagName === 'SPAN' && !unit.className && unit.childNodes.length === 1)) unit = k;
      var host = unit.parentNode;
      if (!host || (host.classList && host.classList.contains('cyl-math-glue'))) continue;
      var kh = k.querySelector('.katex-html');
      if (!kh || (kh.querySelectorAll(':scope > .katex-base, :scope > .base').length !== 1 && kh.textContent.length > 16)) continue;
      var prev = unit.previousSibling, next = unit.nextSibling;
      var mPrev = prev && prev.nodeType === 3 ? /\S+$/.exec(prev.data) : null;
      var mNext = next && next.nodeType === 3 ? /^\S+/.exec(next.data) : null;
      if (!mPrev && !mNext) { k.style.whiteSpace = 'nowrap'; continue; }
      var glue = document.createElement('span');
      glue.className = 'cyl-math-glue';
      glue.style.whiteSpace = 'nowrap';
      host.insertBefore(glue, unit);
      if (mPrev) glue.appendChild(prev.splitText(prev.data.length - mPrev[0].length));
      glue.appendChild(unit);
      if (mNext) {
        if (next.data.length > mNext[0].length) next.splitText(mNext[0].length);
        glue.appendChild(next);
      }
    }
  }

  /** TeX → HTML string. */
  CYL.tex = function (tex, displayMode) {
    var src = String(tex == null ? '' : tex);
    if (!window.katex) { katexMissing(); return escapeHtml(src); }
    try {
      return window.katex.renderToString(src, katexOptions(displayMode));
    } catch (e) {
      CYL.error('KaTeX could not render "' + src + '":', e);
      return '<span class="katex-error">' + escapeHtml(src) + '</span>';
    }
  };
  /** Replace el's content with the rendered TeX (CYL.tex); returns el. */
  CYL.setTex = function (el, tex, displayMode) {
    if (el) el.innerHTML = CYL.tex(tex, displayMode);
    return el;
  };

  /* ======================================================================
     Formatting
     ====================================================================== */
  function toNum(x) { return typeof x === 'number' ? x : Number(x); }

  /** Up to `sig` significant figures, no trailing zeros, U+2212 minus, -0 → "0", |x| < 1e-10 → "0". */
  CYL.fmt = function (x, sig) {
    x = toNum(x);
    sig = sig == null ? 4 : Math.max(1, Math.min(21, Math.round(sig)));
    if (x !== x) return '\u2014';
    if (!isFinite(x)) return x > 0 ? '\u221e' : MINUS + '\u221e';
    if (Math.abs(x) < 1e-10) return '0';
    var s = String(parseFloat(x.toPrecision(sig)));
    if (s === '0' || s === '-0') return '0';
    return s.replace('e+', 'e').replace(/-/g, MINUS);
  };

  /** Fixed decimals with U+2212 minus (never "−0.00"). */
  CYL.fmtFixed = function (x, decimals) {
    x = toNum(x);
    decimals = decimals == null ? 2 : Math.max(0, Math.min(20, Math.round(decimals)));
    if (!isFinite(x)) return CYL.fmt(x);
    var s = x.toFixed(decimals);
    if (/^-0(\.0*)?$/.test(s)) s = s.slice(1);
    return s.replace(/-/g, MINUS);
  };

  /** Number → TeX (ASCII minus, e-notation as ×10^n). */
  CYL.fmtTex = function (x, sig) {
    var s = CYL.fmt(x, sig).replace(/\u2212/g, '-');
    var m = /^(-?[\d.]+)e(-?\d+)$/.exec(s);
    if (m) return m[1] + '\\times 10^{' + m[2] + '}';
    return s.replace('\u221e', '\\infty').replace('\u2014', '\\text{---}');
  };

  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = b; b = a % b; a = t; } return a; }

  /** rad ≈ kπ/d (d ≤ maxDen, within 1e-9) → TeX like "\frac{3\pi}{4}", "\pi", "0", "-\frac{\pi}{2}"; else null. */
  CYL.piFrac = function (rad, maxDen) {
    rad = toNum(rad);
    maxDen = maxDen == null ? 12 : Math.max(1, Math.floor(maxDen));
    if (!isFinite(rad)) return null;
    if (Math.abs(rad) < 1e-9) return '0';
    for (var d = 1; d <= maxDen; d++) {
      var k = Math.round(rad * d / Math.PI);
      if (k !== 0 && Math.abs(rad - k * Math.PI / d) < 1e-9) {
        var g = gcd(k, d);
        k /= g;
        var dd = d / g;
        var sign = k < 0 ? '-' : '';
        var n = Math.abs(k);
        var num = (n === 1 ? '' : n) + '\\pi';
        return sign + (dd === 1 ? num : '\\frac{' + num + '}{' + dd + '}');
      }
    }
    return null;
  };

  /** Angle → TeX: exact π-fraction if possible, else decimal; with "\ (135^\circ)" when opts.deg (default true). */
  CYL.angleTex = function (rad, opts) {
    rad = toNum(rad);
    if (Math.abs(rad) < 1e-10) rad = 0;             // what fmt() prints as 0: say 0 in both parts
    var deg = !(opts && opts.deg === false);
    // piFrac() calls anything below 1e-9 "0"; a tiny non-zero angle is shown as a decimal instead
    var main = rad !== 0 && Math.abs(rad) < 1e-9 ? null : CYL.piFrac(rad);
    if (main == null) main = CYL.fmtTex(rad);
    if (!deg) return main;
    var d = CYL.fmtTex(rad * 180 / Math.PI);
    if (/\^/.test(d)) d = '{' + d + '}';            // "5.73\times 10^{-7}": brace it, or ^\circ is a double superscript
    return main + '\\ (' + d + '^\\circ)';
  };

  var SQUAREFREE = [1, 2, 3, 5, 6, 7, 10, 11, 13, 14, 15, 17, 19, 21, 22, 23, 26, 29, 30];
  /** Exact TeX for values a·√b/c with small integers (e.g. "\sqrt{2}", "2\sqrt{3}", "\frac{3\sqrt{2}}{2}",
   *  "\frac{1}{2}", "-4"), else null. */
  CYL.surdTex = function (x) {
    x = toNum(x);
    if (!isFinite(x)) return null;
    var v = Math.abs(x);
    if (v < 1e-12) return '0';
    var sign = x < 0 ? '-' : '';
    for (var bi = 0; bi < SQUAREFREE.length; bi++) {
      var b = SQUAREFREE[bi];
      var rb = Math.sqrt(b);
      for (var c = 1; c <= 12; c++) {
        var a = v * c / rb;
        var ar = Math.round(a);
        var aMax = b === 1 ? 10000 : 100;
        if (ar >= 1 && ar <= aMax && Math.abs(a - ar) <= 1e-9 * Math.max(1, a)) {
          // c is minimal for this b, so a/c is already in lowest terms
          var body;
          if (b === 1) {
            body = c === 1 ? String(ar) : '\\frac{' + ar + '}{' + c + '}';
          } else {
            var coef = ar === 1 ? '' : String(ar);
            body = c === 1 ? coef + '\\sqrt{' + b + '}' : '\\frac{' + coef + '\\sqrt{' + b + '}}{' + c + '}';
          }
          return sign + body;
        }
      }
    }
    return null;
  };

  /* ======================================================================
     Math utilities
     ====================================================================== */
  function wrap2pi(t) {
    t = toNum(t);
    if (!isFinite(t)) return t;
    var r = t % TAU;
    if (r < 0) r += TAU;
    if (r >= TAU - 1e-12) r = 0; // values a hair below 2π (e.g. atan2 of -0) wrap to 0
    return r === 0 ? 0 : r;      // normalize -0
  }
  function wrapPi(t) {
    var r = wrap2pi(t);
    return r > Math.PI ? r - TAU : r;
  }
  CYL.math = {
    TAU: TAU,
    deg: function (rad) { return toNum(rad) * 180 / Math.PI; },
    rad: function (deg) { return toNum(deg) * Math.PI / 180; },
    toCart: function (r, theta, z) {
      r = toNum(r); theta = toNum(theta);
      return { x: r * Math.cos(theta), y: r * Math.sin(theta), z: z == null ? 0 : toNum(z) };
    },
    toCyl: function (x, y, z) {
      x = toNum(x); y = toNum(y);
      var r = Math.sqrt(x * x + y * y);
      var theta = r < 1e-12 ? 0 : wrap2pi(Math.atan2(y, x));
      return { r: r, theta: theta, z: z == null ? 0 : toNum(z) };
    },
    wrap2pi: wrap2pi,
    wrapPi: wrapPi,
    angleDiff: function (a, b) { return wrapPi(toNum(a) - toNum(b)); },
    sameAngle: function (a, b, tol) {
      tol = tol == null ? 1e-6 : tol;
      return Math.abs(wrapPi(toNum(a) - toNum(b))) <= tol;
    },
    clamp: function (v, lo, hi) { return Math.min(hi, Math.max(lo, v)); },
    lerp: function (a, b, t) { return a + (b - a) * t; },
    approx: function (a, b, tol) { return Math.abs(a - b) <= (tol == null ? 1e-9 : tol); },
    round: function (x, decimals) {
      x = toNum(x);
      decimals = decimals == null ? 0 : Math.round(decimals);
      if (!isFinite(x)) return x;
      var r = Number(Math.round(Number(x + 'e' + decimals)) + 'e' + (-decimals));
      if (!isFinite(r)) { var f = Math.pow(10, decimals); r = Math.round(x * f) / f; }
      return r === 0 ? 0 : r;
    }
  };

  /* ======================================================================
     DOM + UI helpers
     ====================================================================== */
  var uid = 0;
  function nextId(prefix) { uid += 1; return (prefix || 'cyl') + '-' + uid; }
  function hasMath(s) { return /\\\(|\\\[/.test(String(s)); }

  /** Tiny DOM builder. attrs: class, text, html, style (object; "--vars" ok), dataset, on<event> fns, others
   *  via setAttribute (null/false skipped, true → ""). children: node | string | array (nested ok). */
  CYL.el = function (tag, attrs, children) {
    var n = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class' || k === 'className') n.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') {
        Object.keys(v).forEach(function (sk) {
          if (v[sk] == null) return;
          if (sk.indexOf('--') === 0) n.style.setProperty(sk, v[sk]);
          else n.style[sk] = v[sk];
        });
      } else if (k === 'dataset' && typeof v === 'object') {
        Object.keys(v).forEach(function (dk) { n.dataset[dk] = v[dk]; });
      } else if (/^on[a-z]/i.test(k) && typeof v === 'function') {
        n.addEventListener(k.slice(2).toLowerCase(), v);
      } else {
        n.setAttribute(k, v === true ? '' : String(v));
      }
    });
    (function add(c) {
      if (c == null || c === false) return;
      if (Array.isArray(c)) { c.forEach(add); return; }
      n.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    })(children);
    return n;
  };
  var el = CYL.el;

  /** fn runs once, ms after the last call. */
  CYL.debounce = function (fn, ms) {
    var t = null;
    function d() {
      var self = this, args = arguments;
      if (t) clearTimeout(t);
      t = setTimeout(function () { t = null; fn.apply(self, args); }, ms == null ? 150 : ms);
    }
    d.cancel = function () { if (t) clearTimeout(t); t = null; };
    return d;
  };

  /** Call fn at most once per animation frame, with the latest arguments. */
  CYL.throttleRAF = function (fn) {
    var raf = null, self = null, args = null;
    var request = window.requestAnimationFrame || function (cb) { return setTimeout(cb, 16); };
    var cancel = window.cancelAnimationFrame || clearTimeout;
    function t() {
      self = this; args = arguments;
      if (raf == null) raf = request(function () { raf = null; fn.apply(self, args); });
    }
    t.cancel = function () { if (raf != null) cancel(raf); raf = null; };
    return t;
  };

  /** IntersectionObserver wrapper: fn(isVisible) on every visibility change. Returns a stop() function. */
  CYL.onVisible = function (target, fn, options) {
    if (!target || typeof fn !== 'function') return function () {};
    if (!('IntersectionObserver' in window)) {
      setTimeout(function () { safeCall(fn, null, [true], 'onVisible callback'); }, 0);
      return function () {};
    }
    var last = null;
    var io = new IntersectionObserver(function (entries) {
      var e = entries[entries.length - 1];
      var vis = !!(e && (e.isIntersecting || e.intersectionRatio > 0));
      if (vis !== last) { last = vis; safeCall(fn, null, [vis], 'onVisible callback'); }
    }, Object.assign({ threshold: 0 }, options || {}));
    io.observe(target);
    return function () { io.disconnect(); };
  };

  /** true when the OS asks for reduced motion. */
  CYL.prefersReducedMotion = function () {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  };

  function numOr(v, d) { v = Number(v); return isFinite(v) ? v : d; }

  /** Labeled range slider. opts: {label, min, max, step, value, color:'r'|'t'|'z'|null, format, unit, onInput,
   *  id, ariaLabel, ticks}. Returns {el, input, output, get(), set(v, silent)}. */
  CYL.slider = function (opts) {
    var o = opts || {};
    var id = o.id || nextId('cyl-slider');
    var min = numOr(o.min, 0);
    var max = numOr(o.max, 1);
    if (max < min) { var tmp = max; max = min; min = tmp; }
    var step = o.step === 'any' ? 'any' : numOr(o.step, (max - min) / 100 || 1);
    var fmt = typeof o.format === 'function' ? o.format : function (v) { return CYL.fmt(v); };
    var unit = o.unit ? String(o.unit) : '';
    var unitStr = unit ? (/^[°%′″]/.test(unit) ? unit : '\u00a0' + unit) : '';
    var valueText = typeof o.valueText === 'function' ? o.valueText : null;

    var wrap = el('div', { class: 'slider' + (o.color ? ' slider-' + o.color : '') });
    var label = el('label', { for: id, html: o.label == null ? '' : String(o.label) });
    var output = el('output', { class: 'slider-value', for: id, 'aria-hidden': 'true' });
    // The browser snaps the value to min + k·step using ~15 significant digits, so when max is a whole number
    // of irrational steps (e.g. 359·π/180) min + n·step can land a hair ABOVE max and the last step becomes
    // unreachable. Pad the attribute by a tiny fraction of a step; the next step is still far out of range.
    var maxAttr = step === 'any' ? max : max + Math.abs(step) * 1e-6;
    var input = el('input', { type: 'range', id: id, min: min, max: maxAttr, step: step });
    if (o.ariaLabel) input.setAttribute('aria-label', o.ariaLabel);
    input.value = String(o.value == null ? min : o.value);
    wrap.appendChild(label);
    wrap.appendChild(output);
    wrap.appendChild(input);

    if (o.ticks) {
      var ticks = [];
      if (Array.isArray(o.ticks)) ticks = o.ticks.slice();
      else {
        var st = step === 'any' ? (max - min) / 10 : step;
        var n = Math.round((max - min) / st);
        if (n > 24) { st = (max - min) / 8; n = 8; }
        for (var i = 0; i <= n; i++) ticks.push(min + i * st);
      }
      var tickRow = el('div', { class: 'slider-ticks', 'aria-hidden': 'true' });
      ticks.forEach(function (tv) {
        if (tv < min - 1e-12 || tv > max + 1e-12) return;
        tickRow.appendChild(el('span', { style: { left: ((tv - min) / (max - min || 1) * 100) + '%' } }));
      });
      wrap.appendChild(tickRow);
    }

    var lastText = null;
    function sync() {
      var v = parseFloat(input.value);
      var text = String(fmt(v)) + unitStr;
      if (text !== lastText) {
        output.textContent = text;
        input.setAttribute('aria-valuetext', valueText ? valueText(v) : text);
        lastText = text;
      }
      input.style.setProperty('--fill', (max > min ? (v - min) / (max - min) * 100 : 0) + '%');
      return v;
    }
    input.addEventListener('input', function () {
      var v = sync();
      if (typeof o.onInput === 'function') safeCall(o.onInput, api, [v], 'slider onInput');
    });

    var api = {
      el: wrap,
      input: input,
      output: output,
      get: function () { return parseFloat(input.value); },
      set: function (v, silent) {
        input.value = String(v);
        var nv = sync();
        if (!silent && typeof o.onInput === 'function') safeCall(o.onInput, api, [nv], 'slider onInput');
        return api;
      }
    };
    sync();
    if (hasMath(label.innerHTML)) CYL.renderMath(label);
    return api;
  };

  /** Angle slider in radians; shows "2.356 rad (135°)". opts as slider plus snap (radians step, e.g. π/12). */
  CYL.angleSlider = function (opts) {
    var o = Object.assign({ min: 0, max: TAU, color: 't', label: '\\(\\theta\\)' }, opts || {});
    if (o.step == null) o.step = o.snap != null ? o.snap : Math.PI / 180;
    if (typeof o.format !== 'function') {
      o.format = function (v) { return CYL.fmt(v) + ' rad (' + CYL.fmt(v * 180 / Math.PI) + '\u00b0)'; };
    }
    if (typeof o.valueText !== 'function') {
      o.valueText = function (v) { return CYL.fmt(v) + ' radians (' + CYL.fmt(v * 180 / Math.PI) + ' degrees)'; };
    }
    o.unit = o.unit || '';
    return CYL.slider(o);
  };

  /** Chip toggle button (aria-pressed). opts {label, value, onChange, color:'r'|'t'|'z', ariaLabel}. */
  CYL.toggle = function (opts) {
    var o = opts || {};
    var state = !!o.value;
    var b = el('button', {
      type: 'button',
      class: 'chip' + (o.color ? ' chip-' + o.color : ''),
      'aria-pressed': String(state),
      'aria-label': o.ariaLabel || null,
      html: o.label == null ? '' : String(o.label)
    });
    var api = {
      el: b,
      get: function () { return state; },
      set: function (v, silent) {
        v = !!v;
        var changed = v !== state;
        state = v;
        b.setAttribute('aria-pressed', String(state));
        if (changed && !silent && typeof o.onChange === 'function') safeCall(o.onChange, api, [state], 'toggle onChange');
        return api;
      }
    };
    b.addEventListener('click', function () { api.set(!state); });
    if (hasMath(b.innerHTML)) CYL.renderMath(b);
    return api;
  };

  /** Labeled <select>. opts {label, options:[{value,label}], value, onChange, id}. get() returns the
   *  option's original value (number stays number). */
  CYL.select = function (opts) {
    var o = opts || {};
    var id = o.id || nextId('cyl-select');
    var options = (o.options || []).map(function (op) {
      return (op && typeof op === 'object') ? op : { value: op, label: String(op) };
    });
    var wrap = el('div', { class: 'field field-select' });
    var label = el('label', { for: id, html: o.label == null ? '' : String(o.label) });
    var sel = el('select', { id: id });
    options.forEach(function (op, i) {
      sel.appendChild(el('option', { value: String(i), text: op.label == null ? String(op.value) : String(op.label) }));
    });
    wrap.appendChild(label);
    wrap.appendChild(sel);
    function indexOf(v) {
      for (var i = 0; i < options.length; i++) if (String(options[i].value) === String(v)) return i;
      return -1;
    }
    var api = {
      el: wrap,
      select: sel,
      get: function () { var op = options[sel.selectedIndex]; return op ? op.value : undefined; },
      set: function (v, silent) {
        var i = indexOf(v);
        if (i < 0 || i === sel.selectedIndex) return api;
        sel.selectedIndex = i;
        if (!silent && typeof o.onChange === 'function') safeCall(o.onChange, api, [api.get()], 'select onChange');
        return api;
      }
    };
    if (o.value !== undefined && indexOf(o.value) >= 0) sel.selectedIndex = indexOf(o.value);
    sel.addEventListener('change', function () {
      if (typeof o.onChange === 'function') safeCall(o.onChange, api, [api.get()], 'select onChange');
    });
    if (hasMath(label.innerHTML)) CYL.renderMath(label);
    return api;
  };

  /** <button class="btn">. label is HTML (may contain math). */
  CYL.button = function (label, onClick, opts) {
    var o = opts || {};
    var b = el('button', {
      type: 'button',
      class: 'btn' + (o.primary ? ' primary' : '') + (o.small ? ' small' : ''),
      html: label == null ? '' : String(label)
    });
    if (typeof onClick === 'function') {
      b.addEventListener('click', function (e) { safeCall(onClick, b, [e], 'button onClick'); });
    }
    if (hasMath(b.innerHTML)) CYL.renderMath(b);
    return b;
  };

  /** Live value display. set(value, {tex}) — numbers are formatted with CYL.fmt; strings with
   *  markup or \( \) math are rendered as HTML; {tex:true} renders the string as TeX. */
  CYL.readout = function (label, opts) {
    var o = opts || {};
    var wrap = el('div', { class: 'readout' + (o.color ? ' readout-' + o.color : ''), id: o.id || null });
    var lab = el('span', { class: 'readout-label', html: label == null ? '' : String(label) });
    var val = el('span', { class: 'readout-value' });
    wrap.appendChild(lab);
    wrap.appendChild(val);
    if (hasMath(lab.innerHTML)) CYL.renderMath(lab);
    var last = null;
    var api = {
      el: wrap,
      label: lab,
      value: val,
      set: function (v, setOpts) {
        var tex = !!(setOpts && setOpts.tex);
        var s = typeof v === 'number' ? CYL.fmt(v) : String(v == null ? '' : v);
        var key = (tex ? 't:' : 'h:') + s;
        if (key === last) return api;
        last = key;
        if (tex) CYL.setTex(val, s);
        else if (/[<&]|\\\(|\\\[/.test(s)) { val.innerHTML = s; if (hasMath(s)) CYL.renderMath(val); }
        else val.textContent = s;
        return api;
      }
    };
    return api;
  };

  /** Enhance .tabs markup (role=tablist / tab / tabpanel) with ARIA state and arrow-key navigation.
   *  Idempotent. Returns {el, tabs, panels, get(), select(indexOrPanelId, focus)}; fires "cyl:tabchange". */
  CYL.tabs = function (root) {
    if (!root) return null;
    if (root._cylTabs) return root._cylTabs;
    var list = root.querySelector('[role="tablist"]') || root.firstElementChild;
    if (!list) return null;
    list.setAttribute('role', 'tablist');
    var tabs = Array.prototype.filter.call(list.children, function (c) {
      return c.getAttribute('role') === 'tab' || c.tagName === 'BUTTON';
    });
    var panels = [];
    var looseIdx = 0;
    var loosePanels = Array.prototype.filter.call(root.querySelectorAll('[role="tabpanel"]'), function (p) {
      return p.closest('.tabs') === root;
    });
    tabs.forEach(function (tab, i) {
      tab.setAttribute('role', 'tab');
      if (tab.tagName === 'BUTTON' && !tab.getAttribute('type')) tab.setAttribute('type', 'button');
      if (!tab.id) tab.id = nextId('cyl-tab');
      var pid = tab.getAttribute('aria-controls');
      var panel = pid ? document.getElementById(pid) : null;
      if (!panel) panel = loosePanels[looseIdx];
      looseIdx += 1;
      if (panel) {
        if (!panel.id) panel.id = nextId('cyl-tabpanel');
        tab.setAttribute('aria-controls', panel.id);
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-labelledby', tab.id);
        if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '0');
        panel.setAttribute('data-tab-label', (tab.textContent || '').trim());
      }
      panels[i] = panel || null;
    });
    var current = -1;
    function select(i, focus) {
      if (typeof i === 'string') {
        var byId = -1;
        panels.forEach(function (p, k) { if (p && p.id === i) byId = k; });
        tabs.forEach(function (t, k) { if (t.id === i) byId = k; });
        i = byId;
      }
      if (i < 0 || i >= tabs.length) return;
      var changed = i !== current;
      current = i;
      tabs.forEach(function (t, k) {
        var on = k === i;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        if (panels[k]) panels[k].hidden = !on;
      });
      if (focus) tabs[i].focus();
      if (changed) {
        var ev;
        try { ev = new CustomEvent('cyl:tabchange', { detail: { index: i, tab: tabs[i], panel: panels[i] } }); } catch (e) { ev = null; }
        if (ev) root.dispatchEvent(ev);
      }
    }
    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { select(i, false); });
    });
    list.addEventListener('keydown', function (e) {
      var i = tabs.indexOf(e.target);
      if (i < 0) return;
      var n = tabs.length, to = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') to = (i + 1) % n;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') to = (i - 1 + n) % n;
      else if (e.key === 'Home') to = 0;
      else if (e.key === 'End') to = n - 1;
      if (to >= 0) { e.preventDefault(); select(to, true); }
    });
    var initial = 0;
    tabs.forEach(function (t, k) { if (t.getAttribute('aria-selected') === 'true') initial = k; });
    select(initial, false);
    var api = {
      el: root,
      tabs: tabs,
      panels: panels,
      get: function () { return current; },
      select: function (i, focus) { select(i, !!focus); return api; }
    };
    root._cylTabs = api;
    return api;
  };

  /* ======================================================================
     Page shell: top bar, sidebar, on-page contents, "Mark complete", prev/next pager, footer
     ====================================================================== */
  var ICONS = {
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    moon: '<svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
    sun: '<svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>'
  };

  var shell = null; // references to injected elements

  function pageLabel(p) {
    if (!p) return '';
    return p.num != null ? 'Lesson ' + p.num + ' \u00b7 ' + p.title : p.title;
  }

  function syncThemeButton() {
    if (!shell || !shell.themeBtn) return;
    var dark = currentTheme === 'dark';
    var label = dark ? 'Light mode' : 'Dark mode';
    shell.themeBtn.setAttribute('aria-label', 'Switch to ' + (dark ? 'light' : 'dark') + ' theme');
    shell.themeBtn.title = 'Switch to ' + (dark ? 'light' : 'dark') + ' theme';
    shell.themeText.textContent = label;
  }

  function buildTopbar(page) {
    var menuBtn = el('button', {
      type: 'button', class: 'cyl-icon-btn cyl-menu-btn', 'aria-controls': 'cyl-sidebar', 'aria-expanded': 'false',
      html: ICONS.menu + '<span class="cyl-btn-text">Contents</span>'
    });
    var brand = el('a', { class: 'cyl-brand', href: CYL.url('index.html') }, [
      el('span', { class: 'cyl-brand-mark', 'aria-hidden': 'true', text: 'W\u2080' }),
      el('span', { class: 'cyl-brand-text', text: 'First Weight Estimate' })
    ]);
    if (page && page.id === 'home') brand.setAttribute('aria-current', 'page');
    var themeText = el('span', { class: 'cyl-btn-text' });
    var themeBtn = el('button', { type: 'button', class: 'cyl-icon-btn cyl-theme-btn', html: ICONS.moon + ICONS.sun });
    themeBtn.appendChild(themeText);
    var inner = el('div', { class: 'cyl-topbar-inner' }, [menuBtn, brand]);
    if (page && page.id !== 'home') {
      inner.appendChild(el('span', { class: 'cyl-topbar-sep', 'aria-hidden': 'true', text: '/' }));
      inner.appendChild(el('span', { class: 'cyl-topbar-page', text: pageLabel(page) }));
    }
    inner.appendChild(el('span', { class: 'cyl-topbar-spacer' }));
    inner.appendChild(themeBtn);
    var bar = el('header', { class: 'cyl-topbar' }, inner);
    return { bar: bar, menuBtn: menuBtn, themeBtn: themeBtn, themeText: themeText };
  }

  function buildSidebar(page) {
    var nav = el('nav', { id: 'cyl-sidebar', class: 'cyl-sidebar', 'aria-label': 'Module contents' });
    var closeBtn = el('button', { type: 'button', class: 'cyl-icon-btn cyl-sidebar-close', 'aria-label': 'Close contents', html: ICONS.close });
    nav.appendChild(el('div', { class: 'cyl-sidebar-head' }, [el('p', { class: 'cyl-sidebar-title', text: 'Contents' }), closeBtn]));
    // openengineering.ca: link back to the site's module catalog
    nav.appendChild(el('a', { class: 'cyl-site-link', href: CYL.url('../index.html') }, [
      el('span', { class: 'cyl-site-link-arrow', 'aria-hidden': 'true', text: '\u2190' }), 'AERO 3002 \u00b7 All modules'
    ]));
    var progText = el('p', { class: 'cyl-progress-text' });
    var progFill = el('span', { class: 'cyl-progress-fill' });
    var progBar = el('div', { class: 'cyl-progress-bar', role: 'progressbar', 'aria-label': 'Lessons complete', 'aria-valuemin': '0', 'aria-valuemax': String(CYL.PAGES.filter(function (p) { return p.group === 'lessons'; }).length) }, progFill);
    nav.appendChild(el('div', { class: 'cyl-progress' }, [progText, progBar]));
    var links = {};
    CYL.GROUPS.forEach(function (g) {
      var items = CYL.PAGES.filter(function (p) { return p.group === g.id; });
      if (!items.length) return;
      var gid = 'cyl-nav-' + g.id;
      var ul = el('ul', { class: 'cyl-nav-list', 'aria-labelledby': gid });
      items.forEach(function (p) {
        var a = el('a', { class: 'cyl-nav-link', href: CYL.url(p.href) }, [
          p.num != null ? el('span', { class: 'cyl-nav-num', 'aria-hidden': 'true', text: String(p.num) })
                        : el('span', { class: 'cyl-nav-dot', 'aria-hidden': 'true' }),
          el('span', { class: 'cyl-nav-label' }, [
            p.num != null ? el('span', { class: 'visually-hidden', text: 'Lesson ' + p.num + ': ' }) : null,
            p.title,
            p.tag ? [' ', el('span', { class: 'tag extension', text: p.tag })] : null
          ]),
          el('span', { class: 'cyl-nav-check', 'aria-hidden': 'true' }),
          el('span', { class: 'visually-hidden cyl-nav-status' })
        ]);
        if (page && page.id === p.id) a.setAttribute('aria-current', 'page');
        links[p.id] = a;
        ul.appendChild(el('li', null, a));
      });
      nav.appendChild(el('div', { class: 'cyl-nav-group' }, [el('p', { class: 'cyl-nav-group-title', id: gid, text: g.label }), ul]));
    });
    return { nav: nav, closeBtn: closeBtn, progText: progText, progBar: progBar, progFill: progFill, links: links };
  }

  function updateProgressUI() {
    if (!shell) return;
    var all = readProgress();
    var lessons = CYL.PAGES.filter(function (p) { return p.group === 'lessons'; });
    var done = lessons.filter(function (p) { return all[p.id]; }).length;
    if (shell.progText) {
      shell.progText.innerHTML = '<strong>' + done + ' of ' + lessons.length + '</strong> lessons complete';
      shell.progBar.setAttribute('aria-valuemax', String(lessons.length));
      shell.progBar.setAttribute('aria-valuenow', String(done));
      shell.progFill.style.width = (lessons.length ? done / lessons.length * 100 : 0) + '%';
    }
    Object.keys(shell.links || {}).forEach(function (id) {
      var a = shell.links[id];
      var isDone = !!all[id];
      a.classList.toggle('is-complete', isDone);
      var st = a.querySelector('.cyl-nav-status');
      if (st) st.textContent = isDone ? ' (completed)' : '';
    });
    if (shell.completeInput) {
      var me = CYL.page;
      var c = !!(me && all[me.id]);
      shell.completeInput.checked = c;
      shell.completeBox.classList.toggle('is-complete', c);
    }
  }

  function slugify(s) {
    return String(s).toLowerCase()
      .replace(/\\\(|\\\)|\\\[|\\\]/g, ' ')
      .replace(/\\[a-z]+/gi, ' ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/, '');
  }

  function collectSections(main) {
    var out = [];
    Array.prototype.forEach.call(main.querySelectorAll('section > h2'), function (h2, i) {
      var section = h2.parentElement;
      var target = section.id ? section : (h2.id ? h2 : null);
      if (!target) {
        var base = slugify(h2.textContent) || 'section-' + (i + 1);
        var id = base, n = 2;
        while (document.getElementById(id)) { id = base + '-' + n; n += 1; }
        section.id = id;
        target = section;
      }
      out.push({ h2: h2, target: target });
    });
    return out;
  }

  function tocList(sections) {
    var ol = el('ol', { class: 'cyl-toc-list' });
    sections.forEach(function (s) {
      var a = el('a', { href: '#' + s.target.id });
      Array.prototype.forEach.call(s.h2.childNodes, function (c) {
        var copy = c.cloneNode(true);
        if (copy.nodeType === 1) {
          copy.removeAttribute('id');
          Array.prototype.forEach.call(copy.querySelectorAll('[id]'), function (x) { x.removeAttribute('id'); });
        }
        a.appendChild(copy);
      });
      ol.appendChild(el('li', null, a));
    });
    return ol;
  }

  function buildComplete(page) {
    var input = el('input', { type: 'checkbox', class: 'cyl-complete-input', id: 'cyl-complete-input' });
    var noun = page.group === 'lessons' ? 'lesson' : 'page';
    var sub = CYL.store.available()
      ? 'Your progress is saved in this browser and shown in Contents.'
      : 'Progress can\u2019t be saved in this browser (private mode?), but it counts for this visit.';
    var label = el('label', { class: 'cyl-complete-label', for: 'cyl-complete-input' }, [
      input,
      el('span', { class: 'cyl-complete-text' }, [
        el('strong', { text: 'Mark this ' + noun + ' complete' }),
        el('span', { class: 'cyl-complete-sub', text: sub })
      ])
    ]);
    var box = el('div', { class: 'cyl-complete' }, label);
    input.addEventListener('change', function () { CYL.progress.setComplete(page.id, input.checked); });
    return { box: box, input: input };
  }

  function buildPager(page) {
    var idx = CYL.PAGES.indexOf(page);
    if (idx < 0) return null;
    var prev = CYL.PAGES[idx - 1];
    var next = CYL.PAGES[idx + 1];
    if (!prev && !next) return null;
    var nav = el('nav', { class: 'cyl-pager', 'aria-label': 'Previous and next pages' });
    function card(p, dir) {
      var meta = dir === 'prev' ? '\u2190 Previous' : 'Next \u2192';
      if (p.num != null) meta += ' \u00b7 Lesson ' + p.num;
      return el('a', { class: 'cyl-pager-link ' + dir, href: CYL.url(p.href), rel: dir }, [
        el('span', { class: 'cyl-pager-dir', text: meta }),
        el('span', { class: 'cyl-pager-title', text: p.title })
      ]);
    }
    if (prev) nav.appendChild(card(prev, 'prev'));
    if (next) nav.appendChild(card(next, 'next'));
    return nav;
  }

  function buildFooter() {
    var sheet = findPage('cheatsheet');
    return el('footer', { class: 'cyl-footer' }, [
      el('p', null, [el('strong', { text: 'The First Estimate of Takeoff Weight' }), ' \u00b7 Module 3 of Conceptual Aircraft Design, for third-year aerospace engineering']),
      el('p', null, [
        el('a', { href: CYL.url('../index.html'), text: 'AERO 3002 on openengineering.ca' }),
        ' \u00b7 ',
        el('a', { href: CYL.url(sheet.href), text: 'Formula Sheet' }),
        ' \u00b7 ',
        el('span', { class: 'cyl-offline', text: 'Works offline' })
      ]),
      el('p', { class: 'cyl-license' }, [
        '\u00a9 2026 Open Engineering \u00b7 \u00a9 ProfCyr \u00b7 ',
        el('a', { href: 'https://creativecommons.org/licenses/by-nc-sa/4.0/', rel: 'license', text: 'CC BY-NC-SA 4.0' })
      ])
    ]);
  }

  function setNavOpen(open, focusTarget) {
    if (!shell) return;
    document.body.classList.toggle('cyl-nav-open', open);
    shell.menuBtn.setAttribute('aria-expanded', String(open));
    if (open) {
      shell.sidebar.nav.scrollTop = Math.max(0, (shell.currentLinkTop || 0) - 120);
      setTimeout(function () { (shell.sidebar.closeBtn || shell.sidebar.nav).focus(); }, 30);
    } else if (focusTarget) {
      focusTarget.focus();
    }
  }
  function isDrawerMode() {
    try { return !window.matchMedia('(min-width: 1024px)').matches; } catch (e) { return true; }
  }

  function injectShell() {
    var body = document.body;
    if (!body || body.getAttribute('data-shell') === 'none' || document.querySelector('.cyl-topbar')) return;
    var page = CYL.page;
    var main = document.querySelector('main');
    if (main && !main.id) main.id = 'main';

    var top = buildTopbar(page);
    var side = buildSidebar(page);
    shell = { menuBtn: top.menuBtn, themeBtn: top.themeBtn, themeText: top.themeText, sidebar: side, links: side.links,
              progText: side.progText, progBar: side.progBar, progFill: side.progFill };

    var skip = el('a', { class: 'skip-link', href: '#' + (main ? main.id : 'cyl-content'), text: 'Skip to content' });
    var scrim = el('div', { class: 'cyl-scrim', 'aria-hidden': 'true' });
    var mainCol = el('div', { class: 'cyl-main-col' });
    var content = el('div', { class: 'cyl-content', id: 'cyl-content' }, mainCol);
    var shellEl = el('div', { class: 'cyl-shell' }, [side.nav, scrim, content]);

    if (main) {
      main.parentNode.insertBefore(shellEl, main);
      mainCol.appendChild(main);
    } else {
      body.insertBefore(shellEl, body.firstChild);
    }
    body.insertBefore(top.bar, body.firstChild);
    body.insertBefore(skip, body.firstChild);

    if (main) {
      // On-page TOC (only with >= 3 sections)
      var sections = collectSections(main);
      if (sections.length >= 3) {
        var inline = el('details', { class: 'cyl-toc-inline' }, [
          el('summary', null, ['On this page', el('span', { class: 'cyl-toc-count', text: sections.length + ' sections' })]),
          el('nav', { 'aria-label': 'On this page' }, tocList(sections))
        ]);
        var header = main.querySelector(':scope > .lesson-header');
        if (header) header.parentNode.insertBefore(inline, header.nextSibling);
        else main.insertBefore(inline, main.firstChild);
        var rail = el('aside', { class: 'cyl-toc-rail' },
          el('nav', { 'aria-label': 'On this page' }, [el('p', { class: 'cyl-toc-title', text: 'On this page' }), tocList(sections)]));
        content.appendChild(rail);
        content.classList.add('has-rail');
        shell.toc = { sections: sections, links: Array.prototype.slice.call(content.querySelectorAll('.cyl-toc-list a')) };
        // clicking an inline TOC link collapses the list on small screens
        inline.addEventListener('click', function (e) {
          if (e.target.closest && e.target.closest('a')) inline.open = false;
        });
      }
      // Mark complete (lessons + practice) and prev/next
      if (page && (page.group === 'lessons' || page.group === 'practice')) {
        var comp = buildComplete(page);
        main.appendChild(comp.box);
        shell.completeInput = comp.input;
        shell.completeBox = comp.box;
      }
      var pager = page ? buildPager(page) : null;
      if (pager) main.appendChild(pager);
    }
    mainCol.appendChild(buildFooter());

    // Behavior
    top.themeBtn.addEventListener('click', function () {
      var next = currentTheme === 'dark' ? 'light' : 'dark';
      // Choosing the OS theme again means "follow the OS" from now on.
      CYL.theme.set(next === osTheme() ? 'auto' : next);
    });
    top.menuBtn.addEventListener('click', function () {
      setNavOpen(!body.classList.contains('cyl-nav-open'));
    });
    side.closeBtn.addEventListener('click', function () { setNavOpen(false, top.menuBtn); });
    scrim.addEventListener('click', function () { setNavOpen(false, top.menuBtn); });
    side.nav.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('a') && body.classList.contains('cyl-nav-open')) setNavOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && body.classList.contains('cyl-nav-open')) setNavOpen(false, top.menuBtn);
    });
    side.nav.addEventListener('focusout', function (e) {
      if (!body.classList.contains('cyl-nav-open') || !isDrawerMode()) return;
      var to = e.relatedTarget;
      if (to && !side.nav.contains(to) && to !== top.menuBtn) setNavOpen(false);
    });
    try {
      var wide = window.matchMedia('(min-width: 1024px)');
      var onWide = function () { if (wide.matches && body.classList.contains('cyl-nav-open')) setNavOpen(false); };
      if (wide.addEventListener) wide.addEventListener('change', onWide); else if (wide.addListener) wide.addListener(onWide);
    } catch (e) { /* ignore */ }

    CYL.progress.onChange(updateProgressUI);
    updateProgressUI();
    syncThemeButton();

    // Keep the current page visible in a scrolling sidebar
    var cur = page && side.links[page.id];
    if (cur) {
      shell.currentLinkTop = cur.offsetTop;
      if (!isDrawerMode() && cur.offsetTop + 60 > side.nav.clientHeight) side.nav.scrollTop = cur.offsetTop - side.nav.clientHeight / 2;
    }
  }

  /* Scroll cue for wide tables. On a narrow screen a .table-wrap scrolls sideways (module.css). While it
     does, it carries .is-scrollable plus .at-start / .at-end from its scroll position, and module.css fades
     out the edge that hides more columns, so students can see there is more to swipe to. A wrap that has
     scrolled once is also made keyboard-focusable (tabindex="0", role="region", named by the table's
     caption), so it can be scrolled with the arrow keys; attributes the page set itself are left alone.
     Wraps added later (e.g. a results table built by a page script) are picked up automatically. */
  var cueSeen = typeof WeakSet === 'function' ? new WeakSet() : null;
  var cueRO = null;
  var cueWraps = [];
  var cueCapN = 0;
  function cueClass(w, cls, on) { if (w.classList.contains(cls) !== on) w.classList.toggle(cls, on); }
  function updateScrollCue(w) {
    var max = w.scrollWidth - w.clientWidth;
    var on = w.clientWidth > 0 && max > 1;
    var x = Math.abs(w.scrollLeft);
    cueClass(w, 'is-scrollable', on);
    cueClass(w, 'at-start', on && x <= 1);
    cueClass(w, 'at-end', on && x >= max - 1);
    if (on && !w.hasAttribute('tabindex')) {
      w.setAttribute('tabindex', '0');
      if (!w.hasAttribute('role')) w.setAttribute('role', 'region');
      if (!w.hasAttribute('aria-label') && !w.hasAttribute('aria-labelledby')) {
        var cap = w.querySelector('caption');
        if (cap) {
          if (!cap.id) { do { cueCapN += 1; } while (document.getElementById('cyl-tcap-' + cueCapN)); cap.id = 'cyl-tcap-' + cueCapN; }
          w.setAttribute('aria-labelledby', cap.id);
        } else {
          w.setAttribute('aria-label', 'Table');
        }
      }
    }
  }
  function watchScrollCue(w) {
    if (cueSeen ? cueSeen.has(w) : w.__cylCue) return;
    if (cueSeen) cueSeen.add(w); else w.__cylCue = true;
    cueWraps.push(w);
    w.addEventListener('scroll', CYL.throttleRAF(function () { updateScrollCue(w); }), { passive: true });
    if (cueRO) {
      cueRO.observe(w);   // the wrap's own width (window resize, a closed <details> or tab being shown)
      Array.prototype.forEach.call(w.children, function (c) { cueRO.observe(c); });   // the table's width
    }
    updateScrollCue(w);
  }
  function scanScrollCues(node) {
    if (!node || node.nodeType !== 1) return;
    if (node.classList.contains('table-wrap')) watchScrollCue(node);
    Array.prototype.forEach.call(node.getElementsByClassName('table-wrap'), watchScrollCue);
  }
  function initScrollCues() {
    if (typeof window.ResizeObserver === 'function') {
      cueRO = new window.ResizeObserver(function (entries) {
        entries.forEach(function (en) {
          var t = en.target;
          var w = t.classList.contains('table-wrap') ? t : t.parentElement;
          if (w && w.classList.contains('table-wrap')) updateScrollCue(w);
        });
      });
    } else {
      window.addEventListener('resize', CYL.throttleRAF(function () { cueWraps.forEach(updateScrollCue); }));
    }
    scanScrollCues(document.body);
    if (typeof window.MutationObserver === 'function') {
      new window.MutationObserver(function (records) {
        for (var i = 0; i < records.length; i++) {
          var added = records[i].addedNodes;
          for (var j = 0; j < added.length; j++) scanScrollCues(added[j]);
        }
      }).observe(document.body, { childList: true, subtree: true });
    }
  }

  function initScrollSpy() {
    if (!shell || !shell.toc) return;
    var targets = shell.toc.sections.map(function (s) { return s.target; });
    var links = shell.toc.links;
    var n = targets.length;
    var active = -1;
    var clicked = -1;   // section whose TOC link was used last: wins a tie with a section beside it
    // Sections laid out side by side (grid / multicol) have tied tops. The candidate is the last section
    // (document order) whose top has passed the line; a section in the same row (top within TIE px, no
    // horizontal overlap, not nested) ties with it, and the tie goes to the clicked section, else the first.
    var TIE = 32;
    function sideBySide(a, b, ra, rb) {
      if (a.contains(b) || b.contains(a) || !(ra.width && ra.height && rb.width && rb.height)) return false;
      return Math.abs(ra.top - rb.top) <= TIE && (ra.right <= rb.left + 1 || rb.right <= ra.left + 1);
    }
    var update = CYL.throttleRAF(function () {
      var line = (parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 72) + 24;
      var idx = 0, i;
      var rects = targets.map(function (t) { return t.getBoundingClientRect(); });
      for (i = 0; i < n; i++) if (rects[i].top - line <= 0) idx = i;
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) idx = n - 1;
      var first = idx, pick = -1;
      for (i = 0; i < n; i++) {
        if (i === idx || !sideBySide(targets[i], targets[idx], rects[i], rects[idx])) continue;
        if (i < first) first = i;
        if (i === clicked) pick = i;
      }
      if (idx === clicked) pick = idx;
      idx = pick >= 0 ? pick : first;
      if (idx === active) return;
      active = idx;
      links.forEach(function (a, k) {
        var on = (k % n) === idx;
        a.classList.toggle('is-active', on);
        if (on) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current');
      });
    });
    links.forEach(function (a, k) {
      a.addEventListener('click', function () { clicked = k % n; update(); });
    });
    window.addEventListener('hashchange', function () {
      var id = location.hash.slice(1);
      try { id = decodeURIComponent(id); } catch (e) { /* keep it raw */ }
      for (var i = 0; i < n; i++) if (targets[i].id === id) { clicked = i; update(); return; }
    });
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  // Print: always light (module.css keeps dark tokens screen-only; figures drawn from CYL.colors()
  // are told via theme.onChange('light') and redraw), and open every <details> except
  // data-print="closed". Both are restored afterwards.
  var printOpened = [];
  var printSwapped = false;
  window.addEventListener('beforeprint', function () {
    if (currentTheme === 'dark') {
      printSwapped = true;
      document.documentElement.setAttribute('data-theme', 'light');
      currentTheme = 'light';
      colorCache = null;
      themeListeners.slice().forEach(function (fn) { safeCall(fn, null, ['light'], 'theme.onChange listener'); });
    }
    printOpened = [];
    Array.prototype.forEach.call(document.querySelectorAll('details:not([open])'), function (d) {
      if (d.getAttribute('data-print') === 'closed' || d.classList.contains('cyl-toc-inline')) return;
      d.open = true;
      printOpened.push(d);
    });
  });
  window.addEventListener('afterprint', function () {
    printOpened.forEach(function (d) { d.open = false; });
    printOpened = [];
    if (printSwapped) { printSwapped = false; applyTheme(); }
  });

  /* ======================================================================
     Ready
     ====================================================================== */
  var readyQueue = [];
  var isReady = false;

  function runReady(fn) {
    try {
      var r = fn(CYL);
      if (r && typeof r.then === 'function') {
        r.then(null, function (e) { CYL.error('CYL.ready callback failed:', e); });
      }
    } catch (e) {
      CYL.error('CYL.ready callback failed:', e);
    }
  }

  /** Run fn after DOM ready + shell injected + math rendered. Safe to call any time. */
  CYL.ready = function (fn) {
    if (typeof fn !== 'function') return;
    if (isReady) Promise.resolve().then(function () { runReady(fn); });
    else readyQueue.push(fn);
  };

  function boot() {
    if (!INCLUDE_INSTRUCTOR_GUIDE) {
      Array.prototype.forEach.call(document.querySelectorAll('[data-instructor-only]'), function (n) { n.parentNode.removeChild(n); });
    }
    try { injectShell(); } catch (e) { CYL.error('Shell injection failed:', e); }
    try {
      Array.prototype.forEach.call(document.querySelectorAll('.tabs'), function (t) { CYL.tabs(t); });
    } catch (e) { CYL.error('Tabs enhancement failed:', e); }
    CYL.renderMath(document.body);
    try { initScrollCues(); } catch (e) { CYL.error('Table scroll cues failed:', e); }
    isReady = true;
    var q = readyQueue;
    readyQueue = [];
    q.forEach(runReady);
    try { initScrollSpy(); } catch (e) { CYL.error('TOC scroll-spy failed:', e); }
  }

  applyTheme();
  window.CYL = CYL;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window, document);
