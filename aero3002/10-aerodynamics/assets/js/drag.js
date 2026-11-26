/*!
 * drag.js — DRAG: maximum lift, skin friction, form factors, the parasite drag build-up, induced and wave drag and the
 * drag polar, for Module 10 of Aerospace Design & Practice (Lift and the Drag Build-Up). Plain ES5; DRAG.components and
 * DRAG.evaluate use Module 6's LAYOUT for the geometry.
 *
 * Units: SI (m, m², Pa, kg); angles in degrees unless a name says radians.
 *
 *   DRAG.isa(h)                        standard atmosphere {T, p, rho, a, mu} to 20 km; mu from Sutherland's law
 *   DRAG.cfLam(Re), DRAG.cfTurb(Re, M) flat-plate skin friction: 1.328/sqrt(Re); 0.455/(log Re)^2.58 /(1 + 0.144 M²)^0.65
 *   DRAG.ROUGH, DRAG.cutoffRe(l, k)    surface roughness heights k (m) and the cutoff Reynolds number 38.21 (l/k)^1.053
 *   DRAG.cf(o)                         {cf, cfT, cfL, Reu, cut}: o = {Re, M, lam (laminar share 0-1), l, k}
 *   DRAG.sweepAt(A, lam, sw4, x)       sweep (deg) of the line at chord fraction x, from the quarter-chord sweep
 *   DRAG.ffWing(tc, xm, M, swm)        wing and tail form factor [1 + 0.6 (t/c)/(x/c)m + 100 (t/c)^4][1.34 M^0.18 cos^0.28 Λm]
 *   DRAG.ffBody(f), DRAG.ffNacelle(f)  fuselage 0.9 + 5/f^1.5 + f/400; nacelle 1 + 0.35/f
 *   DRAG.FFALT                         other published form factors (Torenbeek, Hoerner, Shevell) for comparison
 *   DRAG.Q                             interference factors
 *   DRAG.upsweep(u, Amax)              aft-fuselage upsweep drag D/q (m²), u in radians
 *   DRAG.buildup(comps, cond)          the component build-up {rows, sum, misc, lp, CD0}
 *   DRAG.oswald(A), DRAG.K(A, e), DRAG.ldMax(CD0, K), DRAG.clStar(CD0, K)   Oswald factor and the parabolic polar
 *   DRAG.korn(kappa, tc, cl, sweep), DRAG.mcrit(Mdd), DRAG.cdWave(M, Mcr)  drag divergence and wave drag
 *   DRAG.HL, DRAG.clmaxClean(clmax, sweep), DRAG.dCLmax(dcl, SfS, hinge)  high-lift devices
 *   DRAG.flapDrag(F, cfc, SfS, deg), DRAG.gearDrag(list)                    configuration drag (typical values to check)
 *   DRAG.resize(LDc, LDl)              Module 3's business-jet sizing run with a cruise and a loiter L/D {Wx, ff, W0, Wf}
 *   DRAG.PRESETS, DRAG.preset(id), DRAG.components(spec), DRAG.evaluate(spec)   the four aircraft for the Drag Build-Up
 *
 * Sources: skin friction (Raymer eqs. 12.26-12.27; the turbulent form is Schlichting's, as listed in the OpenVSP parasite
 * drag documentation), wing and fuselage form factors (Raymer 12.5.4-12.5.5) and tail interference 1.04 as used in the
 * open aircraft-design notes of the Iowa State computational design lab; nacelle 1 + 0.35/f (Schemensky, OpenVSP);
 * nacelle interference 1.5, 1.3, 1.0 and wing 1.0 or 1.1-1.4 (Raymer, quoted in the OpenVSP forum); Torenbeek, Hoerner
 * and Shevell form factors from the OpenVSP documentation; upsweep 3.83 u^2.5 Amax (Raymer eq. 12.36, ibid.); Oswald
 * factor 1.78(1 - 0.045 A^0.68) - 0.64 (Raymer eq. 12.48, ibid.); high-lift increments (Raymer's Table 12.2 values,
 * the same as Franchini et al. in Arnedo's Fundamentals of Aerospace Engineering). Values to check: the Mach correction
 * of the turbulent skin friction, the cutoff Reynolds number and roughness heights, the leakage-and-protuberance share,
 * the wave-drag rise, the flap and gear drag.
 */
