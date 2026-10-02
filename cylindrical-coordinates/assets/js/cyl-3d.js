/* ==========================================================================
   cyl-3d.js — CYL3D: interactive 3D figures for the Cylindrical Coordinates module (unit vectors in Hibbeler's
   notation u_r, u_θ, u_z and bold i, j, k: see MACROS and EXPAND)
   Public API: the window.CYL3D object at the end of this file. CYL3D.create(container, opts) returns a
   viewer; each viewer method (v.point, v.arrow, v.surface, v.setView, …) is defined in makeViewer()
   below, with a one-line signature comment above it.

   World is Z-up and right-handed; 1 world unit = 1 unit of the problem.
   Rendering is on demand (no idle loop). The animation loop runs only while
   animate() callbacks, a camera tween or orbit damping are active AND the
   viewer is on screen AND the tab is visible.

   Requires THREE (assets/vendor/three/three.bundle.min.js) and, preferably,
   CYL (cyl-core.js: tex, colors, theme, error, prefersReducedMotion).
   Classic script — attaches exactly one global: window.CYL3D.
   ========================================================================== */
(function () {
  'use strict';

  var THREE = window.THREE;
  var TAU = Math.PI * 2;
  var DEG = Math.PI / 180;
  var VERSION = '1.0.0';

  /* ------------------------------------------------------------------------
     Small utilities
     ------------------------------------------------------------------------ */
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function num(v, d) { return isNum(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function wrapPi(a) { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; }
  function hypot(x, y) { return Math.sqrt(x * x + y * y); }
  function unit2(x, y) { var l = hypot(x, y); return l > 1e-6 ? [x / l, y / l] : null; }
  function rot2(d, a) { var c = Math.cos(a), s = Math.sin(a); return [d[0] * c - d[1] * s, d[0] * s + d[1] * c]; }
  function neg2(d) { return [-d[0], -d[1]]; }
  // Preferred direction first, then progressively rotated alternatives.
  function fan(d) { return [d, rot2(d, 0.6), rot2(d, -0.6), rot2(d, 1.2), rot2(d, -1.2), rot2(d, 1.9), rot2(d, -1.9), neg2(d)]; }

  // [x,y,z] | {x,y,z} | THREE.Vector3 → [x,y,z] of finite numbers, or null.
  function vec3(p) {
    if (p == null || typeof p !== 'object') return null;
    var x, y, z;
    if (typeof p.length === 'number') { x = p[0]; y = p[1]; z = p.length > 2 ? p[2] : 0; }
    else { x = p.x; y = p.y; z = p.z == null ? 0 : p.z; }
    if (x == null || y == null) return null;
    x = +x; y = +y; z = +z;
    return isFinite(x) && isFinite(y) && isFinite(z) ? [x, y, z] : null;
  }
  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function report(msg, err) {
    var text = 'CYL3D: ' + msg + (err ? ' — ' + (err && err.message ? err.message : String(err)) : '');
    try { if (window.CYL && typeof window.CYL.error === 'function') { window.CYL.error(text); return; } } catch (e) { /* fall through */ }
    if (window.console) console.error(text);
  }
  function warn(msg) { if (window.console && console.warn) console.warn('CYL3D: ' + msg); }
  function reducedMotion() {
    try { if (window.CYL && typeof window.CYL.prefersReducedMotion === 'function') return !!window.CYL.prefersReducedMotion(); } catch (e) { /* ignore */ }
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }
  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }

  /* ------------------------------------------------------------------------
     TeX → HTML (CYL.tex when present; otherwise KaTeX directly)
     ------------------------------------------------------------------------ */
  var MACROS = {
    '\\er': '\\mathbf{u}_r', '\\et': '\\mathbf{u}_\\theta', '\\ez': '\\mathbf{u}_z',
    '\\ihat': '\\mathbf{i}', '\\jhat': '\\mathbf{j}', '\\khat': '\\mathbf{k}',
    '\\rvec': '\\mathbf{r}', '\\vvec': '\\mathbf{v}', '\\avec': '\\mathbf{a}', '\\Fvec': '\\mathbf{F}',
    '\\atantwo': '\\operatorname{atan2}', '\\dd': '\\mathrm{d}',
    '\\colR': '\\htmlClass{c-r}{#1}', '\\colT': '\\htmlClass{c-t}{#1}', '\\colZ': '\\htmlClass{c-z}{#1}',
    '\\colX': '\\htmlClass{c-x}{#1}', '\\colY': '\\htmlClass{c-y}{#1}', '\\colV': '\\htmlClass{c-good}{#1}', '\\colA': '\\htmlClass{c-bad}{#1}'
  };
  function texHTML(tex) {
    tex = String(tex);
    try { if (window.CYL && typeof window.CYL.tex === 'function') return window.CYL.tex(tex, false); } catch (e) { /* fall back */ }
    try {
      if (window.katex) {
        return window.katex.renderToString(tex, {
          throwOnError: false, displayMode: false, macros: Object.assign({}, MACROS),
          trust: function (c) { return c.command === '\\htmlClass'; },
          strict: function (code) { return code === 'htmlExtension' ? 'ignore' : 'warn'; }
        });
      }
    } catch (e) { /* fall back */ }
    return escapeHTML(tex);
  }

  /* ------------------------------------------------------------------------
     Semantic colors. name → [key in CYL.colors(), CSS custom property]
     ------------------------------------------------------------------------ */
  var SEM = {
    r: ['r', '--c-r'], t: ['t', '--c-t'], z: ['z', '--c-z'], x: ['x', '--c-x'], y: ['y', '--c-y'],
    axis: ['axis', '--c-axis'], grid: ['grid', '--c-grid'], point: ['point', '--c-point'],
    surface: ['surface', '--c-surface'], accent: ['accent', '--accent'], ink: ['ink', '--ink'],
    muted: ['inkMuted', '--ink-muted'], good: ['good', '--c-good'], bad: ['bad', '--c-bad'],
    warn: ['warn', '--c-warn'], viz: ['vizBg', '--viz-bg'], bg: ['bg', '--bg'], line: ['line', '--line']
  };
  var ALIAS = { theta: 't', rho: 'r', vizBg: 'viz', inkMuted: 'muted' };
  var FALLBACK_HEX = {
    r: '#c2410c', t: '#6d44e0', z: '#1769bd', x: '#56636f', y: '#5e6b12', axis: '#3a4450', grid: '#cfd6de',
    point: '#111820', surface: '#8894a3', accent: '#0b6b86', ink: '#18212b', muted: '#556270',
    good: '#23793a', bad: '#c92a2a', warn: '#9a5100', viz: '#fbfcfd', bg: '#f6f7f9', line: '#dde2e8'
  };
  function semName(spec) {
    if (typeof spec !== 'string') return null;
    var s = ALIAS[spec] || spec;
    return Object.prototype.hasOwnProperty.call(SEM, s) ? s : null;
  }
  function readPalette(el) {
    var cs = null, core = null, pal = {};
    try { cs = getComputedStyle(el || document.documentElement); } catch (e) { cs = null; }
    for (var k in SEM) {
      var v = cs ? String(cs.getPropertyValue(SEM[k][1]) || '').trim() : '';
      if (!v) {
        if (core === null) { try { core = (window.CYL && window.CYL.colors) ? (window.CYL.colors() || {}) : {}; } catch (e) { core = {}; } }
        v = core[SEM[k][0]] || FALLBACK_HEX[k];
      }
      pal[k] = v;
    }
    return pal;
  }
  function parseColor(str, out) {
    var m;
    str = String(str || '').trim();
    if ((m = /^#([0-9a-f]{3,8})$/i.exec(str))) {
      var h = m[1];
      if (h.length === 3 || h.length === 4) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      if (h.length !== 6 && h.length !== 8) return false;
      var n = parseInt(h.slice(0, 6), 16);
      out.setRGB(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, THREE.SRGBColorSpace);
      return true;
    }
    if ((m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(str))) {
      out.setRGB(clamp(+m[1] / 255, 0, 1), clamp(+m[2] / 255, 0, 1), clamp(+m[3] / 255, 0, 1), THREE.SRGBColorSpace);
      return true;
    }
    if ((m = /^color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i.exec(str))) {
      out.setRGB(clamp(+m[1], 0, 1), clamp(+m[2], 0, 1), clamp(+m[3], 0, 1), THREE.SRGBColorSpace);
      return true;
    }
    return false;
  }
  var _probe = null;
  function toColor(str, out) {
    if (parseColor(str, out)) return out;
    try { // let the browser normalize anything else (named colors, hsl(), color-mix()…)
      if (!_probe) {
        _probe = document.createElement('span');
        _probe.style.display = 'none';
        _probe.setAttribute('aria-hidden', 'true');
        (document.body || document.documentElement).appendChild(_probe);
      }
      _probe.style.color = '';
      _probe.style.color = String(str);
      if (_probe.style.color && parseColor(getComputedStyle(_probe).color, out)) return out;
    } catch (e) { /* ignore */ }
    out.setRGB(0.5, 0.5, 0.5, THREE.SRGBColorSpace);
    return out;
  }
  function cssColorValue(spec) {
    var s = semName(spec);
    return s ? 'var(' + SEM[s][1] + ')' : String(spec);
  }

  /* ------------------------------------------------------------------------
     TeX → plain runs, used only to draw labels into v.screenshot() PNGs
     (KaTeX HTML cannot be rasterized into a canvas portably).
     ------------------------------------------------------------------------ */
  var SYM = {
    alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', Delta: 'Δ', epsilon: 'ε', varepsilon: 'ε', theta: 'θ',
    vartheta: 'ϑ', Theta: 'Θ', lambda: 'λ', mu: 'μ', nu: 'ν', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ',
    phi: 'φ', varphi: 'φ', Phi: 'Φ', omega: 'ω', Omega: 'Ω', ell: 'ℓ', infty: '∞', cdot: '·', times: '×',
    circ: '∘', prime: '′', pm: '±', approx: '≈', le: '≤', ge: '≥', leq: '≤', geq: '≥', to: '→', ne: '≠',
    degree: '°', partial: '∂', nabla: '∇', dots: '…', ldots: '…',
    gamma: 'γ', Gamma: 'Γ', zeta: 'ζ', eta: 'η', iota: 'ι', kappa: 'κ', xi: 'ξ', Xi: 'Ξ', upsilon: 'υ', chi: 'χ',
    psi: 'ψ', Psi: 'Ψ', Lambda: 'Λ', Sigma: 'Σ', Pi: 'Π', varrho: 'ρ', neq: '≠', cdots: '⋯', sim: '∼', propto: '∝',
    perp: '⊥', parallel: '∥', in: '∈', mp: '∓', div: '÷', lt: '<', gt: '>', rightarrow: '→', leftarrow: '←',
    Rightarrow: '⇒', int: '∫', iint: '∬', iiint: '∭', oint: '∮', sum: '∑', prod: '∏'
  };
  var GREEK_IT = {};
  'alpha beta gamma delta epsilon varepsilon theta vartheta lambda mu nu pi rho sigma tau phi varphi omega zeta eta iota kappa xi upsilon chi psi varrho'.split(' ').forEach(function (k) { GREEK_IT[k] = 1; });
  // Operator names are printed upright (u_{\max} → "u" with subscript "max", not "u")
  var OPNAME = {};
  'max min sup inf lim sin cos tan sec csc cot sinh cosh tanh arcsin arccos arctan ln log exp det arg deg dim ker gcd Pr'.split(' ').forEach(function (k) { OPNAME[k] = 1; });
  var EXPAND = {
    er: '\\mathbf{u}_r', et: '\\mathbf{u}_\\theta', ez: '\\mathbf{u}_z',
    ihat: '\\mathbf{i}', jhat: '\\mathbf{j}', khat: '\\mathbf{k}',
    rvec: '\\mathbf{r}', vvec: '\\mathbf{v}', avec: '\\mathbf{a}', Fvec: '\\mathbf{F}',
    atantwo: '\\operatorname{atan2}', dd: '\\mathrm{d}'
  };
  function texRuns(tex) {
    var runs = [];
    function push(text, st) {
      if (!text) return;
      var last = runs[runs.length - 1];
      if (last && last.lvl === st.lvl && last.b === st.b && last.it === st.it) last.t += text;
      else runs.push({ t: text, lvl: st.lvl, b: st.b, it: st.it });
    }
    function group(s, i) { // read {…} or a single token starting at i → [content, nextIndex]
      while (s[i] === ' ') i++;
      if (s[i] === '{') {
        var depth = 1, j = i + 1;
        while (j < s.length && depth) { if (s[j] === '{') depth++; else if (s[j] === '}') depth--; j++; }
        return [s.slice(i + 1, j - 1), j];
      }
      if (s[i] === '\\') { var m = /^\\([a-zA-Z]+|.)/.exec(s.slice(i)); return m ? [m[0], i + m[0].length] : ['', i + 1]; }
      return [s[i] || '', i + 1];
    }
    function parse(s, st, depth) {
      if (depth > 12) return;
      var i = 0, g, m;
      while (i < s.length) {
        var c = s[i];
        if (c === '\\') {
          m = /^\\([a-zA-Z]+)/.exec(s.slice(i));
          if (!m) { var nc = s[i + 1] || ''; push(/[,;: !]/.test(nc) ? ' ' : nc, st); i += 2; continue; }
          var name = m[1]; i += m[0].length;
          if (EXPAND[name]) parse(EXPAND[name], st, depth + 1);
          else if (SYM[name]) push(SYM[name], { lvl: st.lvl, b: st.b, it: st.it && GREEK_IT[name] === 1 });
          else if (name === 'mathbf' || name === 'boldsymbol' || name === 'bm') { g = group(s, i); i = g[1]; parse(g[0], { lvl: st.lvl, b: true, it: name !== 'mathbf' }, depth + 1); }
          else if (/^(mathrm|text|textrm|operatorname|mathsf|textbf|mathit|textit)$/.test(name)) { g = group(s, i); i = g[1]; parse(g[0], { lvl: st.lvl, b: st.b || name === 'textbf', it: name === 'mathit' || name === 'textit' }, depth + 1); }
          else if (name === 'hat' || name === 'vec' || name === 'bar' || name === 'dot' || name === 'ddot' || name === 'tilde') {
            g = group(s, i); i = g[1]; parse(g[0], st, depth + 1);
            var acc = { hat: '̂', vec: '⃗', bar: '̄', dot: '̇', ddot: '̈', tilde: '̃' }[name];
            if (runs.length) runs[runs.length - 1].t += acc;
          }
          else if (name === 'htmlClass' || name === 'textcolor' || name === 'color') { g = group(s, i); i = g[1]; if (name !== 'color') { g = group(s, i); i = g[1]; parse(g[0], st, depth + 1); } }
          else if (/^col[RTZXYVA]$/.test(name) || name === 'boxed' || name === 'displaystyle') { if (name !== 'displaystyle') { g = group(s, i); i = g[1]; parse(g[0], st, depth + 1); } }
          else if (name === 'frac' || name === 'tfrac' || name === 'dfrac') { g = group(s, i); i = g[1]; parse(g[0], st, depth + 1); push('/', { lvl: st.lvl, b: false, it: false }); g = group(s, i); i = g[1]; parse(g[0], st, depth + 1); }
          else if (name === 'sqrt') { push('√', { lvl: st.lvl, b: false, it: false }); g = group(s, i); i = g[1]; parse(g[0], st, depth + 1); }
          else if (name === 'quad' || name === 'qquad') push(' ', st);
          else if (OPNAME[name] === 1) {
            var prevRun = runs[runs.length - 1];
            if (prevRun && prevRun.lvl === st.lvl && /[A-Za-z0-9\u0370-\u03ff)\u2032]$/.test(prevRun.t)) push('\u2009', { lvl: st.lvl, b: false, it: false });   // "r\cos" → "r cos"
            push(name, { lvl: st.lvl, b: st.b, it: false });
            if (/^(?:[A-Za-z0-9]|\\(?!left|right|big|Big)[A-Za-z])/.test(s.slice(i))) push('\u2009', st);   // "\cos\theta" → "cos θ"
          }
          // \left, \right and anything unknown: dropped
          continue;
        }
        if (c === '_' || c === '^') {
          g = group(s, i + 1); i = g[1];
          if (c === '^' && (g[0] === '\\circ' || g[0] === '\\degree')) { push('°', { lvl: st.lvl, b: false, it: false }); continue; }
          parse(g[0], { lvl: st.lvl + (c === '^' ? 1 : -1), b: st.b, it: st.it }, depth + 1);
          continue;
        }
        if (c === '{') { g = group(s, i); i = g[1]; parse(g[0], st, depth + 1); continue; }
        if (c === '}' || c === '$') { i++; continue; }
        if (c === "'") { push('′', { lvl: st.lvl, b: false, it: false }); i++; continue; }
        if (c === '~') { push(' ', st); i++; continue; }
        push(c, { lvl: st.lvl, b: st.b, it: st.it && /[a-zA-Z]/.test(c) });
        i++;
      }
    }
    parse(String(tex || ''), { lvl: 0, b: false, it: true }, 0);
    return runs;
  }

  /* ------------------------------------------------------------------------
     WebGL availability (three r186 requires WebGL 2)
     ------------------------------------------------------------------------ */
  var _avail = null;
  function available() {
    if (_avail !== null) return _avail;
    _avail = false;
    try {
      if (!THREE || !THREE.WebGLRenderer || !THREE.OrbitControls || !THREE.CSS2DRenderer || !THREE.LineSegments2) return false;
      var c = document.createElement('canvas');
      var gl = c.getContext('webgl2');
      _avail = !!gl;
      if (gl) { var ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); }
    } catch (e) { _avail = false; }
    return _avail;
  }

  /* ------------------------------------------------------------------------
     Page-wide hooks shared by all viewers (theme, tab visibility, fonts)
     ------------------------------------------------------------------------ */
  var live = [];          // internal records of live viewers
  var hooked = false, themeKey = null, uid = 0;
  function currentThemeKey() {
    var de = document.documentElement;
    var dark = false;
    try { dark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); } catch (e) { /* ignore */ }
    return (de.getAttribute('data-theme') || '') + '|' + dark;
  }
  function themeChanged(force) {
    var k = currentThemeKey();
    if (!force && k === themeKey) return;
    themeKey = k;
    live.slice().forEach(function (rec) { rec.applyTheme(); });
  }
  function hookGlobal() {
    if (hooked) return;
    hooked = true;
    themeKey = currentThemeKey();
    try {
      if (window.CYL && window.CYL.theme && typeof window.CYL.theme.onChange === 'function') {
        window.CYL.theme.onChange(function () { themeChanged(true); });
      }
    } catch (e) { /* ignore */ }
    try { new MutationObserver(function () { themeChanged(false); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); } catch (e) { /* ignore */ }
    try {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var f = function () { setTimeout(function () { themeChanged(false); }, 0); };
      if (mq.addEventListener) mq.addEventListener('change', f); else if (mq.addListener) mq.addListener(f);
    } catch (e) { /* ignore */ }
    document.addEventListener('visibilitychange', function () { live.slice().forEach(function (rec) { rec.wake(); }); });
    // WebGL canvases do not print reliably: swap in a PNG snapshot (with labels) while printing.
    // cyl-core's own beforeprint handler (registered earlier) has already switched to the light theme.
    window.addEventListener('beforeprint', function () { live.slice().forEach(function (rec) { rec.printOn(); }); });
    window.addEventListener('afterprint', function () { live.slice().forEach(function (rec) { rec.printOff(); }); });
    injectStyle();
    try {
      if (document.fonts && document.fonts.addEventListener) {
        document.fonts.addEventListener('loadingdone', function () { live.slice().forEach(function (rec) { rec.remeasure(); }); });
      }
    } catch (e) { /* ignore */ }
  }

  // The one stylesheet this library adds (print snapshot only; everything else is in module.css).
  function injectStyle() {
    if (document.getElementById('cyl3d-style')) return;
    var st = document.createElement('style');
    st.id = 'cyl3d-style';
    st.textContent = '.cyl3d > img.cyl3d-print{display:none}' +
      '@media print{.cyl3d > img.cyl3d-print{display:block;position:absolute;left:0;top:0;width:100%;height:100%;object-fit:contain}' +
      '.cyl3d.cyl3d-printing > canvas,.cyl3d.cyl3d-printing > .cyl3d-labels{visibility:hidden}}';
    (document.head || document.documentElement).appendChild(st);
  }

  /* ------------------------------------------------------------------------
     No-op stand-ins (WebGL unavailable)
     ------------------------------------------------------------------------ */
  var NOOP = (function () {
    var p;
    var f = function () { return p; };
    p = (typeof Proxy === 'function') ? new Proxy(f, {
      get: function (t, k) {
        if (k === 'then' || typeof k === 'symbol') return undefined;
        if (k === 'visible' || k === 'isObject3D') return false;
        if (k === 'length') return 0;
        return p;
      },
      set: function () { return true; },
      apply: function () { return p; }
    }) : f;
    return p;
  })();
  var PRIM_METHODS = ['setPosition', 'setText', 'setPoints', 'set', 'setFn', 'setVisible', 'setColor', 'setLabel', 'setOpacity', 'setSize'];

  function applyHeight(wrap, opts) {
    var a = num(opts.aspect, 0);
    if (a > 0) { wrap.style.minHeight = '0'; return a; }
    if (isNum(opts.height) && opts.height > 0) wrap.style.height = Math.round(opts.height) + 'px';
    else if (typeof opts.height === 'string' && opts.height) wrap.style.height = opts.height;
    return 0;
  }
  function aspectHeight(w, a) { return clamp(Math.round(w / a), 260, 640); }

  // The fallback returned when WebGL is unavailable: the same API as a live viewer (spec methods AND the
  // documented additions — axes, grid, getCamera, cylPoint.get, point.setSize, unitVectors/cartTriad
  // .arrows …) so page code never throws only on machines without WebGL. Everything draws nothing.
  function makeStub(container, opts, reason) {
    var T = window.THREE && window.THREE.Group ? window.THREE : null;
    var E = num(opts.extent, 4); if (!(E > 0)) E = 4;
    var S = E / 4;
    var wrap = null, ro = null, sizeRAF = 0, a = 0;
    function fitAspect() {
      sizeRAF = 0;
      if (!wrap || !wrap.parentNode) return;
      var w = wrap.clientWidth;
      if (w > 0) { var want = aspectHeight(w, a) + 'px'; if (wrap.style.height !== want) wrap.style.height = want; }
    }
    if (container) {
      wrap = document.createElement('div');
      wrap.className = 'cyl3d cyl3d-unavailable' + (opts.className ? ' ' + opts.className : '');
      wrap.style.position = 'relative';
      if (opts.background === 'transparent' || opts.background === 'none' || opts.background === false) wrap.style.background = 'transparent';
      a = applyHeight(wrap, opts);
      container.appendChild(wrap);
      if (a > 0) {
        wrap.style.height = aspectHeight(wrap.clientWidth || container.clientWidth || 600, a) + 'px';
        // follow the container width like a live viewer (deferred: resizing the observed box inside
        // its own ResizeObserver callback would loop)
        try { ro = new ResizeObserver(function () { if (!sizeRAF) sizeRAF = requestAnimationFrame(fitAspect); }); ro.observe(wrap); }
        catch (e) { ro = null; window.addEventListener('resize', fitAspect); }
      }
      var fb = document.createElement('div');
      fb.className = 'cyl3d-fallback';
      fb.setAttribute('role', 'img');
      fb.setAttribute('aria-label', (opts.ariaLabel ? String(opts.ariaLabel) + ' ' : '') + '(3D view unavailable)');
      var strong = document.createElement('strong');
      strong.textContent = '3D view unavailable';
      var p1 = document.createElement('p');
      p1.textContent = reason || 'Your browser could not start WebGL. Enable hardware acceleration (graphics acceleration) / WebGL in your browser settings, or try another browser, to see this interactive figure.';
      fb.appendChild(strong); fb.appendChild(p1);
      if (opts.ariaLabel) {
        var p2 = document.createElement('p');
        p2.className = 'small';
        p2.textContent = 'This figure shows: ' + String(opts.ariaLabel);
        fb.appendChild(p2);
      }
      wrap.appendChild(fb);
    }
    var root = T ? new T.Group() : NOOP;
    var scene = T ? new T.Scene() : NOOP;
    var axes = T ? new T.Group() : NOOP, grid = T ? new T.Group() : NOOP;
    if (T) { scene.add(axes); scene.add(grid); scene.add(root); axes.visible = opts.axes !== false; grid.visible = opts.grid !== 'none' && opts.grid !== false; }
    // a do-nothing primitive: a real (empty) Group carrying every update method of every primitive
    function prim(o, type) {
      if (!T) return NOOP;
      var g = new T.Group();
      g.userData.cylType = type;
      PRIM_METHODS.forEach(function (m) { g[m] = function () { return g; }; });
      g.getPosition = function () { return null; };
      ((o && o.parent && o.parent.isObject3D) ? o.parent : root).add(g);
      return g;
    }
    // camera state, so getCamera()/setView()/setCamera() round-trip as on a live viewer
    var zr = (Array.isArray(opts.zRange) && isNum(opts.zRange[0]) && isNum(opts.zRange[1])) ? opts.zRange : [-0.25 * E, 0.75 * E];
    var target = [0, 0, (zr[0] + zr[1]) / 2];
    var home = { az: 32, el: 25, zoom: 1, view: 'iso' };
    function camFrom(c) {
      var st = { az: home.az, el: home.el, zoom: 1, view: 'iso' };
      if (typeof c === 'string' && VIEWS[c]) return { az: VIEWS[c].az / DEG, el: VIEWS[c].el / DEG, zoom: 1, view: c };
      if (c && typeof c === 'object') {
        var t = vec3(c.target); if (t) target = t;
        var p = vec3(c.position);
        if (p) {
          var dx = p[0] - target[0], dy = p[1] - target[1], dz = p[2] - target[2], D = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (D > 1e-9) return { az: Math.atan2(dy, dx) / DEG, el: Math.asin(clamp(dz / D, -1, 1)) / DEG, zoom: 1, view: null };
        }
        if (c.view && VIEWS[c.view]) st = { az: VIEWS[c.view].az / DEG, el: VIEWS[c.view].el / DEG, zoom: 1, view: c.view };
        if (isNum(c.azimuth)) { st.az = c.azimuth; st.view = null; }
        if (isNum(c.elevation)) { st.el = clamp(c.elevation, -89.95, 89.95); st.view = null; }
        if (isNum(c.zoom) && c.zoom > 0) st.zoom = clamp(c.zoom, 0.2, 5);
      }
      return st;
    }
    home = camFrom(opts.camera == null ? 'iso' : opts.camera);
    var cam = Object.assign({}, home);
    var v = {
      THREE: window.THREE || null, scene: scene, root: root, axes: axes, grid: grid,
      camera: T ? new T.PerspectiveCamera() : NOOP, renderer: NOOP, controls: NOOP,
      el: wrap, canvas: null, extent: E, isFallback: true,
      render: function () {}, animate: function () { return function () {}; },
      setView: function (name) {
        if (name === 'reset' || name === 'home' || name == null) cam = Object.assign({}, home);
        else if (VIEWS[name]) cam = camFrom(name);
      },
      setCamera: function (c) { cam = camFrom(c); },
      setHome: function (c) { home = c == null ? Object.assign({}, cam) : camFrom(c); return v; },
      getCamera: function () {
        var D = 3.2 * E / cam.zoom, ce = Math.cos(cam.el * DEG);
        return {
          position: [target[0] + D * ce * Math.cos(cam.az * DEG), target[1] + D * ce * Math.sin(cam.az * DEG), target[2] + D * Math.sin(cam.el * DEG)],
          target: target.slice(), azimuth: cam.az, elevation: cam.el, zoom: cam.zoom, view: cam.view
        };
      },
      group: function (parent) { if (!T) return NOOP; var g = new T.Group(); ((parent && parent.isObject3D) ? parent : root).add(g); return g; },
      remove: function (o) { if (o && o.isObject3D && o !== scene && o !== root && o.parent) o.parent.remove(o); else if (o === root) v.clear(root); },
      clear: function (g) { g = g === undefined ? root : g; if (g && g.isObject3D && g.children) g.children.slice().forEach(function (c) { g.remove(c); }); },
      dispose: function () {
        if (ro) ro.disconnect(); else window.removeEventListener('resize', fitAspect);
        if (sizeRAF) cancelAnimationFrame(sizeRAF);
        ro = null; sizeRAF = 0;
        if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
      },
      screenshot: function () { return null; },
      onChange: function () { return function () {}; },
      setAriaLabel: function (text) {
        var fb = wrap && wrap.querySelector('.cyl3d-fallback');
        if (fb) fb.setAttribute('aria-label', String(text || '') + ' (3D view unavailable)');
      },
      stats: function () { return { frames: 0, renders: 0, animating: 0, onScreen: false, width: 0, height: 0, labels: 0, fallback: true }; }
    };
    ['label', 'line', 'arrow', 'curve', 'arc', 'cylinder', 'halfPlane', 'zPlane', 'wedge', 'surface'].forEach(function (n) {
      v[n] = function () {
        var args = arguments, o = (n === 'label' || n === 'line' || n === 'arrow') ? args[2] : n === 'curve' ? args[3] : n === 'surface' ? args[1] : args[0];
        return prim(o, n);
      };
    });
    v.point = function (pos, o) {
      var g = prim(o, 'point'), cur = vec3(pos);
      if (g === NOOP) return g;
      g.setPosition = function (p) { cur = vec3(p); return g; };
      g.getPosition = function () { return cur ? cur.slice() : null; };
      return g;
    };
    v.cylPoint = function (o) {
      o = o || {};
      var g = prim(o, 'cylPoint');
      if (g === NOOP) return g;
      var st = { r: num(o.r, 3 * S), theta: num(o.theta, Math.PI / 3), z: num(o.z, 2 * S) };
      g.set = function (p) { if (p) ['r', 'theta', 'z'].forEach(function (k) { if (p[k] !== undefined) st[k] = p[k]; }); return g; };
      g.get = function () { return { r: st.r, theta: st.theta, z: st.z }; };
      g.getPosition = function () {
        return (isNum(st.r) && isNum(st.theta) && isNum(st.z)) ? [st.r * Math.cos(st.theta), st.r * Math.sin(st.theta), st.z] : null;
      };
      return g;
    };
    v.unitVectors = function (o) {
      var g = prim(o, 'unitVectors');
      if (g !== NOOP) g.arrows = { r: prim({ parent: g }, 'arrow'), t: prim({ parent: g }, 'arrow'), z: prim({ parent: g }, 'arrow') };
      return g;
    };
    v.cartTriad = function (o) {
      var g = prim(o, 'cartTriad');
      if (g !== NOOP) g.arrows = { i: prim({ parent: g }, 'arrow'), j: prim({ parent: g }, 'arrow'), k: prim({ parent: g }, 'arrow') };
      return g;
    };
    return v;
  }

  /* ------------------------------------------------------------------------
     create()
     ------------------------------------------------------------------------ */
  function create(container, opts) {
    opts = opts || {};
    if (typeof container === 'string') container = document.querySelector(container);
    if (!container || typeof container.appendChild !== 'function') {
      report('create(): container element not found');
      return makeStub(null, opts);
    }
    if (opts.fallback === true || !available()) return makeStub(container, opts);
    try {
      return makeViewer(container, opts);
    } catch (e) {
      report('could not start the 3D view', e);
      return makeStub(container, opts);
    }
  }

  var VIEWS = {
    iso: { az: 32 * DEG, el: 25 * DEG },
    top: { az: -90 * DEG, el: 89.95 * DEG },
    front: { az: -90 * DEG, el: 0 },       // from −y: the xz-plane, x to the right
    side: { az: 0, el: 0 }                 // from +x: the yz-plane, y to the right
  };
  var ICON_RESET = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 3.8v4.6h4.6"/></svg>';
  var ICON_FS = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
  var UI_DEFS = {
    iso: { text: '3D', aria: '3D view' },
    top: { text: 'Top', aria: 'Top view (looking down the z-axis)' },
    front: { text: 'Front', aria: 'Front view (the xz-plane)' },
    side: { text: 'Side', aria: 'Side view (the yz-plane)' },
    reset: { icon: ICON_RESET, aria: 'Reset view' },
    fullscreen: { icon: ICON_FS, aria: 'Full screen' }
  };

  function makeViewer(container, opts) {
    hookGlobal();

    /* ---------------- options ---------------- */
    var E = num(opts.extent, 4); if (!(E > 0)) E = 4;
    var S = E / 4;                               // scale for world-size defaults (spec values are for extent 4)
    // Coordinates (lengths, not angles) larger than this are treated as degenerate: the object is hidden.
    // Far beyond anything drawable (the far plane is 250·extent; float32 keeps ~7 digits), and it keeps
    // every vertex well inside float32 range (beyond ~3.4e38 values become Infinity → NaN bounds).
    var BIG = Math.min(1e6 * E, 1e30);
    function fin(x) { return isNum(x) && Math.abs(x) <= BIG; }
    function pos3(p) { var a = vec3(p); return (a && fin(a[0]) && fin(a[1]) && fin(a[2])) ? a : null; }
    var zr = (Array.isArray(opts.zRange) && isNum(opts.zRange[0]) && isNum(opts.zRange[1]) && opts.zRange[1] > opts.zRange[0])
      ? [opts.zRange[0], opts.zRange[1]] : [-0.25 * E, 0.75 * E];
    var ZC = (zr[0] + zr[1]) / 2;
    var gridMode = (opts.grid === 'cartesian' || opts.grid === 'none') ? opts.grid : (opts.grid === false ? 'none' : 'polar');
    var showAxes = opts.axes !== false;
    var showAxisLabels = opts.axisLabels !== false;
    var controlsOn = opts.controls !== false;
    var bgSpec = opts.background == null ? 'viz' : opts.background;
    var transparentBg = bgSpec === 'transparent' || bgSpec === 'none' || bgSpec === false;
    var ariaText = opts.ariaLabel ? String(opts.ariaLabel) : 'Interactive 3D figure';
    if (!opts.ariaLabel) warn('create(): opts.ariaLabel is required (a text description of the figure).');

    /* ---------------- DOM ---------------- */
    var id = ++uid;
    var wrap = document.createElement('div');
    wrap.className = 'cyl3d' + (opts.className ? ' ' + opts.className : '');
    wrap.style.position = 'relative';
    wrap.style.overflow = 'hidden';
    if (transparentBg) wrap.style.background = 'transparent';   // module.css paints .cyl3d with --viz-bg
    var aspectOpt = applyHeight(wrap, opts);
    container.appendChild(wrap);
    if (aspectOpt > 0) wrap.style.height = aspectHeight(wrap.clientWidth || container.clientWidth || 600, aspectOpt) + 'px';
    else if (opts.height == null && wrap.clientWidth > 0 && wrap.clientHeight < 60) wrap.style.height = '420px'; // stylesheet missing

    var renderer = null;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: transparentBg, powerPreference: 'default' });
    } catch (e) {
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      throw e;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    var canvas = renderer.domElement;
    canvas.style.position = 'absolute';
    canvas.style.left = '0';
    canvas.style.top = '0';
    canvas.style.display = 'block';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', ariaText);
    wrap.appendChild(canvas);

    var descEl = null;
    if (controlsOn) {
      canvas.tabIndex = 0;
      descEl = document.createElement('p');
      descEl.id = 'cyl3d-desc-' + id;
      descEl.className = 'visually-hidden';
      descEl.style.cssText = 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;';
      descEl.textContent = 'Interactive 3D view. Drag to rotate. When the view has keyboard focus: arrow keys rotate, plus and minus zoom, Home resets the view.';
      wrap.appendChild(descEl);
      canvas.setAttribute('aria-describedby', descEl.id);
    }

    var labelRenderer = new THREE.CSS2DRenderer();
    var labelLayer = labelRenderer.domElement;
    labelLayer.className = 'cyl3d-labels';
    labelLayer.setAttribute('aria-hidden', 'true');
    labelLayer.style.position = 'absolute';
    labelLayer.style.left = '0';
    labelLayer.style.top = '0';
    labelLayer.style.pointerEvents = 'none';
    labelLayer.style.zIndex = '1';
    wrap.appendChild(labelLayer);

    /* ---------------- scene ---------------- */
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(32, 1.6, E * 0.004, E * 250);
    camera.up.set(0, 0, 1);
    scene.add(camera);
    var hemi = new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.5);
    hemi.position.set(0, 0, 1);
    scene.add(hemi);
    var sun = new THREE.DirectionalLight(0xffffff, 1.45);
    sun.position.set(0.5 * E, 1.5 * E, 0);          // camera-relative "headlight", above and to the right
    camera.add(sun);
    sun.target.position.set(0, 0, ZC);
    scene.add(sun.target);

    var decor = new THREE.Group(); decor.name = 'cyl3d-decor'; scene.add(decor);
    var root = new THREE.Group(); root.name = 'cyl3d-root'; scene.add(root);

    // Per-viewer shared geometries (never disposed until the viewer is).
    var geoSphere = new THREE.SphereGeometry(1, 28, 18);
    var geoCone = new THREE.ConeGeometry(1, 1, 24, 1); geoCone.rotateX(Math.PI / 2); geoCone.translate(0, 0, 0.5);   // base z=0, tip z=1
    var geoShaft = new THREE.CylinderGeometry(1, 1, 1, 18, 1, false); geoShaft.rotateX(Math.PI / 2); geoShaft.translate(0, 0, 0.5);
    [geoSphere, geoCone, geoShaft].forEach(function (g) { g.userData.cylShared = true; });
    var ZAXIS = new THREE.Vector3(0, 0, 1);

    /* ---------------- state ---------------- */
    var v = {};
    var W = 0, H = 0;
    var disposed = false;
    var raf = 0, needsRender = true, lastT = 0;
    var onScreen = true;
    var anims = [];
    var tween = null;
    var changeFns = [], changeTimer = 0;
    var frames = 0, renders = 0;
    var labels = new Set();
    var colorReg = new Map();
    var palette = readPalette(wrap);
    var currentView = null;
    var pendingCam = null;     // a view set while the container had no size (hidden tab, closed <details>)
    var uiButtons = {};
    var hintEl = null, hintTimer = 0;

    /* ---------------- colors ---------------- */
    function resolveCss(spec) {
      var s = semName(spec);
      return s ? palette[s] : String(spec);
    }
    function paint(mat, spec) {
      if (spec == null || spec === '') spec = 'ink';
      colorReg.set(mat, spec);
      toColor(resolveCss(spec), mat.color);
      return mat;
    }
    function applyBackground() {
      if (transparentBg) { renderer.setClearColor(0x000000, 0); return; }
      var c = new THREE.Color();
      toColor(resolveCss(bgSpec), c);
      renderer.setClearColor(c, 1);
    }
    function applyTheme() {
      if (disposed) return;
      palette = readPalette(wrap);
      colorReg.forEach(function (spec, mat) { toColor(resolveCss(spec), mat.color); });
      applyBackground();
      // redraw now (not next frame) so print snapshots and screenshots taken right after a theme
      // switch already use the new colors
      if (W > 0 && H > 0) draw(); else needsRender = true;
    }
    applyBackground();

    /* ---------------- materials ---------------- */
    function lineMat(o) {
      var op = clamp(num(o.opacity, 1), 0, 1);
      var m = new THREE.LineMaterial({
        linewidth: Math.max(0.1, num(o.width, 2)),
        dashed: !!o.dashed,
        dashSize: Math.max(1e-6, num(o.dashSize, 0.1 * S)),
        gapSize: Math.max(1e-6, num(o.gapSize, 0.07 * S)),
        transparent: op < 1, opacity: op, depthWrite: op >= 1
      });
      m.resolution.set(Math.max(1, W), Math.max(1, H));
      return paint(m, o.color);
    }
    function stdMat(spec) { return paint(new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.05 }), spec); }
    function basicMat(spec) { return paint(new THREE.MeshBasicMaterial(), spec); }
    function tintMat(spec, op) {
      return paint(new THREE.MeshBasicMaterial({
        transparent: op < 1, opacity: op, side: THREE.DoubleSide, depthWrite: op >= 1,
        polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
      }), spec);
    }
    function shadeMat(spec, op, doubleSided) {
      return paint(new THREE.MeshStandardMaterial({
        roughness: 0.62, metalness: 0.0, transparent: op < 1, opacity: op,
        side: doubleSided === false ? THREE.FrontSide : THREE.DoubleSide,
        depthWrite: op >= 0.5, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
      }), spec);
    }
    function setOpacity(mat, op, depthAt) {
      op = clamp(num(op, 1), 0, 1);
      var wasT = mat.transparent;
      mat.opacity = op;
      mat.transparent = op < 1;
      mat.depthWrite = op >= (depthAt == null ? 1 : depthAt);
      if (wasT !== mat.transparent) mat.needsUpdate = true;
    }

    /* ---------------- thick lines (LineSegments2) ---------------- */
    function newLine(o) {
      var line = new THREE.LineSegments2(new THREE.LineSegmentsGeometry(), lineMat(o));
      line.frustumCulled = false;
      line.visible = false;
      line.userData.cylN = 0;
      if (o.under) { line.renderOrder = -1; line.material.depthWrite = false; }
      return line;
    }
    // Write n segments (6 floats each). Same count → update the GPU buffer in place.
    // Different count → replace the geometry: an instanced geometry cannot grow after its
    // first render (three caches _maxInstanceCount), so resizing in place would silently clip.
    function setSegs(line, segs, n) {
      if (!(n > 0)) return false;
      var g = line.geometry, st = g.attributes.instanceStart, i;
      if (st && line.userData.cylN === n) {
        var arr = st.data.array;
        for (i = 0; i < 6 * n; i++) arr[i] = segs[i];
        st.data.needsUpdate = true;
      } else {
        var a = new Float32Array(6 * n);
        for (i = 0; i < 6 * n; i++) a[i] = segs[i];
        var ng = new THREE.LineSegmentsGeometry();
        ng.setPositions(a);
        line.geometry = ng;
        g.dispose();
        line.userData.cylN = n;
      }
      if (line.material.dashed) lineDistances(line);
      return true;
    }
    function lineDistances(line) {
      var g = line.geometry, st = g.attributes.instanceStart;
      if (!st) return;
      var n = st.count, a = st.data.array;
      var ds = g.attributes.instanceDistanceStart;
      var reuse = ds && ds.data.array.length === 2 * n;
      var d = reuse ? ds.data.array : new Float32Array(2 * n);
      var acc = 0;
      for (var i = 0; i < n; i++) {
        var o = i * 6, dx = a[o + 3] - a[o], dy = a[o + 4] - a[o + 1], dz = a[o + 5] - a[o + 2];
        d[2 * i] = acc;
        acc += Math.sqrt(dx * dx + dy * dy + dz * dz);
        d[2 * i + 1] = acc;
      }
      if (reuse) { ds.data.needsUpdate = true; return; }
      var ib = new THREE.InstancedInterleavedBuffer(d, 2, 1);
      g.setAttribute('instanceDistanceStart', new THREE.InterleavedBufferAttribute(ib, 1, 0));
      g.setAttribute('instanceDistanceEnd', new THREE.InterleavedBufferAttribute(ib, 1, 1));
    }
    function show(line, cond) { line.visible = !!cond && line.userData.cylN > 0; }
    // Polyline → segment list. Invalid (null / non-finite) points break the line.
    function polyToSegs(pts, closed, limit) {
      var out = [], n = 0, prev = null, first = null, brk = false;
      for (var i = 0; i < pts.length; i++) {
        var p = vec3(pts[i]);
        if (p && limit && (Math.abs(p[0]) > limit || Math.abs(p[1]) > limit || Math.abs(p[2]) > limit)) p = null;
        if (!p) brk = true;
        if (p && prev && (p[0] !== prev[0] || p[1] !== prev[1] || p[2] !== prev[2])) {
          out.push(prev[0], prev[1], prev[2], p[0], p[1], p[2]); n++;
        }
        if (p && !first) first = p;
        prev = p;
      }
      if (closed && !brk && first && prev && n > 1) { out.push(prev[0], prev[1], prev[2], first[0], first[1], first[2]); n++; }
      return { a: out, n: n };
    }
    function arcPoints(out, r, a0, a1, z, n) {
      for (var i = 0; i < n; i++) {
        var u = a0 + (a1 - a0) * i / n, w = a0 + (a1 - a0) * (i + 1) / n;
        out.push(r * Math.cos(u), r * Math.sin(u), z, r * Math.cos(w), r * Math.sin(w), z);
      }
      return n;
    }

    /* ---------------- labels ---------------- */
    function makeLabel(text, o) {
      o = o || {};
      var el = document.createElement('div');
      el.className = 'cyl3d-label' + (o.background ? ' bg' : '') + (o.className ? ' ' + o.className : '');
      var obj = new THREE.CSS2DObject(el);
      obj.userData.cyl = {
        tex: o.tex !== false, off: (o.offset && o.offset.length) ? [num(+o.offset[0], 0), num(+o.offset[1], 0)] : [0, 0],
        place: o.place || null, prio: num(o.prio, 5), hideOnCollide: !!o.hideOnCollide,
        obstacle: o.obstacle !== false, hidden: false, empty: true, shown: true, w: 0, h: 0, text: null
      };
      setLabelColor(obj, o.color);
      setLabelText(obj, text);
      labels.add(obj);
      return obj;
    }
    function setLabelText(obj, text) {
      var ud = obj.userData.cyl;
      text = text == null ? '' : String(text);
      if (ud.text === text) return;
      ud.text = text;
      ud.empty = !text;
      if (ud.tex) obj.element.innerHTML = text ? texHTML(text) : '';
      else obj.element.textContent = text;
      ud.w = ud.h = 0;
      requestRender();
    }
    function setLabelColor(obj, spec) {
      obj.element.style.color = (spec == null || spec === '') ? '' : cssColorValue(spec);
    }
    function setShown(el, ud, on) {
      if (ud.shown === on) return;
      ud.shown = on;
      el.style.visibility = on ? '' : 'hidden';
    }
    function isAttached(o) {
      while (o) { if (o === scene) return true; o = o.parent; }
      return false;
    }

    /* ---------------- projection helpers (for label layout) ---------------- */
    var _p = new THREE.Vector3(), _q = new THREE.Vector3(), _camRight = new THREE.Vector3();
    function projVec(vec) {
      vec.project(camera);
      return [(vec.x + 1) * 0.5 * W, (1 - vec.y) * 0.5 * H, vec.z];
    }
    var ctx = {
      W: 0, H: 0, anchor: [0, 0], camEl: 0,
      projWorld: function (x, y, z) { return projVec(_p.set(x, y, z)); },
      projLocal: function (obj, x, y, z) { return projVec(_p.set(x, y, z).applyMatrix4(obj.matrixWorld)); },
      // on-screen length (px) of a world-space length `len` placed at world point `wp`
      pxLen: function (wp, len) {
        _camRight.setFromMatrixColumn(camera.matrixWorld, 0);
        var a = projVec(_p.copy(wp)), b = projVec(_q.copy(wp).addScaledVector(_camRight, len));
        return hypot(b[0] - a[0], b[1] - a[1]);
      }
    };
    function boxAt(an, dx, dy, w, h) {
      var cx = an[0] + dx, cy = an[1] + dy;
      return [cx - w / 2 - 1, cy - h / 2 - 1, cx + w / 2 + 1, cy + h / 2 + 1];
    }
    function hits(b, boxes) {
      for (var i = 0; i < boxes.length; i++) {
        var o = boxes[i];
        if (b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]) return true;
      }
      return false;
    }
    var _wp = new THREE.Vector3();
    // After CSS2DRenderer positioned every label at its anchor, choose a screen offset for each:
    // fixed px offsets, or smart placement (preferred directions away from the lines that meet at the
    // anchor), resolving collisions in priority order. Offsets are appended to the CSS2D transform.
    // Screen-space segments that labels should not sit on: registered per primitive through
    // obj.userData.cylSegs(ctx, out) (construction lines, legs, arrows, axes).
    var segSources = new Set();
    function shownChain(o) {
      while (o) { if (o.visible === false) return false; if (o === scene) return true; o = o.parent; }
      return false;
    }
    function segHitsBox(sg, b) {        // Liang–Barsky clip of segment against box
      var x0 = sg[0], y0 = sg[1], dx = sg[2] - x0, dy = sg[3] - y0, t0 = 0, t1 = 1;
      var P = [-dx, dx, -dy, dy], Q = [x0 - b[0], b[2] - x0, y0 - b[1], b[3] - y0];
      for (var i = 0; i < 4; i++) {
        if (P[i] === 0) { if (Q[i] < 0) return false; }
        else {
          var t = Q[i] / P[i];
          if (P[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
          else { if (t < t0) return false; if (t < t1) t1 = t; }
        }
      }
      return true;
    }
    // Does the path from the anchor a to the label centre c cross a line that does not pass through a?
    function crossesLine(a, c, segs) {
      if (!segs) return false;
      for (var i = 0; i < segs.length; i++) {
        var sg = segs[i], ex = sg[2] - sg[0], ey = sg[3] - sg[1], L2 = ex * ex + ey * ey;
        if (L2 < 1e-9) continue;
        var ca = (a[0] - sg[0]) * ey - (a[1] - sg[1]) * ex, cc = (c[0] - sg[0]) * ey - (c[1] - sg[1]) * ex;
        if (Math.abs(ca) / Math.sqrt(L2) < 1.5 || ca * cc > 0) continue;      // line through the anchor / same side
        var dx = c[0] - a[0], dy = c[1] - a[1];
        var s1 = (sg[0] - a[0]) * dy - (sg[1] - a[1]) * dx, s2 = (sg[2] - a[0]) * dy - (sg[3] - a[1]) * dx;
        if (s1 * s2 <= 0) return true;
      }
      return false;
    }
    function countHits(b, boxes, segs) {
      var n = 0, i, o;
      for (i = 0; i < boxes.length; i++) { o = boxes[i]; if (b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]) n += 100; }
      if (segs) for (i = 0; i < segs.length; i++) if (segHitsBox(segs[i], b)) n += 10;
      return n;
    }
    // After CSS2DRenderer positioned every label at its anchor, choose a screen offset for each:
    // fixed px offsets, or smart placement — candidate directions (preferred first) scored against
    // labels already placed (priority order) and against projected construction lines. Offsets are
    // appended to the CSS2D transform.
    function layoutLabels() {
      if (!labels.size) return;
      var list = [], smart = false;
      labels.forEach(function (lb) {
        var el = lb.element, ud = lb.userData.cyl;
        if (!isAttached(lb)) { labels.delete(lb); if (el.parentNode) el.parentNode.removeChild(el); return; }
        if (el.style.display === 'none') return;
        if (ud.hidden || ud.empty) { setShown(el, ud, false); return; }
        if (ud.place) smart = true;
        list.push(lb);
      });
      list.sort(function (a, b) { return b.userData.cyl.prio - a.userData.cyl.prio; });
      ctx.W = W; ctx.H = H;
      _f.copy(camera.position).sub(controls.target).normalize();
      ctx.camEl = Math.asin(clamp(_f.z, -1, 1));
      var segs = null;
      if (smart && segSources.size) {
        segs = [];
        segSources.forEach(function (src) {
          if (!isAttached(src)) { segSources.delete(src); return; }
          if (!shownChain(src)) return;
          try { src.userData.cylSegs(ctx, segs); } catch (e) { /* ignore */ }
        });
      }
      var boxes = [];
      for (var i = 0; i < list.length; i++) {
        var lb = list[i], el = lb.element, ud = lb.userData.cyl;
        if (!ud.w) { ud.w = el.offsetWidth; ud.h = el.offsetHeight; }
        var w = ud.w, h = ud.h;
        _wp.setFromMatrixPosition(lb.matrixWorld);
        var an = projVec(_wp);
        ctx.anchor = an;
        var spec = null;
        if (ud.place) {
          try { spec = ud.place(ctx, lb); } catch (e) { spec = { offset: ud.off }; }
        } else spec = { offset: ud.off };
        if (!spec) { setShown(el, ud, false); continue; }
        var dx = 0, dy = 0, best = 0;
        if (spec.offset) {
          dx = spec.offset[0]; dy = spec.offset[1];
          best = countHits(boxAt(an, dx, dy, w, h), boxes, null);
        } else {
          var gap = num(spec.gap, 6);
          best = Infinity;
          // spec.dirs first (near, then 9 px farther); spec.alt (near only, so a label never jumps across
          // a neighbouring line) when every one of those is blocked
          var sets = spec.alt ? [spec.dirs, spec.alt] : [spec.dirs];
          for (var si = 0; si < sets.length && best > 0; si++) {
            var dirs = sets[si];
            for (var pass = 0; pass < (si ? 1 : 2) && best > 0; pass++) {
              for (var j = 0; j < dirs.length; j++) {
                var d = dirs[j];
                var t = gap + pass * 9 + Math.abs(d[0]) * w / 2 + Math.abs(d[1]) * h / 2;
                var cx = d[0] * t, cy = d[1] * t;
                var sc = countHits(boxAt(an, cx, cy, w, h), boxes, segs);
                if (si && crossesLine(an, [an[0] + cx, an[1] + cy], segs)) sc += 10;
                if (sc < best) { best = sc; dx = cx; dy = cy; }
                if (sc === 0) break;
              }
            }
          }
        }
        if (best >= 100 && ud.hideOnCollide) { setShown(el, ud, false); continue; }
        // spec.hideOnLine: a label that could only sit ON a construction line (a line through the middle of the
        // glyph, not just grazing the box) is left out instead
        if (best >= 10 && spec.hideOnLine && ud.hideOnCollide && segs) {
          var ccx = an[0] + dx, ccy = an[1] + dy, core = [ccx - w * 0.3, ccy - h * 0.3, ccx + w * 0.3, ccy + h * 0.3], onLine = false;
          for (var q = 0; q < segs.length && !onLine; q++) onLine = segHitsBox(segs[q], core);
          if (onLine) { setShown(el, ud, false); continue; }
        }
        // keep labels whose anchor is on screen fully inside the viewport
        if (an[0] >= 0 && an[0] <= W && an[1] >= 0 && an[1] <= H) {
          var l = an[0] + dx - w / 2, r = an[0] + dx + w / 2, tp = an[1] + dy - h / 2, bt = an[1] + dy + h / 2;
          if (l < 2) dx += 2 - l; else if (r > W - 2) dx -= r - (W - 2);
          if (tp < 2) dy += 2 - tp; else if (bt > H - 2) dy -= bt - (H - 2);
        }
        setShown(el, ud, true);
        if (dx || dy) el.style.transform += ' translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)';
        if (ud.obstacle) boxes.push(boxAt(an, dx, dy, w, h));
      }
    }

    /* ---------------- camera framing ---------------- */
    var AX = 1.15 * E;
    var zTop = Math.max(zr[1] + 0.15 * E, 0.3 * E);
    var zBot = Math.min(zr[0] - 0.075 * E, 0);
    var samples = (function () {
      var s = [], i, a, R = gridMode === 'none' ? E : 1.075 * E;
      for (i = 0; i < 24; i++) { a = i / 24 * TAU; s.push(new THREE.Vector3(R * Math.cos(a), R * Math.sin(a), 0)); }
      for (i = 0; i < 12; i++) {
        a = i / 12 * TAU;
        s.push(new THREE.Vector3(0.8 * E * Math.cos(a), 0.8 * E * Math.sin(a), zr[1]));
        s.push(new THREE.Vector3(0.8 * E * Math.cos(a), 0.8 * E * Math.sin(a), zr[0]));
      }
      if (showAxes) {
        var pad = showAxisLabels ? 0.05 * E : 0.02 * E;
        s.push(new THREE.Vector3(AX + pad, 0, 0), new THREE.Vector3(0, AX + pad, 0), new THREE.Vector3(-AX, 0, 0),
          new THREE.Vector3(0, -AX, 0), new THREE.Vector3(0, 0, zTop + pad), new THREE.Vector3(0, 0, zBot));
      }
      return s;
    })();
    function fovFor(aspect) { return clamp(32 + (1.3 - aspect) * 16, 32, 44); }
    function aspectNow() { return (W > 0 && H > 0) ? W / H : 1.6; }
    function dirVec(az, el) { var ce = Math.cos(el); return new THREE.Vector3(ce * Math.cos(az), ce * Math.sin(az), Math.sin(el)); }
    var _u = new THREE.Vector3(), _vv = new THREE.Vector3(), _f = new THREE.Vector3(), _d = new THREE.Vector3();
    // Smallest camera distance (along dir from target) that keeps every sample inside the frustum,
    // leaving ~22 px at each edge for axis labels (so small figures get proportionally more room).
    function fitDistance(dir, target, aspect, fovDeg, w, h) {
      _f.copy(dir).negate();
      _u.crossVectors(_f, ZAXIS);
      if (_u.lengthSq() < 1e-12) _u.set(1, 0, 0);
      _u.normalize();
      _vv.crossVectors(_u, _f).normalize();
      w = w || (W > 0 ? W : 700); h = h || (H > 0 ? H : 440);
      var mx = clamp(1 - 44 / w, 0.6, 0.93), my = clamp(1 - 60 / h, 0.6, 0.91);
      var tv = Math.tan(fovDeg * DEG / 2), th = tv * aspect, D = 0;
      for (var i = 0; i < samples.length; i++) {
        _d.copy(samples[i]).sub(target);
        var x = _d.dot(_u), y = _d.dot(_vv), dd = _d.dot(dir);
        D = Math.max(D, dd + Math.abs(x) / (th * mx), dd + Math.abs(y) / (tv * my));
      }
      return Math.max(D, 0.6 * E);
    }
    function camState() {
      var t = controls.target.clone();
      var off = camera.position.clone().sub(t);
      var D = off.length() || 1;
      off.divideScalar(D);
      return {
        az: Math.atan2(off.y, off.x), el: Math.asin(clamp(off.z, -1, 1)),
        k: D / fitDistance(off, t, aspectNow(), camera.fov), target: t
      };
    }
    function applyCam(st) {
      var dir = dirVec(st.az, st.el);
      var D = st.k * fitDistance(dir, st.target, aspectNow(), camera.fov);
      camera.position.copy(st.target).addScaledVector(dir, D);
      controls.target.copy(st.target);
      camera.lookAt(st.target);
    }
    // refW/refH: the viewport size a {position} is measured against (creation: a typical 704×440
    // desktop stage, so phones scale it to fit; runtime setCamera: the current size, so it is exact).
    function resolveCamera(c, refW, refH) {
      refW = refW || 704; refH = refH || 440;
      var tgt = new THREE.Vector3(0, 0, ZC);
      var base = VIEWS.iso, name = 'iso';
      if (typeof c === 'string' && VIEWS[c]) return { az: VIEWS[c].az, el: VIEWS[c].el, k: 1, target: tgt, view: c };
      if (c && typeof c === 'object') {
        var t = vec3(c.target);
        if (t) tgt.set(t[0], t[1], t[2]);
        var p = vec3(c.position);
        if (p) {
          var off = new THREE.Vector3(p[0], p[1], p[2]).sub(tgt), D = off.length();
          if (D > 1e-9) {
            off.divideScalar(D);
            var el = clamp(Math.asin(clamp(off.z, -1, 1)), -89.95 * DEG, 89.95 * DEG), az = Math.atan2(off.y, off.x);
            var kk = D / fitDistance(dirVec(az, el), tgt, refW / refH, fovFor(refW / refH), refW, refH);
            return { az: az, el: el, k: clamp(kk, 0.2, 5), target: tgt, view: null };
          }
        }
        if (c.view && VIEWS[c.view]) { base = VIEWS[c.view]; name = c.view; }
        var custom = isNum(c.azimuth) || isNum(c.elevation);
        return {
          az: isNum(c.azimuth) ? c.azimuth * DEG : base.az,
          el: isNum(c.elevation) ? clamp(c.elevation, -89.95, 89.95) * DEG : base.el,
          k: (isNum(c.zoom) && c.zoom > 0) ? clamp(1 / c.zoom, 0.2, 5) : 1,
          target: tgt, view: custom ? null : name
        };
      }
      return { az: base.az, el: base.el, k: 1, target: tgt, view: 'iso' };
    }
    var home = resolveCamera(opts.camera == null ? 'iso' : opts.camera);

    /* ---------------- controls ---------------- */
    var controls = new THREE.OrbitControls(camera, canvas);
    controls.enableDamping = !reducedMotion();   // no inertia for reduced-motion users
    controls.dampingFactor = 0.12;
    controls.enablePan = false;
    controls.enableZoom = false;         // gated per wheel event (see below)
    controls.rotateSpeed = 0.9;
    controls.target.copy(home.target);
    controls.enabled = controlsOn;
    if (!controlsOn) canvas.style.touchAction = 'auto';   // static figure: let the page scroll
    function updateLimits() {
      var f = fitDistance(dirVec(VIEWS.iso.az, VIEWS.iso.el), home.target, aspectNow(), camera.fov);
      controls.minDistance = 0.2 * f;
      controls.maxDistance = 5 * f;
    }
    function flushControls() {
      var d = controls.enableDamping;
      controls.enableDamping = false;
      controls.update();
      controls.enableDamping = d;
    }
    // Wheel zooms only with Ctrl/⌘ (trackpad pinch sends ctrlKey) or when the view has keyboard
    // focus, so ordinary scrolling never gets hijacked. Touch pinch always zooms.
    function onWheelCapture(e) {
      var focused = false;
      try { focused = document.activeElement === canvas && canvas.matches(':focus-visible'); } catch (err) { focused = false; }
      controls.enableZoom = controlsOn && (e.ctrlKey || e.metaKey || focused);
    }
    function onPointerCapture(e) { if (controlsOn && e.pointerType === 'touch') controls.enableZoom = true; }
    wrap.addEventListener('wheel', onWheelCapture, { capture: true, passive: true });
    wrap.addEventListener('pointerdown', onPointerCapture, { capture: true, passive: true });
    controls.addEventListener('change', function () { requestRender(); cameraMoved(); });
    controls.addEventListener('start', function () {
      tween = null;
      setPressed(null);
      dismissHint();
    });
    function onKey(e) {
      if (!controlsOn || e.altKey) return;
      var step = (e.shiftKey ? 15 : 5) * DEG, handled = true;
      switch (e.key) {
        case 'ArrowLeft': tween = null; controls.rotateLeft(step); break;
        case 'ArrowRight': tween = null; controls.rotateLeft(-step); break;
        case 'ArrowUp': tween = null; controls.rotateUp(step); break;
        case 'ArrowDown': tween = null; controls.rotateUp(-step); break;
        // OrbitControls multiplies the distance by the dollyIn() factor (so < 1 moves closer)
        case '+': case '=': case 'Add': tween = null; controls.dollyIn(1 / 1.15); break;
        case '-': case '_': case 'Subtract': tween = null; controls.dollyOut(1 / 1.15); break;
        case 'Home': case '0': setView('reset', true); break;
        default: handled = false;
      }
      if (handled) {
        e.preventDefault();
        if (e.key !== 'Home' && e.key !== '0') setPressed(null);
        dismissHint();
        requestRender();
      }
    }
    if (controlsOn) canvas.addEventListener('keydown', onKey);

    /* ---------------- overlay UI ---------------- */
    function setPressed(name) {
      currentView = name;
      Object.keys(uiButtons).forEach(function (k) {
        if (VIEWS[k]) uiButtons[k].setAttribute('aria-pressed', k === name ? 'true' : 'false');
      });
    }
    var fsEnabled = !!(document.fullscreenEnabled && wrap.requestFullscreen);
    if (opts.ui !== false) {
      var names = Array.isArray(opts.ui) ? opts.ui : (opts.fullscreen ? ['iso', 'top', 'front', 'reset', 'fullscreen'] : ['iso', 'top', 'front', 'reset']);
      var ui = document.createElement('div');
      ui.className = 'cyl3d-ui';
      ui.setAttribute('role', 'group');
      ui.setAttribute('aria-label', '3D view controls');
      names.forEach(function (n) {
        var def = UI_DEFS[n];
        if (!def || uiButtons[n] || (n === 'fullscreen' && !fsEnabled)) return;
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'cyl3d-btn';
        if (def.icon) b.innerHTML = def.icon; else b.textContent = def.text;
        b.setAttribute('aria-label', def.aria);
        b.title = def.aria;
        if (VIEWS[n]) b.setAttribute('aria-pressed', 'false');
        b.addEventListener('click', function () {
          if (n === 'fullscreen') {
            try {
              if (document.fullscreenElement === wrap) document.exitFullscreen();
              else { var pr = wrap.requestFullscreen(); if (pr && pr.catch) pr.catch(function () {}); }
            } catch (err) { /* ignore */ }
            return;
          }
          setView(n, true);
        });
        ui.appendChild(b);
        uiButtons[n] = b;
      });
      if (ui.children.length) wrap.appendChild(ui);
    }
    setPressed(home.view);
    if (controlsOn && opts.hint !== false) {
      var coarse = false;
      try { coarse = window.matchMedia('(pointer: coarse)').matches; } catch (e) { coarse = false; }
      hintEl = document.createElement('div');
      hintEl.className = 'cyl3d-hint';
      hintEl.setAttribute('aria-hidden', 'true');
      hintEl.textContent = coarse ? 'Drag to rotate · pinch to zoom' : 'Drag to rotate · Ctrl + scroll to zoom';
      wrap.appendChild(hintEl);
    }
    function dismissHint() {
      if (!hintEl) return;
      var h = hintEl;
      hintEl = null;
      h.style.opacity = '0';
      setTimeout(function () { if (h.parentNode) h.parentNode.removeChild(h); }, 600);
    }

    /* ---------------- views & tweening ---------------- */
    function setView(name, animate) {
      if (disposed) return;
      var to;
      if (name === 'reset' || name === 'home' || name == null) { to = home; name = home.view; }
      else if (VIEWS[name]) to = { az: VIEWS[name].az, el: VIEWS[name].el, k: 1, target: home.target.clone() };
      else { warn('setView(): unknown view "' + name + '"'); return; }
      setPressed(name || null);
      startTween(to, animate !== false);
    }
    function startTween(to, animate) {
      tween = null;
      if (W < 1 || H < 1) {
        // no size yet: remember it as the start camera for the first layout (resize() would otherwise
        // apply `home`), and apply it now so getCamera() already reports it
        pendingCam = to;
        applyCam(to); controls.update(); requestRender();
        return;
      }
      pendingCam = null;
      flushControls();
      var from = camState();
      if (!animate || reducedMotion()) {
        applyCam(to); controls.update(); requestRender(); cameraMoved();
        return;
      }
      tween = { from: from, to: to, daz: wrapPi(to.az - from.az), t0: now(), dur: 650 };
      requestRender();
    }
    function stepTween(t) {
      var k = clamp((t - tween.t0) / tween.dur, 0, 1);
      var e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      var f = tween.from, to = tween.to;
      applyCam({ az: f.az + tween.daz * e, el: lerp(f.el, to.el, e), k: lerp(f.k, to.k, e), target: f.target.clone().lerp(to.target, e) });
      needsRender = true;
      if (k >= 1) { tween = null; controls.update(); cameraMoved(); }
    }
    function cameraMoved() {
      if (!changeFns.length) return;
      clearTimeout(changeTimer);
      changeTimer = setTimeout(function () {
        if (disposed) return;
        var c = v.getCamera();
        changeFns.slice().forEach(function (fn) { try { fn(c); } catch (e) { report('onChange callback failed', e); } });
      }, 140);
    }

    /* ---------------- render loop (on demand) ---------------- */
    function canRun() { return !disposed && W > 0 && H > 0 && onScreen && !document.hidden; }
    function schedule() { if (!raf && canRun()) raf = requestAnimationFrame(frame); }
    function requestRender() { needsRender = true; schedule(); }
    function frame(t) {
      raf = 0;
      if (disposed) return;
      frames++;
      var dt = lastT ? Math.min(0.1, Math.max(0, (t - lastT) / 1000)) : 1 / 60;
      lastT = t;
      var keep = false;
      if (tween) { stepTween(now()); keep = keep || !!tween; }
      controls.update();                         // advances damping; fires 'change' (→ schedules) while moving
      if (anims.length && canRun()) {
        var list = anims.slice();
        for (var i = 0; i < list.length; i++) {
          var a = list[i], res;
          if (a.dead) continue;
          a.t += dt;
          try { res = a.fn(dt, a.t); } catch (e) { report('animate() callback failed', e); res = false; }
          if (res === false) { a.dead = true; var ix = anims.indexOf(a); if (ix >= 0) anims.splice(ix, 1); }
        }
        needsRender = true;
        keep = keep || anims.length > 0;
      }
      if (needsRender) draw();
      if (keep) schedule();
      if (!raf) lastT = 0;
    }
    function draw() {
      needsRender = false;
      if (disposed || W < 1 || H < 1) return;
      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
      layoutLabels();
      renders++;
    }

    /* ---------------- sizing ---------------- */
    var heightRAF = 0;
    function resize() {
      if (disposed) return;
      var w = wrap.clientWidth, h = wrap.clientHeight;
      if (aspectOpt > 0 && w > 0) {
        var want = aspectHeight(w, aspectOpt);
        if (Math.abs(want - h) > 0.5 && !heightRAF) {
          // defer: changing the observed element's size inside its ResizeObserver callback loops
          heightRAF = requestAnimationFrame(function () { heightRAF = 0; if (!disposed) wrap.style.height = aspectHeight(wrap.clientWidth, aspectOpt) + 'px'; });
        }
      }
      if (w < 1 || h < 1) return;                 // hidden (display:none, closed <details>…)
      if (w === W && h === H) return;
      var st = (W > 0 && H > 0 && !tween) ? camState() : null;
      var first = !(W > 0);
      W = w; H = h;
      renderer.setSize(w, h);
      labelRenderer.setSize(w, h);
      camera.aspect = w / h;
      camera.fov = fovFor(camera.aspect);
      camera.updateProjectionMatrix();
      updateLimits();
      colorReg.forEach(function (spec, m) { if (m.isLineMaterial) m.resolution.set(w, h); });
      // first layout: the camera given to create() — or the last setView()/setCamera() made while hidden
      // (the pressed view button was already updated by that call)
      if (first) { applyCam(pendingCam || home); pendingCam = null; controls.update(); }
      else if (st) { applyCam(st); controls.update(); }
      if (canRun()) draw(); else needsRender = true;
      schedule();
    }
    var ro = null, io = null;
    try { ro = new ResizeObserver(function () { resize(); }); ro.observe(wrap); } catch (e) {
      ro = null;
      window.addEventListener('resize', resize);
    }
    try {
      io = new IntersectionObserver(function (entries) {
        var e = entries[entries.length - 1];
        onScreen = !!e.isIntersecting;
        if (onScreen) {
          lastT = 0;
          if (needsRender || anims.length || tween) schedule();
          // the hint covers the bottom-left corner (often an axis label): show it briefly only
          if (hintEl && !hintTimer) hintTimer = setTimeout(dismissHint, 7000);
        }
      }, { rootMargin: '120px 0px' });
      io.observe(wrap);
    } catch (e) { io = null; }

    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); }, false);
    canvas.addEventListener('webglcontextrestored', function () { requestRender(); }, false);

    /* ---------------- decor: axes and grid ---------------- */
    var axesGroup = new THREE.Group(); axesGroup.name = 'cyl3d-axes'; decor.add(axesGroup);
    var gridGroup = new THREE.Group(); gridGroup.name = 'cyl3d-grid'; decor.add(gridGroup);
    function pushBack(m) { m.polygonOffset = true; m.polygonOffsetFactor = 1; m.polygonOffsetUnits = 2; return m; }
    function niceStep(x) {
      var p = Math.pow(10, Math.floor(Math.log(x) / Math.LN10)), m = x / p;
      return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
    }
    function fmtTick(x) {
      try { if (window.CYL && typeof window.CYL.fmt === 'function') return window.CYL.fmt(x, 3); } catch (e) { /* ignore */ }
      var s = String(+x.toPrecision(3));
      return s.charAt(0) === '-' ? '−' + s.slice(1) : s;
    }
    function axisPlacer(tip, dir) {
      return function (c) {
        var a = c.projLocal(decor, tip[0] - dir[0] * 0.3 * E, tip[1] - dir[1] * 0.3 * E, tip[2] - dir[2] * 0.3 * E);
        var b = c.projLocal(decor, tip[0], tip[1], tip[2]);
        var d = unit2(b[0] - a[0], b[1] - a[1]);
        if (!d || hypot(b[0] - a[0], b[1] - a[1]) < 6) d = [0.7071, -0.7071];
        return { dirs: [d, rot2(d, 0.7), rot2(d, -0.7)], gap: 4 };
      };
    }
    function buildAxes() {
      var hl = 0.06 * E, hr = 0.0175 * E, s = [], sn = [];
      var tips = [[AX, 0, 0], [0, AX, 0], [0, 0, zTop]], dirs = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], names = ['x', 'y', 'z'];
      var coneMat = stdMat('axis');
      for (var i = 0; i < 3; i++) {
        var tp = tips[i], d = dirs[i];
        s.push(0, 0, 0, tp[0] - d[0] * hl * 0.9, tp[1] - d[1] * hl * 0.9, tp[2] - d[2] * hl * 0.9);
        var cone = new THREE.Mesh(geoCone, coneMat);
        cone.position.set(tp[0] - d[0] * hl, tp[1] - d[1] * hl, tp[2] - d[2] * hl);
        cone.quaternion.setFromUnitVectors(ZAXIS, new THREE.Vector3(d[0], d[1], d[2]));
        cone.scale.set(hr, hr, hl);
        axesGroup.add(cone);
        if (showAxisLabels) {
          var lb = makeLabel(names[i], { className: 'axis', prio: 20, place: axisPlacer(tp, d) });
          lb.position.set(tp[0], tp[1], tp[2]);
          axesGroup.add(lb);
        }
      }
      axesGroup.userData.cylSegs = function (c, out) {
        for (var k = 0; k < 3; k++) {
          var a = c.projLocal(decor, 0, 0, 0), b = c.projLocal(decor, tips[k][0], tips[k][1], tips[k][2]);
          out.push([a[0], a[1], b[0], b[1]]);
        }
      };
      segSources.add(axesGroup);
      var pos = newLine({ color: 'axis', width: 2 });
      pushBack(pos.material);
      setSegs(pos, s, 3); show(pos, true);
      axesGroup.add(pos);
      sn.push(-AX, 0, 0, 0, 0, 0, 0, -AX, 0, 0, 0, 0);
      if (zBot < -1e-9) sn.push(0, 0, zBot, 0, 0, 0);
      var negl = newLine({ color: 'axis', width: 1.5, dashed: true, dashSize: 0.12 * S, gapSize: 0.09 * S, opacity: 0.55 });
      pushBack(negl.material);
      setSegs(negl, sn, sn.length / 6); show(negl, true);
      axesGroup.add(negl);
    }
    function buildGrid() {
      if (gridMode === 'none') return;
      var step = niceStep(E / 4), n = Math.max(1, Math.floor(E / step + 1e-9)), last = n * step;
      var inner = [], outer = [], k, a, i;
      var tickOff = 0.07 * E;
      if (gridMode === 'polar') {
        var NR = 96;
        for (k = 1; k <= n; k++) arcPoints(k === n ? outer : inner, k * step, 0, TAU, 0, NR);
        for (var dg = 30; dg < 360; dg += 30) {
          if (dg === 90) continue;
          a = dg * DEG;
          inner.push(0, 0, 0, 1.075 * last * Math.cos(a), 1.075 * last * Math.sin(a), 0);
        }
        for (k = 1; k <= n; k++) addTick(k * step, -tickOff, k * step, 1, 0);
      } else {
        for (i = -n; i <= n; i++) {
          if (i === 0) continue;
          var arr = Math.abs(i) === n ? outer : inner, c = i * step;
          arr.push(c, -last, 0, c, last, 0, -last, c, 0, last, c, 0);
        }
        inner.push(-last, 0, 0, 0, 0, 0, 0, -last, 0, 0, 0, 0);   // under the dashed negative axes
        for (k = 1; k <= n; k++) { addTick(k * step, -tickOff, k * step, 1, 0); addTick(-tickOff, k * step, k * step, 0, 1); }
      }
      [[inner, 1], [outer, 1.4]].forEach(function (pair) {
        if (!pair[0].length) return;
        var ln = newLine({ color: 'grid', width: pair[1], under: true });
        setSegs(ln, pair[0], pair[0].length / 6); show(ln, true);
        gridGroup.add(ln);
      });
      // Tick values along the axis (ax, ay). Ticks are obstacles to each other (lowest priority, so
      // they never displace other labels), and a tick is hidden while its axis is seen nearly end-on
      // (neighbouring ticks < 14 px apart on screen: Side view, Front view of the y ticks…), where
      // they would all project onto one spot.
      function addTick(x, y, val, ax, ay) {
        var lb = makeLabel(fmtTick(val), {
          tex: false, className: 'small', prio: -10, hideOnCollide: true,
          place: function (c) {
            var a = c.projLocal(gridGroup, x, y, 0), b = c.projLocal(gridGroup, x - ax * step, y - ay * step, 0);
            return hypot(b[0] - a[0], b[1] - a[1]) < 14 ? null : { offset: [0, 0] };
          }
        });
        lb.position.set(x, y, 0);
        gridGroup.add(lb);
      }
    }
    if (showAxes) buildAxes();
    buildGrid();

    /* ---------------- primitives: helpers ---------------- */
    function addTo(o, obj) {
      var p = (o && o.parent && o.parent.isObject3D) ? o.parent : root;
      p.add(obj);
      requestRender();
      return obj;
    }
    function newGroup(type) { var g = new THREE.Group(); g.userData.cylType = type; return g; }
    function gridGeometry(nu, nv) {
      var geo = new THREE.BufferGeometry();
      var nVert = (nu + 1) * (nv + 1);
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nVert * 3), 3));
      var idx = nVert > 65535 ? new Uint32Array(nu * nv * 6) : new Uint16Array(nu * nv * 6), q = 0;
      for (var i = 0; i < nu; i++) {
        for (var j = 0; j < nv; j++) {
          var a = i * (nv + 1) + j, b = (i + 1) * (nv + 1) + j, c = b + 1, d = a + 1;
          idx[q++] = a; idx[q++] = b; idx[q++] = d; idx[q++] = b; idx[q++] = c; idx[q++] = d;
        }
      }
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      return geo;
    }
    function newMesh(geo, mat) { var m = new THREE.Mesh(geo, mat); m.frustumCulled = false; return m; }
    function merge(st, p, keys) {
      if (!p) return;
      for (var i = 0; i < keys.length; i++) if (p[keys[i]] !== undefined) st[keys[i]] = p[keys[i]];
    }
    function allNum(st, keys) { for (var i = 0; i < keys.length; i++) if (!isNum(st[keys[i]])) return false; return true; }
    function allFin(st, keys) { for (var i = 0; i < keys.length; i++) if (!fin(st[keys[i]])) return false; return true; }
    // Angular span of a surface patch: more than one turn covers the full circle.
    function spanOf(a0, a1) { var s = a1 - a0; return clamp(s, -TAU, TAU); }
    function isFull(span) { return Math.abs(span) >= TAU - 1e-9; }
    // θ arc (line + cone arrowhead). The line stops at the head's base so the thick
    // line's round cap never pokes through the cone tip.
    var _hd = new THREE.Vector3();
    // A sweep of more than one turn is drawn as one full turn that ENDS at a1, so the arrowhead
    // still points at the final direction (e.g. 0 → 3π ends at 180°, not back at 0°).
    function writeArc(line, head, r, a0, a1, z, hl0, hr0) {
      if (!(fin(r) && isNum(a0) && isNum(a1) && fin(z)) || !(r > 1e-9) || Math.abs(a1 - a0) < 1e-6) {
        show(line, false); if (head) head.visible = false; return false;
      }
      var span = a1 - a0, sgn = span > 0 ? 1 : -1;
      if (Math.abs(span) > TAU) { span = sgn * TAU; a0 = a1 - span; }
      var hl = (head && hl0 > 0) ? Math.min(hl0, Math.abs(span) * r * 0.5) : 0;
      var hr = hl > 0 ? hr0 * hl / hl0 : 0;
      var aEnd = hl > 0 ? a1 - sgn * hl / r : a1;
      var segs = [];
      arcPoints(segs, r, a0, aEnd, z, 64);
      setSegs(line, segs, 64);
      show(line, true);
      if (hl > 0) {
        var bx = r * Math.cos(aEnd), by = r * Math.sin(aEnd);
        _hd.set(r * Math.cos(a1) - bx, r * Math.sin(a1) - by, 0);
        var L = _hd.length();
        head.position.set(bx, by, z);
        head.quaternion.setFromUnitVectors(ZAXIS, _hd.divideScalar(L || 1));
        head.scale.set(hr, hr, L || 1e-6);
        head.visible = L > 1e-9;
      } else if (head) head.visible = false;
      return true;
    }
    function edgeOpts(o, color) {
      return { color: o.wireColor || color, width: num(o.wireWidth, 1.25), opacity: num(o.wireOpacity, 0.75) };
    }

    /* ---------------- primitives ---------------- */
    // v.point(pos, {color:'point', size:0.07, label:null, labelOffset:[0,0,0]}) → .setPosition(pos)
    v.point = function (pos, o) {
      o = o || {};
      var g = newGroup('point');
      var size = Math.max(1e-6, num(o.size, 0.07 * S));
      var mesh = newMesh(geoSphere, stdMat(o.color || 'point'));
      mesh.scale.setScalar(size);
      g.add(mesh);
      var loff = vec3(o.labelOffset) || [0, 0, 0];
      var auto = !loff[0] && !loff[1] && !loff[2];
      var lab = null, cur = null, wpos = new THREE.Vector3();
      function placeAuto(c) {
        var gap = 4 + c.pxLen(mesh.getWorldPosition(wpos), size);
        return { dirs: [[0.7071, -0.7071], [0, -1], [1, 0], [-0.7071, -0.7071], [-1, 0], [0.7071, 0.7071], [0, 1], [-0.7071, 0.7071]], gap: gap };
      }
      function ensureLabel(t) {
        if (lab) { setLabelText(lab, t); return; }
        lab = makeLabel(t, { color: o.labelColor || null, background: !!o.labelBackground, className: o.labelClass || '', prio: 5, place: auto ? placeAuto : null, offset: o.labelPx });
        g.add(lab);
      }
      g.setPosition = function (p) {
        var a = pos3(p);
        cur = a;
        mesh.visible = !!a;
        if (a) mesh.position.set(a[0], a[1], a[2]);
        if (lab) { lab.userData.cyl.hidden = !a; if (a) lab.position.set(a[0] + loff[0], a[1] + loff[1], a[2] + loff[2]); }
        requestRender();
        return g;
      };
      g.getPosition = function () { return cur ? cur.slice() : null; };
      g.setLabel = function (t) { if (t == null || t === '') { if (lab) setLabelText(lab, ''); } else { ensureLabel(t); g.setPosition(cur); } return g; };
      g.setColor = function (c) { paint(mesh.material, c); requestRender(); return g; };
      g.setSize = function (s) { if (isNum(s) && s > 0) { size = s; mesh.scale.setScalar(s); requestRender(); } return g; };
      if (o.label != null && o.label !== '') ensureLabel(o.label);
      g.setPosition(pos);
      return addTo(o, g);
    };

    // v.label(pos, text, {tex:true, color:'ink', className:'', offset:[dx,dy], background:false, priority:9})
    //   priority: labels are placed in descending priority, each avoiding the ones already placed. Built-in
    //   labels: cylPoint P 10, z 8, r 7, θ 6, P' 5, x/y legs 4. Use priority 11+ for a fixed-offset label that
    //   an automatic label (e.g. P) must move out of the way of.
    v.label = function (pos, text, o) {
      o = o || {};
      var lab = makeLabel(text, { tex: o.tex !== false, color: o.color || null, className: o.className || '', offset: o.offset, background: !!o.background, prio: num(o.priority, 9) });
      lab.userData.cylType = 'label';
      lab.setText = function (t) { setLabelText(lab, t); return lab; };
      lab.setPosition = function (p) {
        var a = pos3(p);
        lab.userData.cyl.hidden = !a;
        if (a) lab.position.set(a[0], a[1], a[2]);
        requestRender();
        return lab;
      };
      lab.setColor = function (c) { setLabelColor(lab, c); return lab; };
      lab.setPosition(pos);
      return addTo(o, lab);
    };

    // v.line(points, {color, width:2, dashed:false, dashSize:0.1, gapSize:0.07, opacity:1}) → .setPoints(points)
    v.line = function (points, o) {
      o = o || {};
      var g = newGroup('line');
      var line = newLine({ color: o.color || 'ink', width: num(o.width, 2), dashed: o.dashed, dashSize: o.dashSize, gapSize: o.gapSize, opacity: o.opacity });
      g.add(line);
      g.setPoints = function (pts) {
        var s = polyToSegs(Array.isArray(pts) ? pts : [], !!o.closed, BIG);
        if (setSegs(line, s.a, s.n)) show(line, true); else show(line, false);
        requestRender();
        return g;
      };
      g.setColor = function (c) { paint(line.material, c); requestRender(); return g; };
      g.setOpacity = function (op) { setOpacity(line.material, op); requestRender(); return g; };
      g.setPoints(points);
      return addTo(o, g);
    };

    // v.arrow(from, to, {color, width:0.025, headLength:0.18, headRadius:0.07, label:null}) → .set(from, to)
    v.arrow = function (from, to, o) {
      o = o || {};
      var g = newGroup('arrow');
      var color = o.color || 'ink';
      var mat = stdMat(color);
      var body = new THREE.Group();
      var shaft = newMesh(geoShaft, mat), head = newMesh(geoCone, mat);
      body.add(shaft); body.add(head); g.add(body);
      var w = Math.max(0, num(o.width, 0.025 * S)), hl0 = Math.max(1e-6, num(o.headLength, 0.18 * S)), hr0 = Math.max(0, num(o.headRadius, 0.07 * S));
      var A = null, B = null, lab = null;
      function place(c) {
        if (!A || !B) return null;
        var a = c.projLocal(g, A[0], A[1], A[2]), b = c.projLocal(g, B[0], B[1], B[2]);
        var d = hypot(b[0] - a[0], b[1] - a[1]) > 4 ? unit2(b[0] - a[0], b[1] - a[1]) : null;
        return { dirs: fan(d || [0.7071, -0.7071]).slice(0, 7), gap: 5 };
      }
      function ensureLabel(t) {
        if (lab) { setLabelText(lab, t); return; }
        lab = makeLabel(t, { color: o.labelColor || color, prio: num(o.labelPriority, 6), place: place });
        g.add(lab);
      }
      g.set = function (f, t) {
        var a = pos3(f === undefined ? A : f), b = pos3(t === undefined ? B : t);
        A = a; B = b;
        var len = (a && b) ? Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]) + (b[2] - a[2]) * (b[2] - a[2])) : 0;
        if (!(len > 1e-9)) {
          body.visible = false;
          if (lab) lab.userData.cyl.hidden = true;
          requestRender();
          return g;
        }
        var hl = Math.min(hl0, len * 0.45), hr = hr0 * hl / hl0;
        _hd.set((b[0] - a[0]) / len, (b[1] - a[1]) / len, (b[2] - a[2]) / len);
        body.visible = true;
        body.position.set(a[0], a[1], a[2]);
        body.quaternion.setFromUnitVectors(ZAXIS, _hd);
        shaft.visible = w > 0;
        shaft.scale.set(w || 1e-6, w || 1e-6, Math.max(len - hl * 0.92, 1e-6));
        head.position.set(0, 0, len - hl);
        head.scale.set(hr || 1e-6, hr || 1e-6, hl);
        if (lab) { lab.userData.cyl.hidden = false; lab.position.set(b[0], b[1], b[2]); }
        requestRender();
        return g;
      };
      g.setLabel = function (t) { if (t == null || t === '') { if (lab) setLabelText(lab, ''); } else { ensureLabel(t); g.set(); } return g; };
      g.setColor = function (c) { paint(mat, c); if (lab && !o.labelColor) setLabelColor(lab, c); requestRender(); return g; };
      g.userData.cylSegs = function (c, out) {
        if (!body.visible || !A || !B) return;
        var a = c.projLocal(g, A[0], A[1], A[2]), b = c.projLocal(g, B[0], B[1], B[2]);
        out.push([a[0], a[1], b[0], b[1]]);
      };
      segSources.add(g);
      if (o.label != null && o.label !== '') ensureLabel(o.label);
      g.set(from, to);
      return addTo(o, g);
    };

    // v.curve(fn(t)→[x,y,z], t0, t1, {segments:200, color, width:3, dashed:false}) → .setFn(fn, t0, t1)
    v.curve = function (fn, t0, t1, o) {
      o = o || {};
      var g = newGroup('curve');
      var nseg = Math.round(clamp(num(o.segments, 200), 1, 5000));
      var line = newLine({ color: o.color || 'ink', width: num(o.width, 3), dashed: o.dashed, dashSize: o.dashSize, gapSize: o.gapSize, opacity: o.opacity });
      g.add(line);
      var F = null, A = 0, B = 1;
      g.setFn = function (f, a, b) {
        if (typeof f === 'function') F = f;
        if (a !== undefined) A = a;
        if (b !== undefined) B = b;
        var pts = [];
        if (typeof F === 'function' && isNum(A) && isNum(B)) {
          for (var i = 0; i <= nseg; i++) {
            var p = null;
            try { p = F(A + (B - A) * i / nseg); } catch (e) { p = null; }
            pts.push(p);
          }
        }
        var s = polyToSegs(pts, false, 60 * E);    // far-off points (asymptotes) break the curve
        if (setSegs(line, s.a, s.n)) show(line, true); else show(line, false);
        requestRender();
        return g;
      };
      g.setColor = function (c) { paint(line.material, c); requestRender(); return g; };
      g.setOpacity = function (op) { setOpacity(line.material, op); requestRender(); return g; };
      g.setFn(fn, t0, t1);
      return addTo(o, g);
    };

    // v.arc({r, theta0, theta1, z:0, color:'t', width:3, arrow:true}) → .set({r, theta0, theta1, z})
    v.arc = function (o) {
      o = o || {};
      var g = newGroup('arc');
      var color = o.color || 't';
      var line = newLine({ color: color, width: num(o.width, 3), dashed: o.dashed, dashSize: o.dashSize, gapSize: o.gapSize, opacity: o.opacity });
      var head = newMesh(geoCone, stdMat(color));
      head.visible = false;
      g.add(line); g.add(head);
      var st = { r: 1 * S, theta0: 0, theta1: Math.PI / 2, z: 0 };
      var arrow = o.arrow !== false;
      var hl0 = num(o.headLength, 0.22 * S), hr0 = num(o.headRadius, 0.075 * S);
      g.set = function (p) {
        merge(st, p, ['r', 'theta0', 'theta1', 'z']);
        writeArc(line, arrow ? head : null, st.r, st.theta0, st.theta1, st.z, hl0, hr0);
        if (!arrow) head.visible = false;
        requestRender();
        return g;
      };
      g.setColor = function (c) { paint(line.material, c); paint(head.material, c); requestRender(); return g; };
      g.set(o);
      return addTo(o, g);
    };

    // v.cylinder({r, z0, z1, theta0:0, theta1:2π, color:'r', opacity:0.22, wire:true, wireColor:null}) → .set({...})
    v.cylinder = function (o) {
      o = o || {};
      var g = newGroup('cylinder');
      var color = o.color || 'r', NA = 72;
      var geo = gridGeometry(NA, 1);
      var mesh = newMesh(geo, tintMat(color, clamp(num(o.opacity, 0.22), 0, 1)));
      g.add(mesh);
      var wire = o.wire !== false;
      var rims = wire ? newLine(edgeOpts(o, color)) : null, sides = wire ? newLine(edgeOpts(o, color)) : null;
      if (wire) { g.add(rims); g.add(sides); }
      var st = { r: 0.5 * E, z0: zr[0], z1: zr[1], theta0: 0, theta1: TAU };
      g.set = function (p) {
        merge(st, p, ['r', 'z0', 'z1', 'theta0', 'theta1']);
        var ok = allFin(st, ['r', 'z0', 'z1']) && allNum(st, ['theta0', 'theta1']) && st.r > 1e-9 && Math.abs(st.z1 - st.z0) > 1e-9 && Math.abs(st.theta1 - st.theta0) > 1e-9;
        mesh.visible = ok;
        if (wire) { show(rims, ok); show(sides, false); }
        if (ok) {
          var r = st.r, z0 = st.z0, z1 = st.z1, a0 = st.theta0, span = spanOf(a0, st.theta1);
          var pa = geo.attributes.position.array, q = 0;
          for (var i = 0; i <= NA; i++) {
            var a = a0 + span * i / NA, c = r * Math.cos(a), s = r * Math.sin(a);
            pa[q++] = c; pa[q++] = s; pa[q++] = z0;
            pa[q++] = c; pa[q++] = s; pa[q++] = z1;
          }
          geo.attributes.position.needsUpdate = true;
          geo.computeBoundingSphere();
          if (wire) {
            var rs = [];
            arcPoints(rs, r, a0, a0 + span, z0, NA);
            arcPoints(rs, r, a0, a0 + span, z1, NA);
            setSegs(rims, rs, 2 * NA); show(rims, true);
            if (!isFull(span)) {
              var a1 = a0 + span;
              setSegs(sides, [r * Math.cos(a0), r * Math.sin(a0), z0, r * Math.cos(a0), r * Math.sin(a0), z1,
                r * Math.cos(a1), r * Math.sin(a1), z0, r * Math.cos(a1), r * Math.sin(a1), z1], 2);
              show(sides, true);
            }
          }
        }
        requestRender();
        return g;
      };
      g.setColor = function (c) { paint(mesh.material, c); if (wire && !o.wireColor) { paint(rims.material, c); paint(sides.material, c); } requestRender(); return g; };
      g.setOpacity = function (op) { setOpacity(mesh.material, op); requestRender(); return g; };
      g.set(o);
      return addTo(o, g);
    };

    // v.halfPlane({theta, r0:0, r1, z0, z1, color:'t', opacity:0.22, wire:true}) → .set({...})
    v.halfPlane = function (o) {
      o = o || {};
      var g = newGroup('halfPlane');
      var color = o.color || 't';
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
      geo.setIndex([0, 1, 2, 0, 2, 3]);
      var mesh = newMesh(geo, tintMat(color, clamp(num(o.opacity, 0.22), 0, 1)));
      g.add(mesh);
      var wire = o.wire !== false, edges = wire ? newLine(edgeOpts(o, color)) : null;
      if (wire) g.add(edges);
      var st = { theta: 0, r0: 0, r1: E, z0: zr[0], z1: zr[1] };
      g.set = function (p) {
        merge(st, p, ['theta', 'r0', 'r1', 'z0', 'z1']);
        var ok = allFin(st, ['r0', 'r1', 'z0', 'z1']) && isNum(st.theta);
        var r0 = ok ? Math.max(0, Math.min(st.r0, st.r1)) : 0, r1 = ok ? Math.max(0, Math.max(st.r0, st.r1)) : 0;
        ok = ok && r1 - r0 > 1e-9 && Math.abs(st.z1 - st.z0) > 1e-9;
        mesh.visible = ok;
        if (wire) show(edges, false);
        if (ok) {
          var c = Math.cos(st.theta), s = Math.sin(st.theta), z0 = st.z0, z1 = st.z1;
          var P = [[r0 * c, r0 * s, z0], [r1 * c, r1 * s, z0], [r1 * c, r1 * s, z1], [r0 * c, r0 * s, z1]];
          var pa = geo.attributes.position.array;
          for (var i = 0; i < 4; i++) { pa[3 * i] = P[i][0]; pa[3 * i + 1] = P[i][1]; pa[3 * i + 2] = P[i][2]; }
          geo.attributes.position.needsUpdate = true;
          geo.computeBoundingSphere();
          if (wire) {
            var e = [];
            e.push.apply(e, P[0].concat(P[1])); e.push.apply(e, P[1].concat(P[2])); e.push.apply(e, P[2].concat(P[3]));
            if (r0 > 1e-9) e.push.apply(e, P[3].concat(P[0]));   // the edge on the z-axis is the axis itself
            setSegs(edges, e, e.length / 6); show(edges, true);
          }
        }
        requestRender();
        return g;
      };
      g.setColor = function (c) { paint(mesh.material, c); if (wire && !o.wireColor) paint(edges.material, c); requestRender(); return g; };
      g.setOpacity = function (op) { setOpacity(mesh.material, op); requestRender(); return g; };
      g.set(o);
      return addTo(o, g);
    };

    // v.zPlane({z, r0:0, r1, theta0:0, theta1:2π, color:'z', opacity:0.22, wire:true}) → .set({...})
    v.zPlane = function (o) {
      o = o || {};
      var g = newGroup('zPlane');
      var color = o.color || 'z', NA = 96;
      var geo = gridGeometry(NA, 1);
      var mesh = newMesh(geo, tintMat(color, clamp(num(o.opacity, 0.22), 0, 1)));
      g.add(mesh);
      var wire = o.wire !== false, edges = wire ? newLine(edgeOpts(o, color)) : null;
      if (wire) g.add(edges);
      var st = { z: 0, r0: 0, r1: E, theta0: 0, theta1: TAU };
      g.set = function (p) {
        merge(st, p, ['z', 'r0', 'r1', 'theta0', 'theta1']);
        var ok = allFin(st, ['z', 'r0', 'r1']) && allNum(st, ['theta0', 'theta1']);
        var r0 = ok ? Math.max(0, Math.min(st.r0, st.r1)) : 0, r1 = ok ? Math.max(0, Math.max(st.r0, st.r1)) : 0;
        ok = ok && r1 - r0 > 1e-9 && Math.abs(st.theta1 - st.theta0) > 1e-9;
        mesh.visible = ok;
        if (wire) show(edges, false);
        if (ok) {
          var z = st.z, a0 = st.theta0, span = spanOf(a0, st.theta1), a1 = a0 + span;
          var pa = geo.attributes.position.array, q = 0;
          for (var i = 0; i <= NA; i++) {
            var a = a0 + span * i / NA, c = Math.cos(a), s = Math.sin(a);
            pa[q++] = r0 * c; pa[q++] = r0 * s; pa[q++] = z;
            pa[q++] = r1 * c; pa[q++] = r1 * s; pa[q++] = z;
          }
          geo.attributes.position.needsUpdate = true;
          geo.computeBoundingSphere();
          if (wire) {
            var e = [];
            arcPoints(e, r1, a0, a1, z, NA);
            if (r0 > 1e-9) arcPoints(e, r0, a0, a1, z, NA);
            if (!isFull(span)) {
              e.push(r0 * Math.cos(a0), r0 * Math.sin(a0), z, r1 * Math.cos(a0), r1 * Math.sin(a0), z);
              e.push(r0 * Math.cos(a1), r0 * Math.sin(a1), z, r1 * Math.cos(a1), r1 * Math.sin(a1), z);
            }
            setSegs(edges, e, e.length / 6); show(edges, true);
          }
        }
        requestRender();
        return g;
      };
      g.setColor = function (c) { paint(mesh.material, c); if (wire && !o.wireColor) paint(edges.material, c); requestRender(); return g; };
      g.setOpacity = function (op) { setOpacity(mesh.material, op); requestRender(); return g; };
      g.set(o);
      return addTo(o, g);
    };

    // v.wedge({r0, r1, theta0, theta1, z0, z1, color:'accent', opacity:0.35, edges:true}) → .set({...})
    v.wedge = function (o) {
      o = o || {};
      var g = newGroup('wedge');
      var color = o.color || 'accent', NA = 64;
      var strip = (NA + 1) * 2, nVert = strip * 4 + 8;
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nVert * 3), 3));
      var idx = [], f, i;
      for (f = 0; f < 4; f++) {
        var base = f * strip;
        for (i = 0; i < NA; i++) {
          var a = base + 2 * i, b = a + 2, c = b + 1, d = a + 1;
          idx.push(a, b, d, b, c, d);
        }
      }
      for (f = 0; f < 2; f++) { var s0 = strip * 4 + f * 4; idx.push(s0, s0 + 1, s0 + 2, s0, s0 + 2, s0 + 3); }
      geo.setIndex(idx);
      var op = clamp(num(o.opacity, 0.35), 0, 1);
      var mesh = newMesh(geo, shadeMat(color, op, true));
      mesh.material.depthWrite = op >= 1;
      g.add(mesh);
      var showEdges = o.edges !== false;
      var edges = showEdges ? newLine({ color: o.edgeColor || color, width: num(o.edgeWidth, 1.5), opacity: 0.95 }) : null;
      if (showEdges) g.add(edges);
      var st = { r0: 0, r1: 0.5 * E, theta0: 0, theta1: Math.PI / 2, z0: 0, z1: 0.5 * E };
      g.set = function (p) {
        merge(st, p, ['r0', 'r1', 'theta0', 'theta1', 'z0', 'z1']);
        var ok = allFin(st, ['r0', 'r1', 'z0', 'z1']) && allNum(st, ['theta0', 'theta1']);
        var r0 = ok ? Math.max(0, Math.min(st.r0, st.r1)) : 0, r1 = ok ? Math.max(0, Math.max(st.r0, st.r1)) : 0;
        var z0 = ok ? Math.min(st.z0, st.z1) : 0, z1 = ok ? Math.max(st.z0, st.z1) : 0;
        ok = ok && r1 - r0 > 1e-9 && z1 - z0 > 1e-9 && Math.abs(st.theta1 - st.theta0) > 1e-9;
        mesh.visible = ok;
        if (showEdges) show(edges, false);
        if (ok) {
          var a0 = st.theta0, span = spanOf(a0, st.theta1), a1 = a0 + span, full = isFull(span);
          var pa = geo.attributes.position.array, q = 0, k, ang, c, s;
          var faces = [[r1, r1, z0, z1], [r0, r0, z0, z1], [r0, r1, z1, z1], [r0, r1, z0, z0]];  // outer, inner, top, bottom
          for (f = 0; f < 4; f++) {
            var F = faces[f];
            for (k = 0; k <= NA; k++) {
              ang = a0 + span * k / NA; c = Math.cos(ang); s = Math.sin(ang);
              pa[q++] = F[0] * c; pa[q++] = F[0] * s; pa[q++] = F[2];
              pa[q++] = F[1] * c; pa[q++] = F[1] * s; pa[q++] = F[3];
            }
          }
          [a0, a1].forEach(function (A) {
            var cc = Math.cos(A), ss = Math.sin(A);
            var pts = full ? [[0, 0, z0], [0, 0, z0], [0, 0, z0], [0, 0, z0]]   // closed ring: no side faces
              : [[r0 * cc, r0 * ss, z0], [r1 * cc, r1 * ss, z0], [r1 * cc, r1 * ss, z1], [r0 * cc, r0 * ss, z1]];
            for (var m = 0; m < 4; m++) { pa[q++] = pts[m][0]; pa[q++] = pts[m][1]; pa[q++] = pts[m][2]; }
          });
          geo.attributes.position.needsUpdate = true;
          geo.computeVertexNormals();
          geo.computeBoundingSphere();
          if (showEdges) {
            var e = [];
            arcPoints(e, r1, a0, a1, z0, NA); arcPoints(e, r1, a0, a1, z1, NA);
            if (r0 > 1e-9) { arcPoints(e, r0, a0, a1, z0, NA); arcPoints(e, r0, a0, a1, z1, NA); }
            if (!full) {
              [a0, a1].forEach(function (A) {
                var cc = Math.cos(A), ss = Math.sin(A);
                e.push(r0 * cc, r0 * ss, z0, r1 * cc, r1 * ss, z0, r0 * cc, r0 * ss, z1, r1 * cc, r1 * ss, z1);
                e.push(r1 * cc, r1 * ss, z0, r1 * cc, r1 * ss, z1);
                if (r0 > 1e-9) e.push(r0 * cc, r0 * ss, z0, r0 * cc, r0 * ss, z1);
              });
            }
            setSegs(edges, e, e.length / 6); show(edges, true);
          }
        }
        requestRender();
        return g;
      };
      g.setColor = function (c) { paint(mesh.material, c); if (showEdges && !o.edgeColor) paint(edges.material, c); requestRender(); return g; };
      g.setOpacity = function (x) { setOpacity(mesh.material, x); requestRender(); return g; };
      g.set(o);
      return addTo(o, g);
    };

    // v.surface(fn(u,w)→[x,y,z], {u:[u0,u1], w:[w0,w1], segments:[64,32], color:'surface', opacity:0.6,
    //           wire:false, doubleSided:true}) → .setFn(fn, u, w)
    v.surface = function (fn, o) {
      o = o || {};
      var g = newGroup('surface');
      var segs = Array.isArray(o.segments) ? o.segments : [64, 32];
      var su = Math.round(clamp(num(segs[0], 64), 1, 400)), sw = Math.round(clamp(num(segs[1], 32), 1, 400));
      var geo = gridGeometry(su, sw);
      var baseIdx = geo.index.array.slice();
      var op = clamp(num(o.opacity, 0.6), 0, 1);
      var color = o.color || 'surface';
      var mesh = newMesh(geo, shadeMat(color, op, o.doubleSided !== false));
      g.add(mesh);
      var wire = !!o.wire;
      var wl = wire ? newLine({ color: o.wireColor || (color === 'surface' ? 'muted' : color), width: num(o.wireWidth, 1), opacity: num(o.wireOpacity, 0.55) }) : null;
      if (wire) g.add(wl);
      var ku = Math.max(1, Math.round(su / 16)), kw = Math.max(1, Math.round(sw / 8));
      var F = null, U = [0, 1], Wr = [0, 1];
      var valid = new Uint8Array((su + 1) * (sw + 1));
      var lim = 60 * E;
      g.setFn = function (f, u, w) {
        if (typeof f === 'function') F = f;
        if (Array.isArray(u) && isNum(u[0]) && isNum(u[1])) U = [u[0], u[1]];
        if (Array.isArray(w) && isNum(w[0]) && isNum(w[1])) Wr = [w[0], w[1]];
        var pa = geo.attributes.position.array, i, j, n = 0;
        for (i = 0; i <= su; i++) {
          var uu = U[0] + (U[1] - U[0]) * i / su;
          for (j = 0; j <= sw; j++) {
            var ww = Wr[0] + (Wr[1] - Wr[0]) * j / sw, p = null, k = i * (sw + 1) + j;
            if (typeof F === 'function') { try { p = vec3(F(uu, ww)); } catch (e) { p = null; } }
            if (p && (Math.abs(p[0]) > lim || Math.abs(p[1]) > lim || Math.abs(p[2]) > lim)) p = null;
            valid[k] = p ? 1 : 0;
            pa[3 * k] = p ? p[0] : 0; pa[3 * k + 1] = p ? p[1] : 0; pa[3 * k + 2] = p ? p[2] : 0;
          }
        }
        var ia = geo.index.array;
        for (i = 0; i < baseIdx.length; i += 3) {
          if (valid[baseIdx[i]] && valid[baseIdx[i + 1]] && valid[baseIdx[i + 2]]) { ia[i] = baseIdx[i]; ia[i + 1] = baseIdx[i + 1]; ia[i + 2] = baseIdx[i + 2]; n++; }
          else { ia[i] = ia[i + 1] = ia[i + 2] = 0; }
        }
        geo.index.needsUpdate = true;
        geo.attributes.position.needsUpdate = true;
        geo.computeVertexNormals();
        geo.computeBoundingSphere();
        mesh.visible = n > 0;
        if (wire) {
          var e = [], a, b;
          for (i = 0; i <= su; i += ku) for (j = 0; j < sw; j++) {
            a = i * (sw + 1) + j; b = a + 1;
            if (valid[a] && valid[b]) e.push(pa[3 * a], pa[3 * a + 1], pa[3 * a + 2], pa[3 * b], pa[3 * b + 1], pa[3 * b + 2]);
          }
          for (j = 0; j <= sw; j += kw) for (i = 0; i < su; i++) {
            a = i * (sw + 1) + j; b = a + sw + 1;
            if (valid[a] && valid[b]) e.push(pa[3 * a], pa[3 * a + 1], pa[3 * a + 2], pa[3 * b], pa[3 * b + 1], pa[3 * b + 2]);
          }
          if (setSegs(wl, e, e.length / 6)) show(wl, true); else show(wl, false);
        }
        requestRender();
        return g;
      };
      g.setColor = function (c) { paint(mesh.material, c); requestRender(); return g; };
      g.setOpacity = function (x) { setOpacity(mesh.material, x, 0.5); requestRender(); return g; };
      g.setFn(fn, o.u, o.w);
      return addTo(o, g);
    };

    // v.cylPoint({r, theta, z, label:'P', construction:true, showCartesian:false})
    //   → .set({r, theta, z}), .setVisible({construction, labels, cartesian})
    // Construction (as in the approved preview): orange r segment O→P' in the floor plane, violet θ arc
    // with arrowhead from +x, blue z segment P'→P, dashed r-colored guide (0,0,z)→P, labels P and P'.
    v.cylPoint = function (o) {
      o = o || {};
      var g = newGroup('cylPoint');
      var inner = new THREE.Group(); g.add(inner);
      var st = { r: num(o.r, 3 * S), theta: num(o.theta, Math.PI / 3), z: num(o.z, 2 * S) };
      if (o.r !== undefined) st.r = o.r;
      if (o.theta !== undefined) st.theta = o.theta;
      if (o.z !== undefined) st.z = o.z;
      var vis = { construction: o.construction !== false, labels: o.labels !== false, cartesian: !!o.showCartesian };
      var PS = Math.max(1e-6, num(o.size, 0.1 * S));
      var Pm = newMesh(geoSphere, stdMat(o.color || 'point'));
      Pm.scale.setScalar(PS);
      inner.add(Pm);
      var build = new THREE.Group(); inner.add(build);
      var foot = newMesh(geoSphere, basicMat('axis'));
      foot.scale.setScalar(0.055 * S);
      build.add(foot);
      var dash = { dashed: true, dashSize: 0.12 * S, gapSize: 0.09 * S };
      var rSeg = newLine({ color: 'r', width: 4.5 });
      var rTop = newLine({ color: 'r', width: 2, dashed: true, dashSize: dash.dashSize, gapSize: dash.gapSize, opacity: 0.8 });
      var zSeg = newLine({ color: 'z', width: 4.5 });
      var tArc = newLine({ color: 't', width: 3.5 });
      var tHead = newMesh(geoCone, stdMat('t'));
      rSeg.renderOrder = zSeg.renderOrder = tArc.renderOrder = 1;
      build.add(rSeg); build.add(rTop); build.add(zSeg); build.add(tArc); build.add(tHead);
      var cart = new THREE.Group(); inner.add(cart);
      var xLeg = newLine({ color: 'x', width: 2, dashed: true, dashSize: dash.dashSize, gapSize: dash.gapSize });
      var yLeg = newLine({ color: 'y', width: 2, dashed: true, dashSize: dash.dashSize, gapSize: dash.gapSize });
      cart.add(xLeg); cart.add(yLeg);

      var X = 0, Y = 0, Z = 0, R = 0, TH = 0, arcR = 0, hasArc = false;
      var eps = 0.02 * S;
      var P3 = new THREE.Vector3();
      function projDir(c, from, x, y, z) {
        var b = c.projLocal(g, x, y, z);
        return hypot(b[0] - from[0], b[1] - from[1]) > 3 ? unit2(b[0] - from[0], b[1] - from[1]) : null;
      }
      function awayFrom(dirs, fallback) {
        var sx = 0, sy = 0, n = 0;
        dirs.forEach(function (d) { if (d) { sx += d[0]; sy += d[1]; n++; } });
        var a = n ? unit2(-sx, -sy) : null;
        if (!a && n) { var d0 = dirs.filter(Boolean)[0]; a = [-d0[1], d0[0]]; if (a[1] > 0) a = neg2(a); }
        return a || fallback;
      }
      function placeP(c) {
        var p = c.anchor, ds = [];
        if (vis.construction) {
          if (Math.abs(Z) > eps) ds.push(projDir(c, p, X, Y, 0));
          if (R > 0.01 * S && Math.abs(Z) > eps) ds.push(projDir(c, p, 0, 0, Z));
          if (R > 0.01 * S && Math.abs(Z) <= eps) ds.push(projDir(c, p, 0, 0, 0));
        }
        var d = awayFrom(ds, [0.45, -0.89]);
        return { dirs: fan(d), gap: 3 + c.pxLen(Pm.getWorldPosition(P3), PS) };
      }
      function placeFoot(c) {
        var p = c.anchor, ds = [];
        if (R > 0.01 * S) ds.push(projDir(c, p, 0, 0, 0));
        if (Math.abs(Z) > eps) ds.push(projDir(c, p, X, Y, Z));
        if (vis.cartesian) { if (Math.abs(X) > eps) ds.push(projDir(c, p, 0, Y, 0)); if (Math.abs(Y) > eps) ds.push(projDir(c, p, X, 0, 0)); }
        return { dirs: fan(awayFrom(ds, [0.3, 0.95])).slice(0, 5), gap: 5 };
      }
      function placeZ(c) {
        var a = c.projLocal(g, X, Y, 0), b = c.projLocal(g, X, Y, Z);
        if (hypot(b[0] - a[0], b[1] - a[1]) < 16) return null;          // edge-on (e.g. top view)
        var s = unit2(b[0] - a[0], b[1] - a[1]), n = [-s[1], s[0]], p = c.anchor;
        if (R > 0.01 * S) {
          var ax = c.projLocal(g, 0, 0, Z / 2);
          if ((p[0] - ax[0]) * n[0] + (p[1] - ax[1]) * n[1] < 0) n = neg2(n);
        } else if (n[0] < 0) n = neg2(n);
        return { dirs: [n, neg2(n)], gap: 6 };
      }
      function placeR(c) {
        var a = c.projLocal(g, 0, 0, 0), b = c.projLocal(g, X, Y, 0);
        if (hypot(b[0] - a[0], b[1] - a[1]) < 18) return null;
        var s = unit2(b[0] - a[0], b[1] - a[1]), n = [-s[1], s[0]], p = c.anchor;
        if (hasArc) {
          var m = c.projLocal(g, arcR * Math.cos(TH / 2), arcR * Math.sin(TH / 2), 0);
          if ((m[0] - p[0]) * n[0] + (m[1] - p[1]) * n[1] > 0) n = neg2(n);
        } else if (n[1] < 0) n = neg2(n);
        // both sides blocked (e.g. by an x/y leg nearly parallel to OP' on screen): try slanted spots, and
        // with the legs shown drop the label rather than print it on a leg
        return { dirs: [n, neg2(n)], gap: 5, alt: slants(n), hideOnLine: vis.cartesian };
      }
      function slants(n) {
        var m = neg2(n);
        return [rot2(n, 0.5), rot2(n, -0.5), rot2(m, 0.5), rot2(m, -0.5), rot2(n, 1), rot2(n, -1), rot2(m, 1), rot2(m, -1)];
      }
      function placeT(c) {
        if (Math.abs(c.camEl) < 7 * DEG) return null;          // floor seen edge-on: the angle is unreadable
        var o0 = c.projLocal(g, 0, 0, 0), p = c.anchor;
        var d = hypot(p[0] - o0[0], p[1] - o0[1]) > 6 ? unit2(p[0] - o0[0], p[1] - o0[1]) : null;
        return { dirs: fan(d || [0.6, -0.8]).slice(0, 5), gap: 5 };
      }
      function legPlacer(isX) {
        return function (c) {
          if (Math.abs(c.camEl) < 7 * DEG) return null;
          var a = isX ? c.projLocal(g, 0, Y, 0) : c.projLocal(g, X, 0, 0), b = c.projLocal(g, X, Y, 0);
          if (hypot(b[0] - a[0], b[1] - a[1]) < 16) return null;
          var s = unit2(b[0] - a[0], b[1] - a[1]), n = [-s[1], s[0]], p = c.anchor, ctr = c.projLocal(g, X / 2, Y / 2, 0);
          if ((p[0] - ctr[0]) * n[0] + (p[1] - ctr[1]) * n[1] < 0) n = neg2(n);
          return { dirs: [n, neg2(n)], gap: 4, alt: slants(n), hideOnLine: true };
        };
      }
      var lblText = o.label === undefined ? 'P' : o.label;
      var PL = makeLabel(lblText || '', { background: true, prio: 10, place: placeP });
      var FL = makeLabel(lblText ? lblText + "'" : '', { className: 'small', prio: 5, place: placeFoot, hideOnCollide: true });
      var rL = makeLabel('r', { color: 'r', prio: 7, place: placeR, hideOnCollide: true });
      var tL = makeLabel('\\theta', { color: 't', prio: 6, place: placeT, hideOnCollide: true });
      var zL = makeLabel('z', { color: 'z', prio: 8, place: placeZ, hideOnCollide: true });
      var xL = makeLabel('x', { color: 'x', prio: 4, place: legPlacer(true), hideOnCollide: true });
      var yL = makeLabel('y', { color: 'y', prio: 4, place: legPlacer(false), hideOnCollide: true });
      inner.add(PL); build.add(FL); build.add(rL); build.add(tL); build.add(zL); cart.add(xL); cart.add(yL);

      function update() {
        var r = st.r, th = st.theta, z = st.z;
        if (!fin(r) || !isNum(th) || !fin(z)) { inner.visible = false; requestRender(); return; }
        inner.visible = true;
        if (r < 0) { r = -r; th += Math.PI; }        // same point, r ≥ 0 representation
        // The θ arc shows the angle as given within one turn either way (−π/4 sweeps clockwise, 2π is a
        // full turn); beyond that it shows the equivalent angle θ − 2πk with the same sign, so 9π/4 draws
        // exactly like π/4 and θ = ωt in an animation keeps sweeping round to P′.
        R = r; TH = Math.abs(th) <= TAU + 1e-9 ? th : th % TAU; Z = z;
        X = r * Math.cos(th); Y = r * Math.sin(th);
        var hasZ = Math.abs(z) > eps, hasR = r > 0.01 * S, L = vis.labels;
        Pm.position.set(X, Y, Z);
        PL.position.set(X, Y, Z);
        foot.position.set(X, Y, 0);
        foot.visible = hasZ;
        FL.position.set(X, Y, 0);
        setSegs(rSeg, [0, 0, 0, X, Y, 0], 1); show(rSeg, hasR);
        setSegs(rTop, [0, 0, Z, X, Y, Z], 1); show(rTop, hasR && hasZ);
        setSegs(zSeg, [X, Y, 0, X, Y, Z], 1); show(zSeg, hasZ);
        arcR = clamp(r * 0.42, 0.55 * S, 1.25 * S);
        hasArc = hasR && Math.abs(TH) >= 8 * DEG;      // on the z-axis (r = 0) θ is arbitrary: no θ arc
        if (hasArc) writeArc(tArc, tHead, arcR, 0, TH, 0, 0.22 * S, 0.075 * S);
        else { show(tArc, false); tHead.visible = false; }
        var rl = r > arcR + 0.4 * S ? (arcR + r) / 2 : r / 2;
        rL.position.set(rl * Math.cos(th), rl * Math.sin(th), 0);
        tL.position.set(arcR * Math.cos(TH / 2), arcR * Math.sin(TH / 2), 0);
        zL.position.set(X, Y, Z / 2);
        rL.userData.cyl.hidden = !L || !(r > 0.35 * S);
        tL.userData.cyl.hidden = !L || !hasArc;
        zL.userData.cyl.hidden = !L || !(Math.abs(z) > 0.3 * S);
        FL.userData.cyl.hidden = !L || !hasZ;
        setSegs(xLeg, [0, Y, 0, X, Y, 0], 1); show(xLeg, Math.abs(X) > eps);
        setSegs(yLeg, [X, 0, 0, X, Y, 0], 1); show(yLeg, Math.abs(Y) > eps);
        xL.position.set(X / 2, Y, 0);
        yL.position.set(X, Y / 2, 0);
        xL.userData.cyl.hidden = !L || !(Math.abs(X) > 0.25 * S);
        yL.userData.cyl.hidden = !L || !(Math.abs(Y) > 0.25 * S);
        build.visible = vis.construction;
        cart.visible = vis.cartesian;
        requestRender();
      }
      g.userData.cylSegs = function (c, out) {
        if (!inner.visible) return;
        function add(x1, y1, z1, x2, y2, z2) {
          var a = c.projLocal(g, x1, y1, z1), b = c.projLocal(g, x2, y2, z2);
          out.push([a[0], a[1], b[0], b[1]]);
        }
        if (vis.construction) {
          if (rSeg.visible) add(0, 0, 0, X, Y, 0);
          if (zSeg.visible) add(X, Y, 0, X, Y, Z);
          if (rTop.visible) add(0, 0, Z, X, Y, Z);
          if (hasArc) {
            var n = Math.max(2, Math.ceil(Math.abs(TH) / 0.5));
            for (var k = 0; k < n; k++) {
              var a0 = TH * k / n, a1 = TH * (k + 1) / n;
              add(arcR * Math.cos(a0), arcR * Math.sin(a0), 0, arcR * Math.cos(a1), arcR * Math.sin(a1), 0);
            }
          }
        }
        if (vis.cartesian) {
          if (xLeg.visible) add(0, Y, 0, X, Y, 0);
          if (yLeg.visible) add(X, 0, 0, X, Y, 0);
        }
      };
      segSources.add(g);
      g.set = function (p) { merge(st, p, ['r', 'theta', 'z']); update(); return g; };
      g.setVisible = function (p) {
        p = p || {};
        ['construction', 'labels', 'cartesian'].forEach(function (k) { if (p[k] !== undefined) vis[k] = !!p[k]; });
        update();
        return g;
      };
      g.get = function () { return { r: st.r, theta: st.theta, z: st.z }; };
      g.getPosition = function () { return inner.visible ? [X, Y, Z] : null; };
      g.setLabel = function (t) { setLabelText(PL, t || ''); setLabelText(FL, t ? t + "'" : ''); return g; };
      g.setColor = function (c) { paint(Pm.material, c); requestRender(); return g; };
      update();
      return addTo(o, g);
    };

    // v.unitVectors({r, theta, z, length:1, labels:true}) — ê_r, ê_θ, ê_z at the point → .set({...})
    v.unitVectors = function (o) {
      o = o || {};
      var g = newGroup('unitVectors');
      var st = { r: 2 * S, theta: Math.PI / 4, z: 0, length: 1 * S };
      var lab = o.labels !== false;
      var ao = { parent: g, width: o.width, headLength: o.headLength, headRadius: o.headRadius };
      var er = v.arrow(null, null, Object.assign({ color: 'r', label: lab ? '\\er' : null }, ao));
      var et = v.arrow(null, null, Object.assign({ color: 't', label: lab ? '\\et' : null }, ao));
      var ez = v.arrow(null, null, Object.assign({ color: 'z', label: lab ? '\\ez' : null }, ao));
      g.set = function (p) {
        merge(st, p, ['r', 'theta', 'z', 'length']);
        var ok = allFin(st, ['r', 'z', 'length']) && isNum(st.theta) && st.length > 0;
        if (!ok) { er.set(null, null); et.set(null, null); ez.set(null, null); return g; }
        var r = st.r, th = st.theta;
        if (r < 0) { r = -r; th += Math.PI; }
        var c = Math.cos(th), s = Math.sin(th), x = r * c, y = r * s, z = st.z, L = st.length;
        er.set([x, y, z], [x + L * c, y + L * s, z]);
        et.set([x, y, z], [x - L * s, y + L * c, z]);
        ez.set([x, y, z], [x, y, z + L]);
        return g;
      };
      g.arrows = { r: er, t: et, z: ez };
      g.set(o);
      return addTo(o, g);
    };

    // v.cartTriad({origin:[0,0,0], length:1}) — î, ĵ, k̂
    v.cartTriad = function (o) {
      o = o || {};
      var g = newGroup('cartTriad');
      var st = { origin: [0, 0, 0], length: 1 * S };
      var lab = o.labels !== false;
      var ao = { parent: g, width: o.width, headLength: o.headLength, headRadius: o.headRadius };
      var ai = v.arrow(null, null, Object.assign({ color: 'x', label: lab ? '\\ihat' : null }, ao));
      var aj = v.arrow(null, null, Object.assign({ color: 'y', label: lab ? '\\jhat' : null }, ao));
      var ak = v.arrow(null, null, Object.assign({ color: 'axis', label: lab ? '\\khat' : null }, ao));
      g.set = function (p) {
        merge(st, p, ['origin', 'length']);
        var O = pos3(st.origin), L = st.length;
        if (!O || !fin(L) || !(L > 0)) { ai.set(null, null); aj.set(null, null); ak.set(null, null); return g; }
        ai.set(O, [O[0] + L, O[1], O[2]]);
        aj.set(O, [O[0], O[1] + L, O[2]]);
        ak.set(O, [O[0], O[1], O[2] + L]);
        return g;
      };
      g.arrows = { i: ai, j: aj, k: ak };
      g.set(o);
      return addTo(o, g);
    };

    /* ---------------- disposal ---------------- */
    function disposeTree(obj) {
      obj.traverse(function (o) {
        segSources.delete(o);
        if (o.isCSS2DObject) {
          labels.delete(o);
          if (o.element && o.element.parentNode) o.element.parentNode.removeChild(o.element);
        }
        if (o.geometry && !(o.geometry.userData && o.geometry.userData.cylShared)) o.geometry.dispose();
        if (o.material) {
          (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { colorReg.delete(m); m.dispose(); });
        }
      });
    }

    /* ---------------- public API ---------------- */
    v.THREE = THREE;
    v.scene = scene;
    v.camera = camera;
    v.renderer = renderer;
    v.controls = controls;
    v.root = root;
    v.axes = axesGroup;
    v.grid = gridGroup;
    v.el = wrap;
    v.canvas = canvas;
    v.extent = E;
    v.isFallback = false;

    v.render = function () { requestRender(); };
    v.animate = function (fn) {
      if (typeof fn !== 'function' || disposed) return function () {};
      var a = { fn: fn, t: 0, dead: false };
      anims.push(a);
      lastT = raf ? lastT : 0;
      schedule();
      return function () { a.dead = true; var i = anims.indexOf(a); if (i >= 0) anims.splice(i, 1); };
    };
    v.setView = function (name, animate) { setView(name, animate); };
    v.setCamera = function (spec, animate) {
      if (disposed) return;
      var to = (W > 0 && H > 0) ? resolveCamera(spec, W, H) : resolveCamera(spec);
      setPressed(to.view || null);
      startTween(to, animate !== false);
    };
    // v.setHome(spec?) → v: the camera that the Reset view button, Home and 0 return to (default: the
    // create() camera). spec as for setCamera(); with no argument the current camera — or the end of a
    // camera move in progress — becomes home. Does not move the camera. Typical use: after
    // v.setCamera(spec) for a new gallery entry, call v.setHome(spec) so Reset returns to that entry's view.
    v.setHome = function (spec) {
      if (disposed) return v;
      var to;
      if (spec == null) {
        var src = (W < 1 || H < 1) ? (pendingCam || home) : (tween ? tween.to : camState());
        to = { az: src.az, el: src.el, k: src.k, target: src.target.clone(),
               view: src.view !== undefined ? src.view : currentView };
      } else {
        to = (W > 0 && H > 0) ? resolveCamera(spec, W, H) : resolveCamera(spec);
      }
      home = to;
      if (W > 0 && H > 0) updateLimits();
      return v;
    };
    v.getCamera = function () {
      var p = camera.position, t = controls.target, off = p.clone().sub(t), D = off.length() || 1;
      off.divideScalar(D);
      var fit = fitDistance(off, t, aspectNow(), camera.fov);
      return {
        position: [p.x, p.y, p.z], target: [t.x, t.y, t.z],
        azimuth: Math.atan2(off.y, off.x) / DEG, elevation: Math.asin(clamp(off.z, -1, 1)) / DEG,
        zoom: fit / D, view: currentView
      };
    };
    v.group = function (parent) {
      var g = new THREE.Group();
      ((parent && parent.isObject3D) ? parent : root).add(g);
      return g;
    };
    v.remove = function (obj) {
      if (!obj || !obj.isObject3D || obj === scene) return;
      if (obj === root || obj === decor) { v.clear(obj); return; }
      if (obj.parent) obj.parent.remove(obj);
      disposeTree(obj);
      requestRender();
    };
    v.clear = function (grp) {
      if (grp === undefined) grp = root;                 // clear() empties the content root
      else if (!grp || !grp.isObject3D) return;          // null / junk: no-op
      if (grp === scene) grp = root;
      grp.children.slice().forEach(function (c) { grp.remove(c); disposeTree(c); });
      requestRender();
    };
    v.onChange = function (fn) {
      if (typeof fn !== 'function') return function () {};
      changeFns.push(fn);
      return function () { var i = changeFns.indexOf(fn); if (i >= 0) changeFns.splice(i, 1); };
    };
    v.setAriaLabel = function (text) { ariaText = String(text || ''); canvas.setAttribute('aria-label', ariaText); };
    v.stats = function () { return { frames: frames, renders: renders, animating: anims.length, onScreen: onScreen, width: W, height: H, labels: labels.size, fallback: false }; };

    // PNG data URL of the current view. Renders and reads back in the same task (no
    // preserveDrawingBuffer needed). Labels (HTML) are redrawn onto the image as text.
    v.screenshot = function (o) {
      if (disposed || W < 1 || H < 1) return null;
      o = o || {};
      draw();
      if (o.labels === false) return canvas.toDataURL('image/png');
      var out = document.createElement('canvas');
      out.width = canvas.width; out.height = canvas.height;
      var c2 = out.getContext('2d');
      if (!c2) return canvas.toDataURL('image/png');
      if (transparentBg && o.background !== false) {
        c2.fillStyle = resolveCss('viz');
        c2.fillRect(0, 0, out.width, out.height);
      }
      c2.drawImage(canvas, 0, 0);
      var scale = canvas.width / W, base = canvas.getBoundingClientRect();
      labels.forEach(function (lb) {
        var el = lb.element, ud = lb.userData.cyl;
        if (!isAttached(lb) || el.style.display === 'none' || !ud.shown || ud.hidden || ud.empty) return;
        var vis = true, p = lb;
        while (p) { if (p.visible === false) { vis = false; break; } p = p.parent; }
        if (!vis) return;
        var rc = el.getBoundingClientRect(), cs = getComputedStyle(el);
        var cx = (rc.left + rc.width / 2 - base.left) * scale, cy = (rc.top + rc.height / 2 - base.top) * scale;
        var fs = parseFloat(cs.fontSize) || 16, weight = cs.fontWeight || '600';
        c2.save();
        if (/\bbg\b/.test(el.className)) {
          c2.fillStyle = cs.backgroundColor;
          var bw = rc.width * scale, bh = rc.height * scale, bx = cx - bw / 2, by = cy - bh / 2, rr = 4 * scale;
          c2.beginPath();
          c2.moveTo(bx + rr, by); c2.lineTo(bx + bw - rr, by); c2.quadraticCurveTo(bx + bw, by, bx + bw, by + rr);
          c2.lineTo(bx + bw, by + bh - rr); c2.quadraticCurveTo(bx + bw, by + bh, bx + bw - rr, by + bh);
          c2.lineTo(bx + rr, by + bh); c2.quadraticCurveTo(bx, by + bh, bx, by + bh - rr);
          c2.lineTo(bx, by + rr); c2.quadraticCurveTo(bx, by, bx + rr, by);
          c2.fill();
        }
        c2.fillStyle = cs.color;
        c2.textBaseline = 'middle';
        var runs = ud.tex ? texRuns(ud.text) : [{ t: el.textContent, lvl: 0, b: false, it: false }];
        var size0 = fs * (ud.tex ? 1.1 : 1) * scale, total = 0;
        var fam = ud.tex ? 'KaTeX_Math, KaTeX_Main, "Times New Roman", serif' : (cs.fontFamily || 'sans-serif');
        runs.forEach(function (rn) {
          var sz = rn.lvl ? size0 * 0.72 : size0;
          rn.font = (rn.it ? 'italic ' : '') + (rn.b ? '700 ' : (ud.tex ? '400 ' : weight + ' ')) + sz.toFixed(1) + 'px ' + (rn.it || !ud.tex ? fam : 'KaTeX_Main, "Times New Roman", serif');
          c2.font = rn.font;
          rn.w = c2.measureText(rn.t).width;
          rn.dy = rn.lvl < 0 ? size0 * 0.28 : rn.lvl > 0 ? -size0 * 0.36 : 0;
          total += rn.w;
        });
        var x = cx - total / 2;
        runs.forEach(function (rn) { c2.font = rn.font; c2.fillText(rn.t, x, cy + rn.dy); x += rn.w; });
        c2.restore();
      });
      return out.toDataURL('image/png');
    };

    v.dispose = function () {
      if (disposed) return;
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      if (heightRAF) cancelAnimationFrame(heightRAF);
      raf = heightRAF = 0;
      clearTimeout(changeTimer);
      clearTimeout(hintTimer);
      anims.length = 0;
      changeFns.length = 0;
      tween = null;
      if (ro) ro.disconnect(); else window.removeEventListener('resize', resize);
      if (io) io.disconnect();
      var ix = live.indexOf(rec);
      if (ix >= 0) live.splice(ix, 1);
      wrap.removeEventListener('wheel', onWheelCapture, { capture: true });
      wrap.removeEventListener('pointerdown', onPointerCapture, { capture: true });
      canvas.removeEventListener('keydown', onKey);
      try { controls.dispose(); } catch (e) { /* ignore */ }
      disposeTree(scene);
      [geoSphere, geoCone, geoShaft].forEach(function (g) { g.dispose(); });
      colorReg.clear();
      labels.clear();
      try { renderer.dispose(); } catch (e) { /* ignore */ }
      try { renderer.forceContextLoss(); } catch (e) { /* ignore */ }
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    };

    var printImg = null;
    var rec = {
      applyTheme: applyTheme,
      printOn: function () {
        if (disposed || W < 1 || H < 1) return;
        try {
          var url = v.screenshot();
          if (!url) return;
          if (!printImg) { printImg = document.createElement('img'); printImg.className = 'cyl3d-print'; printImg.alt = ''; }
          printImg.src = url;
          wrap.appendChild(printImg);
          wrap.classList.add('cyl3d-printing');
        } catch (e) { /* printing still shows whatever the canvas holds */ }
      },
      printOff: function () {
        wrap.classList.remove('cyl3d-printing');
        if (printImg && printImg.parentNode) printImg.parentNode.removeChild(printImg);
        printImg = null;
      },
      wake: function () { if (!document.hidden) { lastT = 0; if (needsRender || anims.length || tween) schedule(); } },
      remeasure: function () { labels.forEach(function (lb) { lb.userData.cyl.w = 0; }); requestRender(); }
    };
    live.push(rec);

    resize();
    requestRender();
    return v;
  }

  window.CYL3D = {
    version: VERSION,
    available: available,
    create: create,
    VIEWS: Object.keys(VIEWS)
  };
})();
