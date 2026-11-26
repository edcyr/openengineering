/*!
 * propulsion.js — ENGINE: engine data, the rubber engine, momentum thrust, propulsive efficiency, fuel flow, thrust
 * lapse, inlet capture area and propellers, for Module 7 of Aerospace Design & Practice (Propulsion Selection and
 * Integration). Plain ES5, no dependencies; every function is pure.
 *
 * Units: SI (N, kg, m, s, W) unless a name says kN or kW.
 *
 *   ENGINE.DB                         certified engines from EASA type-certificate data sheets: {id, name, family, type,
 *                                     T (take-off thrust, kN) or P (take-off shaft power, kW), W (dry weight, kg),
 *                                     L (overall length, m), H (overall height or width, m), tcds, note}
 *   ENGINE.byId(id)                   (entries with rerate: true are another entry's hardware at a higher rating)
 *   ENGINE.EXP                        rubber-engine exponents {L: 0.4, D: 0.5, W: 1.1}
 *   ENGINE.rubber(base, T)            {SF, T, L, H, W}: a base engine scaled to thrust T (kN), or a turboprop to power T (kW)
 *   ENGINE.powerFit(pts)              least-squares fit y = a x^b in logarithms, {a, b, r2}
 *   ENGINE.netThrust(md, Vj, V)       momentum thrust md (Vj − V) of a fully expanded jet
 *   ENGINE.etaP(V, Vj)                propulsive efficiency 2/(1 + Vj/V)
 *   ENGINE.jetVelocity(T, md, V)      Vj = V + T/md
 *   ENGINE.fuelFlow(cT, T)            kg/s, with cT in mg/(N s)
 *   ENGINE.cT(C), ENGINE.C(cT)        conversions between cT (mg/(N s)) and the Breguet C (1/h) of Module 3
 *   ENGINE.lapseSigma(h)              alpha = sigma, as in Module 5
 *   ENGINE.lapseHB(h, M)              a published correlation for high-bypass turbofans: delta0 (1 − 0.49 sqrt M)
 *   ENGINE.thrustNeeded(h, o)         thrust/W0 that Module 5's master equation needs at altitude h (o: M, CD0, ws, beta, A, e, fpm)
 *   ENGINE.ceiling(TW, 'sigma'|'hb', o)  highest altitude (m) where the lapsed takeoff thrust meets thrustNeeded, or null
 *   ENGINE.BIZ, ENGINE.resize(LD, dWe)    Module 3's business-jet sizing run again {Wx, ff, W0, We, Wf}
 *   ENGINE.captureArea(md, rho, V)    free-stream tube area A0 = md/(rho V)
 *   ENGINE.mu(T), ENGINE.blThickness(x, h, V)  Sutherland viscosity; turbulent boundary layer 0.37 x/Re^0.2 {delta, Re}
 *   ENGINE.wingBox(o)                 geometric wing-box tank volume {wing, center, total} (see the function)
 *   ENGINE.FUELS                      fuels: density (kg/m3) and lower heating value (MJ/kg), typical values
 *   ENGINE.actuator(P, D, V, rho)     ideal (actuator-disk) propeller at shaft power P (W): {T, vi, eta}
 *   ENGINE.tipMach(D, rpm, V, a)      helical tip Mach number
 *   ENGINE.maxDiameter(rpm, V, a, Mt) largest diameter for a helical tip Mach limit
 *   ENGINE.isa(h)                     standard atmosphere to 20 km {T, p, rho, a, sigma, delta}
 *
 * Sources: the engine data are from EASA type-certificate data sheets IM.E.016 (Williams FJ44/FJ33, Issue 13),
 * E.003 (CFM56-5B/5C, Issue 06), IM.E.069 (IAE V2500, Issue 05) and IM.E.041 (PW100, Issue 07). The rubber-engine
 * exponents are Raymer's (Chapter 10). The high-bypass lapse correlation is Mattingly's (Aircraft Engine Design).
 */
