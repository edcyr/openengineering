/*!
 * layout.js — LAYOUT: fuselage, cabin, wing placement, fuel volume and wetted area, for Module 6 of Conceptual Aircraft
 * Design (Configuration Layout and Fuselage Sizing). Plain ES5, no dependencies; every function is pure.
 *
 * Units: metres, m², m³ and kg, unless a name says inches (cabin data are given in inches, as the industry does).
 *
 *   LAYOUT.IN                              0.0254 m per inch
 *   LAYOUT.LSTAT, LAYOUT.lengthStat(id, W0) statistical fuselage length l_F = a W0^C (W0 in kg), by class
 *   LAYOUT.CABIN                           typical cabin and seat dimensions by class (first, economy, small)
 *   LAYOUT.SEATS                           seat bench widths (in) for 1 to 4 seats: economy, business, first
 *   LAYOUT.aisleMin(nPax)                  minimum aisle width (in) below and above 25 in from the floor (CS/FAR 25.815)
 *   LAYOUT.aislesFor(nSA)                  number of aisles for n seats abreast (CS/FAR 25.817: at most 3 seats beside an aisle)
 *   LAYOUT.nsaStat(nPax)                   statistical seats abreast, 0.45 sqrt(nPax)
 *   LAYOUT.innerWidth(benches, aisles, aisleIn, gapIn, cls)  cabin width (m) from benches of seats, e.g. [3, 3]
 *   LAYOUT.wall(dI), LAYOUT.outer(dI)      fuselage wall thickness 0.084 m + 0.045 d_I, and the outer diameter
 *   LAYOUT.exits(nPax)                     emergency exits per side of the fuselage (CS/FAR 25.807), {I, II, III, IV, A}
 *   LAYOUT.attendants(nPax)                minimum cabin crew (FAR 91.533)
 *   LAYOUT.fuselageLength(c)               cockpit + cabin + tail cone − cabin overlap into the cone:
 *                                          c = {lCockpit (4 m airliner), lCabin, d, kTail (3.5), kOver (1.9 airliner, 0 rear engines)}
 *   LAYOUT.tailAngle(kTail)                the tail-cone angle arctan(1/kTail), degrees
 *   LAYOUT.planform(S, A, lam)             {b, cr, ct, mac, ymac}; LAYOUT.chordAt(pf, y)
 *   LAYOUT.exposed(pf, d)                  exposed wing area outside a fuselage of diameter d
 *   LAYOUT.tails(c)                        tail areas from volume coefficients and arms: c = {cHT, cVT, mac, b, S, LHT, LVT}
 *   LAYOUT.tankVolume(S, A, lam, tcr, tau) wing tank volume without a centre tank (m³)
 *   LAYOUT.swetFus(d, l)                   wetted area of a fuselage with a cylindrical middle (fineness 4.5 or more)
 *   LAYOUT.swetFusStream(d, l, ln)         wetted area of a streamlined fuselage, ln to the start of the widest part
 *   LAYOUT.swetWing(Sexp, tcr, tau, lam)   wetted area of a wing or tail from its exposed area
 *   LAYOUT.swetNacelle(D, l)               a nacelle taken as a cylinder, pending the engine data of Module 7
 *   LAYOUT.ldMax(A, e, Cfe, swetRatio)     (L/D)max = 0.5 sqrt(pi A e/(Cfe Swet/Sref)), as in Module 3
 *   LAYOUT.geometry(spec), drawSide(g, G), drawTop(g, G, {half}), sideOutline(G), halfWidth(G, x)  schematic
 *                                          to-scale side and top views on CYL2D groups (nose toward -x, x = station)
 *
 * Sources: the statistical fuselage lengths are after Raymer (Table 6.3), as given in SI units in course notes adapted
 * from it; the cabin table is Raymer's, the seat widths Airbus's, and the wall thickness, nose and tail proportions,
 * wing tank volume and wetted areas Torenbeek's and Schmitt's, all as presented in Scholz's Aircraft Design lecture notes
 * (HAW Hamburg); the aisle, aisle-count and exit rules are CS/FAR 25.815, 25.817 and 25.807; cabin crew FAR 91.533.
 */
