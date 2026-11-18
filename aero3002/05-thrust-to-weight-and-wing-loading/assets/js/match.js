/*!
 * match.js — MATCH: thrust-to-weight ratio, wing loading and the constraint diagram, for Module 5 of Conceptual
 * Aircraft Design (Thrust-to-Weight Ratio and Wing Loading). Plain ES5, no dependencies; every function is pure.
 *
 * Units: wing loading W/S in kg/m² of takeoff mass (as in Modules 2 to 4); T/W is the sea-level static thrust over the
 * takeoff weight; P/W in kW/kg; speeds in m/s, distances in m, altitudes in m.
 *
 *   MATCH.isa(h, dT)                 standard atmosphere at h (0–20 km), dT kelvin hotter than standard at the same
 *                                    pressure: {T, p, rho, a, sigma}
 *   MATCH.q(h, M, dT)                dynamic pressure 0.7 p M² (Pa)
 *   MATCH.stallWS(V, clmax, rho)     the largest W/S (kg/m²) that stalls at V
 *   MATCH.approachWS(Vref, clmax, wl, rho)  takeoff W/S allowed by an approach speed (V_SR = V_REF/1.23) at landing
 *                                    weight wl·W0
 *   MATCH.landingDist(wsL, clmax, Sa, sigma, rev)  landing distance from 50 ft (m), at landing wing loading wsL (Raymer's
 *                                    80(W/S)/(σ C_Lmax) + S_a, converted to SI: 5.00 m per kg/m²); rev: thrust
 *                                    reversers (× 0.66 on the first term)
 *   MATCH.landingWS(s, clmax, wl, Sa, sigma, rev)  the takeoff W/S that lands in s
 *   MATCH.SA                         obstacle-clearance allowances S_a (m): airliner 305, light aircraft 183, STOL 137
 *   MATCH.tofl(ws, tw, clto, sigma)  Part 25 takeoff field length (m) from the takeoff parameter, 2.34 TOP
 *   MATCH.takeoffTW(ws, s, clto, sigma)  the T/W that takes off in s
 *   MATCH.climbTW(G, LD, N)          T/W for a climb gradient G with one of N engines failed (N = 1: all engines)
 *   MATCH.flightTW(ws, c)            the master equation: T/W = (β/α)[q C_D0/(β W/S) + n² K β W/S / q + (1/V) dh/dt],
 *                                    c = {h, M, dT, CD0, A, e, beta, alpha (default σ), n (1), vv (rate of climb, m/s)}
 *   MATCH.instTurnWS(c)              the largest W/S that reaches load factor c.n at c.clmax (instantaneous turn)
 *   MATCH.bestWS(c, what)            the W/S for 'range' or 'loiter', jet or propeller (c.prop), at c.h, c.M
 *   MATCH.diagram(spec)              a constraint diagram: {limits: [{id, label, ws}], curves: [{id, label, f(ws)}],
 *                                    wsMax, env(ws), design: {ws, tw, by}}; spec = {polar: {CD0, A, e}, and any of
 *                                    landing {s, C, wl, Sa, rev, h, dT}, stall {V (km/h), C, wl, h, dT},
 *                                    takeoff {s, C, h, dT, k (default 2.34)}, cruise {h, M, beta}, ceiling {h, M, beta, fpm},
 *                                    oei {N, LD, G}, turn {h, M, beta, n}, inst {h, M, beta, n, C}} (h in m);
 *                                    cruise, ceiling and turn take an optional thrust lapse alpha (default σ).
 *                                    The design point is the lowest T/W the envelope reaches at or below the largest
 *                                    allowed W/S, at the highest W/S that gives it (MATCH.solveDesign(limits, curves)).
 *   MATCH.diagramP(spec)             the same for propeller aircraft, with P/W (kW/kg): large turboprops after Scholz and
 *                                    Nita, with their statistical factors (kL 0.137 kg/m³, kTO 2.25 m³/kg, kAPP 1.64), and
 *                                    light aircraft with Roskam's Part 23 ground roll (MATCH.groundRollP, topForGroundRoll);
 *                                    MATCH.flightPW(ws, c) is the master equation in power, P = TV/eta.
 *   MATCH.TW_TYPICAL, MATCH.TW_FIT, MATCH.twFit(id, M)   statistical T/W: typical values and T/W0 = a Mmax^C
 *   MATCH.PW_TYPICAL, MATCH.PW_FIT, MATCH.pwFit(id, V)   statistical P/W (kW/kg) of propeller aircraft, V in km/h
 *   MATCH.WS_TYPICAL                 typical takeoff wing loadings (kg/m²)
 *
 * The statistics are after Raymer, Aircraft Design: A Conceptual Approach (Tables 5.1 to 5.5), as reproduced in SI
 * units in a course adapted from it; the landing equation is Raymer's; the field-length correlation is Loftin's
 * (NASA RP-1060), as given by Roskam and Scholz.
 */