(function (global) {
  'use strict';
  var X = {};
  X.G = 9.81;

  /* ---------- Engine data (EASA TCDS) ---------- */
  function fan(id, name, family, T, W, L, H, tcds, note) { return { id: id, name: name, family: family, type: 'turbofan', T: T, W: W, L: L, H: H, tcds: tcds, note: note || '' }; }
  function tp(id, name, P, W, L, H) { return { id: id, name: name, family: 'PW100', type: 'turboprop', P: P, W: W, L: L, H: H, tcds: 'EASA IM.E.041 Issue 07', note: 'maximum take-off power; width given as H' }; }
  var FJ = 'EASA IM.E.016 Issue 13';
  X.DB = [
    fan('fj33-5a', 'FJ33-5A', 'FJ33/FJ44', 8.21, 144.7, 1.09, 0.64, FJ),
    fan('fj44-1a', 'FJ44-1A', 'FJ33/FJ44', 8.45, 208.7, 1.35, 0.75, FJ),
    fan('fj44-2a', 'FJ44-2A', 'FJ33/FJ44', 10.23, 240.5, 1.52, 0.75, FJ),
    fan('fj44-2c', 'FJ44-2C', 'FJ33/FJ44', 10.68, 235.9, 1.52, 0.75, FJ),
    fan('fj44-3a', 'FJ44-3A', 'FJ33/FJ44', 12.54, 242.7, 1.58, 0.79, FJ, 'Cessna Citation CJ3 Gen2'),
    fan('fj44-3ap', 'FJ44-3AP', 'FJ33/FJ44', 13.58, 234.1, 1.58, 0.80, FJ),
    fan('fj44-4a', 'FJ44-4A', 'FJ33/FJ44', 16.10, 304.0, 1.74, 0.82, FJ, 'geometrically 1.1 times the FJ44-3A'),
    fan('v2527-a5', 'V2527-A5', 'V2500', 110.31, 2404, 3.201, 1.682, 'EASA IM.E.069 Issue 05', 'width given as H'),
    fan('cfm56-5b4', 'CFM56-5B4', 'CFM56-5B', 120.10, 2454.8, 2.5997, 2.105, 'EASA E.003 Issue 06', 'length flange to flange'),
    fan('v2533-a5', 'V2533-A5', 'V2500', 140.56, 2404, 3.201, 1.682, 'EASA IM.E.069 Issue 05', 'the V2527-A5 at a higher rating; width given as H'),
    fan('cfm56-5b3', 'CFM56-5B3', 'CFM56-5B', 142.34, 2454.8, 2.5997, 2.105, 'EASA E.003 Issue 06', 'the CFM56-5B4 at a higher rating; length flange to flange'),
    tp('pw120', 'PW120', 1491, 417.3, 2.130, 0.635),
    tp('pw123', 'PW123', 1775, 450.0, 2.130, 0.660),
    tp('pw127m', 'PW127M', 2051, 481.7, 2.130, 0.720)
  ];
  X.DB.forEach(function (e) { e.rerate = /at a higher rating/.test(e.note); });   // the same hardware as another entry: left out of fits
  var BYID = {}; X.DB.forEach(function (e) { BYID[e.id] = e; });
  X.byId = function (id) { return BYID[id] || null; };

  /* ---------- The rubber engine ---------- */
  X.EXP = { L: 0.4, D: 0.5, W: 1.1 };
  X.rubber = function (base, T) {
    var SF = T / (base.type === 'turboprop' ? base.P : base.T);   // a turboprop scales by its shaft power (T in kW)
    return { SF: SF, T: T, L: base.L * Math.pow(SF, X.EXP.L), H: base.H * Math.pow(SF, X.EXP.D), W: base.W * Math.pow(SF, X.EXP.W) };
  };
  X.powerFit = function (pts) {
    var n = pts.length, sx = 0, sy = 0, i;
    var lx = pts.map(function (p) { return Math.log(p[0]); }), ly = pts.map(function (p) { return Math.log(p[1]); });
    for (i = 0; i < n; i++) { sx += lx[i]; sy += ly[i]; }
    var mx = sx / n, my = sy / n, sxy = 0, sxx = 0, syy = 0;
    for (i = 0; i < n; i++) { sxy += (lx[i] - mx) * (ly[i] - my); sxx += (lx[i] - mx) * (lx[i] - mx); syy += (ly[i] - my) * (ly[i] - my); }
    var b = sxy / sxx;
    return { a: Math.exp(my - b * mx), b: b, r2: sxy * sxy / (sxx * syy) };
  };

  /* ---------- Thrust, efficiency, fuel ---------- */
  X.netThrust = function (md, Vj, V) { return md * (Vj - V); };
  X.etaP = function (V, Vj) { return 2 / (1 + Vj / V); };
  X.jetVelocity = function (T, md, V) { return V + T / md; };
  X.fuelFlow = function (cT, T) { return cT * 1e-6 * T; };
  X.cT = function (C) { return C * 28.33; };
  X.C = function (cT) { return cT / 28.33; };

  /* ---------- Atmosphere and lapse ---------- */
  X.isa = function (h) {
    var T, p;
    if (h <= 11000) { T = 288.15 - 0.0065 * h; p = 101325 * Math.pow(T / 288.15, 5.2559); }
    else { T = 216.65; p = 22632.06 * Math.exp(-9.80665 * (h - 11000) / (287.053 * T)); }
    var rho = p / (287.053 * T);
    return { T: T, p: p, rho: rho, a: Math.sqrt(1.4 * 287.053 * T), sigma: rho / 1.225, delta: p / 101325 };
  };
  X.lapseSigma = function (h) { return X.isa(h).sigma; };
  // total-pressure ratio delta0 = (p/p_SL)(1 + 0.2 M^2)^3.5; valid below the engine's throttle-ratio temperature break
  X.lapseHB = function (h, M) { var s = X.isa(h); return s.delta * Math.pow(1 + 0.2 * M * M, 3.5) * (1 - 0.49 * Math.sqrt(M)); };

  /* ---------- Inlets ---------- */
  /* ---------- The engine in the design (Lesson 8) ---------- */
  // Thrust a flight condition needs, as a share of W0: Module 5's master equation times alpha.
  // o {M, CD0, ws (takeoff wing loading, kg/m2), beta (weight fraction), A, e, fpm (climb rate, ft/min)}
  X.thrustNeeded = function (h, o) {
    var s = X.isa(h), q = 0.7 * s.p * o.M * o.M, V = o.M * s.a, W = o.beta * X.G * o.ws, K = 1 / (Math.PI * o.A * o.e);
    return o.beta * (q * o.CD0 / W + K * W / q + (o.fpm || 0) * 0.00508 / V);
  };
  // Highest altitude (m, in 10 m steps down from hMax) where TW alpha(h) meets thrustNeeded; null if none.
  X.ceiling = function (TW, lapse, o, hMax) {
    for (var h = hMax || 16000; h >= 0; h -= 10) {
      var a = lapse === 'hb' ? X.lapseHB(h, o.M) : X.lapseSigma(h);
      if (TW * a >= X.thrustNeeded(h, o)) return h;
    }
    return null;
  };
  // Module 3's sizing of the business jet, run again with a new L/Dmax and an addition dWe (kg) to the empty
  // weight: jet cruise at 0.866 L/Dmax, loiter at L/Dmax, historical fractions, 6% allowance, jet-transport trend.
  X.BIZ = { Wfix: 980, R: 4600, V: 850, C: 0.65, E: 0.75, Cl: 0.55, a: 1.02 * Math.pow(0.45359237, 0.06), c: -0.06 };
  X.resize = function (LD, dWe, o) {
    o = o || X.BIZ;
    var Wx = 0.97 * 0.985 * Math.exp(-o.R * o.C / (o.V * 0.866 * LD)) * Math.exp(-o.E * o.Cl / LD) * 0.995, ff = 1.06 * (1 - Wx), W = 7000, i, d;
    for (i = 0; i < 200; i++) { d = 1 - ff - o.a * Math.pow(W, o.c); if (!(d > 0.002)) return null; var Wn = (o.Wfix + (dWe || 0)) / d; if (Math.abs(Wn - W) < 1e-6) { W = Wn; break; } W = Wn; }
    return { Wx: Wx, ff: ff, W0: W, We: o.a * Math.pow(W, o.c) * W + (dWe || 0), Wf: ff * W };
  };

  X.captureArea = function (md, rho, V) { return md / (rho * V); };
  X.mu = function (T) { return 1.458e-6 * Math.pow(T, 1.5) / (T + 110.4); };            // Sutherland's law, Pa s
  // turbulent boundary-layer thickness on a flat plate, 0.37 x / Re_x^0.2, at distance x from the nose
  X.blThickness = function (x, h, V) { var s = X.isa(h), Re = s.rho * V * x / X.mu(s.T); return { delta: 0.37 * x / Math.pow(Re, 0.2), Re: Re }; };

  /* ---------- Fuel tanks ---------- */
  // a geometric estimate of the wing box's volume: between spars at fractions fs and rs of the local chord, a box depth of
  // k times the local thickness, from the fuselage side to a fraction eta of the half span, both wings; plus, if asked,
  // the center section across the fuselage at the root chord. Trapezoidal wing of area S, aspect ratio A, taper lam,
  // thickness ratio tc at the root tapering linearly to tc*tau at the tip; d the fuselage width.
  X.wingBox = function (o) {
    var b = Math.sqrt(o.A * o.S), cr = 2 * o.S / (b * (1 + o.lam)), y0 = o.d / 2, y1 = o.eta * b / 2, n = 200, V = 0, k = o.k == null ? 0.9 : o.k, tau = o.tau == null ? 1 : o.tau;
    function c(y) { return cr * (1 - (1 - o.lam) * 2 * y / b); }
    function t(y) { return o.tc * (1 + (tau - 1) * 2 * y / b); }
    for (var i = 0; i < n; i++) { var y = y0 + (i + 0.5) * (y1 - y0) / n, cy = c(y); V += (o.rs - o.fs) * cy * k * t(y) * cy * (y1 - y0) / n; }
    var center = o.d * (o.rs - o.fs) * cr * k * o.tc * cr;
    return { wing: 2 * V, center: center, total: 2 * V + (o.withCenter ? center : 0), b: b, cr: cr };
  };
  X.FUELS = [
    { id: 'jeta1', label: 'Jet A-1 (kerosene)', rho: 800, h: 43.2 },
    { id: 'avgas', label: 'Avgas 100LL', rho: 720, h: 43.7 },
    { id: 'lh2', label: 'Liquid hydrogen', rho: 70.8, h: 120 }
  ];

  /* ---------- Propellers ---------- */
  // ideal propeller (actuator disk): P = T (V + vi), T = 2 rho A vi (V + vi); solved for vi by bisection
  X.actuator = function (P, D, V, rho) {
    var A = Math.PI * D * D / 4, lo = 0, hi = 1000, vi = 0, T = 0;
    for (var i = 0; i < 100; i++) { vi = (lo + hi) / 2; T = 2 * rho * A * vi * (V + vi); if (T * (V + vi) < P) lo = vi; else hi = vi; }
    return { T: T, vi: vi, eta: V > 0 ? T * V / P : 0, A: A };
  };
  X.tipMach = function (D, rpm, V, a) { var vt = Math.PI * D * rpm / 60; return Math.sqrt(vt * vt + V * V) / a; };
  X.maxDiameter = function (rpm, V, a, Mt) { var vt2 = Mt * Mt * a * a - V * V; return vt2 > 0 ? Math.sqrt(vt2) * 60 / (Math.PI * rpm) : 0; };

  global.ENGINE = X;
})(typeof window !== 'undefined' ? window : this);
