/*!
 * momentum.js — MOMENTUM: impacts (direct and oblique), the force–time history of a collision, the motion of
 * bodies along a straight track with friction, springs, applied forces, walls and couplers, a ball bouncing on a
 * floor, two pucks colliding on smooth ice, momentum bars, and animated figures, for the Impulse and Momentum
 * module. Classic script (IIFE) that attaches ONE global: MOMENTUM. Requires CYL (cyl-core.js), and for the
 * figures CYL2D (cyl-2d.js) and ENERGY (energy.js: the transport row, the impulse ledger, charts, springs and
 * hatching). Load it after them.
 *
 * Color code, the same in every figure, readout and formula: momentum has a color, and each force is drawn in the
 * color of its impulse.
 *   linear momentum m v, velocity v .............. 'good' (green)      TeX macro \colL
 *   weight W and its impulse ..................... 'z' (blue)          \colVg
 *   spring force F_s and its impulse ............. 't' (violet)        \colVe
 *   friction F_f and its impulse ................. 'r' (orange)        \colF
 *   applied force P and its impulse .............. 'warn' (amber)     \colP
 *   impulsive contact forces in an impact ........ 'bad' (red)         \colI
 *   normal force N ............................... 'ink'
 *   bodies: A 'accent' (teal), B 'warn' fill, C 'z' fill (fills only, never arrows)
 *
 * MOMENTUM.G = 9.81 (m/s²)
 *
 * MOMENTUM.impact(mA, vA1, mB, vB1, e) -> {vA2, vB2, vc (common velocity at maximum deformation), P (deformation
 *   impulse), R (restitution impulse), J (impulse on B, positive along +x; −J acts on A), T1, T2, lost, frac}
 *   Direct central impact along x; mB = Infinity for a fixed wall or floor (then vB2 = vB1).
 *
 * MOMENTUM.oblique({mA, mB, vA: [x, y], vB: [x, y], n: [nx, ny], e}) -> {n, t, vA2, vB2, vA1n, vA1t, vB1n, vB1t,
 *   vA2n, vA2t, vB2n, vB2t, J (impulse on B along n), lost}
 *   n is the line of impact, from A toward B (normalized here); the tangential components do not change.
 *
 * MOMENTUM.contact({mA, mB, vA1, vB1, e, td}) -> the force–time history of a direct central impact, from a
 *   two-stiffness contact model: the contact force rises as a quarter sine during deformation (duration td, default
 *   0.004 s) and falls as a quarter cosine during restitution, which is stiffer by 1/e², so it lasts e·td and its
 *   impulse is e times the deformation impulse. Returns {mu (reduced mass), u (approach speed), td, tr, duration, Fmax,
 *   P, R, F(t), I(t) (impulse so far), vA(t), vB(t), delta(t) (compression), deltaMax, set (permanent set)}
 *
 * MOMENTUM.line(spec) -> run. Bodies on a straight track (horizontal, or inclined at theta), integrated by RK4 in
 *   time between impacts, which are instantaneous.
 *   spec: {bodies: [{m, x (center, in increasing order), v: 0, w: 0.4, mu: 0, muS: mu, P (applied force along +x:
 *            a number, or f(t)), Pn (its component normal to the track, + away from it: it reduces N), label}],
 *          e: 1 (restitution between bodies), pairs: [{a, b, e, couple}] (couple: they latch together on contact),
 *          walls: [{x, side: -1 (on the left of the bodies) | +1, e: 1}],
 *          springs: [{x (free end), side: +1 (fixed end on the right: the body compresses it moving +x) | -1, k, len}],
 *          links: [{a, b, k, len}] (a compression spring between bodies a and b, fixed to a, only pushes),
 *          theta: 0, g: 9.81, tmax: 10, dt: 0.0005, until(state) -> true to stop}
 *   run: {duration, events, bodies, spec, n, extent: {v, p, F, T}, at(t) -> state}
 *   state: {t, x[], v[], p[], T[], ptot, Ttot, stuck[], F: {P[], Pn[], Ff[], Fs[], W[], N[]}, I: {P[], Ff[], Fs[], W[], C[], wall[]},
 *           Ve, Vg, Uf, Up, lost (kinetic energy lost in impacts so far), E}
 *   The impulses are measured from t = 0, so m v − m v0 = I.P + I.Ff + I.Fs + I.W + I.C + I.wall for every body.
 *   events: {t, kind: 'impact', a, b, e, va1, vb1, va2, vb2, J, lost} | {t, kind: 'wall', a, side, e, v1, v2, J, lost} |
 *           {t, kind: 'slip' | 'rest', a}
 *
 * MOMENTUM.bounce({x0: 0, h0 (height of the bottom of the ball), vx: 0, vy: 0, e, g: 9.81, tmax: 8, vmin: 0.05})
 *   -> {duration, events: [{t, x, v1, v2}], at(t) -> {t, x, y, vx, vy}, peaks: [heights reached after each bounce]}
 *
 * MOMENTUM.pucks({A: {m, r, p: [x, y], v: [x, y]}, B: {...}, e, tmax: 6}) -> two disks sliding on a smooth plane:
 *   {duration, hit (null or {t, pA, pB, n, res (MOMENTUM.oblique result)}), at(t) -> {t, pA, pB, vA, vB}}
 *
 * MOMENTUM.player({stage, duration () -> end time, start: 0, onTime(t), loop, speed, playback, autoplay, timeUnit: 's'}) -> a transport row (Play,
 *   Reset, time slider, Playback) under any stage: {t(), setT(t), play(), pause(), reset(), refresh()}.
 *
 * MOMENTUM.pbars(container, {items: [{key, label (TeX), color}], total: true | {label}, unit, title}) -> {el,
 *   set(values by key), setScale(maxAbs)}: signed horizontal bars, positive to the right, and their sum.
 *
 * MOMENTUM.figure(opts) -> controller: an animated MOMENTUM.line run in a CYL2D plane.
 *   opts: stage, controls, readoutsEl, xRange, yRange, height, maxHeight, aria (REQUIRED), spec (MOMENTUM.line),
 *     track: {origin: [0, 0], theta: spec.theta, from, to (track extent in s; default the x range)},
 *     draw: [{shape: 'block' | 'cart' | 'ball', h, color}] (one per body; w comes from spec),
 *     show: {v: true, forces: false, impulse: true}, toggles: ['v', 'forces', 'impulse'],
 *     forces: ['W', 'N', 'Ff', 'P', 'Fs'], fScale, vScale, flash: 0.35 (s of the impact-impulse arrows),
 *     follow: true | {body: 0, lead: 0.35} (the view moves with that body once it passes lead × the width; distance marks),
 *     pbars: true | {items: [body indices], total: true, title}, ledger: {body: 0, items: ['P', 'Ff', 'W', 'Fs', 'C',
 *     'wall'], title}, readouts: ['t', 'vA', 'vB', 'pA', 'pB', 'ptot', 'TA', 'Ttot', 'lost', 'IA', …], panelTitle,
 *     chart: {kind: 'p' | 'v' | 'F', bodies: [indices], total: true, height: 190} (momentum, velocity, or for the first
 *     listed body the applied force and friction, against time, under the stage, with a cursor at the current time),
 *     decorate(plane, fig), onUpdate(state, fig), speed, loop, autoplay, playback, t0
 *   controller: {plane, run(), state(), t(), setT(t), play(), pause(), reset(), setSpec(spec), update(), duration(), chart(), destroy()}
 */
