/*!
 * energy.js — ENERGY: tracks, the motion of a particle along them under gravity, springs, friction and applied
 * forces, energy bookkeeping, animated figures with live energy bars, and line charts, for the Work and Energy
 * module. Classic script (IIFE) that attaches ONE global: ENERGY. Requires CYL (cyl-core.js); ENERGY.figure also
 * needs CYL2D (cyl-2d.js). Load it after them.
 *
 * Color code, the same in every figure, readout and formula: each energy account has a color, and the force
 * that exchanges energy with that account is drawn in the same color.
 *   kinetic energy T, velocity v ................. 'good' (green)      TeX macro \colKE
 *   gravity: weight W and V_g = W y .............. 'z' (blue)          \colVg
 *   springs: spring force F_s and V_e = ½ k s² ... 't' (violet)        \colVe
 *   friction: F_f and the energy it dissipates ... 'r' (orange)        \colF
 *   applied force P, its work and power .......... 'warn' (amber)      \colP
 *   normal force N (no work on a fixed track) .... 'ink'
 *
 * ENERGY.G = 9.81 (m/s²)
 *
 * ENERGY.track(segments, opts) -> track. A path in a vertical plane (x to the right, y up, in meters), traversed in
 *   the order the segments are listed (each starts where the previous one ends):
 *     {line: [[x0, y0], [x1, y1]]}
 *     {arc: {c: [cx, cy], r, a0, a1}}          angles in radians from +x; counter-clockwise when a1 > a0
 *     {bezier: [[x0, y0], [x1, y1], [x2, y2], [x3, y3]]}
 *     {fn: f(x) -> y, x0, x1}                  the graph of a function, from x0 to x1
 *   opts: {ds: 0.005 (sample spacing in m), side: +1}
 *   The arc length s runs from 0 at the start. The left normal n is the unit tangent t turned 90° counter-clockwise.
 *   side: +1 if the particle rides on the LEFT of its direction of travel, so the track pushes it along +n (on top
 *   of a track run left to right; inside a loop run counter-clockwise); −1 for the right side; 0 if it cannot leave
 *   the track (a bead on a wire, a rod).
 *   track: {length, side, minY, maxY, at(s) -> {s, x, y, phi, kappa, t: [tx, ty], n: [nx, ny]}, points(maxN) ->
 *           [[x, y]…] for drawing, between(s0, s1) -> [[x, y]…], nearest([x, y]) -> s, hit(xa, ya, xb, yb) -> {x, y, s, f}|null}
 *
 * ENERGY.simulate(track, p) -> run. The motion along the track, by RK4 in time, under: the weight m g; the normal
 *   force N = m(κv² + g cos φ) along n (it does no work); kinetic friction μk|N| against the sliding (when the speed
 *   reaches zero the particle stays put if the other forces fit within μs|N|); linear springs along the track; and a
 *   constant applied force P along the track over [s0, s1].
 *   p: {m, g: 9.81, s0: 0, v0: 0 (along +t), mu: 0, muS: mu, datum: 0 (the y where V_g = 0),
 *       springs: [{s, k, dir: +1, len: null, wall: true}]  free end at s; dir +1: compressed while the particle is
 *                past s (toward +s), −1: while it is before s. len (natural length) is only used for drawing.
 *       force: {P, s0: −∞, s1: +∞} (along +t), side: track.side, flight: true (leave a one-sided track where N would
 *       have to pull, then fly as a projectile until the path meets the track again), tmax: 20, dt: 0.001}
 *   run: {duration, E0, events: [{t, kind: 'leave' | 'land' | 'rest' | 'end', s, x, y, ...}], p, track,
 *         at(t) -> state {t, s, v (along t), speed, x, y, vx, vy, phi, kappa, N, h, T, Vg, Ve, E, Uf, Up, lost, Fs, Ff,
 *                         P, flight}, extent: {T, Vg, Ve, lost, Up, Vgmin, F, v}, n (samples)}
 *   Energy check: T + Vg + Ve − Uf − Up stays equal to E0 (Uf ≤ 0 is the work of friction, Up that of P).
 *
 * ENERGY.figure(opts) -> controller. An animated scene in a CYL2D plane: the track, the body, springs, the velocity
 *   and force arrows, an optional trace, a transport row under the plot (Play/Pause, Reset, time slider, Playback),
 *   and in the control panel "Show" chips, live energy bars and readouts.
 *   opts: stage (element, required), controls (element), readoutsEl (cards under the stage instead of the panel list),
 *     xRange, yRange (meters; equal scales), height, maxHeight, grid: 'none' | 'cartesian', gridStep, axes: false,
 *     aria (REQUIRED plain-text description),
 *     runs: [{track, params, body: {shape: 'block' | 'ball', w, h, r, anchor: 'center' | 'front' | 'back', side (draw on
 *           this side of a track the particle cannot leave, e.g. +1 for a coaster car on top of its rails), centered: false
 *           (true draws the body's center on the path, e.g. a pendulum bob)}, label, color}]
 *           (or track, params, body for a single run),
 *     show: {v: true, forces: true, trace: false}, toggles: ['v', 'forces', 'trace'],
 *     forces: ['W', 'N', 'Ff', 'Fs', 'P'] (which force arrows), bars: true | false | {items, title},
 *     fbd: 'center' (default: every force arrow starts at the body's center) | 'contact' (free-body style: W ends
 *       at the center of gravity; N ends on the contact face, pushing in from the surface; Fs and P end on the face
 *       they push on; friction, drawn thicker, starts on the contact face and is never drawn too short for its head),
 *     readouts: ['t', 'v', 'h', 'T', 'Vg', 'Ve', 'Uf', 'N', …] (keys of RO), panelTitle,
 *     t0: 0, speed: 1, loop: false, autoplay: false, transport: true, playback: true,
 *     vScale (m of arrow per m/s), fScale (m of arrow per N): automatic when omitted,
 *     decorate(plane, fig): scenery drawn first; onUpdate(states, fig): after every redraw.
 *   controller: {plane, run(i), runs, state(i), states(), t(), setT(t), play(), pause(), reset(), isPlaying(),
 *     setParams(i, params) (re-simulates), setRun(i, {track, params, body}), update(), destroy()}
 *
 * ENERGY.bars(container, opts) -> {el, set(values), setScale(min, max)}: live vertical bars for T, V_g, V_e and the
 *   energy friction has dissipated, plus a stacked "Total" bar that stays at E0 + the work of P.
 *   opts: {items: ['T', 'Vg', 'Ve', 'lost'], total: true, unit: 'J'}
 *
 * ENERGY.ledger(container, opts) -> {el, items, set({start, end, UW, Us, Uf, UP}), setScale(lo, hi)}: the principle of
 *   work and energy as a waterfall: T1, then each work added in turn (bars that float from the running total), then T2,
 *   which lands where the last work ended. opts: {works: ['UW', 'Us', 'Uf', 'UP'] | [{key, label, color}], start: 'T_1',
 *   end: 'T_2', title}. ENERGY.figure uses it instead of the bars with opts.ledger: true | {items, title}.
 *
 * ENERGY.chart(container, opts) -> chart: an SVG line chart with linear axes (from the course's chart library).
 *   opts: {x: {label (HTML/TeX), min, max, ticks, format(v)}, y: {…}, height: 300, ariaLabel (REQUIRED), legend,
 *          pad: {l, r, t, b}, yLabelSide: true}
 *   chart.fn(f, {color, width, dashed, domain, samples, label, labelAt}), chart.area(f, {domain, color,
 *   fillOpacity, base: 0 | f(x)}) (shaded band between f and the base: a constant or a second curve), chart.polyline(pts, {color, width, dashed, fill,
 *   fillOpacity, closed}), chart.points(list, {x, y, color, shape, r, label, title}), chart.vline(x, o), chart.hline(y, o),
 *   chart.marker([x, y], {color, r, ring, label}), chart.text([x, y], text, o); every handle has set(…), setVisible(),
 *   remove(); chart.setAxes({x, y}), chart.clear(), chart.redraw(), chart.toPx([x, y]), chart.setLegend(list)
 *
 * Drawing helpers for scenery: ENERGY.springPoints(a, b, {coils: 9, amp, lead}) -> zigzag points;
 *   ENERGY.hatch(plane, a, b, {side: −1, gap, len, color}) -> handle (ground hatching under the segment a-b);
 *   ENERGY.fillUnder(plane, track, s0, s1, yBase, {color, opacity}) -> handle (a solid under part of a track).
 */
