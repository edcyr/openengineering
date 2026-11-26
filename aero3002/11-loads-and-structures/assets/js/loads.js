/*!
 * loads.js — LOADS: materials, design loads, the V-n diagram, gust loads, balanced maneuvers, wing shear and bending
 * and the wing box, for Module 11 of Conceptual Aircraft Design (Loads and Structures). Plain ES5; needs wing.js
 * (WING, Module 4) for the atmosphere, the planform, the lift-curve slope and Schrenk's span loading.
 *
 * Units: SI (m, kg, N, Pa, m/s); speeds are equivalent airspeeds (EAS) unless a name says TAS; stresses in MPa and
 * moduli in GPa in the materials table; positions along the aircraft are stations x aft of the nose.
 *
 *   LOADS.MAT, mat(id)                     typical properties: rho (kg/m³), E (GPa), sy, su, sc (compression, where it is
 *                                          lower than su) (MPa), uses
 *   LOADS.index(m, kind), relMass(m, ref, kind)  material indices: tie σ/ρ, beam σ^(2/3)/ρ, panel σ^(1/2)/ρ,
 *                                          tieE E/ρ, beamE E^(1/2)/ρ, panelE E^(1/3)/ρ; mass relative to ref
 *   LOADS.allow(m, fs), allowC(m, fs)      stress allowed at ultimate load: min(su, fs·sy) (fs = 1.5); in compression
 *                                          no more than sc
 *   LOADS.ms(allowable, stress)            margin of safety allowable/stress − 1
 *   LOADS.nLimit(W0)                       14 CFR 25.337: 2.1 + 24 000/(W + 10 000), W in lb, 2.5 to 3.8
 *   LOADS.isa(h), tas(Ve, h), eas(V, h), easOfMach(M, h)
 *   LOADS.cla(ac, M)                       wing lift-curve slope per rad (Module 4's formula, half-chord sweep)
 *   LOADS.ude(h, which)                    derived gust velocity (m/s EAS) at V_B, V_C or V_D (Part 23 before 2017)
 *   LOADS.uref(h)                          reference gust velocity of 14 CFR 25.341(a)(5)(i) (m/s EAS)
 *   LOADS.gust(ac, W, h, Ve, U)            Pratt's formula: {dn, mu, Kg, a, M}
 *   LOADS.speeds(ac, W, h)                 {VS1, VSn, VA, VC, VD, VG, VB (25.335(d)), n, nNeg, Mc, Md, cMach, dMach}
 *   LOADS.vcMin(ac, W, h)                  14 CFR 25.335(a)(2) and (d): {VB, VC} the least V_C (and its V_B)
 *   LOADS.vn(ac, W, h)                     maneuver envelope {pos, neg (polylines [V, n]), corners {A, C, D, E, F, G}}
 *   LOADS.gustEnv(ac, W, h)                gust envelope {VB, VC, VD, pos, neg, B, C, D (± load factors)}
 *   LOADS.cases(ac, W, h)                  the corner points of both envelopes, with the largest n and n·W
 *   LOADS.cmac(ac)                         wing pitching moment about its aerodynamic center, c_m0 A cos²Λ/(A + 2 cos Λ)
 *   LOADS.balance(ac, o)                   wing and tail lift in a balanced maneuver, o {n, W, Ve, xcg (fraction of MAC)}
 *   LOADS.fuelSplit(ac, Wfuel)             fuel in the wing tanks and in the center tank (wing tanks filled last)
 *   LOADS.span(ac, o)                      shear and bending along the half span, o {L (wing lift, N), n, wing (kg),
 *                                          fuel (kg in the wing tanks), N}
 *   LOADS.box(ac, sp, m, o)                bending material of the wing box at ultimate load, o {fs, allow, kh, front,
 *                                          rear, F (0.81), L (rib spacing)}: lower panel by strength, upper by buckling
 *   LOADS.PRESETS, preset(id)              the business jet (this course) and three illustrative aircraft
 *
 * Sources: 14 CFR 25.301, 25.303, 25.305, 25.321, 25.331, 25.333, 25.335, 25.337, 25.341, 25.345, 25.365, 25.613,
 * 25.619 to 25.625 (Cornell LII); Farrar's efficiency factor for stringer panels (recalled); the derived gust velocities and the gust load factor of 14 CFR 23.333(c) and 23.341
 * as they stood before Amendment 23-64 (2016 CFR edition, GovInfo); Schrenk's span loading (NACA TM 948) as in Module 4.
 * Material properties are typical values (Wikipedia's articles on the alloys, its specific strength and specific modulus
 * tables, and recalled handbook values where those give none): not design allowables.
 */
