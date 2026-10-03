/*
 * cyl-2d.js — CYL2D: crisp, theme-aware 2D SVG plots for the Angular Momentum module.
 * Classic script (IIFE) that attaches ONE global: CYL2D. Uses CYL (cyl-core.js) for CYL.tex / CYL.fmt /
 * CYL.error when present, and degrades gracefully (plain KaTeX or text) when it is not.
 *
 *   const p = CYL2D.plane(container, {
 *     xRange:[-4,4], yRange:[-4,4],      // math coordinates; equal x/y scaling. The requested ranges are always
 *                                        //   fully visible; the visible area grows in one direction if needed.
 *     width:null,                        // null = container width; a number = maximum width in px (centered)
 *     height:null,                       // null = derived from the ranges (max `maxHeight`, default 480)
 *     grid:'polar'|'cartesian'|'both'|'none',  polarStep:{r:1, thetaDeg:30},
 *                                        //   polarStep.r: an explicit value is honoured; the default 1 is
 *                                        //   replaced by a range-derived step when the larger range span is
 *                                        //   outside [2, 16] (e.g. 0.02 for a ±0.06 m pipe, 10 for ±40).
 *                                        //   Rings closer than 12 px are thinned to multiples (×2, ×5, ×10 …).
 *     axes:true, axisLabels:['x','y'] (TeX; null = none), ticks:true (true = auto | false | step number),
 *                                        //   Axis labels, angle labels and tick labels never overlap: an axis
 *                                        //   label is nudged past a colliding tick label when there is room,
 *                                        //   otherwise the tick label is dropped (its tick mark stays).
 *     ariaLabel:'REQUIRED description',
 *     // additions: gridStep:null (Cartesian grid/tick base step; auto), angleLabels:false|'deg'|'rad'
 *     //   (angle labels around a polar grid), polarMax:null (limit polar circles/rays to this radius),
 *     //   tickFormat:(v, 'x'|'y') => string, pad:10 (px margin around the ranges), maxHeight:480,
 *     //   background:'viz' (semantic color or 'none')
 *   })
 *   p.svg, p.el (wrapper div.cyl2d), p.toPx([x,y]) -> [px,py], p.fromPx([px,py]) -> [x,y]
 *   p.point([x,y], {color:'point', r:5, label:null (TeX), draggable:false, onDrag:([x,y], info)=>{},
 *                   snap:null (fn([x,y])->[x,y] | step number | 'grid'),
 *                   // additions: labelAnchor:'ne', labelOffset:[dx,dy], hollow:false, bounds (default = the
 *                   //   requested ranges; false = none), keyStep, keyStepFine, keyMove(pos, [dx,dy], fine)->pos,
 *                   //   onDragStart(pos), onDragEnd(pos), ariaLabel (name), ariaFormat(pos)->string })
 *                                                       -> .set([x,y]), .get(), .el, .setLabel(tex), .focus()
 *   p.line(a, b, {color:'ink', width:2, dashed:false, arrow:false|true|'end'|'start'|'both', opacity,
 *                 label, labelAt:0.5, labelSide:'right'|'left', labelGap:7})          -> .set(a, b), .get()
 *   p.polyline(points, {color:'ink', width:2, closed:false, fill:null, fillOpacity:0.15, dashed, arrow})
 *                                                                                       -> .set(points)
 *   p.arc({center:[0,0], r, theta0, theta1, color:'t', width:2, arrow:true, rPx (radius in px instead of r),
 *          dashed, label (TeX at the mid-angle, outside the arc), labelGap:5})            -> .set({...})
 *   p.circle({center:[0,0], r, color:'ink', width:2, dashed:false, fill:null, fillOpacity:0.15})  -> .set({...})
 *   p.sector({center:[0,0], r0:0, r1, theta0, theta1, color:'accent', fillOpacity:0.18, width:1.5})
 *                                                       // annular sector (polar rectangle) -> .set({...})
 *   p.label([x,y], tex, {color:'ink', anchor:'c', offset:[dx,dy], tex:true, className:'', background:false,
 *                        gap:4})                                        -> .set([x,y], tex), .setText(tex)
 *        anchor = the side of the point the label sits on: 'c','n','s','e','w','ne','nw','se','sw'
 *        (so 'ne' puts the label up and to the right). offset is in screen px, +dy = down.
 *   p.fn(f(x)->y, {color:'accent', width:2.5, samples:300, domain:[a,b], dashed})      -> .setFn(f)
 *   p.polar(f(θ)->r, {theta0:0, theta1:2π, color:'accent', width:2.5, samples, negativeR:'skip'|'plot'})
 *                                                       -> .setFn(f), .set({theta0, theta1})
 *        negativeR:'skip' (default) leaves out θ where f(θ) < 0, matching the module's r ≥ 0 convention.
 *   Every handle also has .setVisible(bool), .setColor(c), .remove(), .el.
 *   p.group(parentGroup?) -> group with the same primitive methods (.point, .line, …) plus .setVisible(bool),
 *        .clear(), .remove(); primitives also accept {parent: group}.
 *   p.clear(group?)   // remove the group's items, or every item when called without arguments
 *   p.redraw()        // recompute size and redraw (automatic on resize; theme changes need nothing: every
 *                     //   stroke/fill references a CSS variable)
 *   additions: p.setOptions(partialOpts), p.setRange(xRange, yRange), p.getView() -> {x, y, width, height,
 *     scale}, p.step() (grid step used by the keyboard and as the tick base: gridStep, else for a polar grid
 *     the ring step unless it exceeds a quarter of the range, else niceStep(range / 10)), p.remove(handle),
 *     p.destroy()
 *   Sizing: the svg scales UNIFORMLY (viewBox + height:auto) and overlay labels are positioned in % of the plot,
 *     so a plane shown at a size other than its layout (the frame before a resize redraw, or print, where no
 *     script runs) keeps circles round and labels on their items. In print a plane is never enlarged beyond
 *     its on-screen layout width (a narrower page scales it down). Resize redraws that merely flip back to the
 *     previous width within 1 s (a scrollbar toggled by the plot's own height) are skipped.
 *   CYL2D.snapGrid(step | [sx, sy]) -> snap fn; CYL2D.snapPolar(rStep, thetaStepRad) -> snap fn;
 *   CYL2D.paint(color) -> CSS paint string (e.g. 'var(--c-r)'); CYL2D.version
 *
 * Colors: semantic names 'r','t','z','x','y','axis','grid','point','surface','accent','ink','muted','good',
 * 'bad','warn' (also 'faint','bg','viz','line') map to the module.css color variables (--c-r, --c-t, --c-z, …); hex / rgb() strings are
 * accepted too. Degenerate input (NaN, r = 0, theta1 == theta0, zero-length lines, throwing functions, …)
 * never throws: the item is simply hidden until it gets valid input.
 */
