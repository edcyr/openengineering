/*!
 * space.js — SPACE: orbits, orbital maneuvers, the ascent to orbit, the rocket equation and staging, rocket engines,
 * launch-vehicle loads, tanks and factors of safety, and the sizing of a launch vehicle, for Module 15 of Conceptual
 * Aircraft Design (Space Vehicles). Plain ES5, no dependencies.
 *
 * Units: SI (m, s, kg, N, Pa); angles in degrees at the interface; altitudes h above a spherical Earth of radius RE.
 *
 *   Constants: MU, RE, J2, WE (Earth's rotation rate), G0 (standard gravity), YEAR (tropical year, s), SIDDAY.
 *     MU, RE, J2 and WE are recalled values (not checked against a source); G0 is exact by definition.
 *   SPACE.vc(h), period(a), visViva(r, a), orbit(rp, ra)        circular speed, period, vis-viva, ellipse {a, e, vp, va,
 *                                                               T, eps (specific energy), hmom}
 *   SPACE.hohmann(r1, r2)                                       {a, dv1, dv2, dv, tof, vp, va, v1, v2}
 *   SPACE.planeChange(v, di), combined(v1, v2, di)              Δv of a plane change; of a combined burn
 *   SPACE.nodalRate(a, e, i), ssoInc(h)                         J2 regression of the node (deg/day); SSO inclination
 *   SPACE.siteSpeed(lat), azimuth(inc, lat), rotation(v, inc, lat)  Earth's rotation at the site; launch azimuth;
 *                                                               {Az, vE, vrel, penalty} for a direct launch
 *   SPACE.budget(o)                                             ascent Δv budget {v, rot, gl, dl, sl, total, Az, inc}
 *   SPACE.rocketDv(c, m0, mf), massRatio(dv, c), maxDv(c, eps)
 *   SPACE.stack(dvs, cs, eps, mpl)                              stage masses for a given Δv split (top stage last)
 *   SPACE.stageOpt(dv, cs, eps, mpl)                            the lightest split (Lagrange multiplier)
 *   SPACE.isa(h)                                                1976 standard atmosphere to 86 km {T, p, rho, a}
 *   SPACE.cd(M)                                                 an illustrative drag coefficient of a slender rocket
 *   SPACE.ascent1(o)                                            stage-1 gravity turn {track, qmax, amax, bo, gl, dl, pl}
 *   SPACE.kickFor(o, gam)                                       the pitch kick for a burnout flight-path angle
 *   SPACE.cf(g, pr, paPc, eps), areaRatio(g, pr), prOf(g, eps)  ideal thrust coefficient, expansion ratio
 *   SPACE.engine(o)                                             {cf, isp, ispSL, pe, ...} from c*, γ, pc, ε
 *   SPACE.PROPS, prop(id), bulk(OF, rhoO, rhoF)                 typical propellant data (recalled)
 *   SPACE.MATS, mat(id)                                         typical tank materials (recalled)
 *   SPACE.FOS                                                   NASA-STD-5001B Table 1 (metallic) and Table 2 (composite)
 *   SPACE.head(R, k), tank(V, R, k)                             ellipsoidal heads; a tank's cylinder length and area
 *   SPACE.hoop(p, R, t), wallFor(p, R, mat, appr)               membrane stresses; the wall a pressure needs
 *   SPACE.knockdown(R, t), sigmaCr(E, t, R)                     NASA SP-8007's knockdown (recalled); classical buckling
 *   SPACE.ms(allow, limit, fs)                                  NASA-STD-5001B's margin of safety
 *   SPACE.inert(st, o)                                          bottom-up inert mass of a stage
 *   SPACE.PRESETS, preset(id), design(spec)                     the course's small launcher and three illustrative ones
 */
