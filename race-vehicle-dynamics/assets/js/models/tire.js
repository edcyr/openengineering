/*
 * Tire model shared by Modules 2, 3 and later. Pure functions — usable in the
 * browser (window.RVD.tire) and in Node (module.exports).
 *
 * Load sensitivity (Lesson 2.1):
 *   mu(Fz) = mu0 * (1 - s * (Fz - Fz0) / Fz0)
 *
 * Pure lateral force (Lesson 2.1), alpha in degrees:
 *   Fy = D sin(C atan(B a - E (B a - atan(B a)))),  D = mu(Fz) Fz,  B C D = C_alpha
 *   C_alpha = CC * Fz * (1 - s (Fz - Fz0)/Fz0)   [N/deg]
 *
 * Pure longitudinal force (Lesson 2.2), kappa = slip ratio (-1 locked ... +):
 *   Fx = Dx sin(Cx atan(Bx k - Ex (Bx k - atan(Bx k)))),  Dx = mux(Fz) Fz,  Bx Cx Dx = C_kappa
 *   C_kappa = CCk * Fz * (same load factor)       [N per unit slip]
 *
 * Combined slip (Lesson 2.3) — normalized-slip model:
 *   nx = kappa / kappa_peak,  ny = alpha / alpha_peak,  n = sqrt(nx^2 + ny^2)
 *   Fx = Fx_pure(n kappa_peak) * nx / n,   Fy = Fy_pure(n alpha_peak) * ny / n
 * Pure cases reduce exactly to the pure curves, and the peak forces trace the
 * friction ellipse (Fx/Fx_max)^2 + (Fy/Fy_max)^2 = 1.
 */
(function (global) {
  const RVD = (global.RVD = global.RVD || {});

  const defaults = {
    Fz: 3000, Fz0: 3000, s: 0.12,
    mu0: 1.6, CC: 0.5, C: 1.3, E: -1,          // lateral
    mux0: 1.65, CCk: 32, Cx: 1.4, Ex: -0.5     // longitudinal
  };

  const loadFactor = (p) => Math.max(0.1, 1 - (p.s * (p.Fz - p.Fz0)) / p.Fz0);
  const mf = (x, C, E) => Math.sin(C * Math.atan(x - E * (x - Math.atan(x))));

  const tire = {
    defaults,
    params(over) { return Object.assign({}, defaults, over || {}); },

    mu(Fz, mu0, s, Fz0) {
      return Math.max(0.1, mu0 * (1 - (s * (Fz - Fz0)) / Fz0));
    },
    peak(Fz, mu0, s, Fz0) {
      return Fz <= 0 ? 0 : tire.mu(Fz, mu0, s, Fz0) * Fz;
    },

    /* ---- lateral ---- */
    corneringStiffness(p) { return p.CC * p.Fz * loadFactor(p); },
    fy(alphaDeg, p) {
      const D = tire.peak(p.Fz, p.mu0, p.s, p.Fz0);
      if (D <= 0) return 0;
      const B = tire.corneringStiffness(p) / (p.C * D);
      return D * mf(B * alphaDeg, p.C, p.E);
    },

    /* ---- longitudinal ---- */
    longStiffness(p) { return p.CCk * p.Fz * loadFactor(p); },
    fx(kappa, p) {
      const D = tire.peak(p.Fz, p.mux0, p.s, p.Fz0);
      if (D <= 0) return 0;
      const B = tire.longStiffness(p) / (p.Cx * D);
      return D * mf(B * kappa, p.Cx, p.Ex);
    },

    /* Slip angle (deg) and slip ratio at peak force, found numerically. */
    peaks(p) {
      let aPk = 0, fyPk = 0, kPk = 0, fxPk = 0;
      for (let a = 0.05; a <= 30; a += 0.05) { const f = tire.fy(a, p); if (f > fyPk) { fyPk = f; aPk = a; } }
      for (let k = 0.002; k <= 1; k += 0.002) { const f = tire.fx(k, p); if (f > fxPk) { fxPk = f; kPk = k; } }
      return { alpha: aPk, fy: fyPk, kappa: kPk, fx: fxPk };
    },

    /* Combined slip: alpha in deg, kappa slip ratio. Pass pk = tire.peaks(p) to avoid recomputing. */
    combined(alphaDeg, kappa, p, pk) {
      pk = pk || tire.peaks(p);
      const nx = kappa / pk.kappa, ny = alphaDeg / pk.alpha;
      const n = Math.hypot(nx, ny);
      if (n < 1e-9) return { fx: 0, fy: 0, n: 0 };
      return {
        fx: tire.fx(n * pk.kappa, p) * (nx / n),
        fy: tire.fy(n * pk.alpha, p) * (ny / n),
        n
      };
    }
  };

  RVD.tire = tire;
  if (typeof module !== "undefined") module.exports = tire;
})(typeof window !== "undefined" ? window : globalThis);
