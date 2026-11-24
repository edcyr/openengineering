/*
 * design.js — DESIGN: the business jet's design loop closed, its performance and its cost
 * (Module 13 of Conceptual Aircraft Design: Performance, Cost and Trade Studies).
 * Needs layout.js (LAYOUT), weights.js (WEIGHTS), stability.js (STAB) and drag.js (DRAG), loaded first.
 *
 *   DESIGN.base()                 the business jet as Modules 3 to 12 left it (design inputs d)
 *   DESIGN.layout(d, W0, ff)      Module 6's layout at this takeoff weight: wing at d.ws, tails at d's volume coefficients,
 *                                 rubber engines at d.tw (thrust ∝ W0; nacelle D ∝ SF^0.5, l ∝ SF^0.4)
 *   DESIGN.aero(R, d)             Module 9's polar for that layout: cd0(h, M), K, e, cdw(CL, M), cd(h, M, CL), ldMax(h, M)
 *   DESIGN.weights(d, W0, ff, R)  Module 11's group weights for that layout, calibrated with Module 11's k
 *   DESIGN.mission(d, W0, A, R)   Module 3's mission with the real polar: cruise in steps at constant altitude and Mach
 *   DESIGN.close(d)               the converged design: W0, fuel fraction, empty weight, geometry, polar, history
 *   performance, field lengths and cost: see below
 */
