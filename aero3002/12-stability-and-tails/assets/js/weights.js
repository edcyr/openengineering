/*!
 * weights.js — WEIGHTS: load factors, the approximate group weights, the statistical group-weight equations for
 * transport aircraft, the weight statement, calibration, the center of gravity, loading and wing placement, for
 * Module 11 of Conceptual Aircraft Design (Component Weights and Center of Gravity). Plain ES5; needs layout.js
 * (LAYOUT, Module 6) for the geometry of the four aircraft.
 *
 * Units: SI (kg, m, m², m³, m/s) in and out. The statistical equations are evaluated in their native units
 * (lb, ft, ft², in, kt, US gal) inside each function.
 *
 *   WEIGHTS.nLimit(W0)               limit maneuvering load factor, 14 CFR 25.337(b): 2.1 + 24 000/(W + 10 000), W in lb,
 *                                    not below 2.5 and not above 3.8
 *   WEIGHTS.nUlt(W0)                 ultimate load factor from the maneuvering limit alone, 1.5 × nLimit (14 CFR 25.303)
 *   WEIGHTS.gustN(g, W, S, A, lam, sweepC4)  the largest gust load factor over altitude (Module 10's method: Pratt's
 *                                    formula with the derived gust velocities, V_B of 25.335(d), V_C/M_C, V_D/M_D);
 *                                    g = {VC (m/s EAS), MC, MD, CLmax}
 *   WEIGHTS.nDesign(sp, W0, S, A, lam, sweepC4)  the design limit load factor: the larger of nLimit and the gust's
 *                                    (the gust only for an aircraft with sp.gust); the weight equations take 1.5 times it
 *   WEIGHTS.APPROX, approx(cls, a)   approximate group weights by class (values recalled, to be checked against the text)
 *   WEIGHTS.eq.*                     the statistical equations, one function per group (see each)
 *   WEIGHTS.ga.*                     the general-aviation wing, tail and fuselage equations, for comparison
 *   WEIGHTS.COMPOSITE                factors for advanced composites, low and high (Raymer Table 15.4)
 *   WEIGHTS.PRESETS, preset(id)      the business jet (this course's) and three illustrative aircraft
 *   WEIGHTS.inputs(sp, o)            every equation input for an aircraft, with o.W0 to size it (wing, tails, engines and
 *                                    fuel scale with W0 at a fixed wing loading and thrust-to-weight ratio)
 *   WEIGHTS.statement(sp, o)         {rows: [{id, name, group, eq, kg, x, wing}], groups, We, Wstat, k, We3, ...}
 *   WEIGHTS.cg(S, dx)                empty-weight CG {x, pct, macLE} with the wing group moved aft by dx
 *   WEIGHTS.loading(S, o)            CG excursion while loading {pts: [{label, W, x, pct}], fwd, aft, ...}
 *   WEIGHTS.wingShift(S, target)     the wing shift that centers the loading range on target (% MAC)
 *   WEIGHTS.size(sp, k, o)           W0 from W0 = W_crew + W_payload + ff·W0 + k·W_e(W0) with the equations
 *
 * Sources: the statistical equations are Raymer's (Aircraft Design: A Conceptual Approach, Section 15.3), as
 * implemented in the open-source AeroSandbox library (MIT license) and cross-checked against SUAVE's; the
 * general-aviation forms also against Iowa State's open aircraft-design notes. Load factors: 14 CFR 25.303 and 25.337.
 * Component CG rules: SUAVE (after Stanford's AA241 notes) where it has one, otherwise stated as judgment.
 */