(function (window, document) {
  'use strict';
  if (window.MOMENTUM) return;
  var CYL = window.CYL;
  var MOMENTUM = { version: '1.0.0', G: 9.81 };
  var EPS = 1e-9, PI = Math.PI;

  function report(msg) {
    if (CYL && CYL.reportError) CYL.reportError('momentum.js: ' + msg); else if (window.console) console.error('momentum.js: ' + msg);
  }
  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sgn(v) { return v > 0 ? 1 : v < 0 ? -1 : 0; }
  function fmt(x, sig) { return CYL ? CYL.fmt(x, sig) : String(+(+x).toPrecision(sig || 4)); }

  /* ================================================================== impacts */
  MOMENTUM.impact = function (mA, vA1, mB, vB1, e) {
    e = clamp(num(e, 1), 0, 1);
    var fixed = !isFinite(mB), u = vA1 - vB1, vc, vA2, vB2, mu;
    if (fixed) { vc = vB1; vA2 = vB1 - e * u; vB2 = vB1; mu = mA; }
    else {
      vc = (mA * vA1 + mB * vB1) / (mA + mB);
      vA2 = vc - e * mB * u / (mA + mB);
      vB2 = vc + e * mA * u / (mA + mB);
      mu = mA * mB / (mA + mB);
    }
    var P = mu * u, R = e * P;
    var T1 = 0.5 * mA * vA1 * vA1 + (fixed ? 0 : 0.5 * mB * vB1 * vB1);
    var T2 = 0.5 * mA * vA2 * vA2 + (fixed ? 0 : 0.5 * mB * vB2 * vB2);
    return { vA2: vA2, vB2: vB2, vc: vc, P: P, R: R, J: P + R, T1: T1, T2: T2, lost: T1 - T2, frac: T1 > EPS ? (T1 - T2) / T1 : 0, mu: mu, u: u };
  };

  MOMENTUM.oblique = function (o) {
    var n = o.n, L = Math.hypot(n[0], n[1]) || 1;
    n = [n[0] / L, n[1] / L];
    var t = [-n[1], n[0]];
    var vA = o.vA || [0, 0], vB = o.vB || [0, 0];
    function dot(a, b) { return a[0] * b[0] + a[1] * b[1]; }
    var vA1n = dot(vA, n), vA1t = dot(vA, t), vB1n = dot(vB, n), vB1t = dot(vB, t);
    var r = MOMENTUM.impact(o.mA, vA1n, o.mB == null ? Infinity : o.mB, vB1n, o.e);
    var vA2 = [r.vA2 * n[0] + vA1t * t[0], r.vA2 * n[1] + vA1t * t[1]];
    var vB2 = [r.vB2 * n[0] + vB1t * t[0], r.vB2 * n[1] + vB1t * t[1]];
    var fixed = !isFinite(o.mB == null ? Infinity : o.mB);
    var T1 = 0.5 * o.mA * dot(vA, vA) + (fixed ? 0 : 0.5 * o.mB * dot(vB, vB));
    var T2 = 0.5 * o.mA * dot(vA2, vA2) + (fixed ? 0 : 0.5 * o.mB * dot(vB2, vB2));
    return { n: n, t: t, vA2: vA2, vB2: vB2, vA1n: vA1n, vA1t: vA1t, vB1n: vB1n, vB1t: vB1t, vA2n: r.vA2, vA2t: vA1t,
      vB2n: r.vB2, vB2t: vB1t, J: r.J, approach: r.u, lost: T1 - T2, T1: T1, T2: T2 };
  };

  MOMENTUM.contact = function (o) {
    var mA = o.mA, mB = o.mB == null ? Infinity : o.mB, e = clamp(num(o.e, 1), 0, 1);
    var vA1 = num(o.vA1, 1), vB1 = num(o.vB1, 0), td = num(o.td, 0.004);
    var mu = isFinite(mB) ? mA * mB / (mA + mB) : mA, u = vA1 - vB1;
    var w1 = PI / (2 * td), Fmax = mu * u * w1, P = mu * u, R = e * P;
    var tr = e * td, w2 = e > 0 ? w1 / e : Infinity, dmax = u / w1, set = dmax * (1 - e * e);
    function I(t) {
      if (t <= 0) return 0;
      if (t <= td) return Fmax / w1 * (1 - Math.cos(w1 * t));
      if (t <= td + tr && e > 0) return P + Fmax / w2 * Math.sin(w2 * (t - td));
      return P + R;
    }
    function F(t) {
      if (t <= 0) return 0;
      if (t <= td) return Fmax * Math.sin(w1 * t);
      if (t <= td + tr && e > 0) return Fmax * Math.cos(w2 * (t - td));
      return 0;
    }
    function delta(t) {
      if (t <= 0) return 0;
      if (t <= td) return dmax * Math.sin(w1 * t);
      if (t <= td + tr && e > 0) return set + (dmax - set) * Math.cos(w2 * (t - td));
      return set;
    }
    return {
      mu: mu, u: u, e: e, td: td, tr: tr, duration: td + tr, Fmax: Fmax, P: P, R: R, deltaMax: dmax, set: set,
      F: F, I: I, delta: delta,
      vA: function (t) { return vA1 - I(t) / mA; },
      vB: function (t) { return isFinite(mB) ? vB1 + I(t) / mB : vB1; }
    };
  };

  /* ================================================================== bodies on a straight track */
  MOMENTUM.line = function (spec) {
    spec = spec || {};
    var g = num(spec.g, MOMENTUM.G), th = num(spec.theta, 0), sn = Math.sin(th), cs = Math.cos(th);
    var dt = num(spec.dt, 0.0005), tmax = num(spec.tmax, 10), every = Math.max(1, Math.round(num(spec.sampleDt, 0.002) / dt));
    var VEPS = 1e-6, VREC = num(spec.vRecord, 0.01);
    var B = (spec.bodies || []).map(function (b, i) {
      var mu = num(b.mu, 0);
      return { i: i, m: num(b.m, 1), w: num(b.w, 0.4), x: num(b.x, 0), v: num(b.v, 0), mu: mu, muS: num(b.muS, mu), P: b.P, Pn: b.Pn,
        label: b.label || 'ABCDEFGH'.charAt(i) };
    });
    var n = B.length;
    if (!n) { report('line: no bodies'); }
    var eDef = clamp(num(spec.e, 1), 0, 1), pairE = [], pairCouple = [];
    for (var k = 0; k < n - 1; k++) { pairE[k] = eDef; pairCouple[k] = false; }
    (spec.pairs || []).forEach(function (pp) {
      var q = Math.min(pp.a, pp.b);
      if (q < 0 || q >= n - 1) return;
      if (pp.e != null) pairE[q] = clamp(+pp.e, 0, 1);
      if (pp.couple) pairCouple[q] = true;
    });
    var walls = (spec.walls || []).map(function (w) { return { x: +w.x, side: w.side === 1 ? 1 : -1, e: clamp(num(w.e, 1), 0, 1) }; });
    var springs = (spec.springs || []).map(function (s) { return { x: +s.x, side: s.side === -1 ? -1 : 1, k: num(s.k, 1000), len: num(s.len, 0.4) }; });
    var links = (spec.links || []).map(function (l) { return { a: l.a, b: l.b, k: num(l.k, 1000), len: num(l.len, 0.3) }; });

    // groups of bodies latched together by couplers
    var grp = B.map(function (b, i) { return i; });
    var offs = B.map(function () { return 0; });
    function members(gid) { var out = []; for (var j = 0; j < n; j++) if (grp[j] === gid) out.push(j); return out; }
    function groupMass(gid) { var m = 0; members(gid).forEach(function (j) { m += B[j].m; }); return m; }

    function Nof(b, t) {                             // the normal force: weight component less any pull away from the track
      var Pn = b.Pn, q = 0;
      if (typeof Pn === 'function') { q = +Pn(t); if (!isFinite(q)) q = 0; } else q = num(Pn, 0);
      return Math.max(0, b.m * g * cs - q);
    }
    function PnOf(b, t) { var Pn = b.Pn; if (typeof Pn === 'function') { var q = +Pn(t); return isFinite(q) ? q : 0; } return num(Pn, 0); }
    function Pof(b, t) {
      var P = b.P;
      if (P == null) return 0;
      if (typeof P === 'function') { var f = +P(t); return isFinite(f) ? f : 0; }
      return num(P, 0);
    }
    // spring forces (wall springs and links) on every body at positions X
    function springF(X, out) {
      for (var j = 0; j < n; j++) out[j] = 0;
      var Ve = 0;
      springs.forEach(function (s) {
        for (var j = 0; j < n; j++) {
          var c = s.side === 1 ? X[j] + B[j].w / 2 - s.x : s.x - (X[j] - B[j].w / 2);
          if (c > 0) { out[j] += -s.side * s.k * c; Ve += 0.5 * s.k * c * c; }
        }
      });
      links.forEach(function (l) {
        var gap = (X[l.b] - B[l.b].w / 2) - (X[l.a] + B[l.a].w / 2), c = l.len - gap;
        if (c > 0) { out[l.a] -= l.k * c; out[l.b] += l.k * c; Ve += 0.5 * l.k * c * c; }
      });
      return Ve;
    }

    // ---- state
    var t = 0, X = B.map(function (b) { return b.x; }), V = B.map(function (b) { return b.v; });
    var stuck = B.map(function () { return false; });
    var I = { P: [], Ff: [], Fs: [], W: [], C: [], wall: [] };
    Object.keys(I).forEach(function (key) { for (var j = 0; j < n; j++) I[key][j] = 0; });
    var Uf = 0, Up = 0, lost = 0, events = [];
    var Fnow = { P: [], Ff: [], Fs: [], W: [], N: [] };
    var FsTmp = [];

    // ---- samples
    var S = { t: [], Ve: [], Uf: [], Up: [], lost: [], x: [], v: [], st: [], FP: [], FF: [], FS: [], I: {} };
    for (var j0 = 0; j0 < n; j0++) { S.x.push([]); S.v.push([]); S.st.push([]); S.FP.push([]); S.FF.push([]); S.FS.push([]); }
    Object.keys(I).forEach(function (key) { S.I[key] = []; for (var j = 0; j < n; j++) S.I[key].push([]); });

    function frictionNow() {
      // the friction force at this instant, for drawing (static: whatever holds the body; kinetic: µk N)
      springF(X, FsTmp);
      for (var j = 0; j < n; j++) {
        var N = Nof(B[j], t), Fo = Pof(B[j], t) - B[j].m * g * sn + FsTmp[j];
        Fnow.P[j] = Pof(B[j], t); Fnow.Fs[j] = FsTmp[j]; Fnow.W[j] = -B[j].m * g * sn; Fnow.N[j] = N;
        if (Math.abs(V[j]) > VEPS) Fnow.Ff[j] = -sgn(V[j]) * B[j].mu * N;
        else if (stuck[j]) Fnow.Ff[j] = -Fo;
        else Fnow.Ff[j] = Math.abs(Fo) > B[j].muS * N ? -sgn(Fo) * B[j].mu * N : -Fo;
      }
    }
    function record() {
      frictionNow();
      var Ve = springF(X, FsTmp);
      S.t.push(t); S.Ve.push(Ve); S.Uf.push(Uf); S.Up.push(Up); S.lost.push(lost);
      for (var j = 0; j < n; j++) {
        S.x[j].push(X[j]); S.v[j].push(V[j]); S.st[j].push(stuck[j] ? 1 : 0);
        S.FP[j].push(Fnow.P[j]); S.FF[j].push(Fnow.Ff[j]); S.FS[j].push(Fnow.Fs[j]);
        for (var key in I) S.I[key][j].push(I[key][j]);
      }
    }

    function overlap() {
      for (var q = 0; q < n - 1; q++) if (grp[q] !== grp[q + 1] && (X[q + 1] - B[q + 1].w / 2) - (X[q] + B[q].w / 2) <= 1e-9 && V[q] - V[q + 1] > VREC) return true;
      for (var wi = 0; wi < walls.length; wi++) {
        var w = walls[wi];
        for (var j = 0; j < n; j++) {
          var pen = w.side === -1 ? w.x - (X[j] - B[j].w / 2) : (X[j] + B[j].w / 2) - w.x;
          if (pen >= -1e-9 && (w.side === -1 ? -V[j] : V[j]) > VREC) return true;
        }
      }
      return false;
    }
    function popSample() {
      S.t.pop(); S.Ve.pop(); S.Uf.pop(); S.Up.pop(); S.lost.pop();
      for (var j = 0; j < n; j++) {
        S.x[j].pop(); S.v[j].pop(); S.st[j].pop(); S.FP[j].pop(); S.FF[j].pop(); S.FS[j].pop();
        for (var key in I) S.I[key][j].pop();
      }
    }
    // apply an impulse J (along +x) to body j and every body latched to it; credit it to category cat of each body
    function kick(j, J, cat) {
      var mem = members(grp[j]), M = 0;
      mem.forEach(function (q) { M += B[q].m; });
      var dv = J / M;
      mem.forEach(function (q) { V[q] += dv; I[cat][q] += B[q].m * dv; stuck[q] = false; });
    }
    function effMass(j) { return groupMass(grp[j]); }
    function groupV(j) { var mem = members(grp[j]), P = 0, M = 0; mem.forEach(function (q) { P += B[q].m * V[q]; M += B[q].m; }); return P / M; }
    function Tsum() { var T = 0; for (var j = 0; j < n; j++) T += 0.5 * B[j].m * V[j] * V[j]; return T; }

    // pairs (and body–wall pairs) that were already touching: pressing on, they are in resting contact, not impact
    var touchP = [], touchW = walls.map(function () { return []; });
    function contacts(tPrev, Xprev) {
      for (var pass = 0; pass < 3 * n + 3; pass++) {
        var any = false;
        for (var q = 0; q < n - 1; q++) {
          if (grp[q] === grp[q + 1]) continue;
          var gap = (X[q + 1] - B[q + 1].w / 2) - (X[q] + B[q].w / 2);
          if (gap > 1e-9) continue;
          var va = groupV(q), vb = groupV(q + 1), u = va - vb;
          if (u > 1e-12) {
            var ma = effMass(q), mb = effMass(q + 1), couple = pairCouple[q], e = couple ? 0 : pairE[q];
            var r = MOMENTUM.impact(ma, va, mb, vb, e), T0 = Tsum();
            kick(q, -r.J, 'C'); kick(q + 1, r.J, 'C');
            var dl = T0 - Tsum();
            lost += dl;
            if (u > VREC && !touchP[q]) {
              var gp = (Xprev[q + 1] - B[q + 1].w / 2) - (Xprev[q] + B[q].w / 2), f = gp > 0 && gp - gap > EPS ? gp / (gp - gap) : 1;
              events.push({ t: tPrev + (t - tPrev) * clamp(f, 0, 1), kind: 'impact', a: q, b: q + 1, e: e, va1: va, vb1: vb,
                va2: groupV(q), vb2: groupV(q + 1), J: r.J, lost: dl, couple: !!couple });
            }
            if (couple) {                              // latch: merge the two groups
              var gOld = grp[q + 1], gNew = grp[q];
              for (var z = 0; z < n; z++) if (grp[z] === gOld) grp[z] = gNew;
              var mem = members(gNew), M = 0, Xc = 0;
              mem.forEach(function (z2) { M += B[z2].m; Xc += B[z2].m * X[z2]; });
              Xc /= M;
              mem.forEach(function (z2) { offs[z2] = X[z2] - Xc; });
            }
            any = true;
          }
          if (gap < 0) {                               // separate the overlap, in inverse proportion to the masses
            var ma2 = effMass(q), mb2 = effMass(q + 1), sh = -gap;
            var da = -sh * mb2 / (ma2 + mb2), db = sh * ma2 / (ma2 + mb2);
            members(grp[q]).forEach(function (z) { X[z] += da; });
            members(grp[q + 1]).forEach(function (z) { X[z] += db; });
          }
        }
        walls.forEach(function (w) {
          for (var j = 0; j < n; j++) {
            var pen = w.side === -1 ? w.x - (X[j] - B[j].w / 2) : (X[j] + B[j].w / 2) - w.x;
            if (pen < -1e-9) continue;
            var vj = groupV(j), into = w.side === -1 ? -vj : vj;
            if (into > 1e-12) {
              var T0 = Tsum(), J = -w.side * (1 + w.e) * into * effMass(j);
              kick(j, J, 'wall');
              var dl = T0 - Tsum();
              lost += dl;
              if (into > VREC && !touchW[walls.indexOf(w)][j]) events.push({ t: t, kind: 'wall', a: j, side: w.side, e: w.e, v1: vj, v2: groupV(j), J: J, lost: dl });
              any = true;
            }
            if (pen > 0) members(grp[j]).forEach(function (z) { X[z] -= w.side * pen; });
          }
        });
        if (!any) break;
      }
      for (var q3 = 0; q3 < n - 1; q3++) touchP[q3] = (X[q3 + 1] - B[q3 + 1].w / 2) - (X[q3] + B[q3].w / 2) < 1e-7;
      walls.forEach(function (w, wi) {
        for (var j = 0; j < n; j++) touchW[wi][j] = (w.side === -1 ? (X[j] - B[j].w / 2) - w.x : w.x - (X[j] + B[j].w / 2)) < 1e-7;
      });
    }

    // derivatives for the continuous step; mode[j]: 0 free/kinetic with fixed friction sign fs[j], 1 stuck
    var mode = [], fsg = [];
    function accel(Xs, Vs, ts, out, Fout) {
      springF(Xs, FsTmp);
      for (var j = 0; j < n; j++) {
        var b = B[j], N = Nof(b, ts);
        var P = Pof(b, ts), W = -b.m * g * sn, Fs = FsTmp[j];
        var Ff = mode[j] === 1 ? 0 : fsg[j] * b.mu * N;
        Fout.P[j] = P; Fout.W[j] = W; Fout.Fs[j] = Fs; Fout.Ff[j] = Ff;
        out[j] = mode[j] === 1 ? 0 : (P + W + Fs + Ff) / b.m;
      }
      // bodies latched together share one acceleration (the coupler's force is internal to the group)
      var seen = {};
      for (var j2 = 0; j2 < n; j2++) {
        var gid = grp[j2];
        if (seen[gid]) continue;
        seen[gid] = true;
        var mem = members(gid);
        if (mem.length < 2) continue;
        var Ft = 0, M = 0;
        mem.forEach(function (q) { Ft += out[q] * B[q].m; M += B[q].m; });
        mem.forEach(function (q) { out[q] = Ft / M; });
      }
    }
    var kF = [0, 1, 2, 3].map(function () { return { P: [], W: [], Fs: [], Ff: [] }; });
    var ka = [[], [], [], []], kv = [[], [], [], []];

    record();
    var still = 0, steps = 0, maxSteps = Math.ceil(tmax / dt) + 2;
    var halted = false;
    while (t < tmax - 1e-12 && steps < maxSteps) {
      steps++;
      // friction mode for this step
      springF(X, FsTmp);
      for (var j = 0; j < n; j++) {
        var b = B[j], N = Nof(b, t), Fo = Pof(b, t) - b.m * g * sn + FsTmp[j];
        if (Math.abs(V[j]) > VEPS) { mode[j] = 0; fsg[j] = -sgn(V[j]); if (stuck[j]) stuck[j] = false; }
        else if (b.mu <= 0 && b.muS <= 0) { mode[j] = 0; fsg[j] = 0; }
        else if (Math.abs(Fo) <= b.muS * N + 1e-12) {
          if (!stuck[j]) { stuck[j] = true; if (t > 0) events.push({ t: t, kind: 'rest', a: j }); }
          mode[j] = 1; V[j] = 0;
        } else {
          if (stuck[j]) { stuck[j] = false; events.push({ t: t, kind: 'slip', a: j }); }
          mode[j] = 0; fsg[j] = -sgn(Fo);
        }
      }
      // a latched group is held by static friction only if all of it is (keep it simple: if any member slides, all do)
      var V0 = V.slice(), X0 = X.slice(), t0 = t;
      // RK4
      var Xs = X.slice(), Vs = V.slice();
      accel(X0, V0, t0, ka[0], kF[0]); kv[0] = V0.slice();
      for (j = 0; j < n; j++) { Xs[j] = X0[j] + 0.5 * dt * kv[0][j]; Vs[j] = V0[j] + 0.5 * dt * ka[0][j]; }
      accel(Xs, Vs, t0 + dt / 2, ka[1], kF[1]); kv[1] = Vs.slice();
      for (j = 0; j < n; j++) { Xs[j] = X0[j] + 0.5 * dt * kv[1][j]; Vs[j] = V0[j] + 0.5 * dt * ka[1][j]; }
      accel(Xs, Vs, t0 + dt / 2, ka[2], kF[2]); kv[2] = Vs.slice();
      for (j = 0; j < n; j++) { Xs[j] = X0[j] + dt * kv[2][j]; Vs[j] = V0[j] + dt * ka[2][j]; }
      accel(Xs, Vs, t0 + dt, ka[3], kF[3]); kv[3] = Vs.slice();
      t = t0 + dt;
      for (j = 0; j < n; j++) {
        if (mode[j] === 1) { X[j] = X0[j]; V[j] = 0; }
        else {
          X[j] = X0[j] + dt / 6 * (kv[0][j] + 2 * kv[1][j] + 2 * kv[2][j] + kv[3][j]);
          V[j] = V0[j] + dt / 6 * (ka[0][j] + 2 * ka[1][j] + 2 * ka[2][j] + ka[3][j]);
          // kinetic friction cannot reverse the motion: it stopped during this step
          if (fsg[j] !== 0 && Math.abs(V0[j]) > VEPS && V[j] * V0[j] < 0) { V[j] = 0; X[j] = X0[j] + 0.5 * V0[j] * dt; }
        }
        // impulses of the continuous forces over the step (RK4 weights), and friction as what is left
        var iP = 0, iW = 0, iS = 0, uP = 0;
        for (var s4 = 0; s4 < 4; s4++) {
          var wgt = (s4 === 0 || s4 === 3 ? 1 : 2) * dt / 6;
          iP += wgt * kF[s4].P[j]; iW += wgt * kF[s4].W[j]; iS += wgt * kF[s4].Fs[j];
          uP += wgt * kF[s4].P[j] * kv[s4][j];
        }
        if (mode[j] === 1) { uP = 0; }
        I.P[j] += iP; I.W[j] += iW; I.Fs[j] += iS;
        var iF = B[j].m * (V[j] - V0[j]) - iP - iW - iS;
        I.Ff[j] += iF;
        Up += uP;
        Uf += (mode[j] === 1 ? 0 : fsg[j] * B[j].mu * Nof(B[j], t0 + dt / 2)) * (X[j] - X0[j]);
      }
      // latched groups: equal velocities (momentum-preserving), fixed spacing
      var seenG = {};
      for (j = 0; j < n; j++) {
        var gid = grp[j];
        if (seenG[gid]) continue;
        seenG[gid] = true;
        var mem = members(gid);
        if (mem.length < 2) continue;
        var Pg = 0, Mg = 0, Xg = 0;
        mem.forEach(function (q) { Pg += B[q].m * V[q]; Mg += B[q].m; Xg += B[q].m * X[q]; });
        mem.forEach(function (q) { var dv = Pg / Mg - V[q]; I.C[q] += B[q].m * dv; V[q] = Pg / Mg; X[q] = Xg / Mg + offs[q]; });
      }
      var nEv = events.length, pre = overlap();
      if (pre) record();                               // an impact may follow: keep a sample just before it
      contacts(t0, X0);
      if (pre && events.length === nEv) { popSample(); }  // only resting contact: no jump to mark
      if (steps % every === 0 || events.length > nEv) record();
      // stop when nothing moves and nothing will
      var moving = false;
      for (j = 0; j < n; j++) if (Math.abs(V[j]) > 1e-5) moving = true;
      if (!moving && (spec.stopWhenStill !== false)) {
        var willMove = false;
        springF(X, FsTmp);
        for (j = 0; j < n; j++) {
          var Fo2 = Pof(B[j], t + dt) - B[j].m * g * sn + FsTmp[j];
          if (Math.abs(Fo2) > B[j].muS * Nof(B[j], t + dt) + 1e-9) willMove = true;
          if (typeof B[j].P === 'function') willMove = willMove || Math.abs(Pof(B[j], t + 0.5) - Pof(B[j], t)) > 1e-9;
        }
        still = willMove ? 0 : still + dt;
        if (still > 0.25) { halted = true; break; }
      } else still = 0;
      if (spec.until) {
        var stp = false;
        try { stp = spec.until({ t: t, x: X.slice(), v: V.slice() }); } catch (err) { stp = false; }
        if (stp) break;
      }
    }
    if (S.t[S.t.length - 1] < t - 1e-12) record();

    var N1 = S.t.length;
    function idx(tq) {
      var lo = 0, hi = N1 - 1;
      if (tq <= S.t[0]) return 0;
      if (tq >= S.t[hi]) return hi;
      while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (S.t[mid] <= tq) lo = mid; else hi = mid; }
      return lo;
    }
    var run = { spec: spec, bodies: B, n: n, events: events, duration: S.t[N1 - 1], samples: S, halted: halted, g: g, theta: th };
    run.at = function (tq) {
      tq = clamp(num(tq, 0), 0, run.duration);
      var i0 = idx(tq), i1 = Math.min(N1 - 1, i0 + 1);
      while (i1 < N1 - 1 && S.t[i1] <= tq) { i0 = i1; i1++; }                // equal times: the later sample (after an impact)
      var dT = S.t[i1] - S.t[i0], f = dT > 1e-12 ? clamp((tq - S.t[i0]) / dT, 0, 1) : 0;
      if (i1 === i0) f = 0;
      function L(a) { return a[i0] + (a[i1] - a[i0]) * f; }
      var st = { t: tq, x: [], v: [], p: [], T: [], stuck: [], F: { P: [], Pn: [], Ff: [], Fs: [], W: [], N: [] }, I: {} };
      Object.keys(I).forEach(function (key) { st.I[key] = []; });
      var ptot = 0, Ttot = 0;
      for (var j = 0; j < n; j++) {
        var x = L(S.x[j]), v = L(S.v[j]);
        st.x.push(x); st.v.push(v); st.p.push(B[j].m * v); st.T.push(0.5 * B[j].m * v * v);
        st.stuck.push(S.st[j][i0] === 1);
        ptot += B[j].m * v; Ttot += 0.5 * B[j].m * v * v;
        st.F.P.push(L(S.FP[j])); st.F.Ff.push(S.FF[j][f < 0.5 ? i0 : i1]); st.F.Fs.push(L(S.FS[j]));
        st.F.W.push(-B[j].m * g * Math.sin(th)); st.F.N.push(Nof(B[j], tq)); st.F.Pn.push(PnOf(B[j], tq));
        for (var key in I) st.I[key].push(L(S.I[key][j]));
      }
      st.ptot = ptot; st.Ttot = Ttot;
      st.Ve = L(S.Ve); st.Uf = L(S.Uf); st.Up = L(S.Up); st.lost = S.lost[f < 0.5 ? i0 : i1];
      var Vg = 0;
      for (j = 0; j < n; j++) Vg += B[j].m * g * Math.sin(th) * st.x[j];
      st.Vg = Vg;
      st.E = Ttot + st.Ve + Vg;
      return st;
    };
    // extents, for scales
    var ext = { v: 0, p: 0, F: 0, T: 0 };
    for (var q2 = 0; q2 < N1; q2++) {
      var pt = 0, Tt = 0;
      for (var j3 = 0; j3 < n; j3++) {
        var vv = S.v[j3][q2];
        ext.v = Math.max(ext.v, Math.abs(vv));
        ext.p = Math.max(ext.p, Math.abs(B[j3].m * vv));
        ext.F = Math.max(ext.F, Math.abs(S.FP[j3][q2]), Math.abs(S.FF[j3][q2]), Math.abs(S.FS[j3][q2]));
        pt += B[j3].m * vv; Tt += 0.5 * B[j3].m * vv * vv;
      }
      ext.p = Math.max(ext.p, Math.abs(pt));
      ext.T = Math.max(ext.T, Tt);
    }
    run.extent = ext;
    return run;
  };

  /* ================================================================== a ball bouncing on a fixed floor */
  MOMENTUM.bounce = function (o) {
    o = o || {};
    var g = num(o.g, MOMENTUM.G), e = clamp(num(o.e, 0.8), 0, 1), tmax = num(o.tmax, 8), vmin = num(o.vmin, 0.05);
    var x0 = num(o.x0, 0), h0 = Math.max(0, num(o.h0, 1)), vx = num(o.vx, 0), vy0 = num(o.vy, 0);
    var arcs = [], events = [], peaks = [], t = 0, y = h0, vy = vy0, done = false;
    for (var k = 0; k < 400 && t < tmax; k++) {
      // y(τ) = y + vy τ − g τ²/2 hits 0 at τ = (vy + sqrt(vy² + 2 g y)) / g
      var tau = (vy + Math.sqrt(vy * vy + 2 * g * y)) / g;
      arcs.push({ t0: t, y0: y, vy0: vy, t1: t + tau });
      var v1 = vy - g * tau;                          // downward: negative
      t += tau;
      var v2 = -e * v1;
      events.push({ t: t, x: x0 + vx * t, v1: v1, v2: v2 });
      if (v2 < vmin) { done = true; break; }
      peaks.push(v2 * v2 / (2 * g));
      y = 0; vy = v2;
    }
    var tEnd = Math.min(tmax, done ? t + 0.6 : t);
    if (done) arcs.push({ t0: t, y0: 0, vy0: 0, t1: tEnd, rest: true });
    function at(tq) {
      tq = clamp(num(tq, 0), 0, tEnd);
      for (var i = 0; i < arcs.length; i++) {
        var a = arcs[i];
        if (tq <= a.t1 || i === arcs.length - 1) {
          var s = tq - a.t0;
          if (a.rest) return { t: tq, x: x0 + vx * tq, y: 0, vx: vx, vy: 0 };
          return { t: tq, x: x0 + vx * tq, y: Math.max(0, a.y0 + a.vy0 * s - 0.5 * g * s * s), vx: vx, vy: a.vy0 - g * s };
        }
      }
      return { t: tq, x: x0 + vx * tq, y: 0, vx: vx, vy: 0 };
    }
    return { duration: tEnd, events: events, peaks: peaks, at: at, e: e, g: g };
  };

  /* ================================================================== two pucks on smooth ice */
  MOMENTUM.pucks = function (o) {
    var A = o.A, Bq = o.B, e = clamp(num(o.e, 1), 0, 1), tmax = num(o.tmax, 6);
    var dp = [Bq.p[0] - A.p[0], Bq.p[1] - A.p[1]], dv = [Bq.v[0] - A.v[0], Bq.v[1] - A.v[1]], R = A.r + Bq.r;
    // |dp + dv t| = R: (dv·dv) t² + 2 (dp·dv) t + dp·dp − R² = 0, first root
    var a = dv[0] * dv[0] + dv[1] * dv[1], b = 2 * (dp[0] * dv[0] + dp[1] * dv[1]), c = dp[0] * dp[0] + dp[1] * dp[1] - R * R;
    var hit = null;
    if (a > EPS && b < 0) {
      var disc = b * b - 4 * a * c;
      if (disc >= 0) {
        var th = (-b - Math.sqrt(disc)) / (2 * a);
        if (th >= 0 && th < tmax) {
          var pA = [A.p[0] + A.v[0] * th, A.p[1] + A.v[1] * th], pB = [Bq.p[0] + Bq.v[0] * th, Bq.p[1] + Bq.v[1] * th];
          var res = MOMENTUM.oblique({ mA: A.m, mB: Bq.m, vA: A.v, vB: Bq.v, n: [pB[0] - pA[0], pB[1] - pA[1]], e: e });
          hit = { t: th, pA: pA, pB: pB, n: res.n, res: res };
        }
      }
    }
    function at(tq) {
      tq = clamp(num(tq, 0), 0, tmax);
      if (!hit || tq <= hit.t) return { t: tq, pA: [A.p[0] + A.v[0] * tq, A.p[1] + A.v[1] * tq], pB: [Bq.p[0] + Bq.v[0] * tq, Bq.p[1] + Bq.v[1] * tq], vA: A.v.slice(), vB: Bq.v.slice(), after: false };
      var s = tq - hit.t, r = hit.res;
      return { t: tq, pA: [hit.pA[0] + r.vA2[0] * s, hit.pA[1] + r.vA2[1] * s], pB: [hit.pB[0] + r.vB2[0] * s, hit.pB[1] + r.vB2[1] * s], vA: r.vA2.slice(), vB: r.vB2.slice(), after: true };
    }
    return { duration: tmax, hit: hit, at: at };
  };

  /* ================================================================== transport for any animated stage */
  MOMENTUM.player = function (o) {
    var ENERGY = window.ENERGY;
    o = Object.assign({ speed: 1, loop: false, autoplay: false, transport: true, playback: true }, o || {});
    if (!ENERGY || !ENERGY._makeTransport) { report('player: ENERGY (energy.js) is not loaded'); return null; }
    // the clock runs from o.start (default 0) to o.duration (both may be functions)
    function t0() { return typeof o.start === 'function' ? o.start() : num(o.start, 0); }
    function dur() { return typeof o.duration === 'function' ? o.duration() : num(o.duration, 1); }
    var t = t0();
    var visible = true, unVis = null;
    if (CYL.onVisible) unVis = CYL.onVisible(o.stage, function (on) { visible = on; });
    var tr = ENERGY._makeTransport({
      o: o, stage: o.stage,
      getT: function () { return t; },
      setT: function (v) { t = v; sync(); },
      range: function () { return [t0(), dur()]; },
      drive: function (fn) {
        var raf = 0, last = 0, dead = false;
        function frame(ts) {
          raf = 0;
          if (dead) return;
          var d = last ? Math.min(0.1, (ts - last) / 1000) : 0;
          last = ts;
          if (!visible) last = 0;
          else if (fn(d) === false) { dead = true; return; }
          raf = window.requestAnimationFrame(frame);
        }
        raf = window.requestAnimationFrame(frame);
        return function () { dead = true; if (raf) window.cancelAnimationFrame(raf); raf = 0; };
      }
    });
    function sync() {
      try { o.onTime(t); } catch (e) { report('player: onTime failed: ' + e.message); }
      tr.syncSlider(); tr.syncPlay();
    }
    var api = {
      t: function () { return t; },
      setT: function (v) { tr.pause(); t = clamp(+v || 0, t0(), dur()); sync(); return api; },
      play: function () { tr.play(); return api; },
      pause: function () { tr.pause(); return api; },
      reset: function () { tr.reset(); return api; },
      isPlaying: function () { return tr.isPlaying(); },
      destroy: function () { tr.pause(); if (unVis) unVis(); },
      refresh: function (keepT) { tr.pause(); t = keepT ? clamp(t, t0(), dur()) : t0(); sync(); if (tr.refreshSlider) tr.refreshSlider(); return api; },
      bar: tr.bar
    };
    sync();
    if (o.autoplay && !CYL.prefersReducedMotion()) tr.play();
    return api;
  };

  /* ================================================================== momentum bars: signed, horizontal */
  function cssVar(c) {
    var map = { good: '--c-good', z: '--c-z', t: '--c-t', r: '--c-r', warn: '--c-warn', ink: '--ink', muted: '--ink-muted', accent: '--accent', bad: '--c-bad' };
    return 'var(' + (map[c] || '--accent') + ')';
  }
  MOMENTUM.cssVar = cssVar;
  MOMENTUM.pbars = function (container, o) {
    o = o || {};
    var unit = o.unit || 'kg·m/s', items = o.items || [];
    var wrap = CYL.el('div', { class: 'lg pb', role: 'group', 'aria-label': o.ariaLabel || 'Momentum bars' });
    if (o.title) wrap.appendChild(CYL.el('p', { class: 'viz-title', text: o.title }));
    var rows = {};
    function row(key, label, color, kind) {
      var r = CYL.el('div', { class: 'lg-row ' + kind });
      var lab = CYL.el('span', { class: 'lg-label', html: '\\(' + label + '\\)' });
      var track = CYL.el('div', { class: 'lg-track' }), bar = CYL.el('div', { class: 'lg-bar' }), val = CYL.el('span', { class: 'lg-val' });
      var zero = CYL.el('div', { class: 'lg-zero' });
      zero.style.left = '50%';
      bar.style.setProperty('--lg', cssVar(color));
      track.appendChild(zero); track.appendChild(bar);
      r.appendChild(lab); r.appendChild(track); r.appendChild(val);
      wrap.appendChild(r);
      rows[key] = { bar: bar, val: val };
    }
    items.forEach(function (it) { row(it.key, it.label, it.color || 'good', 'pb-item'); });
    var total = o.total !== false;
    if (total) row('total', (o.total && o.total.label) || '\\textstyle\\sum mv', 'ink', 'lg-end pb-total');
    container.appendChild(wrap);
    CYL.renderMath(wrap);
    var hi = 1;
    var api = {
      el: wrap,
      setScale: function (m) { hi = Math.max(EPS, m); return api; },
      set: function (vals) {
        var sum = 0;
        items.forEach(function (it) {
          var v = num(vals[it.key], 0);
          sum += v;
          place(rows[it.key], v);
        });
        if (total) place(rows.total, vals.total != null ? num(vals.total, sum) : sum);
        return api;
      }
    };
    function place(r, v) {
      var f = clamp(v / hi, -1, 1) * 50;
      r.bar.style.left = (f >= 0 ? 50 : 50 + f) + '%';
      r.bar.style.width = Math.max(0.4, Math.abs(f)) + '%';
      r.val.textContent = fmt(Math.abs(v) < 5e-4 * hi ? 0 : v, 3) + ' ' + unit;
    }
    return api;
  };

  /* ================================================================== the animated figure */
  var IMPULSE_DEF = {
    P: { label: 'I_P', color: 'warn', name: 'Impulse of the applied force' },
    Ff: { label: 'I_f', color: 'r', name: 'Impulse of friction' },
    W: { label: 'I_W', color: 'z', name: 'Impulse of the weight along the track' },
    Fs: { label: 'I_s', color: 't', name: 'Impulse of the spring' },
    C: { label: 'I_C', color: 'bad', name: 'Impulse from the other body' },
    wall: { label: 'I_{\\text{wall}}', color: 'bad', name: 'Impulse from the wall' }
  };
  MOMENTUM.IMPULSES = IMPULSE_DEF;

  MOMENTUM.figures = [];
  MOMENTUM.figure = function (opts) {
    var ENERGY = window.ENERGY;
    var o = Object.assign({
      t0: 0, speed: 1, loop: false, autoplay: false, transport: true, playback: true, maxHeight: 360, flash: 0.35,
      forces: ['W', 'N', 'Ff', 'P', 'Fs'], toggles: ['v'], readouts: ['t'], pbars: true
    }, opts || {});
    if (!o.stage) { report('figure: opts.stage is required'); return null; }
    if (!window.CYL2D || !ENERGY) { report('figure: CYL2D and ENERGY are required'); return null; }
    if (!o.aria) report('figure: opts.aria (a plain-text description) is required');
    var show = Object.assign({ v: true, forces: false, impulse: true }, o.show);
    var spec = o.spec, run = MOMENTUM.line(spec);
    var tk = Object.assign({ origin: [0, 0] }, o.track);
    var th = tk.theta != null ? tk.theta : num(spec.theta, 0), ct = Math.cos(th), st0 = Math.sin(th);
    var cam = 0, fol = o.follow ? Object.assign({ body: 0, lead: 0.35 }, o.follow === true ? {} : o.follow) : null;
    function P(s, h) { s -= cam; return [tk.origin[0] + s * ct - h * st0, tk.origin[1] + s * st0 + h * ct]; }
    var xspan = o.xRange[1] - o.xRange[0], yspan = o.yRange[1] - o.yRange[0];
    function baseHeight() {
      if (o.height) return o.height;
      var w = o.stage.clientWidth || 600;
      return Math.round(Math.min(o.maxHeight, Math.max(160, w * yspan / xspan)));
    }
    var curH = baseHeight();
    var p = CYL2D.plane(o.stage, {
      xRange: o.xRange, yRange: o.yRange, grid: 'none', axes: false, height: curH, maxHeight: Math.max(o.maxHeight, 900),
      ariaLabel: o.aria || 'Animated figure'
    });
    var span = Math.min(xspan, yspan);
    var fig = { plane: p };
    MOMENTUM.figures.push(fig);                       // every figure on the page, for tests
    var COLORS = ['accent', 'warn', 'z', 't', 'good'];
    var draws = run.bodies.map(function (b, i) {
      var d = Object.assign({ shape: 'block', h: 0.3, color: COLORS[i % COLORS.length] }, (o.draw || [])[i]);
      if (d.shape === 'ball') d.h = b.w;
      return d;
    });
    var s0 = tk.from != null ? tk.from : o.xRange[0], s1 = tk.to != null ? tk.to : o.xRange[1];
    // scenery: the track, walls
    var gScene = p.group(), gSpr = p.group(), gBody = p.group(), gArr = p.group();
    if (o.decorate) { try { o.decorate(p, fig); } catch (e) { report('figure: decorate failed: ' + e.message); } }
    var hMax = 0;
    draws.forEach(function (d) { hMax = Math.max(hMax, d.h); });
    var hatchGap = Math.max(0.12, xspan / 60), hatchLen = Math.max(0.08, xspan / 90), wallGap = Math.max(0.1, hMax / 4);
    function niceStep(raw) { var m = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), q = raw / m; return (q <= 1 ? 1 : q <= 2 ? 2 : q <= 5 ? 5 : 10) * m; }
    function drawScenery() {                         // the ground, walls and spring mounts; redrawn as the view follows a body
      gScene.clear();
      var a = s0 + cam, b = s1 + cam;
      if (tk.ground !== false) {
        gScene.line(P(a, 0), P(b, 0), { color: 'ink', width: 2.2 });
        for (var q = Math.ceil(a / hatchGap) * hatchGap; q <= b; q += hatchGap) {
          var u = P(q, 0), w = P(q - 0.6 * hatchLen, -hatchLen);
          gScene.line(u, w, { color: 'muted', width: 1 });
        }
        if (fol) {                                   // distance marks, so the motion shows while the view follows
          var stp = niceStep(xspan / 5);
          for (var m = Math.ceil(a / stp) * stp; m <= b; m += stp) {
            gScene.line(P(m, 0), P(m, -2.2 * hatchLen), { color: 'ink', width: 1.4 });
            gScene.label(P(m, -2.2 * hatchLen), CYL.fmt(m, 4) + ' m', { tex: false, color: 'muted', anchor: 's', offset: [0, 1] });
          }
        }
      }
      (spec.walls || []).forEach(function (w) {
        var wh = Math.max(hMax * 1.6, 0.3);
        gScene.line(P(w.x, 0), P(w.x, wh), { color: 'ink', width: 4 });
        if (ENERGY.hatch) ENERGY.hatch(gScene, P(w.x, wh), P(w.x, 0), { side: w.side === -1 ? -1 : 1, gap: wallGap, len: 0.8 * wallGap });
      });
      sprH.forEach(function (S) {
        var wh = Math.max(hMax * 1.4, 0.3);
        gScene.line(P(S.xw, 0), P(S.xw, wh), { color: 'ink', width: 4 });
        if (ENERGY.hatch) ENERGY.hatch(gScene, P(S.xw, wh), P(S.xw, 0), { side: S.side, gap: wallGap, len: 0.8 * wallGap });
      });
    }
    var sprH = [], linkH = [];
    function buildMounts() {                         // springs (and their mounts) and links, from the spec
      gSpr.clear();
      sprH = (spec.springs || []).map(function (s) {
        var side = s.side === -1 ? -1 : 1, xw = s.x + side * num(s.len, 0.4);
        return { s: s, xw: xw, side: side, h: gSpr.polyline([], { color: 't', width: 2 }) };
      });
      linkH = (spec.links || []).map(function (l) { return { l: l, h: gSpr.polyline([], { color: 't', width: 2 }) }; });
      drawScenery();
    }
    buildMounts();

    var bodyH = run.bodies.map(function (b, i) {
      var d = draws[i], h = {};
      if (d.shape === 'ball') h.body = gBody.circle({ center: [0, 0], r: b.w / 2, color: 'ink', width: 1.6, fill: d.color, fillOpacity: 0.55 });
      else h.body = gBody.polyline([[0, 0], [1, 0], [1, 1]], { closed: true, color: 'ink', width: 1.6, fill: d.color, fillOpacity: 0.3 });
      if (d.shape === 'cart') {
        h.w1 = gBody.circle({ center: [0, 0], r: 0.05, color: 'ink', width: 1.4, fill: 'bg', fillOpacity: 1 });
        h.w2 = gBody.circle({ center: [0, 0], r: 0.05, color: 'ink', width: 1.4, fill: 'bg', fillOpacity: 1 });
      }
      h.label = gBody.label([0, 0], b.label, { tex: true, color: 'ink' });
      h.v = gArr.line([0, 0], [0, 0], { color: 'good', width: 3, arrow: true, label: 'v_' + b.label, labelAt: 1, labelSide: 'left' });
      var F = {};
      F.W = gArr.line([0, 0], [0, 0], { color: 'z', width: 2.6, arrow: true, label: 'W', labelAt: 0, labelSide: 'right' });
      F.N = gArr.line([0, 0], [0, 0], { color: 'ink', width: 2.6, arrow: true, label: 'N', labelAt: 0, labelSide: 'right' });
      F.Ff = gArr.line([0, 0], [0, 0], { color: 'r', width: 4.2, arrow: true, label: 'F_f', labelAt: 1, labelSide: 'left' });
      F.P = gArr.line([0, 0], [0, 0], { color: 'warn', width: 2.6, arrow: true, label: 'P', labelAt: 0, labelSide: 'left' });
      F.Fs = gArr.line([0, 0], [0, 0], { color: 't', width: 2.6, arrow: true, label: 'F_s', labelAt: 0, labelSide: 'left' });
      h.F = F;
      h.imp = gArr.line([0, 0], [0, 0], { color: 'bad', width: 3.4, arrow: true, label: 'F', labelAt: 0, labelSide: 'left' });
      return h;
    });

    /* ----- scales */
    var vScale = o.vScale || 0, fScale = o.fScale || 0;
    function autoScales() {
      if (!o.vScale) vScale = run.extent.v > EPS ? 0.16 * xspan / run.extent.v : 0.1;
      var wmax = 0;
      run.bodies.forEach(function (b) { wmax = Math.max(wmax, b.m * run.g); });
      if (!o.fScale) fScale = Math.max(wmax, run.extent.F) > EPS ? 0.3 * yspan / Math.max(wmax, run.extent.F) : 0.01;
    }
    autoScales();

    /* ----- panel */
    var panel = o.controls || null, ctl = {}, bars = null, ledger = null, ro = {};
    var pScale = 1;
    if (panel) {
      if (o.panelTitle) panel.appendChild(CYL.el('p', { class: 'viz-title', text: o.panelTitle }));
      if (o.toggles && o.toggles.length) {
        var LBL = { v: ['Velocity', 'good'], forces: ['Forces', 'r'], impulse: ['Impact forces', 'bad'] };
        var row = CYL.el('div', { class: 'chip-row', role: 'group', 'aria-label': 'Show' });
        o.toggles.forEach(function (k) {
          if (!LBL[k]) return;
          ctl[k] = CYL.toggle({ label: LBL[k][0], color: LBL[k][1], value: !!show[k], onChange: function (on) { show[k] = on; sync(); } });
          row.appendChild(ctl[k].el);
        });
        panel.appendChild(CYL.el('p', { class: 'mf-show-label', text: 'Show' }));
        panel.appendChild(row);
      }
      if (o.pbars) {
        var po = typeof o.pbars === 'object' ? o.pbars : {};
        var idxs = po.items || run.bodies.map(function (b, i) { return i; });
        bars = MOMENTUM.pbars(panel, {
          items: idxs.map(function (i) { return { key: 'b' + i, label: 'm_' + run.bodies[i].label + 'v_' + run.bodies[i].label, color: draws[i].color === 'warn' ? 'warn' : draws[i].color }; }),
          total: idxs.length > 1 && po.total !== false, title: po.title || 'Momentum (kg·m/s), + to the right'
        });
      }
      if (o.ledger) {
        var lo2 = o.ledger, bi = lo2.body || 0, lb = run.bodies[bi].label;
        var works = (lo2.items || ['P', 'Ff']).map(function (k) { var d = IMPULSE_DEF[k]; return { key: k, label: d.label, color: d.color, name: d.name }; });
        ledger = ENERGY.ledger(panel, { works: works, start: 'm' + 'v_{' + lb + '1}', end: 'm' + 'v_{' + lb + '2}', unit: 'N·s', title: lo2.title || 'Impulse and momentum of ' + lb + ' (N·s)' });
        ledger.body = bi;
      }
      var keys = (o.readouts || []);
      if (keys.length) {
        var grid = CYL.el('div', { class: 'readout-grid', 'aria-live': 'off' });
        keys.forEach(function (k) {
          var def = readoutDef(k);
          if (!def) return;
          ro[k] = { def: def, h: CYL.readout(def[0], { color: def[1] || null }) };
          grid.appendChild(ro[k].h.el);
        });
        (o.readoutsEl || panel).appendChild(grid);
      }
    }
    function readoutDef(k) {
      if (k === 't') return ['Time \\(t\\)', null, function (s) { return s.t; }, 's'];
      if (k === 'ptot') return ['Total momentum \\(\\sum mv\\)', 'good', function (s) { return s.ptot; }, 'kg·m/s'];
      if (k === 'Ttot') return ['Total kinetic energy \\(\\sum T\\)', 'good', function (s) { return s.Ttot; }, 'J'];
      if (k === 'lost') return ['Energy lost in impacts', 'bad', function (s) { return s.lost; }, 'J'];
      if (k === 'Uf') return ['Work of friction \\(U_f\\)', 'r', function (s) { return s.Uf; }, 'J'];
      var m = /^(v|p|T|I|Ff|P)([A-H])$/.exec(k);
      if (!m) return null;
      var i = -1;
      run.bodies.forEach(function (b, q) { if (b.label === m[2]) i = q; });
      if (i < 0) return null;
      var L = m[2];
      if (m[1] === 'v') return ['Velocity \\(v_' + L + '\\)', 'good', function (s) { return s.v[i]; }, 'm/s'];
      if (m[1] === 'p') return ['Momentum \\(m_' + L + 'v_' + L + '\\)', 'good', function (s) { return s.p[i]; }, 'kg·m/s'];
      if (m[1] === 'T') return ['Kinetic energy \\(T_' + L + '\\)', 'good', function (s) { return s.T[i]; }, 'J'];
      if (m[1] === 'Ff') return ['Friction force on \\(' + L + '\\)', 'r', function (s) { return s.F.Ff[i]; }, 'N'];
      if (m[1] === 'P') return ['Applied force \\(P\\)', 'warn', function (s) { return s.F.P[i]; }, 'N'];
      return ['Impulse on \\(' + L + '\\) so far', null, function (s) { var q = 0; for (var key in s.I) q += s.I[key][i]; return q; }, 'N·s'];
    }
    function rescaleBars() {
      pScale = run.extent.p * 1.08 || 1;
      if (bars) bars.setScale(pScale);
      if (ledger) {
        var b = run.bodies[ledger.body], lo = 0, hi = 0, S = 160;
        for (var q = 0; q <= S; q++) {
          var s = run.at(run.duration * q / S), cum = b.m * run.at(0).v[ledger.body];
          lo = Math.min(lo, cum); hi = Math.max(hi, cum, s.p[ledger.body]);
          ledger.items.forEach(function (k) { cum += s.I[k][ledger.body] || 0; lo = Math.min(lo, cum); hi = Math.max(hi, cum); });
          lo = Math.min(lo, s.p[ledger.body]);
        }
        ledger.setScale(lo * 1.04, hi * 1.04 + 1e-9);
      }
    }
    rescaleBars();

    var t = clamp(num(o.t0, 0), 0, run.duration), state = null;
    function add(a, b, k) { return [a[0] + b[0] * k, a[1] + b[1] * k]; }
    var tv = [ct, st0], nv = [-st0, ct];
    var lastCam = 0;
    function sync() {
      state = run.at(t);
      var s = state;
      if (fol) {
        var fx = s.x[fol.body] - (s0 + fol.lead * (s1 - s0));
        cam = Math.max(0, fx);
        if (Math.abs(cam - lastCam) > 1e-9) { lastCam = cam; drawScenery(); }
      }
      run.bodies.forEach(function (b, i) {
        var d = draws[i], h = bodyH[i], x = s.x[i], hw = b.w / 2;
        var C = P(x, d.h / 2), top = P(x, d.h);
        if (d.shape === 'ball') h.body.set({ center: C, r: hw });
        else if (d.shape === 'cart') {
          var wr = Math.min(0.11 * b.w, 0.18 * d.h), y0 = 1.6 * wr;
          h.body.set([P(x - hw, y0), P(x + hw, y0), P(x + hw, d.h), P(x - hw, d.h)]);
          h.w1.set({ center: P(x - 0.28 * b.w, wr), r: wr });
          h.w2.set({ center: P(x + 0.28 * b.w, wr), r: wr });
          C = P(x, (y0 + d.h) / 2);
        } else h.body.set([P(x - hw, 0), P(x + hw, 0), P(x + hw, d.h), P(x - hw, d.h)]);
        h.label.set(show.forces && d.shape !== 'ball' ? [C[0] - 0.27 * b.w * ct, C[1] - 0.27 * b.w * st0] : C);
        // velocity above the body
        var v = s.v[i], vl = v * vScale, cap = 0.3 * xspan;
        if (Math.abs(vl) > cap) vl = sgn(vl) * cap;
        h.v.setVisible(show.v && Math.abs(vl) > 1e-4);
        if (Math.abs(vl) > 1e-4) {
          var a0 = P(x, d.h + (0.12 + 0.09 * i) * yspan), a1 = add(a0, tv, vl);
          if (th === 0) a1[0] = clamp(a1[0], o.xRange[0] + 0.02 * xspan, o.xRange[1] - 0.02 * xspan);
          h.v.set(a0, a1);
        }
        // forces, free-body style
        var on = show.forces;
        function arrow(key, dirv, mag, at, tail) {
          var hh = h.F[key], L = Math.min(0.45 * yspan, Math.abs(mag) * fScale);
          var vis = on && o.forces.indexOf(key) >= 0 && L > 1e-5;
          hh.setVisible(vis);
          if (!vis) return;
          if (tail) { var Lf = Math.max(L, 0.06 * span); hh.set(at, add(at, dirv, Lf)); return; }
          hh.set(add(at, dirv, -L), at);
        }
        var bottom = P(x, 0);
        arrow('W', [0, -1], b.m * run.g, C);
        arrow('N', nv, s.F.N[i], bottom);
        var ff = s.F.Ff[i];
        arrow('Ff', [tv[0] * sgn(ff), tv[1] * sgn(ff)], b.mu > 0 || b.muS > 0 ? ff : 0, bottom, true);
        var pf = s.F.P[i], pn = s.F.Pn[i], pm = Math.hypot(pf, pn);
        var pd = pm > EPS ? [(tv[0] * pf + nv[0] * pn) / pm, (tv[1] * pf + nv[1] * pn) / pm] : tv;
        arrow('P', pd, pm, pf >= 0 ? P(x - hw, d.h / 2) : P(x + hw, d.h / 2));
        var sf = s.F.Fs[i];
        arrow('Fs', [tv[0] * sgn(sf), tv[1] * sgn(sf)], sf, sf >= 0 ? P(x - hw, d.h / 2) : P(x + hw, d.h / 2));
        h.imp.setVisible(false);
      });
      // impact forces: equal and opposite pushes, shown for a moment after each impact
      if (show.impulse) {
        run.events.forEach(function (ev) {
          if (!(t >= ev.t && t < ev.t + o.flash)) return;
          var L = Math.max(0.16 * yspan, 0.07 * xspan);
          if (ev.kind === 'impact') {
            // equal and opposite pushes, each ending on the face it pushes, one above the other
            var A = run.bodies[ev.a], Bb = run.bodies[ev.b], hm = Math.min(draws[ev.a].h, draws[ev.b].h);
            var fa = P(s.x[ev.a] + A.w / 2, 0.72 * hm), fb = P(s.x[ev.b] - Bb.w / 2, 0.3 * hm), sg = sgn(ev.J) || 1;
            bodyH[ev.a].imp.setVisible(true); bodyH[ev.a].imp.set(add(fa, tv, sg * L), fa);
            bodyH[ev.b].imp.setVisible(true); bodyH[ev.b].imp.set(add(fb, tv, -sg * L), fb);
          } else if (ev.kind === 'wall') {
            var W = run.bodies[ev.a], hw2 = draws[ev.a].h / 2, fw = P(s.x[ev.a] - ev.side * W.w / 2, hw2);
            bodyH[ev.a].imp.setVisible(true); bodyH[ev.a].imp.set(add(fw, tv, ev.side * L), fw);
          }
        });
      }
      // springs
      sprH.forEach(function (S) {
        var sp = S.s, side = sp.side === -1 ? -1 : 1, free = sp.x, yS = hMax / 2;
        run.bodies.forEach(function (b, i) {
          var edge = side === 1 ? s.x[i] + b.w / 2 : s.x[i] - b.w / 2;
          if (side === 1 ? edge > free : edge < free) { free = edge; yS = draws[i].h / 2; }
        });
        S.h.set(ENERGY.springPoints(P(S.xw, yS), P(free, yS), { coils: 9, amp: Math.min(0.06, 0.25 * hMax) }));
      });
      linkH.forEach(function (L) {
        var l = L.l, A = run.bodies[l.a], Bb = run.bodies[l.b], xa = s.x[l.a] + A.w / 2, xb = s.x[l.b] - Bb.w / 2;
        var end = Math.min(xb, xa + l.len), yL = Math.min(draws[l.a].h, draws[l.b].h) / 2;
        L.h.set(ENERGY.springPoints(P(xa, yL), P(end, yL), { coils: 7, amp: Math.min(0.06, 0.25 * hMax) }));
      });
      if (bars) {
        var vals = {};
        run.bodies.forEach(function (b, i) { vals['b' + i] = s.p[i]; });
        vals.total = s.ptot;
        bars.set(vals);
      }
      if (ledger) {
        var bi = ledger.body, s00 = run.at(0), lv = { start: s00.p[bi], end: s.p[bi] };
        ledger.items.forEach(function (k) { lv[k] = s.I[k][bi]; });
        ledger.set(lv);
      }
      Object.keys(ro).forEach(function (k) {
        var v = ro[k].def[2](s);
        ro[k].h.set(isFinite(v) ? CYL.fmt(Math.abs(v) < 5e-7 ? 0 : v, 4) + ' ' + ro[k].def[3] : '—');
      });
      if (cursor) cursor.set(t);
      if (o.onUpdate) { try { o.onUpdate(s, fig); } catch (e) { report('figure: onUpdate failed: ' + e.message); } }
    }
    /* ----- the chart under the stage: momentum (or velocity) against time, with a cursor */
    var chart = null, cursor = null, chartEl = null, chartLines = [];
    var co = o.chart ? Object.assign({ kind: 'p', total: true, height: 190 }, o.chart === true ? {} : o.chart) : null;
    function chartItems() {
      var idxs = co.bodies || run.bodies.map(function (b, i) { return i; }), out = [];
      if (co.kind === 'F') {
        var j = idxs[0];
        return [{ f: function (s) { return s.F.P[j]; }, color: 'warn', label: 'Applied force \\(P\\)' },
          { f: function (s) { return s.F.Ff[j]; }, color: 'r', width: 3, label: 'Friction \\(F_f\\)' }];
      }
      idxs.forEach(function (i) {
        var L = run.bodies[i].label;
        out.push({ f: function (s) { return co.kind === 'v' ? s.v[i] : s.p[i]; }, color: idxs.length === 1 ? 'good' : draws[i].color,
          label: co.kind === 'v' ? '\\(v_' + L + '\\)' : '\\(m_' + L + 'v_' + L + '\\)' });
      });
      if (co.kind === 'p' && co.total && idxs.length > 1) out.push({ f: function (s) { return s.ptot; }, color: 'good', width: 3, label: 'Total \\(\\sum mv\\)' });
      return out;
    }
    function drawChart() {
      if (!chart) return;
      var its = chartItems(), N = 260, lo = 0, hi = 0, D = run.duration || 1;
      var pts = its.map(function () { return []; });
      for (var q = 0; q <= N; q++) {
        var tq = D * q / N, s = run.at(tq);
        its.forEach(function (it, k) { var v = it.f(s); pts[k].push([tq, v]); lo = Math.min(lo, v); hi = Math.max(hi, v); });
      }
      // impacts are jumps: add the exact values on both sides
      run.events.forEach(function (ev) {
        if (ev.kind !== 'impact' && ev.kind !== 'wall') return;
        var a = run.at(Math.max(0, ev.t - 1e-6)), b = run.at(ev.t + 1e-6);
        its.forEach(function (it, k) { pts[k].push([ev.t - 1e-6, it.f(a)], [ev.t + 1e-6, it.f(b)]); });
      });
      pts.forEach(function (P) { P.sort(function (u, w) { return u[0] - w[0]; }); });
      var pad = (hi - lo) * 0.08 || 1;
      chart.setAxes({ x: { min: 0, max: D }, y: { min: lo < 0 ? lo - pad : 0, max: hi + pad } });
      chartLines.forEach(function (h) { h.remove(); });
      chartLines = its.map(function (it, k) { return chart.polyline(pts[k], { color: it.color, width: it.width || 2.4 }); });
      chart.setLegend(its.map(function (it) { return { label: it.label, color: it.color, line: true }; }));
    }
    var pl = MOMENTUM.player({
      stage: o.stage, duration: function () { return run.duration; }, onTime: function (v) { t = v; sync(); },
      loop: o.loop, speed: o.speed, playback: o.playback, transport: o.transport, autoplay: false, playbackRates: o.playbackRates
    });
    fig.run = function () { return run; };
    fig.state = function () { return state; };
    fig.t = function () { return t; };
    fig.setT = function (v) { pl.setT(v); return fig; };
    fig.play = function () { pl.play(); return fig; };
    fig.pause = function () { pl.pause(); return fig; };
    fig.reset = function () { pl.reset(); return fig; };
    fig.isPlaying = function () { return pl.isPlaying(); };
    fig.duration = function () { return run.duration; };
    fig.update = function () { sync(); return fig; };
    fig.setSpec = function (sp, keepT) {
      spec = sp; run = MOMENTUM.line(sp);
      buildMounts(); autoScales(); rescaleBars(); drawChart();
      pl.refresh(keepT);
      return fig;
    };
    fig.setShow = function (k, v) { show[k] = !!v; if (ctl[k] && ctl[k].set) ctl[k].set(!!v, true); sync(); return fig; };
    if (panel) CYL.renderMath(panel);

    var chartH = 0, lastTop = o.yRange[1];
    function fit() {
      var main = o.stage.parentNode, side = panel && (panel.closest('.viz-controls') || panel);
      var base = baseHeight();
      if (!main || !base) return;
      var target = base, wantChart = co ? co.height : 0;
      if (o.fill !== false && side && side.getBoundingClientRect().left > main.getBoundingClientRect().left + 20) {
        var trEl = main.querySelector(':scope > .mf-transport');
        var below = o.readoutsEl && o.readoutsEl.offsetParent !== null ? o.readoutsEl.offsetHeight : 0;
        var overhead = chartEl ? chartEl.offsetHeight - chartH : 0;   // the chart's legend and labels
        var avail = Math.round(side.offsetHeight - (trEl ? trEl.offsetHeight : 0) - below - overhead - 2);
        // spare height goes to the chart first (up to its maxHeight), then to the scene
        if (co) wantChart = clamp(avail - base, co.height, co.maxHeight || 320);
        target = Math.max(base, avail - wantChart);
      }
      if (co && chart && Math.abs(wantChart - chartH) > 3) { chartH = wantChart; chart.opts.height = wantChart; chart.redraw(); }
      // any extra height for the scene goes above it, so the ground stays near the bottom
      var wpx = o.stage.clientWidth || 600, need = target * xspan / wpx, yTop = need > yspan ? o.yRange[0] + need : o.yRange[1];
      if (Math.abs(target - curH) > 4 || Math.abs(yTop - lastTop) > 1e-3 * yspan) {
        curH = target; lastTop = yTop;
        p.setOptions({ height: target, yRange: [o.yRange[0], yTop] });
        sync();
      }
    }

    if (co) {
      chartEl = CYL.el('div', { class: 'mf-chart' });
      var mainEl = o.stage.parentNode;
      Array.prototype.forEach.call(mainEl.querySelectorAll(':scope > .mf-chart'), function (nd) { nd.remove(); });   // a figure rebuilt on the same stage
      mainEl.insertBefore(chartEl, o.stage.nextSibling);
      chart = ENERGY.chart(chartEl, {
        x: { label: 'Time \\(t\\) (s)', min: 0, max: 1 }, y: { label: co.kind === 'v' ? 'Velocity (m/s)' : co.kind === 'F' ? 'Force (N)' : 'Momentum (kg\u00b7m/s)', min: 0, max: 1 },
        height: co.height, ariaLabel: co.aria || (co.kind === 'v' ? 'Velocity' : 'Momentum') + ' of each body against time, with a line at the current time.'
      });
      chartH = co.height;
      cursor = chart.vline(t, { color: 'ink' });
      drawChart();
      sync();
    }
    fig.chart = function () { return chart; };
    fig.fit = fit;
    var resizeObs = null;
    fig.destroy = function () {
      pl.destroy();
      if (resizeObs) resizeObs.disconnect();
      if (chartEl && chartEl.parentNode) chartEl.parentNode.removeChild(chartEl);
      var k = MOMENTUM.figures.indexOf(fig);
      if (k >= 0) MOMENTUM.figures.splice(k, 1);
    };
    if (window.ResizeObserver) {
      resizeObs = new ResizeObserver(CYL.debounce(fit, 60));
      if (panel) resizeObs.observe(panel.closest('.viz-controls') || panel);
      if (o.stage.parentNode) resizeObs.observe(o.stage.parentNode);
    }
    window.setTimeout(fit, 0);
    if (o.t0) pl.setT(o.t0);
    if (o.autoplay && !CYL.prefersReducedMotion()) pl.play();
    return fig;
  };

  window.MOMENTUM = MOMENTUM;
})(window, document);