(function (global) {
  'use strict';
  var X = {}, IN = 0.0254;
  X.IN = IN;

  /* ---------- Statistics ---------- */
  X.LSTAT = [
    ['sail', 'Sailplane', 0.383, 0.48], ['msail', 'Powered sailplane', 0.316, 0.48], ['homemw', 'Homebuilt (metal or wood)', 1.350, 0.23],
    ['homec', 'Homebuilt (composite)', 1.280, 0.23], ['ga1', 'General aviation, single engine', 1.600, 0.23], ['ga2', 'General aviation, twin engine', 0.366, 0.42],
    ['ag', 'Agricultural', 1.480, 0.23], ['tprop', 'Twin turboprop', 0.169, 0.51], ['boat', 'Flying boat', 0.439, 0.40], ['trainer', 'Jet trainer', 0.333, 0.41],
    ['fighter', 'Jet fighter', 0.389, 0.39], ['cargo', 'Military cargo or bomber', 0.104, 0.50], ['jt', 'Jet transport', 0.287, 0.43]
  ].map(function (r) { return { id: r[0], label: r[1], a: r[2], C: r[3] }; });
  X.lengthStat = function (id, W0) { for (var i = 0; i < X.LSTAT.length; i++) if (X.LSTAT[i].id === id) return X.LSTAT[i].a * Math.pow(W0, X.LSTAT[i].C); return NaN; };
  // typical cabin and seat dimensions (inches unless stated): first class, economy, high density or small aircraft
  X.CABIN = [
    { item: 'Seat pitch (in)', first: '38 to 40', econ: '34 to 36', small: '30 to 32' },
    { item: 'Seat width (in)', first: '20 to 28', econ: '17 to 22', small: '16 to 18' },
    { item: 'Headroom (in)', first: 'over 65', econ: 'over 65', small: '–' },
    { item: 'Aisle width (in)', first: '20 to 28', econ: '18 to 20', small: '12 or more' },
    { item: 'Aisle height (in)', first: 'over 76', econ: 'over 76', small: 'over 60' },
    { item: 'Passengers per cabin attendant', first: '16 to 20', econ: '31 to 36', small: '50 or fewer' },
    { item: 'Passengers per lavatory (40 × 40 in)', first: '10 to 20', econ: '40 to 60', small: '40 to 60' },
    { item: 'Galley volume per passenger (ft³)', first: '5 to 8', econ: '1 to 2', small: '0 to 1' }
  ];
  X.SEATS = { economy: [21, 40, 60, 80], business: [25, 48, 72, NaN], first: [25.5, 50, NaN, NaN] };   // one to four seats, inches; the economy
  // bench of four is not in the source table: it is taken as 20 in per seat, like the benches of two and three

  /* ---------- Cross-section ---------- */
  X.aisleMin = function (n) { return n <= 10 ? { low: 12, high: 15 } : n <= 19 ? { low: 12, high: 20 } : { low: 15, high: 20 }; };
  X.aislesFor = function (nSA) { return nSA <= 6 ? 1 : nSA <= 12 ? 2 : 3; };
  X.nsaStat = function (n) { return 0.45 * Math.sqrt(n); };
  // benches: seats per bench across the cabin, e.g. [2, 2] or [3, 3]; seat widths from X.SEATS[cls] unless seatIn is given (per seat)
  X.innerWidth = function (benches, aisles, aisleIn, gapIn, cls, seatIn) {
    var w = 0, t = X.SEATS[cls || 'economy'];
    benches.forEach(function (k) { w += seatIn ? k * seatIn : t[k - 1]; });
    return (w + aisles * aisleIn + 2 * (gapIn == null ? 1 : gapIn)) * IN;
  };
  X.wall = function (dI) { return 0.084 + 0.045 * dI; };
  X.outer = function (dI) { return dI + X.wall(dI); };

  /* ---------- Cabin rules ---------- */
  X.exits = function (n) {
    var T = [[9, { IV: 1 }], [19, { III: 1 }], [39, { II: 1, III: 1 }], [79, { I: 1, III: 1 }], [109, { I: 1, III: 2 }], [139, { I: 2, III: 1 }], [179, { I: 2, III: 2 }]];
    for (var i = 0; i < T.length; i++) if (n <= T[i][0]) return Object.assign({ I: 0, II: 0, III: 0, IV: 0, A: 0 }, T[i][1]);
    var e = { I: 2, II: 0, III: 2, IV: 0, A: 0 }, extra = n - 179;
    while (extra > 0) { e.A++; extra -= 110; }   // the simplest way to add seats beyond 179: Type A pairs of 110 seats
    return e;
  };
  X.attendants = function (n) { return n <= 19 ? 0 : n <= 50 ? 1 : n <= 100 ? 2 : 2 + Math.ceil((n - 100) / 50); };

  /* ---------- Fuselage length ---------- */
  X.fuselageLength = function (c) {
    var kT = c.kTail == null ? 3.5 : c.kTail, kO = c.kOver == null ? 1.9 : c.kOver;
    return (c.lCockpit == null ? 4 : c.lCockpit) + c.lCabin + (kT - kO) * c.d;
  };
  X.tailAngle = function (kTail) { return Math.atan(1 / (kTail || 3.5)) * 180 / Math.PI; };

  /* ---------- Wing and tails ---------- */
  X.planform = function (S, A, lam) {
    var b = Math.sqrt(A * S), cr = 2 * S / (b * (1 + lam)), mac = 2 / 3 * cr * (1 + lam + lam * lam) / (1 + lam);
    return { S: S, A: A, lam: lam, b: b, cr: cr, ct: lam * cr, mac: mac, ymac: b / 6 * (1 + 2 * lam) / (1 + lam) };
  };
  X.chordAt = function (pf, y) { return pf.cr * (1 - (1 - pf.lam) * 2 * Math.abs(y) / pf.b); };
  X.exposed = function (pf, d) { return pf.S - d * (pf.cr + X.chordAt(pf, d / 2)) / 2; };
  X.tails = function (c) { return { SHT: c.cHT * c.mac * c.S / c.LHT, SVT: c.cVT * c.b * c.S / (c.LVT || c.LHT) }; };

  /* ---------- Fuel ---------- */
  X.tankVolume = function (S, A, lam, tcr, tau) {
    var t = tau == null ? 1 : tau;
    return 0.54 * Math.pow(S, 1.5) * tcr / Math.sqrt(A) * (1 + lam * Math.sqrt(t) + lam * lam * t) / ((1 + lam) * (1 + lam));
  };

  /* ---------- Wetted area ---------- */
  X.swetFus = function (d, l) { var r = l / d; return Math.PI * d * l * Math.pow(1 - 2 / r, 2 / 3) * (1 + 1 / (r * r)); };
  X.swetFusStream = function (d, l, ln) { var r = l / d; return Math.PI * d * l * Math.pow(0.5 + 0.135 * ln / l, 2 / 3) * (1.015 + 0.3 / Math.pow(r, 1.5)); };
  X.swetWing = function (Sexp, tcr, tau, lam) { var t = tau == null ? 1 : tau; return 2 * Sexp * (1 + 0.25 * tcr * (1 + t * lam) / (1 + lam)); };
  X.swetNacelle = function (D, l) { return Math.PI * D * l; };
  X.ldMax = function (A, e, Cfe, r) { return 0.5 * Math.sqrt(Math.PI * A * e / (Cfe * r)); };

  /* ---------- Skin friction (as in Module 3) ---------- */
  X.CFE = [
    { id: 'transport', label: 'Bomber and civil transport', cfe: 0.0030 }, { id: 'milcargo', label: 'Military cargo (high upsweep fuselage)', cfe: 0.0035 },
    { id: 'aff', label: 'Air Force fighter', cfe: 0.0035 }, { id: 'navyf', label: 'Navy fighter', cfe: 0.0040 }, { id: 'sst', label: 'Clean supersonic cruise aircraft', cfe: 0.0025 },
    { id: 'light1', label: 'Light aircraft, single engine', cfe: 0.0055 }, { id: 'light2', label: 'Light aircraft, twin engine', cfe: 0.0045 },
    { id: 'pseaplane', label: 'Propeller seaplane', cfe: 0.0065 }, { id: 'jseaplane', label: 'Jet seaplane', cfe: 0.0040 }
  ];

  /* ---------- Layouts: the module's business jet and three illustrative types ---------- */
  // cabin: seats per bench across the cabin (benches), aisles, widths (in), rows and pitch (in), lavatories (40 in each),
  //   galleys (30 in each) and an allowance (m) for the entry, doors and wardrobes; fus: cockpit (or nose) length and the
  //   nose, tail cone and cabin-overlap lengths in diameters; wing: xFrac = wing quarter-MAC station / l_F, pos low|mid|high;
  //   tail: volume coefficients, arm as a share of l_F, planform; eng: rear | wing | nose | none, with nacelle size (m),
  //   xFrac (rear: nacelle center / l_F) or yFrac (wing: nacelle station / half span), prop = propeller diameter.
  X.PRESETS = [
    { id: 'bizjet', label: 'Business jet (this module)', W0: 6943, fuelFrac: 0.2867, rhoF: 800, Cfe: 0.0030, e: 0.75, crew: 2,
      cabin: { benches: [1, 1], aisles: 1, aisleIn: 15, seatIn: 20, gapIn: 1, rows: 4, pitchIn: 38, lav: 1, galley: 0, extra: 1.0 },
      fus: { lCockpit: 4, kNose: 1.7, kTail: 3.5, kOver: 0, round: 0.1 },
      wing: { S: 28, A: 8, lam: 0.35, sweep: 25, tc: 0.12, tau: 1, pos: 'low', dihedral: 3, xFrac: 0.45 },
      tail: { cHT: 0.70, cVT: 0.06, armFrac: 0.47, tee: false, hA: 4, hLam: 0.45, hSweep: 30, vA: 1.5, vLam: 0.45, vSweep: 35, tc: 0.10 },
      eng: { kind: 'rear', n: 2, D: 0.8, l: 2.4, xFrac: 0.75 } },
    { id: 'narrow', label: 'Narrow-body airliner, 150 seats (illustrative)', W0: 73500, fuelFrac: 0.20, rhoF: 800, Cfe: 0.0030, e: 0.80, crew: 2,
      cabin: { benches: [3, 3], aisles: 1, aisleIn: 19, seatIn: 0, cls: 'economy', gapIn: 1, rows: 25, pitchIn: 32, lav: 3, galley: 2, extra: 2.1 },
      fus: { lCockpit: 4, kNose: 1.7, kTail: 3.5, kOver: 1.9, round: 0.1 },
      wing: { S: 122.6, A: 9.5, lam: 0.24, sweep: 25, tc: 0.14, tau: 0.75, pos: 'low', dihedral: 5, xFrac: 0.42 },
      tail: { cHT: 1.00, cVT: 0.09, armFrac: 0.47, tee: false, hA: 5, hLam: 0.3, hSweep: 30, vA: 1.7, vLam: 0.35, vSweep: 35, tc: 0.10 },
      eng: { kind: 'wing', n: 2, D: 2.2, l: 4.3, yFrac: 0.34 } },
    { id: 'tprop', label: 'Regional turboprop, 72 seats (illustrative)', W0: 23000, fuelFrac: 0.12, rhoF: 800, Cfe: 0.0030, e: 0.80, crew: 2,
      cabin: { benches: [2, 2], aisles: 1, aisleIn: 18, seatIn: 0, cls: 'economy', gapIn: 1, rows: 18, pitchIn: 30, lav: 1, galley: 1, extra: 2.0 },
      fus: { lCockpit: 4, kNose: 1.7, kTail: 3.5, kOver: 1.9, round: 0.1 },
      wing: { S: 61, A: 12, lam: 0.5, sweep: 0, tc: 0.15, tau: 0.8, pos: 'high', dihedral: 2, xFrac: 0.42 },
      tail: { cHT: 0.90, cVT: 0.08, armFrac: 0.47, tee: true, hA: 4.5, hLam: 0.5, hSweep: 10, vA: 1.2, vLam: 0.6, vSweep: 35, tc: 0.10 },
      eng: { kind: 'wing', n: 2, D: 1.0, l: 4.5, yFrac: 0.27, prop: 3.9 } },
    { id: 'commuter', label: 'Commuter turboprop, 18 seats (illustrative)', W0: 7700, fuelFrac: 0.15, rhoF: 800, Cfe: 0.0045, e: 0.78, crew: 2,
      cabin: { benches: [1, 1], aisles: 1, aisleIn: 15, seatIn: 18, gapIn: 1, rows: 9, pitchIn: 30, lav: 0, galley: 0, extra: 1.6 },
      fus: { lCockpit: 3.2, kNose: 1.6, kTail: 3.5, kOver: 0, round: 0.15 },
      wing: { S: 28.8, A: 10.9, lam: 0.5, sweep: 0, tc: 0.16, tau: 0.75, pos: 'low', dihedral: 6, xFrac: 0.42 },
      tail: { cHT: 0.80, cVT: 0.07, armFrac: 0.48, tee: true, hA: 4.5, hLam: 0.6, hSweep: 10, vA: 1.2, vLam: 0.6, vSweep: 35, tc: 0.10 },
      eng: { kind: 'wing', n: 2, D: 0.75, l: 3.2, yFrac: 0.27, prop: 2.8 } }
  ];
  X.preset = function (id) { for (var i = 0; i < X.PRESETS.length; i++) if (X.PRESETS[i].id === id) return JSON.parse(JSON.stringify(X.PRESETS[i])); return null; };

  /* ---------- Evaluating a layout ---------- */
  var D2R = Math.PI / 180;
  function sweepLE(A, lam, s25) { return Math.atan(Math.tan(s25 * D2R) + (1 - lam) / (A * (1 + lam))) / D2R; }
  X.sweepLE = sweepLE;
  X.cabinLength = function (c) { return (c.rows * c.pitchIn + 40 * (c.lav || 0) + 30 * (c.galley || 0)) * IN + (c.extra || 0); };
  X.seatsOf = function (c) { return c.rows * c.benches.reduce(function (a, k) { return a + k; }, 0); };
  X.cabinWidth = function (c) { return X.innerWidth(c.benches, c.aisles, c.aisleIn, c.gapIn, c.cls || 'economy', c.seatIn || null); };
  // the whole layout: cabin, fuselage, wing and tails placed on the fuselage, fuel, wetted areas and (L/D)max
  X.evaluate = function (sp) {
    var R = { sp: sp }, c = sp.cabin, f = sp.fus, w = sp.wing, t = sp.tail, e = sp.eng;
    R.pax = X.seatsOf(c);
    R.dI = X.cabinWidth(c); R.wall = X.wall(R.dI); R.d = R.dI + R.wall;
    R.lCabin = X.cabinLength(c);
    R.lFcalc = X.fuselageLength({ lCockpit: f.lCockpit, lCabin: R.lCabin, d: R.d, kTail: f.kTail, kOver: f.kOver });
    R.lF = Math.ceil(R.lFcalc * 10 - 1e-9) / 10;                    // rounded up to the next 0.1 m
    R.fineness = R.lF / R.d;
    R.wpf = X.planform(w.S, w.A, w.lam);
    R.xAcW = w.xFrac * R.lF;
    R.arm = t.armFrac * R.lF;
    var T = X.tails({ cHT: t.cHT, cVT: t.cVT, mac: R.wpf.mac, b: R.wpf.b, S: w.S, LHT: R.arm, LVT: R.arm });
    R.SHT = T.SHT; R.SVT = T.SVT;
    function geo() {
      return X.geometry({ d: R.d, lF: R.lF, lCockpit: f.lCockpit, lCabin: R.lCabin, kNose: f.kNose, kTail: f.kTail, kOver: f.kOver, round: f.round, dI: R.dI,
        wing: { S: w.S, A: w.A, lam: w.lam, sweep: w.sweep, tc: w.tc, xAc: R.xAcW, pos: w.pos, dihedral: w.dihedral },
        ht: { S: R.SHT, A: t.hA, lam: t.hLam, sweep: t.hSweep, tc: t.tc, xAc: R.xAcW + R.arm, tee: t.tee },
        vt: { S: R.SVT, A: t.vA, lam: t.vLam, sweep: t.vSweep, tc: t.tc, xAc: R.xAcW + R.arm },
        eng: Object.assign({}, e) });
    }
    R.G = geo();
    for (var it = 0; t.tee && it < 6; it++) { R.SHT = t.cHT * R.wpf.mac * w.S / (R.G.ht.xAc - R.xAcW); R.G = geo(); }   // a T-tail rides on the fin: its longer arm needs less area
    R.LHT = R.G.ht.xAc - R.xAcW; R.LVT = R.arm;
    R.mFuel = sp.fuelFrac * sp.W0; R.vFuel = R.mFuel / sp.rhoF;
    R.vTank = X.tankVolume(w.S, w.A, w.lam, w.tc, w.tau);
    R.sExp = X.exposed(R.wpf, R.d);
    R.swet = { fus: X.swetFus(R.d, R.lF), wing: X.swetWing(R.sExp, w.tc, w.tau, w.lam), ht: X.swetWing(R.SHT, t.tc, 1, t.hLam), vt: X.swetWing(R.SVT, t.tc, 1, t.vLam),
      nac: e.kind === 'rear' || e.kind === 'wing' ? (e.n || 2) * X.swetNacelle(e.D, e.l) : 0 };
    R.swet.total = R.swet.fus + R.swet.wing + R.swet.ht + R.swet.vt + R.swet.nac;
    R.ratio = R.swet.total / w.S;
    R.LD = X.ldMax(w.A, sp.e, sp.Cfe, R.ratio);
    return R;
  };

  /* ---------- Geometry for the drawings ---------- */
  // spec = {d, lF?, lCockpit, lCabin, kNose, kTail, kOver, round, dI?, wing: {S, A, lam, sweep, tc, xAc, pos, dihedral},
  //   ht: {S, A, lam, sweep, tc, xAc, tee}, vt: {S, A, lam, sweep, tc, xAc}, eng}; x is the station aft of the nose,
  //   y to the right wing, z up from the cylinder's axis
  X.geometry = function (sp) {
    var d = sp.d, r = d / 2, G = { d: d, r: r, sp: sp };
    G.lF = sp.lF || X.fuselageLength(sp);
    G.lNose = Math.min((sp.kNose || 1.7) * d, sp.lCockpit == null ? 4 : sp.lCockpit);
    G.lTail = (sp.kTail == null ? 3.5 : sp.kTail) * d; G.xTail = G.lF - G.lTail;
    G.cabin0 = sp.lCockpit == null ? 4 : sp.lCockpit; G.cabin1 = G.cabin0 + sp.lCabin;
    var dI = sp.dI || d - X.wall(d) / 1.045, fr = Math.max(0.12, Math.min(0.42, 0.42 - 0.30 * (dI - 1.6) / 1.4));
    G.dI = dI; G.floor = -fr * dI; G.ceil = 0.42 * dI;
    G.tipZ = -(sp.round == null ? 0.1 : sp.round) * r;           // the nose tip, a little below the axis
    X._fusFns(G);
    function surf(w) {
      var pf = X.planform(w.S, w.A, w.lam), le = sweepLE(w.A, w.lam, w.sweep || 0), tn = Math.tan(le * D2R);
      return { pf: pf, sweepLE: le, t: tn, xLE: w.xAc - (pf.ymac * tn + 0.25 * pf.mac), xAc: w.xAc, tc: w.tc || 0.12, w: w };
    }
    if (sp.wing) {
      G.wing = surf(sp.wing);
      var pos = sp.wing.pos || 'low';
      G.wing.z = pos === 'high' ? r - 0.6 * sp.wing.tc * G.wing.pf.cr : pos === 'mid' ? 0 : -r + 0.6 * sp.wing.tc * G.wing.pf.cr;
      G.wing.dih = (sp.wing.dihedral || 0) * D2R;
    }
    if (sp.vt) {
      var v = sp.vt, h = Math.sqrt(v.A * v.S), cr = 2 * v.S / (h * (1 + v.lam)), le = sweepLE(2 * v.A, v.lam, v.sweep || 0), tn = Math.tan(le * D2R);
      var mac = 2 / 3 * cr * (1 + v.lam + v.lam * v.lam) / (1 + v.lam), zm = h / 3 * (1 + 2 * v.lam) / (1 + v.lam);
      G.vt = { h: h, cr: cr, ct: v.lam * cr, t: tn, mac: mac, zmac: zm, xAc: v.xAc, xLE: v.xAc - (zm * tn + 0.25 * mac), tc: v.tc || 0.1, sweepLE: le };
      G.vt.z0 = G.zTop(G.vt.xLE + 0.5 * cr) - 0.03 * d;
    }
    if (sp.ht) {
      G.ht = surf(sp.ht); G.ht.tee = !!sp.ht.tee;
      if (G.ht.tee && G.vt) {                                    // root leading edge on the fin tip's: the arm follows
        var xr = G.vt.xLE + G.vt.h * G.vt.t + 0.5 * (G.vt.ct - G.ht.pf.cr);
        G.ht.xAc = xr + G.ht.pf.ymac * G.ht.t + 0.25 * G.ht.pf.mac; G.ht.xLE = xr; G.ht.z = G.vt.z0 + G.vt.h;
      } else {
        var xm = G.ht.xLE + 0.5 * G.ht.pf.cr; G.ht.z = 0.5 * (G.zTop(xm) + G.zBot(xm));
      }
    }
    var e = G.eng = sp.eng || { kind: 'none' };
    if (e.kind === 'rear') {
      e.x = (e.xFrac || 0.75) * G.lF; e.y = G.halfWidth(e.x) + 0.18 * d + e.D / 2; e.z = 0.3 * r + 0.15 * e.D;
    } else if (e.kind === 'wing' && G.wing) {
      var pf = G.wing.pf; e.y = (e.yFrac || 0.34) * pf.b / 2;
      var xle = G.wing.xLE + e.y * G.wing.t, cy = X.chordAt(pf, e.y), zw = G.wing.z + e.y * Math.tan(G.wing.dih);
      if (e.prop) { e.x = xle - 0.25 * e.l + e.l / 2; e.z = sp.wing.pos === 'high' ? zw - 0.1 * e.D : zw - 0.35 * e.D; e.xProp = xle - 0.3 * e.l; }
      else { e.x = xle - 0.55 * e.l + e.l / 2; e.z = zw - 0.06 * cy - 0.62 * e.D; }
    } else if (e.kind === 'nose') { e.xProp = -0.08; e.z = 0; }
    return G;
  };
  // fuselage contours: half width in the top view; top and bottom lines in the side view
  X._fusFns = function (G) {
    var r = G.r;
    G.halfWidth = function (x) {
      if (x <= 0 || x >= G.lF) return x <= 0 ? 0 : 0.06 * r;
      if (x < G.lNose) { var u = 1 - x / G.lNose; return r * Math.sqrt(1 - u * u); }
      if (x <= G.xTail) return r;
      return r * (1 - 0.94 * (x - G.xTail) / G.lTail);
    };
    G.zTop = function (x) {
      if (x <= 0) return G.tipZ;
      if (x < G.lNose) { var u = 1 - x / G.lNose; return G.tipZ + (r - G.tipZ) * Math.sqrt(1 - u * u); }
      if (x <= G.xTail) return r;
      return r - 0.06 * r * (x - G.xTail) / G.lTail;
    };
    G.zBot = function (x) {
      if (x <= 0) return G.tipZ;
      if (x < G.lNose) { var u = 1 - x / G.lNose; return G.tipZ - (r + G.tipZ) * Math.pow(1 - u * u, 0.6); }
      if (x <= G.xTail) return -r;
      return -r + (x - G.xTail) / G.lTail * (2 * r - 0.12 * r);        // the bottom of the tail cone rises at about arctan(1/kTail)
    };
  };
  X.sideOutline = function (G) {
    var P = [], n = 40, i, x;
    for (i = 0; i <= n; i++) { x = G.lNose * (1 - Math.cos(Math.PI / 2 * i / n)); P.push([x, G.zTop(x)]); }
    P.push([G.xTail, G.r]); P.push([G.lF, G.zTop(G.lF)]); P.push([G.lF, G.zBot(G.lF)]); P.push([G.xTail, -G.r]);
    for (i = n; i >= 0; i--) { x = G.lNose * (1 - Math.cos(Math.PI / 2 * i / n)); P.push([x, G.zBot(x)]); }
    return P;
  };
  X.topOutline = function (G) {
    var P = [], Q = [], n = 40, i, x;
    for (i = 0; i <= n; i++) { x = G.lNose * (1 - Math.cos(Math.PI / 2 * i / n)); P.push([x, G.halfWidth(x)]); }
    P.push([G.xTail, G.r]); P.push([G.lF, G.halfWidth(G.lF)]);
    P.forEach(function (p) { Q.push([p[0], -p[1]]); });
    return P.concat(Q.reverse());
  };
  function section(x0, z0, c, tc) {                    // a symmetric NACA four-digit section of chord c
    var P = [], Q = [], n = 24, i;
    for (i = 0; i <= n; i++) {
      var u = (1 - Math.cos(Math.PI * i / n)) / 2, yt = 5 * tc * (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u * u * u - 0.1036 * u * u * u * u);
      P.push([x0 + u * c, z0 + yt * c]); Q.push([x0 + u * c, z0 - yt * c]);
    }
    return P.concat(Q.reverse());
  }
  function ellipse(cx, cy, a, b) { var P = []; for (var i = 0; i < 36; i++) { var th = 2 * Math.PI * i / 36; P.push([cx + a * Math.cos(th), cy + b * Math.sin(th)]); } return P; }
  function nacelleSide(cx, cz, l, D) {               // a nacelle: rounded inlet lip, straight barrel, tapered exhaust
    var x0 = cx - l / 2, x1 = cx + l / 2;
    return [[x0, cz + 0.36 * D], [x0 + 0.07 * l, cz + D / 2], [x1 - 0.28 * l, cz + D / 2], [x1, cz + 0.3 * D], [x1, cz - 0.3 * D], [x1 - 0.28 * l, cz - D / 2], [x0 + 0.07 * l, cz - D / 2], [x0, cz - 0.36 * D]];
  }
  var COL = { fus: 'surface', wing: 'accent', ht: 'z', vt: 't', eng: 'muted', mac: 'r' };
  X.COLORS = COL;
  function halfTrap(xLE, tn, cr, ct, half, sg) { return [[xLE, 0], [xLE + half * tn, sg * half], [xLE + half * tn + ct, sg * half], [xLE + cr, 0]]; }
  // views: 'side' (x, z), 'top' (x, y; half: only y >= 0, drawn at -y when flip), 'front' (y, z, seen from ahead)
  X.drawSide = function (g, G, o) {
    o = o || {}; var at = o.at || [0, 0];
    function T(p) { return [p[0] + at[0], p[1] + at[1]]; }
    var e = G.eng, i;
    if (G.vt) { var v = G.vt; g.polyline([[v.xLE, v.z0], [v.xLE + v.h * v.t, v.z0 + v.h], [v.xLE + v.h * v.t + v.ct, v.z0 + v.h], [v.xLE + v.cr, v.z0]].map(T), { color: COL.vt, width: 1.8, closed: true, fill: COL.vt, fillOpacity: 0.2 }); }
    g.polyline(X.sideOutline(G).map(T), { color: COL.fus, width: 1.8, closed: true, fill: COL.fus, fillOpacity: 0.16 });
    if (o.cabin !== false) g.polyline([[G.cabin0, G.floor], [G.cabin1, G.floor], [G.cabin1, G.ceil], [G.cabin0, G.ceil]].map(T), { color: 'muted', width: 1.2, closed: true, dashed: true });
    if (o.windscreen !== false && G.sp.lCockpit >= 2.5) {
      var xw0 = 0.55 * G.lNose, xw1 = 0.86 * G.lNose;
      g.polyline([[xw0, G.zTop(xw0) - 0.05 * G.d], [xw1, G.zTop(xw1) - 0.04 * G.d], [xw1 + 0.02 * G.d, G.zTop(xw1) - 0.2 * G.d], [xw0 + 0.06 * G.d, G.zTop(xw0) - 0.17 * G.d]].map(T), { color: 'muted', width: 1.2, closed: true, fill: 'muted', fillOpacity: 0.3 });
    }
    if (G.wing) g.polyline(section(G.wing.xLE, G.wing.z, G.wing.pf.cr, G.wing.tc).map(T), { color: COL.wing, width: 1.6, closed: true, fill: COL.wing, fillOpacity: 0.35 });
    if (G.ht) g.polyline(section(G.ht.xLE, G.ht.z, G.ht.pf.cr, G.ht.tc).map(T), { color: COL.ht, width: 1.6, closed: true, fill: COL.ht, fillOpacity: 0.35 });
    if (e.kind === 'rear' || e.kind === 'wing') {
      if (e.kind === 'rear') g.polyline([[e.x - 0.15 * e.l, e.z], [e.x + 0.25 * e.l, e.z], [e.x + 0.2 * e.l, 0.1 * G.r], [e.x - 0.1 * e.l, 0.1 * G.r]].map(T), { color: COL.eng, width: 1.2, closed: true, fill: 'surface', fillOpacity: 0.3 });
      g.polyline(nacelleSide(e.x, e.z, e.l, e.D).map(T), { color: COL.eng, width: 1.6, closed: true, fill: 'surface', fillOpacity: 0.45 });
    }
    if (e.prop) { var xp = e.kind === 'nose' ? e.xProp : e.xProp, zp = e.kind === 'nose' ? G.tipZ : e.z; g.line(T([xp, zp - e.prop / 2]), T([xp, zp + e.prop / 2]), { color: 'ink', width: 2.4 }); }
  };
  X.drawTop = function (g, G, o) {
    o = o || {}; var at = o.at || [0, 0], fl = o.flip ? -1 : 1, half = !!o.half;
    function T(p) { return [p[0] + at[0], fl * p[1] + at[1]]; }
    var sides = half ? [1] : [1, -1], e = G.eng;
    if (G.wing) sides.forEach(function (sg) { var w = G.wing; g.polyline(halfTrap(w.xLE, w.t, w.pf.cr, w.pf.ct, w.pf.b / 2, sg).map(T), { color: COL.wing, width: 1.8, closed: true, fill: COL.wing, fillOpacity: 0.16 }); });
    if (G.ht && !G.ht.tee) sides.forEach(function (sg) { var h = G.ht; g.polyline(halfTrap(h.xLE, h.t, h.pf.cr, h.pf.ct, h.pf.b / 2, sg).map(T), { color: COL.ht, width: 1.8, closed: true, fill: COL.ht, fillOpacity: 0.2 }); });
    var out = X.topOutline(G);
    if (half) out = out.filter(function (p) { return p[1] >= 0; }).concat([[G.lF, 0], [0, 0]]);
    g.polyline(out.map(T), { color: COL.fus, width: 1.8, closed: true, fill: COL.fus, fillOpacity: 0.16 });
    if (G.vt) { var v = G.vt, th = 0.5 * v.tc * v.cr; g.polyline([[v.xLE, 0], [v.xLE + 0.3 * v.cr, th], [v.xLE + v.cr, 0], [v.xLE + 0.3 * v.cr, -th]].map(T), { color: COL.vt, width: 1.4, closed: true, fill: COL.vt, fillOpacity: 0.3 }); }
    if (G.ht && G.ht.tee) sides.forEach(function (sg) { var h = G.ht; g.polyline(halfTrap(h.xLE, h.t, h.pf.cr, h.pf.ct, h.pf.b / 2, sg).map(T), { color: COL.ht, width: 1.8, closed: true, fill: COL.ht, fillOpacity: 0.2 }); });
    if (e.kind === 'rear' || e.kind === 'wing') sides.forEach(function (sg) {
      if (e.kind === 'rear') g.polyline([[e.x - 0.1 * e.l, sg * G.halfWidth(e.x) * 0.9], [e.x + 0.2 * e.l, sg * G.halfWidth(e.x + 0.2 * e.l) * 0.9], [e.x + 0.2 * e.l, sg * (e.y - 0.3 * e.D)], [e.x - 0.1 * e.l, sg * (e.y - 0.3 * e.D)]].map(T), { color: COL.eng, width: 1.2, closed: true, fill: 'surface', fillOpacity: 0.3 });
      g.polyline(nacelleSide(e.x, sg * e.y, e.l, e.D).map(T), { color: COL.eng, width: 1.6, closed: true, fill: 'surface', fillOpacity: 0.45 });
      if (e.prop) g.line(T([e.xProp, sg * e.y - e.prop / 2]), T([e.xProp, sg * e.y + e.prop / 2]), { color: 'ink', width: 2.4 });
    });
    if (e.kind === 'nose' && e.prop) g.line(T([e.xProp, half ? 0 : -e.prop / 2]), T([e.xProp, e.prop / 2]), { color: 'ink', width: 2.4 });
  };
  X.drawFront = function (g, G, o) {
    o = o || {}; var at = o.at || [0, 0], e = G.eng;
    function T(p) { return [p[0] + at[0], p[1] + at[1]]; }
    function slab(y0, z0, y1, z1, t0, t1) { return [[y0, z0 + t0 / 2], [y1, z1 + t1 / 2], [y1, z1 - t1 / 2], [y0, z0 - t0 / 2]]; }
    if (G.vt) g.polyline([[-0.5 * G.vt.tc * G.vt.cr, G.vt.z0], [-0.5 * G.vt.tc * G.vt.ct, G.vt.z0 + G.vt.h], [0.5 * G.vt.tc * G.vt.ct, G.vt.z0 + G.vt.h], [0.5 * G.vt.tc * G.vt.cr, G.vt.z0]].map(T), { color: COL.vt, width: 1.6, closed: true, fill: COL.vt, fillOpacity: 0.3 });
    if (G.ht) [1, -1].forEach(function (sg) { var h = G.ht, s = h.pf.b / 2; g.polyline(slab(0, h.z, sg * s, h.z + s * Math.tan((G.ht.tee ? 0 : 4) * D2R), h.tc * h.pf.cr, h.tc * h.pf.ct).map(T), { color: COL.ht, width: 1.6, closed: true, fill: COL.ht, fillOpacity: 0.3 }); });
    if (G.wing) [1, -1].forEach(function (sg) { var w = G.wing, s = w.pf.b / 2; g.polyline(slab(0, w.z, sg * s, w.z + s * Math.tan(w.dih), w.tc * w.pf.cr, w.tc * w.pf.ct).map(T), { color: COL.wing, width: 1.6, closed: true, fill: COL.wing, fillOpacity: 0.3 }); });
    g.polyline(ellipse(0, 0, G.r, G.r).map(T), { color: COL.fus, width: 1.8, closed: true, fill: COL.fus, fillOpacity: 0.22 });
    if (e.kind === 'rear' || e.kind === 'wing') [1, -1].forEach(function (sg) {
      g.polyline(ellipse(sg * e.y, e.z, e.D / 2, e.D / 2).map(T), { color: COL.eng, width: 1.6, closed: true, fill: 'surface', fillOpacity: 0.45 });
      g.polyline(ellipse(sg * e.y, e.z, 0.32 * e.D, 0.32 * e.D).map(T), { color: COL.eng, width: 1, closed: true });
      if (e.prop) g.polyline(ellipse(sg * e.y, e.z, e.prop / 2, e.prop / 2).map(T), { color: 'ink', width: 1.2, closed: true, dashed: true });
    });
    if (e.kind === 'nose' && e.prop) g.polyline(ellipse(0, G.tipZ, e.prop / 2, e.prop / 2).map(T), { color: 'ink', width: 1.2, closed: true, dashed: true });
  };
  // extents of each view in its own coordinates
  X.extents = function (G) {
    var zt = G.r, zb = -G.r, xb = 0, xe = G.lF, yb = G.r, e = G.eng;
    if (G.vt) { zt = Math.max(zt, G.vt.z0 + G.vt.h + (G.ht && G.ht.tee ? 0.6 * G.ht.tc * G.ht.pf.cr : 0)); xe = Math.max(xe, G.vt.xLE + G.vt.cr, G.vt.xLE + G.vt.h * G.vt.t + G.vt.ct); }
    if (G.ht) { xe = Math.max(xe, G.ht.xLE + G.ht.pf.b / 2 * G.ht.t + G.ht.pf.ct, G.ht.xLE + G.ht.pf.cr); yb = Math.max(yb, G.ht.pf.b / 2); }
    if (G.wing) { yb = Math.max(yb, G.wing.pf.b / 2); var zt2 = G.wing.z + G.wing.pf.b / 2 * Math.tan(G.wing.dih) + 0.6 * G.wing.tc * G.wing.pf.ct; zt = Math.max(zt, zt2); zb = Math.min(zb, G.wing.z - 0.6 * G.wing.tc * G.wing.pf.cr); }
    if (e.kind === 'rear' || e.kind === 'wing') { zb = Math.min(zb, e.z - e.D / 2); zt = Math.max(zt, e.z + e.D / 2); xb = Math.min(xb, e.x - e.l / 2); yb = Math.max(yb, e.y + e.D / 2); }
    if (e.prop) { var zc = e.kind === 'nose' ? G.tipZ : e.z; zb = Math.min(zb, zc - e.prop / 2); zt = Math.max(zt, zc + e.prop / 2); xb = Math.min(xb, e.xProp - 0.1); if (e.kind === 'wing') yb = Math.max(yb, e.y + e.prop / 2); }
    return { x: [xb, xe], z: [zb, zt], y: yb };
  };
  // a three-view on one plane: the side view on top, the half top view under it, the front view to the right of the side view
  X.threeView = function (plane, g, G, o) {
    o = o || {}; var E = X.extents(G), gap = o.gap || 0.06 * (E.x[1] - E.x[0]);
    var side = [0, 0], top = [0, E.z[0] - gap], front = [E.x[1] + gap + E.y, 0];
    if (o.views && o.views.indexOf('front') < 0) front = null;
    X.drawSide(g, G, { at: side, cabin: o.cabin });
    X.drawTop(g, G, { at: top, half: true, flip: true });
    if (front) X.drawFront(g, G, { at: front });
    var xr = [E.x[0] - 0.02 * G.lF, front ? front[0] + E.y : E.x[1] + 0.02 * G.lF], yr = [top[1] - E.y - 0.02 * G.lF, E.z[1] + 0.02 * G.lF];
    return { side: side, top: top, front: front, E: E, xRange: xr, yRange: yr,
      S: function (x, z) { return [x + side[0], z + side[1]]; }, T: function (x, y) { return [x + top[0], -y + top[1]]; }, F: function (y, z) { return [y + front[0], z + front[1]]; } };
  };

  /* ---------- The cabin cross-section and plan ---------- */
  // seats across the cabin from left to right: [{y0, y1, k}], aisles [{y0, y1}], at the armrest line
  X.crossSection = function (c) {
    var dI = X.cabinWidth(c), tab = X.SEATS[c.cls || 'economy'], gap = (c.gapIn == null ? 1 : c.gapIn) * IN, y = -dI / 2 + gap, S = [], Aisles = [];
    var nb = c.benches.length, na = c.aisles || 0;
    // aisles go between benches, as evenly as the count allows
    var aisleAfter = {}; if (na) { for (var j = 1; j <= na; j++) aisleAfter[Math.round(j * nb / (na + 1)) - 1] = true; }
    c.benches.forEach(function (k, i) {
      var w = (c.seatIn ? k * c.seatIn : tab[k - 1]) * IN; S.push({ y0: y, y1: y + w, k: k }); y += w;
      if (aisleAfter[i]) { Aisles.push({ y0: y, y1: y + c.aisleIn * IN }); y += c.aisleIn * IN; }
    });
    var fr = c.floorFrac != null ? c.floorFrac : X.floorFrac(dI), floor = -fr * dI;
    return { dI: dI, dO: X.outer(dI), wall: X.wall(dI), seats: S, aisles: Aisles, floor: floor, aisleHeight: dI / 2 - floor, nSA: c.benches.reduce(function (a, k) { return a + k; }, 0) };
  };
  X.floorFrac = function (dI) { return Math.max(0.12, Math.min(0.42, 0.42 - 0.30 * (dI - 1.6) / 1.4)); };   // floor depth below the axis, as a share of d_I
  // the cabin against CS/FAR 25.815 (aisle width at and above 25 in from the floor) and 25.817 (aisles for the seats abreast)
  X.checkCabin = function (c) {
    var n = X.seatsOf(c), nSA = c.benches.reduce(function (a, k) { return a + k; }, 0), need = X.aislesFor(nSA), am = X.aisleMin(n);
    var side = c.aisles === 1 && c.benches.length === 2 ? Math.max(c.benches[0], c.benches[1]) : 0;
    return { n: n, nSA: nSA, aislesNeeded: need, aislesOK: (c.aisles || 0) >= need && side <= 3, aisleMin: am, aisleOK: !need || c.aisleIn >= am.low };   // at the armrests, below 25 in; above them the seat backs' taper must open the aisle to am.high
  };
  X.drawSection = function (g, C, o) {
    o = o || {};
    var rI = C.dI / 2, rO = C.dO / 2, zf = C.floor, armZ = zf + 0.62, backZ = zf + 1.0;
    g.polyline(ellipse(0, 0, rO, rO), { color: COL.fus, width: 2, closed: true, fill: COL.fus, fillOpacity: 0.22 });
    g.polyline(ellipse(0, 0, rI, rI), { color: COL.fus, width: 1.2, closed: true, fill: 'bg', fillOpacity: 1 });
    var yf = Math.sqrt(Math.max(0, rI * rI - zf * zf));
    g.line([-yf, zf], [yf, zf], { color: 'ink', width: 2 });
    function wallY(z) { return Math.sqrt(Math.max(0, rI * rI - z * z)); }
    C.seats.forEach(function (s) {
      var wSeat = (s.y1 - s.y0) / s.k, i;
      for (i = 0; i < s.k; i++) {
        var a = s.y0 + i * wSeat, b = a + wSeat, m = 0.035;
        var yin = Math.min(Math.abs(a + m), Math.abs(b - m)), zt = Math.min(backZ, wallY(yin + 0.08) - 0.05), w = wallY(zt) - 0.03;
        var ba = Math.max(a + m + 0.02, -w), bb = Math.min(b - m - 0.02, w);
        g.polyline([[a + m + 0.02, zf + 0.5], [b - m - 0.02, zf + 0.5], [bb, zt - 0.05], [bb - 0.05, zt], [ba + 0.05, zt], [ba, zt - 0.05]], { color: 'accent', width: 1.4, closed: true, fill: 'accent', fillOpacity: 0.16 });
        g.polyline([[a + m, zf + 0.38], [b - m, zf + 0.38], [b - m, zf + 0.5], [a + m, zf + 0.5]], { color: 'accent', width: 1.4, closed: true, fill: 'accent', fillOpacity: 0.35 });
        [a + m + 0.05, b - m - 0.05].forEach(function (yl) { var zb = Math.max(zf, -wallY(yl) + 0.01); if (zb < zf + 0.36) g.line([yl, zb], [yl, zf + 0.38], { color: 'accent', width: 1.2 }); });
      }
      for (i = 0; i <= s.k; i++) { var ya = s.y0 + i * wSeat, ia = i === 0 ? 1 : i === s.k ? -1 : 0, yc = ya + ia * 0.017;
        g.polyline([[yc - 0.017, zf + 0.42], [yc + 0.017, zf + 0.42], [yc + 0.017, armZ], [yc - 0.017, armZ]], { color: 'accent', width: 1, closed: true, fill: 'accent', fillOpacity: 0.6 }); }
    });
    C.aisles.forEach(function (a) { g.polyline([[a.y0, zf], [a.y1, zf], [a.y1, zf + 0.02], [a.y0, zf + 0.02]], { color: 'good', width: 1, closed: true, fill: 'good', fillOpacity: 0.5 }); });
  };
  // the cabin from above: rows of seats from the front, then the lavatories, galleys and the allowance at the front door
  X.cabinPlan = function (c) {
    var C = X.crossSection(c), L = X.cabinLength(c), p = c.pitchIn * IN, items = [], x = 0;
    var sh = c.rows > 12 ? 0.6 : 1, front = (c.extra || 0) * sh, rear = (c.extra || 0) * (1 - sh);   // a small cabin has its door at the front only
    items.push({ kind: 'door', x0: 0, x1: front });
    x = front;
    for (var g = 0; g < (c.galley || 0); g++) { if (g === 0) { items.push({ kind: 'galley', x0: x, x1: x + 30 * IN }); x += 30 * IN; } }
    var nLavF = c.lav > 1 ? 1 : 0;
    for (var l = 0; l < nLavF; l++) { items.push({ kind: 'lav', x0: x, x1: x + 40 * IN }); x += 40 * IN; }
    var rows = [];
    for (var i = 0; i < c.rows; i++) { rows.push(x); x += p; }
    for (var l2 = nLavF; l2 < (c.lav || 0); l2++) { items.push({ kind: 'lav', x0: x, x1: x + 40 * IN }); x += 40 * IN; }
    for (var g2 = 1; g2 < (c.galley || 0); g2++) { items.push({ kind: 'galley', x0: x, x1: x + 30 * IN }); x += 30 * IN; }
    items.push({ kind: 'door', x0: x, x1: x + rear }); x += rear;
    return { C: C, L: L, pitch: p, rows: rows, items: items };
  };
  X.drawCabinPlan = function (g, P, o) {
    o = o || {}; var at = o.at || [0, 0], C = P.C, rI = C.dI / 2;
    function T(p) { return [p[0] + at[0], p[1] + at[1]]; }
    g.polyline([[0, -rI], [P.L, -rI], [P.L, rI], [0, rI]].map(T), { color: COL.fus, width: 1.8, closed: true, fill: COL.fus, fillOpacity: 0.1 });
    P.rows.forEach(function (x) {
      C.seats.forEach(function (s) {
        var w = (s.y1 - s.y0) / s.k, len = Math.min(0.62 * P.pitch, 0.55);
        for (var i = 0; i < s.k; i++) {
          var a = s.y0 + i * w + 0.03, b = s.y0 + (i + 1) * w - 0.03, x0 = x + 0.06;
          g.polyline([[x0, a], [x0 + len, a], [x0 + len, b], [x0, b]].map(T), { color: 'accent', width: 1.2, closed: true, fill: 'accent', fillOpacity: 0.2 });
          g.line(T([x0 + len - 0.1, a]), T([x0 + len - 0.1, b]), { color: 'accent', width: 2.2 });
        }
      });
    });
    var col = { lav: 't', galley: 'warn', door: 'good' };
    P.items.forEach(function (it) { if (it.x1 - it.x0 < 1e-6) return; var y0 = it.kind === 'door' ? -rI : (C.aisles.length ? -rI : -rI), y1 = it.kind === 'door' ? rI : (C.aisles.length ? C.aisles[0].y0 : rI);
      if (it.kind === 'door') { g.polyline([[it.x0, -rI], [it.x1, -rI], [it.x1, rI], [it.x0, rI]].map(T), { color: col.door, width: 1, closed: true, fill: col.door, fillOpacity: 0.12, dashed: true }); return; }
      g.polyline([[it.x0 + 0.03, y0 + 0.03], [it.x1 - 0.03, y0 + 0.03], [it.x1 - 0.03, y1 - 0.03], [it.x0 + 0.03, y1 - 0.03]].map(T), { color: col[it.kind], width: 1.4, closed: true, fill: col[it.kind], fillOpacity: 0.22 }); });
    C.aisles.forEach(function (a) { g.polyline([[0, a.y0], [P.L, a.y0], [P.L, a.y1], [0, a.y1]].map(T), { color: 'good', width: 0.8, closed: true, fill: 'good', fillOpacity: 0.08 }); });
  };

  global.LAYOUT = X;
})(typeof window !== 'undefined' ? window : this);
