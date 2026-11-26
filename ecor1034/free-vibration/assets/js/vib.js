/*!
 * vib.js — VIB: free undamped vibration of a single-degree-of-freedom system for the Free Vibration module:
 * harmonic motions from initial conditions, the simple pendulum (exact and small-angle), animated scenes (a block on
 * a horizontal spring, a block hanging from a vertical spring, two springs in parallel or in series, a pendulum, a
 * particle on a line) with synced graphs, the reference circle, and the "guess and check" figure of Lesson 3.
 * Classic script (IIFE) that attaches ONE global: VIB. Requires CYL (cyl-core.js), CYL2D (cyl-2d.js), ENERGY
 * (energy.js: charts, springs, hatching, energy bars and the transport) and MOMENTUM (momentum.js: the player).
 *
 * Color code, the same in every figure, graph, readout and formula (TeX \colPos, \colVel, \colAcc, \colSpr):
 *   displacement x, y, θ ..... 'z' (blue)        velocity ..................... 'good' (green)
 *   acceleration ............. 'bad' (red)       spring force F_s, V_e ........ 't' (violet)
 *   weight W, V_g ............ 'z' (blue)
 *   reference circle: the rotating vector and its angle 'warn' (amber); components A and B 'accent' and 't'.
 *
 * VIB.lin(wn, x0, v0) -> motion x = A sin ωn t + B cos ωn t = C sin(ωn t + φ), with B = x0, A = v0/ωn:
 *   {kind: 'lin', wn, x0, v0, A, B, C, phi, tau, f, at(t) -> {t, x, v, a}}
 * VIB.pend({g, L, th0, w0}) -> the exact pendulum θ'' = −(g/L) sin θ (RK4), with its small-angle twin in .lin:
 *   {kind: 'pend', wn, tau (exact), tauLin, thMax, lin, at(t) -> {t, x: θ, v: θ', a: θ''}}
 *
 * VIB.figure(opts) -> controller: an animated scene, graphs under it, a transport row and a panel of readouts,
 *   energy bars and sliders.
 *   opts: stage, controls, aria (REQUIRED), scene: 'h' | 'v' | 'springs' | 'pend' | 'dot',
 *     params {k, m, x0, v0, k1, k2, arr: 'parallel' | 'series', L, th0 (degrees), w0, g, wn, f, C, phi (degrees)},
 *     sliders [{key, label, min, max, step, value, unit, color, format}], select {key, label, options} (a choice
 *     that is a parameter, e.g. arr), model(P) -> {wn, x0, v0, …} (overrides the scene's own),
 *     graphs ['x', 'v', 'a'] (against t) and 'vx', 'ax' (against x), names {x, v, a} (TeX), units,
 *     show {v, a, F, W, dim, ghost, fbd}, toggles ['v', 'a', 'F', 'ghost'], readouts (keys of RO below),
 *     periods (3), maxT (12 s), view {amp, L0, dstMax, Lmax} (fixed drawing scale), ranges {x: [lo, hi], …},
 *     bars (energy bars), chartHeight (120), panelTitle, slidersTitle, note, extra(panel, fig), onUpdate(q, fig),
 *     speed, autoplay.
 *   controller: {plane, charts, motion(), info(), params, setParams(p), player, redraw(), destroy()}
 *
 * VIB.circle(opts) -> the reference circle: a vector of length C turning at ωn, and the curve its projection
 *   traces against time, in one plane so that the two line up. opts: stage, controls, aria, mode: 'shm'
 *   (sliders C, f, φ) | 'ic' (sliders x0, v0, ωn: the components A sin ωn t and B cos ωn t and their sum),
 *   params, sliders, window (s of time shown), view {amp}, readouts.
 * VIB.guess(opts) -> "guess and check": a trial function x(t) put into m ẍ = −k x. Two curves, m ẍ and −k x,
 *   which must coincide at every instant for the trial to be a solution. opts: stage, controls, aria, params
 *   {k, m, p, fn: 'cos' | 'sin' | 'exp' | 'sq'}.
 */
