/*!
 * rect.js — RECT: motion along a straight line for the Rectilinear Motion module: runs (closed-form motions,
 * motions with an acceleration a(t, s, v) integrated by RK4, and motions drawn as a velocity–time graph),
 * animated figures with the particle on its line and synced s–t, v–t and a–t graphs, and the calculus and
 * kinematics widgets of the lessons and the Motion Lab. Classic script (IIFE) that attaches ONE global: RECT.
 * Requires CYL (cyl-core.js), CYL2D (cyl-2d.js), ENERGY (energy.js, for ENERGY.chart and the transport) and
 * MOMENTUM (momentum.js, for MOMENTUM.player). Load it after them.
 *
 * Color code, the same in every figure, graph, readout and formula (TeX \colPos, \colVel, \colAcc):
 *   position s ............ 'z' (blue)      velocity v ............ 'good' (green)
 *   acceleration a ........ 'bad' (red)     tangent lines and slopes 'warn' (amber)
 *   relative motion: A 'accent' (teal), B 'warn' (amber), B relative to A 't' (violet), as in Systems of Particles.
 *
 * RECT.run(spec) -> run. spec.kind:
 *   'const'  {s0, v0, ac}                         constant acceleration
 *   's'      {s: f(t), v: f(t), a: f(t)}           a position function (v and a by differences when omitted)
 *   'a'      {a: f(t, s, v), s0, v0, stop(state)}  any acceleration (a(t), a(v), a(s)); RK4; stop() ends the run
 *   'vpts'   {pts: [[t, v], …], s0}                a velocity–time graph made of straight segments
 *   all: T (duration, s), n (samples, 1200)
 *   run: {spec, T, at(t) -> {t, s, v, a, d}, plot(key) -> [[t, value]…], ext: {s: [lo, hi], v, a, d}, turns: [t…]}
 *   d is the distance traveled since t = 0 (the sum of |ds|).
 *
 * RECT.figure(opts) -> controller: the particle on its line (horizontal, or vertical with track.axis 'y'), its
 *   velocity and acceleration arrows, a position dimension from O and an optional strobe, the s–t, v–t and a–t
 *   graphs under it with a moving time cursor, a transport row (Play, Reset, time, Playback) and a panel of
 *   readouts and sliders.
 *   opts: stage, controls, aria (REQUIRED), spec | build(params) -> spec, params, sliders: [{key, label, min, max,
 *     step, value, unit, color}], graphs: ['s', 'v', 'a'], names: {s: 's', v: 'v', a: 'a'} (TeX symbols),
 *     track: {axis: 'x' | 'y', range: [lo, hi] (auto), label}, body: 'block' | 'ball' | 'car',
 *     show: {v: true, a: true, strobe: false}, toggles: ['v', 'a', 'strobe'], readouts: ['t', 's', 'v', 'a', 'd'],
 *     chartHeight: 140, markTurns: true, editable: null | {key: 'v', snap: 0.5, range: [lo, hi]} (drag the
 *     vertices of a 'vpts' run's v–t graph), panelTitle, note, extra(panel, fig), onUpdate(state, fig), speed: 1.
 *   controller: {plane, charts, run(), state(), params, setParams(p), setSpec(spec), player, destroy()}
 *
 * Widgets of the lessons (each takes {stage, controls, …} and returns a controller):
 *   RECT.slope     the tangent line and the secant: the derivative as a slope (Lesson 1)
 *   RECT.area      the definite integral as a signed area, with midpoint rectangles (Lesson 2)
 *   RECT.family    antiderivatives differ by a constant; an initial condition picks one (Lesson 2)
 *   RECT.asGraph   an a–s graph (draggable) and the v–s graph it gives, ½(v² − v₀²) = area (Lesson 6)
 *   RECT.tackle    a load on a block and tackle with n supporting parts of one cord (Lesson 7)
 *   RECT.ropeLift  a truck pulls a cord over a pulley and lifts a crate (Lesson 7)
 *   RECT.relative  two cars on a straight road, seen from the ground or from car A (Lesson 8)
 */