(function (window, document) {
  'use strict';
  if (window.ENERGY) return;
  var CYL = window.CYL;
  var ENERGY = { version: '1.0.0', G: 9.81 };
  var EPS = 1e-9, PI = Math.PI, TAU = 2 * Math.PI;
  var SVGNS = 'http://www.w3.org/2000/svg';
  var hasOwn = Object.prototype.hasOwnProperty;

  function report(msg) {
    try { if (CYL && CYL.error) CYL.error('ENERGY: ' + msg); else if (window.console) console.error('ENERGY: ' + msg); } catch (e) { /* ignore */ }
  }
  function fmt(x, sig) { return CYL ? CYL.fmt(x, sig) : String(+(+x).toPrecision(sig || 4)); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hyp(x, y) { return Math.sqrt(x * x + y * y); }
  function num(v, d) { v = +v; return isFinite(v) ? v : d; }

  /* ================================================================== tracks */
  ENERGY.track = function (segs, opts) {
    opts = opts || {};
    var ds = opts.ds > 0 ? opts.ds : 0.005;
    var X = [], Y = [], K = [], P = [];
    function push(x, y, k, ph) {
      var n = X.length;
      if (n && Math.abs(X[n - 1] - x) < 1e-9 && Math.abs(Y[n - 1] - y) < 1e-9) {
        if (isFinite(k)) K[n - 1] = k;
        if (isFinite(ph)) P[n - 1] = ph;
        return;
      }
      X.push(x); Y.push(y); K.push(k); P.push(ph);
    }
    (segs || []).forEach(function (sg) {
      var i, n;
      if (sg.line) {
        var a = sg.line[0], b = sg.line[1], L = hyp(b[0] - a[0], b[1] - a[1]), ph = Math.atan2(b[1] - a[1], b[0] - a[0]);
        n = Math.max(1, Math.ceil(L / ds));
        for (i = 0; i <= n; i++) push(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n, 0, ph);
      } else if (sg.arc) {
        var c = sg.arc.c, r = sg.arc.r, a0 = sg.arc.a0, a1 = sg.arc.a1, dir = a1 >= a0 ? 1 : -1;
        n = Math.max(2, Math.ceil(r * Math.abs(a1 - a0) / ds));
        for (i = 0; i <= n; i++) {
          var q = a0 + (a1 - a0) * i / n;
          push(c[0] + r * Math.cos(q), c[1] + r * Math.sin(q), dir / r, q + dir * PI / 2);
        }
      } else if (sg.bezier) {
        var B = sg.bezier, len = 0;
        for (i = 0; i < 3; i++) len += hyp(B[i + 1][0] - B[i][0], B[i + 1][1] - B[i][1]);
        n = Math.max(8, Math.ceil(2 * len / ds));
        for (i = 0; i <= n; i++) {
          var u = i / n, w = 1 - u;
          push(w * w * w * B[0][0] + 3 * w * w * u * B[1][0] + 3 * w * u * u * B[2][0] + u * u * u * B[3][0],
               w * w * w * B[0][1] + 3 * w * w * u * B[1][1] + 3 * w * u * u * B[2][1] + u * u * u * B[3][1], NaN, NaN);
        }
      } else if (sg.fn) {
        var x0 = sg.x0, x1 = sg.x1;
        n = Math.max(8, Math.ceil(2 * Math.abs(x1 - x0) / ds));
        for (i = 0; i <= n; i++) { var xx = x0 + (x1 - x0) * i / n; push(xx, sg.fn(xx), NaN, NaN); }
      } else report('track: unknown segment');
    });
    var n = X.length;
    if (n < 2) { report('track: needs at least two points'); X = [0, 1]; Y = [0, 0]; K = [0, 0]; P = [0, 0]; n = 2; }
    var S = new Float64Array(n), PHI = new Float64Array(n), KAP = new Float64Array(n), i;
    for (i = 1; i < n; i++) S[i] = S[i - 1] + hyp(X[i] - X[i - 1], Y[i] - Y[i - 1]);
    for (i = 0; i < n; i++) {
      var ph2 = P[i];
      if (!isFinite(ph2)) {
        var i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
        ph2 = Math.atan2(Y[i1] - Y[i0], X[i1] - X[i0]);
      }
      if (i > 0) { while (ph2 - PHI[i - 1] > PI) ph2 -= TAU; while (ph2 - PHI[i - 1] < -PI) ph2 += TAU; }
      PHI[i] = ph2;
    }
    for (i = 0; i < n; i++) {
      if (isFinite(K[i])) { KAP[i] = K[i]; continue; }
      var j0 = Math.max(0, i - 2), j1 = Math.min(n - 1, i + 2);
      KAP[i] = S[j1] - S[j0] > EPS ? (PHI[j1] - PHI[j0]) / (S[j1] - S[j0]) : 0;
    }
    var L = S[n - 1], minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
    for (i = 0; i < n; i++) { minY = Math.min(minY, Y[i]); maxY = Math.max(maxY, Y[i]); minX = Math.min(minX, X[i]); maxX = Math.max(maxX, X[i]); }
    // bounding boxes of chunks of samples, to find where a flight path meets the track quickly
    var CH = 40, boxes = [];
    for (i = 0; i < n - 1; i += CH) {
      var e = Math.min(n - 1, i + CH), bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
      for (var j = i; j <= e; j++) { bx0 = Math.min(bx0, X[j]); bx1 = Math.max(bx1, X[j]); by0 = Math.min(by0, Y[j]); by1 = Math.max(by1, Y[j]); }
      boxes.push([i, e, bx0, bx1, by0, by1]);
    }
    function idx(s) {
      var lo = 0, hi = n - 1;
      while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (S[mid] <= s) lo = mid; else hi = mid; }
      return lo;
    }
    var tr = {
      length: L, side: opts.side != null ? opts.side : 1, minY: minY, maxY: maxY, minX: minX, maxX: maxX, n: n,
      at: function (s) {
        s = clamp(num(s, 0), 0, L);
        var a = idx(s), b = Math.min(n - 1, a + 1), d = S[b] - S[a], f = d > EPS ? (s - S[a]) / d : 0;
        var phi = PHI[a] + (PHI[b] - PHI[a]) * f, kap = KAP[a] + (KAP[b] - KAP[a]) * f, c = Math.cos(phi), sn = Math.sin(phi);
        return { s: s, x: X[a] + (X[b] - X[a]) * f, y: Y[a] + (Y[b] - Y[a]) * f, phi: phi, kappa: kap, t: [c, sn], n: [-sn, c] };
      },
      points: function (maxN) {
        maxN = maxN || 900;
        var st = Math.max(1, Math.floor(n / maxN)), out = [];
        for (var k = 0; k < n; k += st) out.push([X[k], Y[k]]);
        if ((n - 1) % st) out.push([X[n - 1], Y[n - 1]]);
        return out;
      },
      between: function (s0, s1) {
        var a = tr.at(Math.min(s0, s1)), b = tr.at(Math.max(s0, s1)), out = [[a.x, a.y]];
        for (var k = idx(a.s) + 1; k < n && S[k] < b.s; k++) out.push([X[k], Y[k]]);
        out.push([b.x, b.y]);
        return out;
      },
      nearest: function (p) {
        var best = 0, bd = Infinity;
        for (var k = 0; k < n; k++) { var dd = (X[k] - p[0]) * (X[k] - p[0]) + (Y[k] - p[1]) * (Y[k] - p[1]); if (dd < bd) { bd = dd; best = k; } }
        return S[best];
      },
      // first crossing of the segment A-B with the track: {x, y, s, f (fraction along A-B)} or null
      hit: function (xa, ya, xb, yb) {
        var lo = Math.min(xa, xb), hi = Math.max(xa, xb), lo2 = Math.min(ya, yb), hi2 = Math.max(ya, yb), best = null;
        for (var q = 0; q < boxes.length; q++) {
          var bx = boxes[q];
          if (bx[3] < lo - 1e-9 || bx[2] > hi + 1e-9 || bx[5] < lo2 - 1e-9 || bx[4] > hi2 + 1e-9) continue;
          for (var k = bx[0]; k < bx[1]; k++) {
            var x1 = X[k], y1 = Y[k], x2 = X[k + 1], y2 = Y[k + 1];
            var dxa = xb - xa, dya = yb - ya, dxb = x2 - x1, dyb = y2 - y1, den = dxa * dyb - dya * dxb;
            if (Math.abs(den) < 1e-15) continue;
            var u = ((x1 - xa) * dyb - (y1 - ya) * dxb) / den, w = ((x1 - xa) * dya - (y1 - ya) * dxa) / den;
            if (u >= 0 && u <= 1 && w >= 0 && w <= 1 && (!best || u < best.f)) best = { f: u, x: xa + u * dxa, y: ya + u * dya, s: S[k] + w * (S[k + 1] - S[k]) };
          }
        }
        return best;
      }
    };
    return tr;
  };

  /* ================================================================== simulation */
  ENERGY.simulate = function (tr, p) {
    p = p || {};
    var m = num(p.m, 1) > 0 ? num(p.m, 1) : 1, g = num(p.g, ENERGY.G), mu = Math.max(0, num(p.mu, 0));
    var muS = p.muS == null ? mu : Math.max(0, num(p.muS, mu)), datum = num(p.datum, 0);
    var springs = (p.springs || []).map(function (sp) { return { s: num(sp.s, 0), k: Math.max(0, num(sp.k, 0)), dir: sp.dir === -1 ? -1 : 1 }; });
    var F = p.force && isFinite(p.force.P) ? { P: +p.force.P, s0: p.force.s0 == null ? -Infinity : +p.force.s0, s1: p.force.s1 == null ? Infinity : +p.force.s1 } : null;
    var side = p.side != null ? p.side : tr.side, dt = num(p.dt, 0.001), tmax = num(p.tmax, 20), L = tr.length;
    var flightOK = p.flight !== false && side !== 0;

    function springF(s) { var f = 0; for (var i = 0; i < springs.length; i++) { var sp = springs[i], d = sp.dir * (s - sp.s); if (d > 0) f -= sp.dir * sp.k * d; } return f; }
    function springE(s) { var e = 0; for (var i = 0; i < springs.length; i++) { var sp = springs[i], d = sp.dir * (s - sp.s); if (d > 0) e += 0.5 * sp.k * d * d; } return e; }
    function applied(s) { return F && s >= F.s0 && s <= F.s1 ? F.P : 0; }
    function normalN(G0, v) { return m * (G0.kappa * v * v + g * G0.n[1]); }
    function driveF(G0, s) { return -m * g * G0.t[1] + springF(s) + applied(s); }
    function accel(s, v, sg) { var G0 = tr.at(s); return (driveF(G0, s) - sg * mu * Math.abs(normalN(G0, v))) / m; }
    function stuck(s) { var G0 = tr.at(s); return Math.abs(driveF(G0, s)) <= muS * Math.abs(normalN(G0, 0)) + 1e-9; }

    var A = { t: [], s: [], v: [], x: [], y: [], vx: [], vy: [], phi: [], N: [], Uf: [], Up: [], fl: [] };
    var t = 0, s = clamp(num(p.s0, 0), 0, L), v = num(p.v0, 0), Uf = 0, Up = 0, mode = 'track', events = [];
    var fx = 0, fy = 0, fvx = 0, fvy = 0, fphi = 0, leaveT = 0;
    function rec() {
      A.t.push(t);
      if (mode === 'flight') {
        A.s.push(NaN); A.v.push(NaN); A.x.push(fx); A.y.push(fy); A.vx.push(fvx); A.vy.push(fvy); A.phi.push(fphi); A.N.push(0); A.fl.push(1);
      } else {
        var G0 = tr.at(s);
        A.s.push(s); A.v.push(v); A.x.push(G0.x); A.y.push(G0.y); A.vx.push(v * G0.t[0]); A.vy.push(v * G0.t[1]); A.phi.push(G0.phi); A.N.push(normalN(G0, v)); A.fl.push(0);
      }
      A.Uf.push(Uf); A.Up.push(Up);
    }
    function ev(kind, extra) {
      var o = { t: t, kind: kind, s: mode === 'flight' ? NaN : s, x: A.x[A.x.length - 1], y: A.y[A.y.length - 1] };
      if (extra) for (var k in extra) if (hasOwn.call(extra, k)) o[k] = extra[k];
      events.push(o);
    }
    rec();
    if (Math.abs(v) < 1e-12 && stuck(s)) ev('rest', { start: true });
    else {
      var maxSteps = Math.ceil(tmax / dt) + 10, steps = 0;
      while (t < tmax - 1e-12 && steps++ < maxSteps) {
        if (mode === 'track') {
          var G0 = tr.at(s);
          var sg = v > 1e-12 ? 1 : v < -1e-12 ? -1 : (driveF(G0, s) >= 0 ? 1 : -1);
          var h = Math.min(dt, tmax - t);
          var k1s = v, k1v = accel(s, v, sg);
          var k2s = v + 0.5 * h * k1v, k2v = accel(s + 0.5 * h * k1s, v + 0.5 * h * k1v, sg);
          var k3s = v + 0.5 * h * k2v, k3v = accel(s + 0.5 * h * k2s, v + 0.5 * h * k2v, sg);
          var k4s = v + h * k3v, k4v = accel(s + h * k3s, v + h * k3v, sg);
          var s1 = s + h / 6 * (k1s + 2 * k2s + 2 * k3s + k4s), v1 = v + h / 6 * (k1v + 2 * k2v + 2 * k3v + k4v);
          var crossed = mu > 0 && v1 * sg < 0;            // friction reversed the motion inside the step: stop at v = 0
          if (crossed) {
            var fr = Math.abs(v) / (Math.abs(v) + Math.abs(v1));
            h *= fr; s1 = s + (s1 - s) * fr; v1 = 0;
          }
          var G1 = tr.at(s1);
          Uf -= mu * 0.5 * (Math.abs(normalN(G0, v)) + Math.abs(normalN(G1, v1))) * Math.abs(s1 - s);
          Up += 0.5 * (applied(s) + applied(s1)) * (s1 - s);
          t += h; s = s1; v = v1;
          if (s <= 0 || s >= L) { s = clamp(s, 0, L); rec(); ev('end'); break; }
          if ((crossed || Math.abs(v) < 1e-12) && stuck(s)) { v = 0; rec(); ev('rest'); break; }
          if (flightOK && side * normalN(G1, v) < -1e-9) {
            mode = 'flight'; fx = G1.x; fy = G1.y; fvx = v * G1.t[0]; fvy = v * G1.t[1]; fphi = G1.phi; leaveT = t;
            rec(); ev('leave', { sLeave: s, phi: G1.phi });
            continue;
          }
          rec();
        } else {
          var h2 = Math.min(dt, tmax - t);
          var nx = fx + fvx * h2, ny = fy + fvy * h2 - 0.5 * g * h2 * h2, nvy = fvy - g * h2;
          var hit = t - leaveT > 0.02 ? tr.hit(fx, fy, nx, ny) : null;
          if (hit) {
            var hf = clamp(hit.f, 0, 1);
            t += h2 * hf; fvy = fvy - g * h2 * hf; fx = hit.x; fy = hit.y;
            rec(); ev('land', { sLand: hit.s });
            break;
          }
          fx = nx; fy = ny; fvy = nvy; t += h2;
          rec();
          if (fy < tr.minY - 30) { ev('end'); break; }
        }
      }
    }
    var n = A.t.length, duration = A.t[n - 1];
    function springAt(sv) { return isFinite(sv) ? springE(sv) : 0; }
    var E0 = 0.5 * m * (A.vx[0] * A.vx[0] + A.vy[0] * A.vy[0]) + m * g * (A.y[0] - datum) + springAt(A.s[0]);
    var ext = { T: 0, Vg: -Infinity, Vgmin: Infinity, Ve: 0, lost: 0, Up: 0, Upmin: 0, F: m * g, v: 0, stack: 0, stackMin: 0 };
    for (var q = 0; q < n; q++) {
      var vv2 = A.vx[q] * A.vx[q] + A.vy[q] * A.vy[q], T = 0.5 * m * vv2, Vg = m * g * (A.y[q] - datum), Ve = springAt(A.s[q]);
      ext.T = Math.max(ext.T, T); ext.Vg = Math.max(ext.Vg, Vg); ext.Vgmin = Math.min(ext.Vgmin, Vg); ext.Ve = Math.max(ext.Ve, Ve);
      ext.lost = Math.max(ext.lost, -A.Uf[q]); ext.Up = Math.max(ext.Up, A.Up[q]); ext.Upmin = Math.min(ext.Upmin, A.Up[q]);
      ext.v = Math.max(ext.v, Math.sqrt(vv2));
      ext.stack = Math.max(ext.stack, T + Math.max(0, Vg) + Ve - A.Uf[q]);
      ext.stackMin = Math.min(ext.stackMin, Math.min(0, Vg));
      if (!A.fl[q]) {
        var sq = A.s[q];
        ext.F = Math.max(ext.F, Math.abs(A.N[q]), Math.abs(springF(sq)), Math.abs(applied(sq)), mu * Math.abs(A.N[q]));
      }
    }
    function at(tt) {
      tt = clamp(num(tt, 0), 0, duration);
      var lo = 0, hi = n - 1;
      while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (A.t[mid] <= tt) lo = mid; else hi = mid; }
      var b = Math.min(n - 1, lo + 1), d = A.t[b] - A.t[lo], f = d > 0 ? (tt - A.t[lo]) / d : 0;
      if (A.fl[lo] !== A.fl[b]) f = f < 1 ? 0 : 1;            // never blend a track sample with a flight sample
      function L2(k) { var a = A[k][lo], c = A[k][b]; return a + (c - a) * f; }
      var fl = f >= 1 ? A.fl[b] : A.fl[lo];
      var x = L2('x'), y = L2('y'), vx = L2('vx'), vy = L2('vy'), sv = fl ? NaN : L2('s'), v = fl ? NaN : L2('v');
      var speed = hyp(vx, vy), T = 0.5 * m * speed * speed, Vg = m * g * (y - datum), Ve = fl ? 0 : springE(sv);
      var N = fl ? 0 : L2('N'), Uf = L2('Uf'), Up = L2('Up');
      var G0 = fl ? null : tr.at(sv);
      var sgn = fl ? 0 : (v > 1e-9 ? 1 : v < -1e-9 ? -1 : 0);
      var Fd = fl ? 0 : driveF(G0, sv);
      var Ff = 0;
      if (!fl) {
        if (sgn) Ff = -sgn * mu * Math.abs(N);
        else if (Math.abs(Fd) <= muS * Math.abs(N) + 1e-9) Ff = -Fd;                 // at rest and held: static friction
        else Ff = -(Fd > 0 ? 1 : -1) * mu * Math.abs(N);                             // just starting to slide
      }
      return {
        t: tt, s: sv, v: v, speed: speed, x: x, y: y, vx: vx, vy: vy, phi: L2('phi'), kappa: G0 ? G0.kappa : 0,
        tvec: G0 ? G0.t : [Math.cos(L2('phi')), Math.sin(L2('phi'))], nvec: G0 ? G0.n : [-Math.sin(L2('phi')), Math.cos(L2('phi'))],
        N: N, h: y - datum, T: T, Vg: Vg, Ve: Ve, E: T + Vg + Ve, Uf: Uf, Up: Up, lost: -Uf,
        Fs: fl ? 0 : springF(sv), Ff: Ff, P: fl ? 0 : applied(sv), W: m * g, flight: !!fl, m: m, g: g
      };
    }
    return {
      duration: duration, E0: E0, events: events, p: p, track: tr, m: m, g: g, mu: mu, datum: datum, n: n, extent: ext,
      at: at, samples: A, springs: springs,
      event: function (kind) { for (var k = 0; k < events.length; k++) if (events[k].kind === kind) return events[k]; return null; }
    };
  };

  /* ================================================================== drawing helpers */
  ENERGY.springPoints = function (a, b, o) {
    o = o || {};
    var dx = b[0] - a[0], dy = b[1] - a[1], L = hyp(dx, dy);
    if (!(L > EPS)) return [a, b];
    var ux = dx / L, uy = dy / L, nx = -uy, ny = ux, coils = o.coils || 9, amp = o.amp || 0.06;
    var lead = Math.min(o.lead != null ? o.lead : L * 0.08, L * 0.25), pts = [a.slice(0, 2), [a[0] + ux * lead, a[1] + uy * lead]];
    var zl = L - 2 * lead, zz = coils * 2;
    for (var i = 1; i < zz; i++) {
      var d = lead + zl * i / zz, sgn = i % 2 ? 1 : -1;
      pts.push([a[0] + ux * d + nx * amp * sgn, a[1] + uy * d + ny * amp * sgn]);
    }
    pts.push([b[0] - ux * lead, b[1] - uy * lead]);
    pts.push(b.slice(0, 2));
    return pts;
  };
  ENERGY.hatch = function (plane, a, b, o) {
    o = o || {};
    var dx = b[0] - a[0], dy = b[1] - a[1], L = hyp(dx, dy), g = plane.group();
    if (!(L > EPS)) return g;
    var ux = dx / L, uy = dy / L, side = o.side || -1, nx = -uy * side, ny = ux * side;
    var gap = o.gap || L / 24, len = o.len || gap * 0.9, n = Math.floor(L / gap);
    for (var i = 0; i <= n; i++) {
      var px = a[0] + ux * i * gap, py = a[1] + uy * i * gap;
      g.line([px, py], [px + nx * len - ux * len * 0.6, py + ny * len - uy * len * 0.6], { color: o.color || 'muted', width: 1 });
    }
    return g;
  };
  ENERGY.fillUnder = function (plane, tr, s0, s1, yBase, o) {
    o = o || {};
    var pts = tr.between(s0, s1);
    pts.push([pts[pts.length - 1][0], yBase]);
    pts.push([pts[0][0], yBase]);
    return plane.polyline(pts, { closed: true, color: o.color || 'surface', width: 0, fill: o.color || 'surface', fillOpacity: o.opacity == null ? 0.22 : o.opacity });
  };

  /* ================================================================== energy bars */
  var BAR_DEF = {
    T: { label: 'T', color: 'good', name: 'Kinetic energy' },
    Vg: { label: 'V_g', color: 'z', name: 'Gravitational potential energy' },
    Ve: { label: 'V_e', color: 't', name: 'Elastic potential energy' },
    lost: { label: '\\text{lost}', color: 'r', name: 'Energy dissipated by friction' },
    Up: { label: 'U_P', color: 'warn', name: 'Work done by the applied force' }
  };
  function cssVar(c) {
    var map = { good: '--c-good', z: '--c-z', t: '--c-t', r: '--c-r', warn: '--c-warn', ink: '--ink', muted: '--ink-muted', accent: '--accent', bad: '--c-bad' };
    return 'var(' + (map[c] || '--accent') + ')';
  }
  ENERGY.bars = function (container, o) {
    o = o || {};
    var items = (o.items || ['T', 'Vg', 'Ve', 'lost']).filter(function (k) { return BAR_DEF[k]; });
    var total = o.total !== false, unit = o.unit || 'J';
    var wrap = CYL.el('div', { class: 'eb', role: 'group', 'aria-label': o.ariaLabel || 'Energy bars' });
    var plot = CYL.el('div', { class: 'eb-plot' });
    var zero = CYL.el('div', { class: 'eb-zero' }), ref = CYL.el('div', { class: 'eb-ref' });
    var refLab = CYL.el('span', { class: 'eb-ref-label' });
    ref.appendChild(refLab);
    plot.appendChild(zero);
    var cols = {}, labels = CYL.el('div', { class: 'eb-labels' });
    function col(key, def) {
      var c = CYL.el('div', { class: 'eb-col' });
      c.style.setProperty('--eb', cssVar(def.color));
      var fill = CYL.el('div', { class: 'eb-fill' }), val = CYL.el('span', { class: 'eb-val' });
      c.appendChild(fill); c.appendChild(val);
      plot.appendChild(c);
      labels.appendChild(CYL.el('span', { class: 'eb-label', html: '\\(' + def.label + '\\)', title: def.name }));
      cols[key] = { el: c, fill: fill, val: val };
    }
    items.forEach(function (k) { col(k, BAR_DEF[k]); });
    var stack = null;
    if (total) {
      stack = CYL.el('div', { class: 'eb-col eb-stack' });
      var segs = {};
      ['lost', 'Ve', 'Vg', 'T'].forEach(function (k) {
        if (items.indexOf(k) < 0) return;
        var sgm = CYL.el('div', { class: 'eb-seg' });
        sgm.style.setProperty('--eb', cssVar(BAR_DEF[k].color));
        stack.appendChild(sgm);
        segs[k] = sgm;
      });
      stack.segs = segs;
      plot.appendChild(stack);
      labels.appendChild(CYL.el('span', { class: 'eb-label', text: 'Total', title: 'Energy accounted for: the sum of the bars' }));
    }
    plot.appendChild(ref);
    wrap.appendChild(plot);
    wrap.appendChild(labels);
    if (o.title) wrap.insertBefore(CYL.el('p', { class: 'viz-title', text: o.title }), plot);
    container.appendChild(wrap);
    CYL.renderMath(labels);
    var lo = 0, hi = 1;
    function pos(v) { return clamp((v - lo) / (hi - lo), 0, 1) * 100; }
    var api = {
      el: wrap,
      setScale: function (a, b) { lo = Math.min(0, a); hi = Math.max(b, lo + 1e-9); zero.style.bottom = pos(0) + '%'; return api; },
      set: function (vals, ref0) {
        var z = pos(0);
        items.forEach(function (k) {
          var v = num(vals[k], 0), c = cols[k], top = pos(Math.max(0, v)), bot = pos(Math.min(0, v));
          c.fill.style.bottom = bot + '%';
          c.fill.style.height = Math.max(0, top - bot) + '%';
          c.val.textContent = fmt(Math.abs(v) < 5e-4 * (hi - lo) ? 0 : v, 3);
          c.val.style.bottom = (v >= 0 ? top : z) + '%';
        });
        if (stack) {
          var up = 0, down = 0;
          ['T', 'Vg', 'Ve', 'lost'].forEach(function (k) {
            var sgm = stack.segs[k];
            if (!sgm) return;
            var v = num(vals[k], 0);
            if (v >= 0) { sgm.style.bottom = pos(up) + '%'; sgm.style.height = (pos(up + v) - pos(up)) + '%'; up += v; }
            else { sgm.style.bottom = pos(down + v) + '%'; sgm.style.height = (pos(down) - pos(down + v)) + '%'; down += v; }
          });
          if (ref0 != null && isFinite(ref0)) {
            ref.hidden = false;
            ref.style.bottom = pos(ref0) + '%';
            refLab.textContent = fmt(ref0, 3) + ' ' + unit;
          } else ref.hidden = true;
        }
        return api;
      }
    };
    api.setScale(0, 1);
    return api;
  };

  /* ================================================================== the work ledger: T1 + ΣU = T2 as a waterfall */
  var LEDGER_DEF = {
    UW: { label: 'U_W', color: 'z', name: 'Work of the weight' },
    Us: { label: 'U_s', color: 't', name: 'Work of the spring' },
    Uf: { label: 'U_f', color: 'r', name: 'Work of friction' },
    UP: { label: 'U_P', color: 'warn', name: 'Work of the applied force' },
    UN: { label: 'U_N', color: 'ink', name: 'Work of the normal force' }
  };
  ENERGY.LEDGER = LEDGER_DEF;
  // opts: {works: ['UW', 'Us', 'Uf', 'UP'] or [{key, label, color, name}], start: 'T_1', end: 'T_2', unit: 'J', title}
  ENERGY.ledger = function (container, o) {
    o = o || {};
    var works = (o.works || ['UW']).map(function (w) { return typeof w === 'string' ? Object.assign({ key: w }, LEDGER_DEF[w]) : w; });
    var unit = o.unit || 'J';
    var wrap = CYL.el('div', { class: 'lg', role: 'group', 'aria-label': o.ariaLabel || 'Work and energy ledger' });
    if (o.title) wrap.appendChild(CYL.el('p', { class: 'viz-title', text: o.title }));
    var rows = [];
    function row(label, color, kind) {
      var r = CYL.el('div', { class: 'lg-row lg-' + kind });
      var lab = CYL.el('span', { class: 'lg-label', html: '\\(' + label + '\\)' });
      var track = CYL.el('div', { class: 'lg-track' }), bar = CYL.el('div', { class: 'lg-bar' }), val = CYL.el('span', { class: 'lg-val' });
      bar.style.setProperty('--lg', cssVar(color));
      track.appendChild(CYL.el('div', { class: 'lg-zero' }));
      track.appendChild(bar);
      r.appendChild(lab); r.appendChild(track); r.appendChild(val);
      wrap.appendChild(r);
      var it = { el: r, bar: bar, val: val, track: track };
      rows.push(it);
      return it;
    }
    var rStart = row(o.start || 'T_1', 'good', 'start');
    var rWork = works.map(function (w) { return row(w.label, w.color, 'work'); });
    var rEnd = row(o.end || 'T_2', 'good', 'end');
    container.appendChild(wrap);
    CYL.renderMath(wrap);
    var lo = 0, hi = 1;
    function pc(v) { return clamp((v - lo) / (hi - lo), 0, 1) * 100; }
    function place(it, a, b, v) {
      var x0 = pc(Math.min(a, b)), x1 = pc(Math.max(a, b));
      it.bar.style.left = x0 + '%';
      it.bar.style.width = Math.max(0.4, x1 - x0) + '%';
      it.val.textContent = (v > 0 && it !== rStart && it !== rEnd ? '+' : '') + fmt(Math.abs(v) < 5e-4 * (hi - lo) ? 0 : v, 3) + '\u00a0' + unit;
      Array.prototype.forEach.call(it.track.querySelectorAll('.lg-zero'), function (z) { z.style.left = pc(0) + '%'; });
    }
    var api = {
      el: wrap, items: works.map(function (w) { return w.key; }),
      setScale: function (a, b) { lo = Math.min(0, a); hi = Math.max(b, lo + 1e-9); return api; },
      set: function (v) {
        var cum = num(v.start, 0);
        place(rStart, 0, cum, cum);
        works.forEach(function (w, i) { var u = num(v[w.key], 0); place(rWork[i], cum, cum + u, u); cum += u; });
        place(rEnd, 0, num(v.end, cum), num(v.end, cum));
        return api;
      }
    };
    return api;
  };

  /* ================================================================== the animated figure */
  var ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 5.2v13.6L18.6 12z"/></svg>';
  var ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M6.8 5h3.6v14H6.8zM13.6 5h3.6v14h-3.6z"/></svg>';
  var ICON_RESET = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4.2h4.2"/></svg>';
  function niceStep(raw) {
    if (!(raw > 0)) return 0.01;
    var m = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), q = raw / m;
    return (q <= 1 ? 1 : q <= 2 ? 2 : q <= 5 ? 5 : 10) * m;
  }
  // The transport row (shared design with the Cylindrical Coordinates module's motion figures).
  // ctx: {stage, o, getT(), setT(t), range() -> [t0, t1], drive(fn(dt) -> false to stop) -> stop()}
  function makeTransport(ctx) {
    var o = ctx.o, stop = null, rate = 1, playLabel = null, playBtn = null, tSlider = null;
    function hund(x) { return Math.round(x * 100) / 100; }
    function syncPlay() {
      if (!playBtn) return;
      var rg = ctx.range();
      var key = stop ? 'Pause' : (!o.loop && ctx.getT() >= rg[1] - 1e-9 ? 'Replay' : 'Play');
      if (key === playLabel) return;
      playLabel = key;
      playBtn.innerHTML = (stop ? ICON_PAUSE : ICON_PLAY) + '<span>' + key + '</span>';
    }
    function play() {
      if (stop) return;
      var rg = ctx.range();
      if (!(rg[1] - rg[0] > 1e-9)) return;
      if (ctx.getT() >= rg[1] - 1e-9) ctx.setT(rg[0]);
      stop = ctx.drive(function (dt) {
        var r2 = ctx.range(), t = ctx.getT() + dt * o.speed * rate, ended = false;
        if (t >= r2[1]) {
          if (o.loop) t = r2[0] + (t - r2[1]) % Math.max(EPS, r2[1] - r2[0]);
          else { t = r2[1]; ended = true; }
        }
        ctx.setT(t);
        if (ended) { stop = null; syncPlay(); return false; }
      });
      syncPlay();
    }
    function pause() {
      if (stop) {
        stop(); stop = null;
        var rg = ctx.range();
        ctx.setT(Math.min(rg[1], Math.max(rg[0], hund(ctx.getT()))));
      }
      syncPlay();
    }
    function reset() { pause(); ctx.setT(ctx.range()[0]); }
    var api = { play: play, pause: pause, reset: reset, isPlaying: function () { return !!stop; }, syncPlay: syncPlay, syncSlider: function () {} };
    if (!o.transport) return api;
    var bar = CYL.el('div', { class: 'mf-transport' });
    playBtn = CYL.button(ICON_PLAY + '<span>Play</span>', function () { if (stop) pause(); else play(); }, { primary: true });
    var resetBtn = CYL.button(ICON_RESET + '<span>Reset</span>', function () { reset(); });
    function tText(t) { return CYL.fmtFixed(hund(t), 2) + ' ' + (o.timeUnit || 's'); }   // o.timeUnit: 'ms' for a slow-motion clock
    tSlider = CYL.slider({
      label: 'Time \\(t\\)', min: 0, max: 1, step: 'any', value: 0,
      format: function (u) { var rg = ctx.range(); return tText(rg[0] + u * (rg[1] - rg[0])); },
      onInput: function (u) { pause(); var rg = ctx.range(); ctx.setT(Math.min(rg[1], hund(rg[0] + u * (rg[1] - rg[0])))); }
    });
    tSlider.input.addEventListener('keydown', function (e) {
      var rg = ctx.range(), T = rg[1] - rg[0];
      if (e.altKey || e.ctrlKey || e.metaKey || !(T > 1e-9)) return;
      var st = niceStep(T / 50), t = ctx.getT() - rg[0], nt;
      if (e.shiftKey) st = st / 5;
      switch (e.key) {
        case 'ArrowRight': case 'ArrowUp': nt = (Math.floor(t / st + 1e-6) + 1) * st; break;
        case 'ArrowLeft': case 'ArrowDown': nt = (Math.ceil(t / st - 1e-6) - 1) * st; break;
        case 'PageUp': nt = (Math.floor(t / (10 * st) + 1e-6) + 1) * 10 * st; break;
        case 'PageDown': nt = (Math.ceil(t / (10 * st) - 1e-6) - 1) * 10 * st; break;
        case 'Home': nt = 0; break;
        case 'End': nt = T; break;
        default: return;
      }
      e.preventDefault();
      pause();
      ctx.setT(rg[0] + Math.min(T, Math.max(0, hund(nt))));
    });
    bar.appendChild(playBtn);
    bar.appendChild(resetBtn);
    bar.appendChild(tSlider.el);
    if (o.playback) {
      var rates = o.playbackRates || [0.25, 0.5, 1, 2];
      var speedSel = CYL.select({
        label: 'Playback',
        options: rates.map(function (x) { return { value: x, label: CYL.fmt(x) + '×' }; }),
        value: rates.indexOf(1) >= 0 ? 1 : rates[0],
        onChange: function (x) { rate = x; }
      });
      rate = speedSel.get();
      speedSel.el.classList.add('inline');
      bar.appendChild(speedSel.el);
    }
    var host = ctx.stage.parentNode, main = host;
    if (host && !host.classList.contains('mf-main')) {
      main = document.createElement('div');
      main.className = 'mf-main';
      host.insertBefore(main, ctx.stage);
      main.appendChild(ctx.stage);
    }
    if (main) {
      Array.prototype.forEach.call(main.querySelectorAll(':scope > .mf-transport'), function (nd) { nd.remove(); });
      main.appendChild(bar);
    } else ctx.stage.appendChild(bar);
    api.syncSlider = function () {
      var rg = ctx.range(), T = rg[1] - rg[0], t = ctx.getT();
      var u = T > 0 ? (t - rg[0]) / T : 0;
      if (tText(rg[0] + tSlider.get() * T) !== tText(t) || Math.abs(tSlider.get() - u) > 0.02) tSlider.set(u, true);
      playBtn.disabled = !(T > 1e-9);
      tSlider.input.disabled = !(T > 1e-9);
    };
    api.refreshSlider = function () { tSlider.set(tSlider.get(), true); };
    api.bar = bar;
    syncPlay();
    return api;
  }
  ENERGY._makeTransport = makeTransport;

  // Live numbers. key: [label, color, value(state, run) -> number, unit]
  var RO = {
    t: ['Time \\(t\\)', null, function (s) { return s.t; }, 's'],
    s: ['Distance along the path \\(s\\)', null, function (s) { return s.s; }, 'm'],
    v: ['Speed \\(v\\)', 'good', function (s) { return s.speed; }, 'm/s'],
    h: ['Height \\(y\\) above the datum', 'z', function (s) { return s.h; }, 'm'],
    T: ['\\(T = \\tfrac12 mv^2\\)', 'good', function (s) { return s.T; }, 'J'],
    Vg: ['\\(V_g = Wy\\)', 'z', function (s) { return s.Vg; }, 'J'],
    Ve: ['\\(V_e = \\tfrac12 ks^2\\)', 't', function (s) { return s.Ve; }, 'J'],
    E: ['\\(T + V_g + V_e\\)', null, function (s) { return s.E; }, 'J'],
    Uf: ['Work of friction \\(U_f\\)', 'r', function (s) { return s.Uf; }, 'J'],
    Up: ['Work of \\(P\\)', 'warn', function (s) { return s.Up; }, 'J'],
    N: ['Normal force \\(N\\)', null, function (s, run) { return s.flight ? 0 : (run.p.side != null ? run.p.side : run.track.side) === -1 ? -s.N : s.N; }, 'N'],
    Fs: ['Spring force \\(F_s\\)', 't', function (s) { return Math.abs(s.Fs); }, 'N'],
    Ff: ['Friction force \\(F_f\\)', 'r', function (s) { return Math.abs(s.Ff); }, 'N']
  };
  ENERGY.READOUTS = RO;

  ENERGY.figure = function (opts) {
    var o = Object.assign({
      t0: 0, speed: 1, loop: false, autoplay: false, transport: true, playback: true,
      grid: 'none', axes: false, maxHeight: 460, bars: true,
      forces: ['W', 'N', 'Ff', 'Fs', 'P'], toggles: ['v', 'forces'], readouts: ['t', 'v', 'h', 'T', 'Vg', 'Uf']
    }, opts || {});
    if (!o.stage) { report('figure: opts.stage is required'); return null; }
    if (!window.CYL2D) { report('figure: CYL2D (cyl-2d.js) is not loaded'); return null; }
    if (!o.aria) report('figure: opts.aria (a plain-text description) is required');
    var show = Object.assign({ v: true, forces: true, trace: false }, o.show);
    var runs = (o.runs || [{ track: o.track, params: o.params, body: o.body, label: o.label }]).map(function (r) {
      return { track: r.track, params: r.params || {}, body: Object.assign({ shape: 'block', w: 0.4, h: 0.25, r: 0.12, anchor: 'center' }, r.body),
        label: r.label || null, color: r.color || 'accent', trace: r.trace, run: null, h: {} };
    });
    var xspan = o.xRange[1] - o.xRange[0], yspan = o.yRange[1] - o.yRange[0];
    function baseHeight() {
      if (o.height) return o.height;
      var w = o.stage.clientWidth || 600;
      return Math.round(Math.min(o.maxHeight, Math.max(200, w * yspan / xspan)));
    }
    var curH = baseHeight();
    var p = CYL2D.plane(o.stage, {
      xRange: o.xRange, yRange: o.yRange, grid: o.grid, gridStep: o.gridStep, axes: o.axes, ticks: o.axes ? true : false,
      axisLabels: o.axisLabels || null, height: curH, maxHeight: Math.max(o.maxHeight, 900), ariaLabel: o.aria || 'Animated figure'
    });
    var span = Math.min(o.xRange[1] - o.xRange[0], o.yRange[1] - o.yRange[0]);
    var fig = { plane: p, runs: runs };
    if (o.decorate) { try { o.decorate(p, fig); } catch (e) { report('figure: decorate failed: ' + e.message); } }

    /* ----- per-run drawings ----- */
    var contactFbd = o.fbd === 'contact';
    function bodyOffset(r) { var b = r.body; return b.centered ? 0 : b.shape === 'ball' ? b.r : b.h / 2; }   // centered: on the path (a bob)
    runs.forEach(function (r) {
      var gTrack = p.group(), gSpr = p.group(), gBody = p.group(), gArr = p.group();
      r.h = { gTrack: gTrack, gSpr: gSpr, gBody: gBody, gArr: gArr, springs: [], walls: [] };
      r.h.path = gTrack.polyline([[0, 0], [1, 0]], { color: 'ink', width: 2.6 });
      r.h.trace = gTrack.polyline([], { color: r.color, width: 2, dashed: true });
      if (r.body.shape === 'ball') r.h.body = gBody.circle({ center: [0, 0], r: r.body.r, color: 'ink', width: 1.6, fill: r.color, fillOpacity: 0.55 });
      else r.h.body = gBody.polyline([[0, 0], [1, 0], [1, 1]], { closed: true, color: 'ink', width: 1.6, fill: r.color, fillOpacity: 0.28 });
      r.h.v = gArr.line([0, 0], [0, 0], { color: 'good', width: 3, arrow: true, label: '\\vvec', labelAt: 1, labelSide: 'left' });
      var F = {}, la = contactFbd ? 0 : 1;           // contact style: the label sits at the tail, away from the body
      F.W = gArr.line([0, 0], [0, 0], { color: 'z', width: 2.6, arrow: true, label: 'W', labelAt: la, labelSide: 'right' });
      F.N = gArr.line([0, 0], [0, 0], { color: 'ink', width: 2.6, arrow: true, label: 'N', labelAt: la, labelSide: contactFbd ? 'right' : 'left' });
      F.Ff = gArr.line([0, 0], [0, 0], { color: 'r', width: contactFbd ? 4.2 : 2.6, arrow: true, label: 'F_f', labelAt: 1, labelSide: contactFbd ? 'left' : 'right' });
      F.Fs = gArr.line([0, 0], [0, 0], { color: 't', width: 2.6, arrow: true, label: 'F_s', labelAt: la, labelSide: 'left' });
      F.P = gArr.line([0, 0], [0, 0], { color: 'warn', width: 2.6, arrow: true, label: 'P', labelAt: la, labelSide: 'left' });
      r.h.F = F;
      if (r.label) r.h.label = gBody.label([0, 0], r.label, { anchor: 'n', offset: [0, -6], color: r.color, tex: false });
    });

    function drawStatic(r) {
      r.h.path.set(r.track.points());
      r.h.springs.forEach(function (h) { h.remove(); });
      r.h.walls.forEach(function (h) { h.remove(); });
      r.h.springs = []; r.h.walls = [];
      (r.params.springs || []).forEach(function (sp) {
        r.h.springs.push(r.h.gSpr.polyline([], { color: 't', width: 2 }));
        if (sp.wall !== false && sp.len > 0) {
          var dir = sp.dir === -1 ? -1 : 1, sw = r.track.at(sp.s + dir * sp.len), side = r.params.side != null ? r.params.side : r.track.side || 1;
          var off = bodyOffset(r) * 2.2, a = [sw.x, sw.y], b = [sw.x + sw.n[0] * side * off, sw.y + sw.n[1] * side * off];
          r.h.walls.push(r.h.gSpr.line(a, b, { color: 'ink', width: 4 }));
        }
      });
    }

    /* ----- scales ----- */
    var vScale = o.vScale || 0, fScale = o.fScale || 0, capV = (o.arrowMax || 0.5) * span, capF = (o.arrowMax || 0.5) * span;
    function autoScales() {
      var vmax = 0, wmax = 0, fmax = 0;
      runs.forEach(function (r) { vmax = Math.max(vmax, r.run.extent.v); wmax = Math.max(wmax, r.run.m * r.run.g); fmax = Math.max(fmax, r.run.extent.F); });
      if (!o.vScale) vScale = vmax > EPS ? 0.3 * span / vmax : 0.1;
      // the weight is drawn at about a fifth of the scene, so a stiff spring's large force does not shrink every
      // other arrow; any arrow longer than arrowMax × the scene is drawn at that length (the readouts give its size)
      if (!o.fScale) fScale = wmax > EPS ? Math.min(0.2 * span / wmax, fmax > EPS ? 0.45 * span / fmax * 3 : Infinity) : 0.01;
    }

    /* ----- control panel: chips, bars, readouts ----- */
    var panel = o.controls || null, ctl = {}, bars = null, ledger = null, ro = {};
    if (panel) {
      if (o.panelTitle) panel.appendChild(CYL.el('p', { class: 'viz-title', text: o.panelTitle }));
      if (o.toggles && o.toggles.length) {
        var LBL = { v: ['Velocity', 'good'], forces: ['Forces', 'r'], trace: ['Trace', 'accent'] };
        var row = CYL.el('div', { class: 'chip-row', role: 'group', 'aria-label': 'Show' });
        o.toggles.forEach(function (k) {
          if (!LBL[k]) return;
          ctl[k] = CYL.toggle({ label: LBL[k][0], color: LBL[k][1], value: !!show[k], onChange: function (on) { show[k] = on; sync(); } });
          row.appendChild(ctl[k].el);
        });
        panel.appendChild(CYL.el('p', { class: 'mf-show-label', text: 'Show' }));
        panel.appendChild(row);
      }
      if (o.ledger) {
        var lo2 = typeof o.ledger === 'object' ? o.ledger : {};
        ledger = ENERGY.ledger(panel, { works: lo2.items || ledgerItems(), title: lo2.title || 'Work and energy (J)' });
      } else if (o.bars) {
        var bo = typeof o.bars === 'object' ? o.bars : {};
        bars = ENERGY.bars(panel, { items: bo.items || barItems(), title: bo.title || 'Energy (J)', total: bo.total !== false });
      }
      var keys = (o.readouts || []).filter(function (k) { return RO[k]; });
      if (keys.length) {
        var grid = CYL.el('div', { class: 'readout-grid', 'aria-live': 'off' });
        keys.forEach(function (k) {
          ro[k] = CYL.readout(RO[k][0], { color: RO[k][1] || null });
          grid.appendChild(ro[k].el);
        });
        (o.readoutsEl || panel).appendChild(grid);
      }
    }
    function barItems() {
      var it = ['T', 'Vg'], p0 = runs[0].params;
      if ((p0.springs || []).length) it.push('Ve');
      if ((p0.mu || 0) > 0) it.push('lost');
      return it;
    }
    function ledgerItems() {
      var it = ['UW'], p0 = runs[0].params;
      if ((p0.springs || []).length) it.push('Us');
      if ((p0.mu || 0) > 0) it.push('Uf');
      if (p0.force) it.push('UP');
      return it;
    }
    function ledgerVals(s, run) {
      var s0 = run.at(0);
      return { start: s0.T, end: s.T, UW: s0.Vg - s.Vg, Us: s0.Ve - s.Ve, Uf: s.Uf, UP: s.Up };
    }
    function ledgerScale() {
      if (!ledger) return;
      var r = runs[0].run, lo = 0, hi = 0;
      for (var q = 0; q <= 120; q++) {
        var v = ledgerVals(r.at(r.duration * q / 120), r), cum = v.start;
        hi = Math.max(hi, cum, v.end);
        ledger.items.forEach(function (k) { cum += v[k] || 0; lo = Math.min(lo, cum); hi = Math.max(hi, cum); });
      }
      ledger.setScale(lo, hi * 1.04 + 1e-9);
    }
    function barScale() {
      ledgerScale();
      if (!bars) return;
      var r = runs[0].run, e = r.extent;
      var hiV = Math.max(e.T, e.Vg, e.Ve, e.lost, e.stack, r.E0 + Math.max(0, e.Up)), loV = Math.min(0, e.Vgmin, e.stackMin);
      bars.setScale(loV, hiV * 1.05);
    }

    /* ----- simulate ----- */
    function simulateRun(r) {
      r.run = ENERGY.simulate(r.track, r.params);
      return r.run;
    }
    runs.forEach(function (r) { simulateRun(r); drawStatic(r); });
    autoScales();
    barScale();
    var t = o.t0, t1 = 0;
    function updateRange() { t1 = 0; runs.forEach(function (r) { t1 = Math.max(t1, r.run.duration); }); }
    updateRange();

    /* ----- redraw ----- */
    var states = [];
    function add(P, d, k) { return [P[0] + d[0] * k, P[1] + d[1] * k]; }
    function sync() {
      states = runs.map(function (r) { return r.run.at(Math.min(t, r.run.duration)); });
      runs.forEach(function (r, i) {
        var s = states[i], b = r.body, side = r.params.side != null ? r.params.side : r.track.side;
        var sd = b.side != null ? b.side : side === 0 ? 0 : side, tv = s.tvec, nv = s.nvec, off = bodyOffset(r);   // body.side: draw on that side of a two-sided track
        var C;
        if (!s.flight) {
          var shift = b.shape === 'block' ? (b.anchor === 'front' ? -b.w / 2 : b.anchor === 'back' ? b.w / 2 : 0) : 0;
          C = [s.x + nv[0] * sd * off + tv[0] * shift, s.y + nv[1] * sd * off + tv[1] * shift];
          r.flightOff = [C[0] - s.x, C[1] - s.y];
        } else {
          var fo = r.flightOff || [0, 0];
          C = [s.x + fo[0], s.y + fo[1]];
        }
        r.center = C;
        if (b.shape === 'ball') r.h.body.set({ center: C, r: b.r });
        else {
          var hw = b.w / 2, hh = b.h / 2;
          r.h.body.set([add(add(C, tv, -hw), nv, -hh), add(add(C, tv, hw), nv, -hh), add(add(C, tv, hw), nv, hh), add(add(C, tv, -hw), nv, hh)]);
        }
        if (r.h.label) r.h.label.set([C[0], C[1] + off]);
        // springs
        (r.params.springs || []).forEach(function (sp, k) {
          var h = r.h.springs[k];
          if (!h) return;
          if (!(sp.len > 0)) { h.set([]); return; }
          var dir = sp.dir === -1 ? -1 : 1, sw = sp.s + dir * sp.len;
          var comp = s.flight ? 0 : Math.max(0, dir * (s.s - sp.s)), send = sp.s + dir * comp;
          var A0 = r.track.at(sw), B0 = r.track.at(send), so = sd * off;
          var a = [A0.x + A0.n[0] * so, A0.y + A0.n[1] * so], bb = [B0.x + B0.n[0] * so, B0.y + B0.n[1] * so];
          if (b.shape === 'block' && !s.flight && comp > 0) bb = add(C, tv, dir * b.w / 2);
          h.set(ENERGY.springPoints(a, bb, { coils: sp.coils || 9, amp: Math.min(off * 0.7, 0.35 * span / 6) }));
        });
        // trace
        var showTrace = show.trace || r.trace === true || (r.trace !== false && s.flight);
        if (showTrace) {
          var A = r.run.samples, pts = [], fo2 = r.flightOff || [0, 0];
          for (var q = 0; q < r.run.n && A.t[q] <= t; q += 5) pts.push(A.fl[q] ? [A.x[q] + fo2[0], A.y[q] + fo2[1]] : null);
          r.h.trace.set(pts.filter(Boolean).concat([C]));
        } else r.h.trace.set([]);
        // arrows
        var vlen = s.speed * vScale, vk = vlen > capV ? capV / s.speed : vScale;
        r.h.v.setVisible(show.v && vlen > 1e-6);
        if (vlen > 1e-6) r.h.v.set(C, [C[0] + s.vx * vk, C[1] + s.vy * vk]);
        var F = r.h.F, on = show.forces;
        // contact style: where each force acts (its arrowhead ends there)
        var halfT = b.shape === 'ball' ? b.r : b.w / 2;
        var P0 = add(C, nv, -sd * off);                   // middle of the face on the track
        function arrow(key, dirv, mag) {
          var h = F[key], L = Math.min(capF, mag * fScale);
          var visible = on && o.forces.indexOf(key) >= 0 && L > 1e-6 && isFinite(L);
          h.setVisible(visible);
          if (!visible) return;
          if (!contactFbd) { h.set(C, [C[0] + dirv[0] * L, C[1] + dirv[1] * L]); return; }
          if (key === 'Ff') {                              // friction: tail on the contact face, at least 6% of the scene
            var Lf = Math.max(L, 0.06 * span);
            h.set(P0, [P0[0] + dirv[0] * Lf, P0[1] + dirv[1] * Lf]);
            return;
          }
          var at = key === 'W' ? C : key === 'N' ? P0 : add(C, dirv, -halfT);   // Fs, P push on a face
          h.set([at[0] - dirv[0] * L, at[1] - dirv[1] * L], at);
        }
        arrow('W', [0, -1], s.W);
        var Nsgn = s.N >= 0 ? 1 : -1;
        arrow('N', [nv[0] * Nsgn, nv[1] * Nsgn], s.flight ? 0 : Math.abs(s.N));
        arrow('Ff', [tv[0] * (s.Ff >= 0 ? 1 : -1), tv[1] * (s.Ff >= 0 ? 1 : -1)], Math.abs(s.Ff));
        arrow('Fs', [tv[0] * (s.Fs >= 0 ? 1 : -1), tv[1] * (s.Fs >= 0 ? 1 : -1)], Math.abs(s.Fs));
        arrow('P', [tv[0] * (s.P >= 0 ? 1 : -1), tv[1] * (s.P >= 0 ? 1 : -1)], Math.abs(s.P));
      });
      var s0 = states[0], r0 = runs[0];
      if (bars) bars.set({ T: s0.T, Vg: s0.Vg, Ve: s0.Ve, lost: s0.lost, Up: s0.Up }, r0.run.E0 + s0.Up);
      if (ledger) ledger.set(ledgerVals(s0, r0.run));
      Object.keys(ro).forEach(function (k) {
        var v = RO[k][2](s0, r0.run), unit = RO[k][3];
        ro[k].set(isFinite(v) ? CYL.fmt(Math.abs(v) < 5e-7 ? 0 : v, 4) + ' ' + unit : '—');
      });
      tr.syncSlider();
      tr.syncPlay();
      if (o.onUpdate) { try { o.onUpdate(states, fig); } catch (e) { report('figure: onUpdate failed: ' + e.message); } }
    }

    /* ----- transport ----- */
    var visible = true;
    var unVisible = CYL.onVisible(o.stage, function (on) { visible = on; });
    var tr = makeTransport({
      o: o, stage: o.stage,
      getT: function () { return t; },
      setT: function (v) { t = v; sync(); },
      range: function () { return [0, t1]; },
      drive: function (fn) {
        var raf = 0, last = 0, dead = false;
        function frame(ts) {
          raf = 0;
          if (dead) return;
          var dt = last ? Math.min(0.1, (ts - last) / 1000) : 0;
          last = ts;
          if (!visible) last = 0;
          else if (fn(dt) === false) { dead = true; return; }
          raf = window.requestAnimationFrame(frame);
        }
        raf = window.requestAnimationFrame(frame);
        return function () { dead = true; if (raf) window.cancelAnimationFrame(raf); raf = 0; };
      }
    });

    function resim(keepT) {
      runs.forEach(function (r) { simulateRun(r); drawStatic(r); });
      autoScales();
      barScale();
      updateRange();
      if (!keepT) t = 0;
      t = clamp(t, 0, t1);
      sync();
      if (tr.refreshSlider) tr.refreshSlider();
    }
    fig.t = function () { return t; };
    fig.setT = function (v) { tr.pause(); t = clamp(+v || 0, 0, t1); sync(); return fig; };
    fig.play = function () { tr.play(); return fig; };
    fig.pause = function () { tr.pause(); return fig; };
    fig.reset = function () { tr.reset(); return fig; };
    fig.isPlaying = function () { return tr.isPlaying(); };
    fig.state = function (i) { return states[i || 0]; };
    fig.states = function () { return states.slice(); };
    fig.run = function (i) { return runs[i || 0].run; };
    fig.duration = function () { return t1; };
    fig.setParams = function (i, params, keepT) { tr.pause(); runs[i || 0].params = params; resim(keepT); return fig; };
    fig.setRun = function (i, spec, keepT) {
      tr.pause();
      var r = runs[i || 0];
      if (spec.track) r.track = spec.track;
      if (spec.params) r.params = spec.params;
      if (spec.body) r.body = Object.assign({}, r.body, spec.body);
      resim(keepT);
      return fig;
    };
    fig.setShow = function (k, v) { show[k] = !!v; if (ctl[k] && ctl[k].set) ctl[k].set(!!v, true); sync(); return fig; };
    fig.update = function () { sync(); return fig; };
    var resizeObs = null;
    fig.destroy = function () { tr.pause(); unVisible(); if (resizeObs) resizeObs.disconnect(); };
    sync();
    if (panel) CYL.renderMath(panel);

    /* ----- fill the stage: when the controls sit beside the plot and are taller than the plot column, grow the plot
       to match (the extra room shows more of the scene), so there is no empty band under the transport ----- */
    function fit() {
      var main = o.stage.parentNode, side = panel && (panel.closest('.viz-controls') || panel);
      var base = baseHeight();
      if (!main || !base) return;
      var target = base;
      if (side && side.getBoundingClientRect().left > main.getBoundingClientRect().left + 20) {
        var trEl = main.querySelector(':scope > .mf-transport');
        var below = o.readoutsEl && o.readoutsEl.offsetParent !== null ? o.readoutsEl.offsetHeight : 0;
        target = Math.max(base, Math.round(side.offsetHeight - (trEl ? trEl.offsetHeight : 0) - below - 2));
      }
      if (Math.abs(target - curH) > 4) { curH = target; p.setOptions({ height: target }); sync(); }
    }
    fig.fit = fit;
    if (window.ResizeObserver) {
      resizeObs = new ResizeObserver(CYL.debounce(fit, 60));
      if (panel) resizeObs.observe(panel.closest('.viz-controls') || panel);
      if (o.readoutsEl) resizeObs.observe(o.readoutsEl);
      if (o.stage.parentNode) resizeObs.observe(o.stage.parentNode);
    }
    window.setTimeout(fit, 0);
    if (o.autoplay && !CYL.prefersReducedMotion()) tr.play();
    return fig;
  };

  /* ================================================================== charts (linear axes) */
  function paint(c) {
    if (!c) return 'var(--ink)';
    if (/^(#|rgb|hsl|var\()/.test(c)) return c;
    var map = { ink: '--ink', muted: '--ink-muted', faint: '--ink-faint', accent: '--accent', grid: '--c-grid', axis: '--c-axis',
      r: '--c-r', t: '--c-t', z: '--c-z', good: '--c-good', bad: '--c-bad', warn: '--c-warn', surface: '--c-surface',
      bg: '--viz-bg', line: '--line', point: '--c-point' };
    return 'var(' + (map[c] || '--ink') + ')';
  }
  ENERGY.paint = paint;
  function svgEl(tag, attrs) {
    var nd = document.createElementNS(SVGNS, tag);
    if (attrs) for (var k in attrs) if (hasOwn.call(attrs, k) && attrs[k] != null) nd.setAttribute(k, attrs[k]);
    return nd;
  }
  function chartStep(span, n) {
    var raw = span / Math.max(1, n), mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
  }
  function linTicks(a, b, n) {
    var st = chartStep(b - a, n), out = [], v = Math.ceil(a / st - 1e-9) * st;
    for (; v <= b + st * 1e-9; v += st) out.push(Math.abs(v) < st * 1e-9 ? 0 : +v.toPrecision(12));
    return out;
  }
  function tickText(v) {
    var a = Math.abs(v);
    if (a >= 1e6 || (a > 0 && a < 1e-3)) return fmt(v, 2);
    if (a >= 1e4) return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return fmt(v, 4);
  }
  var chartN = 0;
  ENERGY.chart = function (container, opts) {
    opts = opts || {};
    if (!container) { report('chart: no container'); return null; }
    if (!opts.ariaLabel) report('chart: ariaLabel is required');
    var C = { opts: opts, x: Object.assign({}, opts.x), y: Object.assign({}, opts.y) };
    var pad = Object.assign({ l: 58, r: 16, t: 14, b: 28 }, opts.pad);
    var ySide = opts.yLabelSide !== false;
    var wrap = document.createElement('div');
    wrap.className = 'ec-chart' + (ySide ? ' yside' : '');
    var svg = svgEl('svg', { role: 'img', 'aria-label': opts.ariaLabel || 'Chart', focusable: 'false' });
    wrap.appendChild(svg);
    var tip = document.createElement('div');
    tip.className = 'ec-tip';
    tip.hidden = true;
    wrap.appendChild(tip);
    var xLab = document.createElement('div'), yLab = document.createElement('div');
    xLab.className = 'ec-axlabel x'; yLab.className = 'ec-axlabel y';
    wrap.appendChild(xLab); wrap.appendChild(yLab);
    var legend = null;
    container.appendChild(wrap);
    C.el = wrap; C.svg = svg;
    var gGrid = svgEl('g', { class: 'ec-grid' }), gPlot = svgEl('g'), gTop = svgEl('g');
    var clipId = 'ecclip' + (++chartN);
    var clip = svgEl('clipPath', { id: clipId }), clipRect = svgEl('rect');
    clip.appendChild(clipRect);
    var defs = svgEl('defs'); defs.appendChild(clip);
    svg.appendChild(defs); svg.appendChild(gGrid); svg.appendChild(gPlot); svg.appendChild(gTop);
    gPlot.setAttribute('clip-path', 'url(#' + clipId + ')');
    var items = [];
    var W = 600, H = opts.height || 300;

    function setLabel(node, html) { node.innerHTML = html || ''; if (CYL && CYL.renderMath) CYL.renderMath(node); }
    function sx(v) { return pad.l + (v - C.x.min) / (C.x.max - C.x.min) * (W - pad.l - pad.r); }
    function sy(v) { return H - pad.b - (v - C.y.min) / (C.y.max - C.y.min) * (H - pad.t - pad.b); }
    function ok(v) { return v != null && isFinite(v); }
    C.toPx = function (q) { return [sx(q[0]), sy(q[1])]; };
    function textWidth(s, fs) {
      var tx = svgEl('text', { 'font-size': fs }), w = 0;
      tx.textContent = s; gGrid.appendChild(tx);
      try { w = tx.getComputedTextLength(); } catch (e) { w = 0; }
      gGrid.removeChild(tx);
      return w || String(s).length * fs * 0.6;
    }
    function drawAxes() {
      while (gGrid.firstChild) gGrid.removeChild(gGrid.firstChild);
      var fs = W < 420 ? 10.5 : 11.5;
      var yt = C.y.ticks || linTicks(C.y.min, C.y.max, H < 260 ? 4 : 6);
      setLabel(xLab, C.x.label); setLabel(yLab, C.y.label);
      if (ySide) {
        var tw = 0, lh = yLab.offsetHeight || 16;
        yt.forEach(function (v) { if (v >= C.y.min && v <= C.y.max) tw = Math.max(tw, textWidth(C.y.format ? C.y.format(v) : tickText(v), fs)); });
        pad.l = Math.ceil(3 + lh + 5 + tw + 7);
        yLab.classList.add('side');
        yLab.style.left = (3 + lh / 2) + 'px';
        yLab.style.top = ((parseFloat(getComputedStyle(wrap).paddingTop) || 0) + pad.t + (H - pad.t - pad.b) / 2) + 'px';
      }
      clipRect.setAttribute('x', pad.l); clipRect.setAttribute('y', pad.t);
      clipRect.setAttribute('width', Math.max(0, W - pad.l - pad.r)); clipRect.setAttribute('height', Math.max(0, H - pad.t - pad.b));
      gGrid.appendChild(svgEl('rect', { x: pad.l, y: pad.t, width: W - pad.l - pad.r, height: H - pad.t - pad.b, fill: 'none', stroke: paint('line') }));
      var xt = C.x.ticks || linTicks(C.x.min, C.x.max, W < 420 ? 4 : 7);
      var lastRight = -1e9;
      xt.forEach(function (v) {
        if (v < C.x.min || v > C.x.max) return;
        var X = sx(v);
        gGrid.appendChild(svgEl('line', { x1: X, x2: X, y1: pad.t, y2: H - pad.b, stroke: paint('grid'), 'stroke-width': 1 }));
        var s = C.x.format ? C.x.format(v) : tickText(v);
        var half = s.length * fs * 0.3;
        if (X - half < lastRight + 6) return;
        lastRight = X + half;
        var tx = svgEl('text', { x: X, y: H - pad.b + fs + 6, 'text-anchor': 'middle', 'font-size': fs, fill: paint('muted') });
        tx.textContent = s; gGrid.appendChild(tx);
      });
      yt.forEach(function (v) {
        if (v < C.y.min || v > C.y.max) return;
        var Y = sy(v);
        gGrid.appendChild(svgEl('line', { x1: pad.l, x2: W - pad.r, y1: Y, y2: Y, stroke: paint('grid'), 'stroke-width': 1 }));
        var tx = svgEl('text', { x: pad.l - 7, y: Y + fs * 0.35, 'text-anchor': 'end', 'font-size': fs, fill: paint('muted') });
        tx.textContent = C.y.format ? C.y.format(v) : tickText(v); gGrid.appendChild(tx);
      });
      if (C.y.min < 0 && C.y.max > 0) gGrid.appendChild(svgEl('line', { x1: pad.l, x2: W - pad.r, y1: sy(0), y2: sy(0), stroke: paint('axis'), 'stroke-width': 1.2 }));
      if (C.x.min < 0 && C.x.max > 0) gGrid.appendChild(svgEl('line', { x1: sx(0), x2: sx(0), y1: pad.t, y2: H - pad.b, stroke: paint('axis'), 'stroke-width': 1.2 }));
      xLab.style.marginLeft = (pad.l / W * 100) + '%'; xLab.style.marginRight = (pad.r / W * 100) + '%';
    }
    function size() {
      var w = Math.round(wrap.clientWidth || container.clientWidth || 600);
      W = Math.max(260, w);
      H = opts.height || 300;
      if (W < 480) H = Math.round(H * 0.86);
      pad.l = W < 420 ? 48 : (opts.pad && opts.pad.l) || 58;
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      svg.setAttribute('width', W); svg.setAttribute('height', H);
    }
    C.redraw = function () { size(); drawAxes(); items.forEach(function (it) { it.draw(); }); };
    function shapePath(shape, r) {
      if (shape === 'tri') { var h = r * 1.25; return 'M0,' + (-h) + ' L' + (h * 0.95) + ',' + (h * 0.7) + ' L' + (-h * 0.95) + ',' + (h * 0.7) + ' Z'; }
      if (shape === 'square') return 'M' + (-r * 0.85) + ',' + (-r * 0.85) + ' h' + (r * 1.7) + ' v' + (r * 1.7) + ' h' + (-r * 1.7) + ' Z';
      if (shape === 'diamond') return 'M0,' + (-r * 1.2) + ' L' + (r * 1.2) + ',0 L0,' + (r * 1.2) + ' L' + (-r * 1.2) + ',0 Z';
      return 'M' + (-r) + ',0 a' + r + ',' + r + ' 0 1,0 ' + (2 * r) + ',0 a' + r + ',' + r + ' 0 1,0 ' + (-2 * r) + ',0';
    }
    function showTip(html, px, py) {
      tip.innerHTML = html;
      if (CYL && CYL.renderMath) CYL.renderMath(tip);
      tip.hidden = false;
      var bw = wrap.clientWidth, sc = bw / W, tw = tip.offsetWidth, th = tip.offsetHeight;
      var Lx = px * sc + 12, Ty = py * sc - th - 10;
      if (Lx + tw > bw - 4) Lx = px * sc - tw - 12;
      if (Lx < 4) Lx = 4;
      if (Ty < 4) Ty = py * sc + 14;
      tip.style.left = Lx + 'px'; tip.style.top = Ty + 'px';
    }
    function hideTip() { tip.hidden = true; }
    C.hideTip = hideTip;
    wrap.addEventListener('mouseleave', hideTip);
    function make(drawFn, o) {
      var g = svgEl('g');
      (o && o.top ? gTop : gPlot).appendChild(g);
      var h = { g: g, visible: true, draw: function () { while (g.firstChild) g.removeChild(g.firstChild); if (h.visible) drawFn(g); } };
      h.setVisible = function (v) { h.visible = !!v; h.draw(); return h; };
      h.remove = function () { var i = items.indexOf(h); if (i >= 0) items.splice(i, 1); if (g.parentNode) g.parentNode.removeChild(g); };
      items.push(h);
      return h;
    }
    C.points = function (list, o) {
      o = o || {};
      var data = list || [];
      var h = make(function (g) {
        var r = o.r || 5;
        data.forEach(function (d) {
          var X = o.x(d), Y = o.y(d);
          if (!ok(X) || !ok(Y)) return;
          var px = sx(X), py = sy(Y);
          if (px < pad.l - 1 || px > W - pad.r + 1 || py < pad.t - 1 || py > H - pad.b + 1) return;
          var col = paint(typeof o.color === 'function' ? o.color(d) : o.color || 'accent');
          var sh = typeof o.shape === 'function' ? o.shape(d) : o.shape || 'circle';
          var pth = svgEl('path', { d: shapePath(sh, r), transform: 'translate(' + px.toFixed(1) + ',' + py.toFixed(1) + ')', fill: col, 'fill-opacity': 0.78, stroke: col, 'stroke-width': 1.4, class: 'ec-pt' });
          if (o.title) {
            var sh2 = function () { showTip(o.title(d), px, py); };
            pth.addEventListener('mouseenter', sh2);
            pth.addEventListener('click', sh2);
            pth.style.cursor = 'pointer';
          }
          g.appendChild(pth);
          var lab = o.label ? o.label(d) : null;
          if (lab) {
            var tx = svgEl('text', { x: px + 8, y: py - 6, 'font-size': 11, 'font-weight': 600, fill: paint('ink'), class: 'ec-ptlabel' });
            tx.textContent = lab; g.appendChild(tx);
          }
        });
      }, o);
      h.set = function (l) { data = l || []; h.draw(); return h; };
      h.draw();
      return h;
    };
    C.fn = function (f, o) {
      o = o || {};
      var fun = f;
      var h = make(function (g) {
        var a = Math.max(C.x.min, o.domain ? o.domain[0] : -Infinity), b = Math.min(C.x.max, o.domain ? o.domain[1] : Infinity);
        if (!(b > a)) return;
        var n = o.samples || 200, d = '', pen = false, last = null, span2 = C.y.max - C.y.min;
        for (var i = 0; i <= n; i++) {
          var x = a + (b - a) * i / n, y;
          try { y = fun(x); } catch (e) { y = NaN; }
          if (!ok(y) || y < C.y.min - span2 * 2 || y > C.y.max + span2 * 2) { pen = false; continue; }
          var X = sx(x), Y = sy(y);
          d += (pen ? 'L' : 'M') + X.toFixed(1) + ',' + Y.toFixed(1);
          pen = true; last = [X, Y];
        }
        if (!d) return;
        g.appendChild(svgEl('path', { d: d, fill: 'none', stroke: paint(o.color || 'accent'), 'stroke-width': o.width || 2, 'stroke-dasharray': o.dashed ? '6 5' : null, 'stroke-linejoin': 'round' }));
        if (o.label && last) {
          var X2 = last[0], Y2 = last[1];
          if (o.labelAt != null) { var yy = fun(o.labelAt); if (ok(yy)) { X2 = sx(o.labelAt); Y2 = sy(yy); } }
          var tx = svgEl('text', { x: X2 - 4, y: Y2 - 7, 'text-anchor': 'end', 'font-size': 11.5, 'font-weight': 700, fill: paint(o.color || 'accent'), class: 'ec-ptlabel' });
          tx.textContent = o.label; g.appendChild(tx);
        }
      }, o);
      h.setFn = function (nf) { fun = nf; h.draw(); return h; };
      h.set = function (nf, no) { if (nf) fun = nf; if (no) Object.assign(o, no); h.draw(); return h; };
      h.draw();
      return h;
    };
    C.area = function (f, o) {
      o = o || {};
      var fun = f;
      var h = make(function (g) {
        var a = Math.max(C.x.min, o.domain ? o.domain[0] : C.x.min), b = Math.min(C.x.max, o.domain ? o.domain[1] : C.x.max);
        if (!(b > a)) return;
        // the band between f and the base: a number, or a function of x (a band between two curves)
        var n = o.samples || 120, bf = typeof o.base === 'function' ? o.base : null, b0 = bf ? 0 : (o.base || 0);
        function baseAt(x) { var v; try { v = bf ? bf(x) : b0; } catch (e) { v = b0; } return ok(v) ? clamp(v, C.y.min, C.y.max) : clamp(b0, C.y.min, C.y.max); }
        var d = '', back = '';
        for (var i = 0; i <= n; i++) {
          var x = a + (b - a) * i / n, y;
          try { y = fun(x); } catch (e) { y = NaN; }
          if (!ok(y)) y = baseAt(x);
          y = clamp(y, C.y.min, C.y.max);
          d += (i ? 'L' : 'M') + sx(x).toFixed(1) + ',' + sy(y).toFixed(1);
        }
        for (var j = n; j >= 0; j--) { var xb = a + (b - a) * j / n; back += 'L' + sx(xb).toFixed(1) + ',' + sy(baseAt(xb)).toFixed(1); }
        d += back + 'Z';
        g.appendChild(svgEl('path', { d: d, fill: paint(o.color || 'accent'), 'fill-opacity': o.fillOpacity == null ? 0.22 : o.fillOpacity, stroke: 'none' }));
      }, o);
      h.set = function (nf, no) { if (nf) fun = nf; if (no) Object.assign(o, no); h.draw(); return h; };
      h.draw();
      return h;
    };
    C.polyline = function (pts, o) {
      o = o || {};
      var P = pts || [];
      var h = make(function (g) {
        var d = '';
        P.forEach(function (q) { if (!q || !ok(q[0]) || !ok(q[1])) return; d += (d ? 'L' : 'M') + sx(q[0]).toFixed(1) + ',' + sy(q[1]).toFixed(1); });
        if (!d) return;
        if (o.closed) d += 'Z';
        g.appendChild(svgEl('path', { d: d, fill: o.fill ? paint(o.fill) : 'none', 'fill-opacity': o.fill ? (o.fillOpacity == null ? 0.15 : o.fillOpacity) : null,
          stroke: o.width === 0 ? 'none' : paint(o.color || 'accent'), 'stroke-width': o.width || 2, 'stroke-dasharray': o.dashed ? '6 5' : null, 'stroke-linejoin': 'round' }));
      }, o);
      h.set = function (q) { P = q || []; h.draw(); return h; };
      h.draw();
      return h;
    };
    function refLine(isX, v, o) {
      o = o || {};
      var val = v;
      var h = make(function (g) {
        if (!ok(val)) return;
        var X1, X2, Y1, Y2;
        if (isX) { X1 = X2 = sx(val); Y1 = pad.t; Y2 = H - pad.b; } else { Y1 = Y2 = sy(val); X1 = pad.l; X2 = W - pad.r; }
        if ((isX && (X1 < pad.l - 1 || X1 > W - pad.r + 1)) || (!isX && (Y1 < pad.t - 1 || Y1 > H - pad.b + 1))) return;
        g.appendChild(svgEl('line', { x1: X1, x2: X2, y1: Y1, y2: Y2, stroke: paint(o.color || 'muted'), 'stroke-width': o.width || 1.5, 'stroke-dasharray': o.dashed === false ? null : '5 4' }));
        if (o.label) {
          var tx = svgEl('text', isX ? { x: X1 + 5, y: pad.t + 14 + (o.labelDy || 0), 'font-size': 11.5, 'font-weight': 600, fill: paint(o.color || 'muted'), class: 'ec-ptlabel' }
                                     : { x: W - pad.r - 5, y: Y1 - 6, 'text-anchor': 'end', 'font-size': 11.5, 'font-weight': 600, fill: paint(o.color || 'muted'), class: 'ec-ptlabel' });
          tx.textContent = o.label; g.appendChild(tx);
        }
      }, o);
      h.set = function (nv) { val = nv; h.draw(); return h; };
      h.draw();
      return h;
    }
    C.vline = function (x, o) { return refLine(true, x, o); };
    C.hline = function (y, o) { return refLine(false, y, o); };
    C.marker = function (q, o) {
      o = Object.assign({ top: true }, o);
      var P = q;
      var h = make(function (g) {
        if (!P || !ok(P[0]) || !ok(P[1])) return;
        var X = sx(P[0]), Y = sy(P[1]), col = paint(o.color || 'accent');
        if (X < pad.l - 2 || X > W - pad.r + 2 || Y < pad.t - 2 || Y > H - pad.b + 2) return;
        if (o.ring !== false) g.appendChild(svgEl('circle', { cx: X, cy: Y, r: (o.r || 6) + 5, fill: 'none', stroke: col, 'stroke-width': 2 }));
        g.appendChild(svgEl('path', { d: shapePath(o.shape || 'circle', o.r || 6), transform: 'translate(' + X + ',' + Y + ')', fill: col, stroke: paint('bg'), 'stroke-width': 1.5 }));
        if (o.label) {
          var left = X > W - pad.r - 120, tx = svgEl('text', { x: X + (left ? -14 : 14), y: Y + 4, 'text-anchor': left ? 'end' : 'start', 'font-size': 12, 'font-weight': 700, fill: col, class: 'ec-ptlabel' });
          tx.textContent = typeof o.label === 'function' ? o.label() : o.label; g.appendChild(tx);
        }
      }, o);
      h.set = function (np) { P = np; h.draw(); return h; };
      h.setLabel = function (l) { o.label = l; h.draw(); return h; };
      h.draw();
      return h;
    };
    C.text = function (q, s, o) {
      o = o || {};
      var P = q, S = s;
      var h = make(function (g) {
        if (!P || !ok(P[0]) || !ok(P[1])) return;
        var tx = svgEl('text', { x: sx(P[0]) + (o.dx || 0), y: sy(P[1]) + (o.dy || 0), 'text-anchor': o.anchor || 'start', 'font-size': o.size || 11.5, 'font-weight': o.weight || 600, fill: paint(o.color || 'muted'), class: 'ec-ptlabel' });
        tx.textContent = S; g.appendChild(tx);
      }, Object.assign({ top: true }, o));
      h.set = function (np, ns) { P = np; if (ns != null) S = ns; h.draw(); return h; };
      h.draw();
      return h;
    };
    C.setAxes = function (ax) {
      if (ax.x) C.x = Object.assign({}, C.x, ax.x);
      if (ax.y) C.y = Object.assign({}, C.y, ax.y);
      hideTip();
      C.redraw();
    };
    C.setAriaLabel = function (s) { svg.setAttribute('aria-label', s); };
    C.clear = function () { items.slice().forEach(function (h) { h.remove(); }); hideTip(); };
    C.setLegend = function (list) {
      if (!legend) { legend = document.createElement('ul'); legend.className = 'ec-legend'; wrap.appendChild(legend); }
      legend.innerHTML = '';
      (list || []).forEach(function (Lg) {
        var li = document.createElement('li');
        var s = svgEl('svg', { viewBox: '-8 -8 16 16', width: 14, height: 14, 'aria-hidden': 'true' });
        if (Lg.line) s.appendChild(svgEl('line', { x1: -7, x2: 7, y1: 0, y2: 0, stroke: paint(Lg.color), 'stroke-width': 2.5, 'stroke-dasharray': Lg.dashed ? '4 3' : null }));
        else s.appendChild(svgEl('path', { d: shapePath(Lg.shape || 'square', 5), fill: paint(Lg.color), 'fill-opacity': Lg.fillOpacity == null ? 0.78 : Lg.fillOpacity, stroke: paint(Lg.color), 'stroke-width': 1.4 }));
        li.appendChild(s);
        var sp = document.createElement('span'); sp.innerHTML = Lg.label; li.appendChild(sp);
        legend.appendChild(li);
      });
      if (CYL && CYL.renderMath) CYL.renderMath(legend);
    };
    if (opts.legend) C.setLegend(opts.legend);
    size(); drawAxes();
    var lastW = 0;
    if (window.ResizeObserver) {
      new ResizeObserver(function () {
        var w = Math.round(wrap.clientWidth);
        if (w && Math.abs(w - lastW) > 2) { lastW = w; C.redraw(); }
      }).observe(wrap);
    } else window.addEventListener('resize', function () { C.redraw(); });
    return C;
  };

  window.ENERGY = ENERGY;
})(window, document);