(function (window, document) {
  'use strict';
  if (window.VIB) return;
  var CYL = window.CYL, CYL2D = window.CYL2D, ENERGY = window.ENERGY;
  var VIB = { version: '1.0.0', G: 9.81 };
  var PI = Math.PI, TAU = 2 * Math.PI, DEG = PI / 180;

  /* ---------- helpers ---------- */
  function report(msg) { try { if (CYL && CYL.error) CYL.error('VIB: ' + msg); else console.error('VIB: ' + msg); } catch (e) { /* ignore */ } }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function fx(x, d) { return CYL.fmtFixed(Math.abs(x) < 1e-12 ? 0 : x, d); }
  function fmt(x, s) { return CYL.fmt(Math.abs(x) < 1e-12 ? 0 : x, s || 4); }
  function niceStep(span, n) {
    var raw = span / Math.max(1, n || 8), mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
  }
  function title(panel, text) { panel.appendChild(CYL.el('p', { class: 'viz-title', text: text })); }
  function rgrid(panel, ros) { var g = CYL.el('div', { class: 'readout-grid', 'aria-live': 'off' }, ros.map(function (r) { return r.el; })); panel.appendChild(g); return g; }
  function slider(panel, s, onInput) {
    var sl = CYL.slider({ label: s.label, min: s.min, max: s.max, step: s.step, value: s.value, unit: s.unit || '', color: s.color, format: s.format, onInput: onInput });
    panel.appendChild(sl.el); return sl;
  }
  function note(panel, html) { var n = CYL.el('p', { class: 'mf-note', html: html || '' }); panel.appendChild(n); if (CYL.renderMath) CYL.renderMath(n); return n; }
  function chips(panel, items) {
    var row = CYL.el('div', { class: 'chip-row', role: 'group', 'aria-label': 'Show' }), out = {};
    items.forEach(function (it) { var t = CYL.toggle(it); out[it.key || it.label] = t; row.appendChild(t.el); });
    panel.appendChild(row); return out;
  }
  function player(stage, dur, onTime, speed, autoplay) {
    var pl = window.MOMENTUM.player({ stage: stage, duration: dur, onTime: onTime, autoplay: !!autoplay });
    if (speed) pl.setSpeed(speed);
    return pl;
  }
  function blockPts(c, w, h) { return [[c[0] - w / 2, c[1] - h / 2], [c[0] + w / 2, c[1] - h / 2], [c[0] + w / 2, c[1] + h / 2], [c[0] - w / 2, c[1] + h / 2]]; }
  function sym(lo, hi, pad) { var m = Math.max(Math.abs(lo), Math.abs(hi), 1e-9) * (1 + (pad == null ? 0.12 : pad)); return [-m, m]; }
  function deg(x) { return x / DEG; }

  /* ======================================================================
     Motions
     ====================================================================== */
  VIB.lin = function (wn, x0, v0) {
    wn = Math.max(1e-9, num(wn, 1)); x0 = num(x0, 0); v0 = num(v0, 0);
    var A = v0 / wn, B = x0, C = Math.sqrt(A * A + B * B), phi = Math.atan2(B, A);
    return { kind: 'lin', wn: wn, x0: x0, v0: v0, A: A, B: B, C: C, phi: phi, tau: TAU / wn, f: wn / TAU,
      at: function (t) {
        var s = Math.sin(wn * t), c = Math.cos(wn * t), x = A * s + B * c;
        return { t: t, x: x, v: wn * (A * c - B * s), a: -wn * wn * x };
      } };
  };
  // complete elliptic integral of the first kind, K(k) = π / (2 AGM(1, √(1 − k²)))
  function ellipK(k) {
    var a = 1, b = Math.sqrt(Math.max(0, 1 - k * k));
    if (b < 1e-12) return Infinity;
    for (var i = 0; i < 40 && Math.abs(a - b) > 1e-15; i++) { var an = (a + b) / 2; b = Math.sqrt(a * b); a = an; }
    return PI / (2 * a);
  }
  VIB.ellipK = ellipK;
  VIB.pendPeriod = function (L, thMax, g) { g = g || VIB.G; return 4 * Math.sqrt(L / g) * ellipK(Math.sin(Math.abs(thMax) / 2)); };
  VIB.pend = function (o) {
    var g = num(o.g, VIB.G), L = Math.max(1e-6, num(o.L, 1)), th0 = num(o.th0, 0), w0 = num(o.w0, 0);
    var wn = Math.sqrt(g / L), lin = VIB.lin(wn, th0, w0);
    var c = Math.cos(th0) - w0 * w0 * L / (2 * g);           // energy: cos θmax
    var thMax = c <= -1 ? PI : Math.acos(clamp(c, -1, 1));
    var tau = thMax < PI - 1e-6 ? VIB.pendPeriod(L, thMax, g) : Infinity;
    var Tend = Math.min(60, (isFinite(tau) ? tau : lin.tau) * 8), N = 6000, dt = Tend / N;
    var ts = new Float64Array(N + 1), xs = new Float64Array(N + 1), vs = new Float64Array(N + 1);
    var th = th0, w = w0, k = g / L;
    function acc(q) { return -k * Math.sin(q); }
    xs[0] = th; vs[0] = w;
    for (var i = 1; i <= N; i++) {
      var k1x = w, k1v = acc(th);
      var k2x = w + 0.5 * dt * k1v, k2v = acc(th + 0.5 * dt * k1x);
      var k3x = w + 0.5 * dt * k2v, k3v = acc(th + 0.5 * dt * k2x);
      var k4x = w + dt * k3v, k4v = acc(th + dt * k3x);
      th += dt / 6 * (k1x + 2 * k2x + 2 * k3x + k4x); w += dt / 6 * (k1v + 2 * k2v + 2 * k3v + k4v);
      ts[i] = i * dt; xs[i] = th; vs[i] = w;
    }
    return { kind: 'pend', g: g, L: L, wn: wn, tau: tau, tauLin: lin.tau, f: isFinite(tau) ? 1 / tau : 0, thMax: thMax, C: thMax, lin: lin, th0: th0, w0: w0,
      at: function (t) {
        t = clamp(t, 0, Tend);
        var u = t / dt, j = Math.min(N - 1, Math.floor(u)), f = u - j;
        // cubic Hermite between samples (positions and slopes known)
        var x0 = xs[j], x1 = xs[j + 1], m0 = vs[j] * dt, m1 = vs[j + 1] * dt, f2 = f * f, f3 = f2 * f;
        var x = (2 * f3 - 3 * f2 + 1) * x0 + (f3 - 2 * f2 + f) * m0 + (-2 * f3 + 3 * f2) * x1 + (f3 - f2) * m1;
        var v = vs[j] + (vs[j + 1] - vs[j]) * f;
        return { t: t, x: x, v: v, a: acc(x) };
      } };
  };

  /* ======================================================================
     VIB.figure
     ====================================================================== */
  var DEF_NAMES = { x: 'x', v: '\\dot x', a: '\\ddot x' };
  var DEF_UNITS = { x: 'm', v: 'm/s', a: 'm/s²' };
  var COL = { x: 'z', v: 'good', a: 'bad' };

  VIB.figure = function (o) {
    o = Object.assign({ scene: 'h', graphs: ['x'], readouts: ['t', 'x', 'v', 'a'], toggles: ['v', 'a', 'F'], periods: 3, maxT: 12,
      chartHeight: 120, panelTitle: 'At time t', speed: 1 }, o || {});
    var scene = o.scene, isP = scene === 'pend';
    var names = Object.assign({}, DEF_NAMES, isP ? { x: '\\theta', v: '\\dot\\theta', a: '\\ddot\\theta' } : scene === 'v' ? { x: 'y', v: '\\dot y', a: '\\ddot y' } : {}, o.names || {});
    var units = Object.assign({}, DEF_UNITS, isP ? { x: 'rad', v: 'rad/s', a: 'rad/s²' } : {}, o.units || {});
    var show = Object.assign({ v: false, a: false, F: true, W: true, dim: true, ghost: true, fbd: true }, o.show || {});
    var P = Object.assign({ k: 200, m: 2, x0: 0.1, v0: 0, k1: 200, k2: 200, arr: 'parallel', L: 1, th0: 20, w0: 0, g: VIB.G }, o.params || {});
    if (o.sliders) o.sliders.forEach(function (s) { if (!(s.key in (o.params || {}))) P[s.key] = s.value; });
    var stage = o.stage, panel = o.controls;
    var fig = { params: P };
    var motion, info, T;

    function defModel(P) {
      if (scene === 'pend') return { L: P.L, g: P.g, th0: P.th0 * DEG, w0: P.w0, m: P.m };
      if (scene === 'dot') {
        var wn = P.wn || (P.f ? TAU * P.f : P.tau ? TAU / P.tau : 2);
        if (P.C != null) { var ph = (P.phi || 0) * DEG; return { wn: wn, x0: P.C * Math.sin(ph), v0: P.C * wn * Math.cos(ph) }; }
        return { wn: wn, x0: P.x0, v0: P.v0 };
      }
      var k = P.k;
      if (scene === 'springs') k = P.arr === 'series' ? P.k1 * P.k2 / (P.k1 + P.k2) : P.k1 + P.k2;   // parallel and opposed: k1 + k2
      return { k: k, m: P.m, wn: Math.sqrt(k / P.m), x0: P.x0, v0: P.v0, dst: P.m * P.g / k, g: P.g };
    }
    function build() {
      info = Object.assign(defModel(P), o.model ? o.model(P) : {});
      motion = isP ? VIB.pend(info) : VIB.lin(info.wn, info.x0, info.v0);
      var tau = isP && isFinite(motion.tau) ? motion.tau : (isP ? motion.tauLin : motion.tau);
      T = Math.min(o.maxT, o.periods * tau);
      fig.T = T;
    }
    build();

    /* ---------- the scene ---------- */
    var view = Object.assign({}, o.view || {});
    var plDiv = CYL.el('div', { class: 'rm-track' }), gDiv = CYL.el('div', { class: 'rm-graphs' });
    stage.appendChild(plDiv); if (o.graphs.length) stage.appendChild(gDiv);
    stage.classList.add('rm-stage');
    var p, S = {}, Lv, La, Lf;
    function line(g, a, b, opt) { return g.line(a, b, opt); }
    function buildPlane() {
      var xr, yr;
      if (scene === 'h' || scene === 'springs' || scene === 'dot') {
        var A = view.amp || 0.2;
        S.w = A * 1.1; S.h = A * 0.8; S.L0 = (view.L0 || 2.6) * A; S.A = A;
        S.xw = -S.w / 2 - S.L0;
        if (scene === 'dot') { xr = [-1.45 * A, 1.45 * A]; yr = [-0.62 * A, 1.0 * A]; }
        else { S.xR = S.w / 2 + 2.0 * A; xr = [S.xw - 0.2 * A, scene === 'springs' ? S.xR + 0.25 * A : 1.5 * A + S.w / 2]; yr = [-0.62 * A, S.h + 1.45 * A]; }
      } else if (scene === 'v') {
        var a2 = view.amp || 0.1, L0 = view.L0 || 0.25, dm = view.dstMax || 0.2;
        S.bw = view.bw || 0.32 * L0; S.bh = 0.72 * S.bw; S.L0 = L0; S.A = a2;
        S.H = L0 + dm + a2 + S.bh;
        xr = [-0.55 * S.H, 0.55 * S.H]; yr = [-S.H - 0.05 * S.H, 0.09 * S.H];
      } else {
        var Lm = view.Lmax || 2;
        S.Lm = Lm; S.r = 0.055 * Lm;
        xr = [-0.82 * Lm, 0.82 * Lm]; yr = [-1.16 * Lm, 0.12 * Lm];
      }
      p = CYL2D.plane(plDiv, { xRange: xr, yRange: yr, grid: 'none', axes: false, maxHeight: scene === 'v' || isP ? 400 : 250, ariaLabel: o.aria || 'A vibrating system.' });
      fig.plane = p;
      var gs = p.group(); S.gm = p.group();
      var gm = S.gm;
      if (scene === 'h' || scene === 'springs') {
        var A3 = S.A, top = S.h + 0.42 * A3;
        line(gs, [S.xw, 0], [xr[1] - 0.05 * A3, 0], { color: 'ink', width: 2 });
        if (scene === 'springs') {
          S.rwall = p.group();
          S.rwall.line([S.xR, 0], [S.xR, top], { color: 'ink', width: 2.4 });
          var hr = ENERGY.hatch(p, [S.xR, 0], [S.xR, top], { side: -1, gap: A3 * 0.12, len: A3 * 0.1 });
          S.rhatch = hr;
        }
        ENERGY.hatch(p, [S.xw, 0], [xr[1] - 0.05 * A3, 0], { side: -1, gap: A3 * 0.12, len: A3 * 0.1 });
        line(gs, [S.xw, 0], [S.xw, top], { color: 'ink', width: 2.4 });
        ENERGY.hatch(p, [S.xw, 0], [S.xw, top], { side: 1, gap: A3 * 0.12, len: A3 * 0.1 });
        line(gs, [0, -0.08 * A3], [0, S.h + 0.25 * A3], { color: 'muted', width: 1.2, dashed: true });
        gs.label([0, -0.08 * A3], 'x = 0', { color: 'muted', anchor: 's', gap: 2 });
        S.spr = gm.polyline([], { color: 't', width: 1.8 });
        if (scene === 'springs') { S.spr2 = gm.polyline([], { color: 't', width: 1.8 }); S.node = gm.polyline([], { closed: true, color: 'ink', width: 1.4, fill: 'muted', fillOpacity: 0.5 });
          S.k1 = gm.label([0, 0], 'k_1', { color: 't', anchor: 'n', gap: 3 }); S.k2 = gm.label([0, 0], 'k_2', { color: 't', anchor: 'n', gap: 3 }); }
        S.body = gm.polyline([], { closed: true, color: 'ink', width: 1.6, fill: 'surface', fillOpacity: 0.9 });
        S.mlab = gm.label([0, 0], 'm', { color: 'ink' });
        S.xArr = gm.line([0, 0], [0, 0], { color: 'z', width: 1.6, arrow: true });
        S.xLab = gm.label([0, 0], names.x, { color: 'z', anchor: 'n', gap: 3 });
        S.vArr = gm.line([0, 0], [0, 0], { color: 'good', width: 2.6, arrow: true, label: names.v, labelAt: 1, labelSide: 'beyond' });
        S.aArr = gm.line([0, 0], [0, 0], { color: 'bad', width: 2.6, arrow: true, label: names.a, labelAt: 1, labelSide: 'beyond' });
        S.fArr = gm.line([0, 0], [0, 0], { color: 't', width: 2.6, arrow: true });
        S.fLab = gm.label([0, 0], 'F_s', { color: 't', anchor: 'w', gap: 4 });
        if (scene === 'springs') { S.fArr2 = gm.line([0, 0], [0, 0], { color: 't', width: 2.6, arrow: true }); S.fLab2 = gm.label([0, 0], 'F_2', { color: 't', anchor: 'e', gap: 4 }); }
        Lv = 0.75 * A3; La = 0.75 * A3; Lf = 0.9 * A3;
      } else if (scene === 'dot') {
        var A4 = S.A, st = niceStep(2.6 * A4, 6), tk = A4 * 0.035;
        line(gs, [-1.35 * A4, 0], [1.35 * A4, 0], { color: 'ink', width: 2 });
        for (var xv = Math.ceil(-1.3 * A4 / st) * st; xv <= 1.3 * A4 + 1e-12; xv += st) {
          var q = Math.abs(xv) < st * 1e-6 ? 0 : xv;
          line(gs, [q, -tk], [q, tk], { color: 'ink', width: 1.2 });
          gs.label([q, -tk * 1.5], q === 0 ? 'O' : CYL.fmt(+q.toPrecision(10)), { color: q === 0 ? 'ink' : 'muted', anchor: 's', gap: 3 });
        }
        gs.label([1.35 * A4, 0], names.x + '\\ (\\text{' + units.x + '})', { color: 'z', anchor: 'n', gap: 6 });
        S.body = gm.circle({ center: [0, 0], r: A4 * 0.06, color: 'ink', width: 1.6, fill: 'z', fillOpacity: 0.85 });
        S.xArr = gm.line([0, 0], [0, 0], { color: 'z', width: 1.6, arrow: true });
        S.xLab = gm.label([0, 0], names.x, { color: 'z', anchor: 's', gap: 3 });
        S.vArr = gm.line([0, 0], [0, 0], { color: 'good', width: 2.6, arrow: true, label: names.v, labelAt: 1, labelSide: 'beyond' });
        S.aArr = gm.line([0, 0], [0, 0], { color: 'bad', width: 2.6, arrow: true, label: names.a, labelAt: 1, labelSide: 'beyond' });
        Lv = 0.6 * A4; La = 0.6 * A4;
      } else if (scene === 'v') {
        var H = S.H, cw = 0.2 * H;
        line(gs, [-cw, 0], [cw, 0], { color: 'ink', width: 2.6 });
        ENERGY.hatch(p, [-cw, 0], [cw, 0], { side: 1, gap: H * 0.03, len: H * 0.025 });
        S.lnU = gs.line([-0.19 * H, -S.L0], [0.12 * H, -S.L0], { color: 'muted', width: 1.1, dashed: true });
        gs.label([-0.19 * H, -S.L0], '\\text{unstretched}', { color: 'muted', anchor: 'w', gap: 4 });
        S.lnE = gm.line([0, 0], [0, 0], { color: 'muted', width: 1.1, dashed: true });
        S.lbE = gm.label([0, 0], '\\text{equilibrium}', { color: 'muted', anchor: 'w', gap: 4 });
        S.dArr = gm.line([0, 0], [0, 0], { color: 'ink', width: 1.4, arrow: 'both' });
        S.dLab = gm.label([0, 0], '\\delta_{st}', { color: 'ink', anchor: 'e', gap: 3 });
        S.spr = gm.polyline([], { color: 't', width: 1.8 });
        S.body = gm.polyline([], { closed: true, color: 'ink', width: 1.6, fill: 'surface', fillOpacity: 0.9 });
        S.mlab = gm.label([0, 0], 'm', { color: 'ink' });
        S.xArr = gm.line([0, 0], [0, 0], { color: 'z', width: 1.6, arrow: true });
        S.xLab = gm.label([0, 0], names.x, { color: 'z', anchor: 'w', gap: 3 });
        S.vArr = gm.line([0, 0], [0, 0], { color: 'good', width: 2.6, arrow: true, label: names.v, labelAt: 1, labelSide: 'beyond' });
        S.aArr = gm.line([0, 0], [0, 0], { color: 'bad', width: 2.6, arrow: true, label: names.a, labelAt: 1, labelSide: 'beyond' });
        // free-body diagram of the block, to the right
        S.fx = 0.36 * H;
        S.fbdT = gm.label([S.fx, 0], '\\text{FBD}', { color: 'muted', anchor: 's', gap: 4 });
        S.fbody = gm.polyline([], { closed: true, color: 'ink', width: 1.4, fill: 'surface', fillOpacity: 0.9 });
        S.fArr = gm.line([0, 0], [0, 0], { color: 't', width: 2.6, arrow: true });
        S.fLab = gm.label([0, 0], 'F_s', { color: 't', anchor: 'e', gap: 4 });
        S.wArr = gm.line([0, 0], [0, 0], { color: 'z', width: 2.6, arrow: true, anchor: 'end' });
        S.wLab = gm.label([0, 0], 'W', { color: 'z', anchor: 'w', gap: 4 });
        Lv = 0.13 * H; La = 0.13 * H; Lf = 0.17 * H;
      } else {
        var Lm2 = S.Lm, bw2 = 0.22 * Lm2;
        line(gs, [-bw2, 0], [bw2, 0], { color: 'ink', width: 2.6 });
        ENERGY.hatch(p, [-bw2, 0], [bw2, 0], { side: 1, gap: Lm2 * 0.04, len: Lm2 * 0.035 });
        gs.circle({ center: [0, 0], r: Lm2 * 0.012, color: 'ink', fill: 'ink', fillOpacity: 1 });
        S.ref = gm.line([0, 0], [0, -1], { color: 'muted', width: 1.1, dashed: true });
        S.swing = gm.arc({ center: [0, 0], r: 1, theta0: -PI / 2 - 0.1, theta1: -PI / 2 + 0.1, color: 'faint', width: 1.2, arrow: false, dashed: true });
        S.gRod = gm.line([0, 0], [0, -1], { color: 'muted', width: 1.4, dashed: true });
        S.gBob = gm.circle({ center: [0, -1], r: S.r, color: 'muted', width: 1.2, dashed: true, fill: null });
        S.rod = gm.line([0, 0], [0, -1], { color: 'ink', width: 2.2 });
        S.bob = gm.circle({ center: [0, -1], r: S.r, color: 'ink', width: 1.6, fill: 'surface', fillOpacity: 0.95 });
        S.th = gm.arc({ center: [0, 0], r: 0.3, theta0: -PI / 2, theta1: -PI / 2, color: 'z', width: 1.6, arrow: true, label: '\\theta' });
        S.vArr = gm.line([0, 0], [0, 0], { color: 'good', width: 2.6, arrow: true, label: 'v', labelAt: 1, labelSide: 'beyond' });
        S.aArr = gm.line([0, 0], [0, 0], { color: 'bad', width: 2.6, arrow: true, label: 'a_t', labelAt: 1, labelSide: 'beyond' });
        Lv = 0.38 * Lm2; La = 0.38 * Lm2;
      }
    }
    buildPlane();

    var scale = {};
    function calib() {
      // the largest values over one period, for arrow lengths and fixed-decimal readouts
      var vx = 0, vv = 0, va = 0, n = isP ? 600 : 240, per = isP ? T : motion.tau;
      for (var i = 0; i <= n; i++) { var q = motion.at(per * i / n); vx = Math.max(vx, Math.abs(q.x)); vv = Math.max(vv, Math.abs(q.v)); va = Math.max(va, Math.abs(q.a)); }
      scale.x = Math.max(vx, 1e-9); scale.v = Math.max(vv, 1e-9); scale.a = Math.max(va, 1e-9); scale.t = Math.max(1, T);
      if (scene === 'v') scale.F = Math.max(info.k * (info.dst + scale.x), info.m * info.g, 1e-9);
      else if (isP) scale.F = info.m * info.g * Math.max(1, 3 - 2 * Math.cos(motion.thMax)) + 1e-9;
      else scale.F = Math.max(info.k * scale.x, 1e-9);
      scale.E = energy(motion.at(0)).E || 1e-9;
      Object.keys(ro).forEach(function (k) { if (ro[k].resetWidth) ro[k].resetWidth(); });
    }
    function energy(q) {
      if (isP) { var vv = info.L * q.v; return { T: 0.5 * info.m * vv * vv, Vg: info.m * info.g * info.L * (1 - Math.cos(q.x)), E: 0.5 * info.m * vv * vv + info.m * info.g * info.L * (1 - Math.cos(q.x)) }; }
      if (scene === 'dot') return { T: 0, Ve: 0, E: 0 };
      var Tk = 0.5 * info.m * q.v * q.v, Ve = 0.5 * info.k * q.x * q.x;
      return { T: Tk, Ve: Ve, E: Tk + Ve };
    }
    function arrowH(h, y, x, len, on) {
      var ok = on && Math.abs(len) > 1e-9 * (S.A || 1);
      h.setVisible(ok); if (ok) h.set([x, y], [x + len, y]);
    }
    function drawScene(q) {
      var x = q.x;
      if (scene === 'h' || scene === 'springs' || scene === 'dot') {
        var A = S.A, xd = clamp(x, -1.4 * A, 1.4 * A);
        if (scene === 'dot') {
          S.body.set({ center: [xd, 0], r: A * 0.06 });
          var yv0 = 0.32 * A, ya0 = 0.62 * A;
          arrowH(S.vArr, yv0, xd, Lv * q.v / scale.v, show.v); arrowH(S.aArr, ya0, xd, La * q.a / scale.a, show.a);
          var okd = show.dim && Math.abs(xd) > A * 0.03; S.xArr.setVisible(okd); S.xLab.setVisible(okd);
          if (okd) { S.xArr.set([0, -0.36 * A], [xd, -0.36 * A]); S.xLab.set([xd / 2, -0.36 * A]); }
          return;
        }
        var face = xd - S.w / 2, cy = S.h / 2;
        S.body.set(blockPts([xd, cy], S.w, S.h)); S.mlab.set([xd, cy]);
        if (scene === 'h') S.spr.set(ENERGY.springPoints([S.xw, cy], [face, cy], { coils: 10, amp: 0.11 * A, lead: 0.16 * A }));
        else if (P.arr === 'series') {
          var kq = info.k, xn = x * kq / P.k1, half = S.L0 / 2, nx = S.xw + half + clamp(xn, -1.4 * A, 1.4 * A), nw = 0.07 * A;
          S.spr.set(ENERGY.springPoints([S.xw, cy], [nx - nw / 2, cy], { coils: 6, amp: 0.1 * A, lead: 0.1 * A }));
          S.spr2.set(ENERGY.springPoints([nx + nw / 2, cy], [face, cy], { coils: 6, amp: 0.1 * A, lead: 0.1 * A }));
          S.node.set(blockPts([nx, cy], nw, 0.36 * S.h));
          S.k1.set([(S.xw + nx) / 2, cy + 0.12 * A]); S.k2.set([(nx + face) / 2, cy + 0.12 * A]);
        } else if (P.arr === 'opposed') {
          S.spr.set(ENERGY.springPoints([S.xw, cy], [face, cy], { coils: 10, amp: 0.1 * A, lead: 0.16 * A }));
          S.spr2.set(ENERGY.springPoints([xd + S.w / 2, cy], [S.xR, cy], { coils: 8, amp: 0.1 * A, lead: 0.12 * A }));
          S.k1.set([(S.xw + face) / 2, cy + 0.12 * A]); S.k2.set([(xd + S.w / 2 + S.xR) / 2, cy + 0.12 * A]);
        } else {
          var y1 = 0.26 * S.h, y2 = 0.74 * S.h;
          S.spr.set(ENERGY.springPoints([S.xw, y1], [face, y1], { coils: 10, amp: 0.07 * A, lead: 0.16 * A }));
          S.spr2.set(ENERGY.springPoints([S.xw, y2], [face, y2], { coils: 10, amp: 0.07 * A, lead: 0.16 * A }));
          S.node.setVisible(false);
          S.k1.set([(S.xw + face) / 2, y2 + 0.08 * A]); S.k2.set([(S.xw + face) / 2, y1 + 0.08 * A]);
        }
        if (scene === 'springs') { S.node.setVisible(P.arr === 'series'); S.rwall.setVisible(P.arr === 'opposed'); S.rhatch.setVisible(P.arr === 'opposed'); }
        var yT = S.h + 0.18 * A;
        var okx = show.dim && Math.abs(xd) > A * 0.03; S.xArr.setVisible(okx); S.xLab.setVisible(okx);
        if (okx) { S.xArr.set([0, yT], [xd, yT]); S.xLab.set([xd / 2, yT]); }
        arrowH(S.vArr, S.h + 0.62 * A, xd, Lv * q.v / scale.v, show.v);
        arrowH(S.aArr, S.h + 1.05 * A, xd, La * q.a / scale.a, show.a);
        // spring force on the block, on its spring side: a pull (tension, x > 0) starts at the face; a push ends on it
        var opp = scene === 'springs' && P.arr === 'opposed', F = -(opp ? P.k1 : info.k) * x, len = Lf * F / scale.F, yF = scene === 'springs' && P.arr === 'parallel' ? 0.5 * S.h : 0.12 * S.h;
        if (S.fArr2) {
          var F2 = -P.k2 * x, len2 = Lf * F2 / scale.F, rf = xd + S.w / 2, ok2 = opp && show.F && Math.abs(len2) > 1e-4 * A;
          S.fArr2.setVisible(ok2); S.fLab2.setVisible(ok2);
          if (ok2) {   // the right spring: a push (compressed, x > 0) ends on the right face; a pull starts there
            if (F2 < 0) { S.fArr2.set([rf - len2, yF], [rf, yF]); S.fLab2.set([rf - len2, yF]); }
            else { S.fArr2.set([rf, yF], [rf + len2, yF]); S.fLab2.set([rf + len2, yF]); }
          }
          var lt = opp ? 'F_1' : 'F_s'; if (S.fLabTxt !== lt) { S.fLab.setText(lt); S.fLabTxt = lt; }
        }
        var okF = show.F && Math.abs(len) > 1e-4 * A;
        S.fArr.setVisible(okF); S.fLab.setVisible(okF);
        if (okF) {
          if (F < 0) { S.fArr.set([face, yF], [face + len, yF]); S.fLab.set([face + len, yF]); }
          else { S.fArr.set([face - len, yF], [face, yF]); S.fLab.set([face - len, yF]); }
        }
      } else if (scene === 'v') {
        var H = S.H, L0 = S.L0, dst = info.dst, yEq = -(L0 + dst), yTop = yEq - x, cyv = yTop - S.bh / 2;
        S.lnE.set([-0.19 * H, yEq], [0.12 * H, yEq]); S.lbE.set([-0.19 * H, yEq]);
        var okd2 = dst > 0.004 * H; S.dArr.setVisible(okd2 && show.dim); S.dLab.setVisible(okd2 && show.dim);
        S.dArr.set([-0.16 * H, -L0], [-0.16 * H, yEq]); S.dLab.set([-0.16 * H, (yEq - L0) / 2]);
        S.spr.set(ENERGY.springPoints([0, 0], [0, yTop], { coils: 11, amp: 0.3 * S.bw, lead: 0.02 * H }));
        S.body.set(blockPts([0, cyv], S.bw, S.bh)); S.mlab.set([0, cyv]);
        var xa = -S.bw / 2 - 0.04 * H, oky = show.dim && Math.abs(x) > 0.004 * H;
        S.xArr.setVisible(oky); S.xLab.setVisible(oky);
        if (oky) { S.xArr.set([xa, yEq], [xa, yTop]); S.xLab.set([xa, (yEq + yTop) / 2]); }
        var xv1 = S.bw / 2 + 0.05 * H, xa1 = S.bw / 2 + 0.11 * H;
        function arrV(h, X, len, on) { var ok = on && Math.abs(len) > 1e-9 * H; h.setVisible(ok); if (ok) h.set([X, cyv], [X, cyv - len]); }
        arrV(S.vArr, xv1, Lv * q.v / scale.v, show.v); arrV(S.aArr, xa1, La * q.a / scale.a, show.a);
        // FBD: spring force k(δst + y), up when the spring is stretched (a pull starting at the top face); the weight ends at G
        var fbX = S.fx, okB = show.fbd;
        S.fbdT.setVisible(okB); S.fbody.setVisible(okB);
        S.fbdT.set([fbX, yTop - S.bh]);
        S.fbody.set(blockPts([fbX, cyv], S.bw, S.bh));
        var Fs = info.k * (dst + x), lf = Lf * Fs / scale.F, W = info.m * info.g, lw = Lf * W / scale.F;
        var okF2 = okB && Math.abs(lf) > 1e-4 * H, fxx = fbX + 0.3 * S.bw;
        S.fArr.setVisible(okF2); S.fLab.setVisible(okF2);
        if (okF2) {
          if (Fs > 0) { S.fArr.set([fxx, yTop], [fxx, yTop + lf]); S.fLab.set([fxx, yTop + lf / 2]); }
          else { S.fArr.set([fxx, yTop - lf], [fxx, yTop]); S.fLab.set([fxx, yTop - lf / 2]); }
        }
        var wx = fbX - 0.05 * S.bw;
        S.wArr.setVisible(okB); S.wLab.setVisible(okB);
        S.wArr.set([wx, cyv + lw + S.bh / 2], [wx, cyv]); S.wLab.set([wx, cyv + S.bh / 2 + lw * 0.6]);
      } else {
        var L = info.L, th = x, bx = L * Math.sin(th), by = -L * Math.cos(th);
        S.ref.set([0, 0], [0, -1.08 * L]);
        var tm = motion.thMax;
        S.swing.setVisible(tm < PI - 0.01 && tm > 0.005);
        if (tm < PI - 0.01) S.swing.set({ center: [0, 0], r: L, theta0: -PI / 2 - tm, theta1: -PI / 2 + tm });
        S.rod.set([0, 0], [bx, by]); S.bob.set({ center: [bx, by], r: S.r });
        var gq = motion.lin.at(q.t).x, okG = show.ghost;
        S.gRod.setVisible(okG); S.gBob.setVisible(okG);
        if (okG) { S.gRod.set([0, 0], [L * Math.sin(gq), -L * Math.cos(gq)]); S.gBob.set({ center: [L * Math.sin(gq), -L * Math.cos(gq)], r: S.r }); }
        var thw = Math.atan2(Math.sin(th), Math.cos(th)), okT = Math.abs(thw) > 0.01;   // the angle within one turn
        S.th.setVisible(okT);
        if (okT) S.th.set({ center: [0, 0], r: Math.min(0.3 * L, 0.32 * S.Lm), theta0: -PI / 2, theta1: -PI / 2 + thw });
        var ux = Math.cos(th), uy = Math.sin(th);            // unit tangent, direction of increasing θ
        function arrT(h, len, on) { var ok = on && Math.abs(len) > 1e-9; h.setVisible(ok); if (ok) h.set([bx, by], [bx + ux * len, by + uy * len]); }
        arrT(S.vArr, Lv * q.v / scale.v, show.v);
        arrT(S.aArr, La * q.a / scale.a, show.a);
      }
    }

    /* ---------- graphs ---------- */
    var charts = {}, curves = {}, cursors = {}, marks = {}, ghosts = {};
    function chartData(key) {
      var n = 600, pts = [];
      if (key === 'vx' || key === 'ax') {
        var per = isP ? (isFinite(motion.tau) ? motion.tau : motion.tauLin) : motion.tau;
        for (var i = 0; i <= n; i++) { var q = motion.at(per * i / n); pts.push([q.x, key === 'vx' ? q.v : q.a]); }
        return pts;
      }
      for (var j = 0; j <= n; j++) { var q2 = motion.at(T * j / n); pts.push([q2.t, q2[key]]); }
      return pts;
    }
    function yRange(key) {
      if (o.ranges && o.ranges[key]) return o.ranges[key];
      var k2 = key === 'vx' ? 'v' : key === 'ax' ? 'a' : key;
      return sym(-scale[k2], scale[k2], 0.15);
    }
    function xRangeFor(key) { if (key === 'vx' || key === 'ax') return (o.ranges && o.ranges.x) || sym(-scale.x, scale.x, 0.15); return [0, T]; }
    function buildCharts() {
      gDiv.innerHTML = ''; charts = {}; curves = {}; cursors = {}; marks = {}; ghosts = {};
      o.graphs.forEach(function (key) {
        var box = CYL.el('div', { class: 'rm-graph' }); gDiv.appendChild(box);
        var k2 = key === 'vx' ? 'v' : key === 'ax' ? 'a' : key, yr = yRange(key), xr = xRangeFor(key);
        var phase = key === 'vx' || key === 'ax';
        var ch = ENERGY.chart(box, { x: { label: phase ? '\\(' + names.x + '\\) (' + units.x + ')' : '\\(t\\) (s)', min: xr[0], max: xr[1] },
          y: { label: '\\(' + names[k2] + '\\) (' + units[k2] + ')', min: yr[0], max: yr[1] },
          height: o.chartHeight, pad: { l: 56, r: 14, t: 8, b: 26 },
          ariaLabel: phase ? ('Graph of ' + (key === 'vx' ? 'velocity' : 'acceleration') + ' against displacement, with a marker at the current state.')
            : ('Graph of ' + ({ x: isP ? 'the angle' : 'displacement', v: isP ? 'angular velocity' : 'velocity', a: isP ? 'angular acceleration' : 'acceleration' })[key] + ' against time, with a cursor at the current time.') });
        charts[key] = ch;
        ch.hline(0, { color: 'muted', width: 1, dashed: false });
        if (isP && key === 'x') ghosts[key] = ch.polyline([], { color: 'muted', width: 1.6, dashed: true });
        curves[key] = ch.polyline(chartData(key), { color: COL[k2], width: 2.4 });
        if (!phase) cursors[key] = ch.vline(0, { color: 'muted', width: 1.2, dashed: false });
        marks[key] = ch.marker([0, 0], { color: COL[k2], r: 4, ring: false });
      });
      refreshGhost();
    }
    function refreshGhost() {
      Object.keys(ghosts).forEach(function (key) {
        var pts = [];
        if (show.ghost) for (var j = 0; j <= 600; j++) { var t = T * j / 600; pts.push([t, motion.lin.at(t).x]); }
        ghosts[key].set(pts);
      });
    }
    function refreshCharts() {
      o.graphs.forEach(function (key) {
        var ch = charts[key], yr = yRange(key), xr = xRangeFor(key);
        ch.setAxes({ x: { min: xr[0], max: xr[1] }, y: { min: yr[0], max: yr[1] } });
        curves[key].set(chartData(key));
      });
      refreshGhost();
    }

    /* ---------- readouts ---------- */
    var ro = {};
    var RO = {
      t: ['Time \\(t\\)', null], x: [(isP ? 'Angle' : 'Displacement') + ' \\(' + names.x + '\\)', 'z'], v: [(isP ? 'Angular velocity' : 'Velocity') + ' \\(' + names.v + '\\)', 'good'],
      a: [(isP ? 'Angular acceleration' : 'Acceleration') + ' \\(' + names.a + '\\)', 'bad'],
      wn: ['Natural frequency \\(\\omega_n\\)', null], f: ['Frequency \\(f\\)', null], tau: ['Period \\(\\tau\\)', null],
      tauLin: ['Period, small angles \\(2\\pi\\sqrt{l/g}\\)', null], tauEx: ['Period, actual', null],
      C: ['Amplitude \\(C\\)', 'z'], phi: ['Phase angle \\(\\phi\\)', null], dst: ['Static deflection \\(\\delta_{st}\\)', null],
      keq: ['Stiffness \\(k_{eq}\\)', 't'], Fs: ['Spring force \\(F_s\\)', 't'], vmax: ['Largest speed', 'good'], amax: ['Largest acceleration', 'bad'],
      T: ['Kinetic energy \\(T\\)', 'good'], V: [isP ? 'Potential energy \\(V_g\\)' : 'Potential energy \\(V_e\\)', isP ? 'z' : 't'], E: ['Total \\(T + V\\)', null]
    };
    function setStatic() {
      if (ro.wn) ro.wn.set(fx(info.wn, 2) + ' rad/s');
      var tau = isP ? motion.tauLin : motion.tau;
      if (ro.f) ro.f.set(fx(1 / tau, 3) + ' Hz');
      if (ro.tau) ro.tau.set(fx(tau, 3) + ' s');
      if (ro.tauLin) ro.tauLin.set(fx(motion.tauLin, 3) + ' s');
      if (ro.tauEx) ro.tauEx.set(isFinite(motion.tau) ? fx(motion.tau, 3) + ' s' : '—');
      if (ro.C) ro.C.set(isP ? (motion.thMax < PI - 1e-6 ? fx(deg(motion.thMax), 1) + '°' : 'over the top') : fx(motion.C, 4) + '\u00a0' + units.x);
      if (ro.phi) ro.phi.set(fx(deg(motion.phi), 1) + '°');
      if (ro.dst) ro.dst.set(fx(info.dst, 4) + ' m');
      if (ro.keq) ro.keq.set(fx(info.k, 1) + ' N/m');
      if (ro.vmax) ro.vmax.set(fx(isP ? scale.v * info.L : scale.v, 3) + ' m/s');
      if (ro.amax) ro.amax.set(fx(scale.a, 2) + ' ' + units.a);
    }
    function draw(t) {
      var q = motion.at(t);
      fig.state = q;
      drawScene(q);
      o.graphs.forEach(function (key) {
        if (cursors[key]) cursors[key].set(t);
        if (key === 'vx') marks[key].set([q.x, q.v]); else if (key === 'ax') marks[key].set([q.x, q.a]); else marks[key].set([t, q[key]]);
      });
      if (ro.t) ro.t.set(fx(t, 2) + ' s');
      ['x', 'v', 'a'].forEach(function (k) {
        if (!ro[k]) return;
        var s = CYL.fmtScale(q[k], scale[k], 3) + ' ' + units[k];
        if (isP && k === 'x') s += ' (' + fx(deg(q.x), 1) + '°)';
        ro[k].set(s);
      });
      if (ro.Fs) ro.Fs.set(CYL.fmtScale(scene === 'v' ? info.k * (info.dst + q.x) : -info.k * q.x, scale.F, 3) + ' N');
      var en = energy(q);
      if (ro.T) ro.T.set(CYL.fmtScale(en.T, scale.E, 3) + ' J');
      if (ro.V) ro.V.set(CYL.fmtScale(isP ? en.Vg : en.Ve, scale.E, 3) + ' J');
      if (ro.E) ro.E.set(CYL.fmtScale(en.E, scale.E, 3) + ' J');
      if (bars) bars.set(isP ? { T: en.T, Vg: en.Vg } : { T: en.T, Ve: en.Ve }, scale.E);
      if (o.onUpdate) o.onUpdate(q, fig);
    }
    calib();
    buildCharts();
    var bars = null, togs = null;
    if (panel) {
      if (o.top) o.top(panel, fig);
      if (o.toggles && o.toggles.length) {
        title(panel, 'Show');
        var LAB = { v: isP ? 'Velocity' : 'Velocity', a: 'Acceleration', F: 'Forces', ghost: 'Small-angle model', dim: 'Dimensions', fbd: 'Free-body diagram' };
        var CO = { v: 'good', a: 'bad', F: 't', ghost: 'muted', dim: 'z', fbd: 't' };
        togs = chips(panel, o.toggles.map(function (k) { return { key: k, label: LAB[k], color: CO[k], value: !!show[k], onChange: function (on) { show[k] = on; if (k === 'ghost') refreshGhost(); draw(pl.t()); } }; }));
      }
      title(panel, o.panelTitle);
      o.readouts.forEach(function (k) { if (RO[k]) ro[k] = CYL.readout(RO[k][0], { color: RO[k][1] || null }); });
      rgrid(panel, o.readouts.filter(function (k) { return ro[k]; }).map(function (k) { return ro[k]; }));
      if (o.bars) { bars = ENERGY.bars(panel, { items: isP ? ['T', 'Vg'] : ['T', 'Ve'], total: true, title: 'Energy' }); }
      if (o.extra) o.extra(panel, fig);
      if (o.select || (o.sliders && o.sliders.length)) title(panel, o.slidersTitle || 'Change the system');
      if (o.select) {
        var sel = CYL.select({ label: o.select.label, options: o.select.options, value: P[o.select.key], onChange: function (v) { P[o.select.key] = v; update(); } });
        panel.appendChild(sel.el); fig.selectCtl = sel;
      }
      fig.sliders = {};
      (o.sliders || []).forEach(function (s) {
        fig.sliders[s.key] = slider(panel, Object.assign({}, s, { value: P[s.key] }), function (v) { P[s.key] = v; update(); });
      });
      if (o.note) fig.noteEl = note(panel, o.note);
      CYL.renderMath(panel);
    }
    calib(); setStatic();
    if (bars) bars.setScale(0, scale.E * 1.08);
    var pl = player(stage, function () { return T; }, draw, o.speed, o.autoplay);
    function update() {
      build(); calib(); setStatic();
      if (bars) bars.setScale(0, scale.E * 1.08);
      refreshCharts();
      pl.refresh(true);
      draw(pl.t());
    }
    fig.player = pl;
    fig.charts = charts;
    fig.motion = function () { return motion; };
    fig.info = function () { return info; };
    fig.setParams = function (pp) {
      Object.assign(P, pp || {});
      if (fig.sliders) Object.keys(pp || {}).forEach(function (k) { if (fig.sliders[k]) fig.sliders[k].set(P[k], true); });
      if (o.select && pp && o.select.key in pp && fig.selectCtl && fig.selectCtl.set) fig.selectCtl.set(P[o.select.key], true);
      update(); return fig;
    };
    fig.redraw = function () { draw(pl.t()); };
    fig.show = show;
    fig.destroy = function () { pl.destroy(); if (p) p.destroy(); stage.innerHTML = ''; };
    draw(0);
    VIB.figures.push(fig);
    return fig;
  };
  VIB.figures = [];

  /* ======================================================================
     VIB.circle — the reference circle and the curve its projection traces
     ====================================================================== */
  VIB.circle = function (o) {
    o = Object.assign({ mode: 'shm', window: 4, readouts: null }, o || {});
    var ic = o.mode === 'ic';
    var P = Object.assign(ic ? { x0: 0.06, v0: 0.4, wn: 4 } : { C: 0.08, f: 0.5, phi: 0 }, o.params || {});
    (o.sliders || []).forEach(function (s) { if (!(o.params && s.key in o.params)) P[s.key] = s.value; });
    var stage = o.stage, panel = o.controls, fig = { params: P };
    var A0 = (o.view && o.view.amp) || 0.1, Wd = o.window;     // drawing scale (m) and the time shown (s)
    var R = A0, gx0 = 1.5 * R, gLen = 4.6 * R, sx = gLen / Wd; // the time axis starts at gx0; X = gx0 + t·sx
    var mot;
    function build() {
      if (ic) mot = VIB.lin(P.wn, P.x0, P.v0);
      else { var wn = TAU * P.f, ph = P.phi * DEG; mot = VIB.lin(wn, P.C * Math.sin(ph), P.C * wn * Math.cos(ph)); }
    }
    build();
    var div = CYL.el('div', { class: 'rm-track' }); stage.appendChild(div); stage.classList.add('rm-stage');
    var p = CYL2D.plane(div, { xRange: [-1.3 * R, gx0 + gLen + 0.3 * R], yRange: [-1.45 * R, 1.45 * R], grid: 'none', axes: false, maxHeight: 300,
      ariaLabel: o.aria || 'A vector turning about a circle, and the curve its vertical projection traces against time.' });
    fig.plane = p;
    var gs = p.group(), gm = p.group();
    var Rd = R;                                  // the circle drawn for the amplitude C (scaled by C/A0 below)
    var circ = gs.circle({ center: [0, 0], r: R, color: 'faint', width: 1.4 });
    gs.line([-1.2 * R, 0], [1.2 * R, 0], { color: 'muted', width: 1 });
    gs.line([0, -1.3 * R], [0, 1.3 * R], { color: 'muted', width: 1 });
    gs.line([gx0, 0], [gx0 + gLen + 0.15 * R, 0], { color: 'ink', width: 1.4, arrow: true });
    gs.line([gx0, -1.3 * R], [gx0, 1.3 * R], { color: 'ink', width: 1.4 });
    gs.label([gx0 + gLen + 0.15 * R, 0], 't\\ (\\text{s})', { anchor: 'sw', gap: 4, color: 'ink' });
    gs.label([gx0, 1.3 * R], 'x', { anchor: 'e', gap: 4, color: 'z' });
    var tst = niceStep(Wd, 5);
    for (var tt = tst; tt <= Wd + 1e-9; tt += tst) {
      var X = gx0 + tt * sx;
      gs.line([X, -0.04 * R], [X, 0.04 * R], { color: 'ink', width: 1 });
      if (tt + tst <= Wd + 1e-9) gs.label([X, -0.05 * R], CYL.fmt(+tt.toPrecision(6)), { color: 'muted', anchor: 's', gap: 2 });
    }
    var cCurve = gs.polyline([], { color: 'z', width: 2.4 });
    var aCurve = ic ? gs.polyline([], { color: 'accent', width: 1.6, dashed: true }) : null;
    var bCurve = ic ? gs.polyline([], { color: 't', width: 1.6, dashed: true }) : null;
    var traced = gm.polyline([], { color: 'z', width: 3.4 });
    var angArc = gm.arc({ center: [0, 0], r: 0.3 * R, theta0: 0, theta1: 0.1, color: 'warn', width: 1.4, arrow: true, label: ic ? null : '\\omega t + \\phi' });
    var aVec = ic ? gm.line([0, 0], [0, 0], { color: 'accent', width: 2.4, arrow: true, label: 'A', labelAt: 0.55, labelSide: 'right' }) : null;
    var bVec = ic ? gm.line([0, 0], [0, 0], { color: 't', width: 2.4, arrow: true, label: 'B', labelAt: 0.55, labelSide: 'right' }) : null;
    var vec = gm.line([0, 0], [0, 0], { color: 'warn', width: 2.6, arrow: true, label: 'C', labelAt: 0.6, labelSide: 'left' });
    var link = gm.line([0, 0], [0, 0], { color: 'muted', width: 1.1, dashed: true });
    var proj = gm.circle({ center: [0, 0], r: 0.06 * R, color: 'ink', width: 1.4, fill: 'z', fillOpacity: 1 });
    var tip = gm.circle({ center: [0, 0], r: 0.045 * R, color: 'warn', width: 1.2, fill: 'warn', fillOpacity: 1 });
    var now = gm.circle({ center: [0, 0], r: 0.05 * R, color: 'z', width: 1.2, fill: 'z', fillOpacity: 1 });
    var k = 1;                                    // drawing units per meter: the largest C fills the circle
    function curvePts(f) { var pts = [], n = 500; for (var i = 0; i <= n; i++) { var t = Wd * i / n; pts.push([gx0 + t * sx, k * f(t)]); } return pts; }
    function refresh() {
      k = R / Math.max(A0, 1e-9);
      circ.set({ center: [0, 0], r: k * mot.C });
      cCurve.set(curvePts(function (t) { return mot.at(t).x; }));
      if (ic) {
        aCurve.set(curvePts(function (t) { return mot.A * Math.sin(mot.wn * t); }));
        bCurve.set(curvePts(function (t) { return mot.B * Math.cos(mot.wn * t); }));
      }
    }
    function draw(t) {
      var th = mot.wn * t + mot.phi, C = mot.C, px = k * C * Math.cos(th), py = k * C * Math.sin(th);
      if (ic) {
        var ax = k * mot.A * Math.cos(mot.wn * t), ay = k * mot.A * Math.sin(mot.wn * t);
        aVec.set([0, 0], [ax, ay]); bVec.set([ax, ay], [px, py]);
        aVec.setVisible(Math.abs(mot.A) > 1e-9); bVec.setVisible(Math.abs(mot.B) > 1e-9);
      }
      vec.set([0, 0], [px, py]); tip.set({ center: [px, py], r: 0.045 * R });
      proj.set({ center: [0, py], r: 0.06 * R });
      var X = gx0 + Math.min(t, Wd) * sx;
      link.set([px, py], [X, py]); now.set({ center: [X, py], r: 0.05 * R });
      var pts = [], n = Math.max(2, Math.round(200 * Math.min(t, Wd) / Wd));
      for (var i = 0; i <= n; i++) { var ti = Math.min(t, Wd) * i / n; pts.push([gx0 + ti * sx, k * mot.at(ti).x]); }
      traced.set(pts);
      var a1 = ((th % TAU) + TAU) % TAU;
      angArc.setVisible(a1 > 0.05 && C > 1e-9);
      if (a1 > 0.05) angArc.set({ center: [0, 0], r: 0.28 * R * Math.max(0.5, Math.min(1, k * C / R)), theta0: 0, theta1: a1 });
      var q = mot.at(t);
      if (ro.t) ro.t.set(fx(t, 2) + ' s');
      if (ro.x) ro.x.set(CYL.fmtScale(q.x, Math.max(mot.C, 1e-9), 3) + ' m');
      if (ro.ang) ro.ang.set(fx(deg(a1), 1) + '°');
      if (o.onUpdate) o.onUpdate(q, fig);
    }
    var ro = {};
    var RO = { t: ['Time \\(t\\)', null], x: ['Displacement \\(x\\)', 'z'], ang: ['Angle \\(' + (ic ? '\\omega_n' : '\\omega') + ' t + \\phi\\)', 'warn'],
      tau: ['Period \\(\\tau\\)', null], f: ['Frequency \\(f\\)', null], wn: [ic ? 'Natural frequency \\(\\omega_n\\)' : 'Circular frequency \\(\\omega\\)', null],
      A: ['\\(A = \\dot x_0/\\omega_n\\)', 'accent'], B: ['\\(B = x_0\\)', 't'], C: ['Amplitude \\(C\\)', 'warn'], phi: ['Phase angle \\(\\phi\\)', null] };
    var keys = o.readouts || (ic ? ['t', 'x', 'A', 'B', 'C', 'phi'] : ['t', 'x', 'ang', 'wn', 'tau']);
    function setStatic() {
      if (ro.tau) ro.tau.set(fx(mot.tau, 3) + ' s');
      if (ro.f) ro.f.set(fx(mot.f, 3) + ' Hz');
      if (ro.wn) ro.wn.set(fx(mot.wn, 3) + ' rad/s');
      if (ro.A) ro.A.set(fx(mot.A, 4) + ' m');
      if (ro.B) ro.B.set(fx(mot.B, 4) + ' m');
      if (ro.C) ro.C.set(fx(mot.C, 4) + ' m');
      if (ro.phi) ro.phi.set(fx(deg(mot.phi), 1) + '°');
    }
    if (panel) {
      title(panel, o.panelTitle || 'At time t');
      keys.forEach(function (k2) { ro[k2] = CYL.readout(RO[k2][0], { color: RO[k2][1] || null }); });
      rgrid(panel, keys.map(function (k2) { return ro[k2]; }));
      if (o.sliders && o.sliders.length) {
        title(panel, o.slidersTitle || 'Change the motion');
        fig.sliders = {};
        o.sliders.forEach(function (s) { fig.sliders[s.key] = slider(panel, Object.assign({}, s, { value: P[s.key] }), function (v) { P[s.key] = v; build(); refresh(); setStatic(); draw(pl.t()); }); });
      }
      if (o.note) note(panel, o.note);
      CYL.renderMath(panel);
    }
    refresh(); setStatic();
    var pl = player(stage, function () { return Wd; }, draw, o.speed || 1, o.autoplay);
    fig.player = pl;
    fig.motion = function () { return mot; };
    fig.setParams = function (pp) {
      Object.assign(P, pp || {});
      if (fig.sliders) Object.keys(pp || {}).forEach(function (k2) { if (fig.sliders[k2]) fig.sliders[k2].set(P[k2], true); });
      build(); refresh(); setStatic(); pl.refresh(true); draw(pl.t()); return fig;
    };
    fig.destroy = function () { pl.destroy(); p.destroy(); stage.innerHTML = ''; };
    draw(0);
    return fig;
  };

  /* ======================================================================
     VIB.guess — put a trial x(t) into m ẍ = −k x and compare the two sides
     ====================================================================== */
  var TRIALS = {
    cos: { label: 'x = C cos pt', tex: 'x = C\\cos pt', x: function (C, p, t) { return C * Math.cos(p * t); }, xdd: function (C, p, t) { return -C * p * p * Math.cos(p * t); } },
    sin: { label: 'x = C sin pt', tex: 'x = C\\sin pt', x: function (C, p, t) { return C * Math.sin(p * t); }, xdd: function (C, p, t) { return -C * p * p * Math.sin(p * t); } },
    exp: { label: 'x = C e^(−pt)', tex: 'x = C e^{-pt}', x: function (C, p, t) { return C * Math.exp(-p * t); }, xdd: function (C, p, t) { return C * p * p * Math.exp(-p * t); } },
    sq: { label: 'x = C(1 − (pt)²)', tex: 'x = C\\left[1 - (pt)^2\\right]', x: function (C, p, t) { return C * (1 - p * p * t * t); }, xdd: function (C, p) { return -2 * C * p * p; } }
  };
  VIB.TRIALS = TRIALS;
  VIB.guess = function (o) {
    o = Object.assign({ window: 3 }, o || {});
    var P = Object.assign({ k: 200, m: 2, p: 6, fn: 'cos', C: 0.1 }, o.params || {});
    var stage = o.stage, panel = o.controls, fig = { params: P }, Wd = o.window;
    var box = CYL.el('div', { class: 'rm-graph' }); stage.appendChild(box); stage.classList.add('rm-stage');
    var box2 = CYL.el('div', { class: 'rm-graph' }); stage.appendChild(box2);
    var chX = ENERGY.chart(box2, { x: { label: '\\(t\\) (s)', min: 0, max: Wd }, y: { label: 'trial \\(x\\) (m)', min: -0.15, max: 0.15 }, height: 120, pad: { l: 56, r: 14, t: 8, b: 26 },
      ariaLabel: 'Graph of the trial displacement against time.' });
    var ch = ENERGY.chart(box, { x: { label: '\\(t\\) (s)', min: 0, max: Wd }, y: { label: 'force (N)', min: -30, max: 30 }, height: 210, pad: { l: 56, r: 14, t: 8, b: 26 },
      ariaLabel: o.aria || 'Graph of m times the acceleration of the trial function and of minus k times the trial displacement, against time.',
      legend: [{ label: '\\(m\\ddot x\\)', color: 'bad' }, { label: '\\(-kx\\)', color: 't', dashed: true }] });
    ch.hline(0, { color: 'muted', width: 1 }); chX.hline(0, { color: 'muted', width: 1 });
    var cX = chX.polyline([], { color: 'z', width: 2.4 });
    var cMa = ch.polyline([], { color: 'bad', width: 2.6 });
    var cKx = ch.polyline([], { color: 't', width: 2.4, dashed: true });
    var ro = {}, verdict;
    function update() {
      var tr = TRIALS[P.fn], C = P.C, p = P.p, n = 400, ma = [], kx = [], xs = [], err = 0, big = 0;
      for (var i = 0; i <= n; i++) {
        var t = Wd * i / n, x = tr.x(C, p, t), a = tr.xdd(C, p, t);
        xs.push([t, x]); ma.push([t, P.m * a]); kx.push([t, -P.k * x]);
        err = Math.max(err, Math.abs(P.m * a + P.k * x)); big = Math.max(big, Math.abs(P.m * a), Math.abs(P.k * x));
      }
      var lim = Math.max(5, Math.min(big, 120) * 1.12);
      ch.setAxes({ y: { min: -lim, max: lim } });
      var xl = Math.max(0.12, Math.min(Math.max.apply(null, xs.map(function (q) { return Math.abs(q[1]); })), 0.6) * 1.12);
      chX.setAxes({ y: { min: -xl, max: xl } });
      cX.set(xs.map(function (q) { return [q[0], clamp(q[1], -xl, xl)]; }));
      cMa.set(ma.map(function (q) { return [q[0], clamp(q[1], -lim, lim)]; })); cKx.set(kx.map(function (q) { return [q[0], clamp(q[1], -lim, lim)]; }));
      var wn = Math.sqrt(P.k / P.m), ok = err <= 0.01 * Math.max(big, 1e-9);
      if (ro.p) ro.p.set(fx(p, 2) + ' rad/s');
      if (ro.wn) ro.wn.set(fx(wn, 2) + ' rad/s');
      if (ro.err) ro.err.set(fx(err, 1) + ' N');
      if (verdict) {
        verdict.textContent = ok ? 'The two curves coincide at every instant: this trial satisfies m ẍ = −k x.'
          : (P.fn === 'exp' ? 'For this trial m ẍ always has the same sign as x, while −k x has the opposite sign: no value of p works.'
            : P.fn === 'sq' ? 'm ẍ is a constant, but −k x changes with time: no value of p works.'
              : 'Same shape, different heights: change p until the two curves coincide.');
        verdict.className = 'mf-note ' + (ok ? 'vb-ok' : 'vb-no');
      }
      fig.ok = ok; fig.err = err;
    }
    if (panel) {
      title(panel, 'Trial function');
      var sel = CYL.select({ label: 'Choose \\(x(t)\\)', value: P.fn, options: Object.keys(TRIALS).map(function (k) { return { value: k, label: TRIALS[k].label }; }), onChange: function (v) { P.fn = v; update(); } });
      panel.appendChild(sel.el);
      title(panel, 'Check');
      ['p', 'wn', 'err'].forEach(function (k) { ro[k] = CYL.readout({ p: 'Trial \\(p\\)', wn: '\\(\\sqrt{k/m}\\)', err: 'Largest mismatch \\(|m\\ddot x + kx|\\)' }[k]); });
      rgrid(panel, [ro.p, ro.wn, ro.err]);
      verdict = CYL.el('p', { class: 'mf-note', 'aria-live': 'polite' }); panel.appendChild(verdict);
      title(panel, 'Change the system and the trial');
      fig.sliders = {
        p: slider(panel, { label: 'Trial \\(p\\)', min: 0.5, max: 20, step: 0.1, value: P.p, unit: 'rad/s', color: 'warn' }, function (v) { P.p = v; update(); }),
        k: slider(panel, { label: 'Stiffness \\(k\\)', min: 50, max: 800, step: 10, value: P.k, unit: 'N/m', color: 't' }, function (v) { P.k = v; update(); }),
        m: slider(panel, { label: 'Mass \\(m\\)', min: 0.5, max: 8, step: 0.1, value: P.m, unit: 'kg' }, function (v) { P.m = v; update(); })
      };
      fig.select = sel;
      CYL.renderMath(panel);
    }
    update();
    fig.setParams = function (pp) {
      Object.assign(P, pp || {});
      Object.keys(pp || {}).forEach(function (k) { if (fig.sliders && fig.sliders[k]) fig.sliders[k].set(P[k], true); });
      if (pp && pp.fn && fig.select && fig.select.set) fig.select.set(pp.fn, true);
      update(); return fig;
    };
    return fig;
  };

  window.VIB = VIB;
})(window, document);