(function (window, document) {
  'use strict';
  if (window.RECT) return;
  var CYL = window.CYL, CYL2D = window.CYL2D, ENERGY = window.ENERGY;
  var RECT = { version: '1.0.0', G: 9.81 };
  var COLORS = { s: 'z', v: 'good', a: 'bad', d: 'muted' };
  RECT.COLORS = COLORS;

  /* ---------- helpers ---------- */
  function report(msg) { try { if (CYL && CYL.error) CYL.error('RECT: ' + msg); else console.error('RECT: ' + msg); } catch (e) { /* ignore */ } }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function fx(x, d) { return CYL.fmtFixed(Math.abs(x) < 1e-9 ? 0 : x, d); }
  function fmt(x, s) { return CYL.fmt(Math.abs(x) < 1e-12 ? 0 : x, s || 4); }
  function niceStep(span, n) {
    var raw = span / Math.max(1, n || 8), mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
  }
  function padRange(lo, hi, frac, incl0) {
    if (incl0 !== false) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    if (!(hi - lo > 1e-9)) { var c = (hi + lo) / 2, w = Math.max(1, Math.abs(c) * 0.2); lo = c - w; hi = c + w; }
    var p = (hi - lo) * (frac == null ? 0.08 : frac);
    return [lo - (lo < 0 || incl0 === false ? p : 0), hi + p];
  }
  function title(panel, text) { panel.appendChild(CYL.el('p', { class: 'viz-title', text: text })); }
  function rgrid(panel, ros) { var g = CYL.el('div', { class: 'readout-grid', 'aria-live': 'off' }, ros.map(function (r) { return r.el; })); panel.appendChild(g); return g; }
  function slider(panel, s, onInput) {
    var sl = CYL.slider({ label: s.label, min: s.min, max: s.max, step: s.step, value: s.value, unit: s.unit || '', color: s.color, format: s.format, onInput: onInput });
    panel.appendChild(sl.el); return sl;
  }
  function note(panel, html) { var n = CYL.el('p', { class: 'mf-note', html: html || '' }); panel.appendChild(n); if (CYL.renderMath) CYL.renderMath(n); return n; }
  function desc(panel, html) { var n = CYL.el('div', { class: 'mf-desc', html: html || '' }); panel.appendChild(n); if (CYL.renderMath) CYL.renderMath(n); return n; }
  function chips(panel, items) {
    var row = CYL.el('div', { class: 'chip-row', role: 'group', 'aria-label': 'Show' }), out = {};
    items.forEach(function (it) { var t = CYL.toggle(it); out[it.key || it.label] = t; row.appendChild(t.el); });
    panel.appendChild(row); return out;
  }
  function select(panel, label, options, value, onChange) {
    var s = CYL.select({ label: label, options: options, value: value, onChange: onChange });
    panel.appendChild(s.el); return s;
  }
  function player(stage, dur, onTime, speed) {
    var pl = window.MOMENTUM.player({ stage: stage, duration: dur, onTime: onTime });
    if (speed) pl.setSpeed(speed);
    return pl;
  }
  function ground(p, x0, x1, y, step) {
    p.line([x0, y], [x1, y], { color: 'ink', width: 2.2 });
    step = step || (x1 - x0) / 40;
    for (var q = x0 + step / 2; q < x1; q += step) p.line([q, y], [q - step * 0.6, y - step * 0.9], { color: 'muted', width: 1 });
  }
  function ceiling(p, x0, x1, y, step) {
    p.line([x0, y], [x1, y], { color: 'ink', width: 2.6 });
    step = step || (x1 - x0) / 12;
    for (var q = x0 + step / 2; q < x1; q += step) p.line([q, y], [q + step * 0.6, y + step * 0.8], { color: 'muted', width: 1 });
  }
  function wheel(p, c, r) {
    return [p.circle({ center: c, r: r, color: 'ink', width: 2, fill: 'bg', fillOpacity: 1 }),
      p.circle({ center: c, r: r * 0.22, color: 'ink', width: 1.3, fill: 'muted', fillOpacity: 0.6 })];
  }
  function blockPts(c, w, h) { return [[c[0] - w / 2, c[1] - h / 2], [c[0] + w / 2, c[1] - h / 2], [c[0] + w / 2, c[1] + h / 2], [c[0] - w / 2, c[1] + h / 2]]; }
  // linear map of an ENERGY.chart (px = k·x + b on each axis), for dragging points on it
  function chartMap(ch) {
    var p0 = ch.toPx([0, 0]), p1 = ch.toPx([1, 1]);
    return { kx: p1[0] - p0[0], bx: p0[0], ky: p1[1] - p0[1], by: p0[1],
      toData: function (X, Y) { return [(X - p0[0]) / (p1[0] - p0[0]), (Y - p0[1]) / (p1[1] - p0[1])]; } };
  }
  function svgPoint(svg, e) {
    var pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    var m = svg.getScreenCTM(); if (!m) return [0, 0];
    var q = pt.matrixTransform(m.inverse()); return [q.x, q.y];
  }
  var SVGNS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs) { var n = document.createElementNS(SVGNS, tag); for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]); return n; }

  /* ======================================================================
     Draggable vertices on an ENERGY.chart: handles = [{x, y}], opts {color, snap, range: [lo, hi], fixedX: true,
     label(i) -> name for screen readers, onChange(i, y, done)}. Returns {draw(), set(points)}.
     ====================================================================== */
  function dragHandles(ch, pts, o) {
    var g = svgEl('g', { class: 'rm-handles' });
    ch.svg.appendChild(g);
    var P = pts.map(function (q) { return [q[0], q[1]]; }), dragging = -1;
    function snapY(y) { var st = o.snap || 0; if (st) y = Math.round(y / st) * st; return clamp(y, o.range[0], o.range[1]); }
    function draw() {
      while (g.firstChild) g.removeChild(g.firstChild);
      P.forEach(function (q, i) {
        if (o.lock && o.lock(i)) return;
        var px = ch.toPx(q);
        var c = svgEl('circle', { cx: px[0], cy: px[1], r: 7, fill: CYL2D.paint('bg'), stroke: CYL2D.paint(o.color || 'good'), 'stroke-width': 2.5,
          tabindex: 0, role: 'slider', 'aria-label': (o.label ? o.label(i) : 'Point ' + (i + 1)), 'aria-valuenow': fmt(q[1]), 'aria-valuetext': fmt(q[1]) + (o.unit ? ' ' + o.unit : ''),
          'aria-valuemin': o.range[0], 'aria-valuemax': o.range[1], class: 'rm-handle' });
        c.style.cursor = 'ns-resize';
        c.addEventListener('pointerdown', function (e) { dragging = i; c.setPointerCapture(e.pointerId); e.preventDefault(); });
        c.addEventListener('pointermove', function (e) {
          if (dragging !== i) return;
          var sp = svgPoint(ch.svg, e), m = chartMap(ch), y = snapY(m.toData(sp[0], sp[1])[1]);
          if (y !== P[i][1]) { P[i][1] = y; o.onChange(i, y, false); }
        });
        function end() { if (dragging === i) { dragging = -1; o.onChange(i, P[i][1], true); } }
        c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
        c.addEventListener('keydown', function (e) {
          var st = o.snap || 0.1, d = 0;
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') d = st; else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') d = -st;
          else if (e.key === 'PageUp') d = 5 * st; else if (e.key === 'PageDown') d = -5 * st; else return;
          e.preventDefault();
          P[i][1] = snapY(P[i][1] + d); o.onChange(i, P[i][1], true);
          var nn = g.querySelectorAll('circle')[i]; if (nn) nn.focus();
        });
        g.appendChild(c);
      });
    }
    var orig = ch.redraw;
    ch.redraw = function () { orig(); draw(); };
    draw();
    return { draw: draw, set: function (q) { P = q.map(function (r) { return [r[0], r[1]]; }); draw(); }, el: g, focusIndex: function (i) { var nn = g.querySelectorAll('circle')[i]; if (nn) nn.focus(); } };
  }
  RECT.dragHandles = dragHandles;

  /* ======================================================================
     RECT.run
     ====================================================================== */
  RECT.run = function (spec) {
    spec = Object.assign({ kind: 'const', T: 5, n: 1200, s0: 0, v0: 0, ac: 0 }, spec || {});
    var T = Math.max(1e-6, num(spec.T, 5)), N = Math.max(50, spec.n | 0), kind = spec.kind;
    var run = { spec: spec, T: T }, ts = [], ss = [], vs = [], as = [];
    var exact = null;      // t -> {s, v, a}
    if (kind === 'const') {
      exact = function (t) { return { s: spec.s0 + spec.v0 * t + 0.5 * spec.ac * t * t, v: spec.v0 + spec.ac * t, a: spec.ac }; };
    } else if (kind === 's') {
      var h = 1e-4 * Math.max(1, T);
      exact = function (t) {
        var s = spec.s(t);
        var v = spec.v ? spec.v(t) : (spec.s(t + h) - spec.s(t - h)) / (2 * h);
        var a = spec.a ? spec.a(t) : (spec.v ? (spec.v(t + h) - spec.v(t - h)) / (2 * h) : (spec.s(t + h) - 2 * s + spec.s(t - h)) / (h * h));
        return { s: s, v: v, a: a };
      };
    } else if (kind === 'vpts') {
      var P = (spec.pts || [[0, 0], [T, 0]]).slice().sort(function (p, q) { return p[0] - q[0]; });
      T = run.T = P[P.length - 1][0];
      var S = [spec.s0 || 0];             // s at each breakpoint
      for (var i = 1; i < P.length; i++) S.push(S[i - 1] + 0.5 * (P[i][1] + P[i - 1][1]) * (P[i][0] - P[i - 1][0]));
      run.pts = P; run.sAt = S;
      exact = function (t) {
        t = clamp(t, P[0][0], T);
        var k = 0; while (k < P.length - 2 && t > P[k + 1][0] + 1e-12) k++;
        var dt = P[k + 1][0] - P[k][0], a = dt > 1e-12 ? (P[k + 1][1] - P[k][1]) / dt : 0, u = t - P[k][0];
        return { s: S[k] + P[k][1] * u + 0.5 * a * u * u, v: P[k][1] + a * u, a: a };
      };
    }
    if (exact) {
      for (var j = 0; j <= N; j++) { var t = T * j / N, q = exact(t); ts.push(t); ss.push(q.s); vs.push(q.v); as.push(q.a); }
    } else if (kind === 'a') {
      // RK4 on (s, v); stop(state) ends the run early (a ball that lands, a car that stops)
      var M = N * 4, dt2 = T / M, s = num(spec.s0, 0), v = num(spec.v0, 0), tt = 0, A = spec.a;
      var acc = function (t, s, v) { var r; try { r = A(t, s, v); } catch (e) { r = NaN; } return isFinite(r) ? r : 0; };
      ts.push(0); ss.push(s); vs.push(v); as.push(acc(0, s, v));
      for (var m = 1; m <= M; m++) {
        var k1s = v, k1v = acc(tt, s, v);
        var k2s = v + 0.5 * dt2 * k1v, k2v = acc(tt + 0.5 * dt2, s + 0.5 * dt2 * k1s, v + 0.5 * dt2 * k1v);
        var k3s = v + 0.5 * dt2 * k2v, k3v = acc(tt + 0.5 * dt2, s + 0.5 * dt2 * k2s, v + 0.5 * dt2 * k2v);
        var k4s = v + dt2 * k3v, k4v = acc(tt + dt2, s + dt2 * k3s, v + dt2 * k3v);
        s += dt2 / 6 * (k1s + 2 * k2s + 2 * k3s + k4s); v += dt2 / 6 * (k1v + 2 * k2v + 2 * k3v + k4v); tt += dt2;
        if (!isFinite(s) || !isFinite(v)) break;
        if (m % 4 === 0 || m === M) { ts.push(tt); ss.push(s); vs.push(v); as.push(acc(tt, s, v)); }
        if (spec.stop && spec.stop({ t: tt, s: s, v: v })) { if (m % 4) { ts.push(tt); ss.push(s); vs.push(v); as.push(acc(tt, s, v)); } break; }
      }
      T = run.T = ts[ts.length - 1];
    } else report('run: unknown kind "' + kind + '"');
    // distance traveled
    var ds = [0];
    for (var r = 1; r < ss.length; r++) ds.push(ds[r - 1] + Math.abs(ss[r] - ss[r - 1]));
    function interp(arr, t) {
      if (!(t > 0)) return arr[0];
      if (t >= ts[ts.length - 1]) return arr[arr.length - 1];
      var lo = 0, hi = ts.length - 1;
      while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (ts[mid] <= t) lo = mid; else hi = mid; }
      var u = (t - ts[lo]) / Math.max(1e-15, ts[hi] - ts[lo]);
      return arr[lo] + (arr[hi] - arr[lo]) * u;
    }
    run.at = function (t) {
      t = clamp(num(t, 0), 0, run.T);
      var q = exact ? exact(t) : { s: interp(ss, t), v: interp(vs, t), a: interp(as, t) };
      return { t: t, s: q.s, v: q.v, a: q.a, d: interp(ds, t) };
    };
    function ext(arr) { var lo = Infinity, hi = -Infinity; arr.forEach(function (x) { if (isFinite(x)) { if (x < lo) lo = x; if (x > hi) hi = x; } }); return [lo, hi]; }
    run.ext = { s: ext(ss), v: ext(vs), a: ext(as), d: [0, ds[ds.length - 1]] };
    run.turns = [];
    for (var z = 1; z < vs.length; z++) {
      if ((vs[z - 1] > 1e-9 && vs[z] <= -1e-9) || (vs[z - 1] < -1e-9 && vs[z] >= 1e-9) || (vs[z - 1] !== 0 && vs[z] === 0 && z < vs.length - 1)) {
        var tz = ts[z - 1] + (ts[z] - ts[z - 1]) * vs[z - 1] / (vs[z - 1] - vs[z]);
        if (!run.turns.length || tz - run.turns[run.turns.length - 1] > T * 1e-3) run.turns.push(tz);
      }
    }
    if (kind === 'vpts') {                                   // exact turning instants on a straight-segment graph
      run.turns = [];
      run.pts.forEach(function (p, k) {
        if (k === 0) return;
        var p0 = run.pts[k - 1];
        if ((p0[1] > 0 && p[1] < 0) || (p0[1] < 0 && p[1] > 0)) run.turns.push(p0[0] + (p[0] - p0[0]) * p0[1] / (p0[1] - p[1]));
      });
    }
    run.plot = function (key) {
      if (kind === 'vpts') {
        var P2 = run.pts;
        if (key === 'v') return P2.map(function (p) { return [p[0], p[1]]; });
        if (key === 'a') {
          var out = [];
          for (var k = 1; k < P2.length; k++) {
            var dtk = P2[k][0] - P2[k - 1][0], ak = dtk > 1e-12 ? (P2[k][1] - P2[k - 1][1]) / dtk : 0;
            out.push([P2[k - 1][0], ak]); out.push([P2[k][0], ak]);
          }
          return out;
        }
      }
      var arr = key === 's' ? ss : key === 'v' ? vs : key === 'a' ? as : ds, pts = [], step = Math.max(1, Math.floor(ts.length / 600));
      for (var i2 = 0; i2 < ts.length; i2 += step) pts.push([ts[i2], arr[i2]]);
      if (pts[pts.length - 1][0] !== ts[ts.length - 1]) pts.push([ts[ts.length - 1], arr[arr.length - 1]]);
      return pts;
    };
    run.samples = { t: ts, s: ss, v: vs, a: as, d: ds };
    return run;
  };

  /* ======================================================================
     RECT.figure — the particle on its line, with synced graphs
     ====================================================================== */
  var NAMES = { s: 's', v: 'v', a: 'a', d: 'd' };
  var UNITS = { s: 'm', v: 'm/s', a: 'm/s²', d: 'm' };
  var UNITS_TEX = { s: '\\text{m}', v: '\\text{m/s}', a: '\\text{m/s}^2', d: '\\text{m}' };
  RECT.figure = function (o) {
    o = Object.assign({ graphs: ['s', 'v', 'a'], body: 'block', readouts: ['t', 's', 'v', 'a', 'd'], toggles: ['v', 'a', 'strobe'],
      chartHeight: 140, markTurns: true, speed: 1, panelTitle: 'At time t' }, o || {});
    var names = Object.assign({}, NAMES, o.names || {}), show = Object.assign({ v: true, a: true, strobe: false }, o.show || {});
    var track = Object.assign({ axis: 'x' }, o.track || {});
    var stage = o.stage, panel = o.controls;
    var fig = { params: Object.assign({}, o.params || {}) };
    if (o.sliders) o.sliders.forEach(function (s) { if (!(s.key in fig.params)) fig.params[s.key] = s.value; });
    var run = RECT.run(o.spec || (o.build ? o.build(fig.params) : {}));
    var plDiv = CYL.el('div', { class: 'rm-track' }), gDiv = CYL.el('div', { class: 'rm-graphs' });
    stage.appendChild(plDiv); stage.appendChild(gDiv);
    stage.classList.add('rm-stage');
    var vertical = track.axis === 'y';
    var p = null, R = null, gStatic, gMove, gStrobe, bodyH, span;
    var bodyEl, vArr, aArr, sArr, sLab, ghost = [];

    function trackRange() {
      if (track.range) return track.range.slice();
      return padRange(run.ext.s[0], run.ext.s[1], 0.1);
    }
    function buildPlane() {
      if (p) { p.destroy(); plDiv.innerHTML = ''; }
      R = trackRange(); span = R[1] - R[0];
      var xr, yr;
      if (!vertical) { xr = [R[0] - span * 0.03, R[1] + span * 0.14]; yr = [-span * 0.13, span * 0.17]; }
      else { yr = [R[0] - span * 0.04, R[1] + span * 0.04]; xr = [-span * 0.34, span * 0.34]; }
      p = CYL2D.plane(plDiv, { xRange: xr, yRange: yr, grid: 'none', axes: false, maxHeight: vertical ? 380 : 260, ariaLabel: o.aria || 'A particle moving along a straight line.' });
      fig.plane = p;
      gStatic = p.group(); gStrobe = p.group(); gMove = p.group();
      bodyH = span * (vertical ? 0.03 : 0.045);
      // the line, its ticks and the origin O
      var st = niceStep(span, vertical ? 6 : 8), tk = span * 0.012;
      function P(sv, off) { return vertical ? [off, sv] : [sv, off]; }
      gStatic.line(P(R[0], 0), P(R[1], 0), { color: 'ink', width: 2 });
      for (var x = Math.ceil(R[0] / st) * st; x <= R[1] + 1e-9; x += st) {
        var xv = Math.abs(x) < st * 1e-6 ? 0 : x;
        gStatic.line(P(xv, -tk), P(xv, tk), { color: 'ink', width: 1.2 });
        if (xv !== 0) gStatic.label(P(xv, vertical ? -tk * 2 : -tk * 1.6), CYL.fmt(+xv.toPrecision(10)), { color: 'muted', anchor: vertical ? 'w' : 's', gap: 3 });
      }
      if (R[0] <= 0 && R[1] >= 0) {
        gStatic.circle({ center: P(0, 0), r: span * 0.006, color: 'ink', fill: 'ink', fillOpacity: 1 });
        gStatic.label(P(0, vertical ? -tk * 2 : -tk * 1.6), 'O', { color: 'ink', anchor: vertical ? 'w' : 's', gap: 3 });
      }
      gStatic.label(P(R[1], 0), (track.label || names.s) + '\\ (\\text{m})', { color: 'z', anchor: vertical ? 'n' : 'e', gap: 6 });
      // moving parts
      if (o.body === 'ball' || vertical) bodyEl = gMove.circle({ center: [0, 0], r: bodyH * 0.55, color: 'ink', width: 1.6, fill: 'surface', fillOpacity: 0.9 });
      else bodyEl = gMove.polyline([], { closed: true, color: 'ink', width: 1.6, fill: 'surface', fillOpacity: 0.85 });
      sArr = gMove.line([0, 0], [0, 0], { color: 'z', width: 1.6, arrow: true });
      sLab = gMove.label([0, 0], names.s, { color: 'z', anchor: vertical ? 'w' : 's', gap: 4 });
      vArr = gMove.line([0, 0], [0, 0], { color: 'good', width: 2.6, arrow: true, label: names.v, labelAt: 1, labelSide: 'beyond' });
      aArr = gMove.line([0, 0], [0, 0], { color: 'bad', width: 2.6, arrow: true, label: names.a, labelAt: 1, labelSide: 'beyond' });
      ghost = [];
    }
    var charts = {}, curves = {}, cursors = {}, marks = {}, turnLines = {}, handles = null;
    function chartRange(key) {
      var e = run.ext[key];
      if (o.ranges && o.ranges[key]) return o.ranges[key];
      return padRange(e[0], e[1], 0.1);
    }
    function buildCharts() {
      gDiv.innerHTML = ''; charts = {}; curves = {}; cursors = {}; marks = {}; turnLines = {};
      o.graphs.forEach(function (key) {
        var box = CYL.el('div', { class: 'rm-graph' }); gDiv.appendChild(box);
        var yr = chartRange(key);
        var ch = ENERGY.chart(box, { x: { label: '\\(t\\) (s)', min: 0, max: run.T }, y: { label: '\\(' + names[key] + '\\) (' + UNITS[key] + ')', min: yr[0], max: yr[1] },
          height: o.chartHeight, pad: { l: 52, r: 14, t: 8, b: 26 },
          ariaLabel: 'Graph of ' + ({ s: 'position', v: 'velocity', a: 'acceleration', d: 'distance traveled' })[key] + ' against time, with a cursor at the current time.' });
        charts[key] = ch;
        turnLines[key] = [];
        curves[key] = ch.polyline(run.plot(key), { color: COLORS[key], width: 2.4 });
        cursors[key] = ch.vline(0, { color: 'muted', width: 1.2, dashed: false });
        marks[key] = ch.marker([0, 0], { color: COLORS[key], r: 4, ring: false });
      });
      drawTurns();
      if (o.editable && charts[o.editable.key || 'v'] && run.pts) {
        var ek = o.editable.key || 'v';
        handles = dragHandles(charts[ek], run.pts, { color: COLORS[ek], snap: o.editable.snap || 0.5, range: o.editable.range || chartRange(ek), unit: UNITS[ek],
          lock: o.editable.lock, label: function (i) { return names[ek] + ' at t = ' + fmt(run.pts[i][0]) + ' s'; },
          onChange: function (i, y, done) {
            var pts = run.pts.map(function (q, k) { return [q[0], k === i ? y : q[1]]; });
            var sp = Object.assign({}, run.spec, { pts: pts });
            run = RECT.run(sp); fig.spec = sp;
            refreshCurves(done);
            if (o.onEdit) o.onEdit(pts, fig);
          } });
      }
    }
    function drawTurns() {
      o.graphs.forEach(function (key) {
        (turnLines[key] || []).forEach(function (h) { h.remove(); });
        turnLines[key] = [];
        if (o.markTurns) run.turns.forEach(function (tz) { turnLines[key].push(charts[key].vline(tz, { color: 'warn', width: 1.2, label: key === o.graphs[0] ? names.v + ' = 0' : null })); });
      });
    }
    function refreshCurves(rescale) {
      o.graphs.forEach(function (key) {
        var ch = charts[key];
        if (rescale !== false) {
          var yr = chartRange(key), cur = ch.y;
          if (o.editable && key === (o.editable.key || 'v')) yr = o.editable.range || [cur.min, cur.max];
          if (Math.abs(yr[0] - cur.min) > 1e-9 || Math.abs(yr[1] - cur.max) > 1e-9 || Math.abs(ch.x.max - run.T) > 1e-9) ch.setAxes({ x: { max: run.T }, y: { min: yr[0], max: yr[1] } });
        }
        curves[key].set(run.plot(key));
      });
      drawTurns();
      calib();
      if (rescale !== false && !track.range) { var nr = trackRange(); if (Math.abs(nr[0] - R[0]) > span * 1e-3 || Math.abs(nr[1] - R[1]) > span * 1e-3) buildPlane(); }
      if (pl) pl.refresh(true); else draw(0);
    }
    // readouts
    var ro = {}, scale = {};
    var RO = { t: ['Time \\(t\\)', null, 's'], s: ['Position \\(' + names.s + '\\)', 'z', 'm'], v: ['Velocity \\(' + names.v + '\\)', 'good', 'm/s'],
      a: ['Acceleration \\(' + names.a + '\\)', 'bad', 'm/s²'], d: ['Distance traveled \\(d\\)', null, 'm'] };
    function calib() {
      scale.t = Math.max(1, run.T); scale.s = Math.max(Math.abs(run.ext.s[0]), Math.abs(run.ext.s[1]), 1e-6);
      scale.v = Math.max(Math.abs(run.ext.v[0]), Math.abs(run.ext.v[1]), 1e-6); scale.a = Math.max(Math.abs(run.ext.a[0]), Math.abs(run.ext.a[1]), 1e-6);
      scale.d = Math.max(run.ext.d[1], 1e-6);
      Object.keys(ro).forEach(function (k) { if (ro[k].resetWidth) ro[k].resetWidth(); });
    }
    function draw(t) {
      var q = run.at(t);
      fig.state = q;
      var c = vertical ? [0, q.s] : [q.s, bodyH / 2];
      if (o.body === 'ball' || vertical) bodyEl.set({ center: c, r: bodyH * 0.55 });
      else if (o.body === 'car') {
        var L = span * 0.06, H = bodyH, x0 = q.s;
        bodyEl.set([[x0 - L / 2, 0], [x0 + L / 2, 0], [x0 + L / 2, H * 0.55], [x0 + L * 0.25, H * 0.6], [x0 + L * 0.1, H], [x0 - L * 0.3, H], [x0 - L / 2, H * 0.6]]);
      } else bodyEl.set(blockPts(c, bodyH * 1.2, bodyH));
      // arrows: lengths scaled to the run's largest value
      var Lv = span * 0.16, La = span * 0.12;
      var kv = Lv / Math.max(1e-9, scale.v), ka = La / Math.max(1e-9, scale.a);
      var yv = vertical ? span * 0.05 : bodyH * 1.6, ya = vertical ? span * 0.11 : bodyH * 2.5;
      function A(h, off, len, on) {
        // keep the tip inside the drawing (with room for the label); an arrow from a particle near an end stays visible
        var lo = R[0] + span * (vertical ? 0.01 : 0.04), hi = R[1] + span * (vertical ? 0.01 : 0.06);
        var tip = clamp(q.s + len, lo, hi);
        if (Math.abs(tip - q.s) < span * 0.04 && Math.abs(len) > span * 0.04) tip = q.s + (len > 0 ? 1 : -1) * span * 0.04;
        var okk = on && Math.abs(len) > span * 1e-4;
        h.setVisible(okk);
        if (okk) { if (vertical) h.set([off, q.s], [off, tip]); else h.set([q.s, off], [tip, off]); }
      }
      A(vArr, yv, q.v * kv, show.v); A(aArr, ya, q.a * ka, show.a);
      var ys = vertical ? -span * 0.12 : -span * 0.085, okS = Math.abs(q.s) > span * 0.01;
      sArr.setVisible(okS); sLab.setVisible(okS);
      if (okS) {
        if (vertical) { sArr.set([ys, 0], [ys, q.s]); sLab.set([ys, q.s / 2]); } else { sArr.set([0, ys], [q.s, ys]); sLab.set([q.s / 2, ys]); }
      }
      // strobe: the position at equal time steps, up to now
      gStrobe.clear();
      if (show.strobe) {
        var n = o.strobeN || 10, dtS = run.T / n;
        for (var k = 0; k <= n && k * dtS <= t + 1e-9; k++) {
          var sk = run.at(k * dtS).s;
          gStrobe.circle({ center: vertical ? [0, sk] : [sk, bodyH / 2], r: bodyH * 0.32, color: 't', width: 1.4, fill: 't', fillOpacity: 0.3 });
        }
      }
      o.graphs.forEach(function (key) { cursors[key].set(t); marks[key].set([t, q[key]]); });
      if (ro.t) ro.t.set(fx(t, 2) + '\u00a0s');
      ['s', 'v', 'a', 'd'].forEach(function (k) { if (ro[k]) ro[k].set(CYL.fmtScale(q[k], scale[k], 3) + '\u00a0' + UNITS[k]); });
      if (o.onUpdate) o.onUpdate(q, fig);
    }
    buildPlane();
    buildCharts();
    if (panel) {
      if (o.top) o.top(panel, fig);
      if (o.toggles && o.toggles.length) {
        title(panel, 'Show');
        var LAB = { v: 'Velocity', a: 'Acceleration', strobe: 'Strobe' }, CO = { v: 'good', a: 'bad', strobe: 't' };
        chips(panel, o.toggles.map(function (k) { return { key: k, label: LAB[k], color: CO[k], value: !!show[k], onChange: function (on) { show[k] = on; draw(pl.t()); } }; }));
      }
      title(panel, o.panelTitle);
      o.readouts.forEach(function (k) { ro[k] = CYL.readout(RO[k][0], { color: RO[k][1] || null }); });
      rgrid(panel, o.readouts.map(function (k) { return ro[k]; }));
      if (o.extra) o.extra(panel, fig);
      if (o.sliders && o.sliders.length) {
        title(panel, o.slidersTitle || 'Change the motion');
        fig.sliders = {};
        o.sliders.forEach(function (s) {
          fig.sliders[s.key] = slider(panel, s, function (v) { fig.params[s.key] = v; fig.setSpec(o.build(fig.params)); });
        });
      }
      if (o.note) note(panel, o.note);
      CYL.renderMath(panel);
    }
    calib();
    var pl = player(stage, function () { return run.T; }, draw, o.speed);
    fig.player = pl;
    fig.charts = charts;
    fig.run = function () { return run; };
    fig.at = function (t) { return run.at(t); };
    fig.setSpec = function (spec) { run = RECT.run(spec); fig.spec = spec; if (handles && run.pts) handles.set(run.pts); refreshCurves(true); return fig; };
    fig.setParams = function (pp) {
      Object.assign(fig.params, pp || {});
      if (fig.sliders) Object.keys(pp || {}).forEach(function (k) { if (fig.sliders[k]) fig.sliders[k].set(fig.params[k], true); });
      return fig.setSpec(o.build(fig.params));
    };
    fig.redraw = function () { draw(pl.t()); };
    fig.show = show;
    fig.destroy = function () { pl.destroy(); if (p) p.destroy(); stage.innerHTML = ''; };
    RECT.figures.push(fig);
    return fig;
  };
  RECT.figures = [];

  /* ======================================================================
     Functions for the calculus widgets: f, its derivative, an antiderivative, and TeX for each
     ====================================================================== */
  var FNS = {
    poly: { tex: 't^3 - 6t^2 + 9t', d: '3t^2 - 12t + 9', F: '\\tfrac{1}{4}t^4 - 2t^3 + \\tfrac{9}{2}t^2', rule: 'power rule, term by term',
      f: function (t) { return t * t * t - 6 * t * t + 9 * t; }, df: function (t) { return 3 * t * t - 12 * t + 9; }, Fn: function (t) { return t * t * t * t / 4 - 2 * t * t * t + 4.5 * t * t; }, dom: [0, 4.5] },
    sin: { tex: '2\\sin t', d: '2\\cos t', F: '-2\\cos t', rule: 'derivative of the sine',
      f: function (t) { return 2 * Math.sin(t); }, df: function (t) { return 2 * Math.cos(t); }, Fn: function (t) { return -2 * Math.cos(t); }, dom: [0, 2 * Math.PI] },
    exp: { tex: 'e^{0.5t}', d: '0.5\\,e^{0.5t}', F: '2e^{0.5t}', rule: 'exponential with the chain rule',
      f: function (t) { return Math.exp(0.5 * t); }, df: function (t) { return 0.5 * Math.exp(0.5 * t); }, Fn: function (t) { return 2 * Math.exp(0.5 * t); }, dom: [0, 4] },
    decay: { tex: '4e^{-t}', d: '-4e^{-t}', F: '-4e^{-t}', rule: 'exponential with the chain rule',
      f: function (t) { return 4 * Math.exp(-t); }, df: function (t) { return -4 * Math.exp(-t); }, Fn: function (t) { return -4 * Math.exp(-t); }, dom: [0, 4] },
    ln: { tex: '\\ln t', d: '\\dfrac{1}{t}', F: 't\\ln t - t', rule: 'derivative of the natural logarithm',
      f: function (t) { return Math.log(t); }, df: function (t) { return 1 / t; }, Fn: function (t) { return t * Math.log(t) - t; }, dom: [0.2, 5] },
    recip: { tex: '\\dfrac{2}{t}', d: '-\\dfrac{2}{t^2}', F: '2\\ln t', rule: 'power rule with n = −1',
      f: function (t) { return 2 / t; }, df: function (t) { return -2 / (t * t); }, Fn: function (t) { return 2 * Math.log(t); }, dom: [0.4, 5] },
    product: { tex: 't\\sin t', d: '\\sin t + t\\cos t', F: '\\sin t - t\\cos t', rule: 'product rule',
      f: function (t) { return t * Math.sin(t); }, df: function (t) { return Math.sin(t) + t * Math.cos(t); }, Fn: function (t) { return Math.sin(t) - t * Math.cos(t); }, dom: [0, 2 * Math.PI] },
    quotient: { tex: '\\dfrac{4t}{1 + t^2}', d: '\\dfrac{4(1 - t^2)}{(1 + t^2)^2}', F: '2\\ln(1 + t^2)', rule: 'quotient rule',
      f: function (t) { return 4 * t / (1 + t * t); }, df: function (t) { return 4 * (1 - t * t) / Math.pow(1 + t * t, 2); }, Fn: function (t) { return 2 * Math.log(1 + t * t); }, dom: [0, 5] },
    chain: { tex: '\\sin(t^2)', d: '2t\\cos(t^2)', F: null, rule: 'chain rule',
      f: function (t) { return Math.sin(t * t); }, df: function (t) { return 2 * t * Math.cos(t * t); }, Fn: null, dom: [0, 3] },
    vel: { tex: '12 - 3t', d: '-3', F: '12t - 1.5t^2', rule: 'power rule',
      f: function (t) { return 12 - 3 * t; }, df: function () { return -3; }, Fn: function (t) { return 12 * t - 1.5 * t * t; }, dom: [0, 7] },
    sq: { tex: '0.75\\,t^2', d: '1.5\\,t', F: '0.25\\,t^3', rule: 'power rule',
      f: function (t) { return 0.75 * t * t; }, df: function (t) { return 1.5 * t; }, Fn: function (t) { return 0.25 * t * t * t; }, dom: [0, 4] },
    cos: { tex: '3\\cos t', d: '-3\\sin t', F: '3\\sin t', rule: 'derivative of the cosine',
      f: function (t) { return 3 * Math.cos(t); }, df: function (t) { return -3 * Math.sin(t); }, Fn: function (t) { return 3 * Math.sin(t); }, dom: [0, 2 * Math.PI] }
  };
  RECT.FNS = FNS;
  function sampleExt(f, a, b) {
    var lo = Infinity, hi = -Infinity;
    for (var i = 0; i <= 300; i++) { var y = f(a + (b - a) * i / 300); if (isFinite(y)) { lo = Math.min(lo, y); hi = Math.max(hi, y); } }
    return [lo, hi];
  }
  var LABELS = { poly: 'Polynomial', sin: 'Sine', cos: 'Cosine', exp: 'Exponential (growth)', decay: 'Exponential (decay)', ln: 'Natural logarithm',
    recip: 'Reciprocal 2/t', product: 'Product t sin t', quotient: 'Quotient 4t/(1 + t²)', chain: 'Chain sin(t²)', vel: 'Straight line 12 − 3t', sq: 'Parabola 0.75t²' };

  /* ======================================================================
     RECT.slope — the tangent at t0 and the secant to t0 + Δt (Lesson 1)
     ====================================================================== */
  RECT.slope = function (o) {
    o = Object.assign({ fns: ['poly', 'sin', 'exp', 'ln', 'product', 'quotient', 'chain'], fn: 'poly', t0: 1.5, h: 0.8 }, o || {});
    var st = { fn: o.fn, t0: o.t0, h: o.h }, show = { secant: true, tangent: true };
    var stage = o.stage, panel = o.controls, api = {};
    var box1 = CYL.el('div', { class: 'rm-graph' }), box2 = CYL.el('div', { class: 'rm-graph' });
    stage.classList.add('rm-stage'); stage.appendChild(box1); stage.appendChild(box2);
    var c1, c2, curve, dcurve, tan, sec, pt, pt2, mk, mkSec, cur2, dRO = {}, t0Slider, hSlider, fdesc;
    function F() { return FNS[st.fn]; }
    function build() {
      box1.innerHTML = ''; box2.innerHTML = '';
      var f = F(), r1 = padRange.apply(null, sampleExt(f.f, f.dom[0], f.dom[1]).concat([0.1])), r2 = padRange.apply(null, sampleExt(f.df, f.dom[0], f.dom[1]).concat([0.1]));
      c1 = ENERGY.chart(box1, { x: { label: '\\(t\\)', min: f.dom[0], max: f.dom[1] }, y: { label: '\\(f(t)\\)', min: r1[0], max: r1[1] }, height: 220,
        ariaLabel: 'Graph of the function with its tangent line at the chosen point and a secant line to a second point.' });
      c2 = ENERGY.chart(box2, { x: { label: '\\(t\\)', min: f.dom[0], max: f.dom[1] }, y: { label: '\\(f\\,\'(t)\\)', min: r2[0], max: r2[1] }, height: 150,
        ariaLabel: 'Graph of the derivative, the slope of the function at each instant, with the current slope marked.' });
      curve = c1.fn(f.f, { color: 'z', width: 2.6, samples: 300 });
      sec = c1.polyline([], { color: 't', width: 1.8, dashed: true });
      tan = c1.polyline([], { color: 'warn', width: 2.4 });
      pt2 = c1.marker([0, 0], { color: 't', r: 4, ring: false });
      pt = c1.marker([0, 0], { color: 'warn', r: 5, ring: false });
      dcurve = c2.fn(f.df, { color: 'warn', width: 2.4, samples: 300 });
      cur2 = c2.vline(0, { color: 'muted', width: 1.2 });
      mkSec = c2.marker([0, 0], { color: 't', r: 4, ring: false, shape: 'diamond' });
      mk = c2.marker([0, 0], { color: 'warn', r: 5, ring: false });
      st.t0 = clamp(st.t0, f.dom[0], f.dom[1]);
      if (t0Slider) { t0Slider.setRange(f.dom[0], f.dom[1]); t0Slider.set(st.t0, true); }
      if (fdesc) { fdesc.innerHTML = '\\[ f(t) = ' + f.tex + ' \\]\\[ f\\,\'(t) = ' + f.d + ' \\]<p>By the ' + f.rule + '.</p>'; CYL.renderMath(fdesc); }
      update();
    }
    function update() {
      var f = F(), t0 = clamp(st.t0, f.dom[0], f.dom[1]), y0 = f.f(t0), m = f.df(t0), span = f.dom[1] - f.dom[0];
      var t1 = Math.min(f.dom[1], t0 + st.h), h = t1 - t0, y1 = f.f(t1), ms = h > 1e-9 ? (y1 - y0) / h : m;
      var w = span * 0.22;
      tan.set(show.tangent ? [[t0 - w, y0 - m * w], [t0 + w, y0 + m * w]] : []);
      sec.set(show.secant && h > 1e-9 ? [[t0 - w * 0.5, y0 - ms * w * 0.5], [t1 + w * 0.5, y1 + ms * w * 0.5]] : []);
      pt.set([t0, y0]); pt2.set(show.secant && h > 1e-9 ? [t1, y1] : null);
      cur2.set(t0); mk.set([t0, m]); mkSec.set(show.secant && h > 1e-9 ? [t0, ms] : null);
      dRO.t.set(fx(t0, 2)); dRO.f.set(fx(y0, 3)); dRO.sec.set(h > 1e-9 ? fx(ms, 3) : '\u2014'); dRO.d.set(fx(m, 3));
      api.state = { t0: t0, f: y0, slope: m, secant: ms, h: h };
    }
    if (panel) {
      title(panel, 'Function');
      select(panel, 'Choose \\(f(t)\\)', o.fns.map(function (k) { return { value: k, label: LABELS[k] }; }), st.fn, function (v) { st.fn = v; build(); });
      fdesc = desc(panel, '');
      chips(panel, [{ key: 'tangent', label: 'Tangent', color: 'warn', value: true, onChange: function (on) { show.tangent = on; update(); } },
        { key: 'secant', label: 'Secant', color: 't', value: true, onChange: function (on) { show.secant = on; update(); } }]);
      title(panel, 'At the point');
      dRO = { t: CYL.readout('\\(t\\)'), f: CYL.readout('\\(f(t)\\)', { color: 'z' }), sec: CYL.readout('Secant slope \\(\\Delta f/\\Delta t\\)', { color: 't' }), d: CYL.readout('Tangent slope \\(f\\,\'(t)\\)', { color: 'warn' }) };
      rgrid(panel, [dRO.t, dRO.f, dRO.sec, dRO.d]);
      title(panel, 'Move');
      t0Slider = slider(panel, { label: 'Point \\(t\\)', min: 0, max: 5, step: 0.01, value: st.t0 }, function (v) { st.t0 = v; update(); });
      hSlider = slider(panel, { label: 'Step \\(\\Delta t\\)', min: 0.01, max: 2, step: 0.01, value: st.h, color: 't' }, function (v) { st.h = v; update(); });
      note(panel, 'Shrink the step: the secant turns into the tangent, and its slope into the derivative.');
      CYL.renderMath(panel);
    }
    build();
    api.set = function (v) { Object.assign(st, v || {}); if (v && v.fn) build(); else update(); if (t0Slider && v && v.t0 != null) t0Slider.set(st.t0, true); if (hSlider && v && v.h != null) hSlider.set(st.h, true); };
    return api;
  };

  /* ======================================================================
     RECT.area — the definite integral as a signed area, and midpoint rectangles (Lesson 2)
     ====================================================================== */
  RECT.area = function (o) {
    o = Object.assign({ fns: ['vel', 'sq', 'cos', 'decay', 'recip'], fn: 'vel', a: 0, b: 6, n: 6 }, o || {});
    var st = { fn: o.fn, a: o.a, b: o.b, n: o.n }, stage = o.stage, panel = o.controls, api = {};
    var box = CYL.el('div', { class: 'rm-graph' }); stage.classList.add('rm-stage'); stage.appendChild(box);
    var ch, curve, aPos, aNeg, rects, la, lb, ro = {}, sa, sb, fdesc;
    function F() { return FNS[st.fn]; }
    function build() {
      box.innerHTML = '';
      var f = F(), r = padRange.apply(null, sampleExt(f.f, f.dom[0], f.dom[1]).concat([0.12]));
      ch = ENERGY.chart(box, { x: { label: '\\(t\\)', min: f.dom[0], max: f.dom[1] }, y: { label: '\\(f(t)\\)', min: r[0], max: r[1] }, height: 280,
        ariaLabel: 'Graph of the function with the area between the curve and the axis shaded from the lower limit to the upper limit: above the axis in green, below it in red, with optional midpoint rectangles.' });
      aPos = ch.area(function (t) { return Math.max(0, f.f(t)); }, { color: 'good', fillOpacity: 0.25 });
      aNeg = ch.area(function (t) { return Math.min(0, f.f(t)); }, { color: 'bad', fillOpacity: 0.25 });
      rects = ch.polyline([], { color: 'accent', width: 1.2, fill: 'accent', fillOpacity: 0.12 });
      curve = ch.fn(f.f, { color: 'z', width: 2.6, samples: 300 });
      la = ch.vline(0, { color: 'ink', width: 1.4, dashed: false, label: 'a' });
      lb = ch.vline(0, { color: 'ink', width: 1.4, dashed: false, label: 'b' });
      [sa, sb].forEach(function (s) { if (s) s.setRange(f.dom[0], f.dom[1]); });
      st.a = clamp(st.a, f.dom[0], f.dom[1]); st.b = clamp(st.b, f.dom[0], f.dom[1]);
      if (sa) sa.set(st.a, true); if (sb) sb.set(st.b, true);
      if (fdesc) { fdesc.innerHTML = '\\[ f(t) = ' + f.tex + ' \\qquad F(t) = ' + f.F + ' \\]'; CYL.renderMath(fdesc); }
      update();
    }
    function update() {
      var f = F(), a = st.a, b = st.b, lo = Math.min(a, b), hi = Math.max(a, b);
      aPos.set(null, { domain: [lo, hi] }); aNeg.set(null, { domain: [lo, hi] });
      la.set(a); lb.set(b);
      var n = Math.round(st.n), sum = 0, pts = [];
      if (n > 0 && hi - lo > 1e-9) {
        var dt = (b - a) / n;
        for (var i = 0; i < n; i++) {
          var t0 = a + i * dt, t1 = t0 + dt, ym = f.f(t0 + dt / 2);
          sum += ym * dt;
          pts.push([t0, 0], [t0, ym], [t1, ym], [t1, 0]);
        }
      }
      rects.set(pts);
      var exact = f.Fn(b) - f.Fn(a);
      // the areas above and below the axis, by Simpson's rule on a fine grid
      var up = 0, dn = 0, M = 600;
      for (var k = 0; k < M; k++) { var t = lo + (hi - lo) * (k + 0.5) / M, y = f.f(t) * (hi - lo) / M; if (y > 0) up += y; else dn -= y; }
      ro.exact.set(fx(exact, 3)); ro.sum.set(n > 0 ? fx(sum, 3) : '\u2014'); ro.up.set(fx(up, 3)); ro.dn.set(fx(dn, 3));
      api.state = { a: a, b: b, exact: exact, sum: sum, up: up, down: dn };
    }
    if (panel) {
      title(panel, 'Function');
      select(panel, 'Choose \\(f(t)\\)', o.fns.map(function (k) { return { value: k, label: LABELS[k] }; }), st.fn, function (v) { st.fn = v; build(); });
      fdesc = desc(panel, '');
      title(panel, 'Integral from a to b');
      ro = { exact: CYL.readout('\\(\\int_a^b f\\,dt = F(b) - F(a)\\)', { color: 'z' }), sum: CYL.readout('Sum of the rectangles', { color: 'accent' }),
        up: CYL.readout('Area above the axis', { color: 'good' }), dn: CYL.readout('Area below the axis', { color: 'bad' }) };
      rgrid(panel, [ro.exact, ro.sum, ro.up, ro.dn]);
      title(panel, 'Limits and rectangles');
      sa = slider(panel, { label: 'Lower limit \\(a\\)', min: 0, max: 6, step: 0.05, value: st.a }, function (v) { st.a = v; update(); });
      sb = slider(panel, { label: 'Upper limit \\(b\\)', min: 0, max: 6, step: 0.05, value: st.b }, function (v) { st.b = v; update(); });
      slider(panel, { label: 'Rectangles \\(n\\)', min: 0, max: 40, step: 1, value: st.n, color: 'accent', format: function (v) { return v ? String(v) : 'none'; } }, function (v) { st.n = v; update(); });
      note(panel, 'Area below the axis counts as negative: the integral is the area above minus the area below.');
      CYL.renderMath(panel);
    }
    build();
    api.set = function (v) { Object.assign(st, v || {}); if (v && v.fn) build(); else update(); };
    return api;
  };

  /* ======================================================================
     RECT.family — s(t) = ∫v dt + C; the initial condition picks C (Lesson 2)
     ====================================================================== */
  var FAMS = {
    lin: { v: '4 - 2t', s: '4t - t^2', f: function (t) { return 4 * t - t * t; }, vf: function (t) { return 4 - 2 * t; }, dom: [0, 5], C: [-6, 6] },
    cos: { v: '3\\cos t', s: '3\\sin t', f: function (t) { return 3 * Math.sin(t); }, vf: function (t) { return 3 * Math.cos(t); }, dom: [0, 2 * Math.PI], C: [-4, 4] },
    exp: { v: '6e^{-2t}', s: '-3e^{-2t}', f: function (t) { return -3 * Math.exp(-2 * t); }, vf: function (t) { return 6 * Math.exp(-2 * t); }, dom: [0, 3], C: [-2, 6] }
  };
  RECT.family = function (o) {
    o = Object.assign({ fam: 'lin', s0: 2 }, o || {});
    var st = { fam: o.fam, s0: o.s0 }, stage = o.stage, panel = o.controls, api = {};
    var box = CYL.el('div', { class: 'rm-graph' }); stage.classList.add('rm-stage'); stage.appendChild(box);
    var ch, fam = [], sel, ic, ro = {}, fdesc, sS;
    function build() {
      box.innerHTML = '';
      var F = FAMS[st.fam], e = sampleExt(F.f, F.dom[0], F.dom[1]);
      ch = ENERGY.chart(box, { x: { label: '\\(t\\) (s)', min: F.dom[0], max: F.dom[1] }, y: { label: '\\(s\\) (m)', min: e[0] + F.C[0] - 0.5, max: e[1] + F.C[1] + 0.5 }, height: 300,
        ariaLabel: 'A family of position curves that all have the same velocity: they differ only by a vertical shift, the constant of integration. The curve through the initial position is drawn bold.' });
      fam = [];
      for (var c = F.C[0]; c <= F.C[1] + 1e-9; c += 1) (function (cc) { fam.push(ch.fn(function (t) { return F.f(t) + cc - F.f(0); }, { color: 'muted', width: 1, samples: 200 })); })(c);
      sel = ch.fn(function () { return NaN; }, { color: 'z', width: 3, samples: 300 });
      ic = ch.marker([0, 0], { color: 'z', r: 5 });
      if (sS) { sS.setRange(F.C[0], F.C[1]); st.s0 = clamp(st.s0, F.C[0], F.C[1]); sS.set(st.s0, true); }
      if (fdesc) { fdesc.innerHTML = '\\[ v = ' + F.v + ' \\quad\\Rightarrow\\quad s = \\int v\\,dt = ' + F.s + ' + C \\]'; CYL.renderMath(fdesc); }
      update();
    }
    function update() {
      var F = FAMS[st.fam], C = st.s0 - F.f(0);
      sel.setFn(function (t) { return F.f(t) + C; });
      ic.set([0, st.s0]);
      ro.C.set(fx(C, 2)); ro.s0.set(fx(st.s0, 2) + '\u00a0m');
      api.state = { C: C, s0: st.s0 };
    }
    if (panel) {
      title(panel, 'Velocity');
      select(panel, 'Choose \\(v(t)\\)', [{ value: 'lin', label: 'v = 4 − 2t' }, { value: 'cos', label: 'v = 3 cos t' }, { value: 'exp', label: 'v = 6e^(−2t)' }], st.fam, function (v) { st.fam = v; build(); });
      fdesc = desc(panel, '');
      title(panel, 'Initial condition');
      ro = { s0: CYL.readout('\\(s\\) at \\(t = 0\\)', { color: 'z' }), C: CYL.readout('Constant \\(C\\)') };
      rgrid(panel, [ro.s0, ro.C]);
      sS = slider(panel, { label: 'Start at \\(s_0\\)', min: -6, max: 6, step: 0.5, value: st.s0, unit: 'm', color: 'z' }, function (v) { st.s0 = v; update(); });
      note(panel, 'Every gray curve has the same slope at every instant, so the same velocity. Only the starting position tells them apart.');
      CYL.renderMath(panel);
    }
    build();
    api.set = function (v) { Object.assign(st, v || {}); if (v && v.fam) build(); else update(); };
    return api;
  };

  /* ======================================================================
     RECT.asGraph — a draggable a–s graph and the v–s graph from v dv = a ds (Lesson 6)
     ====================================================================== */
  RECT.asGraph = function (o) {
    o = Object.assign({ pts: [[0, 2], [50, 2], [100, 0], [150, -1.5], [200, -1.5]], v0: 0, snap: 0.25, range: [-4, 4] }, o || {});
    var st = { pts: o.pts.map(function (q) { return q.slice(); }), v0: o.v0, sq: 100 }, stage = o.stage, panel = o.controls, api = {};
    var b1 = CYL.el('div', { class: 'rm-graph' }), b2 = CYL.el('div', { class: 'rm-graph' });
    stage.classList.add('rm-stage'); stage.appendChild(b1); stage.appendChild(b2);
    var S1 = st.pts[st.pts.length - 1][0];
    var c1 = ENERGY.chart(b1, { x: { label: '\\(s\\) (m)', min: 0, max: S1 }, y: { label: '\\(a\\) (m/s²)', min: o.range[0], max: o.range[1] }, height: 190,
      ariaLabel: 'Acceleration against position, made of straight segments whose corner points can be dragged up and down. The area under it up to the chosen position is shaded.' });
    var area = c1.area(function () { return 0; }, { color: 'bad', fillOpacity: 0.22 }), aLine = c1.polyline([], { color: 'bad', width: 2.4 }), cur1 = c1.vline(0, { color: 'muted', width: 1.2 });
    var c2 = ENERGY.chart(b2, { x: { label: '\\(s\\) (m)', min: 0, max: S1 }, y: { label: '\\(v\\) (m/s)', min: 0, max: 10 }, height: 170,
      ariaLabel: 'Velocity against position, from one half of v squared minus v zero squared equals the area under the acceleration–position graph.' });
    var vLine = c2.polyline([], { color: 'good', width: 2.4 }), cur2 = c2.vline(0, { color: 'muted', width: 1.2 }), mk = c2.marker([0, 0], { color: 'good', r: 4, ring: false });
    var stopLine = c2.vline(null, { color: 'warn', width: 1.2, label: 'v = 0' });
    var ro = {};
    function aAt(s) {
      var P = st.pts; s = clamp(s, 0, S1);
      for (var k = 1; k < P.length; k++) if (s <= P[k][0] + 1e-12) { var u = (s - P[k - 1][0]) / (P[k][0] - P[k - 1][0]); return P[k - 1][1] + u * (P[k][1] - P[k - 1][1]); }
      return P[P.length - 1][1];
    }
    function areaTo(s) {   // ∫0^s a ds, exact for straight segments
      var P = st.pts, A = 0;
      for (var k = 1; k < P.length; k++) {
        var s0 = P[k - 1][0], s1 = Math.min(P[k][0], s); if (s1 <= s0) break;
        A += 0.5 * (aAt(s0) + aAt(s1)) * (s1 - s0);
      }
      return A;
    }
    var stopS = null;
    function vAt(s) { var q = st.v0 * st.v0 + 2 * areaTo(s); return q > 0 ? Math.sqrt(q) : 0; }
    function update(rescale) {
      aLine.set(st.pts);
      area.set(aAt, { domain: [0, st.sq], samples: 200 });
      cur1.set(st.sq); cur2.set(st.sq);
      // the particle stops where v² reaches zero (it cannot move past it with the same sign of v)
      stopS = null;
      var pts = [], vmax = 1;
      for (var i = 0; i <= 400; i++) {
        var s = S1 * i / 400, q = st.v0 * st.v0 + 2 * areaTo(s);
        if (q <= 0 && stopS == null && s > 0) { stopS = s; }
        var v = stopS != null ? NaN : Math.sqrt(Math.max(0, q));
        if (isFinite(v)) { pts.push([s, v]); vmax = Math.max(vmax, v); }
      }
      if (rescale !== false) c2.setAxes({ y: { min: 0, max: Math.ceil(vmax * 1.12) } });
      vLine.set(pts); stopLine.set(stopS);
      var sq = st.sq, reached = stopS == null || sq < stopS, vq = reached ? vAt(sq) : 0;
      mk.set(reached ? [sq, vq] : null);
      ro.a.set(fx(aAt(sq), 2) + '\u00a0m/s²'); ro.A.set(fx(areaTo(sq), 1) + '\u00a0m²/s²');
      ro.v.set(reached ? fx(vq, 2) + '\u00a0m/s' : 'stopped at ' + fx(stopS, 1) + '\u00a0m');
      api.state = { s: sq, a: aAt(sq), area: areaTo(sq), v: vq, stop: stopS };
    }
    var h = dragHandles(c1, st.pts, { color: 'bad', snap: o.snap, range: o.range, unit: 'm/s²', label: function (i) { return 'a at s = ' + fmt(st.pts[i][0]) + ' m'; },
      onChange: function (i, y, done) { st.pts[i][1] = y; update(true); } });
    if (panel) {
      title(panel, 'At position s');
      ro = { a: CYL.readout('Acceleration \\(a\\)', { color: 'bad' }), A: CYL.readout('Area \\(\\int_0^s a\\,ds\\)', { color: 'bad' }), v: CYL.readout('Velocity \\(v\\)', { color: 'good' }) };
      rgrid(panel, [ro.a, ro.A, ro.v]);
      slider(panel, { label: 'Position \\(s\\)', min: 0, max: S1, step: 1, value: st.sq, unit: 'm' }, function (v) { st.sq = v; update(false); });
      slider(panel, { label: 'Initial velocity \\(v_0\\)', min: 0, max: 20, step: 0.5, value: st.v0, unit: 'm/s', color: 'good' }, function (v) { st.v0 = v; update(true); });
      note(panel, 'Drag the red points, or tab to one and use the arrow keys. From \\(v\\,dv = a\\,ds\\): \\(\\tfrac12 v^2 - \\tfrac12 v_0^2\\) equals the shaded area.');
      CYL.renderMath(panel);
    }
    update(true);
    api.handles = h;
    api.set = function (v) { Object.assign(st, v || {}); if (v && v.pts) h.set(st.pts); update(true); };
    return api;
  };

  /* ======================================================================
     RECT.tackle — a load held by n parts of one cord: n s_B + s_A = l_T (Lesson 7)
     ====================================================================== */
  RECT.tackle = function (o) {
    o = Object.assign({ n: 2, vA: 0.6, T: 3 }, o || {});
    var st = { n: o.n, vA: o.vA }, stage = o.stage, panel = o.controls, api = {};
    var p = CYL2D.plane(stage, { xRange: [-1.6, 1.9], yRange: [-3.35, 0.35], grid: 'none', axes: false, maxHeight: 460,
      ariaLabel: 'A block and tackle: a load hangs from movable pulleys held by several vertical parts of one cord, which runs over fixed pulleys at the ceiling and down to its free end A. The positions of the load and of the end A are measured down from the ceiling.' });
    ceiling(p, -1.3, 1.7, 0.1, 0.22);
    p.line([-1.4, 0.1], [1.8, 0.1], { color: 'muted', width: 1, dashed: true });
    p.label([1.8, 0.1], '\\text{datum}', { color: 'muted', anchor: 'ne', gap: 4 });
    var gMove = p.group();
    var ro = {}, sB0 = 2.2, sA0 = 1.2, d = 0.26, r = 0.11;
    function geom(t) {
      var vB = -st.vA / st.n;
      return { sA: sA0 + st.vA * t, sB: sB0 + vB * t, vB: vB };
    }
    function draw(t) {
      var g = geom(t), n = st.n;
      gMove.clear();
      var x0 = -0.1 - (n - 1) * d / 2, yTop = -0.25, yBot = -g.sB + 0.12 + r, blockY = -g.sB;
      var xs = []; for (var i = 0; i < n; i++) xs.push(x0 + i * d); xs.push(xs[n - 1] + 2.2 * d);
      // vertical parts: 0..n-1 hold the load, n is the free part down to A
      for (var k = 0; k < n; k++) gMove.line([xs[k], yTop], [xs[k], yBot], { color: 'muted', width: 2 });
      gMove.line([xs[n], yTop], [xs[n], -g.sA], { color: 'muted', width: 2 });
      // turns: between parts k and k+1, at the top (fixed pulley) or the bottom (movable pulley)
      for (var k2 = 0; k2 < n; k2++) {
        var top = ((n - 1 - k2) % 2) === 0, cx = (xs[k2] + xs[k2 + 1]) / 2, rw = (xs[k2 + 1] - xs[k2]) / 2;
        var cy = top ? yTop : yBot;
        wheel(gMove, [cx, cy], rw);
        if (top) gMove.line([cx, cy], [cx, 0.1], { color: 'ink', width: 2.4 });
        else gMove.line([cx, cy], [cx, blockY + 0.12], { color: 'ink', width: 2.4 });
      }
      // the dead end of the cord: at the ceiling when n is even, on the load when n is odd
      if (n % 2 === 0) gMove.line([xs[0], yTop], [xs[0], 0.1], { color: 'muted', width: 2 });
      else gMove.line([xs[0], yBot], [xs[0], blockY + 0.12], { color: 'muted', width: 2 });
      var lw = Math.max(0.6, (n - 1) * d + 0.36);
      gMove.polyline(blockPts([xs[0] + (n - 1) * d / 2, blockY - 0.12], lw, 0.48), { closed: true, color: 'ink', width: 1.6, fill: 'warn', fillOpacity: 0.35 });
      gMove.label([xs[0] + (n - 1) * d / 2, blockY - 0.12], 'B', { color: 'ink' });
      gMove.polyline(blockPts([xs[n], -g.sA - 0.1], 0.2, 0.2), { closed: true, color: 'ink', width: 1.6, fill: 'accent', fillOpacity: 0.4 });
      gMove.label([xs[n] + 0.12, -g.sA - 0.1], 'A', { color: 'ink', anchor: 'e', gap: 6 });
      // position coordinates from the datum
      var xd = 1.45;
      gMove.line([xd, 0.1], [xd, -g.sA], { color: 'accent', width: 1.6, arrow: true, label: 's_A', labelAt: 0.5, labelSide: 'right' });
      gMove.line([-1.32, 0.1], [-1.32, blockY], { color: 'warn', width: 1.6, arrow: true, label: 's_B', labelAt: 0.5, labelSide: 'left' });
      gMove.line([xd - 0.05, -g.sA], [xs[n] + 0.12, -g.sA], { color: 'accent', width: 1, dashed: true });
      gMove.line([-1.27, blockY], [xs[0] + (n - 1) * d / 2 - lw / 2, blockY], { color: 'warn', width: 1, dashed: true });
      // velocities
      var K = 0.9;
      if (Math.abs(st.vA) > 1e-9) gMove.line([xs[n] + 0.25, -g.sA - 0.1], [xs[n] + 0.25, -g.sA - 0.1 - st.vA * K], { color: 'good', width: 2.6, arrow: true, label: 'v_A', labelAt: 1, labelSide: 'right' });
      if (Math.abs(g.vB) > 1e-9) gMove.line([xs[0] + (n - 1) * d / 2 - lw / 2 - 0.12, blockY - 0.12], [xs[0] + (n - 1) * d / 2 - lw / 2 - 0.12, blockY - 0.12 - g.vB * K], { color: 'good', width: 2.6, arrow: true, label: 'v_B', labelAt: 1, labelSide: 'left' });
      if (ro.sA) {
        ro.sA.set(fx(g.sA, 3) + '\u00a0m'); ro.sB.set(fx(g.sB, 3) + '\u00a0m'); ro.vB.set(fx(g.vB, 3) + '\u00a0m/s');
        ro.l.set(fx(n * g.sB + g.sA, 3) + '\u00a0m');
      }
      api.state = { sA: g.sA, sB: g.sB, vA: st.vA, vB: g.vB, n: n };
    }
    function dur() { return Math.min(o.T, st.vA > 0 ? (3.1 - sA0) / st.vA : st.vA < 0 ? (sA0 - 0.35) / -st.vA : o.T, st.vA < 0 ? (sB0 - 0.75) / (-st.vA / st.n) : o.T); }
    if (panel) {
      title(panel, 'Cord');
      select(panel, 'Parts of cord holding the load', [{ value: 2, label: '2 (one movable pulley)' }, { value: 3, label: '3' }, { value: 4, label: '4 (two movable pulleys)' }], st.n,
        function (v) { st.n = +v; pl.refresh(); });
      title(panel, 'Positions and velocities');
      ro = { sA: CYL.readout('\\(s_A\\)', { color: 'accent' }), sB: CYL.readout('\\(s_B\\)', { color: 'warn' }), vB: CYL.readout('\\(v_B\\)', { color: 'good' }), l: CYL.readout('\\(n\\,s_B + s_A\\) (constant)') };
      rgrid(panel, [ro.sA, ro.sB, ro.vB, ro.l]);
      slider(panel, { label: 'Pull the end down at \\(v_A\\)', min: -0.6, max: 1.2, step: 0.05, value: st.vA, unit: 'm/s', color: 'good' }, function (v) { st.vA = v; pl.refresh(); });
      note(panel, 'Down is positive. The constant parts of the cord around the pulleys are left out of the length.');
      CYL.renderMath(panel);
    }
    var pl = player(stage, dur, draw, 1);
    api.plane = p; api.player = pl;
    api.set = function (v) { Object.assign(st, v || {}); pl.refresh(); };
    return api;
  };

  /* ======================================================================
     RECT.ropeLift — a truck pulls a cord over a pulley at height h and lifts a crate (Lesson 7)
       l_T = (h − y_B) + √(x_A² + h²)  ⇒  v_B = x_A v_A / √(x_A² + h²)
     ====================================================================== */
  RECT.ropeLift = function (o) {
    o = Object.assign({ h: 8, x0: 2, vA: 2, T: 6 }, o || {});
    var st = { h: o.h, vA: o.vA }, stage = o.stage, panel = o.controls, api = {};
    var p = CYL2D.plane(stage, { xRange: [-4, 16], yRange: [-1.2, 10], grid: 'none', axes: false, maxHeight: 400,
      ariaLabel: 'A cord runs from a crate on the ground up over a pulley at height h and down to the back of a truck. As the truck drives away, the crate rises.' });
    ground(p, -4, 16, 0, 0.5);
    var gS = p.group(), gM = p.group(), ro = {};
    function drawStatic() {
      gS.clear();
      gS.line([0, st.h], [0, st.h + 0.9], { color: 'ink', width: 3 });
      gS.line([-1.2, st.h + 0.9], [1.2, st.h + 0.9], { color: 'ink', width: 3 });
      wheel(gS, [0, st.h], 0.3);
      gS.label([0.3, st.h], 'P', { color: 'ink', anchor: 'e', gap: 6 });
      gS.line([-2.6, 0], [-2.6, st.h], { color: 'muted', width: 1.4, arrow: 'both', label: 'h', labelAt: 0.5, labelSide: 'left' });
    }
    function geom(t) {
      var x = o.x0 + st.vA * t, L = Math.hypot(x, st.h), L0 = Math.hypot(o.x0, st.h), y = L - L0;       // crate starts on the ground
      var vB = x * st.vA / L, aB = st.vA * st.vA * st.h * st.h / Math.pow(L, 3);
      return { x: x, y: y, vB: vB, aB: aB, L: L };
    }
    function draw(t) {
      var g = geom(t);
      gM.clear();
      var cw = 1.2, top = g.y + cw;
      gM.line([0, top], [0, st.h - 0.3], { color: 'muted', width: 2 });
      gM.line([0.3, st.h], [g.x, 0.9], { color: 'muted', width: 2 });
      gM.polyline(blockPts([0, g.y + cw / 2], cw, cw), { closed: true, color: 'ink', width: 1.6, fill: 'warn', fillOpacity: 0.35 });
      gM.label([0, g.y + cw / 2], 'B', { color: 'ink' });
      // truck: drawn to scale, back at x
      var tx = g.x;
      gM.polyline([[tx, 0.35], [tx + 4.2, 0.35], [tx + 4.2, 2.2], [tx + 3.1, 2.2], [tx + 2.7, 1.5], [tx, 1.5]], { closed: true, color: 'ink', width: 1.6, fill: 'accent', fillOpacity: 0.4 });
      gM.circle({ center: [tx + 0.8, 0.35], r: 0.35, color: 'ink', fill: 'ink', fillOpacity: 1 });
      gM.circle({ center: [tx + 3.4, 0.35], r: 0.35, color: 'ink', fill: 'ink', fillOpacity: 1 });
      gM.label([tx + 0.3, 1.1], 'A', { color: 'ink', anchor: 'e', gap: 4 });
      gM.line([0, -0.6], [g.x, -0.6], { color: 'accent', width: 1.4, arrow: true, label: 'x_A', labelAt: 0.5, labelSide: 'right' });
      gM.line([tx + 4.4, 1.2], [tx + 4.4 + st.vA * 0.8, 1.2], { color: 'good', width: 2.6, arrow: true, label: 'v_A', labelAt: 1, labelSide: 'beyond' });
      if (g.vB > 1e-6) gM.line([0.9, g.y + cw / 2], [0.9, g.y + cw / 2 + g.vB * 0.8], { color: 'good', width: 2.6, arrow: true, label: 'v_B', labelAt: 1, labelSide: 'right' });
      if (ro.x) { ro.x.set(fx(g.x, 2) + '\u00a0m'); ro.y.set(fx(g.y, 2) + '\u00a0m'); ro.v.set(fx(g.vB, 3) + '\u00a0m/s'); ro.a.set(fx(g.aB, 3) + '\u00a0m/s²'); }
      api.state = g;
    }
    function dur() { var xmax = 11; var t1 = (xmax - o.x0) / Math.max(0.1, st.vA); var tH = 0; /* stop before the crate reaches the pulley */
      var L0 = Math.hypot(o.x0, st.h), xT = Math.sqrt(Math.pow(L0 + st.h - 1.6, 2) - st.h * st.h); tH = (xT - o.x0) / Math.max(0.1, st.vA); return Math.min(t1, tH, o.T * 3); }
    if (panel) {
      title(panel, 'Now');
      ro = { x: CYL.readout('Truck \\(x_A\\)', { color: 'accent' }), y: CYL.readout('Crate \\(y_B\\)', { color: 'warn' }), v: CYL.readout('Crate \\(v_B\\)', { color: 'good' }), a: CYL.readout('Crate \\(a_B\\)', { color: 'bad' }) };
      rgrid(panel, [ro.x, ro.y, ro.v, ro.a]);
      title(panel, 'Change the motion');
      slider(panel, { label: 'Truck speed \\(v_A\\)', min: 0.5, max: 4, step: 0.1, value: st.vA, unit: 'm/s', color: 'good' }, function (v) { st.vA = v; pl.refresh(); });
      slider(panel, { label: 'Pulley height \\(h\\)', min: 5, max: 9, step: 0.5, value: st.h, unit: 'm' }, function (v) { st.h = v; drawStatic(); pl.refresh(); });
      note(panel, 'The truck drives at a constant speed, yet the crate speeds up: \\(v_B = x_A v_A/\\sqrt{x_A^2 + h^2}\\) grows with \\(x_A\\).');
      CYL.renderMath(panel);
    }
    drawStatic();
    var pl = player(stage, dur, draw, 1);
    api.plane = p; api.player = pl; api.geom = geom;
    api.set = function (v) { Object.assign(st, v || {}); drawStatic(); pl.refresh(); };
    return api;
  };

  /* ======================================================================
     RECT.relative — two cars on a straight road: s_B/A = s_B − s_A (Lesson 8)
     opts: A: {s0, v0, ac}, B: {s0, v0, ac}, T, frame: 'ground' | 'A'
     ====================================================================== */
  RECT.relative = function (o) {
    o = Object.assign({ A: { s0: 0, v0: 20, ac: 0 }, B: { s0: -60, v0: 15, ac: 2 }, T: 12, frame: 'ground', range: null }, o || {});
    var st = { A: Object.assign({}, o.A), B: Object.assign({}, o.B), frame: o.frame }, stage = o.stage, panel = o.controls, api = {};
    stage.classList.add('rm-stage');
    var plDiv = CYL.el('div', { class: 'rm-track' }), gDiv = CYL.el('div', { class: 'rm-graphs' });
    stage.appendChild(plDiv); stage.appendChild(gDiv);
    var p, gS, gM, R, span;
    function S(c, t) { return c.s0 + c.v0 * t + 0.5 * c.ac * t * t; }
    function V(c, t) { return c.v0 + c.ac * t; }
    function ranges() {
      var lo = Infinity, hi = -Infinity;
      for (var i = 0; i <= 100; i++) { var t = o.T * i / 100; [S(st.A, t), S(st.B, t)].forEach(function (x) { lo = Math.min(lo, x); hi = Math.max(hi, x); }); }
      return { abs: padRange(lo, hi, 0.06), rel: (function () { var l2 = Infinity, h2 = -Infinity; for (var i = 0; i <= 100; i++) { var t = o.T * i / 100, r = S(st.B, t) - S(st.A, t); l2 = Math.min(l2, r); h2 = Math.max(h2, r); } return padRange(l2, h2, 0.15); })() };
    }
    function buildPlane() {
      if (p) { p.destroy(); plDiv.innerHTML = ''; }
      var rg = ranges(); R = st.frame === 'A' ? rg.rel : rg.abs; span = R[1] - R[0];
      p = CYL2D.plane(plDiv, { xRange: [R[0], R[1]], yRange: [-span * 0.13, span * 0.16], grid: 'none', axes: false, maxHeight: 240,
        ariaLabel: 'Two cars on parallel lanes of a straight road, A in the lower lane and B in the upper one, with their positions measured from a fixed point O, or from car A when the view moves with A.' });
      gS = p.group(); gM = p.group();
    }
    var chS, chV, cS = {}, cV = {}, cur = [], mk = {};
    function buildCharts() {
      gDiv.innerHTML = '';
      var rg = ranges(), vlo = Infinity, vhi = -Infinity;
      [V(st.A, 0), V(st.A, o.T), V(st.B, 0), V(st.B, o.T), V(st.B, 0) - V(st.A, 0), V(st.B, o.T) - V(st.A, o.T)].forEach(function (x) { vlo = Math.min(vlo, x); vhi = Math.max(vhi, x); });
      var b1 = CYL.el('div', { class: 'rm-graph' }), b2 = CYL.el('div', { class: 'rm-graph' }); gDiv.appendChild(b1); gDiv.appendChild(b2);
      var slo = Math.min(rg.abs[0], rg.rel[0]), shi = Math.max(rg.abs[1], rg.rel[1]);
      chS = ENERGY.chart(b1, { x: { label: '\\(t\\) (s)', min: 0, max: o.T }, y: { label: 'position (m)', min: slo, max: shi }, height: 160,
        ariaLabel: 'Positions of car A and car B against time, and the position of B relative to A, their difference.',
        legend: [{ label: '\\(s_A\\)', color: 'accent', line: true }, { label: '\\(s_B\\)', color: 'warn', line: true }, { label: '\\(s_{B/A} = s_B - s_A\\)', color: 't', line: true, dashed: true }] });
      chV = ENERGY.chart(b2, { x: { label: '\\(t\\) (s)', min: 0, max: o.T }, y: { label: 'velocity (m/s)', min: padRange(vlo, vhi, 0.1)[0], max: padRange(vlo, vhi, 0.1)[1] }, height: 150,
        ariaLabel: 'Velocities of car A and car B against time, and the velocity of B relative to A.',
        legend: [{ label: '\\(v_A\\)', color: 'accent', line: true }, { label: '\\(v_B\\)', color: 'warn', line: true }, { label: '\\(v_{B/A}\\)', color: 't', line: true, dashed: true }] });
      cS.A = chS.fn(function (t) { return S(st.A, t); }, { color: 'accent', width: 2.4 }); cS.B = chS.fn(function (t) { return S(st.B, t); }, { color: 'warn', width: 2.4 });
      cS.R = chS.fn(function (t) { return S(st.B, t) - S(st.A, t); }, { color: 't', width: 2, dashed: true });
      cV.A = chV.fn(function (t) { return V(st.A, t); }, { color: 'accent', width: 2.4 }); cV.B = chV.fn(function (t) { return V(st.B, t); }, { color: 'warn', width: 2.4 });
      cV.R = chV.fn(function (t) { return V(st.B, t) - V(st.A, t); }, { color: 't', width: 2, dashed: true });
      cur = [chS.vline(0, { color: 'muted', width: 1.2 }), chV.vline(0, { color: 'muted', width: 1.2 })];
      mk = { s: chS.marker([0, 0], { color: 't', r: 4, ring: false }), v: chV.marker([0, 0], { color: 't', r: 4, ring: false }) };
    }
    var ro = {};
    function passTimes() {   // s_B/A = 0
      var a = 0.5 * (st.B.ac - st.A.ac), b = st.B.v0 - st.A.v0, c = st.B.s0 - st.A.s0, out = [];
      if (Math.abs(a) < 1e-12) { if (Math.abs(b) > 1e-12) out.push(-c / b); }
      else { var D = b * b - 4 * a * c; if (D >= 0) { out.push((-b - Math.sqrt(D)) / (2 * a)); out.push((-b + Math.sqrt(D)) / (2 * a)); } }
      return out.filter(function (t) { return t > 1e-9 && t <= o.T; }).sort(function (x, y) { return x - y; });
    }
    function car(at, y, color, lab) {
      var L = span * 0.07, H = span * 0.036;
      gM.polyline([[at - L / 2, y], [at + L / 2, y], [at + L / 2, y + H * 0.6], [at + L * 0.22, y + H * 0.62], [at + L * 0.08, y + H], [at - L * 0.3, y + H], [at - L / 2, y + H * 0.6]],
        { closed: true, color: 'ink', width: 1.4, fill: color, fillOpacity: 0.55 });
      gM.label([at - L * 0.12, y + H * 0.42], lab, { color: 'ink' });
    }
    function draw(t) {
      var sA = S(st.A, t), sB = S(st.B, t), off = st.frame === 'A' ? sA : 0;
      gS.clear(); gM.clear();
      var yA = -span * 0.048, yB = span * 0.022;
      // the road: lane lines, and distance marks every niceStep that slide past when seen from A
      gS.line([R[0], span * 0.008], [R[1], span * 0.008], { color: 'grid', width: 1.2, dashed: true });
      gS.line([R[0], -span * 0.06], [R[1], -span * 0.06], { color: 'ink', width: 1.6 });
      gS.line([R[0], span * 0.075], [R[1], span * 0.075], { color: 'ink', width: 1.6 });
      var stp = niceStep(span, 8);
      for (var x = Math.ceil((R[0] + off) / stp) * stp; x <= R[1] + off; x += stp) {
        gS.line([x - off, -span * 0.06], [x - off, -span * 0.075], { color: 'muted', width: 1 });
        gS.label([x - off, -span * 0.08], CYL.fmt(+x.toPrecision(10)), { color: 'muted', anchor: 's', gap: 2 });
      }
      var Ox = -off;
      if (Ox >= R[0] && Ox <= R[1]) { gS.circle({ center: [Ox, -span * 0.06], r: span * 0.005, color: 'ink', fill: 'ink', fillOpacity: 1 }); gS.label([Ox, -span * 0.06], 'O', { color: 'ink', anchor: 'nw', gap: 4 }); }
      car(sA - off, yA, 'accent', 'A'); car(sB - off, yB, 'warn', 'B');
      // s_B/A from A to B
      var rel = sB - sA;
      if (Math.abs(rel) > span * 0.01) { gM.line([sA - off, span * 0.105], [sB - off, span * 0.105], { color: 't', width: 1.6, arrow: true, label: 's_{B/A}', labelAt: 0.5, labelSide: rel > 0 ? 'left' : 'right' }); gM.line([sA - off, -span * 0.012], [sA - off, span * 0.115], { color: 't', width: 1, dashed: true }); }
      cur.forEach(function (c) { c.set(t); });
      mk.s.set([t, rel]); mk.v.set([t, V(st.B, t) - V(st.A, t)]);
      if (ro.r) { ro.r.set(fx(rel, 1) + '\u00a0m'); ro.v.set(fx(V(st.B, t) - V(st.A, t), 2) + '\u00a0m/s'); ro.a.set(fx(st.B.ac - st.A.ac, 2) + '\u00a0m/s²'); }
      api.state = { t: t, sA: sA, sB: sB, rel: rel, vrel: V(st.B, t) - V(st.A, t), arel: st.B.ac - st.A.ac };
    }
    function recompute() {
      buildPlane(); buildCharts();
      var pt = passTimes();
      if (ro.pass) ro.pass.set(pt.length ? pt.map(function (t) { return fx(t, 2); }).join(', ') + '\u00a0s' : 'not in ' + fmt(o.T) + ' s');
      if (pl) pl.refresh(); else draw(0);
    }
    if (panel) {
      title(panel, 'View');
      select(panel, 'Seen from', [{ value: 'ground', label: 'the ground (fixed point O)' }, { value: 'A', label: 'car A (axis moving with A)' }], st.frame, function (v) { st.frame = v; recompute(); });
      title(panel, 'B relative to A');
      ro = { r: CYL.readout('\\(s_{B/A}\\)', { color: 't' }), v: CYL.readout('\\(v_{B/A}\\)', { color: 't' }), a: CYL.readout('\\(a_{B/A}\\)', { color: 't' }), pass: CYL.readout('\\(B\\) level with \\(A\\) at') };
      rgrid(panel, [ro.r, ro.v, ro.a, ro.pass]);
      if (o.sliders !== false) {
        title(panel, 'Change the motion');
        [['A', 'v0', 'Initial velocity of \\(A\\)', 0, 30, 1, 'm/s', 'accent'], ['A', 'ac', 'Acceleration of \\(A\\)', -3, 3, 0.25, 'm/s²', 'accent'],
         ['B', 's0', 'Starting position of \\(B\\)', -100, 100, 5, 'm', 'warn'], ['B', 'v0', 'Initial velocity of \\(B\\)', 0, 30, 1, 'm/s', 'warn'],
         ['B', 'ac', 'Acceleration of \\(B\\)', -3, 3, 0.25, 'm/s²', 'warn']].forEach(function (d) {
          slider(panel, { label: d[2], min: d[3], max: d[4], step: d[5], value: st[d[0]][d[1]], unit: d[6], color: d[7] }, function (v) { st[d[0]][d[1]] = v; recompute(); });
        });
      }
      note(panel, 'A starts at O. The cars are drawn longer than to scale. Seen from A, the road and O slide backward and only the relative motion of B remains.');
      CYL.renderMath(panel);
    }
    var pl = null;
    recompute();
    pl = player(stage, function () { return o.T; }, draw, 1);
    api.player = pl;
    api.passTimes = passTimes;
    api.set = function (v) { if (v.A) Object.assign(st.A, v.A); if (v.B) Object.assign(st.B, v.B); if (v.frame) st.frame = v.frame; recompute(); };
    return api;
  };

  window.RECT = RECT;
})(window, document);
