/*
 * spin.js — SPIN: rigid-body rotation simulator for the Angular Momentum module.
 * Classic script (IIFE) that attaches ONE global: SPIN. No dependencies.
 *
 * A body turns about its center of mass G (torque-free or with applied moments) or about a fixed point O (a
 * top on its pivot). Its principal moments about that point are I = [I1, I2, I3], along the body's own x, y, z.
 * The state is the orientation quaternion q (body → world) and the angular velocity w in BODY axes; it is
 * advanced with Euler's equations,
 *     I1 w1' = M1 + (I2 − I3) w2 w3,   I2 w2' = M2 + (I3 − I1) w3 w1,   I3 w3' = M3 + (I1 − I2) w1 w2,
 * and q' = ½ q ⊗ (0, w), integrated with fixed-step RK4 (sub-stepped) and the quaternion renormalized.
 *
 * API
 *   SPIN.create({I:[I1,I2,I3], q:[w,x,y,z], w:[w1,w2,w3] (body), torque: fn(state) → [Mx,My,Mz] WORLD, maxStep})
 *     → sim {state:{q, w, t}, step(dt), R() (3×3, columns = body axes in world), Hbody(), H() (world),
 *            T() kinetic energy, wWorld(), bodyToWorld(v), worldToBody(v), set({q, w})}
 *   SPIN.top({m, g, l, I:[It, It, Iz], theta, phiDot, psiDot, thetaDot}) → sim: a symmetric top pivoted at O,
 *     with G a distance l up its own z-axis and gravity −g along world z. Angles in radians, rates in rad/s.
 *   SPIN.zxz(phi, theta, psi) → quaternion (precession φ about world z, nutation θ about the line of nodes,
 *     spin ψ about the body z); SPIN.zxzRates(theta, psi, phiDot, thetaDot, psiDot) → body angular velocity.
 *   SPIN.steadyPrecession({m, g, l, It, Iz, theta, wz}) → {slow, fast} precession rates φ' (rad/s) for which a
 *     top tilted θ with spin component wz = φ' cos θ + ψ' precesses steadily (null if none).
 *   SPIN.quat: {mul, fromAxisAngle, toMat, normalize, rotate}
 */
