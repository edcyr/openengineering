/*!
 * fma.js — FMA: free-body and kinetic diagrams, force arrows drawn the same way in every figure, and a small ODE
 * solver for forces that vary, for the Force, Mass and Acceleration module. Classic script (IIFE) that attaches ONE
 * global: FMA. Requires CYL (cyl-core.js) and CYL2D (cyl-2d.js); the animated figures also use ENERGY (energy.js)
 * and MOMENTUM (momentum.js). Load it after them.
 *
 * Color code, the same in every figure, readout and formula:
 *   weight W = mg ......................... 'z' (blue)      TeX \colW
 *   normal force N ........................ 'ink'
 *   friction F_f .......................... 'r' (orange, drawn thicker)   \colF
 *   applied force P, drag ................. 'warn' (amber)                \colP
 *   spring force F_s ...................... 't' (violet)                  \colS
 *   cord tension T ........................ 'muted' (gray)
 *   m a and the acceleration .............. 'bad' (red)                   \colMA
 *   velocity .............................. 'good' (green)                \colV
 *
 * Free-body convention (the course's): the weight's arrowhead ends at the center of gravity; a push (a normal force,
 * a spring, an applied push) ends with its arrowhead on the face it acts on; friction and cord tension start with
 * their tail where they act. Friction is drawn thicker and never so short that its head disappears.
 *
 * FMA.G = 9.81
 * FMA.block(plane, {c: [x, y], w, h, angle: 0 (rad), color: 'accent', label}) -> {set(c, angle), local([u, v]) -> point,
 *   dir(ux, uy) -> unit vector in the body frame, handles}: a rectangle with an optional label, and helpers that turn
 *   body coordinates (u along the base, v up from the base's middle line... measured from the center) into the plane.
 * FMA.force(plane, {color, label, width, mode: 'head' | 'tail', labelSide}) -> {set(point, dir, length), hide()}: one
 *   force arrow. mode 'head': the arrowhead ends at the point (weights, pushes); 'tail': the tail starts there
 *   (friction, tension). Friction ('r') defaults to width 4.2 and 'tail'.
 * FMA.equals(plane, [x, y]) -> a large "=" sign between a free-body diagram and its kinetic diagram.
 * FMA.ode(f, y0, t0, t1, dt) -> {t: [], y: [[…]], at(t) -> y (linear interpolation)}: fourth-order Runge–Kutta for
 *   y' = f(t, y), with y an array. FMA.odeUntil(f, y0, dt, stop(t, y) -> bool, tmax) stops early.
 * FMA.niceStep(raw) -> 1, 2 or 5 × 10^n
 */
(function (window) {
  'use strict';
  if (window.FMA) return;
  var CYL = window.CYL;
  var FMA = { version: '1.0.0', G: 9.81 };
  function report(m) { if (CYL && CYL.reportError) CYL.reportError('fma.js: ' + m); else if (window.console) console.error('fma.js: ' + m); }
  function rot(v, a) { var c = Math.cos(a), s = Math.sin(a); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c]; }
  FMA.rot = rot;

  FMA.block = function (p, o) {
    o = Object.assign({ c: [0, 0], w: 1, h: 0.6, angle: 0, color: 'accent', fillOpacity: 0.3 }, o || {});
    var st = { c: o.c.slice(), a: o.angle };
    var body = p.polyline([[0, 0], [1, 0], [1, 1]], { closed: true, color: 'ink', width: 1.6, fill: o.color, fillOpacity: o.fillOpacity });
    var lab = o.label ? p.label([0, 0], o.label, { tex: o.tex !== false, color: 'ink' }) : null;
    var api = {
      local: function (q) { var r = rot(q, st.a); return [st.c[0] + r[0], st.c[1] + r[1]]; },
      dir: function (ux, uy) { return rot([ux, uy], st.a); },
      center: function () { return st.c.slice(); },
      set: function (c, a) {
        if (c) st.c = c.slice();
        if (a != null) st.a = a;
        var hw = o.w / 2, hh = o.h / 2;
        body.set([api.local([-hw, -hh]), api.local([hw, -hh]), api.local([hw, hh]), api.local([-hw, hh])]);
        if (lab) lab.set(api.local(o.labelAt || [-0.28 * o.w, 0.12 * o.h]));
        return api;
      },
      body: body, labelHandle: lab
    };
    api.set();
    return api;
  };

  FMA.force = function (p, o) {
    o = o || {};
    var color = o.color || 'ink', fr = color === 'r';
    var mode = o.mode || (fr || color === 'muted' ? 'tail' : 'head');
    var width = o.width || (fr ? 4.2 : 2.6);
    var h = p.line([0, 0], [0, 0], { color: color, width: width, arrow: true, label: o.label || null,
      labelAt: mode === 'head' ? 0 : 1, labelSide: o.labelSide || 'right', anchor: mode === 'head' ? 'end' : 'start' });
    var api = {
      mode: mode,
      set: function (pt, dir, L) {
        var n = Math.hypot(dir[0], dir[1]);
        if (!(n > 1e-12) || !(L > 1e-9)) { h.setVisible(false); return api; }
        var d = [dir[0] / n, dir[1] / n];
        if (fr && o.minLength) L = Math.max(L, o.minLength);
        h.setVisible(true);
        if (mode === 'head') h.set([pt[0] - d[0] * L, pt[1] - d[1] * L], pt);
        else h.set(pt, [pt[0] + d[0] * L, pt[1] + d[1] * L]);
        return api;
      },
      hide: function () { h.setVisible(false); return api; },
      handle: h
    };
    return api;
  };

  FMA.equals = function (p, at) { return p.label(at, '\\Huge =', { color: 'muted' }); };

  FMA.ode = function (f, y0, t0, t1, dt) { return FMA.odeUntil(f, y0, dt, null, t1, t0); };
  FMA.odeUntil = function (f, y0, dt, stop, tmax, t0) {
    t0 = t0 || 0;
    var n = y0.length, T = [t0], Y = [y0.slice()], y = y0.slice(), t = t0, k = 0;
    function add(a, b, s) { var r = []; for (var i = 0; i < n; i++) r.push(a[i] + b[i] * s); return r; }
    while (t < tmax - 1e-12 && k < 2e6) {
      var h = Math.min(dt, tmax - t);
      var k1 = f(t, y), k2 = f(t + h / 2, add(y, k1, h / 2)), k3 = f(t + h / 2, add(y, k2, h / 2)), k4 = f(t + h, add(y, k3, h));
      for (var i = 0; i < n; i++) y[i] += h / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
      t += h; k++;
      T.push(t); Y.push(y.slice());
      if (stop && stop(t, y)) break;
    }
    var N = T.length;
    return {
      t: T, y: Y, duration: T[N - 1] - t0,
      at: function (tq) {
        if (tq <= T[0]) return Y[0].slice();
        if (tq >= T[N - 1]) return Y[N - 1].slice();
        var lo = 0, hi = N - 1;
        while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (T[mid] <= tq) lo = mid; else hi = mid; }
        var u = (tq - T[lo]) / (T[hi] - T[lo] || 1), out = [];
        for (var i = 0; i < n; i++) out.push(Y[lo][i] + (Y[hi][i] - Y[lo][i]) * u);
        return out;
      }
    };
  };

  FMA.niceStep = function (raw) {
    if (!(raw > 0)) return 1;
    var m = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), q = raw / m;
    return (q <= 1 ? 1 : q <= 2 ? 2 : q <= 5 ? 5 : 10) * m;
  };

  window.FMA = FMA;
})(window);
