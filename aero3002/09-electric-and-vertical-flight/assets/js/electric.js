/*!
 * electric.js — ELEC: electric and hybrid-electric propulsion, batteries, electric range and sizing, distributed
 * propulsion, electric motors, momentum theory for hover and the VTOL variants of the business jet, for Module 9 of
 * Aerospace Design & Practice (Electric Aircraft and Vertical Flight). Plain ES5, no dependencies.
 *
 * Units: SI (m, kg, N, W, J, s) unless a name says otherwise; specific energies in Wh/kg, specific powers in kW/kg,
 * ranges in km where the name ends in Km.
 *
 *   ELEC.isa(h, dT)                       standard atmosphere (0–20 km) with a temperature offset: {T, p, rho, a, sigma}
 *   ELEC.CHAIN, chain(parts)              typical component efficiencies and their product
 *   ELEC.ARCH                             the five architectures of Lesson 1: blocks and power paths
 *   ELEC.pack(eCell, fUse, kPack)         usable pack specific energy from the cell's (NASA 2018: 0.80 usable, pack 1.3 × cell)
 *   ELEC.rangeBattery(eWh, eta, LD, bf)   battery range (m): e η (L/D)(W_b/W0)/g
 *   ELEC.bfForRange(R, eWh, eta, LD)      battery fraction for a range (m)
 *   ELEC.rangeJet(VKmh, C, LD, ratio)     Breguet range (km) of Module 3
 *   ELEC.BJ, polar(o)                     the business jet (Modules 3–7) and its parabolic polar: K, CL*, (L/D)max, speeds
 *   ELEC.vMD(W, S, rho, o), vMP(...)      speeds for (L/D)max and for minimum power (0.760 V_md)
 *   ELEC.powerLevel(W, V, LD, eta)        power drawn for level flight at V and L/D (W)
 *   ELEC.reserveFrac(o)                   battery fraction for a timed reserve at minimum power
 *   ELEC.emptyFrac(W0, o)                 electric empty-weight fraction: Module 3's trend − engines + electric drive
 *   ELEC.sizeElectric(o)                  sizing loop for a battery-electric aircraft: {W0, We, Wb, E (kWh), ok, it}
 *   ELEC.wall(o)                          W0 against range for one specific energy: [[R km, W0 kg], ...]
 *   ELEC.m3(o)                            Module 3's mission fuel fraction (jet), with L/D and range as inputs
 *   ELEC.sizeJet(o)                       Module 3's sizing loop, with an added empty-weight fraction fv (VTOL system)
 *   ELEC.rangeAtW0(o)                     range (km) of the jet at fixed W0 with an added fraction fv
 *   ELEC.swap(mb, o)                      range (km) when batteries of mass mb replace part of the fuel (cruise only)
 *   ELEC.hybridH(Pm, Pe), energyH(Eb, Ef) degrees of hybridization (power, energy)
 *   ELEC.boost(o)                         battery boost at the ceiling: battery, motor and engine mass against the jet
 *   ELEC.dep(S, o)                        smaller wing with high-lift propellers: A, CD0, K, CL, L/D at the cruise point
 *   ELEC.landingWS(CLL)                   Module 5's landing limit on takeoff W/S (kg/m²) for a landing lift coefficient
 *   ELEC.torque(P, rpm), heat(P, eta), coolant(Q, cp, dT), motorMassRatio(Q1, Q2)
 *   ELEC.vh(DL, rho), hover(T, A, rho, FM), climb(T, A, rho, FM, Vc), dia(T, n, DL)
 *   ELEC.powerLoading(DL, rho, FM)        T/P (N/W) in hover
 *   ELEC.TYPES                            typical disk-loading bands of the VTOL types; NASA's six concepts [8]
 *   ELEC.VARIANTS, variant(id, o)         the business jet's VTOL variants (Lesson 8)
 *   ELEC.NASA, X57                        data from NASA's 2018 UAM concept vehicles and the SCEPTOR (X-57) design paper
 *   ELEC.hbars(host, rows, o)             HTML bar chart (rows [{label, segs [{v, col}], text, bold}], o {max, refs, legend, aria})
 *
 * Sources, numbered as on the References page: [7] Borer et al., "Design and Performance of the NASA SCEPTOR
 * Distributed Electric Propulsion Flight Demonstrator" (NTRS 20160010157): Table 2, the 2.5x wing and 4.8x energy figures,
 * the efficiency estimates; [8] Silva, Johnson, Antcliff and Patterson, "VTOL Urban Air Mobility Concept Vehicles for
 * Technology Development" (NTRS 20180006683): the battery chain, Table 3, the motor tech factor; Modules 3 (sizing),
 * 5 (landing constraint) and 7 (polar, engines). Other component efficiencies, specific powers, battery specific
 * energies, disk-loading bands and VTOL system fractions are typical values.
 */
