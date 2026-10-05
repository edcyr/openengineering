/*!
 * sizing.js — SIZING: first-estimate sizing after Raymer, Chapter 3, for Module 3 of Conceptual Aircraft Design
 * (The First Estimate of Takeoff Weight). Plain ES5, no dependencies.
 *
 *   SIZING.CLASSES        empty-weight trends We/W0 = A W0^C Kvs, after Raymer Table 3.1 (A for W0 in lb), with A in kg
 *   SIZING.cls(id)        one class
 *   SIZING.ef(W0, c, o)   empty-weight fraction at W0 (kg) for class c; o: {kvs: true, tech: 1}
 *   SIZING.CFE            equivalent skin-friction coefficients, after Raymer Table 12.3
 *   SIZING.JET_C, PROP    typical specific fuel consumptions (Raymer Tables 3.3 and 3.4) and propeller efficiencies
 *   SIZING.HIST           historical segment fractions (Raymer Table 3.2)
 *   SIZING.ldmaxWet(Awet, cfe, e)  L/Dmax = 0.5 sqrt(pi e Awet / Cfe)
 *   SIZING.cruise(R, V, C, LD), SIZING.loiter(E, C, LD)  Breguet segment fractions (km, km/h, 1/h, h)
 *   SIZING.propC(cP, V, eta)       equivalent C (1/h) of a propeller engine: power-specific cP in kg/(kW h), V in km/h
 *   SIZING.solve(o)       iterate W0 = Wfixed / (1 - Wf/W0 - We/W0) for a class and a fuel fraction
 */
(function (global) {
  'use strict';
  var S = {};
  var LB = 0.45359237;
  function cl(id, label, A, C, group) { return { id: id, label: label, Alb: A, C: C, A: A * Math.pow(LB, -C), group: group }; }
  S.CLASSES = [
    cl('sail', 'Sailplane, unpowered', 0.86, -0.05, 'Light'),
    cl('sailp', 'Sailplane, powered', 0.91, -0.05, 'Light'),
    cl('homemw', 'Homebuilt, metal or wood', 1.19, -0.09, 'Light'),
    cl('homec', 'Homebuilt, composite', 1.15, -0.09, 'Light'),
    cl('ga1', 'General aviation, single engine', 2.36, -0.18, 'General aviation'),
    cl('ga2', 'General aviation, twin engine', 1.51, -0.10, 'General aviation'),
    cl('ag', 'Agricultural aircraft', 0.74, -0.03, 'General aviation'),
    cl('tprop', 'Twin turboprop', 0.96, -0.05, 'Transport'),
    cl('boat', 'Flying boat', 1.09, -0.05, 'Transport'),
    cl('trainer', 'Jet trainer', 1.59, -0.10, 'Military'),
    cl('fighter', 'Jet fighter', 2.34, -0.13, 'Military'),
    cl('cargo', 'Military cargo or bomber', 0.93, -0.07, 'Military'),
    cl('jt', 'Jet transport', 1.02, -0.06, 'Transport')
  ];
  var BY = {};
  S.CLASSES.forEach(function (c) { BY[c.id] = c; });
  S.cls = function (id) { return BY[id] || null; };
  S.KVS = 1.04;   // variable-sweep wing
  S.ef = function (W0, c, o) {
    o = o || {}; if (typeof c === 'string') c = BY[c];
    return c.A * Math.pow(W0, c.C) * (o.kvs ? S.KVS : 1) * (o.tech == null ? 1 : o.tech);
  };

  S.CFE = [
    { id: 'transport', label: 'Bomber and civil transport', cfe: 0.0030 },
    { id: 'milcargo', label: 'Military cargo (high upsweep fuselage)', cfe: 0.0035 },
    { id: 'aff', label: 'Air Force fighter', cfe: 0.0035 },
    { id: 'navyf', label: 'Navy fighter', cfe: 0.0040 },
    { id: 'sst', label: 'Clean supersonic cruise aircraft', cfe: 0.0025 },
    { id: 'light1', label: 'Light aircraft, single engine', cfe: 0.0055 },
    { id: 'light2', label: 'Light aircraft, twin engine', cfe: 0.0045 },
    { id: 'pseaplane', label: 'Propeller seaplane', cfe: 0.0065 },
    { id: 'jseaplane', label: 'Jet seaplane', cfe: 0.0040 }
  ];
  S.JET_C = [
    { id: 'tj', label: 'Pure turbojet', cruise: 0.9, loiter: 0.8 },
    { id: 'lbtf', label: 'Low-bypass turbofan', cruise: 0.8, loiter: 0.7 },
    { id: 'hbtf', label: 'High-bypass turbofan', cruise: 0.5, loiter: 0.4 }
  ];
  // Typical power-specific fuel consumption cP (lb/hp/h, and kg/(kW h); Raymer's C_bhp) and propeller efficiency for initial sizing
  function pr(id, label, cr, lo, eta) { var k = LB / 0.745699872; return { id: id, label: label, cruise: cr, loiter: lo, cruiseSI: cr * k, loiterSI: lo * k, eta: eta }; }
  S.PROP = [pr('pfix', 'Piston, fixed-pitch propeller', 0.4, 0.5, 0.7), pr('pvar', 'Piston, variable-pitch propeller', 0.4, 0.5, 0.8), pr('tp', 'Turboprop', 0.5, 0.6, 0.8)];
  S.HIST = { takeoff: 0.970, climb: 0.985, landing: 0.995 };
  S.RESERVE = 1.06;

  S.ldmaxWet = function (Awet, cfe, e) { return 0.5 * Math.sqrt(Math.PI * (e || 0.8) * Awet / cfe); };
  S.cruise = function (R, V, C, LD) { return Math.exp(-R * C / (V * LD)); };
  S.loiter = function (E, C, LD) { return Math.exp(-E * C / LD); };
  S.propC = function (cP, V, eta) { return cP * 9.81 * (V / 3.6) / (eta * 1000); };   // kg/(kW h) → 1/h

  /** o: {cls, Wfixed (kg), ff (Wf/W0), kvs, tech, guess}. Returns {W0, fe, steps:[{W, fe, Wnew}], ok} */
  S.solve = function (o) {
    var c = typeof o.cls === 'string' ? BY[o.cls] : o.cls, W = o.guess || 10 * o.Wfixed, steps = [];
    for (var i = 0; i < 200; i++) {
      var fe = S.ef(W, c, o), d = 1 - o.ff - fe;
      if (!(d > 0.002)) return { ok: false, steps: steps };
      var Wn = o.Wfixed / d;
      steps.push({ W: W, fe: fe, Wnew: Wn });
      if (Math.abs(Wn - W) < 0.5) { W = Wn; break; }
      W = Wn;
    }
    return { ok: isFinite(W) && W > 0 && W < 1e8, W0: W, fe: S.ef(W, c, o), steps: steps };
  };

  global.SIZING = S;
})(typeof window !== 'undefined' ? window : this);
