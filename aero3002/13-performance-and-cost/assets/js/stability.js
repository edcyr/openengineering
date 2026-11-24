/*!
 * stability.js — STAB: static longitudinal stability, trim, control, the scissor plot and the vertical tail, for
 * Module 12 of Conceptual Aircraft Design (Stability, Control and Tail Sizing). Plain ES5; needs layout.js (LAYOUT,
 * Module 6) and weights.js (WEIGHTS, Module 11), and starts from Module 11's layout with its wing moved.
 *
 * Units: SI; angles in radians unless a name says deg; positions along the MAC as fractions of the MAC from its
 * leading edge (x̄).
 *
 *   STAB.cla(A, M, sweepHalfDeg, eta)      lift-curve slope per rad (Module 4's formula, eta 0.95)
 *   STAB.downwash(o)                       dε/dα, DATCOM 4.4.1 method 2: 4.44[kA kλ kH √cos Λ]^1.19 · CLα(M)/CLα(0)
 *   STAB.kf(x0)                            fuselage pitching-moment factor per deg against the wing root quarter-chord
 *                                          position / fuselage length (a fit of Raymer's Fig. 16.14, from FAST-GA)
 *   STAB.tau(cf)                           control-surface effectiveness 1.576 cf³ − 3.458 cf² + 2.882 cf
 *   STAB.cmWing(cm0, A, sweep)             C_M,W = c_m0 A cos²Λ/(A + 2 cos Λ)
 *   STAB.flapDcm(dcl, cRatio)              Δc_M = Δc_l (0.25 − 0.44 c'/c), Fowler and slotted flaps
 *   STAB.PRESETS, preset(id)               the business jet (this course) and three illustrative aircraft
 *   STAB.geom(sp, o)                       geometry, CG range and flight data, o {dx (wing shift from Module 6's place,
 *                                          default Module 11's), Sh, Sv (tail areas, default at the volume coefficients)}
 *   STAB.longi(g, M)                       {claW, claH, deps, Kf, cmFus, k, NP, ...} at Mach M
 *   STAB.stabLine(g, s), stabAft(g, s)     S_h/S needed for an aft CG x̄ with the static margin, and its inverse
 *   STAB.controlLine(g, x), controlFwd(g, s)  S_h/S needed at a forward CG x̄ (go-around and landing), and its inverse
 *   STAB.scissor(g, width)                 the least S_h/S whose CG range is `width` (fraction of MAC) wide
 *   STAB.design(sp)                        the scissor plot iterated with the wing's position (Module 11's wing shift)
 *   STAB.trimTail(g, CL, x, flap)          tail lift coefficient for trim
 *   STAB.directional(g, o)                 C_nβ by component and the VT needed; STAB.lateral(g, CL) C_lβ
 *   STAB.engineOut(g)                      V_MC, yawing moments, rudder, the VT the engine failure needs, crosswind
 *
 * Sources: Scholz, Aircraft Design lecture notes, Ch. 11 Empennage Sizing (HAW Hamburg); Raymer's Chapter 16 equations
 * as given in Iowa State's open aircraft-design notes; Roskam's sidewash correlation as coded in SUAVE; FAST-GA's fit of
 * the fuselage factor; 14 CFR 25.107, 25.149, 25.177.
 */