(function (global) {
  'use strict';
  var X = {}, D2R = Math.PI / 180, g = 9.81;
  X.g = g;

  /* ---------- Atmosphere ---------- */
  X.isa = function (h) {
    var T = h <= 11000 ? 288.15 - 0.0065 * h : 216.65;
    var p = h <= 11000 ? 101325 * Math.pow(1 - 2.25577e-5 * h, 5.25588) : 22632.06 * Math.exp(-(h - 11000) / 6341.62);
    var rho = p / (287.053 * T);
    return { T: T, p: p, rho: rho, a: Math.sqrt(1.4 * 287.053 * T), mu: 1.458e-6 * Math.pow(T, 1.5) / (T + 110.4) };
  };

  /* ---------- Skin friction ---------- */
  X.cfLam = function (Re) { return 1.328 / Math.sqrt(Re); };
  X.cfTurb = function (Re, M) { return 0.455 / (Math.pow(Math.log(Re) / Math.LN10, 2.58) * Math.pow(1 + 0.144 * (M || 0) * (M || 0), 0.65)); };
  // equivalent sand-grain roughness heights (m), converted from feet
  X.ROUGH = [
    { id: 'camo', label: 'Camouflage paint on aluminum', k: 3.33e-5 * 0.3048 },
    { id: 'paint', label: 'Smooth paint', k: 2.08e-5 * 0.3048 },
    { id: 'sheet', label: 'Production sheet metal', k: 1.33e-5 * 0.3048 },
    { id: 'polished', label: 'Polished sheet metal', k: 0.50e-5 * 0.3048 },
    { id: 'composite', label: 'Smooth molded composite', k: 0.17e-5 * 0.3048 }
  ];
  X.rough = function (id) { for (var i = 0; i < X.ROUGH.length; i++) if (X.ROUGH[i].id === id) return X.ROUGH[i]; return X.ROUGH[1]; };
  X.cutoffRe = function (l, k) { return 38.21 * Math.pow(l / k, 1.053); };
  // mixed flow: the laminar share at the laminar value, the rest turbulent, both at the component's Reynolds number
  // (the turbulent value at the cutoff Reynolds number if roughness limits it)
  X.cf = function (o) {
    var cut = o.k ? X.cutoffRe(o.l, o.k) : Infinity, Reu = Math.min(o.Re, cut), lam = o.lam || 0;
    var cfT = X.cfTurb(Reu, o.M), cfL = X.cfLam(o.Re);
    return { cf: lam * cfL + (1 - lam) * cfT, cfT: cfT, cfL: cfL, Reu: Reu, cut: cut, rough: o.Re > cut };
  };

  /* ---------- Form factors and interference ---------- */
  X.sweepAt = function (A, lam, sw4, x) { return Math.atan(Math.tan(sw4 * D2R) - 4 / A * (x - 0.25) * (1 - lam) / (1 + lam)) / D2R; };
  X.ffWing = function (tc, xm, M, swm) {
    return (1 + 0.6 / (xm || 0.3) * tc + 100 * Math.pow(tc, 4)) * 1.34 * Math.pow(Math.max(M || 0, 0), 0.18) * Math.pow(Math.cos((swm || 0) * D2R), 0.28);
  };
  X.ffBody = function (f) { return 0.9 + 5 / Math.pow(f, 1.5) + f / 400; };
  X.ffNacelle = function (f) { return 1 + 0.35 / f; };
  X.FFALT = {
    wing: {
      torenbeek: { label: 'Torenbeek', f: function (tc) { return 1 + 2.7 * tc + 100 * Math.pow(tc, 4); } },
      hoerner: { label: 'Hoerner', f: function (tc) { return 1 + 2 * tc + 60 * Math.pow(tc, 4); } },
      shevell: { label: 'Shevell', f: function (tc, M, sw4) { var c = Math.cos((sw4 || 0) * D2R), Z = (2 - M * M) * c / Math.sqrt(1 - M * M * c * c); return 1 + Z * tc + 100 * Math.pow(tc, 4); } }
    },
    body: {
      torenbeek: { label: 'Torenbeek', f: function (f) { return 1 + 2.2 / Math.pow(f, 1.5) + 3.8 / Math.pow(f, 3); } },
      hoerner: { label: 'Hoerner', f: function (f) { return 1 + 1.5 / Math.pow(f, 1.5) + 7 / Math.pow(f, 3); } },
      shevell: { label: 'Shevell', f: function (f) { return 1 + 2.8 / Math.pow(f, 1.5) + 3.8 / Math.pow(f, 3); } }
    }
  };
  X.Q = [
    { id: 'fus', label: 'Fuselage', q: '1.0' },
    { id: 'wingHigh', label: 'High, mid or well-filleted low wing', q: '1.0' },
    { id: 'wingLow', label: 'Unfilleted low wing', q: '1.1 to 1.4' },
    { id: 'tailConv', label: 'Conventional tail', q: '1.04 to 1.05' },
    { id: 'tailV', label: 'V-tail', q: '1.03' },
    { id: 'tailH', label: 'H-tail', q: '1.08' },
    { id: 'nacOn', label: 'Nacelle mounted directly on the wing or fuselage', q: '1.5' },
    { id: 'nacNear', label: 'Nacelle less than about one diameter away', q: '1.3' },
    { id: 'nacFar', label: 'Nacelle well beyond one diameter', q: '1.0' }
  ];
  X.upsweep = function (u, Amax) { return 3.83 * Math.pow(u, 2.5) * Amax; };

  // comps: [{name, kind: 'wing'|'body'|'nacelle', swet, l, tc, xm, swm, f, Q, lam, n}]; cond: {h, M, S, k, misc (m² of D/q), lp (share)}
  X.buildup = function (comps, cond) {
    var a = X.isa(cond.h), V = cond.M * a.a, Rem = a.rho * V / a.mu, rows = [], sum = 0;
    comps.forEach(function (c) {
      var Re = Rem * c.l, C = X.cf({ Re: Re, M: cond.M, lam: c.lam || 0, l: c.l, k: cond.k });
      var ff = c.kind === 'wing' ? X.ffWing(c.tc, c.xm, cond.M, c.swm) : c.kind === 'nacelle' ? X.ffNacelle(c.f) : X.ffBody(c.f);
      var cd = C.cf * ff * c.Q * c.swet / cond.S;
      rows.push({ name: c.name, kind: c.kind, swet: c.swet, l: c.l, Re: Re, cf: C.cf, cfT: C.cfT, rough: C.rough, cut: C.cut, ff: ff, Q: c.Q, cd: cd, f: c.f, tc: c.tc, swm: c.swm });
      sum += cd;
    });
    var misc = (cond.misc || 0) / cond.S, lp = cond.lp == null ? 0.05 : cond.lp, CD0 = (sum + misc) * (1 + lp);
    return { rows: rows, sum: sum, misc: misc, lp: lp, lpCD: (sum + misc) * lp, CD0: CD0, Rem: Rem, V: V, q: 0.5 * a.rho * V * V, atm: a };
  };

  /* ---------- Induced drag and the polar ---------- */
  X.oswald = function (A) { return 1.78 * (1 - 0.045 * Math.pow(A, 0.68)) - 0.64; };
  X.K = function (A, e) { return 1 / (Math.PI * A * e); };
  X.ldMax = function (CD0, K) { return 0.5 / Math.sqrt(CD0 * K); };
  X.clStar = function (CD0, K) { return Math.sqrt(CD0 / K); };

  /* ---------- Compressibility ---------- */
  X.KORN = { conventional: 0.87, supercritical: 0.95 };
  X.korn = function (kappa, tc, cl, sweep) { var c = Math.cos((sweep || 0) * D2R); return kappa / c - tc / (c * c) - cl / (10 * c * c * c); };
  X.mcrit = function (Mdd) { return Mdd - Math.pow(0.1 / 80, 1 / 3); };
  X.cdWave = function (M, Mcr) { return M > Mcr ? 20 * Math.pow(M - Mcr, 4) : 0; };

  /* ---------- High lift ---------- */
  // section increments in c_l,max; fowler: multiply by the extended chord ratio c'/c
  X.HL = [
    { id: 'plain', label: 'Plain or split flap', te: true, dcl: 0.9, fowler: false },
    { id: 'slotted', label: 'Slotted flap', te: true, dcl: 1.3, fowler: false },
    { id: 'fowler', label: 'Fowler flap', te: true, dcl: 1.3, fowler: true },
    { id: 'double', label: 'Double-slotted Fowler flap', te: true, dcl: 1.6, fowler: true },
    { id: 'triple', label: 'Triple-slotted Fowler flap', te: true, dcl: 1.9, fowler: true },
    { id: 'slot', label: 'Fixed slot', te: false, dcl: 0.2, fowler: false },
    { id: 'krueger', label: 'Krueger or drooped leading edge', te: false, dcl: 0.3, fowler: false },
    { id: 'slat', label: 'Slat', te: false, dcl: 0.4, fowler: true }
  ];
  X.hl = function (id) { for (var i = 0; i < X.HL.length; i++) if (X.HL[i].id === id) return X.HL[i]; return null; };
  X.clmaxClean = function (clmax, sweep) { return 0.9 * clmax * Math.cos((sweep || 0) * D2R); };
  X.dCLmax = function (dcl, SfS, hinge) { return 0.9 * dcl * SfS * Math.cos((hinge || 0) * D2R); };
  X.flapDrag = function (F, cfc, SfS, deg) { return F * cfc * SfS * Math.max(0, deg - 10); };   // F 0.0144 plain, 0.0074 slotted
  // D/q (m²) of gear items: list of {cd (per frontal area), w, h (m)}
  X.gearDrag = function (list) { return list.reduce(function (s, it) { return s + it.cd * it.w * it.h * (it.n || 1); }, 0); };

  /* ---------- Module 3's sizing with explicit cruise and loiter L/D ---------- */
  X.BIZ = { Wfix: 980, R: 4600, V: 850, C: 0.65, E: 0.75, Cl: 0.55, a: 1.02 * Math.pow(0.45359237, 0.06), c: -0.06 };
  X.resize = function (LDc, LDl, o) {
    o = o || X.BIZ;
    var Wx = 0.97 * 0.985 * Math.exp(-o.R * o.C / (o.V * LDc)) * Math.exp(-o.E * o.Cl / LDl) * 0.995, ff = 1.06 * (1 - Wx), W = 7000, i;
    for (i = 0; i < 300; i++) { var d = 1 - ff - o.a * Math.pow(W, o.c); if (!(d > 0.002)) return null; var Wn = o.Wfix / d; if (Math.abs(Wn - W) < 1e-7) { W = Wn; break; } W = Wn; }
    return { Wx: Wx, ff: ff, W0: W, Wf: ff * W };
  };

  /* ---------- Presets and the whole build-up ---------- */
  // layout: a LAYOUT preset; nac: {D, l} to replace the placeholder nacelles; h, M: cruise; wf: weight fraction at mid-cruise;
  // xm: chordwise position of maximum thickness; Qw, Qn: wing and nacelle interference; lam: laminar share on the wing and
  // tails; rough: a DRAG.ROUGH id; lp: leakage and protuberance share; kappa: Korn's airfoil factor; clmax: section c_l,max
  X.PRESETS = [
    { id: 'bizjet', label: 'Business jet (from the lessons)', layout: 'bizjet', nac: { D: 0.7971, l: 1.7702 }, h: 12000, M: 0.80, wf: 0.90, xm: 0.30, Qw: 1.0, Qn: 1.3, lam: 0, rough: 'paint', lp: 0.05, kappa: 0.95, clmax: 1.6 },
    { id: 'narrow', label: 'Narrow-body airliner, 150 seats (illustrative)', layout: 'narrow', nac: null, h: 11000, M: 0.78, wf: 0.90, xm: 0.35, Qw: 1.0, Qn: 1.3, lam: 0, rough: 'paint', lp: 0.04, kappa: 0.95, clmax: 1.6 },
    { id: 'tprop', label: 'Regional turboprop, 72 seats (illustrative)', layout: 'tprop', nac: null, h: 7000, M: 0.45, wf: 0.95, xm: 0.30, Qw: 1.0, Qn: 1.5, lam: 0.10, rough: 'paint', lp: 0.06, kappa: 0.87, clmax: 1.7 },
    { id: 'commuter', label: 'Commuter turboprop, 18 seats (illustrative)', layout: 'commuter', nac: null, h: 5000, M: 0.40, wf: 0.95, xm: 0.30, Qw: 1.1, Qn: 1.5, lam: 0.10, rough: 'sheet', lp: 0.08, kappa: 0.87, clmax: 1.7 }
  ];
  X.preset = function (id) { for (var i = 0; i < X.PRESETS.length; i++) if (X.PRESETS[i].id === id) return JSON.parse(JSON.stringify(X.PRESETS[i])); return null; };
  X.components = function (sp) {
    var LA = global.LAYOUT, ls = LA.preset(sp.layout);
    if (sp.nac) { ls.eng.D = sp.nac.D; ls.eng.l = sp.nac.l; }
    var R = LA.evaluate(ls), G = R.G, w = ls.wing, t = ls.tail, e = ls.eng;
    var htpf = LA.planform(R.SHT, t.hA, t.hLam), xm = sp.xm || 0.3;
    var comps = [
      { name: 'Wing', kind: 'wing', swet: R.swet.wing, l: R.wpf.mac, tc: w.tc, xm: xm, swm: X.sweepAt(w.A, w.lam, w.sweep, xm), Q: sp.Qw, lam: sp.lam },
      { name: 'Fuselage', kind: 'body', swet: R.swet.fus, l: R.lF, f: R.lF / R.d, Q: 1.0, lam: 0 },
      { name: 'Horizontal tail', kind: 'wing', swet: R.swet.ht, l: htpf.mac, tc: t.tc, xm: xm, swm: X.sweepAt(t.hA, t.hLam, t.hSweep, xm), Q: 1.04, lam: sp.lam },
      { name: 'Vertical tail', kind: 'wing', swet: R.swet.vt, l: G.vt.mac, tc: t.tc, xm: xm, swm: X.sweepAt(2 * t.vA, t.vLam, t.vSweep, xm), Q: 1.04, lam: sp.lam }
    ];
    if (R.swet.nac > 0) comps.push({ name: 'Nacelles', kind: 'nacelle', swet: R.swet.nac, l: e.l, f: e.l / e.D, Q: sp.Qn, lam: 0 });
    var u = Math.atan(0.5 * (G.zTop(G.lF) + G.zBot(G.lF)) / G.lTail), Amax = Math.PI * R.d * R.d / 4;
    return { comps: comps, lay: R, G: G, u: u, Amax: Amax, S: w.S, A: w.A, sweep: w.sweep, tc: w.tc, lam: w.lam, W0: ls.W0, Cfe: ls.Cfe };
  };
  X.evaluate = function (sp) {
    var C = X.components(sp), k = X.rough(sp.rough).k, misc = X.upsweep(C.u, C.Amax);
    var B = X.buildup(C.comps, { h: sp.h, M: sp.M, S: C.S, k: k, misc: misc, lp: sp.lp });
    var e = X.oswald(C.A), K = X.K(C.A, e), CL = sp.wf * C.W0 * g / (B.q * C.S);
    var Mdd = X.korn(sp.kappa, C.tc, CL, C.sweep), Mcr = X.mcrit(Mdd), cdw = X.cdWave(sp.M, Mcr), CD = B.CD0 + K * CL * CL + cdw;
    var R = { sp: sp, C: C, B: B, CD0: B.CD0, e: e, K: K, LDmax: X.ldMax(B.CD0, K), CLstar: X.clStar(B.CD0, K), CL: CL, Mdd: Mdd, Mcr: Mcr, cdw: cdw, CD: CD, LD: CL / CD,
      upsweep: { u: C.u, Amax: C.Amax, Dq: misc }, cfeEq: B.CD0 * C.S / C.lay.swet.total, cd0Cfe: C.Cfe * C.lay.swet.total / C.S, clmaxClean: X.clmaxClean(sp.clmax, C.sweep) };
    return R;
  };

  global.DRAG = X;
})(typeof window !== 'undefined' ? window : this);
