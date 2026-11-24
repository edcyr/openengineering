/*!
 * wing.js — WING: airfoil and wing-geometry calculations for Module 4 of Conceptual Aircraft Design (Airfoil and
 * Wing Geometry). Plain ES5, no dependencies; every function is pure.
 *
 *   WING.naca4(code | {m, p, t}, n)  NACA 4-digit airfoil: {m, p, t, code, camber(x), slope(x), thick(x),
 *                                    upper, lower, mean (arrays of [x, y], chord = 1, cosine spacing, n points)}
 *   WING.code4(m, p, t)              designation string, e.g. (0.02, 0.4, 0.12) → '2412'
 *   WING.thin(m, p)                  thin-airfoil theory for the 4-digit camber line: {alphaL0 (deg), cm (about the
 *                                    quarter chord), clIdeal, alphaIdeal (deg)}
 *   WING.isa(h)                      standard atmosphere, h in m (0–20 km): {T (K), p (Pa), rho (kg/m^3), a (m/s), mu (Pa s)}
 *   WING.reynolds(h, V, c)           {Re, M, rho, mu, a}: V in m/s, chord c in m
 *   WING.planform(S, A, lam, sweepC4)  straight-tapered trapezoidal wing (sweep in degrees at the quarter chord):
 *                                    {S, A, lam, b, cr, ct, mac, ymac, xmac, sweepLE, sweepTE, sweepHalf, sweep(n), chord(eta)}
 *   WING.sweepAt(Lm, m, n, A, lam)   sweep (deg) of the n-chord line from the sweep Lm (deg) of the m-chord line
 *   WING.cla(A, M, sweepDeg, eta)    wing lift-curve slope per radian (Helmbold, with the compressibility and sweep
 *                                    terms; sweepDeg at the line of maximum thickness; eta = airfoil efficiency, 0.95)
 *   WING.korn(kappa, tc, cl, sweepDeg)  drag-divergence Mach number, Korn's equation extended by simple sweep theory
 *   WING.schrenk(pf, eta)            {load, cl}: Schrenk's span loading at 2y/b = eta, as c cl /(C_L cbar), and the
 *                                    local cl / C_L
 *   WING.ARP, WING.ARJ, WING.arJet(id, M), WING.arSail(LD)   aspect-ratio statistics
 *   WING.DIHEDRAL, WING.TAILGEOM, WING.TAILVOL, WING.tailVol(id)   dihedral, tail geometry and tail volume statistics
 *
 * The statistics are after Raymer, Aircraft Design: A Conceptual Approach (Tables 4.1, 4.2, 4.3 and 6.4); they were
 * transcribed from memory of the text, so check them against the edition you use.
 */
