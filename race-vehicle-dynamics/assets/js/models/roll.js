/*
 * Lateral load transfer split into its three components (Lesson 3.2), and
 * longitudinal load transfer / brake balance (Lesson 3.3).
 * Pure functions — usable in the browser (window.RVD.roll, RVD.brakes) and Node.
 *
 * Car parameters (SI units; Kphi in N·m/deg):
 *   L wheelbase, wf sprung-mass fraction on the front axle, tf / tr track widths,
 *   ms sprung mass, musf / musr unsprung mass per axle, hs sprung CG height,
 *   hus unsprung CG height, hrcf / hrcr roll-center heights,
 *   Kphi total roll stiffness, rsf front share of roll stiffness,
 *   mu0, s tire friction and load sensitivity (see models/tire.js)
 *
 * Per axle, per-wheel load change in steady cornering at ay (m/s^2):
 *   unsprung   dFz = mus * ay * hus / t
 *   geometric  dFz = ms_axle * ay * hrc / t              (through the links, no roll needed)
 *   elastic    dFz = share * ms * ay * (hs - hra) / t    (through springs and bars)
 * where hra is the roll-axis height under the sprung CG and share is that axle's
 * share of roll stiffness. Body roll: phi = ms * ay * (hs - hra) / Kphi.
 */
(function (global) {
  const RVD = (global.RVD = global.RVD || {});
  const G = 9.81;

  function staticLoads(c) {
    const Wf = (c.ms * c.wf + c.musf) * G, Wr = (c.ms * (1 - c.wf) + c.musr) * G;
    return { Wf, Wr, W: Wf + Wr };
  }

  function components(c, ayG) {
    const ay = ayG * G;
    const msf = c.ms * c.wf, msr = c.ms * (1 - c.wf);
    const aS = c.L * (1 - c.wf);                                  // sprung CG behind front axle
    const hra = c.hrcf + (c.hrcr - c.hrcf) * (aS / c.L);         // roll-axis height under the CG
    const Mroll = c.ms * ay * (c.hs - hra);                       // roll moment about the roll axis
    const f = {
      unsprung: (c.musf * ay * c.hus) / c.tf,
      geometric: (msf * ay * c.hrcf) / c.tf,
      elastic: (c.rsf * Mroll) / c.tf
    };
    const r = {
      unsprung: (c.musr * ay * c.hus) / c.tr,
      geometric: (msr * ay * c.hrcr) / c.tr,
      elastic: ((1 - c.rsf) * Mroll) / c.tr
    };
    f.total = f.unsprung + f.geometric + f.elastic;
    r.total = r.unsprung + r.geometric + r.elastic;
    return { front: f, rear: r, hra, Mroll, rollDeg: Mroll / c.Kphi, aS };
  }

  /* Axle grip utilisation with load-sensitive tires (same idea as Lesson 3.1). */
  function utilisation(c, ayG) {
    const T = RVD.tire;
    const st = staticLoads(c), lt = components(c, ayG);
    const Fz0 = st.W / 4;
    const pk = (Fz) => T.peak(Math.max(0, Fz), c.mu0, c.s, Fz0);
    const needF = (c.ms * c.wf + c.musf) * ayG * G, needR = (c.ms * (1 - c.wf) + c.musr) * ayG * G;
    const availF = pk(st.Wf / 2 + lt.front.total) + pk(st.Wf / 2 - lt.front.total);
    const availR = pk(st.Wr / 2 + lt.rear.total) + pk(st.Wr / 2 - lt.rear.total);
    return { front: needF / availF, rear: needR / availR };
  }

  function limit(c) {
    const worst = (a) => { const u = utilisation(c, a); return Math.max(u.front, u.rear); };
    let lo = 0.01, hi = 4;
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (worst(mid) < 1) lo = mid; else hi = mid; }
    const u = utilisation(c, lo);
    return { ay: lo, axle: Math.abs(u.front - u.rear) < 0.004 ? "both" : u.front > u.rear ? "front" : "rear" };
  }

  RVD.roll = { staticLoads, components, utilisation, limit };

  /* ---------------- Brake balance (Lesson 3.3) ----------------
   * Everything in units of the car's weight W (forces) and g (deceleration).
   *   wf = static front weight fraction, hL = h / L, mu = tire friction (same both axles)
   *   front axle load  Nf = wf + a hL,  rear  Nr = (1 - wf) - a hL
   *   bias beta = front share of brake force:  Bf = beta a,  Br = (1 - beta) a
   */
  const brakes = {
    axleLoads: (wf, hL, a) => ({ front: wf + a * hL, rear: 1 - wf - a * hL }),
    idealBias: (wf, hL, a) => wf + a * hL,
    lockDecel(wf, hL, mu, beta) {
      const front = beta - mu * hL > 1e-9 ? (mu * wf) / (beta - mu * hL) : Infinity;
      const rear = (mu * (1 - wf)) / (1 - beta + mu * hL);
      return { front, rear, max: Math.min(front, rear), first: front < rear - 1e-9 ? "front" : rear < front - 1e-9 ? "rear" : "both" };
    }
  };
  RVD.brakes = brakes;

  if (typeof module !== "undefined") module.exports = { roll: RVD.roll, brakes };
})(typeof window !== "undefined" ? window : globalThis);