(function (global) {
  'use strict';
  if (global.CYL2D) return;

  var SVGNS = 'http://www.w3.org/2000/svg';
  var TAU = 2 * Math.PI;
  var DEG = Math.PI / 180;
  var BIG = 1e5;               // px clamp so huge coordinates never reach the SVG renderer
  var ARROW_BACK = 0.74;       // part of the arrowhead in front of the notch where the stroked path stops
  var hasOwn = Object.prototype.hasOwnProperty;
  var planeCount = 0;
  var COARSE = false;
  try { COARSE = !!(global.matchMedia && global.matchMedia('(pointer: coarse)').matches); } catch (e) { /* ignore */ }

  // ------------------------------------------------------------------ utilities
  function num(v, d) {
    if (v === null || v === undefined || v === '' || typeof v === 'boolean') return d;
    v = +v;
    return isFinite(v) ? v : d;
  }
  function posNum(v, d) { v = num(v, d); return v > 0 ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function toPt(p) {
    if (!p || typeof p !== 'object') return null;
    if (typeof p.length === 'number') return p.length >= 2 ? [+p[0], +p[1]] : null;
    if ('x' in p && 'y' in p) return [+p.x, +p.y];
    return null;
  }
  function okPt(p) { return !!p && isFinite(p[0]) && isFinite(p[1]); }
  function rd(v) { v = v > BIG ? BIG : v < -BIG ? -BIG : v; return Math.round(v * 100) / 100; }
  function report(msg) {
    try {
      if (global.CYL && typeof global.CYL.error === 'function') global.CYL.error('CYL2D: ' + msg);
      else if (global.console) global.console.error('CYL2D: ' + msg);
    } catch (e) { /* ignore */ }
  }
  function warn(msg) { try { if (global.console) global.console.warn('CYL2D: ' + msg); } catch (e) { /* ignore */ } }
  // Call a page-supplied callback; report (but contain) exceptions.
  function callUser(fn, args, what) {
    try { return fn.apply(null, args); } catch (e) { report(what + ' threw: ' + (e && e.message ? e.message : e)); return undefined; }
  }
  // Evaluate a plotted function quietly: exceptions and non-numbers become NaN.
  function evalQuiet(f, x) {
    try { var y = f(x); return typeof y === 'number' ? y : (y === null || y === undefined ? NaN : +y); } catch (e) { return NaN; }
  }
  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function fmt(x, sig) {
    if (global.CYL && typeof global.CYL.fmt === 'function') { try { return String(global.CYL.fmt(x, sig)); } catch (e) { /* fall through */ } }
    if (!isFinite(x)) return String(x);
    if (Math.abs(x) < 1e-10) return '0';
    return String(parseFloat((+x).toPrecision(sig || 4))).replace('-', '−');
  }
  var texCache = Object.create(null);
  var texCacheSize = 0;
  function texHTML(src) {
    src = String(src);
    var hit = texCache[src];
    if (hit !== undefined) return hit;
    var out;
    try {
      if (global.CYL && typeof global.CYL.tex === 'function') out = global.CYL.tex(src, false);
      else if (global.katex) {
        out = global.katex.renderToString(src, {
          throwOnError: false,
          trust: function (c) { return c.command === '\\htmlClass'; },
          strict: function (code) { return code === 'htmlExtension' ? 'ignore' : 'warn'; }
        });
      } else out = escapeHTML(src);
    } catch (e) { out = escapeHTML(src); }
    if (++texCacheSize > 500) { texCache = Object.create(null); texCacheSize = 1; }
    texCache[src] = out;
    return out;
  }
  var GREEK = { theta: 'θ', vartheta: 'θ', phi: 'φ', varphi: 'φ', rho: 'ρ', alpha: 'α', beta: 'β', gamma: 'γ',
    pi: 'π', omega: 'ω', Omega: 'Ω', delta: 'δ', Delta: 'Δ', mu: 'μ', lambda: 'λ', tau: 'τ', prime: "'" };
  function texToText(s) {
    s = String(s === null || s === undefined ? '' : s);
    s = s.replace(/\\htmlClass\{[^}]*\}/g, '');
    s = s.replace(/\\([A-Za-z]+)/g, function (m, n) { return hasOwn.call(GREEK, n) ? GREEK[n] : ''; });
    s = s.replace(/\\[,;:! ]/g, ' ').replace(/[{}$^_]/g, '').replace(/\s+/g, ' ').trim();
    return s;
  }
  function niceStep(raw) {
    if (!(raw > 0) || !isFinite(raw)) return 1;
    var m = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var n = raw / m;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * m;
  }
  var MULTS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = a % b; a = b; b = t; } return a; }
  // TeX for an angle given in degrees, as a compact inline multiple of π ("3\pi/4") when possible.
  function angleTexRad(deg) {
    for (var d = 1; d <= 12; d++) {
      var k = deg * d / 180;
      if (Math.abs(k - Math.round(k)) < 1e-9) {
        k = Math.round(k);
        if (k === 0) return '0';
        var g = gcd(k, d), kk = k / g, dd = d / g;
        var numTex = (kk === 1 ? '' : kk === -1 ? '-' : String(kk)) + '\\pi';
        return dd === 1 ? numTex : numTex + '/' + dd;
      }
    }
    return fmt(deg * DEG, 3).replace('−', '-');
  }

  // ------------------------------------------------------------------ colors
  var COLORS = { r: '--c-r', t: '--c-t', n: '--c-n', theta: '--c-t', z: '--c-z', x: '--c-x', y: '--c-y', v: '--c-v', axis: '--c-axis',
    grid: '--c-grid', point: '--c-point', surface: '--c-surface', accent: '--accent', ink: '--ink',
    muted: '--ink-muted', faint: '--ink-faint', good: '--c-good', bad: '--c-bad', warn: '--c-warn', bg: '--bg',
    viz: '--viz-bg', line: '--line' };
  // Semantic name / hex / CSS color -> CSS paint string. Values are always applied through the CSSOM
  // (el.style.x = …), so an invalid string is ignored by the browser instead of injecting anything.
  function paint(c, dflt) {
    if (c === undefined || c === null || c === '' || c === true) c = dflt;
    if (c === undefined || c === null || c === false || c === 'none') return 'none';
    c = String(c).trim();
    if (hasOwn.call(COLORS, c)) return 'var(' + COLORS[c] + ')';
    if (/^--[\w-]+$/.test(c)) return 'var(' + c + ')';
    return c;
  }

  // ------------------------------------------------------------------ DOM helpers + injected CSS
  function S(tag, attrs, parent) {
    var e = document.createElementNS(SVGNS, tag);
    if (attrs) for (var k in attrs) if (hasOwn.call(attrs, k) && attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function H(tag, cls, parent) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }
  function empty(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function detach(el) { if (el && el.parentNode) el.parentNode.removeChild(el); }

  var CSS = [
    '.cyl2d{position:relative;min-width:0;max-width:100%}',
    '.cyl2d>svg.cyl2d-svg{display:block;width:100%;height:auto}',
    '.cyl2d-overlay,.cyl2d-layer{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none}',
    '.cyl2d-overlay{overflow:hidden}',
    '.cyl2d-label{position:absolute;left:0;top:0;white-space:nowrap;pointer-events:none}',
    '.cyl2d svg .cyl2d-point[tabindex]:focus,.cyl2d svg .cyl2d-point[tabindex]:focus-visible{outline:none}',
    '.cyl2d-point.is-draggable{cursor:grab;touch-action:none;-webkit-tap-highlight-color:transparent}',
    '.cyl2d-point.is-dragging,.cyl2d.is-dragging{cursor:grabbing}',
    '.cyl2d-ring{opacity:0;transition:opacity .12s}',
    '.cyl2d-point.is-draggable:hover .cyl2d-ring{opacity:.45}',
    '.cyl2d-point:focus-visible .cyl2d-ring,.cyl2d-point.is-dragging .cyl2d-ring{opacity:1}',
    '.cyl2d-tick{font-size:12px;font-family:var(--font-sans);paint-order:stroke;stroke-linejoin:round;font-variant-numeric:tabular-nums}',
    '@media (prefers-reduced-motion:reduce){.cyl2d-ring{transition:none}}',
    // Print: no script runs during print layout, so a plane keeps the layout it had on screen. Never enlarge it
    // (it would print bigger than on screen and push page breaks); a narrower page scales it down uniformly.
    '@media print{.cyl2d[data-cyl2d]{max-width:var(--cyl2d-w,none)!important;margin-left:auto!important;margin-right:auto!important}}'
  ].join('\n');
  function injectStyle() {
    if (document.getElementById('cyl2d-style')) return;
    var st = document.createElement('style');
    st.id = 'cyl2d-style';
    st.textContent = CSS;
    // First in <head> so module.css rules of equal specificity win.
    var head = document.head || document.getElementsByTagName('head')[0] || document.documentElement;
    head.insertBefore(st, head.firstChild);
  }

  // ------------------------------------------------------------------ labels (HTML overlay)
  var ANCHORS = { c: [-50, -50, 0, 0], n: [-50, -100, 0, -1], s: [-50, 0, 0, 1], e: [0, -50, 1, 0], w: [-100, -50, -1, 0],
    ne: [0, -100, 0.7071, -0.7071], nw: [-100, -100, -0.7071, -0.7071], se: [0, 0, 0.7071, 0.7071], sw: [-100, 0, -0.7071, 0.7071] };
  var ANCHOR_ALIAS = { center: 'c', middle: 'c', north: 'n', top: 'n', above: 'n', south: 's', bottom: 's', below: 's',
    east: 'e', right: 'e', west: 'w', left: 'w', northeast: 'ne', northwest: 'nw', southeast: 'se', southwest: 'sw',
    'top-right': 'ne', 'top-left': 'nw', 'bottom-right': 'se', 'bottom-left': 'sw' };
  function anchorKey(a) {
    a = String(a === undefined || a === null ? 'c' : a).toLowerCase();
    if (hasOwn.call(ANCHORS, a)) return a;
    return hasOwn.call(ANCHOR_ALIAS, a) ? ANCHOR_ALIAS[a] : 'c';
  }
  // Screen-space direction -> the anchor that puts a label on that side.
  function dirAnchor(nx, ny) {
    var k = Math.round(Math.atan2(-ny, nx) / (Math.PI / 4));
    k = ((k % 8) + 8) % 8;
    return ['e', 'ne', 'n', 'nw', 'w', 'sw', 's', 'se'][k];
  }
  function setLabelContent(lb, text, isTex) {
    text = text === undefined || text === null ? '' : String(text);
    if (lb.text === text && lb.isTex === isTex) return;
    lb.text = text; lb.isTex = isTex;
    if (!text) lb.el.textContent = '';
    else if (isTex) lb.el.innerHTML = texHTML(text);
    else lb.el.textContent = text;
  }
  // Position a label at plot px (px, py) of a W × H layout. The anchor point is stored as a PERCENTAGE of the
  // overlay (which always covers the svg exactly), so when the figure is shown at a size other than the one it
  // was laid out for (printing, the frame before a resize redraw, a suppressed redraw) the label still lands on
  // the element it describes; only the gap/offset stay in screen px because label text does not scale.
  function pct(v, total) { v = v > BIG ? BIG : v < -BIG ? -BIG : v; return Math.round(v / total * 1e6) / 1e4 + '%'; }
  function placeLabel(lb, px, py, anchor, offset, gap, W, H) {
    var a = ANCHORS[anchorKey(anchor)];
    var g = gap === undefined || gap === null ? 4 : +gap || 0;
    var ox = offset ? num(offset[0], 0) : 0, oy = offset ? num(offset[1], 0) : 0;
    var l = pct(px, W), tp = pct(py, H);
    var t = 'translate(' + rd(a[2] * g + ox) + 'px,' + rd(a[3] * g + oy) + 'px) translate(' + a[0] + '%,' + a[1] + '%)';
    var s = lb.el.style;
    if (lb.l !== l) { s.left = l; lb.l = l; }
    if (lb.tp !== tp) { s.top = tp; lb.tp = tp; }
    if (lb.tf !== t) { s.transform = t; lb.tf = t; }
  }
  // Box [x0, y0, x1, y1] (px) of a w × h label placed by placeLabel(…, anchor, null, gap).
  function labelBox(px, py, anchor, gap, w, h) {
    var a = ANCHORS[anchorKey(anchor)];
    var x = px + a[2] * gap + a[0] / 100 * w, y = py + a[3] * gap + a[1] / 100 * h;
    return [x, y, x + w, y + h];
  }
  // Does box b come within m px of any box in list?
  function boxHit(b, list, m) {
    m = m || 0;
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c && b[0] < c[2] + m && b[2] > c[0] - m && b[1] < c[3] + m && b[3] > c[1] - m) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ geometry helpers (px space)
  function polyLen(pts) {
    var s = 0;
    for (var i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return s;
  }
  function trimEnd(pts, d) {
    var out = pts.slice();
    while (out.length >= 2) {
      var a = out[out.length - 2], b = out[out.length - 1];
      var seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (seg > d) {
        var t = (seg - d) / seg;
        out[out.length - 1] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        return out;
      }
      d -= seg;
      out.pop();
    }
    return out;
  }
  function trimStart(pts, d) { return trimEnd(pts.slice().reverse(), d).reverse(); }
  // Path data for one or more runs of px points; consecutive near-duplicates are dropped.
  function runsD(runs, closed) {
    var d = '';
    for (var r = 0; r < runs.length; r++) {
      var run = runs[r], last = null, part = '', n = 0;
      for (var i = 0; i < run.length; i++) {
        var p = run[i];
        if (last && Math.abs(p[0] - last[0]) < 0.01 && Math.abs(p[1] - last[1]) < 0.01) continue;
        part += (n === 0 ? 'M' : 'L') + rd(p[0]) + ' ' + rd(p[1]);
        last = p; n++;
      }
      if (n >= 2) d += part + (closed ? 'Z' : '');
    }
    return d;
  }
  function arrowFlags(a) {
    if (a === 'both') return { s: true, e: true };
    if (a === 'start') return { s: true, e: false };
    if (a === 'end' || a === true) return { s: false, e: true };
    return { s: false, e: false };
  }
  function arrowLen(w) { return 7 + 2.2 * w; }
  function dashArray(d, w) {
    if (typeof d === 'string' && /^[\d.\s,]+$/.test(d)) return d;
    if (d && typeof d === 'object' && typeof d.length === 'number') return Array.prototype.map.call(d, function (v) { return num(v, 1); }).join(' ');
    return rd(Math.max(4, 3 * w)) + ' ' + rd(Math.max(3, 2.2 * w));
  }

  // ------------------------------------------------------------------ snapping helpers (public)
  function snapGrid(step) {
    var sx, sy;
    if (step && typeof step === 'object' && typeof step.length === 'number') { sx = posNum(step[0], 1); sy = posNum(step[1], sx); }
    else { sx = sy = posNum(step, 1); }
    return function (p) {
      var q = toPt(p);
      if (!okPt(q)) return q;
      var x = Math.round(q[0] / sx) * sx, y = Math.round(q[1] / sy) * sy;
      return [Math.round(x * 1e9) / 1e9, Math.round(y * 1e9) / 1e9];
    };
  }
  function snapPolar(rStep, thetaStep) {
    var rs = posNum(rStep, 0), ts = posNum(thetaStep, 0);
    return function (p) {
      var q = toPt(p);
      if (!okPt(q)) return q;
      var r = Math.hypot(q[0], q[1]), th = Math.atan2(q[1], q[0]);
      if (rs) r = Math.round(r / rs) * rs;
      if (ts) th = Math.round(th / ts) * ts;
      if (r < 1e-12) return [0, 0];
      var x = r * Math.cos(th), y = r * Math.sin(th);
      if (Math.abs(x) < 1e-12) x = 0;
      if (Math.abs(y) < 1e-12) y = 0;
      return [x, y];
    };
  }

  // ------------------------------------------------------------------ the plane
  var GRIDS = { polar: 1, cartesian: 1, both: 1, none: 1 };
  var KEYS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1], Left: [-1, 0], Right: [1, 0], Up: [0, 1], Down: [0, -1] };

  function range(r, dflt) {
    if (!r || typeof r !== 'object' || !(r.length >= 2)) return dflt.slice();
    var a = +r[0], b = +r[1];
    if (!isFinite(a) || !isFinite(b)) return dflt.slice();
    if (a > b) { var t = a; a = b; b = t; }
    if (b - a < 1e-9) { a -= 1; b += 1; }
    return [a, b];
  }

  function plane(container, opts) {
    if (typeof container === 'string') { try { container = document.querySelector(container); } catch (e) { container = null; } }
    if (!container || typeof container.appendChild !== 'function') {
      report('plane(): container element not found');
      container = document.createElement('div');
    }
    injectStyle();
    var id = ++planeCount;
    var o = {
      xRange: [-4, 4], yRange: [-4, 4], width: null, height: null, maxHeight: 480, pad: 10,
      grid: 'polar', polarStep: { r: 1, thetaDeg: 30 }, gridStep: null, axes: true, axisLabels: ['x', 'y'],
      ticks: true, tickFormat: null, angleLabels: false, polarMax: null, ariaLabel: '', background: 'viz'
    };
    function applyOpts(src) {
      if (!src || typeof src !== 'object') return;
      if ('xRange' in src) o.xRange = range(src.xRange, o.xRange);
      if ('yRange' in src) o.yRange = range(src.yRange, o.yRange);
      if ('width' in src) o.width = posNum(src.width, null);
      if ('height' in src) o.height = posNum(src.height, null);
      if ('maxHeight' in src) o.maxHeight = posNum(src.maxHeight, 480);
      if ('pad' in src) o.pad = Math.max(0, num(src.pad, 10));
      if ('grid' in src) o.grid = hasOwn.call(GRIDS, src.grid) ? src.grid : (src.grid ? 'polar' : 'none');
      if ('polarStep' in src && src.polarStep && typeof src.polarStep === 'object') {
        var pr = posNum(src.polarStep.r, null);
        if (pr) { o.polarStep.r = pr; o.polarRSet = true; }
        o.polarStep = { r: o.polarStep.r, thetaDeg: clamp(posNum(src.polarStep.thetaDeg, o.polarStep.thetaDeg), 1, 180) };
      }
      if ('gridStep' in src) o.gridStep = posNum(src.gridStep, null);
      if ('axes' in src) o.axes = src.axes !== false;
      if ('axisLabels' in src) {
        var al = src.axisLabels;
        o.axisLabels = al && typeof al === 'object' && typeof al.length === 'number' ? [al[0], al[1]] : null;
      }
      if ('ticks' in src) o.ticks = typeof src.ticks === 'number' ? (src.ticks > 0 ? src.ticks : false) : src.ticks !== false;
      if ('tickFormat' in src) o.tickFormat = typeof src.tickFormat === 'function' ? src.tickFormat : null;
      if ('angleLabels' in src) o.angleLabels = src.angleLabels === 'rad' ? 'rad' : src.angleLabels ? 'deg' : false;
      if ('polarMax' in src) o.polarMax = posNum(src.polarMax, null);
      if ('ariaLabel' in src) o.ariaLabel = src.ariaLabel ? String(src.ariaLabel) : '';
      if ('background' in src) o.background = src.background;
    }
    applyOpts(opts || {});
    if (!o.ariaLabel) warn('plane(): ariaLabel is required (a text description of the figure)');

    // ---- DOM
    var wrap = H('div', 'cyl2d');
    wrap.setAttribute('data-cyl2d', String(id));
    // Default preserveAspectRatio (xMidYMid meet) + height:auto: the figure always scales UNIFORMLY, so at any
    // displayed width (print, mid-resize) circles stay circles and the %-positioned labels stay on their items.
    var svg = S('svg', { 'class': 'cyl2d-svg', role: 'img' }, wrap);
    var defs = S('defs', null, svg);
    var gGrid = S('g', { 'class': 'cyl2d-gridlines', 'aria-hidden': 'true' }, svg);
    var gAxes = S('g', { 'class': 'cyl2d-axes', 'aria-hidden': 'true' }, svg);
    var gContent = S('g', { 'class': 'cyl2d-content' }, svg);
    var gPoints = S('g', { 'class': 'cyl2d-points' }, svg);
    var overlay = H('div', 'cyl2d-overlay', wrap);
    overlay.setAttribute('aria-hidden', 'true');
    var layAxes = H('div', 'cyl2d-layer', overlay);
    var layUser = H('div', 'cyl2d-layer', overlay);
    container.appendChild(wrap);

    var markers = {};
    var items = [];
    var destroyed = false;
    var interactive = false;
    var L = { W: 480, H: 480, s: 1, cx: 0, cy: 0, vx0: -1, vx1: 1, vy0: -1, vy1: 1 };

    function applyChrome() {
      svg.setAttribute('aria-label', o.ariaLabel || 'Two-dimensional plot');
      svg.setAttribute('role', interactive ? 'group' : 'img');
      if (o.width) { wrap.style.maxWidth = o.width + 'px'; wrap.style.marginLeft = 'auto'; wrap.style.marginRight = 'auto'; }
      else { wrap.style.maxWidth = ''; wrap.style.marginLeft = ''; wrap.style.marginRight = ''; }
      var bg = o.background;
      wrap.style.background = bg === 'viz' || bg === undefined || bg === null || bg === true ? '' : (bg === false || bg === 'none' ? 'transparent' : paint(bg));
    }

    // ---- layout: equal scaling, requested ranges centered and fully visible
    function measure() { return wrap.clientWidth || 0; }
    function computeLayout() {
      var w = measure();
      if (!(w > 0)) w = L.measured ? L.W : (o.width || 480);
      else L.measured = true;
      if (o.width) w = Math.min(w, o.width);
      w = Math.max(80, Math.round(w));
      var xs = o.xRange[1] - o.xRange[0], ys = o.yRange[1] - o.yRange[0];
      var pad = Math.min(o.pad, w / 4);
      var s = (w - 2 * pad) / xs;
      var h = o.height ? o.height : Math.min(o.maxHeight, ys * s + 2 * pad);
      h = Math.max(60, Math.round(h));
      pad = Math.min(pad, h / 4);
      s = Math.min((w - 2 * pad) / xs, (h - 2 * pad) / ys);
      if (!(s > 0) || !isFinite(s)) s = 1;
      var cx = (o.xRange[0] + o.xRange[1]) / 2, cy = (o.yRange[0] + o.yRange[1]) / 2;
      L.W = w; L.H = h; L.s = s; L.cx = cx; L.cy = cy;
      L.vx0 = cx - w / 2 / s; L.vx1 = cx + w / 2 / s; L.vy0 = cy - h / 2 / s; L.vy1 = cy + h / 2 / s;
    }
    function toPx(p) { return [L.W / 2 + (p[0] - L.cx) * L.s, L.H / 2 - (p[1] - L.cy) * L.s]; }
    function fromPx(q) { return [L.cx + (q[0] - L.W / 2) / L.s, L.cy - (q[1] - L.H / 2) / L.s]; }
    function applySize() {
      svg.setAttribute('viewBox', '0 0 ' + L.W + ' ' + L.H);
      svg.setAttribute('width', String(L.W));
      svg.setAttribute('height', String(L.H));
      // The displayed height follows the displayed width through the aspect ratio (never a fixed px height),
      // so the figure scales uniformly until the next redraw, and the browser sees the true width→height
      // dependency when it decides about scrollbars.
      svg.style.width = '100%';
      svg.style.height = 'auto';
      svg.style.aspectRatio = L.W + ' / ' + L.H;
      wrap.style.setProperty('--cyl2d-w', L.W + 'px');   // used by the injected @media print rule
    }

    // ---- steps
    function span() { return Math.max(o.xRange[1] - o.xRange[0], o.yRange[1] - o.yRange[0]); }
    function autoStep() { return niceStep(span() / 10); }
    // Polar ring spacing in math units. An explicit polarStep.r is honoured; the default (1) is replaced by a
    // range-derived step when 1 does not suit the plotted range (e.g. a pipe wall in metres, or ±40).
    function ringStep() {
      if (o.polarRSet) return o.polarStep.r;
      var sp = span();
      return sp >= 2 && sp <= 16 ? 1 : niceStep(sp / 10);
    }
    // Tick base and keyboard step. For a polar grid this is the ring step unless that is coarse compared with
    // the range (fewer than ~4 steps across it), in which case it is derived from the range like a Cartesian grid.
    function baseStep() {
      if (o.gridStep) return o.gridStep;
      if (o.grid === 'polar') { var r = ringStep(); return r > span() / 4 ? autoStep() : r; }
      return autoStep();
    }
    function stepAtLeast(b, minPx) {
      for (var i = 0; i < MULTS.length; i++) if (b * MULTS[i] * L.s >= minPx) return b * MULTS[i];
      return b * MULTS[MULTS.length - 1];
    }
    function tickText(v, axis) {
      if (o.tickFormat) { var t = callUser(o.tickFormat, [v, axis], 'tickFormat'); return t === undefined || t === null ? '' : String(t); }
      return fmt(v, 4);
    }
    function textW(t) { return t.length * 6.9 + 2; }
    function tickStep() {
      if (typeof o.ticks === 'number') return Math.max(o.ticks, 1e-12 + 6 / L.s);
      var b = baseStep();
      for (var i = 0; i < MULTS.length; i++) {
        var st = b * MULTS[i];
        var maxLen = 0;
        [L.vx0, L.vx1, L.vy0, L.vy1, st].forEach(function (v) {
          var k = Math.round(v / st) * st;
          maxLen = Math.max(maxLen, textW(tickText(Math.round(k * 1e9) / 1e9, 'x')));
        });
        if (st * L.s >= Math.max(26, maxLen + 12)) return st;
      }
      return b * MULTS[MULTS.length - 1];
    }

    // ---- arrowhead markers: one per (color, size, direction); fill references the CSS variable,
    //      so markers follow the theme with no redraw.
    function marker(color, width, start) {
      var len = Math.round(arrowLen(width) * 2) / 2;
      var key = (start ? 's' : 'e') + String(len).replace('.', 'p') + '_' + String(color).replace(/[^A-Za-z0-9]/g, '_');
      if (!markers[key]) {
        var mid = 'cyl2d-' + id + '-' + key;
        var m = S('marker', { id: mid, viewBox: '0 0 10 10', markerWidth: len, markerHeight: len, markerUnits: 'userSpaceOnUse',
          orient: 'auto', refX: start ? 7.4 : 2.6, refY: 5 }, defs);
        var p = S('path', { d: start ? 'M10 0.8L0 5L10 9.2L7.4 5Z' : 'M0 0.8L10 5L0 9.2L2.6 5Z' }, m);
        p.style.fill = color;
        p.style.stroke = 'none';
        markers[key] = 'url(#' + mid + ')';
      }
      return markers[key];
    }
    // Stroke px points into `path`, stopping short under the arrowheads.
    function strokeRun(path, pts, color, width, arrow) {
      var fl = arrowFlags(arrow);
      var sh = ARROW_BACK * arrowLen(width);
      var total = polyLen(pts);
      var e = fl.e && total > sh * 1.5;
      var s = fl.s && total > sh * (e ? 3 : 1.5);
      if (e) pts = trimEnd(pts, sh);
      if (s) pts = trimStart(pts, sh);
      path.setAttribute('d', runsD([pts]));
      if (e) path.setAttribute('marker-end', marker(color, width, false)); else path.removeAttribute('marker-end');
      if (s) path.setAttribute('marker-start', marker(color, width, true)); else path.removeAttribute('marker-start');
    }
    function styleStroke(el, color, width, dashed, opacity) {
      el.style.stroke = color;
      el.setAttribute('stroke-width', String(width));
      el.setAttribute('stroke-linejoin', 'round');
      if (dashed) { el.setAttribute('stroke-dasharray', dashArray(dashed, width)); el.setAttribute('stroke-linecap', 'butt'); }
      else { el.removeAttribute('stroke-dasharray'); el.setAttribute('stroke-linecap', 'round'); }
      var op = num(opacity, 1);
      if (op < 1) el.setAttribute('opacity', String(clamp(op, 0, 1))); else el.removeAttribute('opacity');
    }
    function styleFill(el, fill, strokeColor, fillOpacity, dflt) {
      if (fill === undefined || fill === null || fill === false || fill === 'none') { el.style.fill = 'none'; el.removeAttribute('fill-opacity'); return; }
      el.style.fill = fill === true ? strokeColor : paint(fill);
      el.setAttribute('fill-opacity', String(clamp(num(fillOpacity, dflt), 0, 1)));
    }

    // ---- grid
    function drawGrid() {
      empty(gGrid);
      var g = o.grid;
      if (g === 'none') return;
      var W = L.W, Hh = L.H, s = L.s, k, k0, k1, d;
      if (g === 'cartesian' || g === 'both') {
        var st = stepAtLeast(baseStep(), 9);
        d = '';
        k0 = Math.ceil(L.vx0 / st - 1e-9); k1 = Math.floor(L.vx1 / st + 1e-9);
        if (k1 - k0 < 800) for (k = k0; k <= k1; k++) d += 'M' + (Math.round(toPx([k * st, 0])[0] - 0.5) + 0.5) + ' 0V' + Hh;
        k0 = Math.ceil(L.vy0 / st - 1e-9); k1 = Math.floor(L.vy1 / st + 1e-9);
        if (k1 - k0 < 800) for (k = k0; k <= k1; k++) d += 'M0 ' + (Math.round(toPx([0, k * st])[1] - 0.5) + 0.5) + 'H' + W;
        var pc = S('path', { d: d, fill: 'none', 'stroke-width': 1, 'shape-rendering': 'crispEdges', 'class': 'cyl2d-grid-cart' }, gGrid);
        pc.style.stroke = paint('grid');
        if (g === 'both') pc.setAttribute('stroke-dasharray', '3 3');
      }
      if (g === 'polar' || g === 'both') {
        var O = toPx([0, 0]);
        var far = 0;
        [[0, 0], [W, 0], [0, Hh], [W, Hh]].forEach(function (c) { far = Math.max(far, Math.hypot(c[0] - O[0], c[1] - O[1])); });
        var near = Math.hypot(Math.max(0, -O[0], O[0] - W), Math.max(0, -O[1], O[1] - Hh));
        if (near > 20000) return;
        var lim = o.polarMax ? Math.min(far, o.polarMax * s) : far;
        // Rings at multiples of the ring step, thinned (×2, ×5, ×10 …) so they are never closer than 12 px:
        // denser rings read as a grey moiré rather than a grid.
        var rs = stepAtLeast(ringStep(), 12) * s;
        d = '';
        if (rs >= 3) {
          k0 = Math.max(1, Math.ceil(near / rs - 1e-9)); k1 = Math.floor(lim / rs + 1e-6);
          if (k1 - k0 > 400) k0 = k1 - 400;
          for (k = k0; k <= k1; k++) {
            var R = rd(k * rs), oy = rd(O[1]);
            d += 'M' + rd(O[0] + k * rs) + ' ' + oy + 'A' + R + ' ' + R + ' 0 1 0 ' + rd(O[0] - k * rs) + ' ' + oy +
              'A' + R + ' ' + R + ' 0 1 0 ' + rd(O[0] + k * rs) + ' ' + oy;
          }
        }
        var td = o.polarStep.thetaDeg;
        for (var a = 0; a < 360 - 1e-9; a += td) {
          var ar = a * DEG;
          d += 'M' + rd(O[0]) + ' ' + rd(O[1]) + 'L' + rd(O[0] + lim * Math.cos(ar)) + ' ' + rd(O[1] - lim * Math.sin(ar));
        }
        var pp = S('path', { d: d, fill: 'none', 'stroke-width': 1, 'class': 'cyl2d-grid-polar' }, gGrid);
        pp.style.stroke = paint('grid');
      }
    }

    // ---- axes, ticks, axis labels, angle labels
    // Everything here is laid out with MEASURED boxes so nothing overlaps: every label and tick text is created
    // first, all are measured in one layout pass, then placed. Priority: axis labels > angle labels > x ticks >
    // y ticks. An axis label is nudged away from its axis to clear a tick label when there is room; otherwise
    // the tick label is dropped (its tick mark stays). Unmeasurable (hidden) planes fall back to estimates and
    // are measured properly by the redraw that runs when they become visible.
    function hasText(v) { return v !== undefined && v !== null && v !== ''; }
    function chromeLabel(cls, text) {
      var lb = { el: H('div', 'cyl2d-label ' + cls, layAxes) };
      setLabelContent(lb, text, true);
      return lb;
    }
    function measureLabel(lb, estW, estH) {
      var w = lb.el.offsetWidth, h = lb.el.offsetHeight;
      return w > 0 && h > 0 ? [w, h] : [estW, estH];
    }
    function measureTick(tk) {
      var b = null;
      try { b = tk.el.getBBox(); } catch (e) { b = null; }   // Firefox throws for non-rendered elements
      if (b && b.width > 0 && b.height > 0) { tk.w = b.width; tk.a = b.y; tk.d = b.y + b.height; }
      else { tk.w = textW(tk.t); tk.a = -11; tk.d = 3; }
    }
    // Angle-label candidates around a polar grid (where each ray leaves the plot, or just outside polarMax).
    function angleCandidates(O) {
      var W = L.W, Hh = L.H, s = L.s;
      var out = [];
      if (!o.angleLabels || (o.grid !== 'polar' && o.grid !== 'both')) return out;
      var ix0 = 20, ix1 = W - 20, iy0 = 13, iy1 = Hh - 13;
      if (!(O[0] >= ix0 && O[0] <= ix1 && O[1] >= iy0 && O[1] <= iy1)) return out;
      var skipAxisDirs = o.axes && o.axisLabels;
      for (var a = 0; a < 360 - 1e-9; a += o.polarStep.thetaDeg) {
        var aa = Math.round(a * 1e6) / 1e6;
        if (skipAxisDirs && ((aa === 0 && hasText(o.axisLabels[0])) || (aa === 90 && hasText(o.axisLabels[1])))) continue;
        var dx = Math.cos(aa * DEG), dy = -Math.sin(aa * DEG), R;
        if (o.polarMax) {
          R = o.polarMax * s + 14;
        } else {
          R = Infinity;
          if (dx > 1e-9) R = Math.min(R, (ix1 - O[0]) / dx); else if (dx < -1e-9) R = Math.min(R, (ix0 - O[0]) / dx);
          if (dy > 1e-9) R = Math.min(R, (iy1 - O[1]) / dy); else if (dy < -1e-9) R = Math.min(R, (iy0 - O[1]) / dy);
        }
        var lx = O[0] + R * dx, ly = O[1] + R * dy;
        if (!(R > 24) || lx < ix0 - 0.5 || lx > ix1 + 0.5 || ly < iy0 - 0.5 || ly > iy1 + 0.5) continue;
        var tex = o.angleLabels === 'rad' ? angleTexRad(aa) : fmt(aa, 6) + '^\\circ';
        var plainLen = tex.replace(/\\pi/g, 'p').replace(/\^\\circ/g, 'o').length;
        out.push({ x: lx, y: ly, tex: tex, estW: plainLen * 6.6 + 10, estH: 18 });
      }
      return out;
    }
    function drawAxes() {
      empty(gAxes);
      empty(layAxes);
      var W = L.W, Hh = L.H;
      var O = toPx([0, 0]);
      var ay = Math.round(clamp(O[1], 1, Hh - 1) - 0.5) + 0.5;   // pixel row of the x-axis
      var ax = Math.round(clamp(O[0], 1, W - 1) - 0.5) + 0.5;    // pixel column of the y-axis
      var axisColor = paint('axis');
      var i, k, k0, k1, v, q, t, tk, xa = null, ya = null;

      // Phase 1 — DOM writes: axis lines, then every label / tick text (unplaced).
      if (o.axes) {
        xa = S('path', { fill: 'none', 'class': 'cyl2d-axis' }, gAxes);
        styleStroke(xa, axisColor, 1.5, false, 1);
        strokeRun(xa, [[0, ay], [W - 1, ay]], axisColor, 1.5, 'end');
        ya = S('path', { fill: 'none', 'class': 'cyl2d-axis' }, gAxes);
        styleStroke(ya, axisColor, 1.5, false, 1);
        strokeRun(ya, [[ax, Hh], [ax, 1]], axisColor, 1.5, 'end');
      }
      var XL = null, YL = null;
      if (o.axes && o.axisLabels) {
        if (hasText(o.axisLabels[0])) XL = { lb: chromeLabel('axis', o.axisLabels[0]), est: [texToText(o.axisLabels[0]).length * 9 + 4, 20] };
        if (hasText(o.axisLabels[1])) YL = { lb: chromeLabel('axis', o.axisLabels[1]), est: [texToText(o.axisLabels[1]).length * 9 + 4, 20] };
      }
      var angles = angleCandidates(O);
      for (i = 0; i < angles.length; i++) angles[i].lb = chromeLabel('small bg', angles[i].tex);
      var xt = [], yt = [], marks = '', tg = null;
      if (o.axes && o.ticks) {
        tg = S('g', { 'class': 'cyl2d-ticks' }, gAxes);
        var st = tickStep();
        k0 = Math.ceil(L.vx0 / st - 1e-9); k1 = Math.floor(L.vx1 / st + 1e-9);
        if (k1 - k0 < 400) for (k = k0; k <= k1; k++) {
          v = Math.round(k * st * 1e9) / 1e9;
          q = toPx([v, 0])[0];
          if (q < 4 || q > W - 16 || Math.abs(q - ax) < 4) continue;
          marks += 'M' + rd(q) + ' ' + (ay - 3) + 'V' + (ay + 3);
          t = tickText(v, 'x');
          if (t) xt.push({ q: q, t: t, el: S('text', { x: 0, y: 0, 'class': 'cyl2d-tick' }, tg) });
        }
        k0 = Math.ceil(L.vy0 / st - 1e-9); k1 = Math.floor(L.vy1 / st + 1e-9);
        if (k1 - k0 < 400) for (k = k0; k <= k1; k++) {
          v = Math.round(k * st * 1e9) / 1e9;
          q = toPx([0, v])[1];
          if (q > Hh - 4 || q < 16 || Math.abs(q - ay) < 4) continue;
          marks += 'M' + (ax - 3) + ' ' + rd(q) + 'H' + (ax + 3);
          t = tickText(v, 'y');
          if (t && q >= 8 && q <= Hh - 6) yt.push({ q: q, t: t, el: S('text', { x: 0, y: 0, 'class': 'cyl2d-tick' }, tg) });
        }
        xt.concat(yt).forEach(function (x) { x.el.textContent = x.t; });
      }

      // Phase 2 — reads: one layout pass for all sizes.
      if (XL) XL.size = measureLabel(XL.lb, XL.est[0], XL.est[1]);
      if (YL) YL.size = measureLabel(YL.lb, YL.est[0], YL.est[1]);
      for (i = 0; i < angles.length; i++) angles[i].size = measureLabel(angles[i].lb, angles[i].estW, angles[i].estH);
      xt.forEach(measureTick);
      yt.forEach(measureTick);

      // Phase 3 — decide and place.
      // Axis labels: 'x' at the arrow end of the x-axis (above it when there is room), 'y' beside the top of the
      // y-axis (right of it when there is room). If they collide (origin at the top right), 'y' moves below 'x'.
      function setAxisLabel(A, px, py, anchor) {
        A.px = px; A.py = py; A.anchor = anchor;
        A.box = labelBox(px, py, anchor, 0, A.size[0], A.size[1]);
      }
      if (XL) {
        if (ay - 4 - XL.size[1] >= 0) setAxisLabel(XL, W - 8, ay - 4, 'nw');
        else setAxisLabel(XL, W - 8, ay + 5, 'sw');
      }
      if (YL) {
        if (ax + 7 + YL.size[0] <= W - 1) setAxisLabel(YL, ax + 7, 3, 'se');
        else setAxisLabel(YL, ax - 7, 3, 'sw');
        if (XL && boxHit(YL.box, [XL.box], 2)) setAxisLabel(YL, YL.px, XL.box[3] + 3, YL.anchor);
      }
      var axisBoxes = function () { return [XL ? XL.box : null, YL ? YL.box : null]; };
      // Angle labels: centred on their ray's end, pulled inside the plot, dropped when they would touch an axis
      // label or an already kept angle label (measured widths, so long radian labels do not collide).
      var angleBoxes = [];
      var xStart = 0, yStart = Hh;
      for (i = 0; i < angles.length; i++) {
        var al = angles[i], aw = al.size[0], ah = al.size[1];
        var cx = clamp(al.x, aw / 2 + 2, W - aw / 2 - 2), cy = clamp(al.y, ah / 2 + 2, Hh - ah / 2 - 2);
        var ab = [cx - aw / 2, cy - ah / 2, cx + aw / 2, cy + ah / 2];
        if (boxHit(ab, angleBoxes, 3) || boxHit(ab, axisBoxes(), 2)) { detach(al.lb.el); continue; }
        angleBoxes.push(ab);
        placeLabel(al.lb, cx, cy, 'c', null, 0, W, Hh);
        // A label sitting on the tail of an axis at the plot edge (180° at the left, 270° at the bottom):
        // start the axis under the label, or the few px of axis left of / below it read as a minus sign.
        if (ab[1] <= ay && ab[3] >= ay && ab[0] < 14) xStart = Math.max(xStart, cx);
        if (ab[0] <= ax && ab[2] >= ax && ab[3] > Hh - 14) yStart = Math.min(yStart, cy);
      }
      if (xa && xStart > 0) strokeRun(xa, [[xStart, ay], [W - 1, ay]], axisColor, 1.5, 'end');
      if (ya && yStart < Hh) strokeRun(ya, [[ax, yStart], [ax, 1]], axisColor, 1.5, 'end');
      // Tick label boxes (not yet checked against the axis labels).
      var below = ay + 20 <= Hh;
      for (i = 0; i < xt.length; i++) {
        tk = xt[i];
        tk.x = tk.q; tk.y = below ? ay + 16 : ay - 7; tk.anchor = 'middle';
        tk.box = [tk.q - tk.w / 2, tk.y + tk.a, tk.q + tk.w / 2, tk.y + tk.d];
        tk.ok = tk.box[0] >= 1 && tk.box[2] <= W - 1 && tk.box[1] >= 0 && tk.box[3] <= Hh && !boxHit(tk.box, angleBoxes, 1);
      }
      var xBoxes = xt.filter(function (x) { return x.ok; }).map(function (x) { return x.box; });
      for (i = 0; i < yt.length; i++) {
        tk = yt[i];
        var left = ax - 7 - tk.w >= 1;
        tk.ok = left || ax + 7 + tk.w <= W - 1;
        tk.x = left ? ax - 7 : ax + 7; tk.y = tk.q + 4; tk.anchor = left ? 'end' : 'start';
        // Near the top/bottom edge, pull the text inside by up to 4 px (else it is dropped).
        var over = tk.y + tk.d - (Hh - 1), under = 1 - (tk.y + tk.a);
        if (over > 0) tk.y -= over; else if (under > 0) tk.y += under;
        if (over > 4 || under > 4) tk.ok = false;
        var x0 = left ? ax - 7 - tk.w : ax + 7;
        tk.box = [x0, tk.y + tk.a, x0 + tk.w, tk.y + tk.d];
        if (tk.ok) tk.ok = !boxHit(tk.box, angleBoxes, 1) && !boxHit(tk.box, xBoxes, 2);
      }
      // Nudge an axis label away from its axis past the tick labels it collides with, if it still fits and
      // touches nothing else; any tick label still under an axis label is then dropped.
      function okBoxes(list) { return list.filter(function (x) { return x.ok; }).map(function (x) { return x.box; }); }
      function nudge(A, ticks, others) {
        if (!A) return;
        var hit = ticks.filter(function (x) { return x.ok && boxHit(x.box, [A.box], 2); });
        if (!hit.length) return;
        var px = A.px, py = A.py;
        if (A === YL) {
          if (A.anchor === 'se') px = Math.max.apply(null, hit.map(function (x) { return x.box[2]; })) + 5;
          else px = Math.min.apply(null, hit.map(function (x) { return x.box[0]; })) - 5;
        } else {
          if (A.anchor === 'nw') py = Math.min.apply(null, hit.map(function (x) { return x.box[1]; })) - 3;
          else py = Math.max.apply(null, hit.map(function (x) { return x.box[3]; })) + 3;
        }
        var nb = labelBox(px, py, A.anchor, 0, A.size[0], A.size[1]);
        if (nb[0] < 1 || nb[1] < 1 || nb[2] > W - 1 || nb[3] > Hh - 1) return;
        if (boxHit(nb, others, 2) || boxHit(nb, angleBoxes, 2) || boxHit(nb, okBoxes(xt.concat(yt)), 2)) return;
        setAxisLabel(A, px, py, A.anchor);
      }
      nudge(YL, yt, [XL ? XL.box : null]);
      nudge(XL, xt, [YL ? YL.box : null]);
      if (XL) placeLabel(XL.lb, XL.px, XL.py, XL.anchor, null, 0, W, Hh);
      if (YL) placeLabel(YL.lb, YL.px, YL.py, YL.anchor, null, 0, W, Hh);
      if (tg) {
        var tf = paint('muted'), halo = paint('viz');
        xt.concat(yt).forEach(function (x) {
          if (!x.ok || boxHit(x.box, axisBoxes(), 2)) { detach(x.el); return; }
          x.el.setAttribute('x', String(rd(x.x)));
          x.el.setAttribute('y', String(rd(x.y)));
          x.el.setAttribute('text-anchor', x.anchor);
          x.el.style.fill = tf; x.el.style.stroke = halo; x.el.setAttribute('stroke-width', '3');
        });
        var tm = S('path', { d: marks, fill: 'none', 'stroke-width': 1, 'class': 'cyl2d-tickmarks' }, gAxes);
        tm.style.stroke = axisColor;
      }
    }

    // ---- items
    function applyVis(it) {
      var show = it.visible && it.ok && !it.removed;
      for (var i = 0; i < it.nodes.length; i++) {
        var n = it.nodes[i];
        var d = show && !n._cyl2dOff ? '' : 'none';
        if (n.style.display !== d) n.style.display = d;
      }
    }
    function renderItem(it) {
      if (it.removed) return;
      try { it.render(); } catch (e) { it.ok = false; report(it.kind + ' render failed: ' + (e && e.message ? e.message : e)); }
      applyVis(it);
    }
    function addItem(it, grp) {
      it.group = grp || null;
      it.visible = true;
      it.ok = true;
      items.push(it);
      if (grp) grp.items.push(it);
      var h = it.handle;
      h.kind = it.kind;
      h.setVisible = function (v) { it.visible = v !== false; applyVis(it); return h; };
      h.remove = function () { removeItem(it); };
      h.setColor = function (c) { it.st.color = c; renderItem(it); return h; };
      renderItem(it);
      return h;
    }
    function removeItem(it) {
      if (!it || it.removed) return;
      it.removed = true;
      if (it.cleanup) { try { it.cleanup(); } catch (e) { /* ignore */ } }
      it.nodes.forEach(detach);
      var i = items.indexOf(it);
      if (i >= 0) items.splice(i, 1);
      if (it.group) { i = it.group.items.indexOf(it); if (i >= 0) it.group.items.splice(i, 1); }
    }
    function contentParent(grp) { return grp ? grp.content : gContent; }
    function pointParent(grp) { return grp ? grp.points : gPoints; }
    function labelParent(grp) { return grp ? grp.labels : layUser; }
    // Flip a point label to the other side when it would run off the plot (e.g. a point dragged into a corner).
    function fitAnchor(lb, anchor, q, gap) {
      var a = anchorKey(anchor);
      if (a === 'c') return a;
      if (!lb.w || lb.wText !== lb.text) { lb.w = lb.el.offsetWidth; lb.h = lb.el.offsetHeight; lb.wText = lb.text; }
      var w = lb.w, hh = lb.h;
      if (!w || !hh) return a;
      var v = a.indexOf('n') >= 0 ? 'n' : a.indexOf('s') >= 0 ? 's' : '';
      var hz = a.indexOf('e') >= 0 ? 'e' : a.indexOf('w') >= 0 ? 'w' : '';
      var d = gap * (v && hz ? 0.7071 : 1);
      if (hz === 'e' && q[0] + d + w > L.W) hz = 'w';
      else if (hz === 'w' && q[0] - d - w < 0) hz = 'e';
      if (v === 'n' && q[1] - d - hh < 0) v = 's';
      else if (v === 's' && q[1] + d + hh > L.H) v = 'n';
      return (v + hz) || a;
    }
    function newLabel(grp, cls, bg) {
      return { el: H('div', 'cyl2d-label' + (cls ? ' ' + String(cls) : '') + (bg ? ' bg' : ''), labelParent(grp)) };
    }
    function merge(st, obj, keys) {
      if (!obj || typeof obj !== 'object') return;
      for (var i = 0; i < keys.length; i++) if (hasOwn.call(obj, keys[i])) st[keys[i]] = obj[keys[i]];
    }
    function toPts(points) {
      var out = [];
      if (points && typeof points === 'object' && typeof points.length === 'number') {
        for (var i = 0; i < points.length; i++) { var q = toPt(points[i]); out.push(q || [NaN, NaN]); }
      }
      return out;
    }
    // Split px points into runs at non-finite entries.
    function pxRuns(pts) {
      var runs = [], cur = null;
      for (var i = 0; i < pts.length; i++) {
        if (!okPt(pts[i])) { cur = null; continue; }
        if (!cur) { cur = []; runs.push(cur); }
        cur.push(toPx(pts[i]));
      }
      return runs;
    }

    // point ----------------------------------------------------------------
    function pointImpl(grp, pos, op) {
      op = op && typeof op === 'object' ? op : {};
      var drag = !!op.draggable;
      var st = { pos: toPt(pos) || [NaN, NaN], color: op.color, r: clamp(posNum(op.r, 5), 0.5, 60), label: op.label, hollow: !!op.hollow };
      var g = S('g', { 'class': 'cyl2d-point' + (drag ? ' is-draggable draggable' : '') }, pointParent(grp));
      var hit = drag ? S('circle', { 'class': 'cyl2d-hit', cx: 0, cy: 0 }, g) : null;
      var ring = drag ? S('circle', { 'class': 'cyl2d-ring', cx: 0, cy: 0, 'stroke-width': 2.5 }, g) : null;
      var dot = S('circle', { 'class': 'cyl2d-dot', cx: 0, cy: 0 }, g);
      if (hit) { hit.style.fill = 'none'; hit.style.stroke = 'none'; hit.style.pointerEvents = 'all'; }
      if (ring) { ring.style.fill = 'none'; ring.style.stroke = paint('accent'); }
      var lab = null;
      var h = { el: g };
      var it = { kind: 'point', st: st, nodes: [g], handle: h };
      var lastDesc = null;
      function ensureLabel() {
        if (!lab && st.label !== undefined && st.label !== null && st.label !== '') {
          lab = newLabel(grp, op.labelClass, op.labelBackground);
          it.nodes.push(lab.el);
        }
      }
      ensureLabel();
      function describe(p) {
        if (typeof op.ariaFormat === 'function') {
          var t = callUser(op.ariaFormat, [p.slice()], 'point ariaFormat');
          if (t !== undefined && t !== null) return String(t);
        }
        var rr = Math.hypot(p[0], p[1]);
        var s = 'x = ' + fmt(p[0], 3) + ', y = ' + fmt(p[1], 3) + '; r = ' + fmt(rr, 3);
        if (rr > 1e-9) { var th = Math.atan2(p[1], p[0]); if (th < 0) th += TAU; s += ', θ = ' + fmt(th / DEG, 3) + '°'; }
        return s;
      }
      function updateAria() {
        var p = st.pos;
        var name = op.ariaLabel ? String(op.ariaLabel) : (st.label ? 'Point ' + texToText(st.label) : 'Point');
        var desc = okPt(p) ? describe(p) : 'not placed';
        var full = name + ' at ' + desc;
        if (full === lastDesc) return;   // compare name + description, so setLabel() updates the name too
        lastDesc = full;
        g.setAttribute('aria-valuetext', desc);
        g.setAttribute('aria-label', full);
        if (okPt(p)) g.setAttribute('aria-valuenow', String(Math.round(p[0] * 1000) / 1000));
      }
      it.render = function () {
        var p = st.pos;
        it.ok = okPt(p);
        var c = paint(st.color, 'point');
        if (st.hollow) { dot.style.fill = paint('viz'); dot.style.stroke = c; dot.setAttribute('stroke-width', '2'); }
        else { dot.style.fill = c; dot.style.stroke = paint('viz'); dot.setAttribute('stroke-width', '1.5'); }
        dot.setAttribute('r', String(st.r));
        if (hit) hit.setAttribute('r', String(Math.max(st.r + 10, COARSE ? 22 : 16)));
        if (ring) ring.setAttribute('r', String(st.r + 4.5));
        if (drag) updateAria();
        if (!it.ok) return;
        var q = toPx(p);
        g.setAttribute('transform', 'translate(' + rd(q[0]) + ' ' + rd(q[1]) + ')');
        if (lab) {
          var has = st.label !== undefined && st.label !== null && st.label !== '';
          lab.el._cyl2dOff = !has;
          if (has) {
            lab.el.style.color = paint(op.labelColor, 'ink');
            setLabelContent(lab, st.label, op.labelTex !== false);
            placeLabel(lab, q[0], q[1], fitAnchor(lab, op.labelAnchor || 'ne', q, st.r + 3), op.labelOffset, st.r + 3, L.W, L.H);
          }
        }
      };
      h.set = function (p) { st.pos = toPt(p) || [NaN, NaN]; renderItem(it); return h; };
      h.get = function () { return st.pos.slice(); };
      h.setLabel = function (tex) { st.label = tex; ensureLabel(); renderItem(it); return h; };
      h.focus = function () { try { g.focus({ preventScroll: true }); } catch (e) { try { g.focus(); } catch (e2) { /* ignore */ } } };

      if (drag) {
        interactive = true;
        applyChrome();
        g.setAttribute('tabindex', '0');
        g.setAttribute('role', 'slider');
        g.setAttribute('aria-roledescription', 'draggable point');
        g.setAttribute('data-draggable', '');
        g.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown ArrowLeft ArrowRight');
        var active = null;
        var boundsOf = function () {
          if (op.bounds === false) return null;
          var b = op.bounds;
          if (b && typeof b === 'object' && b.length >= 2) return [range(b[0], o.xRange), range(b[1], o.yRange)];
          return [o.xRange, o.yRange];
        };
        var clampB = function (q) {
          var b = boundsOf();
          return b ? [clamp(q[0], b[0][0], b[0][1]), clamp(q[1], b[1][0], b[1][1])] : q;
        };
        var snapOf = function (q) {
          var sn = op.snap, r = null;
          if (!sn) return q;
          if (typeof sn === 'function') r = toPt(callUser(sn, [q.slice()], 'point snap'));
          else if (sn === 'grid') r = (o.grid === 'polar' ? snapPolar(ringStep(), o.polarStep.thetaDeg * DEG) : snapGrid(baseStep()))(q);
          else if (typeof sn === 'number' || typeof sn === 'object') r = snapGrid(sn)(q);
          return okPt(r) ? r : q;
        };
        var resolve = function (q) { return clampB(snapOf(clampB(q))); };
        var commit = function (q, source) {
          if (!okPt(q)) return false;
          if (okPt(st.pos) && Math.abs(q[0] - st.pos[0]) < 1e-12 && Math.abs(q[1] - st.pos[1]) < 1e-12) return false;
          st.pos = [q[0], q[1]];
          renderItem(it);
          if (typeof op.onDrag === 'function') callUser(op.onDrag, [st.pos.slice(), { source: source }], 'point onDrag');
          return true;
        };
        var eventToMath = function (e) {
          var rc = svg.getBoundingClientRect();
          var kx = rc.width ? L.W / rc.width : 1, ky = rc.height ? L.H / rc.height : 1;
          return fromPx([(e.clientX - rc.left) * kx, (e.clientY - rc.top) * ky]);
        };
        var onMove = function (e) {
          if (!active || e.pointerId !== active.id) return;
          if (e.cancelable) e.preventDefault();
          var m = eventToMath(e);
          if (!okPt(m)) return;
          commit(resolve([m[0] + active.dx, m[1] + active.dy]), 'pointer');
        };
        var endDrag = function (e) {
          if (!active || (e && e.pointerId !== undefined && e.pointerId !== active.id)) return;
          var pid = active.id;
          active = null;
          global.removeEventListener('pointermove', onMove, true);
          global.removeEventListener('pointerup', endDrag, true);
          global.removeEventListener('pointercancel', endDrag, true);
          try { if (g.hasPointerCapture && g.hasPointerCapture(pid)) g.releasePointerCapture(pid); } catch (err) { /* ignore */ }
          g.classList.remove('is-dragging');
          wrap.classList.remove('is-dragging');
          if (typeof op.onDragEnd === 'function') callUser(op.onDragEnd, [st.pos.slice()], 'point onDragEnd');
        };
        g.addEventListener('pointerdown', function (e) {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          if (!okPt(st.pos) || active) return;
          if (e.cancelable) e.preventDefault();
          h.focus();
          var m = eventToMath(e);
          active = { id: e.pointerId, dx: okPt(m) ? st.pos[0] - m[0] : 0, dy: okPt(m) ? st.pos[1] - m[1] : 0 };
          try { g.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or already released pointer */ }
          g.classList.add('is-dragging');
          wrap.classList.add('is-dragging');
          global.addEventListener('pointermove', onMove, true);
          global.addEventListener('pointerup', endDrag, true);
          global.addEventListener('pointercancel', endDrag, true);
          if (typeof op.onDragStart === 'function') callUser(op.onDragStart, [st.pos.slice()], 'point onDragStart');
        });
        // iOS Safari may ignore touch-action on SVG children: stop the page scrolling when a touch starts ON the point.
        g.addEventListener('touchstart', function (e) { if (e.cancelable) e.preventDefault(); }, { passive: false });
        g.addEventListener('keydown', function (e) {
          var d = KEYS[e.key];
          if (!d || e.altKey || e.ctrlKey || e.metaKey) return;
          e.preventDefault();
          if (!okPt(st.pos)) return;
          var fine = !!e.shiftKey;
          if (typeof op.keyMove === 'function') {
            var r = toPt(callUser(op.keyMove, [st.pos.slice(), d.slice(), fine], 'point keyMove'));
            if (okPt(r)) commit(clampB(r), 'key');
            return;
          }
          var step = posNum(op.keyStep, baseStep());
          if (fine) step = posNum(op.keyStepFine, step / 10);
          var start = st.pos, prevC = null;
          // Step once; if snapping puts us back where we started, keep stepping (up to 60 steps).
          for (var k = 1; k <= 60; k++) {
            var c = clampB([start[0] + d[0] * step * k, start[1] + d[1] * step * k]);
            if (prevC && Math.abs(c[0] - prevC[0]) < 1e-12 && Math.abs(c[1] - prevC[1]) < 1e-12) break;   // at the boundary
            prevC = c;
            var q = resolve(c);
            if (Math.abs(q[0] - start[0]) > 1e-9 || Math.abs(q[1] - start[1]) > 1e-9) { commit(q, 'key'); break; }
          }
        });
        it.cleanup = function () { if (active) endDrag(); };
      }
      return addItem(it, grp);
    }

    // line -----------------------------------------------------------------
    function lineImpl(grp, a, b, op) {
      op = op && typeof op === 'object' ? op : {};
      var st = { a: toPt(a), b: toPt(b), color: op.color, width: posNum(op.width, 2), dashed: op.dashed, arrow: op.arrow,
        opacity: op.opacity, label: op.label };
      var path = S('path', { 'class': 'cyl2d-line', fill: 'none' }, contentParent(grp));
      path.style.fill = 'none';
      var h = { el: path };
      var it = { kind: 'line', st: st, nodes: [path], handle: h };
      var lab = null;
      function ensureLabel() {
        if (!lab && st.label !== undefined && st.label !== null && st.label !== '') { lab = newLabel(grp, op.labelClass, op.labelBackground); it.nodes.push(lab.el); }
      }
      ensureLabel();
      it.render = function () {
        var ok = okPt(st.a) && okPt(st.b), A, B;
        if (ok) { A = toPx(st.a); B = toPx(st.b); ok = Math.hypot(B[0] - A[0], B[1] - A[1]) > 0.05; }
        it.ok = ok;
        if (!ok) return;
        var c = paint(st.color, 'ink');
        styleStroke(path, c, st.width, st.dashed, st.opacity);
        strokeRun(path, [A, B], c, st.width, st.arrow);
        if (lab) {
          var has = st.label !== undefined && st.label !== null && st.label !== '';
          lab.el._cyl2dOff = !has;
          if (has) {
            var t = clamp(num(op.labelAt, 0.5), 0, 1);
            var mx = A[0] + (B[0] - A[0]) * t, my = A[1] + (B[1] - A[1]) * t;
            var len = Math.hypot(B[0] - A[0], B[1] - A[1]);
            var ux = (B[0] - A[0]) / len, uy = (B[1] - A[1]) / len;
            var side = op.labelSide === 'left' ? -1 : 1;       // right of the direction a -> b (screen)
            var nx = -uy * side, ny = ux * side;
            lab.el.style.color = paint(op.labelColor !== undefined ? op.labelColor : st.color, 'ink');
            setLabelContent(lab, st.label, op.labelTex !== false);
            placeLabel(lab, mx, my, dirAnchor(nx, ny), op.labelOffset, num(op.labelGap, 7) + st.width / 2, L.W, L.H);
          }
        }
      };
      h.set = function (na, nb) {
        st.a = toPt(na);
        if (arguments.length > 1) st.b = toPt(nb);
        renderItem(it);
        return h;
      };
      h.get = function () { return [st.a ? st.a.slice() : null, st.b ? st.b.slice() : null]; };
      h.setLabel = function (tex) { st.label = tex; ensureLabel(); renderItem(it); return h; };
      return addItem(it, grp);
    }

    // polyline -------------------------------------------------------------
    function polylineImpl(grp, points, op) {
      op = op && typeof op === 'object' ? op : {};
      var st = { pts: toPts(points), color: op.color, width: posNum(op.width, 2), closed: !!op.closed, fill: op.fill,
        fillOpacity: op.fillOpacity, dashed: op.dashed, arrow: op.arrow, opacity: op.opacity };
      var path = S('path', { 'class': 'cyl2d-polyline', 'fill-rule': 'evenodd' }, contentParent(grp));
      var h = { el: path };
      var it = { kind: 'polyline', st: st, nodes: [path], handle: h };
      it.render = function () {
        var runs = pxRuns(st.pts);
        var c = paint(st.color, 'ink');
        styleStroke(path, c, st.width, st.dashed, st.opacity);
        styleFill(path, st.fill, c, st.fillOpacity, 0.15);
        if (runs.length === 1 && !st.closed && st.arrow) strokeRun(path, runs[0], c, st.width, st.arrow);
        else { path.setAttribute('d', runsD(runs, st.closed)); path.removeAttribute('marker-end'); path.removeAttribute('marker-start'); }
        it.ok = !!path.getAttribute('d');
      };
      h.set = function (pts) { st.pts = toPts(pts); renderItem(it); return h; };
      h.get = function () { return st.pts.map(function (p) { return p.slice(); }); };
      return addItem(it, grp);
    }

    // arc ------------------------------------------------------------------
    var ARC_KEYS = ['center', 'r', 'rPx', 'theta0', 'theta1', 'color', 'width', 'arrow', 'dashed', 'label', 'labelGap', 'opacity'];
    function arcImpl(grp, op) {
      op = op && typeof op === 'object' ? op : {};
      var st = { center: [0, 0], r: NaN, rPx: null, theta0: 0, theta1: NaN, color: 't', width: 2, arrow: true, dashed: false, label: null, labelGap: 5, opacity: 1 };
      merge(st, op, ARC_KEYS);
      var path = S('path', { 'class': 'cyl2d-arc', fill: 'none' }, contentParent(grp));
      path.style.fill = 'none';
      var h = { el: path };
      var it = { kind: 'arc', st: st, nodes: [path], handle: h };
      var lab = null;
      function ensureLabel() {
        if (!lab && st.label !== undefined && st.label !== null && st.label !== '') { lab = newLabel(grp, op.labelClass, op.labelBackground); it.nodes.push(lab.el); }
      }
      ensureLabel();
      it.render = function () {
        var c0 = toPt(st.center) || [0, 0];
        var t0 = num(st.theta0, NaN), t1 = num(st.theta1, NaN);
        var rpx = st.rPx !== null && st.rPx !== undefined ? num(st.rPx, NaN) : num(st.r, NaN) * L.s;
        var sweep = t1 - t0;
        var ok = okPt(c0) && rpx > 0.5 && isFinite(sweep) && Math.abs(sweep) > 1e-9;
        it.ok = ok;
        if (!ok) return;
        if (Math.abs(sweep) > 8 * Math.PI) sweep = (sweep > 0 ? 1 : -1) * 8 * Math.PI;
        var C = toPx(c0);
        var n = clamp(Math.ceil(Math.abs(sweep) * rpx / 2.5), 8, 1500);
        var pts = [];
        for (var i = 0; i <= n; i++) {
          var a = t0 + sweep * i / n;
          pts.push([C[0] + rpx * Math.cos(a), C[1] - rpx * Math.sin(a)]);
        }
        var w = posNum(st.width, 2), c = paint(st.color, 't');
        styleStroke(path, c, w, st.dashed, st.opacity);
        strokeRun(path, pts, c, w, st.arrow === undefined ? true : st.arrow);
        if (lab) {
          var has = st.label !== undefined && st.label !== null && st.label !== '';
          lab.el._cyl2dOff = !has;
          if (has) {
            var m = t0 + sweep / 2;
            var ux = Math.cos(m), uy = -Math.sin(m);
            lab.el.style.color = paint(op.labelColor !== undefined ? op.labelColor : st.color, 'ink');
            setLabelContent(lab, st.label, op.labelTex !== false);
            placeLabel(lab, C[0] + rpx * ux, C[1] + rpx * uy, dirAnchor(ux, uy), op.labelOffset, num(st.labelGap, 5) + w / 2, L.W, L.H);
          }
        }
      };
      h.set = function (obj) { merge(st, obj, ARC_KEYS); ensureLabel(); renderItem(it); return h; };
      h.get = function () { var out = {}; ARC_KEYS.forEach(function (k) { out[k] = st[k]; }); return out; };
      return addItem(it, grp);
    }

    // circle ---------------------------------------------------------------
    var CIRCLE_KEYS = ['center', 'r', 'color', 'width', 'dashed', 'fill', 'fillOpacity', 'opacity'];
    function circleImpl(grp, op) {
      op = op && typeof op === 'object' ? op : {};
      var st = { center: [0, 0], r: NaN, color: 'ink', width: 2, dashed: false, fill: null, fillOpacity: 0.15, opacity: 1 };
      merge(st, op, CIRCLE_KEYS);
      var el = S('circle', { 'class': 'cyl2d-circle' }, contentParent(grp));
      var h = { el: el };
      var it = { kind: 'circle', st: st, nodes: [el], handle: h };
      it.render = function () {
        var c0 = toPt(st.center) || [0, 0];
        var rpx = num(st.r, NaN) * L.s;
        it.ok = okPt(c0) && rpx > 0.05;
        if (!it.ok) return;
        var C = toPx(c0), w = Math.max(0, num(st.width, 2)), c = paint(st.color, 'ink');
        el.setAttribute('cx', String(rd(C[0])));
        el.setAttribute('cy', String(rd(C[1])));
        el.setAttribute('r', String(rd(Math.min(rpx, BIG))));
        if (w > 0) styleStroke(el, c, w, st.dashed, st.opacity); else el.style.stroke = 'none';
        styleFill(el, st.fill, c, st.fillOpacity, 0.15);
      };
      h.set = function (obj) { merge(st, obj, CIRCLE_KEYS); renderItem(it); return h; };
      return addItem(it, grp);
    }

    // sector (annular sector / polar rectangle) ------------------------------
    var SECTOR_KEYS = ['center', 'r0', 'r1', 'theta0', 'theta1', 'color', 'fillOpacity', 'width', 'dashed', 'opacity', 'fill'];
    function sectorImpl(grp, op) {
      op = op && typeof op === 'object' ? op : {};
      var st = { center: [0, 0], r0: 0, r1: NaN, theta0: 0, theta1: NaN, color: 'accent', fillOpacity: 0.18, width: 1.5, dashed: false, opacity: 1, fill: true };
      merge(st, op, SECTOR_KEYS);
      var path = S('path', { 'class': 'cyl2d-sector', 'fill-rule': 'evenodd' }, contentParent(grp));
      var h = { el: path };
      var it = { kind: 'sector', st: st, nodes: [path], handle: h };
      it.render = function () {
        var c0 = toPt(st.center) || [0, 0];
        var r0 = Math.max(0, num(st.r0, 0)), r1 = num(st.r1, NaN);
        if (r1 < r0) { var tmp = r0; r0 = r1; r1 = tmp; }
        var t0 = num(st.theta0, NaN), t1 = num(st.theta1, NaN), sweep = t1 - t0;
        var ok = okPt(c0) && r1 * L.s > 0.3 && isFinite(sweep) && Math.abs(sweep) > 1e-9 && (r1 - r0) * L.s > 0.05;
        it.ok = ok;
        if (!ok) return;
        var C = toPx(c0), R0 = r0 * L.s, R1 = r1 * L.s;
        var full = Math.abs(sweep) >= TAU - 1e-9;
        if (full) sweep = sweep > 0 ? TAU : -TAU;
        var n = clamp(Math.ceil(Math.abs(sweep) * R1 / 2.5), 8, 1500);
        var outer = [], inner = [], i, a;
        for (i = 0; i <= n; i++) {
          a = t0 + sweep * i / n;
          outer.push([C[0] + R1 * Math.cos(a), C[1] - R1 * Math.sin(a)]);
          if (R0 > 0.05) inner.push([C[0] + R0 * Math.cos(a), C[1] - R0 * Math.sin(a)]);
        }
        var d;
        if (full) d = runsD([outer], true) + (inner.length ? runsD([inner.reverse()], true) : '');
        else d = runsD([outer.concat(inner.length ? inner.reverse() : [C])], true);
        path.setAttribute('d', d);
        var c = paint(st.color, 'accent'), w = Math.max(0, num(st.width, 1.5));
        if (w > 0) styleStroke(path, c, w, st.dashed, st.opacity); else { path.style.stroke = 'none'; }
        styleFill(path, st.fill === false ? null : (st.fill === true || st.fill === undefined || st.fill === null ? true : st.fill), c, st.fillOpacity, 0.18);
      };
      h.set = function (obj) { merge(st, obj, SECTOR_KEYS); renderItem(it); return h; };
      return addItem(it, grp);
    }

    // label ----------------------------------------------------------------
    function labelImpl(grp, pos, tex, op) {
      op = op && typeof op === 'object' ? op : {};
      var st = { pos: toPt(pos), text: tex, color: op.color, anchor: op.anchor || 'c', offset: op.offset, isTex: op.tex !== false };
      var lb = newLabel(grp, op.className, op.background);
      var h = { el: lb.el };
      var it = { kind: 'label', st: st, nodes: [lb.el], handle: h };
      it.render = function () {
        var has = st.text !== undefined && st.text !== null && st.text !== '';
        it.ok = okPt(st.pos) && has;
        if (!it.ok) return;
        lb.el.style.color = paint(st.color, 'ink');
        setLabelContent(lb, st.text, st.isTex);
        var q = toPx(st.pos);
        placeLabel(lb, q[0], q[1], st.anchor, st.offset, op.gap, L.W, L.H);
      };
      h.set = function (p, t) {
        if (p !== undefined && p !== null) st.pos = toPt(p);
        if (arguments.length > 1 && t !== undefined) st.text = t;
        renderItem(it);
        return h;
      };
      h.setText = function (t) { st.text = t; renderItem(it); return h; };
      h.setAnchor = function (a, off) { st.anchor = a; if (off !== undefined) st.offset = off; renderItem(it); return h; };
      return addItem(it, grp);
    }

    // y = f(x) -------------------------------------------------------------
    function fnImpl(grp, f, op) {
      op = op && typeof op === 'object' ? op : {};
      var st = { f: f, color: op.color, width: posNum(op.width, 2.5), samples: clamp(Math.round(posNum(op.samples, 300)), 2, 5000),
        domain: op.domain, dashed: op.dashed, opacity: op.opacity };
      var path = S('path', { 'class': 'cyl2d-fn', fill: 'none' }, contentParent(grp));
      path.style.fill = 'none';
      var h = { el: path };
      var it = { kind: 'fn', st: st, nodes: [path], handle: h };
      it.render = function () {
        it.ok = false;
        if (typeof st.f !== 'function') return;
        var x0 = L.vx0, x1 = L.vx1;
        var dom = st.domain && typeof st.domain === 'object' && st.domain.length >= 2 ? st.domain : null;
        if (dom) { x0 = Math.max(x0, num(dom[0], -Infinity)); x1 = Math.min(x1, num(dom[1], Infinity)); }
        if (!(x1 > x0)) return;
        var N = st.samples, Hh = L.H, runs = [], cur = null, prev = null;
        for (var i = 0; i <= N; i++) {
          var x = x0 + (x1 - x0) * i / N;
          var y = evalQuiet(st.f, x);
          if (!isFinite(y)) { cur = null; prev = null; continue; }
          var q = toPx([x, y]);
          q[1] = clamp(q[1], -2 * Hh, 3 * Hh);
          if (prev && ((prev[1] < -0.5 * Hh && q[1] > 1.5 * Hh) || (prev[1] > 1.5 * Hh && q[1] < -0.5 * Hh))) cur = null;   // asymptote
          if (!cur) { cur = []; runs.push(cur); }
          cur.push(q);
          prev = q;
        }
        var d = runsD(runs);
        if (!d) return;
        it.ok = true;
        styleStroke(path, paint(st.color, 'accent'), st.width, st.dashed, st.opacity);
        path.setAttribute('d', d);
      };
      h.setFn = function (nf) { st.f = nf; renderItem(it); return h; };
      h.set = h.setFn;
      return addItem(it, grp);
    }

    // r = f(θ) -------------------------------------------------------------
    function polarImpl(grp, f, op) {
      op = op && typeof op === 'object' ? op : {};
      var st = { f: f, theta0: num(op.theta0, 0), theta1: num(op.theta1, TAU), color: op.color, width: posNum(op.width, 2.5),
        samples: op.samples, negativeR: op.negativeR === 'plot' ? 'plot' : 'skip', dashed: op.dashed, opacity: op.opacity };
      var path = S('path', { 'class': 'cyl2d-polar', fill: 'none' }, contentParent(grp));
      path.style.fill = 'none';
      var h = { el: path };
      var it = { kind: 'polar', st: st, nodes: [path], handle: h };
      it.render = function () {
        it.ok = false;
        if (typeof st.f !== 'function') return;
        var t0 = num(st.theta0, NaN), t1 = num(st.theta1, NaN);
        if (!isFinite(t0) || !isFinite(t1) || Math.abs(t1 - t0) < 1e-12) return;
        if (Math.abs(t1 - t0) > 40 * Math.PI) t1 = t0 + (t1 > t0 ? 1 : -1) * 40 * Math.PI;
        var N = clamp(Math.round(posNum(st.samples, Math.max(360, Math.ceil(Math.abs(t1 - t0) / TAU * 720)))), 8, 20000);
        var runs = [], cur = null, prev = null, jump = 4 * Math.max(L.W, L.H);
        for (var i = 0; i <= N; i++) {
          var th = t0 + (t1 - t0) * i / N;
          var r = evalQuiet(st.f, th);
          if (!isFinite(r) || (r < 0 && st.negativeR === 'skip')) { cur = null; prev = null; continue; }
          var q = toPx([r * Math.cos(th), r * Math.sin(th)]);
          q[0] = clamp(q[0], -BIG, BIG); q[1] = clamp(q[1], -BIG, BIG);
          if (prev && Math.hypot(q[0] - prev[0], q[1] - prev[1]) > jump) cur = null;
          if (!cur) { cur = []; runs.push(cur); }
          cur.push(q);
          prev = q;
        }
        var d = runsD(runs);
        if (!d) return;
        it.ok = true;
        styleStroke(path, paint(st.color, 'accent'), st.width, st.dashed, st.opacity);
        path.setAttribute('d', d);
      };
      h.setFn = function (nf, range2) {
        st.f = nf;
        if (range2 && typeof range2 === 'object') merge(st, range2, ['theta0', 'theta1']);
        renderItem(it);
        return h;
      };
      h.set = function (obj) {
        if (typeof obj === 'function') st.f = obj;
        else merge(st, obj, ['theta0', 'theta1', 'samples', 'negativeR']);
        renderItem(it);
        return h;
      };
      return addItem(it, grp);
    }

    // groups -----------------------------------------------------------------
    function grpOf(op) {
      if (!op || typeof op !== 'object') return null;
      var g = op.parent || op.group;
      return g && g._cyl2dGroup && !g._cyl2dGroup.removed ? g._cyl2dGroup : null;
    }
    function withParent(op, grp) {
      var out = {};
      if (op && typeof op === 'object') for (var k in op) if (hasOwn.call(op, k)) out[k] = op[k];
      if (!grpOf(out)) out.parent = grp.api;
      return out;
    }
    function groupDescendants(grp) {
      var out = [grp];
      for (var i = 0; i < out.length; i++) Array.prototype.push.apply(out, out[i].children);
      return out;
    }
    function clearGroup(grp) {
      groupDescendants(grp).forEach(function (g) { g.items.slice().forEach(removeItem); });
    }
    function makeGroup(parent) {
      var grp = { items: [], children: [], parent: parent || null, removed: false };
      grp.content = S('g', { 'class': 'cyl2d-group' }, parent ? parent.content : gContent);
      grp.points = S('g', { 'class': 'cyl2d-group' }, parent ? parent.points : gPoints);
      grp.labels = H('div', 'cyl2d-layer', parent ? parent.labels : layUser);
      if (parent) parent.children.push(grp);
      var g = { el: grp.content, _cyl2dGroup: grp };
      grp.api = g;
      g.point = function (pos, op) { return api.point(pos, withParent(op, grp)); };
      g.line = function (a, b, op) { return api.line(a, b, withParent(op, grp)); };
      g.polyline = function (pts, op) { return api.polyline(pts, withParent(op, grp)); };
      g.arc = function (op) { return api.arc(withParent(op, grp)); };
      g.circle = function (op) { return api.circle(withParent(op, grp)); };
      g.sector = function (op) { return api.sector(withParent(op, grp)); };
      g.label = function (pos, tex, op) { return api.label(pos, tex, withParent(op, grp)); };
      g.fn = function (f, op) { return api.fn(f, withParent(op, grp)); };
      g.polar = function (f, op) { return api.polar(f, withParent(op, grp)); };
      g.group = function () { return makeGroup(grp).api; };
      g.visible = true;
      g.setVisible = function (v) {
        g.visible = v !== false;
        var d = g.visible ? '' : 'none';
        grp.content.style.display = d; grp.points.style.display = d; grp.labels.style.display = d;
        return g;
      };
      g.clear = function () { clearGroup(grp); return g; };
      g.remove = function () {
        if (grp.removed) return;
        clearGroup(grp);
        groupDescendants(grp).forEach(function (x) { x.removed = true; detach(x.content); detach(x.points); detach(x.labels); });
        if (grp.parent) { var i = grp.parent.children.indexOf(grp); if (i >= 0) grp.parent.children.splice(i, 1); }
      };
      return grp;
    }

    // ---- redraw + resize
    function redraw() {
      if (destroyed) return;
      computeLayout();
      applySize();
      applyChrome();
      drawGrid();
      drawAxes();
      items.slice().forEach(renderItem);
    }
    var raf = 0;
    var ro = null;
    var lastResize = null;   // {from, to, t}: the most recent width-change redraw
    function scheduleRedraw() {
      if (raf || destroyed) return;
      var run = function () {
        raf = 0;
        if (destroyed) return;
        var w = measure();
        if (!(w > 0)) return;
        if (!L.measured) { redraw(); return; }
        var target = Math.max(80, Math.round(Math.min(w, o.width || Infinity)));
        if (Math.abs(target - L.W) < 1) return;
        // Oscillation guard. The plot's height follows its width, so near a page's scrollbar threshold a redraw
        // can toggle the scrollbar, which changes the width back, and so on forever (classic scrollbars on
        // Windows / "always show scroll bars" on macOS). A quick return to the width we just redrew away from
        // (by up to a scrollbar-ish amount) is that loop: keep the current layout. Nothing looks wrong, because
        // the svg scales uniformly and the labels are positioned in %.
        var now = Date.now();
        if (lastResize && now - lastResize.t < 1000 && Math.abs(target - lastResize.from) < 1 &&
            Math.abs(target - L.W) <= 40) return;
        lastResize = { from: L.W, to: target, t: now };
        redraw();
      };
      raf = global.requestAnimationFrame ? global.requestAnimationFrame(run) : global.setTimeout(run, 16);
    }
    if (typeof global.ResizeObserver === 'function') {
      ro = new global.ResizeObserver(function () { scheduleRedraw(); });
      ro.observe(wrap);
    } else {
      global.addEventListener('resize', scheduleRedraw);
    }

    var api = {
      svg: svg,
      el: wrap,
      container: container,
      toPx: function (p) { var q = toPt(p); return okPt(q) ? toPx(q) : [NaN, NaN]; },
      fromPx: function (p) { var q = toPt(p); return okPt(q) ? fromPx(q) : [NaN, NaN]; },
      point: function (pos, op) { return pointImpl(grpOf(op), pos, op); },
      line: function (a, b, op) { return lineImpl(grpOf(op), a, b, op); },
      polyline: function (pts, op) { return polylineImpl(grpOf(op), pts, op); },
      arc: function (op) { return arcImpl(grpOf(op), op); },
      circle: function (op) { return circleImpl(grpOf(op), op); },
      sector: function (op) { return sectorImpl(grpOf(op), op); },
      label: function (pos, tex, op) { return labelImpl(grpOf(op), pos, tex, op); },
      fn: function (f, op) { return fnImpl(grpOf(op), f, op); },
      polar: function (f, op) { return polarImpl(grpOf(op), f, op); },
      group: function (parent) {
        var pg = parent && parent._cyl2dGroup && !parent._cyl2dGroup.removed ? parent._cyl2dGroup : null;
        return makeGroup(pg).api;
      },
      clear: function (target) {
        if (target === undefined || target === null) { items.slice().forEach(removeItem); return api; }
        if (target && target._cyl2dGroup) clearGroup(target._cyl2dGroup);
        else if (target && typeof target.remove === 'function' && target.kind) target.remove();
        return api;
      },
      remove: function (h) { if (h && typeof h.remove === 'function') h.remove(); return api; },
      redraw: function () { redraw(); return api; },
      setOptions: function (src) { applyOpts(src); redraw(); return api; },
      setRange: function (xr, yr) {
        var src = {};
        if (xr) src.xRange = xr;
        if (yr) src.yRange = yr;
        applyOpts(src);
        redraw();
        return api;
      },
      getView: function () { return { x: [L.vx0, L.vx1], y: [L.vy0, L.vy1], width: L.W, height: L.H, scale: L.s }; },
      step: function () { return baseStep(); },
      destroy: function () {
        if (destroyed) return;
        items.slice().forEach(removeItem);
        destroyed = true;
        if (ro) ro.disconnect(); else global.removeEventListener('resize', scheduleRedraw);
        if (raf && global.cancelAnimationFrame) global.cancelAnimationFrame(raf);
        detach(wrap);
      }
    };
    redraw();
    return api;
  }

  global.CYL2D = {
    version: '1.0.0',
    plane: plane,
    snapGrid: snapGrid,
    snapPolar: snapPolar,
    paint: function (c) { return paint(c, 'ink'); }
  };
})(typeof window !== 'undefined' ? window : this);