(function (global) {
  'use strict';
  var X = {}, D2R = Math.PI / 180, G0 = 9.80665, RHO0 = 1.225;

  /* ---------- Basic relations ---------- */
  X.cla = function (A, M, sweepHalfDeg, eta) {
    var b2 = 1 - (M || 0) * (M || 0), e = eta || 0.95, t = Math.tan((sweepHalfDeg || 0) * D2R);
    return 2 * Math.PI * A / (2 + Math.sqrt(4 + A * A * b2 / (e * e) * (1 + t * t / b2)));
  };
  X.sweepAt = function (A, lam, sw4, x) { return Math.atan(Math.tan(sw4 * D2R) - 4 * (x - 0.25) * (1 - lam) / (A * (1 + lam))) / D2R; };
  X.downwash = function (o) {
    var kA = 1 / o.A - 1 / (1 + Math.pow(o.A, 1.7)), kL = (10 - 3 * o.lam) / 7, kH = (1 - Math.abs(o.zH / o.b)) / Math.pow(2 * o.lH / o.b, 1 / 3);
    var base = 4.44 * Math.pow(kA * kL * kH * Math.sqrt(Math.cos(o.sweep * D2R)), 1.19);
    return { kA: kA, kL: kL, kH: kH, d0: base, d: base * (o.ratio || 1) };
  };
  X.kf = function (x0) { var x = Math.min(0.62, Math.max(0.1, x0)); return 0.01 - 0.063 * x + 0.211 * x * x; };
  X.tau = function (cf) { return 1.576 * cf * cf * cf - 3.458 * cf * cf + 2.882 * cf; };
  X.cmFactor = function (A, sweep) { var c = Math.cos(sweep * D2R); return A * c * c / (A + 2 * c); };
  X.cmWing = function (cm0, A, sweep) { return cm0 * X.cmFactor(A, sweep); };
  X.flapDcm = function (dcl, cRatio) { return dcl * (0.25 - 0.44 * (cRatio || 1)); };
  X.isa = function (h) {
    var T = h < 11000 ? 288.15 - 0.0065 * h : 216.65, p = h < 11000 ? 101325 * Math.pow(T / 288.15, 5.25588) : 22632.06 * Math.exp(-(h - 11000) / (287.053 * 216.65));
    var rho = p / (287.053 * T), mu = 1.458e-6 * Math.pow(T, 1.5) / (T + 110.4);
    return { T: T, p: p, rho: rho, a: Math.sqrt(1.4 * 287.053 * T), mu: mu, nu: mu / rho };
  };

  /* ---------- The aircraft ---------- */
  // cm0: airfoil pitching moment; flap: section increment Δc_l (Raymer's table, × c'/c for Fowler), c'/c, flapped-area
  // share; clmax: wing clean, takeoff, landing; eng: jet thrust per engine (N) or turboprop power per engine (W) with η;
  // zcg: CG height above the fuselage axis (Module 8); wind: windmilling-drag factor; ce, cr: elevator and rudder chord
  // shares; SM: required static margin; M, h: cruise; width: the CG range the design must cover (fraction of MAC;
  // default the loading diagram's; the illustrative turboprops assume seating rules that hold it to 30%).
  X.PRESETS = [
    { id: 'bizjet', label: 'Business jet (this course)', cm0: -0.10, flap: { dcl: 1.3 * 1.15, cRatio: 1.15, SfS: 0.628 }, clmax: { clean: 1.305, to: 1.7, land: 2.1 },
      eng: { kind: 'jet', T: 10560 }, zcg: -0.10, wind: 0.25, ce: 0.30, cr: 0.30, SM: 0.05, M: 0.80, h: 12000 },
    { id: 'narrow', label: 'Narrow-body airliner, 150 seats (illustrative)', cm0: -0.08, flap: { dcl: 1.3 * 1.2, cRatio: 1.2, SfS: 0.62 }, clmax: { clean: 1.31, to: 2.0, land: 2.8 },
      eng: { kind: 'jet', T: 120100 }, zcg: -0.45, wind: 0.25, ce: 0.30, cr: 0.30, SM: 0.05, M: 0.78, h: 11000 },
    { id: 'tprop', label: 'Regional turboprop, 72 seats (illustrative)', width: 0.30, cm0: -0.06, flap: { dcl: 1.6, cRatio: 1.0, SfS: 0.65 }, clmax: { clean: 1.53, to: 2.1, land: 2.6 },
      eng: { kind: 'prop', P: 2051e3, eta: 0.75 }, zcg: 0.25, wind: 0.25, ce: 0.30, cr: 0.30, SM: 0.05, M: 0.45, h: 7000 },
    { id: 'commuter', label: 'Commuter turboprop, 18 seats (illustrative)', width: 0.30, cm0: -0.05, flap: { dcl: 1.3, cRatio: 1.0, SfS: 0.60 }, clmax: { clean: 1.53, to: 1.9, land: 2.3 },
      eng: { kind: 'prop', P: 900e3, eta: 0.75 }, zcg: -0.05, wind: 0.25, ce: 0.30, cr: 0.30, SM: 0.10, M: 0.40, h: 5000 }
  ];
  X.preset = function (id) { for (var i = 0; i < X.PRESETS.length; i++) if (X.PRESETS[i].id === id) return JSON.parse(JSON.stringify(X.PRESETS[i])); return null; };

  // Module 11's statement and wing shift, cached per aircraft
  var M10 = {};
  X.m10 = function (id) {
    if (M10[id]) return M10[id];
    var W = global.WEIGHTS, ws = W.preset(id), S = W.statement(ws, { k: 'm3' }), dx = W.wingShift(S, 25);
    M10[id] = { ws: ws, S: S, dx: dx }; return M10[id];
  };

  /* ---------- Geometry, CG range and flight data ---------- */
  X.geom = function (sp, o) {
    o = o || {};
    var W = global.WEIGHTS, m = X.m10(sp.id), dx = o.dx == null ? m.dx : o.dx;
    var L = W.shiftedLayout(m.ws, dx), G = L.G, ls = L.sp, w = G.wing, pf = w.pf, mac = pf.mac, xLE = w.xAc - 0.25 * mac;
    var en = W.envelope(m.S, dx), lF = L.lF, d = L.d;
    var Sh = o.Sh || L.SHT, Sv = o.Sv || L.SVT, ht = G.ht, vt = G.vt, e = G.eng;
    // fuselage volume: elliptic sections from the top and side outlines
    var vol = 0, n = 240; for (var i = 0; i < n; i++) { var x = (i + 0.5) * lF / n; vol += Math.PI * G.halfWidth(x) * 0.5 * (G.zTop(x) - G.zBot(x)) * lF / n; }
    var at = X.isa(sp.h), Vc = sp.M * at.a;
    var Wto = ls.W0 * G0, Wl = m.ws.land * ls.W0 * G0;
    return {
      sp: sp, L: L, G: G, dx: dx, S: pf.S, A: pf.A, lam: pf.lam, sweep: ls.wing.sweep, b: pf.b, mac: mac, xLE: xLE, xAcW: w.xAc,
      x0: (w.xLE + 0.25 * pf.cr) / lF, lF: lF, d: d, vol: vol, zw: -w.z, dihedral: (ls.wing.dihedral || 0),
      Sh: Sh, Ah: ls.tail.hA, lamH: ls.tail.hLam, sweepH: ls.tail.hSweep, xAcH: ht.xAc, lH: ht.xAc - w.xAc, zH: ht.z - w.z, tee: !!ht.tee,
      Sv: Sv, Av: ls.tail.vA, lamV: ls.tail.vLam, sweepV: ls.tail.vSweep, xAcV: vt.xAc, zV: vt.z0 + vt.zmac,
      fwd: en.fwd / 100, aft: en.aft / 100, width: (en.aft - en.fwd) / 100, need: sp.width || (en.aft - en.fwd) / 100, envelope: en,
      xcgAft: xLE + en.aft / 100 * mac, xcgFwd: xLE + en.fwd / 100 * mac,
      zE: (e.z || 0) - sp.zcg, yE: e.y || 0, nEng: ls.eng.n || 2, eng: e,
      W0: ls.W0, Wto: Wto, Wl: Wl, cruise: { V: Vc, q: 0.5 * at.rho * Vc * Vc, Re: Vc * lF / at.nu, at: at },
      SM: sp.SM
    };
  };

  /* ---------- Longitudinal: the neutral point ---------- */
  X.longi = function (g, M) {
    M = M || 0.2;
    var claW = X.cla(g.A, M, X.sweepAt(g.A, g.lam, g.sweep, 0.5)), claW0 = X.cla(g.A, 0, X.sweepAt(g.A, g.lam, g.sweep, 0.5));
    var claH = X.cla(g.Ah, M, X.sweepAt(g.Ah, g.lamH, g.sweepH, 0.5));
    var dw = X.downwash({ A: g.A, lam: g.lam, sweep: g.sweep, zH: g.zH, lH: g.lH, b: g.b, ratio: claW / claW0 });
    var Kf = X.kf(g.x0), cmFus = Kf * g.d * g.d * g.lF / (g.mac * g.S) * 180 / Math.PI, eta = 0.9;
    var k = eta * claH * (1 - dw.d);                                   // tail slope per unit S_h/S
    var xh = (g.xAcH - g.xLE) / g.mac, s = g.Sh / g.S, T = k * s;
    var NP = (claW * 0.25 - cmFus + T * xh) / (claW + T);
    return { M: M, claW: claW, claH: claH, dw: dw, deps: dw.d, Kf: Kf, cmFus: cmFus, eta: eta, k: k, xh: xh, s: s, T: T, NP: NP,
      cma: function (x) { return -(claW + T) * (NP - x); } };
  };
  // S_h/S for which the neutral point lies SM behind an aft CG x (fraction of MAC), and its inverse
  // the stability requirement must hold at low speed and in cruise: the lines take the more critical of the two
  X.longiPair = function (g) { return [X.longi(g, 0.2), X.longi(g, g.sp.M)]; };
  X.stabLine1 = function (g, x, l) { return Math.max(0, (l.claW * (x + g.SM - 0.25) + l.cmFus) / (l.k * (l.xh - x - g.SM))); };
  X.stabAft1 = function (g, s, l) { return (s * l.k * (l.xh - g.SM) - l.claW * (g.SM - 0.25) - l.cmFus) / (l.claW + s * l.k); };
  X.stabLine = function (g, x, P) { return Math.max.apply(null, (P || X.longiPair(g)).map(function (l) { return X.stabLine1(g, x, l); })); };
  X.stabAft = function (g, s, P) { return Math.min.apply(null, (P || X.longiPair(g)).map(function (l) { return X.stabAft1(g, s, l); })); };
  X.npOf = function (g, s, Lo) { var l = Lo || X.longi(g), T = l.k * s; return (l.claW * 0.25 - l.cmFus + T * l.xh) / (l.claW + T); };

  /* ---------- Control: go-around and landing at the forward CG ---------- */
  X.CLH = -0.5;
  X.controlCases = function (g) {
    var sp = g.sp, f = sp.flap, cmw = X.cmWing(sp.cm0 + X.flapDcm(f.dcl, f.cRatio) * f.SfS, g.A, g.sweep);
    var clL = sp.clmax.land, clGA = clL / 1.69, Vga = Math.sqrt(2 * g.Wl / (RHO0 * g.S * clGA));
    var T = sp.eng.kind === 'jet' ? g.nEng * sp.eng.T : g.nEng * sp.eng.eta * sp.eng.P / Vga;
    var cmE = -T * g.zE / (0.5 * RHO0 * Vga * Vga * g.S * g.mac);
    return [{ id: 'ga', label: 'Go-around at 1.3 V_S, full flaps, takeoff thrust', CL: clGA, cmW: cmw, cmE: cmE, T: T, V: Vga },
            { id: 'land', label: 'Landing at C_Lmax, full flaps, idle', CL: clL, cmW: cmw, cmE: 0, T: 0, V: Math.sqrt(2 * g.Wl / (RHO0 * g.S * clL)) }];
  };
  X.controlLine = function (g, x, cases) {
    var lh = g.lH / g.mac, best = 0; (cases || X.controlCases(g)).forEach(function (c) {
      var s = (c.CL * (x - 0.25) + c.cmW + c.cmE) / (X.CLH * 0.9 * lh); if (s > best) best = s; });
    return best;
  };
  X.controlFwd = function (g, s, cases) {
    var lh = g.lH / g.mac, best = -Infinity; (cases || X.controlCases(g)).forEach(function (c) {
      var x = 0.25 + (s * X.CLH * 0.9 * lh - c.cmW - c.cmE) / c.CL; if (x > best) best = x; });
    return best;
  };
  // the least S_h/S whose stable, controllable CG range is `width` wide
  X.scissor = function (g, width) {
    var w = width == null ? g.need : width, P = X.longiPair(g), cs = X.controlCases(g), lo = 0.01, hi = 1.5;
    for (var i = 0; i < 60; i++) { var mid = 0.5 * (lo + hi); if (X.stabAft(g, mid, P) - X.controlFwd(g, mid, cs) >= w) hi = mid; else lo = mid; }
    var s = hi, fwd = X.controlFwd(g, s, cs), aft = X.stabAft(g, s, P);
    return { s: s, Sh: s * g.S, fwd: fwd, aft: aft, center: 0.5 * (fwd + aft), P: P, cases: cs, width: w };
  };
  // iterate the wing's position (Module 11's wing shift) with the scissor plot until the CG range sits where it fits
  X.design = function (sp) {
    var W = global.WEIGHTS, m = X.m10(sp.id), dx = m.dx, hist = [], g, r;
    for (var i = 0; i < 12; i++) {
      g = X.geom(sp, { dx: dx }); r = X.scissor(g);
      hist.push({ dx: dx, Sh: r.Sh, fwd: r.fwd, aft: r.aft, cur: [g.fwd, g.aft] });
      var dn = W.wingShift(m.S, 100 * r.center);
      if (Math.abs(dn - dx) < 0.002) { dx = dn; break; }
      dx = dn;
    }
    g = X.geom(sp, { dx: dx, Sh: r.Sh }); r = X.scissor(g);
    return { dx: dx, dx10: m.dx, g: g, r: r, hist: hist };
  };

  /* ---------- Trim: the tail lift coefficient ---------- */
  X.trimTail = function (g, CL, x, o) {
    o = o || {};
    var cmw = o.flap ? X.cmWing(g.sp.cm0 + X.flapDcm(g.sp.flap.dcl, g.sp.flap.cRatio) * g.sp.flap.SfS, g.A, g.sweep) : X.cmWing(g.sp.cm0, g.A, g.sweep);
    return (cmw + CL * (x - 0.25) + (o.cmE || 0)) / (0.9 * (g.Sh / g.S) * g.lH / g.mac);
  };

  /* ---------- Directional and lateral stability ---------- */
  X.CNB_MIN = 0.0571;                                                  // per rad (0.001 per deg)
  X.sidewash = function (g, s) { return 0.724 + 3.06 * s / (1 + Math.cos(g.sweep * D2R)) + 0.4 * g.zw / g.d + 0.009 * g.A; };
  X.claV = function (g, M) { var Ae = 1.55 * g.Av; return X.cla(Ae, M || 0.2, X.sweepAt(2 * g.Av, g.lamV, g.sweepV, 0.5)); };
  X.directional = function (g, o) {
    o = o || {};
    var CL = o.CL == null ? 0.3 : o.CL, M = o.M || 0.2, xcg = o.xcg == null ? g.xcgAft : o.xcg, lV = g.xAcV - xcg, s = g.Sv / g.S;
    var cnW = CL * CL / (4 * Math.PI * g.A);
    var cnF = -1.3 * g.vol / (g.S * g.b);                                // Raymer: round fuselage, D/W = 1
    var re = g.cruise.Re, kN = 0.01 * (0.27 * xcg / g.lF - 0.168 * Math.log(g.lF / g.d) + 0.416) - 0.0005, kR = 0.46 * Math.log10(re / 1e6) + 1;
    var cnFd = -(180 / Math.PI) * kN * kR * g.lF * g.lF * g.d / (g.S * g.b);
    var claV = X.claV(g, M), sw = X.sidewash(g, s), cnV = claV * sw * s * lV / g.b;
    var useF = o.datcom ? cnFd : cnF, tot = cnW + useF + cnV;
    // VT needed for C_nβ = 0.0571: claV (lV/b) s (a0 + a1 s) = R
    var a0 = 0.724 + 0.4 * g.zw / g.d + 0.009 * g.A, a1 = 3.06 / (1 + Math.cos(g.sweep * D2R)), R = (X.CNB_MIN - cnW - useF) / (claV * lV / g.b);
    var sNeed = R <= 0 ? 0 : (-a0 + Math.sqrt(a0 * a0 + 4 * a1 * R)) / (2 * a1);
    return { CL: CL, lV: lV, s: s, cnW: cnW, cnF: cnF, cnFd: cnFd, kN: kN, kR: kR, claV: claV, sw: sw, cnV: cnV, total: tot, useF: useF, SvNeed: sNeed * g.S };
  };
  X.lateral = function (g, CL, o) {
    o = o || {};
    var M = o.M || 0.2, claW = X.cla(g.A, M, X.sweepAt(g.A, g.lam, g.sweep, 0.5)), G = (o.dihedral == null ? g.dihedral : o.dihedral) * D2R;
    var dih = -(claW * G / 4) * (2 * (1 + 2 * g.lam) / (3 * (1 + g.lam)));
    var wf = -1.2 * Math.sqrt(g.A) * (-g.zw) * (2 * g.d) / (g.b * g.b);   // Z_wf: wing above the axis is positive; low wing negative
    var s = g.Sv / g.S, zv = (g.zV - g.sp.zcg) / g.b, vt = -X.claV(g, M) * X.sidewash(g, s) * s * zv;
    return { dih: dih, wf: wf, vt: vt, total: dih + wf + vt };
  };

  /* ---------- Engine failure and crosswind ---------- */
  X.engineOut = function (g, o) {
    o = o || {};
    var sp = g.sp, vsr = Math.sqrt(2 * g.Wto / (RHO0 * g.S * sp.clmax.to)), vmc = 1.13 * vsr, q = 0.5 * RHO0 * vmc * vmc;
    var T1 = sp.eng.kind === 'jet' ? sp.eng.T : sp.eng.eta * sp.eng.P / vmc, NE = T1 * g.yE, ND = sp.wind * NE, lV = g.xAcV - g.xcgAft;
    var claV = X.claV(g, vmc / 340.3), tau = X.tau(sp.cr), dmax = 25 * D2R;
    var cnDr = 0.9 * claV * (g.Sv / g.S) * (lV / g.b) * tau;
    var dr = (NE + ND) / (q * g.S * g.b * cnDr);
    var SvNeed = (NE + ND) / (q * lV * 0.9 * claV * tau * dmax);
    var Vto = 1.1 * vsr, beta = Math.atan(0.2), dir = X.directional(g, { CL: sp.clmax.to / 1.21, xcg: g.xcgAft });
    var drX = dir.total * beta / cnDr;
    return { vsr: vsr, vmc: vmc, q: q, T1: T1, NE: NE, ND: ND, lV: lV, claV: claV, tau: tau, cnDr: cnDr, dr: dr / D2R, SvNeed: SvNeed, Vto: Vto, beta: beta / D2R, drX: drX / D2R, cnb: dir.total };
  };

  /* ---------- Layout with the wing moved and the tails resized (for drawings and the drag check) ---------- */
  X.layoutFor = function (sp, dx, Sh, Sv) {
    var LA = global.LAYOUT, W = global.WEIGHTS, m = X.m10(sp.id), ls = LA.preset(m.ws.layout), lF = W.layout(m.ws).lF;
    if (m.ws.nac) { ls.eng.D = m.ws.nac.D; ls.eng.l = m.ws.nac.l; }
    ls.wing.xFrac += dx / lF; ls.tail.armFrac -= dx / lF;
    var R = LA.evaluate(ls);
    if (Sh || Sv) {
      if (Sh) ls.tail.cHT *= Sh / R.SHT;
      if (Sv) ls.tail.cVT *= Sv / R.SVT;
      R = LA.evaluate(ls);
    }
    R.spec = ls; return R;
  };

  global.STAB = X;
})(typeof window !== 'undefined' ? window : this);