(function (global) {
  'use strict';
  var S = {};
  var D2R = Math.PI / 180;
  S.MU = 3.986e14;          // m³/s² (recalled: 398 600 km³/s²)
  S.RE = 6378e3;            // m (recalled)
  S.J2 = 1.08263e-3;        // (recalled)
  S.WE = 7.2921159e-5;      // rad/s, sidereal (recalled)
  S.G0 = 9.80665;           // m/s², exact
  S.YEAR = 365.2422 * 86400;
  S.SIDDAY = 86164.09;

  /* ---------- Orbits ---------- */
  S.vc = function (h) { return Math.sqrt(S.MU / (S.RE + h)); };
  S.period = function (a) { return 2 * Math.PI * Math.sqrt(a * a * a / S.MU); };
  S.visViva = function (r, a) { return Math.sqrt(S.MU * (2 / r - 1 / a)); };
  S.orbit = function (rp, ra) {
    var a = (rp + ra) / 2, e = (ra - rp) / (ra + rp), vp = S.visViva(rp, a), va = S.visViva(ra, a);
    return { a: a, e: e, rp: rp, ra: ra, vp: vp, va: va, T: S.period(a), eps: -S.MU / (2 * a), hmom: rp * vp };
  };
  S.hohmann = function (r1, r2) {
    var a = (r1 + r2) / 2, v1 = Math.sqrt(S.MU / r1), v2 = Math.sqrt(S.MU / r2), vp = S.visViva(r1, a), va = S.visViva(r2, a);
    var dv1 = Math.abs(vp - v1), dv2 = Math.abs(v2 - va);
    return { a: a, v1: v1, v2: v2, vp: vp, va: va, dv1: dv1, dv2: dv2, dv: dv1 + dv2, tof: S.period(a) / 2 };
  };
  S.planeChange = function (v, di) { return 2 * v * Math.sin(di * D2R / 2); };
  S.combined = function (v1, v2, di) { return Math.sqrt(Math.max(0, v1 * v1 + v2 * v2 - 2 * v1 * v2 * Math.cos(di * D2R))); };
  // J2 regression of the ascending node, deg per day
  S.nodalRate = function (a, e, i) {
    var n = Math.sqrt(S.MU / (a * a * a)), p = a * (1 - e * e);
    return -1.5 * n * S.J2 * (S.RE / p) * (S.RE / p) * Math.cos(i * D2R) / D2R * 86400;
  };
  S.ssoInc = function (h) {
    var a = S.RE + h, n = Math.sqrt(S.MU / (a * a * a)), want = 2 * Math.PI / S.YEAR;
    var c = -want / (1.5 * n * S.J2 * (S.RE / a) * (S.RE / a));
    return Math.acos(Math.max(-1, Math.min(1, c))) / D2R;
  };

  /* ---------- The ascent ---------- */
  S.siteSpeed = function (lat) { return S.WE * S.RE * Math.cos(lat * D2R); };
  // launch azimuth (deg from north) for a direct launch into inclination inc from latitude lat; south = true for the
  // southward branch; NaN if the inclination is below the latitude
  S.azimuth = function (inc, lat, south) {
    var s = Math.cos(inc * D2R) / Math.cos(lat * D2R);
    if (Math.abs(s) > 1 + 1e-12) return NaN;
    var az = Math.asin(Math.max(-1, Math.min(1, s))) / D2R;   // -90..90, the northward branch
    return south ? 180 - az : (az + 360) % 360;
  };
  S.rotation = function (v, inc, lat) {
    var vE = S.siteSpeed(lat), s = Math.cos(inc * D2R) / Math.cos(lat * D2R);
    if (Math.abs(s) > 1 + 1e-12) return { Az: NaN, vE: vE, vrel: NaN, penalty: NaN, simple: NaN };
    s = Math.max(-1, Math.min(1, s));
    var vrel = Math.sqrt(v * v - 2 * v * vE * s + vE * vE);
    return { Az: S.azimuth(inc, lat, true), AzN: S.azimuth(inc, lat, false), vE: vE, sinAz: s, vrel: vrel, penalty: vrel - v, simple: -vE * s };
  };
  // o {h, inc (deg; 'sso'), lat, gl, dl, sl} -> the Δv budget (m/s)
  S.budget = function (o) {
    var inc = o.inc === 'sso' || o.inc == null ? S.ssoInc(o.h) : o.inc, v = S.vc(o.h), r = S.rotation(v, inc, o.lat);
    var gl = o.gl == null ? 1300 : o.gl, dl = o.dl == null ? 120 : o.dl, sl = o.sl == null ? 100 : o.sl;
    return { inc: inc, v: v, rot: r.penalty, Az: r.Az, vE: r.vE, vrel: r.vrel, gl: gl, dl: dl, sl: sl, total: r.vrel + gl + dl + sl };
  };

  /* ---------- The rocket equation and staging ---------- */
  S.rocketDv = function (c, m0, mf) { return c * Math.log(m0 / mf); };
  S.massRatio = function (dv, c) { return Math.exp(dv / c); };
  S.maxDv = function (c, eps) { return c * Math.log(1 / eps); };
  // eps_i = m_s/(m_s + m_p) of stage i; cs exhaust velocities (m/s); stages listed from the first up
  S.stack = function (dvs, cs, eps, mpl) {
    var m = mpl, out = [];
    for (var i = dvs.length - 1; i >= 0; i--) {
      var n = Math.exp(dvs[i] / cs[i]);
      if (n * eps[i] >= 1) return null;
      var mp = m * (n - 1) * (1 - eps[i]) / (1 - n * eps[i]), ms = eps[i] / (1 - eps[i]) * mp;
      out.unshift({ n: n, dv: dvs[i], c: cs[i], eps: eps[i], mp: mp, ms: ms, m0: m + mp + ms, mf: m + ms, above: m });
      m += mp + ms;
    }
    return { stages: out, m0: m, mpl: mpl, pf: mpl / m };
  };
  S.stageOpt = function (dv, cs, eps, mpl) {
    var f = function (eta) { var s = 0; for (var i = 0; i < cs.length; i++) s += cs[i] * Math.log((cs[i] * eta - 1) / (cs[i] * eps[i] * eta)); return s - dv; };
    var lo = 1 / Math.min.apply(null, cs) * (1 + 1e-9), hi = 2 / Math.min.apply(null, cs), k = 0;
    while (f(hi) < 0 && k++ < 200) hi *= 1.5;
    // with eta -> infinity the sum tends to sum c ln(1/eps): no solution beyond it
    if (f(hi) < 0) return null;
    for (var j = 0; j < 200; j++) { var mid = (lo + hi) / 2; if (f(mid) > 0) hi = mid; else lo = mid; }
    var eta = (lo + hi) / 2, dvs = cs.map(function (c, i) { return c * Math.log((c * eta - 1) / (c * eps[i] * eta)); });
    var s = S.stack(dvs, cs, eps, mpl);
    if (s) s.eta = eta;
    return s;
  };

  /* ---------- The atmosphere and the stage-1 ascent ---------- */
  var LAY = [[0, 288.15, -0.0065], [11000, 216.65, 0], [20000, 216.65, 0.001], [32000, 228.65, 0.0028], [47000, 270.65, 0], [51000, 270.65, -0.0028], [71000, 214.65, -0.002], [84852, 186.946, 0]];
  var RAIR = 287.053;
  S.isa = function (h) {
    h = Math.max(0, h);
    var p = 101325, T = 288.15;
    for (var i = 0; i < LAY.length; i++) {
      var hb = LAY[i][0], Tb = LAY[i][1], L = LAY[i][2], htop = i + 1 < LAY.length ? LAY[i + 1][0] : Infinity, hh = Math.min(h, htop) - hb;
      var pn = L === 0 ? p * Math.exp(-S.G0 * hh / (RAIR * Tb)) : p * Math.pow((Tb + L * hh) / Tb, -S.G0 / (RAIR * L));
      T = Tb + L * hh;
      if (h <= htop) { p = pn; break; }
      p = pn;
    }
    return { T: T, p: p, rho: p / (RAIR * T), a: Math.sqrt(1.4 * RAIR * T) };
  };
  var CD = [[0, 0.30], [0.8, 0.30], [1.05, 0.55], [1.3, 0.50], [2, 0.40], [3, 0.32], [5, 0.25], [10, 0.22]];
  S.cd = function (M) {
    for (var i = 1; i < CD.length; i++) if (M <= CD[i][0]) return CD[i - 1][1] + (CD[i][1] - CD[i - 1][1]) * (M - CD[i - 1][0]) / (CD[i][0] - CD[i - 1][0]);
    return CD[CD.length - 1][1];
  };
  // o {m0, mp, tw (liftoff T/W), ispSL, ispVac, d (m), tv (s of vertical rise), kick (deg), dt}
  // point mass over a round, non-rotating Earth; thrust along the velocity after the kick (gravity turn)
  S.ascent1 = function (o) {
    var A = Math.PI * o.d * o.d / 4, Tsl = o.tw * o.m0 * S.G0, mdot = Tsl / (o.ispSL * S.G0), Tvac = mdot * o.ispVac * S.G0, Ae = (Tvac - Tsl) / 101325;
    var dt = o.dt || 0.05, tv = o.tv == null ? 15 : o.tv, kick = o.kick == null ? 0.8 : o.kick;
    var r = S.RE, th = 0, vr = 0, vt = 0, m = o.m0, t = 0, gl = 0, dl = 0, pl = 0, kicked = false, track = [], qmax = { q: 0 }, amax = 0, mend = o.m0 - o.mp, every = Math.max(1, Math.round(1 / dt));
    var k = 0, ur = 1, ut = 0;
    while (m > mend + 1e-9) {
      var h = r - S.RE, at = S.isa(h), v = Math.sqrt(vr * vr + vt * vt), M = v / at.a, q = 0.5 * at.rho * v * v, T = Tvac - at.p * Ae, D = q * S.cd(M) * A, g = S.MU / (r * r);
      if (t < tv) { ur = 1; ut = 0; }
      else if (!kicked) { kicked = true; ur = Math.cos(kick * D2R); ut = Math.sin(kick * D2R); vr = v * ur; vt = v * ut; }
      else if (v > 0) { ur = vr / v; ut = vt / v; }
      var gam = v > 1 ? Math.atan2(vr, vt) : Math.PI / 2, acc = (T - D) / m;
      if (k % every === 0) track.push({ t: t, h: h, x: th * S.RE, v: v, q: q, acc: acc / S.G0, M: M, gam: gam / D2R, m: m });
      if (q > qmax.q) qmax = { q: q, t: t, h: h, M: M, v: v, acc: acc / S.G0 };
      amax = Math.max(amax, acc / S.G0);
      gl += g * Math.sin(gam) * dt; dl += D / m * dt; pl += at.p * Ae / m * dt;
      var dm = Math.min(mdot * dt, m - mend), step = dm / mdot;
      vr += (acc * ur - g + vt * vt / r) * step; vt += (acc * ut - vr * vt / r) * step; th += vt / r * step; r += vr * step; m -= dm; t += step; k++;
      if (r < S.RE - 1) break;
    }
    var vb = Math.sqrt(vr * vr + vt * vt);
    track.push({ t: t, h: r - S.RE, x: th * S.RE, v: vb, q: 0.5 * S.isa(r - S.RE).rho * vb * vb, acc: (Tvac - S.isa(r - S.RE).p * Ae) / m / S.G0, M: vb / S.isa(r - S.RE).a, gam: Math.atan2(vr, vt) / D2R, m: m });
    return { track: track, qmax: qmax, amax: amax, bo: { t: t, h: r - S.RE, x: th * S.RE, v: vb, gam: Math.atan2(vr, vt) / D2R }, gl: gl, dl: dl, pl: pl,
      ideal: o.ispVac * S.G0 * Math.log(o.m0 / mend), Tsl: Tsl, Tvac: Tvac, mdot: mdot, Ae: Ae, tb: t, crashed: r < S.RE - 1 };
  };

  // the pitch kick (deg) that gives a burnout flight-path angle gam (deg); o as for ascent1. Returns {kick, run}
  S.kickFor = function (o, gam) {
    var lo = 0.02, hi = 20, run = null;
    for (var i = 0; i < 28; i++) {
      var mid = Math.sqrt(lo * hi), r = S.ascent1(Object.assign({}, o, { kick: mid }));
      if (r.crashed || r.bo.gam < gam) hi = mid; else lo = mid;
    }
    var k = Math.sqrt(lo * hi);
    run = S.ascent1(Object.assign({}, o, { kick: k }));
    return { kick: k, run: run };
  };

  /* ---------- Engines ---------- */
  S.cf = function (g, pr, paPc, eps) {
    var t = (2 * g * g / (g - 1)) * Math.pow(2 / (g + 1), (g + 1) / (g - 1)) * (1 - Math.pow(pr, (g - 1) / g));
    return Math.sqrt(t) + (pr - paPc) * eps;
  };
  S.areaRatio = function (g, pr) {
    var inv = Math.pow((g + 1) / 2, 1 / (g - 1)) * Math.pow(pr, 1 / g) * Math.sqrt(((g + 1) / (g - 1)) * (1 - Math.pow(pr, (g - 1) / g)));
    return 1 / inv;
  };
  S.prOf = function (g, eps) {   // pe/pc for an expansion ratio (supersonic branch)
    var lo = 1e-9, hi = Math.pow(2 / (g + 1), g / (g - 1));
    for (var i = 0; i < 200; i++) { var mid = Math.sqrt(lo * hi); if (S.areaRatio(g, mid) > eps) lo = mid; else hi = mid; }
    return Math.sqrt(lo * hi);
  };
  // o {cstar (m/s), g (gamma), pc (Pa), eps, pa (Pa, default 101325 for the sea-level value)}
  S.engine = function (o) {
    var pr = S.prOf(o.g, o.eps), pa = o.pa == null ? 101325 : o.pa;
    var cfv = S.cf(o.g, pr, 0, o.eps), cfa = S.cf(o.g, pr, pa / o.pc, o.eps);
    return { pr: pr, pe: pr * o.pc, cfVac: cfv, cf: cfa, ispVac: o.cstar * cfv / S.G0, isp: o.cstar * cfa / S.G0, sep: pr * o.pc < 0.35 * pa };
  };
  // typical values (recalled, not checked): vacuum and sea-level specific impulse of a typical engine (s), mixture
  // ratio O/F by mass, densities (kg/m³) of the oxidizer and the fuel (or of a solid propellant)
  S.PROPS = [
    { id: 'kerolox', label: 'LOX/RP-1 (kerosene)', ispVac: 340, ispSL: 300, OF: 2.6, rhoO: 1141, rhoF: 810, cstar: 1780, g: 1.24, note: 'dense, cheap, storable fuel; sooty' },
    { id: 'methalox', label: 'LOX/methane', ispVac: 360, ispSL: 320, OF: 3.5, rhoO: 1141, rhoF: 423, cstar: 1850, g: 1.22, note: 'clean-burning, suits reuse; both cryogenic' },
    { id: 'hydrolox', label: 'LOX/LH2 (hydrogen)', ispVac: 450, ispSL: 390, OF: 6.0, rhoO: 1141, rhoF: 71, cstar: 2330, g: 1.20, note: 'highest Isp; bulky, very cold tanks' },
    { id: 'hypergolic', label: 'NTO/MMH (storable)', ispVac: 320, ispSL: 280, OF: 1.65, rhoO: 1440, rhoF: 875, cstar: 1720, g: 1.25, note: 'ignites on contact, stores for years; toxic' },
    { id: 'solid', label: 'Solid (AP/Al/HTPB)', ispVac: 285, ispSL: 260, OF: null, rho: 1800, cstar: 1550, g: 1.18, note: 'simple and dense; cannot be shut down or throttled' }
  ];
  S.prop = function (id) { for (var i = 0; i < S.PROPS.length; i++) if (S.PROPS[i].id === id) return S.PROPS[i]; return null; };
  S.bulk = function (OF, rO, rF) { return (1 + OF) / (OF / rO + 1 / rF); };
  S.rhoBulk = function (p) { return p.OF == null ? p.rho : S.bulk(p.OF, p.rhoO, p.rhoF); };

  /* ---------- Structures ---------- */
  // typical properties (recalled, not checked): rho kg/m³, E GPa, nu, sy, su MPa
  S.MATS = [
    { id: 'al2219', label: 'Aluminium 2219-T87', rho: 2840, E: 73.8, nu: 0.33, sy: 352, su: 455 },
    { id: 'al2195', label: 'Aluminium-lithium 2195', rho: 2710, E: 76.0, nu: 0.33, sy: 530, su: 570 },
    { id: 'ss301', label: 'Stainless steel 301 (full hard)', rho: 7880, E: 193, nu: 0.30, sy: 965, su: 1280 },
    { id: 'cfrp', label: 'Carbon-fiber epoxy (quasi-isotropic)', rho: 1580, E: 60, nu: 0.30, sy: null, su: 600, composite: true },
    { id: 'cfw', label: 'Carbon fiber, filament-wound case (hoop)', rho: 1550, E: 120, nu: 0.30, sy: null, su: 1800, composite: true }
  ];
  S.mat = function (id) { for (var i = 0; i < S.MATS.length; i++) if (S.MATS[i].id === id) return S.MATS[i]; return null; };
  // NASA-STD-5001B w/Change 3, Table 1 (metallic) and Table 2 (composite/bonded, uniform material); proof 1.05 for
  // propellant tanks and SRM cases (metallic)
  S.FOS = {
    prototype: { label: 'Prototype (dedicated test article)', ult: 1.4, yld: 1.0, qual: 1.4, proof: 1.05, compUlt: 1.4, compProof: 1.05 },
    protoflight: { label: 'Protoflight (flight article tested)', ult: 1.4, yld: 1.25, qual: 1.2, proof: 1.05, compUlt: 1.5, compProof: 1.2 }
  };
  // ellipsoidal head of radius R and height R/k: volume and area
  S.head = function (R, k) {
    var c = R / k, V = 2 / 3 * Math.PI * R * R * c, A;
    if (k === 1) A = 2 * Math.PI * R * R;
    else { var e = Math.sqrt(1 - 1 / (k * k)); A = Math.PI * R * R + Math.PI * c * c / (2 * e) * Math.log((1 + e) / (1 - e)); }
    return { V: V, A: A, h: c };
  };
  // a tank of volume V: cylinder of radius R with two heads (k = R/h of the heads)
  S.tank = function (V, R, k, heads) {
    heads = heads == null ? 2 : heads;
    var hd = S.head(R, k || Math.SQRT2), Lc = Math.max(0, (V - hd.V * 2) / (Math.PI * R * R));
    return { Lcyl: Lc, L: Lc + 2 * hd.h, A: 2 * Math.PI * R * Lc + heads * hd.A, short: V < 2 * hd.V };
  };
  S.hoop = function (p, R, t) { return { hoop: p * R / t, axial: p * R / (2 * t) }; };
  // the thinnest wall that carries pressure p at the yield and ultimate design factors of the approach
  S.wallFor = function (p, R, m, appr) {
    var f = S.FOS[appr || 'protoflight'], tu = (m.composite ? (appr === 'prototype' ? f.compUlt : f.compUlt) : f.ult) * p * R / (m.su * 1e6), ty = m.sy ? f.yld * p * R / (m.sy * 1e6) : 0;
    return { t: Math.max(tu, ty), tu: tu, ty: ty, by: ty > tu ? 'yield' : 'ultimate' };
  };
  S.ms = function (allow, limit, fs) { return allow / (limit * fs) - 1; };
  // NASA SP-8007 knockdown for an unstiffened isotropic cylinder in axial compression (recalled formula)
  S.knockdown = function (R, t) { var phi = Math.sqrt(R / t) / 16; return 1 - 0.901 * (1 - Math.exp(-phi)); };
  S.sigmaCr = function (E, t, R, nu) { nu = nu == null ? 0.3 : nu; return E * t / (R * Math.sqrt(3 * (1 - nu * nu))); };

  /* ---------- Bottom-up inert mass of a stage ---------- */
  // st {mp, prop, d, Tvac, twEng, tmin (m), mat, k (tank factor for stiffeners, insulation, fittings), pUll (Pa),
  //     nLift (axial g at liftoff, for the head), fixed (kg: thrust structure, interstage, avionics, pressurization),
  //     fairing (kg, top stage), resid (fraction of propellant), common (common bulkhead), pCase (Pa, solid motor case)}
  S.inert = function (st, o) {
    o = o || {};
    var p = S.prop(st.prop), R = st.d / 2, m = S.mat(st.mat || 'al2219'), appr = o.appr || 'protoflight', parts = [], tanks = [];
    var vols = p.OF == null ? [{ n: 'Propellant', V: st.mp / p.rho * 1.0, rho: p.rho }] : [{ n: 'Oxidizer', V: st.mp * p.OF / (1 + p.OF) / p.rhoO * 1.03, rho: p.rhoO }, { n: 'Fuel', V: st.mp / (1 + p.OF) / p.rhoF * 1.03, rho: p.rhoF }];
    var mt = 0, L = 0;
    vols.forEach(function (v, i) {
      var tk = S.tank(v.V, R, Math.SQRT2, st.common && i > 0 ? 1 : 2), head = v.rho * S.G0 * (st.nLift || 1.3) * tk.L;
      var pl = (p.OF == null ? 0 : (st.pUll == null ? 3e5 : st.pUll)) + head;
      var w = S.wallFor(pl, R, m, appr), t = Math.max(w.t, st.tmin || 0.0015);
      var mass = tk.A * t * m.rho * (st.k || 1.6);
      if (p.OF == null) { pl = st.pCase || 6e6; w = S.wallFor(pl, R, m, appr); t = Math.max(w.t, st.tmin || 0.0015); mass = tk.A * t * m.rho * (st.k || 1.6); }
      tanks.push({ n: v.n, V: v.V, L: tk.L, A: tk.A, p: pl, tP: w.t, t: t, mass: mass, by: t > w.t ? 'minimum gauge' : 'pressure (' + w.by + ')' });
      mt += mass; L += tk.L;
    });
    var me = st.twEng ? st.Tvac / (S.G0 * st.twEng) : (st.nozzleFrac || 0) * st.mp, mr = (st.resid == null ? 0.01 : st.resid) * st.mp, mf = (st.fixed || 0) + (st.fixedFrac || 0) * st.mp, mfair = st.fairing || 0;
    parts = [{ n: p.OF == null ? 'Motor case' : 'Tanks', m: mt }, { n: p.OF == null ? 'Nozzle' : 'Engines', m: me }, { n: 'Residual propellant', m: mr }, { n: 'Structure, avionics and pressurization', m: mf }];
    if (mfair) parts.push({ n: 'Payload fairing', m: mfair });
    var ms = parts.reduce(function (s, q) { return s + q.m; }, 0);
    return { parts: parts, tanks: tanks, ms: ms, eps: ms / (ms + st.mp), tankLength: L };
  };

  /* ---------- Presets and the whole design ---------- */
  // stages from the first up. isp: the mean over the stage's burn (stage 1: between sea level and vacuum)
  S.PRESETS = [
    { id: 'small', label: 'Small launcher (Lessons 4–8)', mpl: 300, h: 500e3, inc: 'sso', lat: 45, gl: 1300, dl: 120, sl: 100,
      stages: [
        { prop: 'kerolox', isp: 300, ispSL: 283, ispVac: 315, eps: 0.08, tw: 1.30, d: 1.2, twEng: 70, tmin: 0.0015, k: 1.6, fixed: 250, mat: 'al2219' },
        { prop: 'kerolox', isp: 340, ispVac: 340, eps: 0.10, tw: 0.90, d: 1.2, twEng: 40, tmin: 0.0012, k: 1.6, fixed: 15, fairing: 50, common: true, mat: 'al2219' }
      ] },
    { id: 'medium', label: 'Medium kerosene launcher', mpl: 15000, h: 200e3, inc: 28.5, lat: 28.5, gl: 1400, dl: 100, sl: 150,
      stages: [
        { prop: 'kerolox', isp: 300, ispSL: 282, ispVac: 311, eps: 0.05, tw: 1.30, d: 3.7, twEng: 150, tmin: 0.004, k: 1.6, fixed: 4000, mat: 'al2195' },
        { prop: 'kerolox', isp: 348, ispVac: 348, eps: 0.06, tw: 0.80, d: 3.7, twEng: 90, tmin: 0.003, k: 1.6, fixed: 500, fairing: 1700, common: true, mat: 'al2195' }
      ] },
    { id: 'hydrolox', label: 'Hydrogen upper stage', mpl: 10000, h: 400e3, inc: 51.6, lat: 45.6, gl: 1400, dl: 100, sl: 150,
      stages: [
        { prop: 'kerolox', isp: 300, ispSL: 282, ispVac: 311, eps: 0.05, tw: 1.30, d: 3.7, twEng: 150, tmin: 0.004, k: 1.6, fixed: 4000, mat: 'al2195' },
        { prop: 'hydrolox', isp: 450, ispVac: 450, eps: 0.10, tw: 0.60, d: 3.7, twEng: 60, tmin: 0.003, k: 2.0, fixed: 600, fairing: 1700, common: true, mat: 'al2195' }
      ] },
    { id: 'solid', label: 'Three solid stages', mpl: 500, h: 500e3, inc: 'sso', lat: 34.7, gl: 1500, dl: 150, sl: 150,
      stages: [
        { prop: 'solid', isp: 270, ispSL: 260, ispVac: 280, eps: 0.10, tw: 1.8, d: 2.3, twEng: 0, nozzleFrac: 0.02, tmin: 0.004, k: 1.3, fixedFrac: 0.03, mat: 'cfw' },
        { prop: 'solid', isp: 285, ispVac: 285, eps: 0.10, tw: 1.2, d: 2.3, twEng: 0, nozzleFrac: 0.025, tmin: 0.003, k: 1.3, fixedFrac: 0.03, fairing: 150, mat: 'cfw' },
        { prop: 'solid', isp: 295, ispVac: 295, eps: 0.12, tw: 1.0, d: 1.6, twEng: 0, nozzleFrac: 0.03, tmin: 0.002, k: 1.3, fixedFrac: 0.04, mat: 'cfw' }
      ] }
  ];
  S.preset = function (id) { for (var i = 0; i < S.PRESETS.length; i++) if (S.PRESETS[i].id === id) return JSON.parse(JSON.stringify(S.PRESETS[i])); return null; };
  // spec as a preset; o {split: [dv fractions] (optional, else optimal), close: true (iterate eps bottom-up), appr}
  S.design = function (spec, o) {
    o = o || {};
    var b = S.budget({ h: spec.h, inc: spec.inc, lat: spec.lat, gl: spec.gl, dl: spec.dl, sl: spec.sl });
    if (!isFinite(b.total)) return { ok: false, msg: 'This inclination cannot be reached directly from this latitude: the inclination must be at least the latitude.', budget: b };
    var cs = spec.stages.map(function (s) { return s.isp * S.G0; }), eps = spec.stages.map(function (s) { return s.eps; }), iter = 0, res, inerts;
    for (; iter < (o.close ? 60 : 1); iter++) {
      res = o.split ? S.stack(o.split.map(function (f) { return f * b.total; }), cs, eps, spec.mpl) : S.stageOpt(b.total, cs, eps, spec.mpl);
      if (!res) return { ok: false, msg: 'The stages cannot give this Δv: raise their specific impulse, lower their structural coefficients or add a stage.', budget: b };
      inerts = res.stages.map(function (st, i) {
        var sp = spec.stages[i], T = sp.tw * st.m0 * S.G0, Tvac = sp.ispVac && sp.ispSL ? T * sp.ispVac / sp.ispSL : T;
        return S.inert(Object.assign({}, sp, { mp: st.mp, Tvac: Tvac, nLift: sp.tw }), { appr: o.appr });
      });
      if (!o.close) break;
      var dmax = 0;
      eps = inerts.map(function (q, i) { dmax = Math.max(dmax, Math.abs(q.eps - eps[i])); return eps[i] + 0.7 * (q.eps - eps[i]); });
      if (dmax < 1e-6) break;
      if (o.trace) o.trace.push(eps.slice());
      if (eps.some(function (e) { return !(e > 0 && e < 0.5); })) return { ok: false, msg: 'The sizing loop does not converge: a stage\'s inert mass grows faster than the stage as the loop shrinks it. Lower its allowances or change the number of stages.', budget: b };
    }
    var stages = res.stages.map(function (st, i) {
      var sp = spec.stages[i], T = sp.tw * st.m0 * S.G0, Tvac = sp.ispVac && sp.ispSL ? T * sp.ispVac / sp.ispSL : T, mdot = T / ((sp.ispSL || sp.isp) * S.G0);
      return Object.assign({}, st, { prop: sp.prop, isp: sp.isp, d: sp.d, T: T, Tvac: Tvac, mdot: mdot, tb: st.mp / mdot, aBo: Tvac / (st.mf * S.G0), inert: inerts[i] });
    });
    return { ok: true, budget: b, stages: stages, m0: res.m0, mpl: spec.mpl, pf: res.pf, eps: eps, iter: iter, closed: !!o.close };
  };

  global.SPACE = S;
})(typeof window !== 'undefined' ? window : this);