(function (global) {
  'use strict';
  var X = {};
  var G = 9.81, RHO0 = 1.225, R = 287.053, G0 = 9.80665;

  X.isa = function (h, dT) {
    var T, p;
    if (h <= 11000) { T = 288.15 - 0.0065 * h; p = 101325 * Math.pow(T / 288.15, G0 / (0.0065 * R)); }
    else { T = 216.65; p = 22632.06 * Math.exp(-G0 * (h - 11000) / (R * T)); }
    T += dT || 0;
    var rho = p / (R * T);
    return { T: T, p: p, rho: rho, a: Math.sqrt(1.4 * R * T), sigma: rho / RHO0 };
  };
  X.q = function (h, M, dT) { return 0.7 * X.isa(h, dT).p * M * M; };

  /* ---------- Stall, approach and landing ---------- */
  X.stallWS = function (V, clmax, rho) { return 0.5 * (rho || RHO0) * V * V * clmax / G; };
  X.approachWS = function (Vref, clmax, wl, rho) { return X.stallWS(Vref / 1.23, clmax, rho) / (wl || 1); };
  var KL = 80 * 0.3048 * G / 47.880;                 // Raymer's 80 ft per lb/ft², in m per kg/m²: 4.996
  X.KLAND = KL;
  X.SA = { airliner: 305, light: 183, stol: 137 };
  X.landingDist = function (wsL, clmax, Sa, sigma, rev) { return KL * (rev ? 0.66 : 1) * wsL / ((sigma || 1) * clmax) + (Sa == null ? 305 : Sa); };
  X.landingWS = function (s, clmax, wl, Sa, sigma, rev) { return (s - (Sa == null ? 305 : Sa)) * (sigma || 1) * clmax / (KL * (rev ? 0.66 : 1)) / (wl || 1); };

  /* ---------- Takeoff ---------- */
  var KTO = 2.34;                                    // 37.5 ft per lb/ft² of the takeoff parameter, in m per kg/m²
  X.KTO = KTO;
  X.tofl = function (ws, tw, clto, sigma) { return KTO * ws / ((sigma || 1) * clto * tw); };
  X.takeoffTW = function (ws, s, clto, sigma) { return KTO * ws / (s * (sigma || 1) * clto); };

  /* ---------- Climb, cruise, ceiling, turns ---------- */
  X.climbTW = function (G_, LD, N) { return (N > 1 ? N / (N - 1) : 1) * (1 / LD + G_); };
  X.flightTW = function (ws, c) {
    var s = X.isa(c.h, c.dT), q = 0.7 * s.p * c.M * c.M, V = c.M * s.a, K = 1 / (Math.PI * c.A * c.e);
    var beta = c.beta == null ? 1 : c.beta, alpha = c.alpha == null ? s.sigma : c.alpha, n = c.n || 1, wsN = beta * ws * G;
    return beta / alpha * (q * c.CD0 / wsN + n * n * K * wsN / q + (c.vv || 0) / V);
  };
  X.instTurnWS = function (c) { return X.q(c.h, c.M, c.dT) * c.clmax / (c.n * G * (c.beta == null ? 1 : c.beta)); };
  X.bestWS = function (c, what) {
    var q = X.q(c.h, c.M, c.dT), K = 1 / (Math.PI * c.A * c.e), f;
    if (what === 'loiter') f = c.prop ? Math.sqrt(3 * c.CD0 / K) : Math.sqrt(c.CD0 / K);
    else f = c.prop ? Math.sqrt(c.CD0 / K) : Math.sqrt(c.CD0 / (3 * K));
    return q * f / G / (c.beta == null ? 1 : c.beta);
  };

  /* ---------- The constraint diagram ---------- */
  X.diagram = function (sp) {
    var P = sp.polar || {}, limits = [], curves = [];
    function fc(o) { return { h: o.h || 0, M: o.M, CD0: P.CD0, A: P.A, e: P.e, beta: o.beta, alpha: o.alpha, n: o.n, vv: o.fpm ? o.fpm * 0.00508 : 0 }; }
    function sg(o) { return X.isa(o.h || 0, o.dT || 0).sigma; }
    if (sp.landing) { var L = sp.landing; limits.push({ id: 'landing', label: 'Landing', ws: X.landingWS(L.s, L.C, L.wl, L.Sa, sg(L), L.rev) }); }
    if (sp.stall) { var St = sp.stall; limits.push({ id: 'stall', label: 'Stall', ws: X.stallWS(St.V / 3.6, St.C, X.isa(St.h || 0, St.dT || 0).rho) / (St.wl || 1) }); }
    if (sp.inst) { var I = sp.inst; limits.push({ id: 'inst', label: 'Instantaneous turn', ws: X.instTurnWS({ h: I.h || 0, M: I.M, clmax: I.C, n: I.n, beta: I.beta }) }); }
    if (sp.takeoff) { var T = sp.takeoff, sT = sg(T), kT = T.k || KTO; curves.push({ id: 'takeoff', label: 'Takeoff', f: function (w) { return kT * w / (T.s * sT * T.C); } }); }
    if (sp.cruise) { var cC = fc(sp.cruise); cC.n = 1; cC.vv = 0; curves.push({ id: 'cruise', label: 'Cruise', f: function (w) { return X.flightTW(w, cC); } }); }
    if (sp.ceiling) { var cE = fc(sp.ceiling); cE.n = 1; curves.push({ id: 'ceiling', label: 'Ceiling', f: function (w) { return X.flightTW(w, cE); } }); }
    if (sp.turn) { var cT = fc(sp.turn); cT.vv = 0; curves.push({ id: 'turn', label: 'Sustained turn', f: function (w) { return X.flightTW(w, cT); } }); }
    if (sp.oei) { var tO = X.climbTW(sp.oei.G, sp.oei.LD, sp.oei.N); curves.push({ id: 'oei', label: 'Engine out', f: function () { return tO; } }); }
    return X.solveDesign(limits, curves);
  };
  // The design point of a set of wing loading limits [{id, label, ws}] and curves [{id, label, f(ws)}] of T/W or P/W
  X.solveDesign = function (limits, curves) {
    var wsMax = limits.length ? Math.min.apply(null, limits.map(function (l) { return l.ws; })) : 1000;
    function env(w) { var m = 0, by = null; curves.forEach(function (c) { var v = c.f(w); if (v > m) { m = v; by = c.id; } }); env.by = by; return m; }
    if (!(wsMax > 0)) return { limits: limits, curves: curves, wsMax: wsMax, env: function (w) { return env(w); }, design: { ws: NaN, tw: NaN, by: null, limit: null, onLimit: false } };   // no wing loading is allowed
    // scan for the lowest envelope at or below wsMax (the highest W/S wins a tie), then refine around it
    var best = { ws: NaN, tw: Infinity, by: null }, N = 2000, top = Math.max(1, wsMax);
    for (var i = 1; i <= N; i++) { var w = top * i / N, v = env(w); if (v <= best.tw + 1e-12) best = { ws: w, tw: v, by: env.by }; }
    var lo = Math.max(top / N, best.ws - top / N), hi = Math.min(top, best.ws + top / N);
    for (var k = 0; k <= 200; k++) { var w2 = lo + (hi - lo) * k / 200, v2 = env(w2); if (v2 <= best.tw + 1e-12) best = { ws: w2, tw: v2, by: env.by }; }
    if (!curves.length) best = { ws: wsMax, tw: 0, by: null };
    best.limit = limits.filter(function (l) { return l.ws === wsMax; }).map(function (l) { return l.id; })[0] || null;
    best.onLimit = Math.abs(best.ws - wsMax) < 1e-6 * Math.max(1, wsMax);
    return { limits: limits, curves: curves, wsMax: wsMax, env: function (w) { return env(w); }, design: best };
  };

  /* ---------- Propeller aircraft: power loading P/W (kW/kg) against wing loading ---------- */
  // Large turboprops (transport rules) after Scholz and Nita (2008), with their statistical factors for turboprops:
  // landing kL = 0.137 kg/m³, takeoff kTO = 2.25 m³/kg, approach speed kAPP = 1.64 m^0.5/s. Light aircraft: Roskam's Part 23 ground roll.
  X.KL_TP = 0.137; X.KTO_TP = 2.25; X.KAPP_TP = 1.64;
  var GR_A = 0.3048 * 4.9 / 2.96988, GR_B = 0.3048 * 0.009 / (2.96988 * 2.96988);   // 4.9 TOP + 0.009 TOP² ft (lb/ft², lb/hp), in m with kg²/(m² kW)
  X.groundRollP = function (top) { return GR_A * top + GR_B * top * top; };
  X.topForGroundRoll = function (s) { return (-GR_A + Math.sqrt(GR_A * GR_A + 4 * GR_B * s)) / (2 * GR_B); };
  // P/W0 (kW/kg) for a flight condition: the master equation with a power lapse alphaP (default sigma) and P = TV/eta
  X.flightPW = function (ws, c) {
    var a = X.isa(c.h, c.dT), cc = {}; for (var k in c) cc[k] = c[k];
    cc.alpha = c.alpha == null ? a.sigma : c.alpha;
    return X.flightTW(ws, cc) * G * c.M * a.a / (1000 * c.eta);
  };
  // The speeds the transport rules tie to the landing: V_APP = kAPP sqrt(s_LFL), V_S,L = V_APP/rApp, V_S,TO = V_S,L sqrt(C_L,L/C_L,TO), V2 = r2 V_S,TO
  X.propSpeeds = function (sp) {
    var vapp = (sp.kAPP || X.KAPP_TP) * Math.sqrt(sp.sLFL), vsl = vapp / (sp.rApp || 1.3), vsto = vsl * Math.sqrt(sp.CL / sp.CTO), v2 = (sp.r2 || 1.2) * vsto;
    return { vapp: vapp, vsl: vsl, vsto: vsto, v2: v2, vbar: v2 / Math.SQRT2 };
  };
  // spec = {polar: {CD0, A, e}, N, speeds: {sLFL, CL, CTO, kAPP, rApp, r2}, and any of landing {s, C, wl, kL, h, dT}, stall, inst,
  //   takeoff {s, C, eta, k, h, dT} (transport field length), ground {s, C, h, dT} (light-aircraft ground roll), oei {LD, G, eta},
  //   missed {LD, G, eta, wl}, cruise / ceiling / turn {..., eta, alpha}}; returns the same as MATCH.diagram, with P/W in place of T/W
  X.diagramP = function (sp) {
    var P = sp.polar || {}, limits = [], curves = [], N = sp.N || 2, V = sp.speeds ? X.propSpeeds(sp.speeds) : null;
    function fc(o) { return { h: o.h || 0, M: o.M, CD0: P.CD0, A: P.A, e: P.e, beta: o.beta, alpha: o.alpha, n: o.n, vv: o.fpm ? o.fpm * 0.00508 : 0, eta: o.eta }; }
    function sg(o) { return X.isa(o.h || 0, o.dT || 0).sigma; }
    var nf = N > 1 ? N / (N - 1) : 1;
    if (sp.landing) { var L = sp.landing; limits.push({ id: 'landing', label: 'Landing', ws: (L.kL || X.KL_TP) * sg(L) * L.C * L.s / (L.wl || 1) }); }
    if (sp.stall) { var St = sp.stall; limits.push({ id: 'stall', label: 'Stall', ws: X.stallWS(St.V / 3.6, St.C, X.isa(St.h || 0, St.dT || 0).rho) / (St.wl || 1) }); }
    if (sp.inst) { var I = sp.inst; limits.push({ id: 'inst', label: 'Instantaneous turn', ws: X.instTurnWS({ h: I.h || 0, M: I.M, clmax: I.C, n: I.n, beta: I.beta }) }); }
    if (sp.takeoff && V) { var T = sp.takeoff, sT = sg(T), kT = T.k || X.KTO_TP; curves.push({ id: 'takeoff', label: 'Takeoff', f: function (w) { return kT * w * G * V.vbar / (1000 * T.s * sT * T.C * T.eta); } }); }
    if (sp.ground) { var Gr = sp.ground, sGr = sg(Gr), tG = X.topForGroundRoll(Gr.s); curves.push({ id: 'ground', label: 'Ground roll', f: function (w) { return w / (sGr * Gr.C * tG); } }); }
    if (sp.oei && V && N > 1) { var O = sp.oei, pO = nf * (1 / O.LD + O.G) * G * V.v2 / (1000 * O.eta); curves.push({ id: 'oei', label: 'Engine out', f: function () { return pO; } }); }
    if (sp.missed && V && N > 1) { var MA = sp.missed, pM = nf * (1 / MA.LD + MA.G) * G * V.vapp / (1000 * MA.eta) * (MA.wl || 1); curves.push({ id: 'missed', label: 'Missed approach', f: function () { return pM; } }); }
    if (sp.cruise) { var cC = fc(sp.cruise); cC.n = 1; cC.vv = 0; curves.push({ id: 'cruise', label: 'Cruise', f: function (w) { return X.flightPW(w, cC); } }); }
    if (sp.ceiling) { var cE = fc(sp.ceiling); cE.n = 1; curves.push({ id: 'ceiling', label: 'Ceiling', f: function (w) { return X.flightPW(w, cE); } }); }
    if (sp.turn) { var cT = fc(sp.turn); cT.vv = 0; curves.push({ id: 'turn', label: 'Sustained turn', f: function (w) { return X.flightPW(w, cT); } }); }
    var D = X.solveDesign(limits, curves); D.speeds = V;
    return D;
  };

  /* ---------- Statistics (Raymer, Tables 5.1 to 5.5) ---------- */
  X.TW_TYPICAL = [
    { id: 'trainer', label: 'Jet trainer', tw: '0.4' }, { id: 'dogfighter', label: 'Jet fighter (dogfighter)', tw: '0.9' },
    { id: 'fighter', label: 'Jet fighter (other)', tw: '0.6' }, { id: 'cargo', label: 'Military cargo or bomber', tw: '0.25' },
    { id: 'jt', label: 'Jet transport', tw: '0.25 to 0.4' }
  ];
  X.TW_FIT = [
    { id: 'trainer', label: 'Jet trainer', a: 0.488, C: 0.728 }, { id: 'dogfighter', label: 'Jet fighter (dogfighter)', a: 0.648, C: 0.594 },
    { id: 'fighter', label: 'Jet fighter (other)', a: 0.514, C: 0.141 }, { id: 'cargo', label: 'Military cargo or bomber', a: 0.244, C: 0.341 },
    { id: 'jt', label: 'Jet transport', a: 0.267, C: 0.363 }
  ];
  X.twFit = function (id, M) { for (var i = 0; i < X.TW_FIT.length; i++) if (X.TW_FIT[i].id === id) return X.TW_FIT[i].a * Math.pow(M, X.TW_FIT[i].C); return NaN; };
  // power: typical P/W and the fit P/W0 = a Vmax^C, published in W/N with Vmax in km/h; here in kW/kg (× 9.81/1000)
  var PWN = [
    ['msail', 'Powered sailplane', 7, 7.24, 0.00], ['homemw', 'Homebuilt (metal or wood)', 13, 0.61, 0.57], ['homec', 'Homebuilt (composite)', 13, 0.51, 0.57],
    ['ga1', 'General aviation, single engine', 12, 3.67, 0.22], ['ga2', 'General aviation, twin engine', 30, 4.89, 0.32],
    ['ag', 'Agricultural', 15, 1.02, 0.50], ['tprop', 'Twin turboprop', 33, 1.63, 0.50], ['boat', 'Flying boat', 16, 4.38, 0.23]
  ];
  X.PW_TYPICAL = PWN.filter(function (r) { return r[0] !== 'homec'; }).map(function (r) { return { id: r[0] === 'homemw' ? 'home' : r[0], label: r[0] === 'homemw' ? 'Homebuilt' : r[1], pw: r[2] * G / 1000, wn: r[2] }; });
  X.PW_FIT = PWN.map(function (r) { return { id: r[0], label: r[1], a: r[3] * G / 1000, C: r[4], aWN: r[3] }; });
  X.pwFit = function (id, V) { for (var i = 0; i < X.PW_FIT.length; i++) if (X.PW_FIT[i].id === id) return X.PW_FIT[i].a * Math.pow(V, X.PW_FIT[i].C); return NaN; };
  // typical takeoff wing loadings, published in N/m²
  X.WS_TYPICAL = [['sail', 'Sailplane', 295], ['home', 'Homebuilt', 530], ['ga1', 'General aviation, single engine', 815], ['ga2', 'General aviation, twin engine', 1245],
    ['tprop', 'Twin turboprop', 1910], ['trainer', 'Jet trainer', 2395], ['fighter', 'Jet fighter', 3355], ['jt', 'Jet transport or bomber', 5745]]
    .map(function (r) { return { id: r[0], label: r[1], nm2: r[2], ws: r[2] / G }; });

  global.MATCH = X;
})(typeof window !== 'undefined' ? window : this);