(function (global) {
  'use strict';
  if (global.DESIGN) return;
  var X = {}, G0 = 9.80665, D2R = Math.PI / 180, RHO0 = 1.225;
  X.G0 = G0;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function isa(h) { return global.DRAG.isa(h); }
  X.isa = isa;

  /* ---------- The business jet as Modules 3 to 12 left it ---------- */
  var BASE = null;
  X.base = function () {
    if (BASE) return clone(BASE);
    var W = global.WEIGHTS, ST = global.STAB, sp = ST.preset('bizjet'), D = ST.design(sp), L = ST.layoutFor(sp, D.dx, D.g.Sh, D.g.Sv);
    var ws = W.preset('bizjet'), k = W.statement(ws, { k: 'm3' }).k, dp = global.DRAG.preset('bizjet');
    BASE = {
      ws: 250, tw: 0.31,                                           // Module 5's design point: kg/m² and T/W
      spec: L.spec,                                                // Module 6's layout with Module 11's and 11's wing and tails
      cHT: L.spec.tail.cHT, cVT: L.spec.tail.cVT,                  // Module 12's tail volume coefficients
      eng: { n: 2, T: 10560, W: 200.8, D: 0.7971, l: 1.7702 },     // Module 7's rubber FJ44-3A: N per engine, kg, nacelle m
      Wfix: 980, k: k,                                             // crew and payload (Module 3); Module 11's calibration
      mission: { R: 4600, M: 0.80, h: 12000, E: 0.75, Cc: 0.65, Cl: 0.55, to: 0.970, cl: 0.985, land: 0.995, res: 1.06, steps: 20 },
      drag: dp,                                                    // Module 9's build-up settings
      clmax: { clean: 1.305, to: 1.7, land: 2.1 }, land: 0.9
    };
    return clone(BASE);
  };

  /* ---------- The layout at a takeoff weight ---------- */
  X.engineAt = function (d, W0) {
    var T = d.tw * W0 * G0 / d.eng.n, SF = T / d.eng.T;
    return { T: T, SF: SF, W: d.eng.W * Math.pow(SF, 1.1), D: d.eng.D * Math.pow(SF, 0.5), l: d.eng.l * Math.pow(SF, 0.4) };
  };
  X.layout = function (d, W0, ff) {
    var ls = clone(d.spec), e = X.engineAt(d, W0);
    ls.W0 = W0; ls.fuelFrac = ff; ls.wing.S = W0 / d.ws;
    if (d.wing) Object.keys(d.wing).forEach(function (k) { ls.wing[k] = d.wing[k]; });
    ls.tail.cHT = d.cHT; ls.tail.cVT = d.cVT; ls.eng.D = e.D; ls.eng.l = e.l;
    var R = global.LAYOUT.evaluate(ls); R.engine = e; return R;
  };

  /* ---------- The polar (Module 9's build-up for this layout) ---------- */
  X.aero = function (R, d) {
    var DR = global.DRAG, ls = R.sp, w = ls.wing, t = ls.tail, e = ls.eng, Gm = R.G, sp = d.drag, xm = sp.xm || 0.3;
    var htpf = global.LAYOUT.planform(R.SHT, t.hA, t.hLam);
    var comps = [
      { name: 'Wing', kind: 'wing', swet: R.swet.wing, l: R.wpf.mac, tc: w.tc, xm: xm, swm: DR.sweepAt(w.A, w.lam, w.sweep, xm), Q: sp.Qw, lam: sp.lam },
      { name: 'Fuselage', kind: 'body', swet: R.swet.fus, l: R.lF, f: R.lF / R.d, Q: 1.0, lam: 0 },
      { name: 'Horizontal tail', kind: 'wing', swet: R.swet.ht, l: htpf.mac, tc: t.tc, xm: xm, swm: DR.sweepAt(t.hA, t.hLam, t.hSweep, xm), Q: 1.04, lam: sp.lam },
      { name: 'Vertical tail', kind: 'wing', swet: R.swet.vt, l: Gm.vt.mac, tc: t.tc, xm: xm, swm: DR.sweepAt(2 * t.vA, t.vLam, t.vSweep, xm), Q: 1.04, lam: sp.lam },
      { name: 'Nacelles', kind: 'nacelle', swet: R.swet.nac, l: e.l, f: e.l / e.D, Q: sp.Qn, lam: 0 }
    ];
    var u = Math.atan(0.5 * (Gm.zTop(Gm.lF) + Gm.zBot(Gm.lF)) / Gm.lTail), Amax = Math.PI * R.d * R.d / 4, misc = DR.upsweep(u, Amax), k = DR.rough(sp.rough).k;
    var eO = DR.oswald(w.A), K = DR.K(w.A, eO), S = w.S, cache = {};
    var A = {
      S: S, A: w.A, e: eO, K: K, comps: comps,
      build: function (h, M) { var key = Math.round(h) + ':' + M.toFixed(3); return cache[key] || (cache[key] = DR.buildup(comps, { h: h, M: M, S: S, k: k, misc: misc, lp: sp.lp })); },
      cd0: function (h, M) { return A.build(h, M).CD0; },
      cdw: function (CL, M) { var Mdd = DR.korn(sp.kappa, w.tc, CL, w.sweep); return DR.cdWave(M, DR.mcrit(Mdd)); },
      mdd: function (CL) { return DR.korn(sp.kappa, w.tc, CL, w.sweep); },
      cd: function (h, M, CL) { return A.cd0(h, M) + K * CL * CL + A.cdw(CL, M); },
      ldMax: function (h, M) { return DR.ldMax(A.cd0(h, M), K); },
      clStar: function (h, M) { return DR.clStar(A.cd0(h, M), K); }
    };
    return A;
  };

  /* ---------- Group weights for this layout (Module 11's equations and calibration) ---------- */
  X.weights = function (d, W0, ff, R) {
    var WT = global.WEIGHTS, ws = WT.preset('bizjet'); ws.ff = ff;
    var P = WT.inputs(ws, { W0: W0 }), pf = R.wpf, e = R.engine, f = pf.S / P.wing.S, c = ws.ctl, ls = R.sp;
    P.Sflap *= f; P.Sail *= f;
    // the design load factor for this design's own wing (Module 10: the larger of the maneuvering and gust limits)
    var Nz = 1.5 * WT.nDesign(ws, W0, pf.S, pf.A, pf.lam, ls.wing.sweep);
    P.Nz = Nz; P.nDes = Nz / 1.5; P.wing.Nz = Nz; P.ht.Nz = Nz; P.vt.Nz = Nz; P.fus.Nz = Nz; P.nac.Nz = Nz;
    P.wing.S = pf.S; P.wing.b = pf.b; P.wing.mac = pf.mac; P.wing.A = pf.A; P.wing.Scsw = P.Sflap + P.Sail; P.mac = pf.mac;
    var Sht = R.SHT, Svt = R.SVT;
    P.ht.Sht = Sht; P.ht.Bh = R.G.ht.pf.b; P.ht.Lt = R.LHT; P.ht.Ky = 0.3 * R.LHT; P.ht.Se = c.elev * Sht;
    P.vt.Svt = Svt; P.vt.Lt = R.LVT; P.vt.Kz = R.LVT;
    P.Weng = d.eng.n * e.W; P.nac.Wen = e.W; P.nac.Nlt = e.l; P.nac.Nw = e.D; P.nac.Sn = Math.PI * e.D * e.l; P.st.Wen = e.W;
    P.fs.Vt = ff * W0 / (ls.rhoF || 800);
    P.fc.Scs = P.Sflap + P.Sail + c.elev * Sht + c.rud * Svt; P.fc.Iy = W0 * Math.pow(0.3 * R.LHT, 2);
    P.ins.Bw = pf.b; P.hyd.Bw = pf.b;
    P.fus.Kws = WT.eq.Kws(pf.lam, pf.b, ls.wing.sweep, R.lF);
    P.main.Vs = WT.stallSpeed(P.Wl, pf.S, ws.clL);
    var rows = [], Wstat = 0, Wcat = 0, groups = { struct: 0, prop: 0, equip: 0 };
    WT.ROWS.forEach(function (r) {
      var raw = r.id === 'eng' ? P.Weng : WT.eq[r.eq](P[r.id]), kg = r.id === 'eng' ? raw : d.k * raw;
      if (r.id === 'eng') Wcat += raw; else Wstat += raw;
      groups[r.group] += kg; rows.push({ id: r.id, name: r.name, group: r.group, raw: raw, kg: kg });
    });
    var We = d.k * Wstat + Wcat;
    return { P: P, rows: rows, groups: groups, We: We, Wstat: Wstat, Wcat: Wcat, frac: We / W0 };
  };

  /* ---------- The mission with the real polar ---------- */
  // Module 3's mission: warm-up and takeoff, climb, cruise R km at M and h (in steps, at constant altitude and Mach),
  // loiter E h at (L/D)max, landing; 6% for reserves and trapped fuel. C in 1/h (Breguet).
  X.mission = function (d, W0, A, R) {
    var m = d.mission, at = isa(m.h), V = m.M * at.a, q = 0.5 * at.rho * V * V, S = R.wpf.S, Vk = V * 3.6;
    var W = W0 * m.to * m.cl, W1 = W, n = m.steps || 20, dR = m.R / n, seg = [], sumLD = 0;
    for (var i = 0; i < n; i++) {
      var CL0 = W * G0 / (q * S), Wp = W * Math.exp(-dR * m.Cc / (Vk * CL0 / A.cd(m.h, m.M, CL0))), Wm = 0.5 * (W + Wp);   // midpoint step
      var CL = Wm * G0 / (q * S), LD = CL / A.cd(m.h, m.M, CL), Wn = W * Math.exp(-dR * m.Cc / (Vk * LD));
      seg.push({ x: (i + 0.5) * dR, W: Wm, CL: CL, LD: LD }); sumLD += LD; W = Wn;
    }
    var W2 = W, LDm = A.ldMax(m.h, m.M); W = W * Math.exp(-m.E * m.Cl / LDm);
    var W3 = W; W = W * m.land;
    var Wx = W / W0, ff = m.res * (1 - Wx);
    return { V: V, q: q, Wcruise: [W1, W2], Wloiter: W3, Wend: W, Wx: Wx, ff: ff, Wf: ff * W0, LDcruise: sumLD / n, LDstart: seg[0].LD, LDend: seg[n - 1].LD,
      CLstart: seg[0].CL, CLend: seg[n - 1].CL, LDmax: LDm, seg: seg, cruiseFuel: W1 - W2, time: m.R / Vk + m.E };
  };

  /* ---------- Closing the loop ---------- */
  X.close = function (d, o) {
    o = o || {};
    var W0 = o.W0 || 6943, ff = o.ff || 0.2867, hist = [], R, A, M, Wt, ok = true;
    for (var i = 0; i < 120; i++) {
      R = X.layout(d, W0, ff); A = X.aero(R, d); M = X.mission(d, W0, A, R); Wt = X.weights(d, W0, M.ff, R);
      var Wn = d.Wfix + M.ff * W0 + Wt.We;
      hist.push({ W0: W0, ff: M.ff, We: Wt.We, LD: M.LDcruise, next: Wn });
      if (!(Wn > 0) || Wn > 200000) { ok = false; break; }
      if (Math.abs(Wn - W0) < 0.05 && Math.abs(M.ff - ff) < 1e-6) { W0 = Wn; ff = M.ff; break; }
      W0 = W0 + 0.6 * (Wn - W0); ff = M.ff;
    }
    R = X.layout(d, W0, ff); A = X.aero(R, d); M = X.mission(d, W0, A, R); Wt = X.weights(d, W0, M.ff, R);
    return { ok: ok && i < 120, d: d, W0: W0, ff: M.ff, We: Wt.We, Wt: Wt, R: R, A: A, M: M, hist: hist, S: R.wpf.S, b: R.wpf.b, T: R.engine.T, eng: R.engine,
      vFuel: M.ff * W0 / (R.sp.rhoF || 800), vTank: R.vTank };
  };

  /* ---------- Thrust, drag and level flight ---------- */
  // Thrust available: n × static thrust × σ (the course's lapse since Module 5; optimistic at high Mach, see Module 7)
  X.thrust = function (c, h) { return c.d.eng.n * c.T * isa(h).rho / RHO0; };
  X.drag = function (c, h, V, W) {
    var at = isa(h), q = 0.5 * at.rho * V * V, M = V / at.a, CL = W * G0 / (q * c.S);
    return { q: q, M: M, CL: CL, CD: c.A.cd(h, Math.min(M, 0.95), CL), D: q * c.S * c.A.cd(h, Math.min(M, 0.95), CL) };
  };
  // The thrust a condition needs, as a sea-level static T/W at takeoff weight: cruise or climb at h and M from beta W0
  X.twNeeded = function (c, h, M, beta, fpm) {
    var at = isa(h), V = M * at.a, W = beta * c.W0, Dr = X.drag(c, h, V, W).D;
    return (Dr + W * G0 * (fpm || 0) * 0.00508 / V) / (c.W0 * G0 * at.rho / RHO0);
  };
  // Rate of climb (m/s) at h, V and weight W (kg)
  X.roc = function (c, h, V, W) { return V * (X.thrust(c, h) - X.drag(c, h, V, W).D) / (W * G0); };

  /* ---------- Field lengths: Torenbeek's method (Synthesis of Subsonic Airplane Design, 1976, §5.4.5-5.4.6),
     as implemented in AeroSandbox's field_length_analysis_torenbeek ---------- */
  // o {W (kg), T (N, total, at liftoff), S, CLmaxTO, LDclimb, CD0 (takeoff config), n, mu 0.02, brake 0.37 (g), tInertia 4.5 s,
  //    hTO 35 ft, Wland, CLmaxL, hL 50 ft, gammaApp 3°, vtd 1.15 (touchdown / stall)}
  X.FT = 0.3048;
  X.field = function (o) {
    var g = G0, rho = RHO0, mu = o.mu == null ? 0.02 : o.mu, ab = o.brake == null ? 0.37 : o.brake, ti = o.tInertia == null ? 4.5 : o.tInertia;
    var hTO = (o.hTO == null ? 35 : o.hTO) * X.FT, TW = o.T / (o.W * g), gam = TW - 1 / o.LDclimb;
    var Vs = Math.sqrt(2 * o.W * g / (rho * o.S * o.CLmaxTO)), V2 = 1.3 * Vs;
    var VLOF = V2 * Math.max(Math.pow(1 + gam * Math.SQRT2, -0.5), 1.2 / 1.3);
    var muP = mu + 0.72 * o.CD0 / o.CLmaxTO, a = TW - muP;
    var sG = VLOF * VLOF / (2 * g * a), sA = VLOF * VLOF / (g * Math.SQRT2) + hTO / gam, sTO = sG + sA;
    var gamOEI = TW * (o.n - 1) / o.n - 1 / o.LDclimb, gMin = o.n === 2 ? 0.024 : o.n === 3 ? 0.027 : 0.030, gbar = 0.06 + (gamOEI - gMin);
    var BFL = VLOF * VLOF / (2 * g * (1 + gbar / ab)) * (1 / a + 1 / ab) * (1 + 2 * g * hTO / (VLOF * VLOF)) + ti * VLOF;
    BFL = Math.max(BFL, sTO);
    var out = { Vs: Vs, V2: V2, VLOF: VLOF, gamma: gam, gammaOEI: gamOEI, gMin: gMin, gbar: gbar, muP: muP, accel: a, ground: sG, air: sA, takeoff: sTO, BFL: BFL, FAR: Math.max(BFL, 1.15 * sTO) };
    if (o.Wland) {
      var VsL = Math.sqrt(2 * o.Wland * g / (rho * o.S * o.CLmaxL)), Va = 1.3 * VsL, Vtd = (o.vtd || 1.15) * VsL, hL = (o.hL == null ? 50 : o.hL) * X.FT, gb = 2 * Math.tan((o.gammaApp || 3) * D2R);
      var lA = ((Va * Va - Vtd * Vtd) / (2 * g) + hL) / gb, lG = ti * Vtd + Vtd * Vtd / (2 * g * ab);
      out.land = { Vs: VsL, Va: Va, Vtd: Vtd, air: lA, ground: lG, total: lA + lG, field: (lA + lG) / 0.6 };
    }
    return out;
  };
  X.fieldOf = function (c, o) {
    o = o || {}; var d = c.d;
    return X.field({ W: c.W0, T: (o.lapse == null ? 0.9 : o.lapse) * d.eng.n * c.T, S: c.S, CLmaxTO: d.clmax.to, LDclimb: d.ldTO || 12.0, CD0: d.cd0TO || 0.035, n: d.eng.n,
      Wland: d.land * c.W0, CLmaxL: d.clmax.land, tInertia: o.tInertia, brake: o.brake, vtd: o.vtd });
  };

  /* ---------- Sizing the thrust too: Module 5's requirements with the closed design's polar ---------- */
  // d.req {ceilH 12000, ceilFpm 300, beta 0.9555, oei 0.024, bfl 1200, land 840}; returns each requirement's T/W
  X.REQ = { ceilH: 12000, ceilFpm: 300, beta: 0.9555, oei: 0.024, bfl: 1200, land: 840 };
  X.twRequired = function (c) {
    var d = c.d, r = d.req || X.REQ, m = d.mission;
    var cruise = X.twNeeded(c, m.h, m.M, r.beta, 0), ceil = X.twNeeded(c, Math.max(r.ceilH, m.h), m.M, r.beta, r.ceilFpm);
    var oei = d.eng.n / (d.eng.n - 1) * (r.oei + 1 / (d.ldTO || 12.0)), lo = 0.1, hi = 1.0;
    for (var j = 0; j < 40; j++) { var mid = 0.5 * (lo + hi); if (X.fieldOf(Object.assign({}, c, { T: mid * c.W0 * G0 / d.eng.n })).FAR > r.bfl) lo = mid; else hi = mid; }
    var all = { cruise: cruise, ceiling: ceil, oei: oei, takeoff: hi }, max = 0, by = null;
    Object.keys(all).forEach(function (k) { if (all[k] > max) { max = all[k]; by = k; } });
    return { each: all, tw: max, by: by };
  };
  // close the weight loop and the thrust loop together (d.tw = 'auto'), or the weight loop alone (d.tw a number)
  X.size = function (d) {
    if (d.tw !== 'auto') return X.close(d);
    var dd = clone(d), tw = 0.31, c, hist = [];
    for (var i = 0; i < 40; i++) {
      dd.tw = tw; c = X.close(dd, c ? { W0: c.W0, ff: c.ff } : null); var r = X.twRequired(c);
      hist.push({ tw: tw, W0: c.W0, need: r.tw, by: r.by });
      if (Math.abs(r.tw - tw) < 2e-5) break;
      tw = tw + 0.8 * (r.tw - tw);
    }
    c.twReq = X.twRequired(c); c.twHist = hist; c.d.twAuto = true; return c;
  };

  /* ---------- Speeds, ceilings and climb ---------- */
  // highest speed (m/s) at which thrust meets drag at h and weight W, searched up to Mach mMax
  X.vMax = function (c, h, W, mMax) {
    var at = isa(h), hi = (mMax || 0.95) * at.a, lo = Math.sqrt(2 * W * G0 / (at.rho * c.S * c.d.clmax.clean));
    if (X.thrust(c, h) < X.drag(c, h, hi, W).D) {
      var best = null; for (var V = hi; V >= lo; V -= 1) { if (X.thrust(c, h) >= X.drag(c, h, V, W).D) { best = V; break; } } return best;
    }
    return hi;
  };
  X.vMin = function (c, h, W) {                          // the lower of the stall speed and the low-speed thrust limit
    var at = isa(h), vs = Math.sqrt(2 * W * G0 / (at.rho * c.S * c.d.clmax.clean));
    for (var V = vs; V < 0.95 * at.a; V += 1) if (X.thrust(c, h) >= X.drag(c, h, V, W).D) return { V: V, stall: V === vs, vs: vs };
    return null;
  };
  // best climb rate at h (search over speed), m/s, and the speed for it
  X.bestClimb = function (c, h, W) {
    var at = isa(h), vs = Math.sqrt(2 * W * G0 / (at.rho * c.S * c.d.clmax.clean)), best = { roc: -1e9, V: null };
    for (var V = 1.2 * vs; V <= 0.9 * at.a; V += 2) { var r = X.roc(c, h, V, W); if (r > best.roc) best = { roc: r, V: V, M: V / at.a }; }
    return best;
  };
  // the altitude where the best climb rate falls to fpm (ft/min), searched in 50 m steps
  X.ceiling = function (c, W, fpm) {
    var need = fpm * 0.00508, last = null;
    for (var h = 0; h <= 18000; h += 50) { var b = X.bestClimb(c, h, W); if (b.roc < need) return last; last = h; }
    return last;
  };
  // time (min) and fuel to climb from 0 to h at the best climb speed, in 250 m steps, fuel with C (1/h)
  X.climbTo = function (c, h, W, C) {
    var t = 0, Wn = W, steps = [];
    for (var z = 0; z < h; z += 250) {
      var b = X.bestClimb(c, z + 125, Wn); if (!(b.roc > 0.05)) return null;
      var dt = 250 / b.roc; t += dt; var dW = Wn * (1 - Math.exp(-(C || 0.65) * dt / 3600 * (X.thrust(c, z + 125) / (Wn * G0)))); Wn -= dW;
      steps.push({ h: z + 125, roc: b.roc, V: b.V, t: t / 60 });
    }
    return { min: t / 60, fuel: W - Wn, steps: steps };
  };

  /* ---------- Range ---------- */
  // specific air range (km per kg of fuel) at h, M and weight W, with Breguet's C (1/h)
  X.specificRange = function (c, h, M, W, C) {
    var at = isa(h), V = M * at.a, Dr = X.drag(c, h, V, W).D, ff = (C || c.d.mission.Cc) / 3600 * Dr / G0;    // kg/s
    return V / 1000 / ff;
  };
  // Breguet range (km) at constant altitude and Mach from W1 to W2 (kg), in steps
  X.rangeAt = function (c, h, M, W1, W2, C, n) {
    n = n || 40; var dW = (W1 - W2) / n, Rk = 0;
    for (var i = 0; i < n; i++) Rk += X.specificRange(c, h, M, W1 - (i + 0.5) * dW, C) * dW;
    return Rk;
  };
  // payload-range: the mission's allowances held (takeoff, climb, landing fractions; loiter and 6% reserves);
  // points: max payload with fuel to the takeoff weight; max fuel (tanks) with payload traded; ferry (no payload)
  X.payloadRange = function (c) {
    var d = c.d, m = d.mission, Wo = c.We + (d.Wfix - 800), payMax = 800, fuelMax = c.vTank * (c.R.sp.rhoF || 800), at = isa(m.h);
    function rangeFor(W0, Wf) {
      var Wx = 1 - Wf / (m.res * W0);                                  // end-of-mission fraction implied by usable fuel
      var W1 = W0 * m.to * m.cl, Wend = W0 * Wx / m.land, Wl = Wend / Math.exp(-m.E * m.Cl / c.A.ldMax(m.h, m.M));
      return Wl < W1 ? X.rangeAt(c, m.h, m.M, W1, Wl) : 0;
    }
    var P = [{ R: 0, pay: payMax, W0: Wo + payMax, fuel: 0 }], fA = Math.min(c.W0 - Wo - payMax, fuelMax), WA = Wo + payMax + fA;
    P.push({ R: rangeFor(WA, fA), pay: payMax, W0: WA, fuel: fA, tankLimited: fA < c.W0 - Wo - payMax });
    if (fuelMax > fA) { var pB = Math.max(0, c.W0 - Wo - fuelMax), WB = Wo + pB + fuelMax; P.push({ R: rangeFor(WB, fuelMax), pay: pB, W0: WB, fuel: fuelMax }); }
    var fC = Math.min(fuelMax, c.W0 - Wo); P.push({ R: rangeFor(Wo + fC, fC), pay: 0, W0: Wo + fC, fuel: fC });
    return { points: P, Wo: Wo, fuelMax: fuelMax };
  };

  /* ---------- Cost: Raymer's DAPCA IV in metric units (5th ed. §18.4.2), as implemented in AeroSandbox ---------- */
  // o {We kg, Vmax km/h, Q aircraft, FTA 4, cpi 1.327 (2012 → 2024), rates {E 115, T 118, M 98, Q 108} 2012 $/h, material 'aluminum',
  //    engine $ each (present-day), nEng, avionics $ each (present-day), pax, interiors $/seat 2012}
  X.DAPCA = { rates: { E: 115, T: 118, M: 98, Q: 108 }, cpi: 1.327 };
  X.dapca = function (o) {
    var W = o.We, V = o.Vmax, Q = o.Q, r = o.rates || X.DAPCA.rates, cpi = o.cpi || X.DAPCA.cpi, mat = o.matFactor || 1;
    var H = { E: 5.18 * Math.pow(W, 0.777) * Math.pow(V, 0.894) * Math.pow(Q, 0.163) * mat, T: 7.22 * Math.pow(W, 0.777) * Math.pow(V, 0.696) * Math.pow(Q, 0.263) * mat,
      M: 10.5 * Math.pow(W, 0.82) * Math.pow(V, 0.484) * Math.pow(Q, 0.641) * mat };
    H.Q = H.M * (o.cargo ? 0.076 : 0.133);
    var c12 = { eng: H.E * r.E, tool: H.T * r.T, mfg: H.M * r.M, qc: H.Q * r.Q, dev: 67.4 * Math.pow(W, 0.630) * Math.pow(V, 1.3),
      ft: 1947 * Math.pow(W, 0.325) * Math.pow(V, 0.822) * Math.pow(o.FTA || 4, 1.21), mat: 31.2 * Math.pow(W, 0.921) * Math.pow(V, 0.621) * Math.pow(Q, 0.799),
      interiors: Q * (o.pax || 0) * (o.interior == null ? 3500 : o.interior) };
    var cost = {}; Object.keys(c12).forEach(function (k) { cost[k] = c12[k] * cpi; });
    cost.engines = (o.engine || 0) * (o.nEng || 2) * Q; cost.avionics = (o.avionics || 0) * Q;
    var tot = 0; Object.keys(cost).forEach(function (k) { tot += cost[k]; });
    return { hours: H, cost: cost, total: tot, perAircraft: tot / Q };
  };

  /* ---------- Operating cost per flight (after AeroSandbox's direct-operating-cost model, with fuel for energy and the
     interest of a loan repaid over the aircraft's life) ---------- */
  // o {price $ (aircraft), hoursYear, years 20, resale 0.4, rate 0.04, crew n, crewYear $, pax, block h, fuel kg, fuelPrice $/kg, mtow kg}
  X.operating = function (o) {
    var flights = o.hoursYear / o.block, P = o.price, life = o.years || 20;
    var c = {};
    c.depreciation = P * (1 - (o.resale == null ? 0.4 : o.resale)) / (flights * life);
    var r = o.rate == null ? 0.04 : o.rate;                       // interest on a loan repaid in equal payments over the life
    c.financing = P * (r * life / (1 - Math.pow(1 + r, -life)) - 1) / (flights * life);
    c.insurance = P * 0.025 * Math.sqrt((o.pax + o.crew + 1) / 11) * Math.sqrt(o.hoursYear / 1200) / flights;
    c.airframeMx = P / 3e6 * (65 * o.block + 65);
    c.engineMx = P / 3e6 * (58 * o.block + 50);
    c.fuel = o.fuel * o.fuelPrice;
    c.crew = o.crew * o.crewYear / flights;
    c.fees = 1.20 * o.mtow / 1000 + 50 + 35 + 4.50 * o.pax;
    var direct = 0; Object.keys(c).forEach(function (k) { direct += c[k]; });
    c.indirect = 0.2 * direct;
    return { items: c, direct: direct, total: direct + c.indirect, perHour: (direct + c.indirect) / o.block, flights: flights };
  };

  /* ---------- The cost assumptions (this module's; see Lessons 6 and 7) ---------- */
  X.COST = { Q: 500, FTA: 4, engineRef: 1.2e6, engineRefT: 15400, avionics: 0.8e6, profit: 0.15, interior: 3500,
    hoursYear: 450, crew: 2, crewYear: 150000, fuelPrice: 0.85, years: 20, resale: 0.4, rate: 0.04, taxi: 0.25 };
  // acquisition and operating cost of a sized design c
  X.economics = function (c, o) {
    o = Object.assign({}, X.COST, o || {});
    var Wc = 0.9555 * c.W0, vmx = 0;
    [6000, 8000, 10000].forEach(function (z) { vmx = Math.max(vmx, X.vMax(c, z, Wc, 0.95) || 0); });
    var eng = o.engineRef * c.T / o.engineRefT;
    var P = X.dapca({ We: c.We, Vmax: vmx * 3.6, Q: o.Q, FTA: o.FTA, engine: eng, nEng: c.d.eng.n, avionics: o.avionics, pax: 8, interior: o.interior });
    var price = P.perAircraft * (1 + o.profit), block = c.M.time + o.taxi, fuel = c.M.Wf / c.d.mission.res;
    var op = X.operating({ price: price, hoursYear: o.hoursYear, years: o.years, resale: o.resale, rate: o.rate, crew: o.crew, crewYear: o.crewYear, pax: 8, block: block, fuel: fuel, fuelPrice: o.fuelPrice, mtow: c.W0 });
    return { o: o, vmax: vmx, engine: eng, P: P, unit: P.perAircraft, price: price, block: block, fuel: fuel, op: op, perKm: op.total / c.d.mission.R, perSeatKm: op.total / (c.d.mission.R * 8) };
  };

  /* ---------- The two designs the module follows ---------- */
  // the baseline: Modules 3 to 12 as they left it (W/S 250, C_Lmax,L 2.1, cruise at 12 km), with the loops closed
  X.baselineSpec = function () { var d = X.base(); d.tw = 'auto'; return d; };
  // the final design (Lesson 8): W/S 230 at the landing limit with double-slotted flaps (C_Lmax,L 2.4), cruise at 13 km
  X.finalSpec = function () { var d = X.base(); d.tw = 'auto'; d.ws = 230; d.clmax.land = 2.4; d.mission.h = 13000; return d; };
  var SIZED = {};
  X.baseline = function () { return SIZED.b || (SIZED.b = X.size(X.baselineSpec())); };
  X.finalDesign = function () { return SIZED.f || (SIZED.f = X.size(X.finalSpec())); };

  global.DESIGN = X;
})(typeof window !== 'undefined' ? window : this);
