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
 *
 * The transient model above reads "positive = left"; the steady-state functions further down
 * (Module 5) read the same equations in SAE signs, "positive = right". The algebra is identical.
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

  /* ---------------- Steady-state cornering (Module 5) ----------------
   * The same equations read in SAE signs: positive = right turn (delta, r, a_y, beta to the right).
   * Axle cornering stiffnesses Cf, Cr are for both tires on the axle, in N/rad.
   * Steady state: Fyf = m a_y b/L, Fyr = m a_y a/L (force and yaw-moment balance),
   * alpha = -Fy/C (linear tire), and alpha_f - alpha_r = L r/V - delta (kinematics, Lesson 0.2).
   */
  const RAD = Math.PI / 180;

  /* Build a steady-state car from per-axle cornering stiffness in N/deg. mu, muF, muR optional. */
  function axleCar(o) {
    const L = o.L, wf = o.wf;
    const a = L * (1 - wf), b = L * wf;
    const muF = o.muF || o.mu || 1.4, muR = o.muR || o.mu || 1.4;
    const DI = o.DI || 0.9;          // dynamic index k^2/(ab), sets the yaw inertia (Module 6)
    return {
      m: o.m, L, a, b, wf, DI,
      Iz: DI * o.m * a * b,
      Cf: o.CfDeg / RAD, Cr: o.CrDeg / RAD,
      muF, muR,
      Df: muF * o.m * G * wf, Dr: muR * o.m * G * (1 - wf)
    };
  }

  /* Understeer gradient K = m_f/C_f - m_r/C_r, in rad per m/s^2 (multiply by g/RAD for deg/g). */
  const understeerGradient = (p) => (p.m / p.L) * (p.b / p.Cf - p.a / p.Cr);

  function steadyLinear(p, V, R) {
    const ay = (V * V) / R, r = V / R;
    const Fyf = (p.m * ay * p.b) / p.L, Fyr = (p.m * ay * p.a) / p.L;
    const af = -Fyf / p.Cf, ar = -Fyr / p.Cr;
    const delta = p.L / R - af + ar;
    const beta = ar + (p.b * r) / V;
    return { ay, r, Fyf, Fyr, af, ar, delta, beta, K: understeerGradient(p) };
  }

  /* Slip angle each axle needs at lateral acceleration ay (m/s^2) with saturating tires
     Fy = D tanh(C |alpha| / D); null once that axle's grip (mu x axle load) is used up. */
  function axleSlip(C, D, Fy) {
    const u = Fy / D;
    return Math.abs(u) >= 1 ? null : -(D / C) * Math.atanh(u);
  }
  function steadyNonlinear(p, V, R) {
    const lin = steadyLinear(p, V, R);
    const af = axleSlip(p.Cf, p.Df, lin.Fyf), ar = axleSlip(p.Cr, p.Dr, lin.Fyr);
    if (af == null || ar == null) return Object.assign(lin, { af, ar, delta: null, beta: null, limit: af == null ? "front" : "rear" });
    return Object.assign(lin, { af, ar, delta: p.L / R - af + ar, beta: ar + (p.b * lin.r) / V });
  }

  /* Neutral steer point (from the front axle) and static margin (positive: NSP behind the CG). */
  const neutralSteerPoint = (p) => (p.L * p.Cr) / (p.Cf + p.Cr);
  const staticMargin = (p) => (neutralSteerPoint(p) - p.a) / p.L;

  /* Steady-state yaw-rate gain r/delta (1/s) and lateral-acceleration gain (m/s^2 per rad). */
  function yawRateGain(p, V) {
    const K = understeerGradient(p);
    const den = 1 + (K * V * V) / p.L;
    return den > 0 ? V / p.L / den : Infinity;
  }
  const characteristicSpeed = (p) => { const K = understeerGradient(p); return K > 0 ? Math.sqrt(p.L / K) : Infinity; };
  const criticalSpeed = (p) => { const K = understeerGradient(p); return K < 0 ? Math.sqrt(-p.L / K) : Infinity; };

  /* ---------------- Linear transient model (Module 6) ----------------
   * State x = [beta, r] (rad, rad/s), SAE signs, constant speed V, linear tires:
   *   m V (beta' + r) = Fyf + Fyr,   Iz r' = a Fyf - b Fyr
   * gives x' = A x + B delta with the matrices below.
   */
  function linearSystem(p, V) {
    const { m, Iz, a, b, Cf, Cr } = p;
    const Nb = b * Cr - a * Cf;                 // yaw moment per unit sideslip
    return {
      V,
      A: [[-(Cf + Cr) / (m * V), Nb / (m * V * V) - 1],
          [Nb / Iz, -(a * a * Cf + b * b * Cr) / (Iz * V)]],
      B: [Cf / (m * V), (a * Cf) / Iz]
    };
  }

  /* Eigenvalues of the 2x2 system, with natural frequency and damping ratio when they are complex. */
  function modes(sys) {
    const [[p, q], [r, s]] = sys.A;
    const tr = p + s, det = p * s - q * r, disc = tr * tr - 4 * det;
    const out = { tr, det, stable: tr < 0 && det > 0 };
    if (disc < 0) {
      out.complex = true;
      out.re = tr / 2; out.im = Math.sqrt(-disc) / 2;
      out.lambdas = [[out.re, out.im], [out.re, -out.im]];
    } else {
      out.complex = false;
      const r1 = (tr + Math.sqrt(disc)) / 2, r2 = (tr - Math.sqrt(disc)) / 2;
      out.lambdas = [[r1, 0], [r2, 0]];
    }
    if (det > 0) { out.wn = Math.sqrt(det); out.zeta = -tr / (2 * out.wn); }
    return out;
  }

  /* Steady state for a constant steer: x = -A^-1 B delta. */
  function steadyState(sys, delta) {
    const [[p, q], [r, s]] = sys.A, det = p * s - q * r;
    const b0 = sys.B[0] * delta, b1 = sys.B[1] * delta;
    return [-(s * b0 - q * b1) / det, -(-r * b0 + p * b1) / det];
  }

  /* Largest stable time step for explicit Euler: |1 + h lambda| < 1 for every eigenvalue. */
  function eulerStepLimit(sys) {
    const md = modes(sys);
    let h = Infinity;
    md.lambdas.forEach(([re, im]) => {
      if (re >= 0) h = 0;                       // an unstable mode grows whatever the step
      else h = Math.min(h, (-2 * re) / (re * re + im * im));
    });
    return h;
  }

  /* Integrate a steer input delta(t) from x0 with Euler or RK4 and a fixed step h.
     Returns arrays of t, beta, r and a_y = V (beta' + r). */
  function simulate(sys, deltaOf, o) {
    const h = o.h, T = o.T, method = o.method || "rk4";
    const f = (x, t) => {
      const d = deltaOf(t);
      return [sys.A[0][0] * x[0] + sys.A[0][1] * x[1] + sys.B[0] * d,
              sys.A[1][0] * x[0] + sys.A[1][1] * x[1] + sys.B[1] * d];
    };
    let x = (o.x0 || [0, 0]).slice();
    const out = { t: [], beta: [], r: [], ay: [] };
    const n = Math.round(T / h);
    for (let i = 0; i <= n; i++) {
      const t = i * h, dx = f(x, t);
      out.t.push(t); out.beta.push(x[0]); out.r.push(x[1]); out.ay.push(sys.V * (dx[0] + x[1]));
      if (method === "euler") {
        x = [x[0] + h * dx[0], x[1] + h * dx[1]];
      } else {
        const k1 = dx;
        const k2 = f([x[0] + (h / 2) * k1[0], x[1] + (h / 2) * k1[1]], t + h / 2);
        const k3 = f([x[0] + (h / 2) * k2[0], x[1] + (h / 2) * k2[1]], t + h / 2);
        const k4 = f([x[0] + h * k3[0], x[1] + h * k3[1]], t + h);
        x = [x[0] + (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]), x[1] + (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])];
      }
      if (!isFinite(x[0]) || Math.abs(x[1]) > 1e3) break;
    }
    return out;
  }

  /* Step-response metrics for a signal y(t) heading to yss: time to 90% of yss, peak time, overshoot. */
  function stepMetrics(t, y, yss) {
    let t90 = null, peak = -Infinity, tPeak = null;
    for (let i = 0; i < t.length; i++) {
      if (t90 == null && y[i] >= 0.9 * yss) t90 = i > 0 ? t[i - 1] + (t[i] - t[i - 1]) * (0.9 * yss - y[i - 1]) / (y[i] - y[i - 1]) : t[i];
      if (y[i] > peak) { peak = y[i]; tPeak = t[i]; }
    }
    const overshoot = peak > yss ? (peak - yss) / yss : 0;
    return { t90, peak, tPeak: overshoot > 0.001 ? tPeak : null, overshoot };
  }

  /* Example cars for Module 5 and 6 (masses and geometry match earlier modules; cornering stiffness
     per axle; DI is a typical dynamic index for each kind of car). */
  const presets = {
    road: { label: "Road car", m: 1400, L: 2.65, wf: 0.60, t: 1.55, CfDeg: 2000, CrDeg: 2600, mu: 0.9, DI: 0.9 },
    club: { label: "Club racer", m: 750, L: 2.45, wf: 0.52, t: 1.50, CfDeg: 2000, CrDeg: 3000, mu: 1.4, DI: 0.85 },
    fsae: { label: "Formula SAE", m: 280, L: 1.55, wf: 0.47, t: 1.22, CfDeg: 1100, CrDeg: 1500, mu: 1.6, DI: 0.8 }
  };

  RVD.bicycle = {
    car, derivs, step, stability, tire,
    axleCar, understeerGradient, steadyLinear, steadyNonlinear, axleSlip,
    neutralSteerPoint, staticMargin, yawRateGain, characteristicSpeed, criticalSpeed, presets, RAD,
    linearSystem, modes, steadyState, eulerStepLimit, simulate, stepMetrics
  };
  if (typeof module !== "undefined") module.exports = RVD.bicycle;
})(typeof window !== "undefined" ? window : globalThis);
