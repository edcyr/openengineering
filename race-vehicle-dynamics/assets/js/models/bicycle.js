/*
 * Planar "bicycle" vehicle model (one lumped tire per axle), constant speed.
 * Introduced informally in Lesson 1.2 and derived properly in Module 5/6.
 *
 * Coordinates: X forward, Y left, yaw psi and yaw rate r counter-clockwise
 * positive (left turn), sideslip beta = angle of velocity left of heading,
 * steer delta positive to the left.
 *
 *   alpha_f = beta + a r / U - delta        alpha_r = beta - b r / U
 *   Fy      = -D tanh(C alpha / D)          (linear for small alpha, saturates at mu * axle load)
 *   m U (beta' + r) = Fyf + Fyr
 *   Iz r'           = a Fyf - b Fyr + Mz    (Mz: external yaw disturbance)
 *
 * Pure functions only — usable in the browser (window.RVD.bicycle) and in Node.
 */
(function (global) {
  const RVD = (global.RVD = global.RVD || {});
  const G = 9.81;

  /*
   * balance: -1 (strong oversteer) ... 0 (neutral) ... +1 (strong understeer).
   * Implemented by shifting cornering stiffness between the axles, which is
   * what tire choice, pressures and load transfer do on a real car.
   */
  function car(balance, U, o) {
    o = o || {};
    const m = o.m || 750, L = o.L || 2.45, wf = o.wf || 0.5;
    const a = L * (1 - wf), b = L * wf;          // CG to front / rear axle
    const C0 = o.C0 || 60000;                     // N/rad per axle at neutral balance
    const k = 0.4 * balance;
    const mu = o.mu || 1.4;
    return {
      m, L, a, b, U,
      Iz: o.Iz || m * a * b * 1.0,
      Cf: C0 * (1 - k), Cr: C0 * (1 + k),
      Df: mu * m * G * b / L, Dr: mu * m * G * a / L
    };
  }

  function tire(alpha, C, D) {
    return -D * Math.tanh((C * alpha) / D);
  }

  function derivs(s, delta, p, Mz) {
    const U = p.U;
    const af = s.beta + (p.a * s.r) / U - delta;
    const ar = s.beta - (p.b * s.r) / U;
    const Fyf = tire(af, p.Cf, p.Df);
    const Fyr = tire(ar, p.Cr, p.Dr);
    const course = s.psi + s.beta;
    return {
      X: U * Math.cos(course),
      Y: U * Math.sin(course),
      psi: s.r,
      beta: (Fyf + Fyr) / (p.m * U) - s.r,
      r: (p.a * Fyf - p.b * Fyr + (Mz || 0)) / p.Iz,
      ay: (Fyf + Fyr) / p.m
    };
  }

  /* One RK4 step. */
  function step(s, delta, p, dt, Mz) {
    const add = (x, d, h) => ({ X: x.X + h * d.X, Y: x.Y + h * d.Y, psi: x.psi + h * d.psi, beta: x.beta + h * d.beta, r: x.r + h * d.r });
    const k1 = derivs(s, delta, p, Mz);
    const k2 = derivs(add(s, k1, dt / 2), delta, p, Mz);
    const k3 = derivs(add(s, k2, dt / 2), delta, p, Mz);
    const k4 = derivs(add(s, k3, dt), delta, p, Mz);
    const n = { t: (s.t || 0) + dt };
    ["X", "Y", "psi", "beta", "r"].forEach((key) => {
      n[key] = s[key] + (dt / 6) * (k1[key] + 2 * k2[key] + 2 * k3[key] + k4[key]);
    });
    n.ay = k1.ay;
    return n;
  }

  /*
   * Linear stability at speed U. For the 2x2 linear system the trace is always
   * negative, so the car is stable exactly when the determinant is positive:
   *   det = Cf Cr L^2 / (m Iz U^2) * (1 + K U^2 / L)
   * K = (m / L)(b / Cf - a / Cr) is the understeer gradient in rad/(m/s^2).
   */
  function stability(p) {
    const K = (p.m / p.L) * (p.b / p.Cf - p.a / p.Cr);
    const U = p.U;
    const det = ((p.Cf * p.Cr * p.L * p.L) / (p.m * p.Iz * U * U)) * (1 + (K * U * U) / p.L);
    const tr = -(p.Cf + p.Cr) / (p.m * U) - (p.Cf * p.a * p.a + p.Cr * p.b * p.b) / (p.Iz * U);
    const disc = tr * tr - 4 * det;
    const res = {
      K,
      Kdeg: K * G * 180 / Math.PI,     // deg of steer per g
      stable: det > 0,
      Ucrit: K < 0 ? Math.sqrt(-p.L / K) : Infinity,
      Uchar: K > 0 ? Math.sqrt(p.L / K) : Infinity,
      oscillatory: disc < 0
    };
    if (det > 0 && disc < 0) {
      res.wn = Math.sqrt(det);
      res.zeta = -tr / (2 * res.wn);
    }
    if (det <= 0) res.growth = (tr + Math.sqrt(disc)) / 2; // positive eigenvalue (1/s)
    return res;
  }

  RVD.bicycle = { car, derivs, step, stability, tire };
  if (typeof module !== "undefined") module.exports = RVD.bicycle;
})(typeof window !== "undefined" ? window : globalThis);