(function (global) {
  'use strict';
  var X = {}, G0 = 9.80665, RHO0 = 1.225, WH = 3600, KT = 0.514444, FT = 0.3048, LB = 0.45359237, LBF = 4.4482216;
  X.G0 = G0; X.RHO0 = RHO0; X.WH = WH; X.KT = KT; X.FT = FT; X.LB = LB; X.LBF = LBF;
  X.H_JET = 43.2e6;                       // Jet A-1 lower heating value, J/kg (Module 7's fuel table)
  X.E_JET = X.H_JET / WH;                 // 12 000 Wh/kg

  /* ---------- Standard atmosphere with a temperature offset (geopotential, 0–20 km) ---------- */
  X.isa = function (h, dT) {
    h = h || 0; dT = dT || 0;
    var Ts = h <= 11000 ? 288.15 - 0.0065 * h : 216.65,
      p = h <= 11000 ? 101325 * Math.pow(Ts / 288.15, 5.25588) : 22632.06 * Math.exp(-(h - 11000) / 6341.62),
      T = Ts + dT, rho = p / (287.053 * T);
    return { T: T, p: p, rho: rho, a: Math.sqrt(1.4 * 287.053 * T), sigma: rho / RHO0 };
  };

  /* ---------- Efficiencies (typical values) and the architectures ---------- */
  X.CHAIN = { bat: 0.95, inv: 0.98, mot: 0.95, prop: 0.80, gen: 0.96, rect: 0.98, gear: 0.98, cable: 0.99, th: 0.30 };
  X.chain = function (parts) { return parts.reduce(function (a, k) { return a * (typeof k === 'number' ? k : X.CHAIN[k]); }, 1); };
  // blocks: id, label, kind (fuel | elec | mech | thrust); links: [from, to, kind]
  X.ARCH = {
    conv: { label: 'Conventional', blocks: ['fuel', 'eng', 'prop'], links: [['fuel', 'eng', 'fuel'], ['eng', 'prop', 'mech']],
      chain: ['th', 'gear', 'prop'], note: 'Fuel to a turboshaft or piston engine to the propulsor: the reference.' },
    elec: { label: 'All-electric', blocks: ['bat', 'inv', 'mot', 'prop'], links: [['bat', 'inv', 'elec'], ['inv', 'mot', 'elec'], ['mot', 'prop', 'mech']],
      chain: ['bat', 'inv', 'mot', 'prop'], note: 'Battery to inverter to motor to propulsor: no fuel, no weight change.' },
    series: { label: 'Series hybrid', blocks: ['fuel', 'eng', 'gen', 'bat', 'inv', 'mot', 'prop'],
      links: [['fuel', 'eng', 'fuel'], ['eng', 'gen', 'mech'], ['gen', 'inv', 'elec'], ['bat', 'inv', 'elec'], ['inv', 'mot', 'elec'], ['mot', 'prop', 'mech']],
      chain: ['th', 'gen', 'rect', 'inv', 'mot', 'prop'], note: 'The engine only turns a generator; every watt is converted twice on its way to the propulsor.' },
    parallel: { label: 'Parallel hybrid', blocks: ['fuel', 'eng', 'bat', 'inv', 'mot', 'prop'],
      links: [['fuel', 'eng', 'fuel'], ['eng', 'prop', 'mech'], ['bat', 'inv', 'elec'], ['inv', 'mot', 'elec'], ['mot', 'prop', 'mech']],
      chain: ['th', 'gear', 'prop'], note: 'Engine and motor turn the same shaft; either can drive it, and the battery adds power when it is needed.' },
    turbo: { label: 'Turboelectric', blocks: ['fuel', 'eng', 'gen', 'inv', 'mot', 'prop'],
      links: [['fuel', 'eng', 'fuel'], ['eng', 'gen', 'mech'], ['gen', 'inv', 'elec'], ['inv', 'mot', 'elec'], ['mot', 'prop', 'mech']],
      chain: ['th', 'gen', 'rect', 'inv', 'mot', 'prop'], note: 'A series hybrid without a battery: electric wires replace shafts, so the propulsors can go anywhere.' }
  };

  /* ---------- Batteries ---------- */
  X.pack = function (eCell, fUse, kPack) { return eCell * (fUse == null ? 0.80 : fUse) / (kPack == null ? 1.30 : kPack); };
  X.cRate = function (P, E) { return P / E; };      // per hour, with P in W and E in Wh (or kW and kWh)

  /* ---------- Range and endurance ---------- */
  X.rangeBattery = function (eWh, eta, LD, bf) { return eWh * WH * eta * LD * bf / G0; };
  X.bfForRange = function (R, eWh, eta, LD) { return R * G0 / (eWh * WH * eta * LD); };
  X.enduranceBattery = function (eWh, eta, LD, bf, V) { return eWh * WH * eta * LD * bf / (G0 * V); };
  X.rangeJet = function (VKmh, C, LD, ratio) { return VKmh / C * LD * Math.log(ratio); };
  X.powerLevel = function (W, V, LD, eta) { return W * G0 * V / (LD * (eta == null ? 1 : eta)); };

  /* ---------- The business jet (Modules 3–7) and its polar ---------- */
  X.BJ = {
    W0: 6943, Wpay: 980, Wf: 1990.6, fuelFrac: 0.2867, WeA: 0.9727, WeC: -0.06, Wcrew: 0,
    S: 28, A: 8, e: 0.75, CD0: 0.01536, Cfe: 0.003, swet: 143.33, swetWing: 48.88, b: Math.sqrt(8 * 28),
    h: 12000, M: 0.80, VKmh: 850, C: 0.65, Cl: 0.55, R: 4600, loiter: 45,
    eng: 200.8, nEng: 2, T0: 10.56e3, TW: 0.31, ceilTW: 0.308, cruiseTW: 0.284, landWS: 250, CLL: 2.1, sa: 304.7,
    cT: 0.65 / 3600 / G0 * 1e6           // mg/(N s): Module 3's C = 0.65 per hour → 18.41 mg/(N s)
  };
  X.BJ.fEng = X.BJ.nEng * X.BJ.eng / X.BJ.W0;
  X.polar = function (o) {
    o = o || X.BJ; var K = 1 / (Math.PI * o.A * o.e), CLs = Math.sqrt(o.CD0 / K);
    return { K: K, CLs: CLs, LDmax: 1 / (2 * Math.sqrt(o.CD0 * K)), CLmp: Math.sqrt(3) * CLs };
  };
  X.vMD = function (W, S, rho, o) { var p = X.polar(o); return Math.sqrt(2 * W * G0 / (rho * S * p.CLs)); };
  X.vMP = function (W, S, rho, o) { return X.vMD(W, S, rho, o) / Math.pow(3, 0.25); };   // 0.760 V_md, L/D = 0.866 (L/D)max
  X.ld = function (CL, o) { var p = X.polar(o); return CL / (o.CD0 + p.K * CL * CL); };

  /* ---------- Electric sizing ---------- */
  // timed reserve at minimum-power speed: fraction of W0 that the reserve's battery must be
  X.reserveFrac = function (o) {
    o = o || {}; var t = (o.t == null ? 45 : o.t) * 60; if (!(t > 0)) return 0;
    var ac = o.ac || X.BJ, s = X.isa(o.h == null ? 1500 : o.h), p = X.polar(ac), W0 = o.W0 || ac.W0;
    var V = X.vMP(W0, W0 / (o.ws || ac.W0 / ac.S), s.rho, ac), LD = 0.866 * (o.LD || p.LDmax);
    return G0 * V * t / ((o.eta || X.chain(['bat', 'inv', 'mot', 'prop'])) * LD * o.eWh * WH);
  };
  X.emptyFrac = function (W0, o) {
    o = o || {}; var ac = X.BJ;
    return ac.WeA * Math.pow(W0, ac.WeC) - (o.fEng == null ? ac.fEng : o.fEng) + (o.pw == null ? 0.30 : o.pw) / (o.ped == null ? 5 : o.ped) + (o.dWe || 0);
  };
  // W0 = Wpay/(1 − We/W0 − W_b/W0) with We/W0 = A W0^C + c0: W0(c − A W0^C) − Wpay is convex in W0, so it has one root,
  // found by bisection on log W0 (no root below W0max means the aircraft does not close)
  function solveW0(c, Wpay, W0max) {
    var ac = X.BJ, h = function (W) { return W * (c - ac.WeA * Math.pow(W, ac.WeC)) - Wpay; }, lo = Math.log(Wpay * 1.05), hi = Math.log(W0max || 1e6);
    if (!(h(Math.exp(hi)) > 0)) return Infinity;
    for (var i = 0; i < 100; i++) { var mid = 0.5 * (lo + hi); if (h(Math.exp(mid)) > 0) hi = mid; else lo = mid; }
    return Math.exp(0.5 * (lo + hi));
  }
  X.solveW0 = solveW0;
  X.sizeElectric = function (o) {
    o = o || {}; var eta = o.eta || X.chain(['bat', 'inv', 'mot', 'prop']), LD = o.LD || X.polar().LDmax, Wpay = o.Wpay || X.BJ.Wpay;
    var bfR = X.bfForRange(o.R, o.eWh, eta, LD), bfRes = X.reserveFrac({ t: o.t, h: o.hRes, eWh: o.eWh, eta: eta, LD: LD });
    var c0 = X.emptyFrac(1, o) - X.BJ.WeA, W0 = solveW0(1 - c0 - bfR - bfRes, Wpay, o.W0max), ok = isFinite(W0);
    var bf = bfR + bfRes, We = ok ? X.emptyFrac(W0, o) * W0 : NaN;
    return { W0: W0, We: We, Wb: bf * W0, bf: bf, bfR: bfR, bfRes: bfRes, E: bf * W0 * o.eWh / 1000, ok: ok, eta: eta, LD: LD, Wpay: Wpay };
  };
  X.wall = function (o) {
    var P = [], RmaxKm = o.RmaxKm || 3000, st = o.stepKm || 10;
    for (var R = 0; R <= RmaxKm + 1e-9; R += st) {
      var s = X.sizeElectric(Object.assign({}, o, { R: R * 1000 }));
      if (!s.ok || s.W0 > (o.W0max || 60000)) { P.push([R, Infinity]); break; }
      P.push([R, s.W0]);
    }
    return P;
  };

  /* ---------- Module 3's jet sizing, with an added empty-weight fraction (Lesson 8) ---------- */
  X.m3 = function (o) {
    o = o || {}; var ac = X.BJ, LD = o.LD || X.polar().LDmax, R = o.R == null ? ac.R : o.R;
    var cr = Math.exp(-R * ac.C / (ac.VKmh * 0.866 * LD)), lo = Math.exp(-(ac.loiter / 60) * ac.Cl / LD), x = 0.97 * 0.985 * cr * lo * 0.995;
    return { ff: 1.06 * (1 - x), x: x, cruise: cr, loiter: lo, other: 0.97 * 0.985 * lo * 0.995 };
  };
  X.sizeJet = function (o) {
    o = o || {}; var ff = X.m3(o).ff, fv = o.fv || 0, ac = X.BJ, W0 = solveW0(1 - ff - fv, ac.Wpay, o.W0max), ok = isFinite(W0);
    return { W0: W0, ok: ok, ff: ff, fv: fv, We: ok ? ac.WeA * Math.pow(W0, ac.WeC) * W0 : NaN };
  };
  X.rangeAtW0 = function (o) {
    o = o || {}; var ac = X.BJ, W0 = o.W0 || ac.W0, LD = o.LD || X.polar().LDmax;
    var ff = 1 - ac.WeA * Math.pow(W0, ac.WeC) - (o.fv || 0) - ac.Wpay / W0;
    if (!(ff > 0)) return { R: 0, ff: ff };
    var x = 1 - ff / 1.06, m = X.m3({ LD: LD }), cr = x / m.other;
    return { R: Math.max(0, -Math.log(cr) * ac.VKmh * 0.866 * LD / ac.C), ff: ff, cruise: cr };
  };

  /* ---------- Hybrid-electric ---------- */
  X.hybridH = function (Pm, Pe) { return Pm / (Pm + Pe); };
  X.energyH = function (Eb, Ef) { return Eb / (Eb + Ef); };
  // cruise-only range of the business jet when batteries of mass mb replace that much of the fuel (the battery is used
  // first, at (L/D)max; then the fuel, by Breguet at 0.866 (L/D)max); W0 is fixed
  X.swap = function (mb, o) {
    o = o || {}; var ac = X.BJ, p = X.polar(), W0 = ac.W0, mf = (o.mStore || ac.Wf) - mb, eta = o.eta || X.chain(['bat', 'inv', 'mot', 'prop']);
    var Rb = X.rangeBattery(o.eWh || 200, eta, p.LDmax, mb / W0) / 1000;
    var Rf = mf > 0 ? X.rangeJet(ac.VKmh, ac.C, 0.866 * p.LDmax, W0 / (W0 - mf)) : 0;
    return { R: Rb + Rf, Rb: Rb, Rf: Rf, H: X.energyH(mb * (o.eWh || 200), Math.max(mf, 0) * X.E_JET) };
  };
  // battery boost for the climb at the ceiling: engines sized for cruise (T/W cruiseTW) with a battery and motor making
  // up the ceiling's extra thrust for t minutes, against engines sized for the ceiling
  X.boost = function (o) {
    o = o || {}; var ac = X.BJ, s = X.isa(ac.h), W = ac.W0 * G0, V = ac.M * s.a;
    var dTW = (o.ceilTW || ac.ceilTW) - (o.cruiseTW || ac.cruiseTW), dT = dTW * W * s.sigma;          // thrust lapse = sigma
    var Pth = dT * V, Psh = Pth / (o.prop || X.CHAIN.prop), Pb = Psh / X.chain(['bat', 'inv', 'mot']);
    var t = (o.t == null ? 10 : o.t) / 60, E = Pb * t / 1000, eWh = o.eWh || 200, cMax = o.cMax || 3;
    var mE = E * 1000 / eWh, mP = Pb / 1000 / cMax * 1000 / eWh, mBat = Math.max(mE, mP), mMot = Psh / 1000 / (o.ped || 5);
    var engSave = ac.nEng * ac.eng * (1 - (o.cruiseTW || ac.cruiseTW) / (o.ceilTW || ac.ceilTW));
    return { dTW: dTW, dT: dT, V: V, Pth: Pth, Psh: Psh, Pb: Pb, E: E, mE: mE, mP: mP, mBat: mBat, mMot: mMot, engSave: engSave, net: mBat + mMot - engSave, C: Pb / 1000 / E };
  };

  /* ---------- Distributed propulsion: a smaller wing at the same span (or the same aspect ratio) ---------- */
  X.landingWS = function (CLL) { var ac = X.BJ; return ac.landWS * CLL / ac.CLL; };   // Module 5: W/S ∝ C_L,L at a given field length
  X.dep = function (S, o) {
    o = o || {}; var ac = X.BJ, s = X.isa(ac.h), V = ac.M * s.a, q = 0.5 * s.rho * V * V, W = (o.W || ac.W0) * G0;
    var b = o.keep === 'A' ? Math.sqrt(ac.A * S) : ac.b, A = b * b / S, swet = ac.swet - ac.swetWing + ac.swetWing * S / ac.S;
    var CD0 = ac.Cfe * swet / S, K = 1 / (Math.PI * A * ac.e), CL = W / (q * S), CD = CD0 + K * CL * CL;
    return { S: S, b: b, A: A, swet: swet, CD0: CD0, K: K, CL: CL, CD: CD, LD: CL / CD, LDmax: 1 / (2 * Math.sqrt(CD0 * K)), ws: ac.W0 / S, q: q };
  };

  /* ---------- Electric motors ---------- */
  X.torque = function (P, rpm) { return P / (rpm * 2 * Math.PI / 60); };
  X.heat = function (P, eta) { return P * (1 - eta) / eta; };          // heat for a shaft output P at efficiency eta
  X.coolant = function (Q, cp, dT) { return Q / (cp * dT); };          // kg/s of coolant for heat Q (W), cp J/(kg K)
  X.MOTOR_EXP = 0.8587;                                                // NASA 2018, eq. (1): motor weight ∝ Q^0.8587
  X.MOTOR_TECH = 1.63;                                                 // NASA 2018: accessories 63% of the motor weight
  X.motorMassRatio = function (Q1, Q2) { return Math.pow(Q1 / Q2, X.MOTOR_EXP); };

  /* ---------- Momentum theory ---------- */
  X.vh = function (DL, rho) { return Math.sqrt(DL / (2 * (rho || RHO0))); };
  X.hover = function (T, A, rho, FM) {
    rho = rho || RHO0; var v = Math.sqrt(T / (2 * rho * A)), Pi = T * v;
    return { vh: v, Pi: Pi, P: Pi / (FM || 1), DL: T / A, PL: T / (Pi / (FM || 1)), wake: 2 * v };
  };
  X.climb = function (T, A, rho, FM, Vc) {       // axial climb: induced power T(Vc/2 + sqrt((Vc/2)^2 + vh^2)), over FM for the losses
    var h = X.hover(T, A, rho, 1), vi = -Vc / 2 + Math.sqrt(Vc * Vc / 4 + h.vh * h.vh);
    return { vi: vi, P: T * (Vc + vi) / (FM || 1), Ph: h.Pi / (FM || 1), Pc: T * Vc };
  };
  X.dia = function (T, n, DL) { return 2 * Math.sqrt(T / (n * DL) / Math.PI); };
  X.powerLoading = function (DL, rho, FM) { return (FM || 1) / X.vh(DL, rho); };

  /* ---------- VTOL types and concepts ---------- */
  // disk-loading bands (N/m²) are typical values; NASA's points are Table 3 of [8] (lb/ft² × 47.88)
  X.TYPES = [
    { id: 'heli', label: 'Helicopter', lo: 150, hi: 500 },
    { id: 'multi', label: 'Multicopter and lift+cruise', lo: 300, hi: 1000 },
    { id: 'tilt', label: 'Tiltrotor', lo: 500, hi: 1000 },
    { id: 'tiltwing', label: 'Tiltwing', lo: 1000, hi: 2500 },
    { id: 'fan', label: 'Lift fan, ducted fan', lo: 2500, hi: 20000 },
    { id: 'jet', label: 'Vectored thrust, lift jet', lo: 20000, hi: 200000 }
  ];
  X.NASA = [
    { id: 'qts', label: 'Quadrotor, turboshaft', DL: 3.5, FM: 0.69, DGW: 3735, We: 2345, rotor: 325, drive: 254, batt: 0, LDe: 4.9 },
    { id: 'qe', label: 'Quadrotor, electric', DL: 3.0, FM: 0.70, DGW: 6480, We: 5270, rotor: 628, drive: 397, batt: 1567, LDe: 5.8, cH: 1.1 },
    { id: 'sts', label: 'Side-by-side, turboshaft', DL: 5.0, FM: 0.69, DGW: 3468, We: 2111, rotor: 196, drive: 195, batt: 0, LDe: 5.9 },
    { id: 'se', label: 'Side-by-side, electric', DL: 3.5, FM: 0.68, DGW: 4897, We: 3687, rotor: 345, drive: 255, batt: 997, LDe: 7.2, cH: 1.4 },
    { id: 'lcte', label: 'Lift+cruise, turboelectric', DL: 9.6, FM: 0.70, DGW: 6013, We: 4627, rotor: 748, drive: 315, batt: 188, LDe: 7.2 },
    { id: 'lce', label: 'Lift+cruise, electric', DL: 13.1, FM: 0.74, DGW: 8210, We: 7001, rotor: 948, drive: 358, batt: 1693, LDe: 8.5, cH: 2.4 }
  ];
  X.NASA.forEach(function (c) { c.DLsi = c.DL * LBF / (FT * FT); c.DGWkg = c.DGW * LB; c.fRD = (c.rotor + c.drive) / c.DGW; });
  X.NASA_PAYLOAD = 1200;   // lb, six occupants; mission 2 × 37.5 nmi into a 10-knot headwind, 20 min reserve
  X.X57 = {   // SCEPTOR design paper, Table 2 (P2006T stock against Rev 3.3 at PDR) and text
    S: [158.9, 66.7], WS: [17.1, 45.0], b: [37.4, 31.6], A: [8.8, 15.0], nHL: [0, 12],
    GW: 3000, Vcr: 150, hCr: 8000, energy: 4.8, wingCut: 2.5, cruiseMotor: 60, vs0: 58, ice: 0.30, elec: 0.90
  };

  /* ---------- The business jet's VTOL variants (Lesson 8) ---------- */
  // dl: disk loading (N/m²); fm: figure of merit; dn: download (fraction of the weight); n: lifting rotors or fans;
  // fv: added empty-weight fraction of the VTOL system (typical; NASA's rotor + drive fractions are 11–18% of DGW [8])
  X.VARIANTS = [
    { id: 'tilt', label: 'Tiltrotor', n: 2, dl: 800, fm: 0.75, dn: 0.10, fv: 0.12, note: 'Two proprotors at the wingtips tilt from hover to cruise; cruise speed limited by the proprotors\' tip Mach number.' },
    { id: 'lc', label: 'Lift + cruise', n: 8, dl: 627, fm: 0.74, dn: 0.05, fv: 0.10, note: 'Eight lift rotors on booms, stopped in cruise; the jet engines push. The lift system is dead weight in cruise.' },
    { id: 'fan', label: 'Lift fans', n: 4, dl: 10000, fm: 0.75, dn: 0.03, fv: 0.10, note: 'Fans buried in the wing and fuselage, driven by the engines or by motors; high disk loading, small and heavy on power.' },
    { id: 'jet', label: 'Jet lift', n: 4, dl: 100000, fm: 0.80, dn: 0.02, fv: 0.08, note: 'Lift jets or vectored thrust: compact and fast, but the hover power and fuel are an order of magnitude larger.' }
  ];
  X.variant = function (id, o) {
    o = o || {}; var v = X.VARIANTS.filter(function (q) { return q.id === id; })[0] || X.VARIANTS[0];
    var W0 = o.W0 || X.BJ.W0, s = X.isa(o.h || 0, o.dT || 0), dl = o.dl || v.dl, T = W0 * G0 * (1 + (o.dn == null ? v.dn : o.dn)) * (o.margin || 1);
    var A = T / dl, h = X.hover(T, A, s.rho, o.fm || v.fm);
    return { v: v, T: T, A: A, D: X.dia(T, v.n, dl), P: h.P, Pi: h.Pi, vh: h.vh, PL: h.PL, rho: s.rho };
  };

  /* ---------- Horizontal bar chart in HTML (as Module 12's WEIGHTS.hbars) ---------- */
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

  global.ELEC = X;
})(typeof window !== 'undefined' ? window : this);
