/*
 * Aerodynamic car model for Module 4. Pure functions: usable in the browser
 * (window.RVD.aero) and in Node (module.exports).
 *
 * Car parameters (SI units):
 *   m     mass (kg)                    L    wheelbase (m)
 *   wf    static front weight fraction (= b/L)
 *   h     CG height (m)                mu   tire friction coefficient
 *   ClA   downforce coefficient × frontal area (m², positive = downforce)
 *   CdA   drag coefficient × frontal area (m²)
 *   lam   aero balance: front share of downforce (0–1)
 *   P     power at the driven (rear) wheels (W)
 *   mechBal  optional low-speed balance: front grip relative to rear (e.g. -0.04 = front 4% weaker)
 *   s     optional tire load sensitivity (Lesson 2.1): mu falls to mu (1 - s k) when downforce
 *         adds a fraction k = F_L / W to the tire loads. Default 0 (constant mu).
 *   rho   optional air density (kg/m³, default 1.225)
 *
 * Simplifications (stated in the lessons): constant mu unless s is given, drag acting at
 * CG height, rear-wheel drive, no rolling resistance, ideal brake bias, point-mass lap model.
 */
(function (global) {
  const RVD = (global.RVD = global.RVD || {});
  const G = 9.81;
  const RHO = 1.225;

  const rho = (c) => (c && c.rho) || RHO;
  const q = (V, r) => 0.5 * (r || RHO) * V * V;
  const W = (c) => c.m * G;
  const drag = (c, V) => q(V, rho(c)) * c.CdA;
  const downforce = (c, V) => q(V, rho(c)) * c.ClA;

  /* Effective friction coefficient once downforce has loaded the tires (linear load sensitivity). */
  const muEff = (c, V) => c.mu * Math.max(0.2, 1 - (c.s || 0) * (downforce(c, V) / W(c)));

  /* Lateral grip limit with downforce, in g: mu (W + F_L) / W. */
  const latLimit = (c, V) => muEff(c, V) * (1 + downforce(c, V) / W(c));

  /* Radius at which downforce grows as fast as the force needed to corner: R* = 2m / (rho mu ClA). */
  const aeroRadius = (c) => (c.ClA > 0 ? (2 * c.m) / (rho(c) * c.mu * c.ClA) : Infinity);

  /* Grip-limited corner speed: m V²/R = mu (m g + q ClA)  →  V = sqrt(mu g R / (1 - R/R*)).
     With load sensitivity there is no closed form, so solve V²/R = g latLimit(V) numerically. */
  function cornerSpeed(c, R) {
    if (!c.s) {
      const Rs = aeroRadius(c);
      if (R >= Rs) return Infinity;
      return Math.sqrt((c.mu * G * R) / (1 - R / Rs));
    }
    const f = (V) => G * latLimit(c, V) - (V * V) / R;
    let lo = 0, hi = 400;
    if (f(hi) > 0) return Infinity;
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (f(mid) > 0) lo = mid; else hi = mid; }
    return lo;
  }

  /* Speed at which downforce equals weight. */
  const weightSpeed = (c) => (c.ClA > 0 ? Math.sqrt((2 * W(c)) / (rho(c) * c.ClA)) : Infinity);

  /* Each axle's lateral limit in g (steady cornering, no load transfer or load sensitivity).
     The front axle must supply the fraction wf of the cornering force and carries wf of the
     weight plus lam of the downforce. */
  function axleLimits(c, V) {
    const k = downforce(c, V) / W(c);
    const mb = c.mechBal || 0;
    const mu = muEff(c, V), muF = mu * (1 + mb / 2), muR = mu * (1 - mb / 2);
    return {
      front: muF * (1 + (k * c.lam) / c.wf),
      rear: muR * (1 + (k * (1 - c.lam)) / (1 - c.wf))
    };
  }

  /* Rear-wheel-drive traction limit, with drag taken to act at CG height so that the rear load is
     W a/L + (1 - lam) F_L + F_x h / L. Solving F_x = mu N_r gives: */
  function tractionForce(c, V) {
    const Nr0 = W(c) * (1 - c.wf) + (1 - c.lam) * downforce(c, V);
    const mu = muEff(c, V);
    return (mu * Nr0) / (1 - (mu * c.h) / c.L);
  }
  const powerForce = (c, V) => (V > 0 ? c.P / V : Infinity);
  const driveForce = (c, V) => Math.min(tractionForce(c, V), powerForce(c, V));

  /* Net forward acceleration and braking deceleration, in g. */
  const accel = (c, V) => (driveForce(c, V) - drag(c, V)) / W(c);
  const brakeDecel = (c, V) => latLimit(c, V) + drag(c, V) / W(c);

  /* Power-limited top speed (no rolling resistance): P = q CdA V. */
  const topSpeed = (c) => (c.CdA > 0 ? Math.cbrt((2 * c.P) / (rho(c) * c.CdA)) : Infinity);

  /* Speed where the power limit P/V falls below the traction limit. */
  function crossoverSpeed(c) {
    let lo = 0.1, hi = 200;
    if (powerForce(c, hi) > tractionForce(c, hi)) return hi;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (powerForce(c, mid) > tractionForce(c, mid)) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /* One straight-plus-corner segment of a point-mass lap. The corner (radius R, turning angle
     theta in rad) is taken at constant speed; the straight of length S is driven flat out from
     the previous corner speed and braked (in a straight line) down to this corner's speed.
     Returns time and a speed trace [[s, V], ...] over the straight then the corner. */
  function segment(c, seg, vIn) {
    const vTop = topSpeed(c) * 0.999;
    const vc = Math.min(cornerSpeed(c, seg.R), vTop);
    const v0 = Math.min(vIn == null ? vc : vIn, vTop);
    const n = Math.max(40, Math.ceil(seg.S / 2));
    const ds = seg.S / n;
    const fwd = [v0];
    for (let i = 0; i < n; i++) {               // accelerate (RK2 in distance: dV/ds = a/V)
      const v = fwd[i];
      const a1 = (accel(c, v) * G) / v;
      const vm = Math.max(0.5, v + 0.5 * ds * a1);
      fwd.push(Math.max(0.5, v + ds * (accel(c, vm) * G) / vm));
    }
    const bwd = new Array(n + 1);
    bwd[n] = vc;
    for (let i = n; i > 0; i--) {               // brake, integrating backwards from the corner
      const v = bwd[i];
      const d1 = (brakeDecel(c, v) * G) / v;
      const vm = v + 0.5 * ds * d1;
      bwd[i - 1] = v + ds * (brakeDecel(c, vm) * G) / vm;
    }
    const trace = [];
    let t = 0;
    for (let i = 0; i <= n; i++) {
      const v = Math.min(fwd[i], bwd[i]);
      trace.push([i * ds, v]);
      if (i > 0) t += ds / ((v + trace[i - 1][1]) / 2);
    }
    const arc = seg.R * seg.theta;
    t += arc / vc;
    trace.push([seg.S + arc, vc]);
    return { time: t, trace, vCorner: vc, vMax: Math.max(...trace.map((p) => p[1])) };
  }

  /* A lap made of segments; each straight starts at the previous corner's speed. */
  function lap(c, segs) {
    let t = 0, vIn = null;
    const parts = [];
    // Two passes so the first straight starts from the last corner's speed.
    for (let pass = 0; pass < 2; pass++) {
      t = 0; parts.length = 0;
      segs.forEach((s) => { const r = segment(c, s, vIn); parts.push(r); t += r.time; vIn = r.vCorner; });
    }
    return { time: t, parts };
  }

  /* Example cars used across Module 4 (masses and geometry match the Module 3 presets).
     wingE is the lift-to-drag ratio of extra wing; sLoad the Lesson 2.1 load sensitivity, used
     only where a widget switches it on (the lesson formulas assume constant mu). */
  const presets = {
    fsae: { label: "Formula SAE", m: 280, L: 1.55, wf: 0.47, h: 0.28, mu: 1.6, ClA: 2.8, CdA: 1.2, lam: 0.45, P: 60e3, wingE: 3.0, sLoad: 0.15 },
    club: { label: "Club racer", m: 750, L: 2.45, wf: 0.52, h: 0.40, mu: 1.4, ClA: 0.5, CdA: 0.75, lam: 0.40, P: 130e3, wingE: 3.5, sLoad: 0.12 },
    gt: { label: "GT car", m: 1300, L: 2.70, wf: 0.48, h: 0.45, mu: 1.5, ClA: 2.3, CdA: 1.0, lam: 0.42, P: 370e3, wingE: 3.5, sLoad: 0.12 }
  };

  RVD.aero = {
    G, RHO, q, drag, downforce, muEff, latLimit, aeroRadius, cornerSpeed, weightSpeed, axleLimits,
    tractionForce, powerForce, driveForce, accel, brakeDecel, topSpeed, crossoverSpeed, segment, lap, presets
  };

  if (typeof module !== "undefined") module.exports = RVD.aero;
})(typeof window !== "undefined" ? window : globalThis);