(function (global) {
  'use strict';
  var X = {};
  var LB = 0.45359237, FT = 0.3048, IN = 0.0254, KT = 1852 / 3600, GAL = 0.003785411784, G0 = 9.80665, D2R = Math.PI / 180;
  X.LB = LB; X.FT = FT; X.IN = IN; X.KT = KT; X.GAL = GAL; X.g = G0;
  var lb = function (kg) { return kg / LB; }, ft = function (m) { return m / FT; }, ft2 = function (m2) { return m2 / (FT * FT); };

  /* ---------- Load factors ---------- */
  X.nLimitRaw = function (W0) { var W = lb(W0); return 2.1 + 24000 / (W + 10000); };
  X.nLimit = function (W0) { return Math.min(3.8, Math.max(2.5, X.nLimitRaw(W0))); };
  X.nUlt = function (W0) { return 1.5 * X.nLimit(W0); };
  // gust load factors as in Module 10 (loads.js): ISA, the wing's lift-curve slope at the flight Mach number (half-chord
  // sweep, eta 0.95), K_g = 0.88 mu/(5.3 + mu), the derived gust velocities 66/50/25 ft/s at V_B/V_C/V_D to 20 000 ft
  // falling to 38/25/12.5 at 50 000 ft, U_ref of 25.341 for V_B; the largest over altitudes from sea level to 13.7 km
  function isa(h) {
    var T = h <= 11000 ? 288.15 - 0.0065 * h : 216.65, R = 287.053;
    var p = h <= 11000 ? 101325 * Math.pow(T / 288.15, G0 / (0.0065 * R)) : 22632.06 * Math.exp(-G0 * (h - 11000) / (R * T));
    return { rho: p / (R * T), a: Math.sqrt(1.4 * R * T) };
  }
  var GUSTH = (function () { var h = [], z; for (z = 0; z <= 13716; z += 250) h.push(z); h.push(6096); return h; })();
  X.gustN = function (g, W, S, A, lam, sweepC4) {
    var b = Math.sqrt(A * S), cbar = S / b, ws = W / S, RHO0 = 1.225;
    var tq = Math.tan(sweepC4 * D2R) - 4 / A * 0.25 * (1 - lam) / (1 + lam), t2 = tq * tq;
    function cla(M) { var b2 = 1 - M * M; return 2 * Math.PI * A / (2 + Math.sqrt(4 + A * A * b2 / 0.9025 * (1 + t2 / b2))); }
    function ude(ft, u0, u1) { return (ft <= 20000 ? u0 : ft >= 50000 ? u1 : u0 + (u1 - u0) * (ft - 20000) / 30000) * FT; }
    function dn(s, Ve, U) { var M = Math.min(0.95, Ve / Math.sqrt(s.rho / RHO0) / s.a), a = cla(M), mu = 2 * ws / (s.rho * cbar * a); return 0.88 * mu / (5.3 + mu) * RHO0 * U * Ve * a / (2 * ws * G0); }
    var VS1 = Math.sqrt(2 * ws * G0 / (RHO0 * g.CLmax)), best = 0;
    GUSTH.forEach(function (h) {
      var s = isa(h), sq = Math.sqrt(s.rho / RHO0), ft = h / FT;
      var VC = Math.min(g.VC, g.MC * s.a * sq), VD = Math.min(g.VC / 0.8, g.MD * s.a * sq);
      var uref = (ft <= 15000 ? 56 - 12 * ft / 15000 : 44 - (44 - 20.86) * (ft - 15000) / 45000) * FT;
      var VB = Math.min(VC, VS1 * Math.sqrt(1 + dn(s, VC, uref)));
      best = Math.max(best, 1 + dn(s, VB, ude(ft, 66, 38)), 1 + dn(s, VC, ude(ft, 50, 25)), 1 + dn(s, VD, ude(ft, 25, 12.5)));
    });
    return best;
  };
  X.nDesign = function (sp, W0, S, A, lam, sweepC4) {
    var n = X.nLimit(W0);
    return sp && sp.gust ? Math.max(n, X.gustN(sp.gust, W0, S, A, lam, sweepC4)) : n;
  };
  X.stallSpeed = function (W, S, clmax, rho) { return Math.sqrt(2 * W * G0 / ((rho || 1.225) * S * clmax)); };

  /* ---------- Approximate group weights (per exposed or wetted area, fractions of W0) ---------- */
  // wing, tails: lb per ft² of exposed planform; fuselage: lb per ft² of wetted area; gear and "all else": × W0;
  // installed engine: × dry engine weight. RECALLED values: check against the text before relying on them.
  X.APPROX = {
    fighter: { label: 'Fighter', wing: 9, ht: 4, vt: 5.3, fus: 4.8, gear: 0.033, eng: 1.3, rest: 0.17 },
    transport: { label: 'Transport and bomber', wing: 10, ht: 5.5, vt: 5.5, fus: 5, gear: 0.043, eng: 1.3, rest: 0.17 },
    ga: { label: 'General aviation', wing: 2.5, ht: 2, vt: 2, fus: 1.4, gear: 0.057, eng: 1.4, rest: 0.1 }
  };
  X.PSF = LB / (FT * FT);                                       // 1 lb/ft² in kg/m² (4.882)
  // a = {W0, Sexp, Sht, Svt, Swf, Weng (all engines, dry)}
  X.approx = function (cls, a) {
    var c = X.APPROX[cls], k = X.PSF;
    var rows = [
      { id: 'wing', name: 'Wing', kg: c.wing * k * a.Sexp }, { id: 'ht', name: 'Horizontal tail', kg: c.ht * k * a.Sht },
      { id: 'vt', name: 'Vertical tail', kg: c.vt * k * a.Svt }, { id: 'fus', name: 'Fuselage', kg: c.fus * k * a.Swf },
      { id: 'gear', name: 'Landing gear', kg: c.gear * a.W0 }, { id: 'eng', name: 'Installed engines', kg: c.eng * a.Weng },
      { id: 'rest', name: 'All else empty', kg: c.rest * a.W0 }
    ];
    var tot = rows.reduce(function (s, r) { return s + r.kg; }, 0);
    return { rows: rows, We: tot, frac: tot / a.W0 };
  };

  /* ---------- The statistical group-weight equations (transport aircraft) ---------- */
  // Each takes SI inputs and returns kg; the comments give the native form (lb, ft, ft², in, kt, gal).
  var E = X.eq = {};
  // Wwing = 0.0051 (Wdg Nz)^0.557 Sw^0.649 A^0.5 (t/c)^-0.4 (1+λ)^0.1 (cos Λ)^-1 Scsw^0.1
  E.wing = function (p) { return LB * 0.0051 * Math.pow(lb(p.Wdg) * p.Nz, 0.557) * Math.pow(ft2(p.S), 0.649) * Math.sqrt(p.A) * Math.pow(p.tc, -0.4) * Math.pow(1 + p.lam, 0.1) / Math.cos(p.sweep * D2R) * Math.pow(ft2(p.Scsw), 0.1); };
  // Wht = 0.0379 Kuht (1 + Fw/Bh)^-0.25 Wdg^0.639 Nz^0.10 Sht^0.75 Lt^-1 Ky^0.704 (cos Λht)^-1 Ah^0.166 (1 + Se/Sht)^0.1
  E.ht = function (p) { return LB * 0.0379 * p.Kuht * Math.pow(1 + p.Fw / p.Bh, -0.25) * Math.pow(lb(p.Wdg), 0.639) * Math.pow(p.Nz, 0.10) * Math.pow(ft2(p.Sht), 0.75) / ft(p.Lt) * Math.pow(ft(p.Ky), 0.704) / Math.cos(p.sweep * D2R) * Math.pow(p.Ah, 0.166) * Math.pow(1 + p.Se / p.Sht, 0.1); };
  // Wvt = 0.0026 (1 + Ht/Hv)^0.225 Wdg^0.556 Nz^0.536 Lt^-0.5 Svt^0.5 Kz^0.875 (cos Λvt)^-1 Av^0.35 (t/c)^-0.5
  E.vt = function (p) { return LB * 0.0026 * Math.pow(1 + p.HtHv, 0.225) * Math.pow(lb(p.Wdg), 0.556) * Math.pow(p.Nz, 0.536) / Math.sqrt(ft(p.Lt)) * Math.sqrt(ft2(p.Svt)) * Math.pow(ft(p.Kz), 0.875) / Math.cos(p.sweep * D2R) * Math.pow(p.Av, 0.35) / Math.sqrt(p.tc); };
  // Wfus = 0.3280 Kdoor Klg (Wdg Nz)^0.5 L^0.25 Sf^0.302 (1 + Kws)^0.04 (L/D)^0.10, Kws = 0.75 [(1+2λ)/(1+λ)] Bw tan Λ / L
  E.Kws = function (lam, b, sweep, L) { return 0.75 * (1 + 2 * lam) / (1 + lam) * b * Math.tan(sweep * D2R) / L; };
  E.fuselage = function (p) { return LB * 0.3280 * p.Kdoor * p.Klg * Math.sqrt(lb(p.Wdg) * p.Nz) * Math.pow(ft(p.L), 0.25) * Math.pow(ft2(p.Sf), 0.302) * Math.pow(1 + p.Kws, 0.04) * Math.pow(p.L / p.D, 0.10); };
  // Wmain = 0.0106 Kmp Wl^0.888 Nl^0.25 Lm^0.4 Nmw^0.321 Nmss^-0.5 Vstall^0.1 (Lm in inches, Vstall in knots)
  E.mainGear = function (p) { return LB * 0.0106 * p.Kmp * Math.pow(lb(p.Wl), 0.888) * Math.pow(p.Nl, 0.25) * Math.pow(p.Lm / IN, 0.4) * Math.pow(p.Nmw, 0.321) / Math.sqrt(p.Nmss) * Math.pow(p.Vs / KT, 0.1); };
  // Wnose = 0.032 Knp Wl^0.646 Nl^0.2 Ln^0.5 Nnw^0.45 (Ln in inches)
  E.noseGear = function (p) { return LB * 0.032 * p.Knp * Math.pow(lb(p.Wl), 0.646) * Math.pow(p.Nl, 0.2) * Math.sqrt(p.Ln / IN) * Math.pow(p.Nnw, 0.45); };
  // Wnacelle group = 0.6724 Kng Nlt^0.10 Nw^0.294 Nz^0.119 Wec^0.611 Nen^0.984 Sn^0.224, Wec = 2.331 Wen^0.901 Kp Ktr
  E.Wec = function (p) { return LB * 2.331 * Math.pow(lb(p.Wen), 0.901) * p.Kp * p.Ktr; };
  E.nacelle = function (p) { return LB * 0.6724 * p.Kng * Math.pow(ft(p.Nlt), 0.10) * Math.pow(ft(p.Nw), 0.294) * Math.pow(p.Nz, 0.119) * Math.pow(lb(E.Wec(p)), 0.611) * Math.pow(p.Nen, 0.984) * Math.pow(ft2(p.Sn), 0.224); };
  // Wengine controls = 5.0 Nen + 0.80 Lec (Lec: engine front to cockpit, total of all engines, ft)
  E.engineControls = function (p) { return LB * (5.0 * p.Nen + 0.80 * ft(p.Lec)); };
  // Wstarter (pneumatic) = 49.19 (Nen Wen / 1000)^0.541
  E.starter = function (p) { return LB * 49.19 * Math.pow(p.Nen * lb(p.Wen) / 1000, 0.541); };
  // Wfuel system = 2.405 Vt^0.606 (1 + Vi/Vt)^-1 (1 + Vp/Vt) Nt^0.5 (gal; Vi integral, Vp protected tanks)
  E.fuelSystem = function (p) { return LB * 2.405 * Math.pow(p.Vt / GAL, 0.606) / (1 + p.fi) * (1 + p.fp) * Math.sqrt(p.Nt); };
  // Wflight controls = 145.9 Nf^0.554 (1 + Nm/Nf)^-1 Scs^0.20 (Iy × 10^-6)^0.07 (Iy in lb ft²)
  E.flightControls = function (p) { return LB * 145.9 * Math.pow(p.Nf, 0.554) / (1 + p.Nm / p.Nf) * Math.pow(ft2(p.Scs), 0.20) * Math.pow(p.Iy / (LB * FT * FT) * 1e-6, 0.07); };
  // WAPU installed = 2.2 WAPU uninstalled
  E.apu = function (p) { return 2.2 * p.Wapu; };
  // Winstruments = 4.509 Kr Ktp Nc^0.541 Nen (Lf + Bw)^0.5
  E.instruments = function (p) { return LB * 4.509 * p.Kr * p.Ktp * Math.pow(p.Nc, 0.541) * p.Nen * Math.sqrt(ft(p.Lf + p.Bw)); };
  // Whydraulics = 0.2673 Nf (Lf + Bw)^0.937
  E.hydraulics = function (p) { return LB * 0.2673 * p.Nf * Math.pow(ft(p.Lf + p.Bw), 0.937); };
  // Welectrical = 7.291 Rkva^0.782 La^0.346 Ngen^0.10
  E.electrical = function (p) { return LB * 7.291 * Math.pow(p.Rkva, 0.782) * Math.pow(ft(p.La), 0.346) * Math.pow(p.Ngen, 0.10); };
  // Wavionics = 1.73 Wuav^0.983
  E.avionics = function (p) { return LB * 1.73 * Math.pow(lb(p.Wuav), 0.983); };
  // Wfurnishings = 0.0577 Nc^0.1 Wc^0.393 Sf^0.75 (seats and lavatories are added from the miscellaneous weights)
  E.furnishings = function (p) { return LB * 0.0577 * Math.pow(p.Nc, 0.1) * Math.pow(lb(p.Wc), 0.393) * Math.pow(ft2(p.Sf), 0.75); };
  // miscellaneous weights: seats (passenger 32 lb, flight deck 60 lb); lavatories 0.31 (short haul), 1.11 (long haul),
  // 3.90 (business jet) × Np^1.33 lb
  X.SEAT = { pax: 32 * LB, crew: 60 * LB };
  X.LAV = { none: 0, short: 0.31, long: 1.11, bizjet: 3.90 };
  E.seats = function (p) { return p.Npax * X.SEAT.pax + p.Nfd * X.SEAT.crew + p.Natt * X.SEAT.pax; };
  E.lavatories = function (p) { return LB * X.LAV[p.lav] * Math.pow(p.Npax, 1.33); };
  // Wair conditioning = 62.36 Np^0.25 (Vpr/1000)^0.604 Wuav^0.10 (Vpr in ft³)
  E.airConditioning = function (p) { return LB * 62.36 * Math.pow(p.Np, 0.25) * Math.pow(p.Vpr / Math.pow(FT, 3) / 1000, 0.604) * Math.pow(lb(p.Wuav), 0.10); };
  // Wanti-ice = 0.002 Wdg; Whandling gear = 3.0 × 10^-4 Wdg
  E.antiIce = function (p) { return 0.002 * p.Wdg; };
  E.handling = function (p) { return 3e-4 * p.Wdg; };

  /* ---------- General-aviation forms, for comparison (q in lb/ft², Wfw fuel in the wing) ---------- */
  var GA = X.ga = {};
  GA.wing = function (p) { var cs = Math.cos(p.sweep * D2R); return LB * 0.036 * Math.pow(ft2(p.S), 0.758) * Math.pow(lb(p.Wfw), 0.0035) * Math.pow(p.A / (cs * cs), 0.6) * Math.pow(p.q / (LB * G0 / (FT * FT)), 0.006) * Math.pow(p.lam, 0.04) * Math.pow(100 * p.tc / cs, -0.3) * Math.pow(p.Nz * lb(p.Wdg), 0.49); };

  /* ---------- Advanced composites (Raymer Table 15.4: multiply the metal estimate) ---------- */
  X.COMPOSITE = { wing: [0.85, 0.90], tails: [0.83, 0.88], fuselage: [0.90, 0.95], gear: [0.95, 1.0], induction: [0.85, 0.90] };

  /* ---------- The aircraft ---------- */
  // layout: a LAYOUT preset; nac: nacelle {D, l} replacing the layout's placeholder; pay: passengers, mass each with
  // baggage, the share of it carried as baggage, the baggage holds {x: share of l_F, share}; crew: flight deck and cabin
  // crew (kg each); land: landing weight / W0; clL: landing C_Lmax; gear: positions (m), lengths (m, extended), wheels;
  // eng: dry kg each and the K factors; fuel: tanks, integral share; ctl: control functions, surfaces as chord shares;
  // sys: electrical rating (kV·A), uninstalled avionics (kg), APU uninstalled (kg), pack position.
  X.PRESETS = [
    { id: 'bizjet', label: 'Business jet (this course)', layout: 'bizjet', nac: { D: 0.7971, l: 1.7702 }, W0: 6943, ff: 0.2867,
      gust: { VC: 270 * 0.514444, MC: 0.80, MD: 0.87, CLmax: 1.305 },     // Module 10's design speeds: gusts set N_z
      pay: { n: 8, m: 100, bag: 0.2, holds: [{ x: 'tail', share: 1 }] }, crew: { fd: 2, att: 0, m: 90 }, land: 0.9, clL: 2.1, Ngear: 3,
      gear: { xn: 1.80, xm: 7.65, Lm: 0.615, Ln: 0.686, Nmw: 2, Nmss: 2, Nnw: 1, Kmp: 1, Knp: 1 },
      eng: { W: 200.8, Kng: 1.017, Kp: 1, Ktr: 1, Ktp: 1, Kr: 1 }, fuel: { Nt: 3, fi: 1, fp: 0 },
      ctl: { Nf: 5, Nm: 3, flap: 0.30, flapSpan: 0.675, ail: [0.70, 0.95, 0.25], elev: 0.30, rud: 0.30, Kuht: 1 },
      fus: { Kdoor: 1.0, Klg: 1.0 }, sys: { Rkva: 16.8, Wuav: 136, apu: 0, pack: 'tail' }, Wc: 160, lav: 'bizjet' },
    { id: 'narrow', label: 'Narrow-body airliner, 150 seats (illustrative)', layout: 'narrow', nac: null, W0: 73500, ff: 0.20,
      pay: { n: 150, m: 100, bag: 0.2, holds: [{ x: 0.30, share: 0.45 }, { x: 0.66, share: 0.55 }] }, crew: { fd: 2, att: 4, m: 90 }, land: 0.88, clL: 2.8, Ngear: 3,
      gear: { xn: 4.6, xm: 17.3, Lm: 2.0, Ln: 1.8, Nmw: 4, Nmss: 2, Nnw: 2, Kmp: 1, Knp: 1 },
      eng: { W: 2454.8, Kng: 1.017, Kp: 1, Ktr: 1.18, Ktp: 1, Kr: 1 }, fuel: { Nt: 3, fi: 1, fp: 0 },
      ctl: { Nf: 7, Nm: 0, flap: 0.30, flapSpan: 0.75, ail: [0.78, 0.95, 0.22], elev: 0.30, rud: 0.30, Kuht: 1 },
      fus: { Kdoor: 1.12, Klg: 1.0 }, sys: { Rkva: 60, Wuav: 635, apu: 140, pack: 'wing' }, Wc: 3000, lav: 'short' },
    { id: 'tprop', label: 'Regional turboprop, 72 seats (illustrative)', layout: 'tprop', nac: null, W0: 23000, ff: 0.12,
      pay: { n: 72, m: 100, bag: 0.2, holds: [{ x: 0.17, share: 0.5 }, { x: 'tail', share: 0.5 }] }, crew: { fd: 2, att: 2, m: 90 }, land: 0.97, clL: 2.6, Ngear: 3,
      gear: { xn: 2.6, xm: 12.0, Lm: 1.0, Ln: 0.9, Nmw: 4, Nmss: 2, Nnw: 2, Kmp: 1, Knp: 1 },
      eng: { W: 481.7, Kng: 1.0, Kp: 1.4, Ktr: 1, Ktp: 0.793, Kr: 1 }, fuel: { Nt: 2, fi: 1, fp: 0 },
      ctl: { Nf: 6, Nm: 3, flap: 0.30, flapSpan: 0.70, ail: [0.72, 0.97, 0.25], elev: 0.30, rud: 0.30, Kuht: 1 },
      fus: { Kdoor: 1.06, Klg: 1.12 }, sys: { Rkva: 40, Wuav: 300, apu: 0, pack: 'wing' }, Wc: 1000, lav: 'short' },
    { id: 'commuter', label: 'Commuter turboprop, 18 seats (illustrative)', layout: 'commuter', nac: null, W0: 7700, ff: 0.15,
      pay: { n: 18, m: 100, bag: 0.2, holds: [{ x: 'tail', share: 1 }] }, crew: { fd: 2, att: 0, m: 90 }, land: 0.98, clL: 2.3, Ngear: 3,
      gear: { xn: 1.5, xm: 8.0, Lm: 1.1, Ln: 1.0, Nmw: 4, Nmss: 2, Nnw: 1, Kmp: 1, Knp: 1 },
      eng: { W: 230, Kng: 1.0, Kp: 1.4, Ktr: 1, Ktp: 0.793, Kr: 1 }, fuel: { Nt: 2, fi: 1, fp: 0 },
      ctl: { Nf: 5, Nm: 3, flap: 0.30, flapSpan: 0.70, ail: [0.72, 0.97, 0.25], elev: 0.30, rud: 0.30, Kuht: 1 },
      fus: { Kdoor: 1.06, Klg: 1.0 }, sys: { Rkva: 20, Wuav: 100, apu: 0, pack: 'wing' }, Wc: 400, lav: 'none' }
  ];
  X.preset = function (id) { for (var i = 0; i < X.PRESETS.length; i++) if (X.PRESETS[i].id === id) return JSON.parse(JSON.stringify(X.PRESETS[i])); return null; };
  X.payload = function (sp) { return sp.pay.n * sp.pay.m; };
  X.crewMass = function (sp) { return (sp.crew.fd + sp.crew.att) * sp.crew.m; };
  X.We3 = function (sp) { return sp.W0 * (1 - sp.ff) - X.payload(sp) - X.crewMass(sp); };   // the empty weight Module 3's sizing leaves

  // the layout, with the nacelles replaced; cached per preset id
  var LAYCACHE = {};
  X.layout = function (sp) {
    var key = sp.layout + (sp.nac ? ':' + sp.nac.D + ':' + sp.nac.l : '');
    if (LAYCACHE[key]) return LAYCACHE[key];
    var LA = global.LAYOUT, ls = LA.preset(sp.layout);
    if (sp.nac) { ls.eng.D = sp.nac.D; ls.eng.l = sp.nac.l; }
    var R = LA.evaluate(ls); R.plan = LA.cabinPlan(ls.cabin);
    LAYCACHE[key] = R; return R;
  };

  /* ---------- Every input of the equations ---------- */
  // o.W0 sizes the aircraft: the wing scales with W0 at the same wing loading, the tails with it at the same volume
  // coefficients and arms, the engines (rubber, W ∝ T^1.1, l ∝ T^0.4, D ∝ T^0.5) and the fuel with W0. The fuselage is kept.
  X.inputs = function (sp, o) {
    o = o || {};
    var L = X.layout(sp), G = L.G, w = G.wing, pf = w.pf, ls = L.sp, e = G.eng;
    var W0 = o.W0 || sp.W0, s = W0 / sp.W0, r = G.r;
    var S = pf.S * s, b = pf.b * Math.sqrt(s), cr = pf.cr * Math.sqrt(s), mac = pf.mac * Math.sqrt(s), lam = pf.lam;
    function chord(y) { return cr * (1 - (1 - lam) * 2 * y / b); }
    function strip(y0, y1, f) { return 2 * f * (chord(y0) + chord(y1)) / 2 * Math.max(0, y1 - y0); }
    var c = sp.ctl, Sflap = strip(r, c.flapSpan * b / 2, c.flap), Sail = strip(c.ail[0] * b / 2, c.ail[1] * b / 2, c.ail[2]);
    var ht = G.ht, vt = G.vt, Sht = L.SHT * Math.pow(s, 1.5), Svt = L.SVT * Math.pow(s, 1.5);
    var xm = ht.xLE + 0.5 * ht.pf.cr, Fw = ht.tee ? 0 : 2 * G.halfWidth(xm);
    var nEng = ls.eng.n || 2, eS = Math.pow(s, 1 / 1.1), nl = (sp.nac ? sp.nac.l : e.l) * Math.pow(eS, 0.4), nw = (sp.nac ? sp.nac.D : e.D) * Math.pow(eS, 0.5);
    var Wen = sp.eng.W * s;                                       // engine weight ∝ thrust^1.1, thrust ∝ W0
    var Wdg = W0, Nz = 1.5 * X.nDesign(sp, W0, S, pf.A, lam, ls.wing.sweep), Wl = sp.land * W0, Lt = L.LHT, Lv = L.LVT;
    var xCk = 0.6 * G.cabin0, xAv = 0.4 * G.lNose, xe = e.x != null ? e.x : 0.3 * G.lF;
    var yE = e.kind === 'wing' ? e.y : 0, xFront = xe - nl / 2;
    var dI = L.dI, Vpr = Math.PI / 4 * dI * dI * (G.cabin1 - 0.5 * G.lNose);
    var P = {
      W0: W0, s: s, Wdg: Wdg, Nz: Nz, nLim: X.nLimit(W0), nDes: Nz / 1.5, Wl: Wl, Nl: 1.5 * sp.Ngear,
      wing: { Wdg: Wdg, Nz: Nz, S: S, A: pf.A, tc: w.tc, lam: lam, sweep: ls.wing.sweep, Scsw: Sflap + Sail, b: b, mac: mac },
      Sflap: Sflap, Sail: Sail,
      ht: { Wdg: Wdg, Nz: Nz, Kuht: c.Kuht, Fw: Fw, Bh: ht.pf.b * Math.pow(s, 0.75), Sht: Sht, Lt: Lt, Ky: 0.3 * Lt, sweep: ls.tail.hSweep, Ah: ls.tail.hA, Se: c.elev * Sht },
      vt: { Wdg: Wdg, Nz: Nz, HtHv: ht.tee ? 1 : 0, Lt: Lv, Svt: Svt, Kz: Lv, sweep: ls.tail.vSweep, Av: ls.tail.vA, tc: ls.tail.tc },
      fus: { Wdg: Wdg, Nz: Nz, Kdoor: sp.fus.Kdoor, Klg: sp.fus.Klg, L: G.lF, Sf: L.swet.fus, D: L.d, Kws: E.Kws(lam, b, ls.wing.sweep, G.lF) },
      main: { Kmp: sp.gear.Kmp, Wl: Wl, Nl: 1.5 * sp.Ngear, Lm: sp.gear.Lm, Nmw: sp.gear.Nmw, Nmss: sp.gear.Nmss, Vs: X.stallSpeed(Wl, S, sp.clL) },
      nose: { Knp: sp.gear.Knp, Wl: Wl, Nl: 1.5 * sp.Ngear, Ln: sp.gear.Ln, Nnw: sp.gear.Nnw },
      nac: { Kng: sp.eng.Kng, Nlt: nl, Nw: nw, Nz: Nz, Wen: Wen, Kp: sp.eng.Kp, Ktr: sp.eng.Ktr, Nen: nEng, Sn: Math.PI * nw * nl },
      ec: { Nen: nEng, Lec: nEng * (Math.abs(xFront - xCk) + yE) },
      st: { Nen: nEng, Wen: Wen },
      fs: { Vt: sp.ff * W0 / (ls.rhoF || 800), fi: sp.fuel.fi, fp: sp.fuel.fp, Nt: sp.fuel.Nt },
      fc: { Nf: c.Nf, Nm: c.Nm, Scs: Sflap + Sail + c.elev * Sht + c.rud * Svt, Iy: Wdg * Math.pow(0.3 * Lt, 2) },
      apu: { Wapu: sp.sys.apu },
      ins: { Kr: sp.eng.Kr, Ktp: sp.eng.Ktp, Nc: sp.crew.fd, Nen: nEng, Lf: G.lF, Bw: b },
      hyd: { Nf: c.Nf, Lf: G.lF, Bw: b },
      el: { Rkva: sp.sys.Rkva, La: Math.abs(xe - xAv) + Math.abs(xCk - xAv) + yE, Ngen: nEng },
      av: { Wuav: sp.sys.Wuav },
      fur: { Nc: sp.crew.fd, Wc: sp.Wc, Sf: L.swet.fus },
      seats: { Npax: sp.pay.n, Nfd: sp.crew.fd, Natt: sp.crew.att },
      lav: { lav: sp.lav, Npax: sp.pay.n },
      ac: { Np: sp.pay.n + sp.crew.fd + sp.crew.att, Vpr: Vpr, Wuav: sp.sys.Wuav },
      ai: { Wdg: Wdg }, hg: { Wdg: Wdg },
      Weng: nEng * Wen, nEng: nEng, xCk: xCk, xAv: xAv, xe: xe, mac: mac, L: L, G: G
    };
    return P;
  };

  /* ---------- Component CG positions (m aft of the nose) ---------- */
  // wing 30% MAC; tails 30% chord at 35% of the span; fuselage 45% of its length; engines and nacelles at the nacelle
  // center; fuel system, fuel and anti-icing at the wing's CG, flight controls 0.1 MAC behind it; hydraulics
  // 0.75 x_wing + 0.25 (0.95 l_F); electrical 0.75 (l_F/2) + 0.25 x_engine; avionics 40% of the nose length; APU
  // 90% of l_F; handling gear 51% of l_F (SUAVE's rules); instruments and crew in the cockpit, engine controls halfway
  // to the engines, furnishings at the cabin's middle, seats and lavatories where the layout puts them, the
  // air-conditioning packs in the tail cone (rear engines) or under the wing (judgment).
  X.positions = function (sp, P) {
    var L = P.L, G = P.G, w = G.wing, mac = w.pf.mac, macLE = w.xAc - 0.25 * mac, xw = macLE + 0.30 * mac;
    function surf(xle, sle, cr, lam, half) { var y = 0.35 * half, c = cr * (1 - (1 - lam) * y / half); return xle + y * Math.tan(sle * D2R) + 0.30 * c; }
    var ht = G.ht, vt = G.vt, plan = L.plan, c0 = G.cabin0;
    var xht = surf(ht.xLE, ht.sweepLE, ht.pf.cr, ht.pf.lam, ht.pf.b / 2), xvt = surf(vt.xLE, vt.sweepLE, vt.cr, vt.ct / vt.cr, vt.h);
    var rowX = plan.rows.map(function (x) { return c0 + x + 0.45; }), perRow = L.sp.cabin.benches.reduce(function (a, k) { return a + k; }, 0);
    var lavs = plan.items.filter(function (it) { return it.kind === 'lav'; }).map(function (it) { return c0 + (it.x0 + it.x1) / 2; });
    var seatAvg = rowX.reduce(function (a, x) { return a + x; }, 0) / rowX.length;
    var xAtt = c0 + 0.3;
    var nSeat = sp.pay.n * X.SEAT.pax + sp.crew.fd * X.SEAT.crew + sp.crew.att * X.SEAT.pax;
    var xSeats = (sp.pay.n * X.SEAT.pax * seatAvg + sp.crew.fd * X.SEAT.crew * (0.72 * c0) + sp.crew.att * X.SEAT.pax * xAtt) / nSeat;
    var xTail = G.cabin1 + 0.5;
    return {
      macLE: macLE, mac: mac, xw: xw, rowX: rowX, perRow: perRow, xCrew: 0.72 * c0, xAtt: xAtt, xTailBay: xTail,
      wing: xw, ht: xht, vt: xvt, fus: 0.45 * G.lF, main: sp.gear.xm, nose: sp.gear.xn,
      eng: P.xe, nac: P.xe, ec: 0.5 * (P.xCk + P.xe), st: P.xe, fs: xw,
      fc: xw + 0.1 * mac, apu: 0.9 * G.lF, ins: P.xCk, hyd: 0.75 * xw + 0.25 * 0.95 * G.lF, el: 0.75 * 0.5 * G.lF + 0.25 * P.xe,
      av: P.xAv, fur: 0.5 * (G.cabin0 + G.cabin1), seats: xSeats, lav: lavs.length ? lavs.reduce(function (a, x) { return a + x; }, 0) / lavs.length : 0.5 * (G.cabin0 + G.cabin1),
      ac: sp.sys.pack === 'tail' ? G.cabin1 + 0.75 : xw, ai: xw, hg: 0.51 * G.lF,
      holds: sp.pay.holds.map(function (h) { return { x: h.x === 'tail' ? xTail : h.x * G.lF, share: h.share }; })
    };
  };

  /* ---------- The weight statement ---------- */
  X.GROUPS = [{ id: 'struct', name: 'Structure' }, { id: 'prop', name: 'Propulsion' }, { id: 'equip', name: 'Equipment' }];
  // rows: id, name, group, eq (the equation's key), wing (moves with the wing), cat (catalog weight, not calibrated)
  var ROWS = [
    ['wing', 'Wing', 'struct', 'wing', 1], ['ht', 'Horizontal tail', 'struct', 'ht'], ['vt', 'Vertical tail', 'struct', 'vt'],
    ['fus', 'Fuselage', 'struct', 'fuselage'], ['main', 'Main gear', 'struct', 'mainGear', 1], ['nose', 'Nose gear', 'struct', 'noseGear'],
    ['eng', 'Engines (dry)', 'prop', null], ['nac', 'Nacelle group', 'prop', 'nacelle'], ['ec', 'Engine controls', 'prop', 'engineControls'],
    ['st', 'Starter', 'prop', 'starter'], ['fs', 'Fuel system', 'prop', 'fuelSystem', 1],
    ['fc', 'Flight controls', 'equip', 'flightControls', 1], ['apu', 'APU', 'equip', 'apu'], ['ins', 'Instruments', 'equip', 'instruments'],
    ['hyd', 'Hydraulics', 'equip', 'hydraulics'], ['el', 'Electrical', 'equip', 'electrical'], ['av', 'Avionics', 'equip', 'avionics'],
    ['fur', 'Furnishings', 'equip', 'furnishings'], ['seats', 'Seats', 'equip', 'seats'], ['lav', 'Lavatories', 'equip', 'lavatories'],
    ['ac', 'Air conditioning', 'equip', 'airConditioning'], ['ai', 'Anti-icing', 'equip', 'antiIce', 1], ['hg', 'Handling gear', 'equip', 'handling']
  ];
  X.ROWS = ROWS.map(function (r) { return { id: r[0], name: r[1], group: r[2], eq: r[3], wing: !!r[4] }; });
  var PKEY = { wing: 'wing', ht: 'ht', vt: 'vt', fus: 'fus', main: 'main', nose: 'nose', nac: 'nac', ec: 'ec', st: 'st', fs: 'fs', fc: 'fc', apu: 'apu', ins: 'ins', hyd: 'hyd', el: 'el', av: 'av', fur: 'fur', seats: 'seats', lav: 'lav', ac: 'ac', ai: 'ai', hg: 'hg' };
  // o: {W0 (size it), k: number | 'm3' (calibrate the equations to Module 3's empty weight; engines excluded), composite: share 0..1}
  X.statement = function (sp, o) {
    o = o || {};
    var P = X.inputs(sp, o), pos = X.positions(sp, P), rows = [];
    X.ROWS.forEach(function (r) {
      var kg = r.id === 'eng' ? P.Weng : E[r.eq](P[PKEY[r.id]]);
      rows.push({ id: r.id, name: r.name, group: r.group, wing: r.wing, cat: r.id === 'eng', raw: kg, x: pos[r.id] });
    });
    if (o.composite) {
      var f = function (lo, hi) { return 1 - o.composite * (1 - (lo + hi) / 2); }, C = X.COMPOSITE;
      rows.forEach(function (r) {
        var m = r.id === 'wing' ? f(C.wing[0], C.wing[1]) : r.id === 'ht' || r.id === 'vt' ? f(C.tails[0], C.tails[1]) : r.id === 'fus' || r.id === 'nac' ? f(C.fuselage[0], C.fuselage[1]) : r.id === 'main' || r.id === 'nose' ? f(C.gear[0], C.gear[1]) : 1;
        r.raw *= m;
      });
    }
    var Wstat = 0, Wcat = 0;
    rows.forEach(function (r) { if (r.cat) Wcat += r.raw; else Wstat += r.raw; });
    var k = o.k === 'm3' ? (X.We3(sp) - X.statement(sp, { W0: sp.W0, k: 1 }).Wcat) / X.statement(sp, { W0: sp.W0, k: 1 }).Wstat : (o.k == null ? 1 : o.k);
    rows.forEach(function (r) { r.kg = r.cat ? r.raw : k * r.raw; });
    var We = 0, groups = {};
    X.GROUPS.forEach(function (gr) { groups[gr.id] = 0; });
    rows.forEach(function (r) { We += r.kg; groups[r.group] += r.kg; });
    return { sp: sp, P: P, pos: pos, rows: rows, groups: groups, We: We, Wstat: Wstat, Wcat: Wcat, Wraw: Wstat + Wcat, k: k, We3: X.We3(sp), W0: P.W0,
      frac: We / P.W0, Wpay: X.payload(sp), Wcrew: X.crewMass(sp), Wfuel: sp.ff * P.W0 };
  };

  /* ---------- Center of gravity ---------- */
  X.pct = function (x, macLE, mac) { return 100 * (x - macLE) / mac; };
  // the empty CG with the wing group (wing, main gear, fuel system, flight controls, anti-icing) moved aft by dx
  X.cg = function (S, dx) {
    dx = dx || 0;
    var W = 0, M = 0;
    S.rows.forEach(function (r) { var x = r.x + (r.wing ? dx : 0); W += r.kg; M += r.kg * x; });
    var macLE = S.pos.macLE + dx, x = M / W;
    return { W: W, M: M, x: x, macLE: macLE, mac: S.pos.mac, pct: X.pct(x, macLE, S.pos.mac) };
  };
  // the CG excursion while loading: crew, passengers row by row (front to back, or back to front), baggage, fuel
  // o: {dx, order: 'f2b' | 'b2f', fuelFirst, pax (number aboard), fuel (share of full)}
  X.loading = function (S, o) {
    o = o || {};
    var dx = o.dx || 0, sp = S.sp, pos = S.pos, c = X.cg(S, dx), W = c.W, M = c.M, pts = [];
    var mac = pos.mac, macLE = pos.macLE + dx;
    function rec(label, kind) { pts.push({ label: label, kind: kind, W: W, x: M / W, pct: X.pct(M / W, macLE, mac) }); }
    rec('Empty', 'empty');
    var mc = sp.crew.m;
    W += sp.crew.fd * mc; M += sp.crew.fd * mc * pos.xCrew;
    if (sp.crew.att) { W += sp.crew.att * mc; M += sp.crew.att * mc * pos.xAtt; }
    rec('Crew', 'crew');
    var nPax = o.pax == null ? sp.pay.n : o.pax, mSeat = sp.pay.m * (1 - sp.pay.bag), mBag = sp.pay.m * sp.pay.bag;
    var fuelM = (o.fuel == null ? 1 : o.fuel) * S.Wfuel, xF = pos.xw + dx;
    function fuel() { W += fuelM; M += fuelM * xF; rec('Fuel', 'fuel'); }
    if (o.fuelFirst) fuel();
    var rows = pos.rowX.map(function (x, i) { return { x: x, i: i }; });
    if (o.order === 'b2f') rows.reverse();
    var left = nPax;
    rows.forEach(function (rw) {
      if (left <= 0) return;
      var n = Math.min(pos.perRow, left); left -= n;
      W += n * mSeat; M += n * mSeat * rw.x; rec('Row ' + (rw.i + 1), 'pax');
    });
    pos.holds.forEach(function (h) { var m = nPax * mBag * h.share; W += m; M += m * h.x; });
    rec('Baggage', 'bag');
    if (!o.fuelFirst) fuel();
    var p = pts.map(function (q) { return q.pct; });
    return { pts: pts, fwd: Math.min.apply(null, p), aft: Math.max.apply(null, p), dx: dx, macLE: macLE, mac: mac, W: W, x: M / W, pct: X.pct(M / W, macLE, mac) };
  };
  // the full excursion: both loading orders, fuel last and fuel first
  X.envelope = function (S, dx) {
    var cases = [{ order: 'f2b' }, { order: 'b2f' }, { order: 'f2b', fuelFirst: true }, { order: 'b2f', fuelFirst: true }];
    var runs = cases.map(function (c) { return X.loading(S, Object.assign({ dx: dx }, c)); });
    return { runs: runs, fwd: Math.min.apply(null, runs.map(function (r) { return r.fwd; })), aft: Math.max.apply(null, runs.map(function (r) { return r.aft; })) };
  };
  // the wing shift (m, aft positive) that centers the excursion on target % MAC
  X.wingShift = function (S, target) {
    var t = target == null ? 25 : target, lo = -3, hi = 3;
    for (var i = 0; i < 60; i++) { var mid = 0.5 * (lo + hi), en = X.envelope(S, mid); if (0.5 * (en.fwd + en.aft) > t) lo = mid; else hi = mid; }
    return 0.5 * (lo + hi);
  };

  /* ---------- Sizing with the equations ---------- */
  // W0 = W_crew + W_payload + ff W0 + k W_e(W0): fixed-point iteration from the preset's W0
  X.size = function (sp, k, o) {
    var W0 = sp.W0, hist = [], comp = o && o.composite || 0;
    for (var i = 0; i < 80; i++) {
      var S = X.statement(sp, { W0: W0, k: k, composite: comp }), Wn = X.payload(sp) + X.crewMass(sp) + sp.ff * W0 + S.We;
      hist.push({ W0: W0, We: S.We, next: Wn });
      if (Math.abs(Wn - W0) < 0.01) { W0 = Wn; break; }
      W0 = W0 + 0.7 * (Wn - W0);
    }
    var F = X.statement(sp, { W0: W0, k: k, composite: comp });
    return { W0: W0, We: F.We, frac: F.We / W0, hist: hist };
  };

  /* ---------- Drawing ---------- */
  X.GROUP_COL = { struct: 'z', prop: 'good', equip: 'warn' };
  function arcPts(cx, cz, rr, a0, a1) { var P = []; for (var i = 0; i <= 8; i++) { var a = a0 + (a1 - a0) * i / 8; P.push([cx + rr * Math.cos(a), cz + rr * Math.sin(a)]); } return P; }
  // the CG symbol: a circle with two opposite quarters filled
  X.cgMark = function (g, x, z, rr, o) {
    var c = o && o.color || 'r';
    g.circle({ center: [x, z], r: rr, color: c, width: 1.4, fill: 'surface', fillOpacity: 0.9 });
    g.polyline([[x, z]].concat(arcPts(x, z, rr, 0, Math.PI / 2)).concat([[x, z]]), { color: c, width: 0, closed: true, fill: c, fillOpacity: 0.9 });
    g.polyline([[x, z]].concat(arcPts(x, z, rr, Math.PI, 1.5 * Math.PI)).concat([[x, z]]), { color: c, width: 0, closed: true, fill: c, fillOpacity: 0.9 });
  };
  // the layout redrawn with the wing moved aft by dx (the tails stay where they are: their arm shortens)
  X.shiftedLayout = function (sp, dx) {
    var LA = global.LAYOUT, ls = LA.preset(sp.layout), lF = X.layout(sp).lF;
    if (sp.nac) { ls.eng.D = sp.nac.D; ls.eng.l = sp.nac.l; }
    ls.wing.xFrac += dx / lF; ls.tail.armFrac -= dx / lF;
    return LA.evaluate(ls);
  };

  // horizontal bars in HTML: rows [{label, segs: [{v, col, title}], text, bold}], o {max, refs: [{v, label, col}],
  // legend: [{label, col}], aria}; each segment's width is v / max of the track
  X.hbars = function (host, rows, o) {
    o = o || {};
    if (!o._fit) { host._hb = { rows: rows, o: o }; }              // the caller's arguments, for refitting on resize
    var max = o.max || 1.15 * Math.max.apply(null, rows.map(function (r) { return r.segs.reduce(function (a, q) { return a + q.v; }, 0); }));
    host.innerHTML = '';
    var texts = [];
    var box = CYL.el('div', { role: 'img', 'aria-label': o.aria || 'Bar chart.', style: 'padding:14px 16px 10px;display:grid;grid-template-columns:minmax(5.5rem,max-content) minmax(0,1fr);gap:7px 10px;align-items:center;font-size:0.86rem' });
    rows.forEach(function (r) {
      var track = CYL.el('div', { style: 'position:relative;height:' + (r.bold ? 22 : 20) + 'px' }), x = 0;
      r.segs.forEach(function (q) {
        var w = 100 * q.v / max;
        track.appendChild(CYL.el('div', { title: q.title || '', style: 'position:absolute;top:2px;bottom:2px;left:' + x.toFixed(3) + '%;width:' + Math.max(0, w).toFixed(3) + '%;background:var(--c-' + q.col + ', var(--' + q.col + ', var(--accent)));opacity:' + (q.op || (r.bold ? 0.85 : 0.62)) + ';border-right:1px solid var(--surface, #fff)' }));
        x += w;
      });
      if (r.text != null) { var tsp = CYL.el('span', { text: r.text, style: 'position:absolute;top:0;left:calc(' + Math.min(x, 100).toFixed(3) + '% + 6px);font-variant-numeric:tabular-nums;white-space:nowrap;line-height:' + (r.bold ? 22 : 20) + 'px' + (r.bold ? ';font-weight:700' : '') }); track.appendChild(tsp); texts.push({ el: tsp, track: track, x: x }); }
      (o.refs || []).forEach(function (f) { track.appendChild(CYL.el('div', { style: 'position:absolute;top:-4px;bottom:-4px;left:' + (100 * f.v / max).toFixed(3) + '%;border-left:2px dashed var(--c-' + (f.col || 'r') + ', #c2410c)' })); });
      box.appendChild(CYL.el('span', { text: r.label, style: 'text-align:right;color:var(--ink-muted)' + (r.bold ? ';font-weight:700;color:var(--ink)' : '') }));
      box.appendChild(track);
    });
    host.appendChild(box);
    var leg = (o.legend || []).map(function (l) { return '<span style="display:inline-flex;align-items:center;gap:6px;margin-right:14px;white-space:nowrap"><span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:var(--c-' + l.col + ', var(--accent));opacity:0.7"></span>' + l.label + '</span>'; });
    (o.refs || []).forEach(function (f) { if (f.label) leg.push('<span style="display:inline-flex;align-items:center;gap:6px;margin-right:14px;white-space:nowrap"><span style="display:inline-block;width:14px;border-top:2px dashed var(--c-' + (f.col || 'r') + ', #c2410c)"></span>' + f.label + '</span>'); });
    if (leg.length) host.appendChild(CYL.el('p', { style: 'margin:0 16px 10px;font-size:0.8rem;color:var(--ink-muted);line-height:1.9', html: leg.join('') }));
    // a text that would cross a reference line goes just past the line instead
    var refP = (o.refs || []).map(function (f) { return 100 * f.v / max; });
    texts.forEach(function (q) {
      var W = q.track.getBoundingClientRect().width, tw = q.el.getBoundingClientRect().width;
      if (!(W > 0 && tw > 0)) return;
      refP.forEach(function (rp) {
        var L = q.x / 100 * W + 6, X = rp / 100 * W;
        if (X > L - 5 && X < L + tw + 3) { q.x = rp; q.el.style.left = 'calc(' + Math.min(rp, 100).toFixed(3) + '% + 6px)'; }
      });
    });
    // a text past the end of a long bar must not run out of its track: widen the scale until every text fits
    if (!o._fit) {
      var need = 1;
      texts.forEach(function (q) {
        var W = q.track.getBoundingClientRect().width, tw = q.el.getBoundingClientRect().width;
        if (W > 0 && tw > 0 && q.x / 100 * W + 6 + tw > W - 2) need = Math.max(need, (q.x / 100 * W) / Math.max(10, W - 8 - tw));   // q.x may pass 100% when a bar outgrows a fixed max
      });
      if (need > 1.001) X.hbars(host, rows, Object.assign({}, o, { max: max * need, _fit: true }));
    }
    if (!host._hbObs && typeof ResizeObserver !== 'undefined') {
      host._hbObs = true; var lastW = host.clientWidth;
      new ResizeObserver(function () { var w = host.clientWidth; if (Math.abs(w - lastW) > 4 && host._hb) { lastW = w; X.hbars(host, host._hb.rows, host._hb.o); } }).observe(host);
    }
  };

  global.WEIGHTS = X;
})(typeof window !== 'undefined' ? window : this);