(function (global) {
  'use strict';
  var W = {};
  var D2R = Math.PI / 180;

  /* ---------- NACA 4-digit airfoils ---------- */
  function camber(x, m, p) {
    if (m <= 0 || p <= 0) return 0;
    return x < p ? m / (p * p) * (2 * p * x - x * x) : m / ((1 - p) * (1 - p)) * ((1 - 2 * p) + 2 * p * x - x * x);
  }
  function slope(x, m, p) {
    if (m <= 0 || p <= 0) return 0;
    return x < p ? 2 * m / (p * p) * (p - x) : 2 * m / ((1 - p) * (1 - p)) * (p - x);
  }
  function thick(x, t) {   // half-thickness; the standard NACA coefficients (blunt trailing edge, 0.21% of the chord)
    var s = Math.sqrt(Math.max(0, x));
    return 5 * t * (0.2969 * s - 0.1260 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1015 * x * x * x * x);
  }
  W.code4 = function (m, p, t) {
    return String(Math.round(m * 100)) + String(Math.round(p * 10)) + ('0' + Math.round(t * 100)).slice(-2);
  };
  W.naca4 = function (spec, n) {
    var m, p, t;
    if (typeof spec === 'string') { m = +spec.charAt(0) / 100; p = +spec.charAt(1) / 10; t = +spec.slice(2) / 100; }
    else { m = spec.m; p = spec.p; t = spec.t; }
    n = n || 81;
    var up = [], lo = [], mean = [];
    for (var i = 0; i < n; i++) {
      var x = (1 - Math.cos(Math.PI * i / (n - 1))) / 2, yc = camber(x, m, p), th = Math.atan(slope(x, m, p)), yt = thick(x, t);
      up.push([x - yt * Math.sin(th), yc + yt * Math.cos(th)]);
      lo.push([x + yt * Math.sin(th), yc - yt * Math.cos(th)]);
      mean.push([x, yc]);
    }
    return {
      m: m, p: p, t: t, code: W.code4(m, p, t), upper: up, lower: lo, mean: mean,
      camber: function (x) { return camber(x, m, p); }, slope: function (x) { return slope(x, m, p); }, thick: function (x) { return thick(x, t); }
    };
  };

  /* ---------- Thin-airfoil theory (Glauert integrals, x = (1 - cos θ)/2) ---------- */
  W.thin = function (m, p) {
    var N = 2000, I0 = 0, I1 = 0, I2 = 0, Ia = 0, d = Math.PI / N;
    for (var i = 0; i < N; i++) {
      var th = (i + 0.5) * d, s = slope((1 - Math.cos(th)) / 2, m, p);
      I0 += s * (Math.cos(th) - 1) * d; I1 += s * Math.cos(th) * d; I2 += s * Math.cos(2 * th) * d; Ia += s * d;
    }
    var A1 = 2 / Math.PI * I1, A2 = 2 / Math.PI * I2;
    return { alphaL0: -I0 / Math.PI / D2R, cm: Math.PI / 4 * (A2 - A1), clIdeal: Math.PI * A1, alphaIdeal: Ia / Math.PI / D2R };
  };

  /* ---------- Standard atmosphere and Reynolds number ---------- */
  W.isa = function (h) {
    var T, p, g = 9.80665, R = 287.053;
    if (h <= 11000) { T = 288.15 - 0.0065 * h; p = 101325 * Math.pow(T / 288.15, g / (0.0065 * R)); }
    else { T = 216.65; p = 22632.06 * Math.exp(-g * (h - 11000) / (R * T)); }
    var rho = p / (R * T);
    return { T: T, p: p, rho: rho, a: Math.sqrt(1.4 * R * T), mu: 1.458e-6 * Math.pow(T, 1.5) / (T + 110.4) };
  };
  W.reynolds = function (h, V, c) {
    var s = W.isa(h);
    return { Re: s.rho * V * c / s.mu, M: V / s.a, rho: s.rho, mu: s.mu, a: s.a };
  };

  /* ---------- Planform geometry ---------- */
  W.sweepAt = function (Lm, m, n, A, lam) {
    return Math.atan(Math.tan(Lm * D2R) - 4 / A * (n - m) * (1 - lam) / (1 + lam)) / D2R;
  };
  W.planform = function (S, A, lam, sweepC4) {
    var b = Math.sqrt(A * S), cr = 2 * S / (b * (1 + lam)), ct = lam * cr;
    var mac = 2 / 3 * cr * (1 + lam + lam * lam) / (1 + lam), ymac = b / 6 * (1 + 2 * lam) / (1 + lam);
    var le = W.sweepAt(sweepC4, 0.25, 0, A, lam);
    return {
      S: S, A: A, lam: lam, b: b, cr: cr, ct: ct, mac: mac, ymac: ymac, xmac: ymac * Math.tan(le * D2R),
      sweepC4: sweepC4, sweepLE: le, sweepTE: W.sweepAt(sweepC4, 0.25, 1, A, lam), sweepHalf: W.sweepAt(sweepC4, 0.25, 0.5, A, lam),
      sweep: function (n) { return W.sweepAt(sweepC4, 0.25, n, A, lam); },
      chord: function (eta) { return cr * (1 - (1 - lam) * Math.abs(eta)); }     // eta = 2y/b
    };
  };

  /* ---------- Lift-curve slope, drag divergence, span loading ---------- */
  W.cla = function (A, M, sweepDeg, eta) {
    var b2 = 1 - (M || 0) * (M || 0), e = eta || 0.95, t = Math.tan((sweepDeg || 0) * D2R);
    return 2 * Math.PI * A / (2 + Math.sqrt(4 + A * A * b2 / (e * e) * (1 + t * t / b2)));
  };
  W.korn = function (kappa, tc, cl, sweepDeg) {
    var c = Math.cos((sweepDeg || 0) * D2R);
    return kappa / c - tc / (c * c) - cl / (10 * c * c * c);
  };
  W.KORN = { conventional: 0.87, supercritical: 0.95 };
  W.schrenk = function (pf, eta) {
    var cbar = pf.S / pf.b, c = pf.chord(eta), ce = 4 * pf.S / (Math.PI * pf.b) * Math.sqrt(Math.max(0, 1 - eta * eta));
    return { load: (c + ce) / (2 * cbar), cl: (c + ce) / (2 * c) };
  };

  /* ---------- Statistics (after Raymer; verify against your edition) ---------- */
  // Aspect ratio of propeller aircraft (Table 4.1)
  W.ARP = [
    { id: 'home', label: 'Homebuilt', A: 6.0 }, { id: 'ga1', label: 'General aviation, single engine', A: 7.6 },
    { id: 'ga2', label: 'General aviation, twin engine', A: 7.8 }, { id: 'ag', label: 'Agricultural', A: 7.5 },
    { id: 'tprop', label: 'Twin turboprop', A: 9.2 }, { id: 'boat', label: 'Flying boat', A: 8.0 }
  ];
  // Aspect ratio of jets, A = a M_max^C (Table 4.1)
  W.ARJ = [
    { id: 'trainer', label: 'Jet trainer', a: 4.737, C: -0.979 }, { id: 'dogfighter', label: 'Jet fighter (dogfighter)', a: 5.416, C: -0.622 },
    { id: 'fighter', label: 'Jet fighter (other)', a: 4.110, C: -0.622 }, { id: 'cargo', label: 'Military cargo or bomber', a: 5.570, C: -1.075 },
    { id: 'jt', label: 'Jet transport', a: 7.50, C: 0 }
  ];
  W.arJet = function (id, M) { for (var i = 0; i < W.ARJ.length; i++) if (W.ARJ[i].id === id) return W.ARJ[i].a * Math.pow(M, W.ARJ[i].C); return NaN; };
  W.arSail = function (LD) { return 0.19 * Math.pow(LD, 1.3); };   // sailplanes: equivalent aspect ratio from the best L/D
  // Dihedral guidelines in degrees (Table 4.2): [low, mid, high wing], each [from, to]
  W.DIHEDRAL = [
    { id: 'unswept', label: 'Unswept (civil)', low: [5, 7], mid: [2, 4], high: [0, 2] },
    { id: 'subsonic', label: 'Subsonic swept wing', low: [3, 7], mid: [-2, 2], high: [-5, -2] },
    { id: 'supersonic', label: 'Supersonic swept wing', low: [0, 5], mid: [-5, 0], high: [-5, 0] }
  ];
  // Tail aspect and taper ratios (Table 4.3): [from, to]
  W.TAILGEOM = [
    { id: 'fighter', label: 'Fighter', hA: [3, 4], hLam: [0.2, 0.4], vA: [0.6, 1.4], vLam: [0.2, 0.4] },
    { id: 'sail', label: 'Sailplane', hA: [6, 10], hLam: [0.3, 0.5], vA: [1.5, 2.0], vLam: [0.4, 0.6] },
    { id: 'other', label: 'Others', hA: [3, 5], hLam: [0.3, 0.6], vA: [1.3, 2.0], vLam: [0.3, 0.6] },
    { id: 'ttail', label: 'T-tail (vertical tail)', hA: null, hLam: null, vA: [0.7, 1.2], vLam: [0.6, 1.0] }
  ];
  // Tail volume coefficients (Table 6.4): horizontal c_HT and vertical c_VT
  W.TAILVOL = [
    { id: 'sail', label: 'Sailplane', h: 0.50, v: 0.02 }, { id: 'home', label: 'Homebuilt', h: 0.50, v: 0.04 },
    { id: 'ga1', label: 'General aviation, single engine', h: 0.70, v: 0.04 }, { id: 'ga2', label: 'General aviation, twin engine', h: 0.80, v: 0.07 },
    { id: 'ag', label: 'Agricultural', h: 0.50, v: 0.04 }, { id: 'tprop', label: 'Twin turboprop', h: 0.90, v: 0.08 },
    { id: 'boat', label: 'Flying boat', h: 0.70, v: 0.06 }, { id: 'trainer', label: 'Jet trainer', h: 0.70, v: 0.06 },
    { id: 'fighter', label: 'Jet fighter', h: 0.40, v: 0.07 }, { id: 'cargo', label: 'Military cargo or bomber', h: 1.00, v: 0.08 },
    { id: 'jt', label: 'Jet transport', h: 1.00, v: 0.09 }
  ];
  W.tailVol = function (id) { for (var i = 0; i < W.TAILVOL.length; i++) if (W.TAILVOL[i].id === id) return W.TAILVOL[i]; return null; };

  global.WING = W;
})(typeof window !== 'undefined' ? window : this);