(function (global) {
  'use strict';
  var X = {}, G0 = 9.80665, RHO0 = 1.225, KT = 0.514444, FT = 0.3048, LB = 0.45359237, D2R = Math.PI / 180;
  X.G0 = G0; X.RHO0 = RHO0; X.KT = KT; X.FT = FT; X.LB = LB;
  function WG() { return global.WING; }

  /* ---------- Materials (typical values, not design allowables) ---------- */
  X.MAT = [
    { id: 'spruce', label: 'Sitka spruce (along the grain)', short: 'Spruce', rho: 400, E: 10.4, sy: null, su: 70, sc: 38, group: 'wood',
      uses: 'Spars and ribs from the Wright Flyer to the 1930s; the Mosquito\'s laminates' },
    { id: 'al2024', label: 'Aluminium 2024-T3', short: '2024-T3', rho: 2780, E: 73, sy: 345, su: 483, group: 'metal',
      uses: 'Fuselage skins and lower wing skins: tension, fatigue and damage tolerance' },
    { id: 'al7075', label: 'Aluminium 7075-T6', short: '7075-T6', rho: 2810, E: 71.7, sy: 503, su: 572, group: 'metal',
      uses: 'Upper wing skins, stringers and spar caps in compression; fittings' },
    { id: 'alli', label: 'Aluminium-lithium (third generation)', short: 'Al-Li', rho: 2650, E: 78, sy: 480, su: 540, group: 'metal',
      uses: 'Wing ribs and skins, fuselage skins (A350, A380, 787, A220)' },
    { id: 'ti64', label: 'Titanium Ti-6Al-4V (annealed)', short: 'Ti-6Al-4V', rho: 4430, E: 110, sy: 880, su: 950, group: 'metal',
      uses: 'Highly loaded fittings, engine mounts, hot structure, parts joined to carbon fiber' },
    { id: 'steel', label: 'High-strength steel (4340 or 300M)', short: 'Steel', rho: 7850, E: 205, sy: 1650, su: 1900, group: 'metal',
      uses: 'Landing-gear legs and axles, flap tracks, highly loaded bolts' },
    { id: 'gfrp', label: 'Glass-fiber epoxy (quasi-isotropic)', short: 'GFRP', rho: 1850, E: 25, sy: null, su: 300, sc: 210, group: 'composite',
      uses: 'Fairings, radomes, sailplanes and light aircraft' },
    { id: 'cfrpq', label: 'Carbon-fiber epoxy (quasi-isotropic)', short: 'CFRP', rho: 1580, E: 60, sy: null, su: 600, sc: 420, group: 'composite',
      uses: 'Skins, spars, stringers and fuselage barrels of the 787 and A350; tails and control surfaces' },
    { id: 'cfrpu', label: 'Carbon-fiber epoxy (all fibers along the load)', short: 'CFRP UD', rho: 1580, E: 181, sy: null, su: 1240, sc: 870, group: 'composite',
      uses: 'Spar caps and stringers, where the load runs one way' }
  ];
  X.mat = function (id) { for (var i = 0; i < X.MAT.length; i++) if (X.MAT[i].id === id) return X.MAT[i]; return null; };
  X.INDICES = [
    { id: 'tie', label: 'Tie (strength)', tex: '\\sigma/\\rho' }, { id: 'beam', label: 'Beam (strength)', tex: '\\sigma^{2/3}/\\rho' },
    { id: 'panel', label: 'Panel (strength)', tex: '\\sigma^{1/2}/\\rho' }, { id: 'tieE', label: 'Tie (stiffness)', tex: 'E/\\rho' },
    { id: 'beamE', label: 'Beam (stiffness)', tex: 'E^{1/2}/\\rho' }, { id: 'panelE', label: 'Panel (stiffness, buckling)', tex: 'E^{1/3}/\\rho' }
  ];
  // σ in MPa, E in GPa, ρ in kg/m³ (only ratios between materials matter)
  X.index = function (m, kind) {
    var s = m.su, E = m.E, r = m.rho / 1000;
    switch (kind) {
      case 'tie': return s / r; case 'beam': return Math.pow(s, 2 / 3) / r; case 'panel': return Math.sqrt(s) / r;
      case 'tieE': return E / r; case 'beamE': return Math.sqrt(E) / r; case 'panelE': return Math.pow(E, 1 / 3) / r;
    }
    return NaN;
  };
  X.relMass = function (m, ref, kind) { return X.index(ref, kind) / X.index(m, kind); };
  X.allow = function (m, fs) { var f = fs || 1.5; return m.sy ? Math.min(m.su, f * m.sy) : m.su; };
  X.allowC = function (m, fs) { return m.sc ? Math.min(m.sc, X.allow(m, fs)) : X.allow(m, fs); };
  X.ms = function (allowable, stress) { return allowable / stress - 1; };

  /* ---------- Load factor and atmosphere ---------- */
  X.nLimit = function (W0) { var w = W0 / LB; return Math.min(3.8, Math.max(2.5, 2.1 + 24000 / (w + 10000))); };
  X.isa = function (h) { var s = WG().isa(h); s.sigma = s.rho / RHO0; return s; };
  X.tas = function (Ve, h) { return Ve / Math.sqrt(X.isa(h).sigma); };
  X.eas = function (V, h) { return V * Math.sqrt(X.isa(h).sigma); };
  X.easOfMach = function (M, h) { var s = X.isa(h); return M * s.a * Math.sqrt(s.sigma); };
  X.pf = function (ac) { return WG().planform(ac.S, ac.A, ac.lam, ac.sweepC4); };
  X.cla = function (ac, M) {
    var pf = X.pf(ac), b2 = 1 - M * M, t = Math.tan(pf.sweepHalf * D2R), A = ac.A;
    return 2 * Math.PI * A / (2 + Math.sqrt(4 + A * A * b2 / 0.9025 * (1 + t * t / b2)));
  };

  /* ---------- Gusts ---------- */
  // derived gust velocities (ft/s): to 20 000 ft, then linearly to 50 000 ft (14 CFR 23.333(c), before 2017)
  var UDE = { B: [66, 38], C: [50, 25], D: [25, 12.5] };
  X.ude = function (h, which) {
    var u = UDE[which || 'C'], ft = h / FT, v;
    if (ft <= 20000) v = u[0]; else if (ft >= 50000) v = u[1]; else v = u[0] + (u[1] - u[0]) * (ft - 20000) / 30000;
    return v * FT;
  };
  // reference gust velocity (ft/s EAS): 56 at sea level, 44 at 15 000 ft, 20.86 at 60 000 ft (14 CFR 25.341(a)(5)(i))
  X.uref = function (h) {
    var ft = h / FT, v = ft <= 15000 ? 56 - 12 * ft / 15000 : ft <= 60000 ? 44 - (44 - 20.86) * (ft - 15000) / 45000 : 20.86;
    return v * FT;
  };
  X.gust = function (ac, W, h, Ve, U) {
    var s = X.isa(h), M = Ve / Math.sqrt(s.sigma) / s.a, a = X.cla(ac, Math.min(M, 0.95)), ws = W / ac.S, cbar = ac.S / Math.sqrt(ac.S * ac.A);
    var mu = 2 * ws / (s.rho * cbar * a), Kg = 0.88 * mu / (5.3 + mu);
    return { dn: Kg * RHO0 * U * Ve * a / (2 * ws * G0), mu: mu, Kg: Kg, a: a, M: M, rho: s.rho, cbar: cbar };
  };

  /* ---------- Design speeds (EAS) and the maneuver envelope ---------- */
  X.speeds = function (ac, W, h) {
    var ws = W * G0 / ac.S, s = X.isa(h || 0), n = ac.n || X.nLimit(ac.W0);
    var VS1 = Math.sqrt(2 * ws / (RHO0 * ac.CLmax)), VSn = Math.sqrt(2 * ws / (RHO0 * Math.abs(ac.CLneg)));
    var mcE = ac.MC * s.a * Math.sqrt(s.sigma), mdE = ac.MD * s.a * Math.sqrt(s.sigma);
    var VC = Math.min(ac.VC, mcE), VD = Math.min(ac.VD || ac.VC / 0.8, mdE);
    var nNeg = ac.nNeg == null ? -1 : ac.nNeg, VA = VS1 * Math.sqrt(n), VG = VSn * Math.sqrt(-nNeg);
    var r = { VS1: VS1, VSn: VSn, VA: Math.min(VA, VC), n: n, nNeg: nNeg, VC: VC, VD: VD, VG: Math.min(VG, VC), cMach: VC < ac.VC, dMach: VD < (ac.VD || ac.VC / 0.8) };
    r.Mc = VC / Math.sqrt(s.sigma) / s.a; r.Md = VD / Math.sqrt(s.sigma) / s.a;
    // V_B, the design speed for maximum gust intensity: the least of 14 CFR 25.335(d)(1), no more than V_C
    r.VB = Math.min(VC, VS1 * Math.sqrt(1 + X.gust(ac, W, h || 0, VC, X.uref(h || 0)).dn));
    return r;
  };
  // least V_C of 14 CFR 25.335(a)(2), V_B + 1.32 U_ref (knots, U_ref in ft/s), with the least V_B of 25.335(d)(1); for a
  // Part 23 aircraft, 33 sqrt(W/S) knots (W/S in lb/ft², the factor falling linearly to 28.6 at 100 lb/ft²; 23.335, before 2017)
  X.vcMin = function (ac, W, h) {
    var sp = X.speeds(ac, W, h || 0), U = X.uref(h || 0), VC = sp.VC, VB = 0;
    if (ac.part23) { var w = W / ac.S / 4.88243, k = w <= 20 ? 33 : 33 - 4.4 * Math.min(1, (w - 20) / 80); return { VB: sp.VB, VC: k * Math.sqrt(w) * KT, U: U, part23: true }; }
    for (var i = 0; i < 60; i++) {
      VB = sp.VS1 * Math.sqrt(1 + X.gust(ac, W, h || 0, VC, U).dn);
      VC = VB + 1.32 * (U / FT) * KT;
    }
    return { VB: VB, VC: VC, U: U };
  };
  X.vn = function (ac, W, h) {
    var sp = X.speeds(ac, W, h), pos = [], neg = [], N = 40, i, V;
    for (i = 0; i <= N; i++) { V = sp.VA * i / N; pos.push([V, (V / sp.VS1) * (V / sp.VS1)]); }
    pos.push([sp.VD, sp.n]); pos.push([sp.VD, 0]);
    for (i = 0; i <= N; i++) { V = sp.VG * i / N; neg.push([V, -(V / sp.VSn) * (V / sp.VSn)]); }
    neg.push([sp.VC, sp.nNeg]); neg.push([sp.VD, 0]);
    return { sp: sp, pos: pos, neg: neg,
      corners: { A: [sp.VA, sp.n], D: [sp.VD, sp.n], E: [sp.VD, 0], F: [sp.VC, sp.nNeg], G: [sp.VG, sp.nNeg], C: [sp.VC, sp.n] } };
  };
  X.gustEnv = function (ac, W, h) {
    var sp = X.speeds(ac, W, h), g = function (V, w) { return X.gust(ac, W, h, V, X.ude(h, w)).dn; };
    var B = g(sp.VB, 'B'), C = g(sp.VC, 'C'), D = g(sp.VD, 'D');
    return { sp: sp, VB: sp.VB, VC: sp.VC, VD: sp.VD, B: [1 + B, 1 - B], C: [1 + C, 1 - C], D: [1 + D, 1 - D],
      pos: [[0, 1], [sp.VB, 1 + B], [sp.VC, 1 + C], [sp.VD, 1 + D]], neg: [[0, 1], [sp.VB, 1 - B], [sp.VC, 1 - C], [sp.VD, 1 - D]],
      line: function (V, w) { return g(V, w); } };
  };
  // the corner points of both envelopes at one weight and altitude
  X.cases = function (ac, W, h) {
    var v = X.vn(ac, W, h), ge = X.gustEnv(ac, W, h), sp = v.sp, L = [];
    L.push({ id: 'A', kind: 'Maneuver', V: sp.VA, n: sp.n }); L.push({ id: 'D', kind: 'Maneuver', V: sp.VD, n: sp.n });
    L.push({ id: 'E', kind: 'Maneuver', V: sp.VD, n: 0 }); L.push({ id: 'F', kind: 'Maneuver', V: sp.VC, n: sp.nNeg });
    L.push({ id: 'G', kind: 'Maneuver', V: sp.VG, n: sp.nNeg });
    L.push({ id: 'B+', kind: 'Gust', V: ge.VB, n: ge.B[0] }); L.push({ id: 'C+', kind: 'Gust', V: ge.VC, n: ge.C[0] });
    L.push({ id: 'D+', kind: 'Gust', V: ge.VD, n: ge.D[0] }); L.push({ id: 'C\u2212', kind: 'Gust', V: ge.VC, n: ge.C[1] });
    L.push({ id: 'D\u2212', kind: 'Gust', V: ge.VD, n: ge.D[1] });
    var mx = L[0], mn = L[0];
    L.forEach(function (c) { c.nW = c.n * W; if (c.n > mx.n) mx = c; if (c.n < mn.n) mn = c; });
    return { list: L, max: mx, min: mn, sp: sp, vn: v, gust: ge };
  };

  /* ---------- Balanced maneuvers ---------- */
  X.cmac = function (ac) { var c = Math.cos(ac.sweepC4 * D2R); return ac.cm0 * ac.A * c * c / (ac.A + 2 * c); };
  X.balance = function (ac, o) {
    var q = 0.5 * RHO0 * o.Ve * o.Ve, nW = o.n * o.W * G0, xcg = ac.macLE + o.xcg * ac.mac, dx = xcg - ac.xAc, lt = ac.xAcH - ac.xAc;
    var Mac = q * ac.S * ac.mac * X.cmac(ac), Lt = (nW * dx + Mac) / lt, Lw = nW - Lt;
    return { q: q, nW: nW, xcg: xcg, dx: dx, lt: lt, Mac: Mac, Lt: Lt, Lw: Lw, CLw: Lw / (q * ac.S), CLh: Lt / (q * ac.Sh) };
  };

  /* ---------- Wing shear and bending ---------- */
  // the wing tanks are filled last and used last, so the fuel above their capacity is in the center tank
  X.fuelSplit = function (ac, Wf) { var w = Math.min(Wf, ac.wingTank); return { wing: w, center: Wf - w }; };
  X.span = function (ac, o) {
    var pf = X.pf(ac), b2 = pf.b / 2, N = o.N || 400, r = ac.r, y1 = ac.tankEnd * b2, i, y, eta, c;
    var Lw = o.L, n = o.n, mw = o.wing == null ? ac.wingFrac * ac.W0 : o.wing, mf = o.fuel || 0;
    // normalizers: wing mass per span ∝ chord over the whole span; fuel ∝ chord² from the side of body to the tank end
    var Ic = 0, If = 0, ys = [], dy = b2 / N;
    for (i = 0; i <= N; i++) ys.push(i * dy);
    function trap(f, a, b) { var m = 200, s = 0, h = (b - a) / m; for (var k = 0; k <= m; k++) s += (k === 0 || k === m ? 0.5 : 1) * f(a + k * h); return s * h; }
    Ic = 2 * trap(function (yy) { return pf.chord(2 * yy / pf.b); }, 0, b2);
    If = 2 * trap(function (yy) { var cc = pf.chord(2 * yy / pf.b); return cc * cc; }, r, y1);
    function lift(yy) { return Lw / pf.b * WG().schrenk(pf, 2 * yy / pf.b).load; }
    function inert(yy) {
      var cc = pf.chord(2 * yy / pf.b), w = mw * cc / Ic;
      if (yy >= r && yy <= y1) w += mf * cc * cc / If;
      return n * G0 * w;
    }
    var net = ys.map(function (yy) { return lift(yy) - inert(yy); });
    var V = new Array(N + 1), M = new Array(N + 1); V[N] = 0; M[N] = 0;
    for (i = N - 1; i >= 0; i--) { V[i] = V[i + 1] + 0.5 * (net[i] + net[i + 1]) * dy; M[i] = M[i + 1] + 0.5 * (V[i] + V[i + 1]) * dy; }
    function at(arr, yy) { var k = Math.min(N - 1, Math.floor(yy / dy)), t = (yy - k * dy) / dy; return arr[k] + t * (arr[k + 1] - arr[k]); }
    return { pf: pf, y: ys, lift: ys.map(lift), inertia: ys.map(inert), net: net, V: V, M: M, b2: b2, r: r, tankEnd: y1,
      Vroot: V[0], Mroot: M[0], Vsob: at(V, r), Msob: at(M, r), at: function (arr, yy) { return at(arr, yy); }, L: Lw, n: n, wing: mw, fuel: mf };
  };
  // bending material of the wing box at ultimate load: the lower (tension) panel at the allowable stress, the upper
  // (compression) panel at the lesser of the allowable and the buckling-limited stress of an optimum stringer panel,
  // sigma = F sqrt(N E / L) (Farrar's efficiency factor F, rib spacing L, load per unit width N)
  X.box = function (ac, sp, m, o) {
    o = o || {};
    var fs = o.fs || 1.5, sig = (o.allow || X.allow(m)) * 1e6, kh = o.kh || 0.9, fr = o.front == null ? 0.15 : o.front, re = o.rear == null ? 0.60 : o.rear;
    var F = o.F || 0.81, Lr = o.L || ac.rib || 0.6, E = m.E * 1e9, sigC = (o.allowC || X.allowC(m)) * 1e6;
    var pf = sp.pf, out = { y: [], N: [], sU: [], tU: [], tL: [], h: [], w: [], mPer: [] }, mass = 0, i, y, c, h, w, N, sU, dy = sp.y[1] - sp.y[0];
    for (i = 0; i < sp.y.length; i++) {
      y = Math.max(sp.y[i], sp.r); c = pf.chord(2 * y / pf.b); h = kh * ac.tc * c; w = (re - fr) * c;
      N = Math.max(0, fs * (sp.y[i] < sp.r ? sp.Msob : sp.M[i])) / (h * w);
      sU = N > 0 ? Math.min(sigC, F * Math.sqrt(N * E / Lr)) : sigC;
      out.y.push(sp.y[i]); out.N.push(N); out.sU.push(sU); out.tU.push(N / sU); out.tL.push(N / sig); out.h.push(h); out.w.push(w);
      out.mPer.push(m.rho * w * (N / sU + N / sig));
    }
    for (i = 0; i < out.y.length - 1; i++) mass += 0.5 * (out.mPer[i] + out.mPer[i + 1]) * dy;
    out.mass = 2 * mass;   // both halves, the carry-through included
    var mL = 0, mU = 0;
    for (i = 0; i < out.y.length - 1; i++) {
      mL += 0.5 * m.rho * (out.w[i] * out.tL[i] + out.w[i + 1] * out.tL[i + 1]) * dy;
      mU += 0.5 * m.rho * (out.w[i] * out.tU[i] + out.w[i + 1] * out.tU[i + 1]) * dy;
    }
    out.lower = 2 * mL; out.upper = 2 * mU;
    // at the side of the fuselage exactly
    c = pf.chord(2 * sp.r / pf.b); h = kh * ac.tc * c; w = (re - fr) * c; N = fs * sp.Msob / (h * w);
    sU = Math.min(sigC, F * Math.sqrt(N * E / Lr));
    out.sob = { c: c, N: N, sU: sU / 1e6, tU: N / sU, tL: N / sig, h: h, w: w, sigma: sig / 1e6, sigC: sigC / 1e6, M: fs * sp.Msob, V: fs * sp.Vsob };
    return out;
  };

  /* ---------- Aircraft ---------- */
  // the business jet as Modules 3 to 10 left it; V_C, M_C, M_D, c_m0 and the wing's mass are this module's choices
  X.PRESETS = [
    { id: 'bizjet', label: 'Business jet (this course)', W0: 6943, Wf: 1990.6, S: 28, A: 8, lam: 0.35, sweepC4: 25, tc: 0.12,
      CLmax: 1.305, CLneg: -0.8, CLland: 2.1, VC: 270 * KT, MC: 0.80, MD: 0.87, mac: 2.0154, macLE: 6.471, xAc: 6.975,
      xAcH: 14.26, Sh: 5.42, cm0: -0.10, cg: [0.15, 0.35], r: 0.80, wingFrac: 0.08, wingTank: 1591, tankEnd: 0.85, rib: 0.6, hMax: 13716 },
    { id: 'narrow', label: 'Narrow-body airliner, 150 seats (illustrative)', W0: 78000, Wf: 18700, S: 122.6, A: 9.5, lam: 0.24, sweepC4: 25, tc: 0.11,
      CLmax: 1.40, CLneg: -0.8, CLland: 2.8, VC: 340 * KT, MC: 0.82, MD: 0.89, mac: 4.19, macLE: 15.9, xAc: 16.95,
      xAcH: 34.0, Sh: 31.0, cm0: -0.08, cg: [0.10, 0.36], r: 1.98, wingFrac: 0.11, wingTank: 15500, tankEnd: 0.85, rib: 0.75, hMax: 12500 },
    { id: 'tprop', label: 'Regional turboprop, 72 seats (illustrative)', W0: 22800, Wf: 5000, S: 61, A: 12, lam: 0.55, sweepC4: 3, tc: 0.15,
      CLmax: 1.70, CLneg: -0.9, CLland: 2.6, VC: 265 * KT, MC: 0.55, MD: 0.62, mac: 2.33, macLE: 11.9, xAc: 12.48,
      xAcH: 25.0, Sh: 11.7, cm0: -0.06, cg: [0.15, 0.40], r: 1.41, wingFrac: 0.10, wingTank: 5000, tankEnd: 0.80, rib: 0.65, hMax: 7620 },
    { id: 'light', label: 'Four-seat light aircraft, Part 23 (illustrative)', W0: 1110, Wf: 145, S: 16.2, A: 7.5, lam: 0.7, sweepC4: 0, tc: 0.15,
      CLmax: 1.60, CLneg: -1.0, CLland: 2.1, VC: 125 * KT, VD: 175 * KT, MC: 0.9, MD: 0.9, n: 3.8, nNeg: -1.52, part23: true, mac: 1.49, macLE: 1.80,
      xAc: 2.17, xAcH: 6.4, Sh: 3.4, cm0: -0.05, cg: [0.16, 0.36], r: 0.55, wingFrac: 0.10, wingTank: 145, tankEnd: 0.55, rib: 0.5, hMax: 4300 }
  ];
  X.preset = function (id) { for (var i = 0; i < X.PRESETS.length; i++) if (X.PRESETS[i].id === id) return JSON.parse(JSON.stringify(X.PRESETS[i])); return null; };

  global.LOADS = X;
})(typeof window !== 'undefined' ? window : this);
