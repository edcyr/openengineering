/*!
 * mission.js — MISSION: requirements and mission-profile helpers for Module 2 of Conceptual Aircraft Design
 * (Design Requirements and Mission Profiles). Plain ES5, no dependencies; the figures draw with AERO.chart (aero.js).
 *
 *   MISSION.AIRPORTS        airports with latitude and longitude (degrees, north and east positive)
 *   MISSION.airport(id)     one airport by IATA code
 *   MISSION.gc(a, b)        great-circle central angle (degrees) and distance (km) between two {lat, lon}
 *   MISSION.gcPath(a, b, n) points [lon, lat] along the great circle, split where it crosses the date line
 *   MISSION.payloadRange(p) the corner points and helpers of a payload–range diagram (Breguet, fixed reserve)
 *   MISSION.GRADIENTS       FAR/CS 25.121 one-engine-inoperative climb gradients
 *   MISSION.ICAO_CODES      ICAO aerodrome reference code letters by wingspan
 *   MISSION.APPROACH_CATS   ICAO aircraft approach categories by threshold speed
 *   MISSION.PROFILES        schematic mission profiles (after Raymer) for the figures
 *   MISSION.HIST            Raymer's historical mission-segment weight fractions (Table 3.2)
 */
(function (global) {
  'use strict';
  var MISSION = {};
  var D2R = Math.PI / 180;
  MISSION.R_EARTH = 6371;                 // mean radius of the Earth, km
  MISSION.NMI = 1.852;                    // km per nautical mile
  MISSION.KT = 1.852;                     // km/h per knot

  /* ---------------------------------------------------------------- Airports
     Airport reference points rounded to 0.01 degree (enough for distances to about 1 km). */
  function ap(id, city, country, lat, lon) { return { id: id, city: city, country: country, lat: lat, lon: lon, name: city + ' (' + id + ')' }; }
  MISSION.AIRPORTS = [
    ap('YOW', 'Ottawa', 'Canada', 45.32, -75.67),
    ap('YUL', 'Montréal', 'Canada', 45.47, -73.74),
    ap('YYZ', 'Toronto', 'Canada', 43.68, -79.63),
    ap('YHZ', 'Halifax', 'Canada', 44.88, -63.51),
    ap('YYT', 'St. John’s', 'Canada', 47.62, -52.75),
    ap('YWG', 'Winnipeg', 'Canada', 49.91, -97.24),
    ap('YYC', 'Calgary', 'Canada', 51.13, -114.01),
    ap('YVR', 'Vancouver', 'Canada', 49.19, -123.18),
    ap('JFK', 'New York', 'USA', 40.64, -73.78),
    ap('ORD', 'Chicago', 'USA', 41.98, -87.90),
    ap('MIA', 'Miami', 'USA', 25.79, -80.29),
    ap('LAX', 'Los Angeles', 'USA', 33.94, -118.41),
    ap('HNL', 'Honolulu', 'USA', 21.32, -157.92),
    ap('MEX', 'Mexico City', 'Mexico', 19.44, -99.07),
    ap('GRU', 'São Paulo', 'Brazil', -23.43, -46.47),
    ap('KEF', 'Reykjavík', 'Iceland', 63.99, -22.62),
    ap('LHR', 'London', 'UK', 51.47, -0.45),
    ap('CDG', 'Paris', 'France', 49.01, 2.55),
    ap('FRA', 'Frankfurt', 'Germany', 50.03, 8.56),
    ap('DXB', 'Dubai', 'UAE', 25.25, 55.36),
    ap('JNB', 'Johannesburg', 'South Africa', -26.14, 28.25),
    ap('DEL', 'Delhi', 'India', 28.56, 77.10),
    ap('SIN', 'Singapore', 'Singapore', 1.36, 103.99),
    ap('HKG', 'Hong Kong', 'China', 22.31, 113.91),
    ap('NRT', 'Tokyo', 'Japan', 35.77, 140.39),
    ap('SYD', 'Sydney', 'Australia', -33.95, 151.18)
  ];
  var BYID = {};
  MISSION.AIRPORTS.forEach(function (a) { BYID[a.id] = a; });
  MISSION.airport = function (id) { return BYID[id] || null; };

  /* ---------------------------------------------------------------- Great circles
     Spherical law of cosines: cos(theta) = sin(phi1) sin(phi2) + cos(phi1) cos(phi2) cos(dlambda), d = R theta. */
  MISSION.gc = function (a, b) {
    var p1 = a.lat * D2R, p2 = b.lat * D2R, dl = (b.lon - a.lon) * D2R;
    var c = Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl);
    var th = Math.acos(Math.max(-1, Math.min(1, c)));
    return { cos: c, theta: th / D2R, rad: th, km: MISSION.R_EARTH * th, nmi: MISSION.R_EARTH * th / MISSION.NMI };
  };
  function vec(p) { var f = p.lat * D2R, l = p.lon * D2R; return [Math.cos(f) * Math.cos(l), Math.cos(f) * Math.sin(l), Math.sin(f)]; }
  MISSION.gcPath = function (a, b, n) {
    n = n || 64;
    var A = vec(a), B = vec(b), th = MISSION.gc(a, b).rad, out = [[]], prev = null;
    for (var i = 0; i <= n; i++) {
      var t = i / n, s = Math.sin(th) || 1, ka = Math.sin((1 - t) * th) / s, kb = Math.sin(t * th) / s;
      if (th < 1e-9) { ka = 1 - t; kb = t; }
      var x = ka * A[0] + kb * B[0], y = ka * A[1] + kb * B[1], z = ka * A[2] + kb * B[2];
      var lat = Math.atan2(z, Math.sqrt(x * x + y * y)) / D2R, lon = Math.atan2(y, x) / D2R;
      if (prev !== null && Math.abs(lon - prev) > 180) out.push([]);   // crossed the date line: start a new piece
      out[out.length - 1].push([lon, lat]);
      prev = lon;
    }
    return out;
  };

  /* ---------------------------------------------------------------- Payload–range
     p: { OEW, MTOW, PLmax, Fmax, Fres (kg), V (km/h), C (1/h), LD }. Every kilogram of fuel above the reserve Fres is
     burned in a Breguet cruise: R = (V/C)(L/D) ln(W_takeoff / W_end), W_end = OEW + payload + Fres. OEW includes the crew. */
  MISSION.payloadRange = function (p) {
    var k = p.V / p.C * p.LD;
    function rangeAt(PL) {
      var tow = Math.min(p.MTOW, p.OEW + PL + p.Fmax), end = p.OEW + PL + p.Fres;
      return tow > end ? k * Math.log(tow / end) : 0;
    }
    var plB = Math.max(0, Math.min(p.PLmax, p.MTOW - p.OEW - p.Fmax));
    var A = [rangeAt(p.PLmax), p.PLmax], B = [rangeAt(plB), plB], C = [rangeAt(0), 0];
    function payloadAt(R) {               // the largest payload that can fly R; null beyond the ferry range
      if (R <= A[0]) return p.PLmax;
      if (R <= B[0]) return p.MTOW * Math.exp(-R / k) - p.OEW - p.Fres;
      if (R <= C[0]) { var e = Math.exp(R / k); return (p.Fmax - p.Fres * e) / (e - 1) - p.OEW; }
      return null;
    }
    return { k: k, A: A, B: B, C: C, rangeAt: rangeAt, payloadAt: payloadAt,
      outline: [[0, p.PLmax], A, B, C], fuelAtA: Math.min(p.Fmax, p.MTOW - p.OEW - p.PLmax) };
  };
  /** An illustrative 150-seat narrow-body twin, similar in size to the 737 and A320 families (not data for either). */
  MISSION.NARROWBODY = { OEW: 42000, MTOW: 78000, PLmax: 19000, Fmax: 20000, Fres: 2600, V: 830, C: 0.58, LD: 16.5, seats: 150, mPax: 100 };

  /* ---------------------------------------------------------------- Certification tables */
  // 14 CFR / CS 25.121: minimum climb gradients with the critical engine inoperative (landing climb: all engines)
  MISSION.GRADIENTS = [
    { id: 'first', label: 'First segment', config: 'Takeoff flaps, gear down, between liftoff and gear retraction', g: { 2: 0, 3: 0.003, 4: 0.005 } },
    { id: 'second', label: 'Second segment', config: 'Takeoff flaps, gear up, at V2', g: { 2: 0.024, 3: 0.027, 4: 0.030 } },
    { id: 'final', label: 'Final takeoff (en route)', config: 'En-route configuration, at the final takeoff speed', g: { 2: 0.012, 3: 0.015, 4: 0.017 } },
    { id: 'approach', label: 'Approach climb', config: 'Approach flaps, gear up (a go-around with one engine out)', g: { 2: 0.021, 3: 0.024, 4: 0.027 } },
    { id: 'landing', label: 'Landing climb', config: 'Landing flaps, gear down, all engines (a balked landing)', g: { 2: 0.032, 3: 0.032, 4: 0.032 }, allEngines: true }
  ];
  MISSION.ICAO_CODES = [
    { code: 'A', max: 15, example: 'light aircraft such as the Cessna 172' },
    { code: 'B', max: 24, example: 'small regional jets such as the CRJ200' },
    { code: 'C', max: 36, example: 'Boeing 737 and Airbus A320 families, ATR 72, Dash 8-400' },
    { code: 'D', max: 52, example: 'Boeing 767, the original 757' },
    { code: 'E', max: 65, example: 'Boeing 777, 787, Airbus A350' },
    { code: 'F', max: 80, example: 'Airbus A380, Boeing 747-8' }
  ];
  MISSION.icaoCode = function (span) { for (var i = 0; i < MISSION.ICAO_CODES.length; i++) if (span < MISSION.ICAO_CODES[i].max) return MISSION.ICAO_CODES[i].code; return null; };
  MISSION.APPROACH_CATS = [
    { cat: 'A', lo: 0, hi: 91 }, { cat: 'B', lo: 91, hi: 121 }, { cat: 'C', lo: 121, hi: 141 }, { cat: 'D', lo: 141, hi: 166 }, { cat: 'E', lo: 166, hi: 211 }
  ];

  /* ---------------------------------------------------------------- Mission profiles (schematic)
     Each profile is a list of segments; a segment has a type, a label, and a run of [x, h] points (x in arbitrary
     distance units for the drawing, h a schematic altitude 0–10). 'fixed' is Raymer's historical fraction where one
     applies (HIST); the text explains the segment. */
  MISSION.HIST = { takeoff: 0.970, climb: 0.985, landing: 0.995 };
  function seg(type, label, pts, text) { return { type: type, label: label, pts: pts, text: text }; }
  MISSION.PROFILES = {
    transport: { label: 'Transport', title: 'Simple cruise (transport, business jet, general aviation)',
      text: 'The profile most civil aircraft are sized to: take off, climb, cruise the design range, descend and land, with fuel left for reserves.',
      segs: [
        seg('takeoff', 'Warmup and takeoff', [[0, 0], [4, 0]], 'Engine start, taxi and takeoff. The historical fraction is 0.970.'),
        seg('climb', 'Climb', [[4, 0], [16, 8]], 'Climb and accelerate to cruise altitude and speed. Historical fraction 0.985.'),
        seg('cruise', 'Cruise', [[16, 8], [80, 8.6]], 'Most of the fuel. The aircraft drifts up as it gets lighter (a cruise climb). Fraction from Breguet.'),
        seg('descent', 'Descent', [[80, 8.6], [92, 0.8]], 'Little fuel; often included in the landing fraction, and the descent distance credited to the range.'),
        seg('loiter', 'Reserve: loiter', [[92, 0.8], [98, 0.8]], 'Fuel held back for holding or a diversion (Lesson 6). Fraction from the endurance equation.'),
        seg('landing', 'Land and taxi', [[98, 0.8], [104, 0]], 'Approach, landing and taxi in. Historical fraction 0.995.')
      ] },
    alternate: { label: 'With alternate', title: 'Transport with a diversion to an alternate airport',
      text: 'The airline profile behind the reserve rules: the aircraft reaches its destination, cannot land, climbs out and diverts.',
      segs: [
        seg('takeoff', 'Warmup and takeoff', [[0, 0], [4, 0]], 'Historical fraction 0.970.'),
        seg('climb', 'Climb', [[4, 0], [16, 8]], 'Historical fraction 0.985.'),
        seg('cruise', 'Cruise', [[16, 8], [66, 8.5]], 'The trip to the destination.'),
        seg('descent', 'Descent and missed approach', [[66, 8.5], [76, 0.6], [79, 1.4]], 'At the destination the aircraft cannot land (weather, a blocked runway) and goes around.'),
        seg('climb', 'Climb out', [[79, 1.4], [84, 5]], 'Climb toward the alternate.'),
        seg('cruise', 'Cruise to alternate', [[84, 5], [96, 5]], 'A short, low cruise: less efficient than the main cruise.'),
        seg('loiter', 'Hold', [[96, 5], [100, 1.2], [104, 1.2]], 'Holding at the alternate: 30 minutes at 1500 ft under the international rules.'),
        seg('landing', 'Land and taxi', [[104, 1.2], [109, 0]], 'Historical fraction 0.995.')
      ] },
    combat: { label: 'Combat radius', title: 'Air superiority: combat radius',
      text: 'A military profile flown out and back: the requirement is a radius, not a range.',
      segs: [
        seg('takeoff', 'Warmup and takeoff', [[0, 0], [4, 0]], 'Historical fraction 0.970.'),
        seg('climb', 'Climb', [[4, 0], [12, 8]], 'Historical fraction 0.985.'),
        seg('cruise', 'Cruise out', [[12, 8], [44, 8]], 'Cruise out to the combat area: the radius.'),
        seg('combat', 'Combat', [[44, 8], [46, 7], [48, 8.4], [50, 6.8], [52, 8], [54, 7.4]], 'Minutes of combat at full thrust; weapons may be released, which drops weight as well as fuel.'),
        seg('cruise', 'Cruise back', [[54, 7.4], [86, 8]], 'Cruise home, lighter.'),
        seg('loiter', 'Loiter', [[86, 8], [90, 1], [96, 1]], 'A loiter reserve before landing.'),
        seg('landing', 'Land', [[96, 1], [100, 0]], 'Historical fraction 0.995.')
      ] },
    strike: { label: 'Low-level strike', title: 'Strike: high-low-low-high',
      text: 'Cruise high where it is efficient, descend to fly the dangerous part low and fast to stay below radar, then climb home.',
      segs: [
        seg('takeoff', 'Warmup and takeoff', [[0, 0], [4, 0]], 'Historical fraction 0.970.'),
        seg('climb', 'Climb', [[4, 0], [12, 8]], 'Historical fraction 0.985.'),
        seg('cruise', 'Cruise out, high', [[12, 8], [36, 8]], 'Efficient high-altitude cruise.'),
        seg('descent', 'Descend', [[36, 8], [42, 0.4]], 'Descend before entering defended airspace.'),
        seg('dash', 'Dash in, low', [[42, 0.4], [56, 0.4]], 'High speed at very low altitude: dense air and a poor L/D make this the most expensive distance.'),
        seg('combat', 'Strike', [[56, 0.4], [58, 0.9], [60, 0.4]], 'Weapons released: payload weight drops.'),
        seg('dash', 'Dash out, low', [[60, 0.4], [74, 0.4]], 'Low and fast again, now lighter.'),
        seg('climb', 'Climb', [[74, 0.4], [80, 8]], 'Climb back to cruise altitude.'),
        seg('cruise', 'Cruise home', [[80, 8], [98, 8]], 'Efficient cruise home.'),
        seg('landing', 'Descend and land', [[98, 8], [106, 0]], 'Including reserves.')
      ] },
    patrol: { label: 'Patrol', title: 'Patrol or surveillance (maritime patrol, search and rescue, surveillance UAV)',
      text: 'The requirement is time on station at a distance from base: endurance, not range, sizes the aircraft.',
      segs: [
        seg('takeoff', 'Warmup and takeoff', [[0, 0], [4, 0]], 'Historical fraction 0.970.'),
        seg('climb', 'Climb', [[4, 0], [10, 6]], 'Historical fraction 0.985.'),
        seg('cruise', 'Transit out', [[10, 6], [30, 6]], 'Cruise to the patrol area.'),
        seg('loiter', 'Loiter on station', [[30, 6], [34, 2], [76, 2], [80, 6]], 'Hours at the speed for best endurance, often low to search. The endurance equation, at (L/D)max for a jet.'),
        seg('cruise', 'Transit back', [[80, 6], [100, 6]], 'Cruise home.'),
        seg('landing', 'Descend and land', [[100, 6], [108, 0]], 'Including reserves.')
      ] },
    ferry: { label: 'Ferry', title: 'Ferry: maximum range, no payload',
      text: 'Delivering the aircraft itself, often with extra tanks: full fuel, no payload, the right-hand end of the payload–range diagram.',
      segs: [
        seg('takeoff', 'Warmup and takeoff', [[0, 0], [4, 0]], 'Historical fraction 0.970.'),
        seg('climb', 'Climb', [[4, 0], [14, 8]], 'Historical fraction 0.985.'),
        seg('cruise', 'Cruise', [[14, 8], [96, 9.2]], 'As far as the fuel allows; the cruise climb is pronounced because the fuel is a large fraction of the weight.'),
        seg('landing', 'Descend and land', [[96, 9.2], [108, 0]], 'With reserves.')
      ] }
  };
  MISSION.SEG_COLORS = { takeoff: 'muted', climb: 'good', cruise: 'z', descent: 'muted', loiter: 'warn', landing: 'muted', combat: 'r', dash: 'v' };

  global.MISSION = MISSION;
})(typeof window !== 'undefined' ? window : this);