(function (window) {
  'use strict';
  if (window.SPIN) return;
  var SPIN = { version: '1.0.0' };

  /* ---------------- quaternions [w, x, y, z] ---------------- */
  function qmul(a, b) {
    return [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
      a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
      a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
      a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
  }
  function qnorm(q) { var n = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]) || 1; return [q[0] / n, q[1] / n, q[2] / n, q[3] / n]; }
  function qaxis(u, a) { var n = Math.sqrt(u[0] * u[0] + u[1] * u[1] + u[2] * u[2]) || 1, s = Math.sin(a / 2); return [Math.cos(a / 2), s * u[0] / n, s * u[1] / n, s * u[2] / n]; }
  function qmat(q) {
    var w = q[0], x = q[1], y = q[2], z = q[3];
    return [[1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
      [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
      [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]];
  }
  function mv(A, v) { return [A[0][0] * v[0] + A[0][1] * v[1] + A[0][2] * v[2], A[1][0] * v[0] + A[1][1] * v[1] + A[1][2] * v[2], A[2][0] * v[0] + A[2][1] * v[1] + A[2][2] * v[2]]; }
  function mtv(A, v) { return [A[0][0] * v[0] + A[1][0] * v[1] + A[2][0] * v[2], A[0][1] * v[0] + A[1][1] * v[1] + A[2][1] * v[2], A[0][2] * v[0] + A[1][2] * v[1] + A[2][2] * v[2]]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  SPIN.quat = { mul: qmul, fromAxisAngle: qaxis, toMat: qmat, normalize: qnorm, rotate: function (q, v) { return mv(qmat(q), v); } };
  SPIN.cross = cross;

  /* ---------------- ZXZ Euler angles (precession, nutation, spin) ---------------- */
  SPIN.zxz = function (phi, theta, psi) {
    return qnorm(qmul(qmul(qaxis([0, 0, 1], phi), qaxis([1, 0, 0], theta)), qaxis([0, 0, 1], psi)));
  };
  SPIN.zxzRates = function (theta, psi, phiDot, thetaDot, psiDot) {
    return [phiDot * Math.sin(theta) * Math.sin(psi) + thetaDot * Math.cos(psi),
      phiDot * Math.sin(theta) * Math.cos(psi) - thetaDot * Math.sin(psi),
      phiDot * Math.cos(theta) + psiDot];
  };

  /* ---------------- the simulator ---------------- */
  SPIN.create = function (o) {
    o = o || {};
    var I = (o.I || [1, 1, 1]).slice(), torque = typeof o.torque === 'function' ? o.torque : null;
    var maxStep = o.maxStep || 0.002;
    var st = { q: qnorm(o.q || [1, 0, 0, 0]), w: (o.w || [0, 0, 0]).slice(), t: 0 };
    function deriv(q, w, t) {
      var Mb = [0, 0, 0];
      if (torque) Mb = mtv(qmat(q), torque({ q: q, w: w, t: t, R: qmat(q) }) || [0, 0, 0]);
      var dw = [(Mb[0] + (I[1] - I[2]) * w[1] * w[2]) / I[0], (Mb[1] + (I[2] - I[0]) * w[2] * w[0]) / I[1], (Mb[2] + (I[0] - I[1]) * w[0] * w[1]) / I[2]];
      var dq = qmul(q, [0, w[0], w[1], w[2]]);
      return { dq: [0.5 * dq[0], 0.5 * dq[1], 0.5 * dq[2], 0.5 * dq[3]], dw: dw };
    }
    function add(q, w, d, h) {
      return { q: [q[0] + h * d.dq[0], q[1] + h * d.dq[1], q[2] + h * d.dq[2], q[3] + h * d.dq[3]], w: [w[0] + h * d.dw[0], w[1] + h * d.dw[1], w[2] + h * d.dw[2]] };
    }
    function rk4(h) {
      var q = st.q, w = st.w, t = st.t;
      var k1 = deriv(q, w, t), s2 = add(q, w, k1, h / 2), k2 = deriv(s2.q, s2.w, t + h / 2);
      var s3 = add(q, w, k2, h / 2), k3 = deriv(s3.q, s3.w, t + h / 2), s4 = add(q, w, k3, h), k4 = deriv(s4.q, s4.w, t + h);
      var nq = [], nw = [], i;
      for (i = 0; i < 4; i++) nq.push(q[i] + h / 6 * (k1.dq[i] + 2 * k2.dq[i] + 2 * k3.dq[i] + k4.dq[i]));
      for (i = 0; i < 3; i++) nw.push(w[i] + h / 6 * (k1.dw[i] + 2 * k2.dw[i] + 2 * k3.dw[i] + k4.dw[i]));
      st.q = qnorm(nq); st.w = nw; st.t = t + h;
    }
    var sim = {
      I: I, state: st,
      step: function (dt) {
        if (!(dt > 0)) return sim;
        var n = Math.max(1, Math.ceil(dt / maxStep)), h = dt / n;
        for (var i = 0; i < n; i++) rk4(h);
        return sim;
      },
      set: function (p) { if (p.q) st.q = qnorm(p.q); if (p.w) st.w = p.w.slice(); if (p.t != null) st.t = p.t; return sim; },
      R: function () { return qmat(st.q); },
      Hbody: function () { return [I[0] * st.w[0], I[1] * st.w[1], I[2] * st.w[2]]; },
      H: function () { return mv(qmat(st.q), sim.Hbody()); },
      wWorld: function () { return mv(qmat(st.q), st.w); },
      T: function () { return 0.5 * (I[0] * st.w[0] * st.w[0] + I[1] * st.w[1] * st.w[1] + I[2] * st.w[2] * st.w[2]); },
      bodyToWorld: function (v) { return mv(qmat(st.q), v); },
      worldToBody: function (v) { return mtv(qmat(st.q), v); }
    };
    return sim;
  };

  /* ---------------- a symmetric top on a fixed pivot ---------------- */
  SPIN.top = function (o) {
    var m = o.m, g = o.g == null ? 9.81 : o.g, l = o.l;
    var sim = SPIN.create({
      I: o.I, q: SPIN.zxz(o.phi || 0, o.theta, o.psi || 0),
      w: SPIN.zxzRates(o.theta, o.psi || 0, o.phiDot || 0, o.thetaDot || 0, o.psiDot || 0),
      maxStep: o.maxStep || 0.001,
      torque: function (s) { var rG = [s.R[0][2] * l, s.R[1][2] * l, s.R[2][2] * l]; return cross(rG, [0, 0, -m * g]); }
    });
    sim.axis = function () { var R = sim.R(); return [R[0][2], R[1][2], R[2][2]]; };   // own z in world axes
    sim.tilt = function () { return Math.acos(Math.max(-1, Math.min(1, sim.axis()[2]))); };
    sim.V = function () { return m * g * l * sim.axis()[2]; };                            // potential energy
    return sim;
  };

  /* ---------------- steady precession of a top ---------------- */
  // Moment about the line of nodes: m g l sinθ = φ' sinθ (Iz wz − It φ' cosθ), so It cosθ φ'² − Iz wz φ' + m g l = 0.
  SPIN.steadyPrecession = function (o) {
    var a = o.It * Math.cos(o.theta), b = -o.Iz * o.wz, c = o.m * (o.g == null ? 9.81 : o.g) * o.l;
    if (Math.abs(a) < 1e-12) return { slow: c / (o.Iz * o.wz), fast: null };
    var disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    var r1 = (-b - Math.sqrt(disc)) / (2 * a), r2 = (-b + Math.sqrt(disc)) / (2 * a);
    return Math.abs(r1) <= Math.abs(r2) ? { slow: r1, fast: r2 } : { slow: r2, fast: r1 };
  };

  window.SPIN = SPIN;
})(window);
