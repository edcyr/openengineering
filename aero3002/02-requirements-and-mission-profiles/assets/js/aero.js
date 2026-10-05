/*!
 * aero.js — AERO: data, standard atmosphere, trend charts and to-scale planform drawings for the History of
 * Aircraft Design module (Module 1 of Conceptual Aircraft Design).
 * Classic script (IIFE), attaches ONE global: AERO. Uses CYL (cyl-core.js) for formatting, TeX and errors, and
 * CYL2D (cyl-2d.js) for planform drawings. Every color is a CSS variable, so the light/dark switch needs nothing.
 *
 * AERO.DATA        [{id, name, full, year, era, role, eng, engine, n, W0, We, b, l, S, A, sweep, CD0, LD, P | T, …}]
 *                  SI units: kg, m, m², kW (P, total), kN (T, total maximum), km/h (V…), km (R). `us` keeps the
 *                  published US values. Sources: Loftin, Quest for Performance, NASA SP-468 (1985), Appendix A,
 *                  Tables I–III, V and VII (`src`); the 1903 Flyer from the Smithsonian NASM and NASA Glenn.
 *                  `year` is the first flight of the type (Tables V and VII give it; for Tables I–III it is taken
 *                  from general references). (L/D)max of the jet transports are Loftin's estimates from his text.
 * AERO.ERAS        [{id, label, color, years}] in time order; AERO.era(id)
 * AERO.byId(id)    one aircraft
 * AERO.derive(a)   {WS (N/m²), WSkg (kg/m²), WSus (lb/ft²), PW (kW/kg), WP (kg/kW), TW (thrust/weight),
 *                   WeW0, LDest (½√(πAe/CD0), e = 0.75), f (m², CD0·S)}
 * AERO.isa(h)      International Standard Atmosphere, h in m (0–20 km): {T (K), p (Pa), rho (kg/m³), a (m/s), sigma}
 * AERO.G           9.81 m/s²;  AERO.U  unit factors (LB, FT, FT2, HP, MPH, KT, LBF, MI, NMI)
 * AERO.chart(container, opts) → chart        (SVG scatter / line chart with linear or log axes)
 *    opts: {x:{label (HTML/TeX), min, max, log:false, ticks:null|[…], format(v)}, y:{…}, height:360,
 *           ariaLabel (REQUIRED), legend:null|[{label, color, shape}], pad:{l,r,t,b},
 *           yLabelSide:true (the y label runs up the axis; false puts it above the axis instead)}
 *    chart.points(list, {x(d), y(d), color(d)|'r', shape(d)|'circle'|'tri'|'square'|'diamond', r:5, label(d)→text|null,
 *                 title(d)→tooltip HTML, onClick(d), group}) → handle {set(list), setVisible, remove}
 *    chart.fn(f, {color:'accent', width:2, dashed:false, domain:[a,b], samples:160, label, labelAt}) → handle
 *    chart.polyline(pts, {color, width, dashed, fill, fillOpacity}) → handle
 *    chart.vline(x, {color, dashed, label}) / chart.hline(y, {…}) → handle;  chart.marker([x,y], {color, r, ring:true,
 *                 label}) → handle {set([x,y])};  chart.text([x,y], html, {anchor, color, tex}) → handle
 *    chart.setAxes({x, y}); chart.clear(); chart.redraw(); chart.toPx([x,y]); chart.el; chart.svg
 * AERO.planform(plane, a, {x0, y0, color, fill, opacity, labels}) → CYL2D group: a schematic top view of aircraft
 *    `a` (a DATA entry or a geometry object) TO SCALE in meters, nose toward +x. AERO.geometry(a) gives the
 *    simplified geometry it draws: {b, l, S, A, sweep, taper, biplane, canard, engines, fuse:{w, x0, x1}, ht, vt}.
 */
(function (global) {
  'use strict';
  if (global.AERO) return;
  var AERO = {};
  var SVGNS = 'http://www.w3.org/2000/svg';
  var DEG = Math.PI / 180;
  var hasOwn = Object.prototype.hasOwnProperty;

  function report(msg) {
    try { if (global.CYL && CYL.error) CYL.error('AERO: ' + msg); else if (global.console) console.error('AERO: ' + msg); } catch (e) { /* ignore */ }
  }
  function fmt(x, sig) { return global.CYL ? CYL.fmt(x, sig) : String(+(+x).toPrecision(sig || 4)); }
  function texHtml(s) { return global.CYL ? CYL.tex(s, false) : s; }
  function el(tag, attrs) {
    var n = document.createElementNS(SVGNS, tag);
    if (attrs) for (var k in attrs) if (hasOwn.call(attrs, k) && attrs[k] != null) n.setAttribute(k, attrs[k]);
    return n;
  }
  function paint(c) {
    if (!c) return 'var(--ink)';
    if (/^(#|rgb|hsl|var\()/.test(c)) return c;
    var map = { ink: '--ink', muted: '--ink-muted', faint: '--ink-faint', accent: '--accent', grid: '--c-grid', axis: '--c-axis',
      r: '--c-r', t: '--c-t', z: '--c-z', v: '--c-v', good: '--c-good', bad: '--c-bad', warn: '--c-warn', surface: '--c-surface',
      bg: '--viz-bg', line: '--line', point: '--c-point' };
    return 'var(' + (map[c] || '--ink') + ')';
  }
  AERO.paint = paint;

  /* ================================================================ Units and constants */
  AERO.G = 9.81;
  AERO.U = { LB: 0.45359237, FT: 0.3048, FT2: 0.09290304, HP: 0.745699872, MPH: 1.609344, KT: 1.852, LBF: 0.0044482216, MI: 1.609344, NMI: 1.852 };

  /* ================================================================ Data (generated from the transcription of Loftin's tables) */
  AERO.DATA = [
    {"id":"wright-flyer","name":"Wright Flyer","full":"1903 Wright Flyer","year":1903,"date":"1903-12-17","era":"pioneer","role":"other","eng":"piston","engine":"Wright 4-cylinder, 12 hp","n":1,"P":8.948,"W0":341,"We":274,"b":12.3,"l":6.4,"S":47.4,"A":6.38,"sweep":0,"us":{"P":12,"W0":750,"We":605,"b":40.33,"S":510},"src":"NASM; NASA GRC"},
    {"id":"fokker-e-iii","name":"Fokker E.III","full":"Fokker E-III","year":1915,"era":"ww1","role":"fighter","eng":"piston","engine":"Oberursel U.I","n":1,"P":74.57,"W0":608.7,"We":398.3,"b":9.54,"l":7.163,"S":15.98,"Vmax":140.0,"hVmax":0.0,"Vs":88.51,"CD0":0.0771,"f":1.172,"A":5.7,"LD":6.4,"sweep":0,"us":{"P":100.0,"W0":1342.0,"We":878.0,"b":31.3,"S":172.0,"Vmax":87.0},"src":"Loftin TI","VsEst":true},
    {"id":"dh-2","name":"DH.2","full":"DeHavilland DH-2","year":1915,"era":"ww1","role":"fighter","eng":"piston","engine":"Gnome Monosoupape","n":1,"P":74.57,"W0":653.6,"We":427.7,"b":8.626,"l":7.681,"S":23.13,"Vmax":149.7,"hVmax":0.0,"Vs":72.42,"CD0":0.043,"f":0.995,"A":3.88,"LD":7.0,"sweep":0,"us":{"P":100.0,"W0":1441.0,"We":943.0,"b":28.3,"S":249.0,"Vmax":93.0},"src":"Loftin TI","VsEst":true},
    {"id":"nieuport-17","name":"Nieuport 17","full":"Nieuport 17","year":1916,"era":"ww1","role":"fighter","eng":"piston","engine":"Le Rhone 9J","n":1,"P":82.03,"W0":559.3,"We":374.2,"b":8.199,"l":5.791,"S":14.77,"Vmax":172.2,"hVmax":1981.0,"Vs":85.3,"CD0":0.0491,"f":0.7256,"A":5.51,"LD":7.9,"sweep":0,"us":{"P":110.0,"W0":1233.0,"We":825.0,"b":26.9,"S":159.0,"Vmax":107.0},"src":"Loftin TI","VsEst":true},
    {"id":"albatros-d-iii","name":"Albatros D.III","full":"Albatros D-III","year":1916,"era":"ww1","role":"fighter","eng":"piston","engine":"Mercedes DII","n":1,"P":119.3,"W0":884.1,"We":659.5,"b":9.083,"l":7.315,"S":21.46,"Vmax":175.4,"hVmax":999.7,"Vs":88.51,"CD0":0.0465,"f":0.9978,"A":4.65,"LD":7.5,"sweep":0,"us":{"P":160.0,"W0":1949.0,"We":1454.0,"b":29.8,"S":231.0,"Vmax":109.0},"src":"Loftin TI","VsEst":true},
    {"id":"fokker-dr-i","name":"Fokker Dr.I","full":"Fokker Dr-1","year":1917,"era":"ww1","role":"fighter","eng":"piston","engine":"Oberursel Ur II","n":1,"P":82.03,"W0":585.1,"We":405.5,"b":7.224,"l":5.761,"S":19.23,"Vmax":165.8,"hVmax":3999.0,"Vs":72.42,"CD0":0.0323,"f":0.6215,"A":4.04,"LD":8.0,"sweep":0,"us":{"P":110.0,"W0":1290.0,"We":894.0,"b":23.7,"S":207.0,"Vmax":103.0},"src":"Loftin TI","VsEst":true},
    {"id":"sopwith-camel","name":"Sopwith Camel","full":"Sopwith F.1 Camel","year":1916,"era":"ww1","role":"fighter","eng":"piston","engine":"Clerget 9B","n":1,"P":96.94,"W0":672.2,"We":436.4,"b":8.534,"l":5.73,"S":21.46,"Vmax":169.0,"hVmax":3048.0,"Vs":77.25,"CD0":0.0378,"f":0.811,"A":4.11,"LD":7.7,"sweep":0,"us":{"P":130.0,"W0":1482.0,"We":962.0,"b":28.0,"S":231.0,"Vmax":105.0},"src":"Loftin TI"},
    {"id":"spad-xiii","name":"SPAD XIII","full":"SPAD XIII C.1","year":1917,"era":"ww1","role":"fighter","eng":"piston","engine":"Hispano-Suiza 8BA","n":1,"P":164.1,"W0":819.6,"We":564.7,"b":8.016,"l":6.187,"S":21.09,"Vmax":215.7,"hVmax":1981.0,"Vs":90.12,"CD0":0.0367,"f":0.7739,"A":3.69,"LD":7.4,"sweep":0,"us":{"P":220.0,"W0":1807.0,"We":1245.0,"b":26.3,"S":227.0,"Vmax":134.0},"src":"Loftin TI"},
    {"id":"fokker-d-vii","name":"Fokker D.VII","full":"Fokker D-VII","year":1918,"era":"ww1","role":"fighter","eng":"piston","engine":"BMW IIIA","n":1,"P":138.0,"W0":958.0,"We":668.6,"b":8.931,"l":6.949,"S":20.53,"Vmax":199.6,"hVmax":0.0,"Vs":86.9,"CD0":0.0404,"f":0.8296,"A":4.7,"LD":8.1,"sweep":0,"us":{"P":185.0,"W0":2112.0,"We":1474.0,"b":29.3,"S":221.0,"Vmax":124.0},"src":"Loftin TI"},
    {"id":"sopwith-dolphin","name":"Sopwith Dolphin","full":"Sopwith 5F.1 Dolphin","year":1917,"era":"ww1","role":"fighter","eng":"piston","engine":"Hispano-Suiza","n":1,"P":149.1,"W0":866.8,"We":637.8,"b":9.906,"l":6.797,"S":24.43,"Vmax":206.0,"hVmax":3048.0,"Vs":82.08,"CD0":0.0317,"f":0.7757,"A":4.85,"LD":9.2,"sweep":0,"us":{"P":200.0,"W0":1911.0,"We":1406.0,"b":32.5,"S":263.0,"Vmax":128.0},"src":"Loftin TI","VsEst":true},
    {"id":"fokker-d-viii","name":"Fokker D.VIII","full":"Fokker D-VIII","year":1918,"era":"ww1","role":"fighter","eng":"piston","engine":"Oberursel Ur II","n":1,"P":82.03,"W0":561.5,"We":384.6,"b":8.382,"l":5.883,"S":10.68,"Vmax":183.5,"hVmax":1981.0,"Vs":91.73,"CD0":0.0552,"f":0.589,"A":6.58,"LD":8.1,"sweep":0,"us":{"P":110.0,"W0":1238.0,"We":848.0,"b":27.5,"S":115.0,"Vmax":114.0},"src":"Loftin TI","VsEst":true},
    {"id":"junkers-d-i","name":"Junkers D.I","full":"Junkers D-I","year":1918,"era":"ww1","role":"fighter","eng":"piston","engine":"BMW IIIA","n":1,"P":138.0,"W0":870.9,"We":652.7,"b":8.992,"l":7.254,"S":14.77,"Vmax":191.5,"hVmax":0.0,"Vs":90.12,"CD0":0.0612,"f":0.9058,"A":5.46,"LD":7.0,"sweep":0,"us":{"P":185.0,"W0":1920.0,"We":1439.0,"b":29.5,"S":159.0,"Vmax":119.0},"src":"Loftin TI","VsEst":true},
    {"id":"hp-o-400","name":"HP O/400","full":"Handley Page O/400","year":1916,"era":"ww1","role":"bomber","eng":"piston","engine":"Liberty 12-N","n":2,"P":522.0,"W0":6543.0,"We":3956.0,"b":30.48,"l":19.2,"S":153.8,"Vmax":151.3,"hVmax":0.0,"Vs":83.69,"CD0":0.0427,"f":6.565,"A":7.31,"LD":9.7,"sweep":0,"us":{"P":700.0,"W0":14425.0,"We":8721.0,"b":100.0,"S":1655.0,"Vmax":94.0},"src":"Loftin TI","VsEst":true},
    {"id":"gotha-g-v","name":"Gotha G.V","full":"Gotha G.V","year":1917,"era":"ww1","role":"bomber","eng":"piston","engine":"Mercedes DIVa","n":2,"P":387.8,"W0":3882.0,"We":2565.0,"b":23.71,"l":12.19,"S":89.47,"Vmax":140.0,"hVmax":0.0,"Vs":90.12,"CD0":0.0711,"f":6.359,"A":7.61,"LD":7.7,"sweep":0,"us":{"P":520.0,"W0":8558.0,"We":5654.0,"b":77.8,"S":963.0,"Vmax":87.0},"src":"Loftin TI","VsEst":true},
    {"id":"caproni-ca-42","name":"Caproni Ca.42","full":"Caproni Ca.42","year":1917,"era":"ww1","role":"bomber","eng":"piston","engine":"Liberty","n":3,"P":894.8,"W0":8029.0,"We":5035.0,"b":29.38,"l":13.08,"S":206.5,"Vmax":157.7,"hVmax":1981.0,"Vs":85.3,"CD0":0.0444,"f":9.17,"A":5.43,"LD":8.2,"sweep":0,"us":{"P":1200.0,"W0":17700.0,"We":11100.0,"b":96.4,"S":2223.0,"Vmax":98.0},"src":"Loftin TI","VsEst":true},
    {"id":"b-e-2c","name":"B.E.2c","full":"B.E.2c","year":1914,"era":"ww1","role":"other","eng":"piston","engine":"R.A.F.1a","n":1,"P":67.11,"W0":971.6,"b":11.28,"l":8.321,"S":34.47,"Vmax":115.9,"hVmax":1981.0,"Vs":72.42,"CD0":0.0368,"f":1.269,"A":4.47,"LD":8.2,"sweep":0,"us":{"P":90.0,"W0":2142.0,"We":null,"b":37.0,"S":371.0,"Vmax":72.0},"src":"Loftin TI","VsEst":true},
    {"id":"junkers-j-i","name":"Junkers J.I","full":"Junkers J-I","year":1917,"era":"ww1","role":"other","eng":"piston","engine":"Benz Bz.IV","n":1,"P":149.1,"W0":2171.0,"We":1762.0,"b":16.0,"l":9.083,"S":48.5,"Vmax":154.5,"hVmax":0.0,"Vs":82.08,"CD0":0.0335,"f":1.626,"A":6.4,"LD":10.3,"sweep":0,"us":{"P":200.0,"W0":4787.0,"We":3885.0,"b":52.5,"S":522.0,"Vmax":96.0},"src":"Loftin TI","VsEst":true},
    {"id":"dh-4","name":"DH.4","full":"DeHavilland DH-4","year":1916,"era":"ww1","role":"bomber","eng":"piston","engine":"Liberty","n":1,"P":298.3,"W0":2084.0,"b":12.95,"l":9.327,"S":40.88,"Vmax":199.6,"hVmax":0.0,"Vs":98.17,"CD0":0.0422,"f":2.027,"A":4.97,"LD":8.1,"sweep":0,"us":{"P":400.0,"W0":4595.0,"We":null,"b":42.5,"S":440.0,"Vmax":124.0},"src":"Loftin TI","VsEst":true},
    {"id":"curtiss-jn-4h","name":"Curtiss JN-4H","full":"Curtiss JN-4H","year":1917,"era":"ww1","role":"other","eng":"piston","engine":"Wright-Hispano","n":1,"P":111.9,"W0":914.9,"We":665.4,"b":13.29,"l":8.321,"S":32.76,"Vmax":149.7,"hVmax":0.0,"Vs":75.64,"CD0":0.05,"f":1.639,"A":7.76,"LD":9.24,"sweep":0,"us":{"P":150.0,"W0":2017.0,"We":1467.0,"b":43.6,"S":352.6,"Vmax":93.0},"src":"Loftin TI"},
    {"id":"hp-w-8","name":"HP W.8","full":"Handley Page W8F","year":1919,"era":"interwar","role":"transport","eng":"piston","engine":"RR Eagle IX + 2 Puma","n":3,"P":626.4,"W0":5897.0,"We":3901.0,"b":22.92,"l":18.32,"S":135.3,"Vmax":165.8,"hVmax":0.0,"Vc":136.8,"CD0":0.0549,"f":7.426,"A":4.67,"LD":7.1,"sweep":0,"us":{"P":840.0,"W0":13000.0,"We":8600.0,"b":75.2,"S":1456.0,"Vmax":103.0},"src":"Loftin TII"},
    {"id":"fokker-f-ii","name":"Fokker F.II","full":"Fokker F-2","year":1919,"era":"interwar","role":"transport","eng":"piston","engine":"BMW","n":1,"P":138.0,"W0":1896.0,"We":1197.0,"b":17.25,"l":10.3,"S":41.99,"Vmax":149.7,"hVmax":0.0,"CD0":0.0466,"f":1.96,"A":7.1,"LD":9.4,"sweep":0,"us":{"P":185.0,"W0":4180.0,"We":2640.0,"b":56.6,"S":452.0,"Vmax":93.0},"src":"Loftin TII"},
    {"id":"curtiss-r2c-1","name":"Curtiss R2C-1","full":"Curtiss R2C-1","year":1923,"era":"interwar","role":"racer","eng":"piston","engine":"Curtiss D-12 mod","n":1,"P":372.8,"W0":939.4,"b":6.706,"l":6.005,"S":13.01,"Vmax":429.7,"hVmax":0.0,"Vs":119.1,"CD0":0.0206,"f":0.2676,"A":4.18,"LD":10.9,"sweep":0,"us":{"P":500.0,"W0":2071.0,"We":null,"b":22.0,"S":140.0,"Vmax":267.0},"src":"Loftin TII"},
    {"id":"dayton-wright-rb","name":"Dayton-Wright RB","full":"Dayton Wright RB","year":1920,"era":"interwar","role":"racer","eng":"piston","engine":"Hall Scott L-6","n":1,"P":186.4,"W0":839.1,"We":635.0,"b":6.462,"l":6.919,"S":9.476,"Vmax":321.9,"hVmax":0.0,"Vs":103.0,"CD0":0.0316,"f":0.2991,"A":4.38,"LD":9.0,"sweep":0,"us":{"P":250.0,"W0":1850.0,"We":1400.0,"b":21.2,"S":102.0,"Vmax":200.0},"src":"Loftin TII"},
    {"id":"supermarine-s-4","name":"Supermarine S.4","full":"Supermarine S-4","year":1925,"era":"interwar","role":"racer","eng":"piston","engine":"Napier Lion","n":1,"P":335.6,"W0":1429.0,"b":9.296,"l":8.23,"S":12.63,"Vmax":384.6,"hVmax":0.0,"Vs":144.8,"CD0":0.0274,"f":0.3465,"A":6.84,"LD":12.1,"sweep":0,"us":{"P":450.0,"W0":3150.0,"We":null,"b":30.5,"S":136.0,"Vmax":239.0},"src":"Loftin TII"},
    {"id":"spirit-of-st-louis","name":"Spirit of St. Louis","full":"Ryan NYP","year":1927,"era":"interwar","role":"other","eng":"piston","engine":"Wright J-5C","n":1,"P":164.1,"W0":2329.0,"We":975.2,"b":14.02,"l":8.443,"S":29.64,"Vmax":193.1,"hVmax":0.0,"Vc":152.9,"Vs":114.3,"CD0":0.0379,"f":1.124,"A":6.63,"LD":10.1,"sweep":0,"us":{"P":220.0,"W0":5135.0,"We":2150.0,"b":46.0,"S":319.0,"Vmax":120.0},"src":"Loftin TII"},
    {"id":"ford-trimotor","name":"Ford Trimotor","full":"Ford 5-AT","year":1928,"era":"interwar","role":"transport","eng":"piston","engine":"P&W R-1340 Wasp","n":3,"P":939.6,"W0":6123.0,"b":23.71,"l":15.33,"S":77.57,"Vmax":241.4,"hVmax":0.0,"Vs":103.0,"CD0":0.0471,"f":3.654,"A":7.26,"LD":9.5,"sweep":0,"us":{"P":1260.0,"W0":13500.0,"We":null,"b":77.8,"S":835.0,"Vmax":150.0},"src":"Loftin TII"},
    {"id":"lockheed-vega","name":"Lockheed Vega","full":"Lockheed Vega 5C","year":1927,"era":"interwar","role":"transport","eng":"piston","engine":"P&W R-1340 Wasp","n":1,"P":335.6,"W0":1829.0,"We":1118.0,"b":12.5,"l":8.382,"S":25.55,"Vmax":305.8,"hVmax":0.0,"Vc":241.4,"Vs":93.34,"CD0":0.0278,"f":0.7107,"A":6.11,"LD":11.4,"sweep":0,"us":{"P":450.0,"W0":4033.0,"We":2465.0,"b":41.0,"S":275.0,"Vmax":190.0},"src":"Loftin TII"},
    {"id":"curtiss-robin","name":"Curtiss Robin","full":"Curtiss Robin","year":1928,"era":"interwar","role":"ga","eng":"piston","engine":"Curtiss Challenger","n":1,"P":138.0,"W0":1179.0,"We":747.5,"b":12.5,"l":7.65,"S":20.72,"Vmax":185.1,"hVmax":0.0,"Vc":164.2,"Vs":75.64,"CD0":0.0585,"f":1.217,"A":7.54,"LD":8.7,"sweep":0,"us":{"P":185.0,"W0":2600.0,"We":1648.0,"b":41.0,"S":223.0,"Vmax":115.0},"src":"Loftin TII"},
    {"id":"travel-air-4000","name":"Travel Air 4000","full":"Travelair 4000","year":1927,"era":"interwar","role":"ga","eng":"piston","engine":"Wright J-5","n":1,"P":164.1,"W0":1111.0,"b":10.58,"l":7.376,"S":27.59,"Vmax":217.3,"hVmax":0.0,"Vc":177.0,"Vs":74.03,"A":4.8,"sweep":0,"us":{"P":220.0,"W0":2450.0,"We":null,"b":34.7,"S":297.0,"Vmax":135.0},"src":"Loftin TII"},
    {"id":"curtiss-p-6e","name":"Curtiss P-6E","full":"Curtiss Hawk P-6E","year":1931,"era":"interwar","role":"fighter","eng":"piston","engine":"Curtiss V-1570","n":1,"P":484.7,"W0":1539.0,"We":1224.0,"b":9.601,"l":7.071,"S":23.41,"Vmax":318.7,"hVmax":0.0,"Vc":281.6,"Vs":98.17,"CD0":0.0371,"f":0.8686,"A":4.76,"LD":8.7,"sweep":0,"us":{"P":650.0,"W0":3392.0,"We":2699.0,"b":31.5,"S":252.0,"Vmax":198.0},"src":"Loftin TII"},
    {"id":"boeing-p-26","name":"Boeing P-26","full":"Boeing P-26A","year":1932,"era":"interwar","role":"fighter","eng":"piston","engine":"P&W R-1340","n":1,"P":447.4,"W0":1366.0,"We":1030.0,"b":8.504,"l":7.193,"S":13.84,"Vmax":376.6,"hVmax":2286.0,"Vc":339.6,"Vs":119.1,"CD0":0.0448,"f":0.6206,"A":5.24,"LD":8.3,"sweep":0,"us":{"P":600.0,"W0":3012.0,"We":2271.0,"b":27.9,"S":149.0,"Vmax":234.0},"src":"Loftin TII"},
    {"id":"lockheed-orion","name":"Lockheed Orion","full":"Lockheed Orion 9D","year":1931,"era":"interwar","role":"transport","eng":"piston","engine":"P&W R-1340 Wasp","n":1,"P":410.1,"W0":2449.0,"We":1508.0,"b":14.57,"l":8.473,"S":24.34,"Vmax":363.7,"hVmax":0.0,"Vc":321.9,"Vs":101.4,"CD0":0.021,"f":0.5112,"A":7.01,"LD":14.1,"sweep":0,"us":{"P":550.0,"W0":5400.0,"We":3325.0,"b":47.8,"S":262.0,"Vmax":226.0},"src":"Loftin TII"},
    {"id":"northrop-alpha","name":"Northrop Alpha","full":"Northrop Alpha","year":1930,"era":"interwar","role":"transport","eng":"piston","engine":"P&W R-1340 Wasp","n":1,"P":313.2,"W0":2203.0,"b":13.35,"l":8.626,"S":28.99,"Vmax":284.9,"hVmax":0.0,"Vc":241.4,"Vs":99.78,"CD0":0.0274,"f":0.7943,"A":5.93,"LD":11.3,"sweep":0,"us":{"P":420.0,"W0":4856.0,"We":null,"b":43.8,"S":312.0,"Vmax":177.0},"src":"Loftin TII"},
    {"id":"boeing-247","name":"Boeing 247","full":"Boeing 247D","year":1933,"era":"interwar","role":"transport","eng":"piston","engine":"P&W R-1340 Wasp","n":2,"P":783.0,"W0":6192.0,"We":4055.0,"b":22.56,"l":15.64,"S":77.67,"Vmax":325.1,"hVmax":2286.0,"Vc":297.7,"Vs":98.17,"CD0":0.0212,"f":1.646,"A":6.55,"LD":13.5,"sweep":0,"us":{"P":1050.0,"W0":13650.0,"We":8940.0,"b":74.0,"S":836.0,"Vmax":202.0},"src":"Loftin TII"},
    {"id":"douglas-dc-3","name":"Douglas DC-3","full":"Douglas DC-3","year":1935,"era":"interwar","role":"transport","eng":"piston","engine":"P&W R-1830","n":2,"P":1790.0,"W0":11340.0,"We":8038.0,"b":28.96,"l":19.66,"S":91.7,"Vmax":368.5,"hVmax":2286.0,"Vc":297.7,"Vs":107.8,"CD0":0.0249,"f":2.376,"A":9.14,"LD":14.7,"sweep":0,"us":{"P":2400.0,"W0":25000.0,"We":17720.0,"b":95.0,"S":987.0,"Vmax":229.0},"src":"Loftin TII"},
    {"id":"boeing-b-17","name":"Boeing B-17","full":"Boeing B-17G","year":1935,"era":"interwar","role":"bomber","eng":"piston","engine":"Wright R-1820","n":4,"P":3579.0,"W0":24950.0,"We":16390.0,"b":31.64,"l":22.65,"S":131.9,"Vmax":461.9,"hVmax":7620.0,"Vc":292.9,"Vs":144.8,"CD0":0.0302,"f":3.979,"A":7.58,"LD":12.7,"sweep":0,"us":{"P":4800.0,"W0":55000.0,"We":36135.0,"b":103.8,"S":1420.0,"Vmax":287.0},"src":"Loftin TII"},
    {"id":"seversky-p-35","name":"Seversky P-35","full":"Seversky P-35","year":1937,"era":"interwar","role":"fighter","eng":"piston","engine":"P&W R-1830","n":1,"P":633.8,"W0":2540.0,"We":1957.0,"b":10.97,"l":8.169,"S":20.44,"Vmax":453.8,"hVmax":3048.0,"Vc":418.4,"Vs":127.1,"CD0":0.0251,"f":0.5128,"A":5.89,"LD":11.8,"sweep":0,"us":{"P":850.0,"W0":5599.0,"We":4315.0,"b":36.0,"S":220.0,"Vmax":282.0},"src":"Loftin TII"},
    {"id":"piper-cub","name":"Piper Cub","full":"Piper J-3 Cub","year":1938,"era":"interwar","role":"ga","eng":"piston","engine":"Continental A-65","n":1,"P":48.47,"W0":553.4,"We":331.1,"b":9.815,"l":6.828,"S":16.54,"Vmax":160.9,"hVmax":0.0,"Vc":140.0,"CD0":0.0373,"f":0.6169,"A":5.81,"LD":9.6,"sweep":0,"us":{"P":65.0,"W0":1220.0,"We":730.0,"b":32.2,"S":178.0,"Vmax":100.0},"src":"Loftin TII"},
    {"id":"stinson-reliant","name":"Stinson Reliant","full":"Stinson SR-8B","year":1936,"era":"interwar","role":"ga","eng":"piston","engine":"Lycoming R-680","n":1,"P":182.7,"W0":1656.0,"We":1048.0,"b":12.74,"l":8.382,"S":23.78,"Vc":225.3,"CD0":0.0348,"f":0.8278,"A":6.84,"LD":10.8,"sweep":0,"us":{"P":245.0,"W0":3650.0,"We":2310.0,"b":41.8,"S":256.0,"Vmax":null},"src":"Loftin TII"},
    {"id":"beech-staggerwing","name":"Beech Staggerwing","full":"Beechcraft D17S","year":1937,"era":"interwar","role":"ga","eng":"piston","engine":"P&W R-985","n":1,"P":335.6,"W0":1905.0,"We":1116.0,"b":9.754,"l":7.925,"S":27.5,"Vc":325.1,"Vs":80.47,"CD0":0.0182,"f":0.5007,"A":4.18,"LD":11.7,"sweep":0,"us":{"P":450.0,"W0":4200.0,"We":2460.0,"b":32.0,"S":296.0,"Vmax":null},"src":"Loftin TII"},
    {"id":"consolidated-b-24","name":"Consolidated B-24","full":"Consolidated B-24J","year":1939,"era":"ww2","role":"bomber","eng":"piston","engine":"P&W R-1830-65","n":4,"P":3579.0,"W0":25400.0,"We":17240.0,"b":33.53,"l":20.48,"S":97.36,"Vmax":466.7,"hVmax":7620.0,"Vc":346.0,"Vs":152.9,"CD0":0.0406,"f":3.952,"A":11.55,"LD":12.9,"sweep":0,"us":{"P":4800.0,"W0":56000.0,"We":38000.0,"b":110.0,"S":1048.0,"Vmax":290.0},"src":"Loftin TIII"},
    {"id":"boeing-b-29","name":"Boeing B-29","full":"Boeing B-29","year":1942,"era":"ww2","role":"bomber","eng":"piston","engine":"Wright 3350-57","n":4,"P":6562.0,"W0":54430.0,"We":33790.0,"b":43.07,"l":30.18,"S":161.3,"Vmax":574.5,"hVmax":7620.0,"Vc":407.2,"Vs":169.0,"CD0":0.0241,"f":3.824,"A":11.5,"LD":16.8,"sweep":0,"us":{"P":8800.0,"W0":120000.0,"We":74500.0,"b":141.3,"S":1736.0,"Vmax":357.0},"src":"Loftin TIII"},
    {"id":"martin-b-26","name":"Martin B-26","full":"Martin B-26F","year":1940,"era":"ww2","role":"bomber","eng":"piston","engine":"P&W R-2800","n":2,"P":2983.0,"W0":16780.0,"We":10750.0,"b":21.64,"l":17.07,"S":61.13,"Vmax":441.0,"hVmax":4572.0,"Vc":362.1,"Vs":196.3,"CD0":0.0314,"f":1.919,"A":7.66,"LD":12.0,"sweep":0,"us":{"P":4000.0,"W0":37000.0,"We":23700.0,"b":71.0,"S":658.0,"Vmax":274.0},"src":"Loftin TIII"},
    {"id":"north-american-p-51","name":"North American P-51","full":"North American P-51D","year":1940,"era":"ww2","role":"fighter","eng":"piston","engine":"RR V-1650","n":1,"P":1111.0,"W0":4581.0,"We":3232.0,"b":11.28,"l":9.845,"S":21.65,"Vmax":703.3,"hVmax":7620.0,"Vc":582.6,"Vs":160.9,"CD0":0.0163,"f":0.353,"A":5.86,"LD":14.6,"sweep":0,"us":{"P":1490.0,"W0":10100.0,"We":7125.0,"b":37.0,"S":233.0,"Vmax":437.0},"src":"Loftin TIII"},
    {"id":"lockheed-p-38","name":"Lockheed P-38","full":"Lockheed P-38L","year":1939,"era":"ww2","role":"fighter","eng":"piston","engine":"Allison V-1710-111","n":2,"P":2192.0,"W0":7938.0,"We":5806.0,"b":15.85,"l":11.55,"S":30.43,"Vmax":666.3,"hVmax":7620.0,"Vs":169.0,"CD0":0.0268,"f":0.8157,"A":8.26,"LD":13.5,"sweep":0,"us":{"P":2940.0,"W0":17500.0,"We":12800.0,"b":52.0,"S":327.5,"Vmax":414.0},"src":"Loftin TIII"},
    {"id":"grumman-hellcat","name":"Grumman Hellcat","full":"Grumman F6F-3","year":1942,"era":"ww2","role":"fighter","eng":"piston","engine":"P&W R-2800","n":1,"P":1491.0,"W0":5643.0,"We":4128.0,"b":13.05,"l":10.24,"S":31.03,"Vmax":603.5,"hVmax":5273.0,"Vc":257.5,"Vs":135.2,"CD0":0.0211,"f":0.655,"A":5.34,"LD":12.2,"sweep":0,"us":{"P":2000.0,"W0":12441.0,"We":9101.0,"b":42.8,"S":334.0,"Vmax":375.0},"src":"Loftin TIII"},
    {"id":"curtiss-helldiver","name":"Curtiss Helldiver","full":"Curtiss SB2C-1","year":1940,"era":"ww2","role":"bomber","eng":"piston","engine":"Wright R-2600-8","n":1,"P":1305.0,"W0":6681.0,"We":4588.0,"b":15.18,"l":11.19,"S":39.21,"Vmax":452.2,"hVmax":3780.0,"Vc":254.3,"Vs":127.1,"CD0":0.0225,"f":0.8844,"A":5.88,"LD":12.4,"sweep":0,"us":{"P":1750.0,"W0":14730.0,"We":10114.0,"b":49.8,"S":422.0,"Vmax":281.0},"src":"Loftin TIII"},
    {"id":"super-constellation","name":"Super Constellation","full":"Lockheed L.1049G","year":1950,"era":"postwar","role":"transport","eng":"piston","engine":"Wright R-3350","n":4,"P":9694.0,"W0":60330.0,"b":37.49,"l":34.59,"S":153.3,"Vmax":566.5,"hVmax":3200.0,"Vc":532.7,"Vs":160.9,"CD0":0.0211,"f":3.235,"A":9.17,"LD":16.0,"sweep":0,"us":{"P":13000.0,"W0":133000.0,"We":null,"b":123.0,"S":1650.0,"Vmax":352.0},"src":"Loftin TIII"},
    {"id":"vickers-viscount","name":"Vickers Viscount","full":"Vickers Viscount 700","year":1948,"era":"postwar","role":"transport","eng":"turboprop","engine":"RR Dart 506","n":4,"P":4772.0,"W0":27220.0,"We":16680.0,"b":28.59,"l":24.75,"S":89.47,"Vc":537.5,"A":9.14,"sweep":0,"us":{"P":6400.0,"W0":60000.0,"We":36776.0,"b":93.8,"S":963.0,"Vmax":null},"src":"Loftin TIII"},
    {"id":"lockheed-c-130","name":"Lockheed C-130","full":"Lockheed C-130","year":1954,"era":"postwar","role":"transport","eng":"turboprop","engine":"Allison T-56","n":4,"P":14650.0,"W0":70310.0,"We":34170.0,"b":40.42,"l":29.78,"S":162.1,"Vc":621.2,"Vs":185.1,"A":10.08,"sweep":0,"us":{"P":19640.0,"W0":155000.0,"We":75331.0,"b":132.6,"S":1745.0,"Vmax":null},"src":"Loftin TIII"},
    {"id":"piper-cherokee","name":"Piper Cherokee","full":"Piper Cherokee","year":1960,"era":"postwar","role":"ga","eng":"piston","engine":"Lycoming O-360","n":1,"P":134.2,"W0":1111.0,"We":628.7,"b":9.754,"l":7.315,"S":15.79,"Vmax":238.2,"hVmax":0.0,"Vc":226.9,"Vs":98.17,"CD0":0.0358,"f":0.5658,"A":6.02,"LD":10.0,"sweep":0,"us":{"P":180.0,"W0":2450.0,"We":1386.0,"b":32.0,"S":170.0,"Vmax":148.0},"src":"Loftin TIII"},
    {"id":"cessna-172","name":"Cessna 172","full":"Cessna Skyhawk","year":1955,"era":"postwar","role":"ga","eng":"piston","engine":"Lycoming O-320","n":1,"P":111.9,"W0":1043.0,"We":612.3,"b":10.67,"l":8.199,"S":16.26,"Vmax":231.7,"hVmax":0.0,"Vc":222.1,"Vs":78.86,"CD0":0.0319,"f":0.5184,"A":7.32,"LD":11.6,"sweep":0,"us":{"P":150.0,"W0":2300.0,"We":1350.0,"b":35.0,"S":175.0,"Vmax":144.0},"src":"Loftin TIII"},
    {"id":"beech-bonanza","name":"Beech Bonanza","full":"Beech Bonanza V-35","year":1945,"era":"postwar","role":"ga","eng":"piston","engine":"Continental IO-520","n":1,"P":212.5,"W0":1542.0,"We":930.3,"b":10.21,"l":8.047,"S":16.82,"Vmax":338.0,"hVmax":0.0,"Vc":326.7,"Vs":101.4,"CD0":0.0192,"f":0.3233,"A":6.2,"LD":13.8,"sweep":0,"us":{"P":285.0,"W0":3400.0,"We":2051.0,"b":33.5,"S":181.0,"Vmax":210.0},"src":"Loftin TIII"},
    {"id":"cessna-cardinal-rg","name":"Cessna Cardinal RG","full":"Cessna Cardinal RG II","year":1971,"era":"postwar","role":"ga","eng":"piston","engine":"Lycoming O-360","n":1,"P":149.1,"W0":1270.0,"We":793.8,"b":11.13,"l":8.321,"S":16.17,"Vmax":289.7,"hVmax":0.0,"Vc":275.2,"Vs":91.73,"CD0":0.0223,"f":0.3605,"A":7.66,"LD":14.2,"sweep":0,"us":{"P":200.0,"W0":2800.0,"We":1750.0,"b":36.5,"S":174.0,"Vmax":180.0},"src":"Loftin TIII"},
    {"id":"cessna-310","name":"Cessna 310","full":"Cessna 310 II","year":1953,"era":"postwar","role":"ga","eng":"piston","engine":"Continental IO-520","n":2,"P":425.0,"W0":2495.0,"We":1550.0,"b":11.25,"l":8.931,"S":16.63,"Vmax":383.0,"hVmax":0.0,"Vc":358.9,"Vs":123.9,"CD0":0.0267,"f":0.4441,"A":7.61,"LD":13.0,"sweep":0,"us":{"P":570.0,"W0":5500.0,"We":3417.0,"b":36.9,"S":179.0,"Vmax":238.0},"src":"Loftin TIII"},
    {"id":"beech-king-air-200","name":"Beech King Air 200","full":"Beech Super King Air 200","year":1972,"era":"postwar","role":"ga","eng":"turboprop","engine":"PT6A-41","n":2,"P":1268.0,"W0":5670.0,"We":3318.0,"b":16.61,"l":13.35,"S":28.15,"Vmax":535.9,"hVmax":4572.0,"Vc":515.0,"Vs":148.1,"A":9.8,"sweep":0,"us":{"P":1700.0,"W0":12500.0,"We":7315.0,"b":54.5,"S":303.0,"Vmax":333.0},"src":"Loftin TIII"},
    {"id":"messerschmitt-me-262","name":"Messerschmitt Me 262","full":"Messerschmitt Me 262A","year":1942,"date":"1942-03-25","era":"jetfighter","role":"fighter","eng":"turbojet","engine":"2x Jumo 004 1984","n":2,"T":17.65,"Tdry":17.65,"W0":6396.0,"Wmax":7130.0,"We":3800.0,"b":12.53,"l":10.61,"S":21.7,"A":7.23,"sweep":18.5,"Vmax":869.0,"Mmax":0.76,"TWtab":0.28,"us":{"T":3968.0,"W0":14101.0,"We":8378.0,"b":41.1,"S":233.6,"Vmax":540.0},"src":"Loftin TV"},
    {"id":"gloster-meteor","name":"Gloster Meteor","full":"Gloster Meteor F.4","year":1943,"date":"1943-03-05","era":"jetfighter","role":"fighter","eng":"turbojet","engine":"2x Derwent 5 3500","n":2,"T":31.14,"Tdry":31.14,"W0":6804.0,"Wmax":8165.0,"We":4559.0,"b":11.31,"l":12.5,"S":32.52,"A":3.93,"sweep":0.0,"Vmax":917.3,"Mmax":0.81,"TWtab":0.47,"us":{"T":7000.0,"W0":15000.0,"We":10050.0,"b":37.1,"S":350.0,"Vmax":570.0},"src":"Loftin TV"},
    {"id":"bell-p-59","name":"Bell P-59","full":"Bell P-59A","year":1942,"date":"1942-10-01","era":"jetfighter","role":"fighter","eng":"turbojet","engine":"2x J31 2000","n":2,"T":17.79,"Tdry":17.79,"W0":4909.0,"Wmax":5897.0,"We":3606.0,"b":13.87,"l":11.86,"S":35.77,"A":5.38,"sweep":0.0,"Vmax":664.7,"Mmax":0.61,"TWtab":0.37,"us":{"T":4000.0,"W0":10822.0,"We":7950.0,"b":45.5,"S":385.0,"Vmax":413.0},"src":"Loftin TV"},
    {"id":"lockheed-p-80","name":"Lockheed P-80","full":"Lockheed P-80A","year":1944,"date":"1944-01-08","era":"jetfighter","role":"fighter","eng":"turbojet","engine":"1x J33 4000","n":1,"T":17.79,"Tdry":17.79,"W0":5307.0,"Wmax":6350.0,"We":3592.0,"b":11.86,"l":10.52,"S":22.07,"A":6.37,"sweep":0.0,"Vmax":817.5,"Mmax":0.75,"CD0":0.0134,"LD":17.7,"TWtab":0.34,"us":{"T":4000.0,"W0":11700.0,"We":7920.0,"b":38.9,"S":237.6,"Vmax":508.0},"src":"Loftin TV"},
    {"id":"mcdonnell-fh-1-phantom","name":"McDonnell FH-1 Phantom","full":"McDonnell FH-1","year":1945,"date":"1945-01-26","era":"jetfighter","role":"fighter","eng":"turbojet","engine":"2x J30 1560","n":2,"T":13.88,"Tdry":13.88,"W0":4524.0,"Wmax":5670.0,"We":3039.0,"b":12.44,"l":11.83,"S":25.46,"A":6.08,"sweep":0.0,"Vmax":780.5,"Mmax":0.67,"TWtab":0.31,"us":{"T":3120.0,"W0":9974.0,"We":6699.0,"b":40.8,"S":274.0,"Vmax":485.0},"src":"Loftin TV"},
    {"id":"north-american-f-86","name":"North American F-86","full":"North American F-86E","year":1947,"date":"1947-10-01","era":"jetfighter","role":"fighter","eng":"turbojet","engine":"1x J47 5200","n":1,"T":23.13,"Tdry":23.13,"W0":6739.0,"Wmax":8077.0,"We":4919.0,"b":11.31,"l":11.43,"S":26.75,"A":4.78,"sweep":35.0,"Vmax":967.2,"Mmax":0.91,"CD0":0.0132,"LD":15.1,"TWtab":0.35,"us":{"T":5200.0,"W0":14856.0,"We":10845.0,"b":37.1,"S":287.9,"Vmax":601.0},"src":"Loftin TV"},
    {"id":"grumman-f9f-cougar","name":"Grumman F9F Cougar","full":"Grumman F9F-8","year":1951,"date":"1951-09-20","era":"jetfighter","role":"fighter","eng":"turbojet","engine":"1x J48 7250","n":1,"T":32.25,"Tdry":32.25,"W0":9116.0,"Wmax":11230.0,"We":5382.0,"b":10.52,"l":12.83,"S":31.31,"A":3.53,"sweep":35.0,"Vmax":954.3,"Mmax":0.89,"TWtab":0.36,"us":{"T":7250.0,"W0":20098.0,"We":11866.0,"b":34.5,"S":337.0,"Vmax":593.0},"src":"Loftin TV"},
    {"id":"north-american-f-100","name":"North American F-100","full":"North American F-100D","year":1953,"date":"1953-05-25","era":"jetfighter","role":"fighter","eng":"turbojet","engine":"1x J57 16000/10000","n":1,"T":71.17,"Tdry":44.48,"W0":15440.0,"We":9361.0,"b":11.83,"l":15.03,"S":37.18,"A":3.76,"sweep":45.0,"Vmax":1492.0,"Mmax":1.39,"CD0":0.013,"LD":13.9,"TWtab":0.47,"us":{"T":16000.0,"W0":34050.0,"We":20638.0,"b":38.8,"S":400.2,"Vmax":927.0},"src":"Loftin TV"},
    {"id":"convair-f-106","name":"Convair F-106","full":"Convair F-106A","year":1956,"date":"1956-12-26","era":"jetfighter","role":"fighter","eng":"turbojet","engine":"1x J75 24000/16100","n":1,"T":106.8,"Tdry":71.62,"W0":15650.0,"We":10900.0,"b":11.67,"l":21.55,"S":64.83,"A":2.1,"sweep":60.0,"Vmax":2454.0,"Mmax":2.31,"CD0":0.0083,"LD":12.1,"TWtab":0.7,"us":{"T":24000.0,"W0":34510.0,"We":24038.0,"b":38.3,"S":697.8,"Vmax":1525.0},"src":"Loftin TV"},
    {"id":"lockheed-f-104","name":"Lockheed F-104","full":"Lockheed F-104G","year":1954,"date":"1954-02-07","era":"jetfighter","role":"fighter","eng":"turbojet","engine":"1x J79 15600/10000","n":1,"T":69.39,"Tdry":44.48,"W0":12380.0,"Wmax":13190.0,"We":6348.0,"b":6.675,"l":16.7,"S":18.22,"A":2.45,"sweep":0.0,"Vmax":2137.0,"Mmax":2.0,"CD0":0.0172,"LD":9.2,"TWtab":0.57,"us":{"T":15600.0,"W0":27300.0,"We":13996.0,"b":21.9,"S":196.1,"Vmax":1328.0},"src":"Loftin TV"},
    {"id":"republic-f-105","name":"Republic F-105","full":"Republic F-105D","year":1955,"date":"1955-10-22","era":"jetfighter","role":"fighter","eng":"turbojet","engine":"1x J75 24500/10000","n":1,"T":109.0,"Tdry":44.48,"W0":22220.0,"Wmax":23970.0,"We":12180.0,"b":10.64,"l":19.6,"S":35.77,"A":3.16,"sweep":45.0,"Vmax":2208.0,"Mmax":2.08,"CD0":0.0173,"LD":10.4,"TWtab":0.5,"us":{"T":24500.0,"W0":48976.0,"We":26855.0,"b":34.9,"S":385.0,"Vmax":1372.0},"src":"Loftin TV"},
    {"id":"vought-f-8","name":"Vought F-8","full":"Vought F-8H","year":1955,"date":"1955-03-25","era":"jetfighter","role":"fighter","eng":"turbojet","engine":"1x J57 16600/12400","n":1,"T":73.84,"Tdry":55.16,"W0":13240.0,"Wmax":15510.0,"We":8482.0,"b":10.91,"l":16.52,"S":34.84,"A":3.42,"sweep":35.0,"Vmax":1860.0,"Mmax":1.75,"CD0":0.0133,"LD":12.8,"TWtab":0.57,"us":{"T":16600.0,"W0":29200.0,"We":18700.0,"b":35.8,"S":375.0,"Vmax":1156.0},"src":"Loftin TV"},
    {"id":"mcdonnell-f-4","name":"McDonnell F-4","full":"McDonnell F-4E","year":1958,"date":"1958-05-27","era":"jetfighter","role":"fighter","eng":"turbojet","engine":"2x J79 17900/11110","n":2,"T":159.2,"Tdry":98.84,"W0":24430.0,"Wmax":27960.0,"We":13400.0,"b":11.67,"l":19.2,"S":49.24,"A":2.77,"sweep":45.0,"Vmax":2390.0,"Mmax":2.25,"CD0":0.0224,"LD":8.58,"TWtab":0.66,"us":{"T":35800.0,"W0":53848.0,"We":29535.0,"b":38.3,"S":530.0,"Vmax":1485.0},"src":"Loftin TV"},
    {"id":"northrop-f-5e","name":"Northrop F-5E","full":"Northrop F-5E","year":1959,"date":"1959-07-30","era":"jetfighter","role":"fighter","eng":"turbojet","engine":"2x J85 5000/3500","n":2,"T":44.48,"Tdry":31.14,"W0":7142.0,"Wmax":9292.0,"We":4349.0,"b":8.169,"l":14.69,"S":17.28,"A":3.86,"sweep":24.0,"Vmax":1605.0,"Mmax":1.51,"CD0":0.02,"LD":10.0,"TWtab":0.64,"us":{"T":10000.0,"W0":15745.0,"We":9588.0,"b":26.8,"S":186.0,"Vmax":997.0},"src":"Loftin TV"},
    {"id":"general-dynamics-f-111","name":"General Dynamics F-111","full":"General Dynamics F-111D","year":1964,"date":"1964-12-21","era":"jetfighter","role":"fighter","eng":"turbofan","engine":"2x TF30 20840/12430","n":2,"T":185.4,"Tdry":110.6,"W0":37570.0,"Wmax":44840.0,"We":20940.0,"b":19.2,"l":22.4,"S":48.77,"A":7.56,"sweep":16.0,"Vmax":2338.0,"Mmax":2.2,"CD0":0.0186,"LD":15.8,"TWtab":0.5,"us":{"T":41680.0,"W0":82819.0,"We":46172.0,"b":63.0,"S":525.0,"Vmax":1453.0},"src":"Loftin TV","variableSweep":true},
    {"id":"grumman-f-14","name":"Grumman F-14","full":"Grumman F-14A","year":1970,"date":"1970-12-21","era":"jetfighter","role":"fighter","eng":"turbofan","engine":"2x TF30 20000/12500","n":2,"T":177.9,"Tdry":111.2,"W0":31910.0,"Wmax":33720.0,"We":18110.0,"b":19.54,"l":18.9,"S":52.49,"A":7.3,"sweep":20.0,"Vmax":2549.0,"Mmax":2.4,"TWtab":0.57,"us":{"T":40000.0,"W0":70345.0,"We":39930.0,"b":64.1,"S":565.0,"Vmax":1584.0},"src":"Loftin TV","variableSweep":true},
    {"id":"mcdonnell-douglas-f-15","name":"McDonnell Douglas F-15","full":"McDonnell Douglas F-15C","year":1972,"date":"1972-07-27","era":"jetfighter","role":"fighter","eng":"turbofan","engine":"2x F100 23904/14780","n":2,"T":212.7,"Tdry":131.5,"W0":20180.0,"Wmax":30840.0,"We":13020.0,"b":13.05,"l":19.45,"S":56.49,"A":3.01,"sweep":45.0,"Vmax":2697.0,"Mmax":2.54,"TWtab":1.07,"us":{"T":47808.0,"W0":44500.0,"We":28700.0,"b":42.8,"S":608.0,"Vmax":1676.0},"src":"Loftin TV"},
    {"id":"general-dynamics-f-16","name":"General Dynamics F-16","full":"General Dynamics F-16A","year":1974,"date":"1974-01-20","era":"jetfighter","role":"fighter","eng":"turbofan","engine":"1x F100 23830/14800","n":1,"T":106.0,"Tdry":65.83,"W0":10590.0,"Wmax":15650.0,"We":6607.0,"b":10.67,"l":14.51,"S":27.87,"A":4.08,"sweep":40.0,"Vmax":2145.0,"Mmax":2.02,"TWtab":1.02,"us":{"T":23830.0,"W0":23357.0,"We":14567.0,"b":35.0,"S":300.0,"Vmax":1333.0},"src":"Loftin TV"},
    {"id":"harrier-av-8a","name":"Harrier AV-8A","full":"BAe Harrier AV-8A","year":1960,"date":"1960-10-21","era":"jetfighter","role":"fighter","eng":"turbofan","engine":"1x Pegasus 21500","n":1,"T":95.64,"Tdry":95.64,"W0":8165.0,"Wmax":11790.0,"We":5507.0,"b":7.711,"l":14.51,"S":18.68,"A":3.18,"sweep":34.0,"Vmax":1159.0,"Mmax":0.95,"TWtab":1.19,"us":{"T":21500.0,"W0":18000.0,"We":12140.0,"b":25.3,"S":201.1,"Vmax":720.0},"src":"Loftin TV"},
    {"id":"de-havilland-comet","name":"de Havilland Comet","full":"DeHavilland Comet 1A","year":1949,"date":"1949-07-27","era":"jettransport","role":"transport","eng":"turbojet","engine":"4x DH Ghost 5000","n":4,"T":88.96,"W0":52160.0,"b":35.05,"l":28.35,"S":187.2,"A":6.6,"sweep":20.0,"Vc":788.6,"Mc":0.74,"R":2816.0,"pax":44,"LDtext":false,"TWtab":0.17,"us":{"T":20000.0,"W0":115000.0,"We":null,"b":115.0,"S":2015.0},"src":"Loftin TVII"},
    {"id":"tupolev-tu-104","name":"Tupolev Tu-104","full":"Tupolev Tu-104B","year":1955,"date":"1955-06-17","era":"jettransport","role":"transport","eng":"turbojet","engine":"2x Mikulin 21385","n":2,"T":190.3,"W0":76000.0,"WL":64000.0,"We":42500.0,"b":34.53,"l":40.08,"S":183.5,"A":6.5,"sweep":40.0,"Vc":949.5,"Mc":0.85,"Mce":0.75,"Vce":799.8,"Vs":204.4,"R":2414.0,"Wp":12000.0,"Rff":3563.0,"pax":100,"LDtext":false,"TWtab":0.26,"us":{"T":42770.0,"W0":167551.0,"We":93696.0,"b":113.3,"S":1975.0},"src":"Loftin TVII"},
    {"id":"boeing-367-80-dash-80","name":"Boeing 367-80 (Dash 80)","full":"Boeing 367-80","year":1954,"date":"1954-07-15","era":"jettransport","role":"transport","eng":"turbojet","engine":"4x JT3C 10000","n":4,"T":177.9,"W0":86180.0,"We":41780.0,"b":39.56,"l":38.95,"S":223.0,"A":7.0,"sweep":35.0,"Vc":885.1,"Wp":11340.0,"LDtext":false,"TWtab":0.21,"us":{"T":40000.0,"W0":190000.0,"We":92120.0,"b":129.8,"S":2400.0},"src":"Loftin TVII"},
    {"id":"boeing-707-320b","name":"Boeing 707-320B","full":"Boeing 707-320B","year":1959,"date":"1959","era":"jettransport","role":"transport","eng":"turbofan","engine":"4x JT3D-7 19000","n":4,"T":338.1,"W0":152400.0,"WL":112000.0,"We":66680.0,"b":44.44,"l":46.57,"S":279.6,"A":7.1,"sweep":35.0,"Vc":954.3,"Mc":0.87,"Mce":0.83,"Vce":885.1,"Vs":194.7,"R":10040.0,"Wp":24450.0,"Rff":12830.0,"pax":189,"LD":19.25,"LDtext":true,"TWtab":0.23,"us":{"T":76000.0,"W0":336000.0,"We":147000.0,"b":145.8,"S":3010.0},"src":"Loftin TVII"},
    {"id":"douglas-dc-8-63","name":"Douglas DC-8-63","full":"McDonnell Douglas DC-8 Super 63","year":1958,"date":"1958","era":"jettransport","role":"transport","eng":"turbofan","engine":"4x JT3D-7 19000","n":4,"T":338.1,"W0":162400.0,"WL":111100.0,"We":71800.0,"b":45.23,"l":57.15,"S":271.9,"A":7.5,"sweep":30.6,"Vc":959.2,"Mc":0.87,"Mce":0.82,"Vce":875.5,"Vs":197.9,"R":7857.0,"Wp":30720.0,"Rff":11260.0,"pax":259,"LD":17.9,"LDtext":true,"TWtab":0.21,"us":{"T":76000.0,"W0":358000.0,"We":158300.0,"b":148.4,"S":2926.8},"src":"Loftin TVII"},
    {"id":"sud-aviation-caravelle","name":"Sud Aviation Caravelle","full":"Sud-Aviation Caravelle VI-R","year":1955,"date":"1955-05-27","era":"jettransport","role":"transport","eng":"turbojet","engine":"2x RR Avon 12000","n":2,"T":106.8,"W0":52000.0,"WL":47620.0,"We":27210.0,"b":34.29,"l":32.0,"S":146.7,"A":8.0,"sweep":20.0,"Vc":846.5,"Mc":0.76,"Mce":0.74,"Vce":785.4,"R":2943.0,"Wp":7620.0,"pax":80,"LDtext":false,"TWtab":0.21,"us":{"T":24000.0,"W0":114640.0,"We":59985.0,"b":112.5,"S":1579.0},"src":"Loftin TVII"},
    {"id":"boeing-727-200","name":"Boeing 727-200","full":"Boeing 727-200","year":1963,"date":"1963","era":"jettransport","role":"transport","eng":"turbofan","engine":"3x JT8D-17 16000","n":3,"T":213.5,"W0":95250.0,"WL":72570.0,"We":46720.0,"b":32.92,"l":46.7,"S":153.3,"A":7.1,"sweep":32.0,"Vc":981.7,"Mc":0.88,"Mce":0.82,"Vce":883.5,"Vs":194.7,"R":5367.0,"Wp":18600.0,"Rff":6016.0,"pax":189,"LDtext":false,"TWtab":0.23,"us":{"T":48000.0,"W0":210000.0,"We":103000.0,"b":108.0,"S":1650.0},"src":"Loftin TVII"},
    {"id":"douglas-dc-9-30","name":"Douglas DC-9-30","full":"McDonnell Douglas DC-9-30","year":1965,"date":"1965","era":"jettransport","role":"transport","eng":"turbofan","engine":"2x JT8D-15 15500","n":2,"T":137.9,"W0":49440.0,"WL":44910.0,"We":25400.0,"b":28.44,"l":36.36,"S":93.0,"A":8.7,"sweep":24.5,"Vc":930.2,"Mc":0.84,"Mce":0.78,"Vce":840.1,"Vs":193.1,"R":2916.0,"Wp":14060.0,"Rff":3557.0,"pax":115,"LDtext":false,"TWtab":0.28,"us":{"T":31000.0,"W0":109000.0,"We":56000.0,"b":93.3,"S":1001.0},"src":"Loftin TVII"},
    {"id":"boeing-737-200","name":"Boeing 737-200","full":"Boeing 737-200","year":1967,"date":"1967","era":"jettransport","role":"transport","eng":"turbofan","engine":"2x JT8D-17 16000","n":2,"T":142.3,"W0":53300.0,"WL":47630.0,"We":27660.0,"b":28.35,"l":30.48,"S":91.04,"A":8.8,"sweep":25.0,"Vc":907.7,"Mc":0.81,"Mce":0.75,"Vce":806.3,"Vs":186.7,"R":2813.0,"Wp":15420.0,"Rff":4960.0,"pax":130,"LDtext":false,"TWtab":0.27,"us":{"T":32000.0,"W0":117500.0,"We":60980.0,"b":93.0,"S":980.0},"src":"Loftin TVII"},
    {"id":"vickers-vc10","name":"Vickers VC10","full":"BAC VC-10","year":1962,"date":"1962-06-29","era":"jettransport","role":"transport","eng":"turbofan","engine":"4x RR Conway 21000","n":4,"T":373.7,"W0":142400.0,"WL":97980.0,"We":66670.0,"b":43.34,"l":48.4,"S":272.4,"A":6.9,"sweep":32.5,"Vc":914.1,"Mce":0.83,"Vce":885.1,"Vs":222.1,"R":8111.0,"Wp":18040.0,"pax":151,"LDtext":false,"TWtab":0.27,"us":{"T":84000.0,"W0":314000.0,"We":146979.0,"b":142.2,"S":2932.0},"src":"Loftin TVII"},
    {"id":"boeing-747-200b","name":"Boeing 747-200B","full":"Boeing 747-200B","year":1969,"date":"1969-02-09","era":"jettransport","role":"transport","eng":"turbofan","engine":"4x JT9D-7R4G2 54750","n":4,"T":974.2,"W0":379200.0,"WL":255800.0,"We":173300.0,"b":59.68,"l":70.41,"S":511.0,"A":7.0,"sweep":37.5,"Vc":938.2,"Mce":0.85,"Vce":907.7,"Vs":201.2,"R":11030.0,"Wp":65550.0,"Rff":14010.0,"pax":550,"LD":18,"LDtext":true,"TWtab":0.26,"us":{"T":219000.0,"W0":836000.0,"We":382130.0,"b":195.8,"S":5500.0},"src":"Loftin TVII"},
    {"id":"lockheed-l-1011","name":"Lockheed L-1011","full":"Lockheed L-1011-200","year":1970,"date":"1970-11-16","era":"jettransport","role":"transport","eng":"turbofan","engine":"3x RB.211-524 48000","n":3,"T":640.5,"W0":212300.0,"WL":166900.0,"We":111500.0,"b":47.34,"l":54.16,"S":321.1,"A":7.0,"sweep":35.0,"Vc":976.9,"Mc":0.9,"Mce":0.84,"Vce":912.5,"Vs":201.2,"R":7860.0,"Wp":33660.0,"Rff":9984.0,"pax":400,"LD":17.25,"LDtext":true,"TWtab":0.31,"us":{"T":144000.0,"W0":468000.0,"We":245800.0,"b":155.3,"S":3456.0},"src":"Loftin TVII"},
    {"id":"douglas-dc-10-30","name":"Douglas DC-10-30","full":"McDonnell Douglas DC-10-30","year":1970,"date":"1970-08","era":"jettransport","role":"transport","eng":"turbofan","engine":"3x CF6-50C1 52500","n":3,"T":700.6,"W0":260800.0,"WL":182800.0,"We":118600.0,"b":50.38,"l":55.35,"S":338.8,"A":7.5,"sweep":35.0,"Vc":954.3,"Mc":0.88,"Mce":0.85,"Vce":923.8,"R":7810.0,"Wp":48330.0,"Rff":10130.0,"pax":386,"LD":17.25,"LDtext":true,"TWtab":0.27,"us":{"T":157500.0,"W0":575000.0,"We":261459.0,"b":165.3,"S":3647.0},"src":"Loftin TVII"},
    {"id":"boeing-767-200","name":"Boeing 767-200","full":"Boeing 767-200","year":1981,"date":"1981-09","era":"jettransport","role":"transport","eng":"turbofan","engine":"2x JT9D-7R4E 50000","n":2,"T":444.8,"W0":152900.0,"WL":126100.0,"We":81750.0,"b":47.58,"l":48.52,"S":283.4,"A":8.0,"sweep":31.5,"Vc":896.4,"Mc":0.84,"Mce":0.8,"Vce":849.7,"Vs":196.3,"R":6616.0,"Wp":33010.0,"Rff":9643.0,"pax":290,"LD":18,"LDtext":true,"TWtab":0.3,"us":{"T":100000.0,"W0":337000.0,"We":180230.0,"b":156.1,"S":3050.0},"src":"Loftin TVII"},
    {"id":"boeing-757-200","name":"Boeing 757-200","full":"Boeing 757-200","year":1982,"date":"1982-02","era":"jettransport","role":"transport","eng":"turbofan","engine":"2x PW2037 38200","n":2,"T":339.8,"W0":109300.0,"WL":89810.0,"We":58080.0,"b":37.95,"l":47.34,"S":181.3,"A":7.9,"sweep":25.0,"Vc":902.8,"Mc":0.83,"Mce":0.8,"Vce":849.7,"Vs":188.3,"R":6033.0,"Wp":25420.0,"Rff":8513.0,"pax":239,"LDtext":false,"TWtab":0.32,"us":{"T":76400.0,"W0":241000.0,"We":128050.0,"b":124.5,"S":1951.0},"src":"Loftin TVII"},
    {"id":"lockheed-c-5a","name":"Lockheed C-5A","full":"Lockheed C-5A","year":1968,"date":"1968-06-30","era":"jettransport","role":"transport","eng":"turbofan","engine":"4x TF-39 41000","n":4,"T":729.5,"W0":348800.0,"WL":288400.0,"b":67.91,"l":75.53,"S":576.0,"A":8.0,"sweep":25.0,"Vc":870.7,"Mc":0.78,"Vs":193.1,"R":6025.0,"Wp":100200.0,"Rff":10490.0,"LDtext":false,"TWtab":0.21,"us":{"T":164000.0,"W0":769000.0,"We":null,"b":222.8,"S":6200.0},"src":"Loftin TVII"}
  ];

  AERO.ERAS = [
    { id: 'pioneer', label: 'Pioneers (to 1913)', color: 'ink', years: '1903' },
    { id: 'ww1', label: 'First World War', color: 'r', years: '1914–18' },
    { id: 'interwar', label: 'Between the wars', color: 't', years: '1919–38' },
    { id: 'ww2', label: 'Second World War', color: 'z', years: '1939–45' },
    { id: 'postwar', label: 'Postwar propeller', color: 'good', years: '1945–72' },
    { id: 'jetfighter', label: 'Jet fighters', color: 'v', years: '1942–74' },
    { id: 'jettransport', label: 'Jet transports', color: 'warn', years: '1949–82' }
  ];
  var ERA = {};
  AERO.ERAS.forEach(function (e) { ERA[e.id] = e; });
  AERO.era = function (id) { return ERA[id] || null; };
  var BYID = {};
  AERO.DATA.forEach(function (d) { BYID[d.id] = d; });
  AERO.byId = function (id) { return BYID[id] || null; };
  AERO.ROLES = { fighter: 'Fighter', bomber: 'Bomber', transport: 'Transport', ga: 'General aviation', racer: 'Racer', other: 'Other' };

  AERO.derive = function (a) {
    var W = a.W0 * AERO.G, o = {};
    o.WSkg = a.W0 / a.S;
    o.WS = W / a.S;
    o.WSus = o.WSkg * AERO.U.FT2 / AERO.U.LB;
    if (a.P) { o.PW = a.P / a.W0; o.WP = a.W0 / a.P; o.WPus = (a.W0 / AERO.U.LB) / (a.P / AERO.U.HP); }
    if (a.T) o.TW = a.T * 1000 / W;
    if (a.We) o.WeW0 = a.We / a.W0;
    if (a.CD0 && a.A) o.LDest = 0.5 * Math.sqrt(Math.PI * a.A * 0.75 / a.CD0);
    if (a.CD0) o.f = a.CD0 * a.S;
    return o;
  };

  /* ================================================================ Standard atmosphere (ISA, SI) */
  AERO.isa = function (h) {
    h = Math.max(0, Math.min(20000, +h || 0));
    var T0 = 288.15, p0 = 101325, L = 0.0065, R = 287.05, g0 = 9.80665, T, p;
    if (h <= 11000) { T = T0 - L * h; p = p0 * Math.pow(T / T0, g0 / (L * R)); }
    else { T = 216.65; var p11 = p0 * Math.pow(T / T0, g0 / (L * R)); p = p11 * Math.exp(-g0 * (h - 11000) / (R * T)); }
    var rho = p / (R * T);
    return { T: T, p: p, rho: rho, a: Math.sqrt(1.4 * R * T), sigma: rho / 1.225 };
  };

  /* ================================================================ Charts */
  function niceStep(span, n) {
    var raw = span / Math.max(1, n), mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
  }
  function linTicks(a, b, n) {
    var st = niceStep(b - a, n), out = [], v = Math.ceil(a / st - 1e-9) * st;
    for (; v <= b + st * 1e-9; v += st) out.push(Math.abs(v) < st * 1e-9 ? 0 : +v.toPrecision(12));
    return out;
  }
  function logTicks(a, b) {
    var out = [], lo = Math.floor(Math.log10(a)), hi = Math.ceil(Math.log10(b)), mults = hi - lo > 3 ? [1] : hi - lo > 1 ? [1, 2, 5] : [1, 2, 3, 5, 7];
    for (var k = lo; k <= hi; k++) mults.forEach(function (m) { var v = m * Math.pow(10, k); if (v >= a * 0.999 && v <= b * 1.001) out.push(+v.toPrecision(12)); });
    return out;
  }
  function tickText(v) {
    var a = Math.abs(v);
    if (a >= 1e6 || (a > 0 && a < 1e-3)) return fmt(v, 2);
    if (a >= 1e4) return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return fmt(v, 4);
  }

  AERO.chart = function (container, opts) {
    opts = opts || {};
    if (!container) { report('chart: no container'); return null; }
    if (!opts.ariaLabel) report('chart: ariaLabel is required');
    var C = { opts: opts, x: Object.assign({}, opts.x), y: Object.assign({}, opts.y) };
    var pad = Object.assign({ l: 58, r: 16, t: 14, b: 28 }, opts.pad);
    var ySide = opts.yLabelSide !== false;
    var wrap = document.createElement('div');
    wrap.className = 'aero-chart' + (ySide ? ' yside' : '');
    var svg = el('svg', { role: 'img', 'aria-label': opts.ariaLabel || 'Chart', focusable: 'false' });
    wrap.appendChild(svg);
    var tip = document.createElement('div');
    tip.className = 'aero-tip';
    tip.hidden = true;
    wrap.appendChild(tip);
    var xLab = document.createElement('div'), yLab = document.createElement('div');
    xLab.className = 'aero-axlabel x'; yLab.className = 'aero-axlabel y';
    wrap.appendChild(xLab); wrap.appendChild(yLab);
    var legend = null;
    if (opts.legend) {
      legend = document.createElement('ul');
      legend.className = 'aero-legend';
      wrap.appendChild(legend);
    }
    container.appendChild(wrap);
    C.el = wrap; C.svg = svg;
    var gGrid = el('g', { class: 'aero-grid' }), gPlot = el('g'), gTop = el('g');
    var clipId = 'aeroclip' + (++AERO._n);
    var clip = el('clipPath', { id: clipId }), clipRect = el('rect');
    clip.appendChild(clipRect);
    var defs = el('defs'); defs.appendChild(clip);
    svg.appendChild(defs); svg.appendChild(gGrid); svg.appendChild(gPlot); svg.appendChild(gTop);
    gPlot.setAttribute('clip-path', 'url(#' + clipId + ')');
    var items = [];
    var W = 600, H = opts.height || 360;

    function setLabel(node, html) {
      node.innerHTML = html || '';
      if (global.CYL && CYL.renderMath) CYL.renderMath(node);
    }
    function sx(v) {
      var a = C.x;
      if (a.log) return pad.l + (Math.log(v) - Math.log(a.min)) / (Math.log(a.max) - Math.log(a.min)) * (W - pad.l - pad.r);
      return pad.l + (v - a.min) / (a.max - a.min) * (W - pad.l - pad.r);
    }
    function sy(v) {
      var a = C.y;
      if (a.log) return H - pad.b - (Math.log(v) - Math.log(a.min)) / (Math.log(a.max) - Math.log(a.min)) * (H - pad.t - pad.b);
      return H - pad.b - (v - a.min) / (a.max - a.min) * (H - pad.t - pad.b);
    }
    function ok(v, a) { return v != null && isFinite(v) && (!a.log || v > 0); }
    C.toPx = function (p) { return [sx(p[0]), sy(p[1])]; };
    C.inView = function (p) { return ok(p[0], C.x) && ok(p[1], C.y) && p[0] >= C.x.min && p[0] <= C.x.max && p[1] >= C.y.min && p[1] <= C.y.max; };

    function textWidth(s, fs) {                  // rendered width of a tick label (estimated if not yet shown)
      var t = el('text', { 'font-size': fs }), w = 0;
      t.textContent = s; gGrid.appendChild(t);
      try { w = t.getComputedTextLength(); } catch (e) { w = 0; }
      gGrid.removeChild(t);
      return w || String(s).length * fs * 0.6;
    }
    function drawAxes() {
      while (gGrid.firstChild) gGrid.removeChild(gGrid.firstChild);
      var fs = W < 420 ? 10.5 : 11.5;
      var yt = C.y.ticks || (C.y.log ? logTicks(C.y.min, C.y.max) : linTicks(C.y.min, C.y.max, H < 260 ? 4 : 6));
      setLabel(xLab, C.x.label); setLabel(yLab, C.y.label);
      if (ySide) {                               // the label runs up the axis, just outside the widest tick label
        var tw = 0, lh = yLab.offsetHeight || 16;
        yt.forEach(function (v) { if (v >= C.y.min && v <= C.y.max) tw = Math.max(tw, textWidth(C.y.format ? C.y.format(v) : tickText(v), fs)); });
        pad.l = Math.ceil(3 + lh + 5 + tw + 7);
        yLab.classList.add('side');
        yLab.style.left = (3 + lh / 2) + 'px';
        yLab.style.top = ((parseFloat(getComputedStyle(wrap).paddingTop) || 0) + pad.t + (H - pad.t - pad.b) / 2) + 'px';
      }
      clipRect.setAttribute('x', pad.l); clipRect.setAttribute('y', pad.t);
      clipRect.setAttribute('width', Math.max(0, W - pad.l - pad.r)); clipRect.setAttribute('height', Math.max(0, H - pad.t - pad.b));
      gGrid.appendChild(el('rect', { x: pad.l, y: pad.t, width: W - pad.l - pad.r, height: H - pad.t - pad.b, fill: 'none', stroke: paint('line') }));
      var xt = C.x.ticks || (C.x.log ? logTicks(C.x.min, C.x.max) : linTicks(C.x.min, C.x.max, W < 420 ? 4 : 7));
      var lastRight = -1e9;
      xt.forEach(function (v) {
        if (v < C.x.min || v > C.x.max) return;
        var X = sx(v);
        gGrid.appendChild(el('line', { x1: X, x2: X, y1: pad.t, y2: H - pad.b, stroke: paint('grid'), 'stroke-width': 1 }));
        var s = C.x.format ? C.x.format(v) : tickText(v);
        var half = s.length * fs * 0.3;
        if (X - half < lastRight + 6) return;
        lastRight = X + half;
        var t = el('text', { x: X, y: H - pad.b + fs + 6, 'text-anchor': 'middle', 'font-size': fs, fill: paint('muted') });
        t.textContent = s; gGrid.appendChild(t);
      });
      yt.forEach(function (v) {
        if (v < C.y.min || v > C.y.max) return;
        var Y = sy(v);
        gGrid.appendChild(el('line', { x1: pad.l, x2: W - pad.r, y1: Y, y2: Y, stroke: paint('grid'), 'stroke-width': 1 }));
        var t = el('text', { x: pad.l - 7, y: Y + fs * 0.35, 'text-anchor': 'end', 'font-size': fs, fill: paint('muted') });
        t.textContent = C.y.format ? C.y.format(v) : tickText(v); gGrid.appendChild(t);
      });
      xLab.style.marginLeft = (pad.l / W * 100) + '%'; xLab.style.marginRight = (pad.r / W * 100) + '%';
    }
    function size() {
      var w = Math.round(wrap.clientWidth || container.clientWidth || 600);
      W = Math.max(260, w);
      H = opts.height || 360;
      if (W < 480) H = Math.round(H * 0.86);
      pad.l = W < 420 ? 48 : (opts.pad && opts.pad.l) || 58;   // replaced in drawAxes when the y label is on the side
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      svg.setAttribute('width', W); svg.setAttribute('height', H);
    }
    C.redraw = function () {
      size(); drawAxes();
      items.forEach(function (it) { it.draw(); });
    };

    function shapePath(shape, r) {
      if (shape === 'tri') { var h = r * 1.25; return 'M0,' + (-h) + ' L' + (h * 0.95) + ',' + (h * 0.7) + ' L' + (-h * 0.95) + ',' + (h * 0.7) + ' Z'; }
      if (shape === 'square') return 'M' + (-r * 0.85) + ',' + (-r * 0.85) + ' h' + (r * 1.7) + ' v' + (r * 1.7) + ' h' + (-r * 1.7) + ' Z';
      if (shape === 'diamond') return 'M0,' + (-r * 1.2) + ' L' + (r * 1.2) + ',0 L0,' + (r * 1.2) + ' L' + (-r * 1.2) + ',0 Z';
      return 'M' + (-r) + ',0 a' + r + ',' + r + ' 0 1,0 ' + (2 * r) + ',0 a' + r + ',' + r + ' 0 1,0 ' + (-2 * r) + ',0';
    }
    AERO.shapePath = shapePath;

    function showTip(html, px, py) {
      tip.innerHTML = html;
      if (global.CYL && CYL.renderMath) CYL.renderMath(tip);
      tip.hidden = false;
      var bw = wrap.clientWidth, sc = bw / W, tw = tip.offsetWidth, th = tip.offsetHeight;
      var L = px * sc + 12, T = py * sc - th - 10;
      if (L + tw > bw - 4) L = px * sc - tw - 12;
      if (L < 4) L = 4;
      if (T < 4) T = py * sc + 14;
      tip.style.left = L + 'px'; tip.style.top = T + 'px';
    }
    function hideTip() { tip.hidden = true; }
    C.hideTip = hideTip;
    wrap.addEventListener('mouseleave', hideTip);

    function make(drawFn, o) {
      var g = el('g');
      (o && o.top ? gTop : gPlot).appendChild(g);
      var h = { g: g, visible: true, draw: function () { while (g.firstChild) g.removeChild(g.firstChild); if (h.visible) drawFn(g); } };
      h.setVisible = function (v) { h.visible = !!v; h.draw(); return h; };
      h.remove = function () { var i = items.indexOf(h); if (i >= 0) items.splice(i, 1); if (g.parentNode) g.parentNode.removeChild(g); };
      items.push(h);
      return h;
    }

    C.points = function (list, o) {
      o = o || {};
      var data = list || [];
      var h = make(function (g) {
        var r = o.r || 5, labels = [];
        data.forEach(function (d) {
          var X = o.x(d), Y = o.y(d);
          if (!ok(X, C.x) || !ok(Y, C.y)) return;
          var px = sx(X), py = sy(Y);
          if (px < pad.l - 1 || px > W - pad.r + 1 || py < pad.t - 1 || py > H - pad.b + 1) return;
          var col = paint(typeof o.color === 'function' ? o.color(d) : o.color || 'accent');
          var sh = typeof o.shape === 'function' ? o.shape(d) : o.shape || 'circle';
          var dim = o.dim && o.dim(d);
          var p = el('path', { d: shapePath(sh, r), transform: 'translate(' + px.toFixed(1) + ',' + py.toFixed(1) + ')', fill: col, 'fill-opacity': dim ? 0.18 : 0.78,
            stroke: col, 'stroke-width': 1.4, 'stroke-opacity': dim ? 0.35 : 1, class: 'aero-pt' });
          if (o.title) {
            var show = function () { showTip(o.title(d), px, py); };
            p.addEventListener('mouseenter', show);
            p.addEventListener('click', function (e) { show(); if (o.onClick) o.onClick(d, e); });
          } else if (o.onClick) p.addEventListener('click', function (e) { o.onClick(d, e); });
          if (o.onClick || o.title) p.style.cursor = 'pointer';
          g.appendChild(p);
          var lab = o.label ? o.label(d) : null;
          if (lab) labels.push({ px: px, py: py, text: lab, col: col });
        });
        // Each label goes above-right of its point (above-left near the right edge). If that would cover a label
        // already placed, try the other side, then below; if nothing fits, leave it off (the tooltip still names it).
        var placed = [];
        labels.forEach(function (L) {
          var fs = W < 420 ? 10 : 11, w = String(L.text).length * fs * 0.6 + 2, left = L.px > W - pad.r - 110;
          var spots = [[8, -6, 'start'], [-8, -6, 'end'], [8, 14, 'start'], [-8, 14, 'end']];
          if (left) spots = [spots[1], spots[3], spots[0], spots[2]];
          var pick = null;
          for (var k = 0; k < spots.length && !pick; k++) {
            var s = spots[k], x0 = s[2] === 'start' ? L.px + s[0] : L.px + s[0] - w, box = [x0, L.py + s[1] - fs, x0 + w, L.py + s[1] + 2];
            if (box[0] < pad.l || box[2] > W - pad.r) continue;   // stay clear of the tick labels
            if (!placed.some(function (b) { return box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]; })) pick = { s: s, box: box };
          }
          if (!pick) return;
          placed.push(pick.box);
          var t = el('text', { x: L.px + pick.s[0], y: L.py + pick.s[1], 'text-anchor': pick.s[2], 'font-size': fs, 'font-weight': 600, fill: paint('ink'), class: 'aero-ptlabel' });
          t.textContent = L.text;
          g.appendChild(t);
        });
      }, o);
      h.set = function (l) { data = l || []; h.draw(); return h; };
      h.draw();
      return h;
    };

    C.fn = function (f, o) {
      o = o || {};
      var fun = f;
      var h = make(function (g) {
        var a = Math.max(C.x.min, o.domain ? o.domain[0] : -Infinity), b = Math.min(C.x.max, o.domain ? o.domain[1] : Infinity);
        if (!(b > a)) return;
        var n = o.samples || 160, d = '', pen = false, last = null;
        for (var i = 0; i <= n; i++) {
          var x = C.x.log ? Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * i / n) : a + (b - a) * i / n, y;
          try { y = fun(x); } catch (e) { y = NaN; }
          if (!ok(y, C.y) || y < C.y.min - (C.y.max - C.y.min) * 2 || y > C.y.max + (C.y.max - C.y.min) * 2) { pen = false; continue; }
          var X = sx(x), Y = sy(y);
          d += (pen ? 'L' : 'M') + X.toFixed(1) + ',' + Y.toFixed(1);
          pen = true; last = [X, Y, x, y];
        }
        if (!d) return;
        g.appendChild(el('path', { d: d, fill: 'none', stroke: paint(o.color || 'accent'), 'stroke-width': o.width || 2, 'stroke-dasharray': o.dashed ? '6 5' : null, 'stroke-linejoin': 'round' }));
        if (o.label) {
          var at = o.labelAt != null ? o.labelAt : null, X2 = last[0], Y2 = last[1];
          if (at != null) { var yy = fun(at); if (ok(yy, C.y)) { X2 = sx(at); Y2 = sy(yy); } }
          var t = el('text', { x: X2 - 4, y: Y2 - 7, 'text-anchor': 'end', 'font-size': 11.5, 'font-weight': 700, fill: paint(o.color || 'accent') });
          t.textContent = o.label; g.appendChild(t);
        }
      }, o);
      h.setFn = function (nf) { fun = nf; h.draw(); return h; };
      h.draw();
      return h;
    };

    C.polyline = function (pts, o) {
      o = o || {};
      var P = pts || [];
      var h = make(function (g) {
        var d = '';
        P.forEach(function (p, i) { if (!ok(p[0], C.x) || !ok(p[1], C.y)) return; d += (d ? 'L' : 'M') + sx(p[0]).toFixed(1) + ',' + sy(p[1]).toFixed(1); });
        if (!d) return;
        if (o.closed) d += 'Z';
        g.appendChild(el('path', { d: d, fill: o.fill ? paint(o.fill) : 'none', 'fill-opacity': o.fill ? (o.fillOpacity == null ? 0.15 : o.fillOpacity) : null,
          stroke: o.width === 0 ? 'none' : paint(o.color || 'accent'), 'stroke-width': o.width || 2, 'stroke-dasharray': o.dashed ? '6 5' : null, 'stroke-linejoin': 'round' }));
      }, o);
      h.set = function (p) { P = p || []; h.draw(); return h; };
      h.draw();
      return h;
    };

    function refLine(isX, v, o) {
      o = o || {};
      var val = v;
      var h = make(function (g) {
        if (!ok(val, isX ? C.x : C.y)) return;
        var X1, X2, Y1, Y2;
        if (isX) { X1 = X2 = sx(val); Y1 = pad.t; Y2 = H - pad.b; } else { Y1 = Y2 = sy(val); X1 = pad.l; X2 = W - pad.r; }
        g.appendChild(el('line', { x1: X1, x2: X2, y1: Y1, y2: Y2, stroke: paint(o.color || 'muted'), 'stroke-width': o.width || 1.5, 'stroke-dasharray': o.dashed === false ? null : '5 4' }));
        if (o.label) {
          var t = el('text', isX ? { x: X1 + 5, y: pad.t + 14 + (o.labelDy || 0), 'font-size': 11.5, 'font-weight': 600, fill: paint(o.color || 'muted') } : { x: W - pad.r - 5, y: Y1 - 6, 'text-anchor': 'end', 'font-size': 11.5, 'font-weight': 600, fill: paint(o.color || 'muted') });
          t.textContent = o.label; g.appendChild(t);
        }
      }, o);
      h.set = function (nv) { val = nv; h.draw(); return h; };
      h.draw();
      return h;
    }
    C.vline = function (x, o) { return refLine(true, x, o); };
    C.hline = function (y, o) { return refLine(false, y, o); };

    C.marker = function (p, o) {
      o = Object.assign({ top: true }, o);
      var P = p;
      var h = make(function (g) {
        if (!P || !ok(P[0], C.x) || !ok(P[1], C.y)) return;
        var X = sx(P[0]), Y = sy(P[1]), col = paint(o.color || 'accent');
        if (X < pad.l - 2 || X > W - pad.r + 2 || Y < pad.t - 2 || Y > H - pad.b + 2) return;
        if (o.ring !== false) g.appendChild(el('circle', { cx: X, cy: Y, r: (o.r || 6) + 5, fill: 'none', stroke: col, 'stroke-width': 2 }));
        g.appendChild(el('path', { d: shapePath(o.shape || 'circle', o.r || 6), transform: 'translate(' + X + ',' + Y + ')', fill: col, stroke: paint('bg'), 'stroke-width': 1.5 }));
        if (o.label) {
          var left = X > W - pad.r - 120, t = el('text', { x: X + (left ? -14 : 14), y: Y + 4, 'text-anchor': left ? 'end' : 'start', 'font-size': 12, 'font-weight': 700, fill: col, class: 'aero-ptlabel' });
          t.textContent = typeof o.label === 'function' ? o.label() : o.label; g.appendChild(t);
        }
      }, o);
      h.set = function (np) { P = np; h.draw(); return h; };
      h.setLabel = function (l) { o.label = l; h.draw(); return h; };
      h.draw();
      return h;
    };

    C.text = function (p, s, o) {
      o = o || {};
      var P = p, S = s;
      var h = make(function (g) {
        if (!P || !ok(P[0], C.x) || !ok(P[1], C.y)) return;
        var t = el('text', { x: sx(P[0]) + (o.dx || 0), y: sy(P[1]) + (o.dy || 0), 'text-anchor': o.anchor || 'start', 'font-size': o.size || 11.5, 'font-weight': o.weight || 600, fill: paint(o.color || 'muted') });
        t.textContent = S; g.appendChild(t);
      }, Object.assign({ top: true }, o));
      h.set = function (np, ns) { P = np; if (ns != null) S = ns; h.draw(); return h; };
      h.draw();
      return h;
    };

    C.setAxes = function (ax) {
      if (ax.x) C.x = Object.assign({}, C.x, ax.x);
      if (ax.y) C.y = Object.assign({}, C.y, ax.y);
      hideTip();
      C.redraw();
    };
    C.setAriaLabel = function (s) { svg.setAttribute('aria-label', s); };
    C.clear = function () { items.slice().forEach(function (h) { h.remove(); }); hideTip(); };
    C.setLegend = function (list) {
      if (!legend) { legend = document.createElement('ul'); legend.className = 'aero-legend'; wrap.appendChild(legend); }
      legend.innerHTML = '';
      (list || []).forEach(function (L) {
        var li = document.createElement('li');
        var s = el('svg', { viewBox: '-8 -8 16 16', width: 14, height: 14, 'aria-hidden': 'true' });
        if (L.line) s.appendChild(el('line', { x1: -7, x2: 7, y1: 0, y2: 0, stroke: paint(L.color), 'stroke-width': 2.5, 'stroke-dasharray': L.dashed ? '4 3' : null }));
        else s.appendChild(el('path', { d: shapePath(L.shape || 'circle', 5), fill: paint(L.color), 'fill-opacity': 0.78, stroke: paint(L.color), 'stroke-width': 1.4 }));
        li.appendChild(s);
        var sp = document.createElement('span'); sp.innerHTML = L.label; li.appendChild(sp);
        legend.appendChild(li);
      });
      if (global.CYL && CYL.renderMath) CYL.renderMath(legend);
    };
    if (opts.legend) C.setLegend(opts.legend);

    size(); drawAxes();
    var lastW = 0;
    if (global.ResizeObserver) {
      new ResizeObserver(function () {
        var w = Math.round(wrap.clientWidth);
        if (w && Math.abs(w - lastW) > 2) { lastW = w; C.redraw(); }
      }).observe(wrap);
    } else global.addEventListener('resize', function () { C.redraw(); });
    return C;
  };
  AERO._n = 0;

  /* ================================================================ Geometry and planforms (schematic, to scale) */
  // Per-aircraft layout notes that the tables do not give. Anything missing is inferred from the era and role.
  var LAYOUT = {
    'wright-flyer': { special: 'wright' },
    'fokker-dr-i': { planes: 3, taper: 1 }, 'caproni-ca-42': { planes: 3, taper: 1, engines: 3 },
    'fokker-e-iii': { planes: 1, taper: 1 }, 'fokker-d-viii': { planes: 1, taper: 0.7 }, 'junkers-d-i': { planes: 1, taper: 0.6 },
    'junkers-j-i': { planes: 2 }, 'nieuport-17': { planes: 2 },
    'spirit-of-st-louis': { planes: 1, taper: 1 }, 'lockheed-vega': { planes: 1, taper: 0.55 }, 'ford-trimotor': { planes: 1, taper: 0.55, engines: 3 },
    'curtiss-robin': { planes: 1, taper: 1 }, 'boeing-p-26': { planes: 1, taper: 0.6 }, 'piper-cub': { planes: 1, taper: 1 }, 'stinson-reliant': { planes: 1, taper: 0.6 },
    'douglas-dc-3': { taper: 0.4, sweepLE: 15 }, 'boeing-247': { taper: 0.45 }, 'boeing-b-17': { taper: 0.4, engines: 4 },
    'boeing-b-29': { taper: 0.38 }, 'consolidated-b-24': { taper: 0.38 }, 'lockheed-p-38': { special: 'twinboom' },
    'boeing-707-320b': { podded: 4 }, 'douglas-dc-8-63': { podded: 4 }, 'boeing-747-200b': { podded: 4, fuseW: 6.5 }, 'lockheed-c-5a': { podded: 4, fuseW: 6.4, ttail: true },
    'boeing-367-80-dash-80': { podded: 4 }, 'de-havilland-comet': { buried: 4 }, 'tupolev-tu-104': { buried: 2 },
    'sud-aviation-caravelle': { aft: 2 }, 'douglas-dc-9-30': { aft: 2, ttail: true }, 'vickers-vc10': { aft: 4, ttail: true }, 'boeing-727-200': { aft: 3, ttail: true },
    'boeing-737-200': { podded: 2 }, 'boeing-757-200': { podded: 2 }, 'boeing-767-200': { podded: 2, fuseW: 5.03 },
    'lockheed-l-1011': { podded: 2, aft: 1, fuseW: 5.97 }, 'douglas-dc-10-30': { podded: 2, aft: 1, fuseW: 6.02 },
    'convair-f-106': { delta: true }, 'lockheed-f-104': { taper: 0.4, sweepLE: 27 }, 'general-dynamics-f-111': { sweepDeg: 16 }, 'grumman-f-14': { sweepDeg: 20 },
    'mcdonnell-f-4': { taper: 0.25 }, 'mcdonnell-douglas-f-15': { taper: 0.25 }, 'general-dynamics-f-16': { taper: 0.23 }
  };
  AERO.geometry = function (a) {
    var L = Object.assign({}, LAYOUT[a.id] || {}), g = {};
    g.b = a.b; g.l = a.l; g.S = a.S; g.A = a.A || a.b * a.b / a.S;
    var biplaneEra = a.era === 'ww1' || (a.era === 'interwar' && a.year < 1932 && a.role !== 'transport' && a.role !== 'racer') || a.id === 'curtiss-r2c-1' || a.id === 'curtiss-p-6e' || a.id === 'beech-staggerwing' || a.id === 'travel-air-4000';
    g.planes = L.planes || (a.id === 'wright-flyer' ? 2 : biplaneEra ? 2 : 1);
    if (['hp-w-8', 'fokker-f-ii'].indexOf(a.id) >= 0) g.planes = a.id === 'hp-w-8' ? 2 : 1;
    if (['supermarine-s-4', 'dayton-wright-rb', 'lockheed-orion', 'northrop-alpha'].indexOf(a.id) >= 0) g.planes = 1;
    g.special = L.special || null;
    var jet = a.eng === 'turbojet' || a.eng === 'turbofan';
    g.sweep = L.sweepDeg != null ? L.sweepDeg : a.sweep || 0;
    g.taper = L.taper != null ? L.taper : g.planes > 1 ? 1 : jet ? (a.role === 'fighter' ? 0.35 : 0.3) : 0.45;
    g.delta = !!L.delta;
    // area per wing; each wing gets S / planes (the published S is the total)
    var Sw = g.S / g.planes;
    g.cr = 2 * Sw / (g.b * (1 + g.taper));
    g.ct = g.cr * g.taper;
    g.fuseW = L.fuseW || (a.role === 'transport' ? Math.max(1.2, Math.min(4.2, 0.085 * g.l + 0.25)) : Math.max(0.8, Math.min(2.2, 0.11 * g.l)));
    if (a.role === 'transport' && a.year < 1940) g.fuseW = Math.min(g.fuseW, a.year < 1930 ? 1.6 : 2.4);
    g.engines = L.engines || a.n || 1;
    g.podded = L.podded || 0; g.aft = L.aft || 0; g.buried = L.buried || 0; g.ttail = !!L.ttail;
    g.sweepLE = L.sweepLE != null ? L.sweepLE : null;
    g.twinboom = L.special === 'twinboom';
    g.wingX = g.planes > 1 ? 0.62 * g.l : jet ? 0.5 * g.l : 0.66 * g.l;   // wing quarter-chord root station from the tail end (nose at x = l)
    if (a.role === 'transport' && !jet) g.wingX = 0.6 * g.l;
    g.ht = { b: Math.max(g.b * (jet ? 0.38 : 0.36), 1.2 * g.fuseW), cr: g.cr * (g.planes > 1 ? 0.7 : 0.55), taper: jet ? 0.4 : 0.6, sweep: jet ? Math.max(0, g.sweep + 3) : 0 };
    if (g.delta) g.ht = null;
    return g;
  };

  // Planform outline points of a trapezoidal wing (right half mirrored), quarter-chord root at (xq, 0), nose toward +x.
  function wingPts(xq, b, cr, ct, sweepQ, sweepLE) {
    var s = b / 2, tq = Math.tan((sweepQ || 0) * DEG);
    var xleR = xq + cr / 4, xteR = xq - 0.75 * cr;
    var xqT = xq - s * tq, xleT = xqT + ct / 4, xteT = xqT - 0.75 * ct;
    if (sweepLE != null) { xleT = xleR - s * Math.tan(sweepLE * DEG); xteT = xleT - ct; }
    return [[xleR, 0], [xleT, s], [xteT, s], [xteR, 0], [xteT, -s], [xleT, -s]];
  }
  AERO.planform = function (plane, a, o) {
    o = o || {};
    var g = a.cr ? a : AERO.geometry(a), x0 = o.x0 || 0, y0 = o.y0 || 0;
    var grp = plane.group(o.parent);
    var col = o.color || 'ink', fill = o.fill || col, fo = o.fillOpacity == null ? 0.16 : o.fillOpacity, w = o.width || 1.5;
    function T(p) { return [x0 + p[1], y0 + p[0]]; }            // nose up the page: x_plane = spanwise, y_plane = along the body
    function poly(pts, extra) { return grp.polyline(pts.map(T), Object.assign({ color: col, width: w, closed: true, fill: fill, fillOpacity: fo }, extra)); }
    var l = g.l, half = g.fuseW / 2;
    if (g.special === 'wright') {
      // 1903 Flyer: two 12.3 m wings of 1.98 m chord (one drawn), a forward elevator, twin rudders behind
      var c = 1.98, xw = 3.4;
      poly([[xw, -g.b / 2], [xw, g.b / 2], [xw - c, g.b / 2], [xw - c, -g.b / 2]]);
      poly([[xw + 3.0, -2.4], [xw + 3.0, 2.4], [xw + 2.2, 2.4], [xw + 2.2, -2.4]]);   // canard elevator (about 4.8 m x 0.8 m)
      grp.line(T([xw, 0]), T([xw + 2.2, 0]), { color: col, width: 1 });
      [-0.45, 0.45].forEach(function (yy) { grp.line(T([xw - c, yy]), T([0, yy]), { color: col, width: 1 }); });
      grp.line(T([0.4, -0.6]), T([0.4, 0.6]), { color: col, width: 2.5 });              // twin rudders, seen from above
      [-1.2, 1.2].forEach(function (yy) { grp.circle({ center: T([xw - c - 0.15, yy]), r: 1.3, color: col, width: 1, dashed: true, fill: null }); });
      return grp;
    }
    // fuselage: rounded nose, straight middle, tapered tail
    var nose = [], i, N = 8, Ln = Math.min(l * 0.18, g.fuseW * 2.2), Lt = l * (a.role === 'transport' ? 0.28 : 0.35);
    for (i = 0; i <= N; i++) { var th = -Math.PI / 2 + Math.PI * i / N; nose.push([l - Ln + Ln * Math.cos(th), half * Math.sin(th)]); }
    var fus = [[0, -half * 0.25]].concat([[Lt, -half]]).concat(nose).concat([[Lt, half], [0, half * 0.25]]);
    // wings (drawn first, fuselage on top)
    var xq = g.wingX;
    if (g.delta) {
      var crd = 2 * g.S / g.b, xleR = xq + crd * 0.45;
      poly([[xleR, 0], [xleR - crd, g.b / 2], [xleR - crd, -g.b / 2]]);
    } else {
      poly(wingPts(xq, g.b, g.cr, g.ct, g.sweep, g.sweepLE));
      if (g.planes > 1) {   // the lower wing(s), offset back slightly (stagger), dashed
        poly(wingPts(xq - g.cr * 0.25, g.b * (g.planes > 2 ? 0.9 : 0.96), g.cr, g.ct, g.sweep, g.sweepLE), { dashed: true, fillOpacity: fo * 0.4 });
      }
    }
    if (g.twinboom) {
      var yb = g.b * 0.15;
      [-yb, yb].forEach(function (yy) {
        poly([[l * 0.92, yy - 0.5], [l * 0.92, yy + 0.5], [l * 0.05, yy + 0.35], [l * 0.05, yy - 0.35]]);
      });
      poly(wingPts(l * 0.06, 2 * yb + 1.4, 2.0, 1.6, 0), {});
      poly([[l * 0.75, -0.75], [l * 0.75, 0.75], [l * 0.45, 0.6], [l * 0.45, -0.6]]);
    } else {
      if (g.ht) {
        var xh = Math.max(g.ht.cr * 0.3, l * 0.04) + g.ht.cr * 0.75;
        poly(wingPts(xh, g.ht.b, g.ht.cr, g.ht.cr * g.ht.taper, g.ht.sweep));
      }
      poly(fus);
    }
    // engines: nacelles on the wing (props and podded jets), at the tail (aft-mounted jets)
    var podN = g.podded || ((a.eng === 'piston' || a.eng === 'turboprop') && g.engines > 1 ? g.engines : 0);
    if (a.id === 'ford-trimotor' || a.id === 'caproni-ca-42') podN = 2;
    var podL = a.eng === 'turbofan' || a.eng === 'turbojet' ? Math.max(3, g.cr * 0.55) : Math.max(1.6, g.cr * 0.75), podW = a.eng === 'turbofan' ? Math.max(1.6, g.b * 0.035) : Math.max(0.9, g.b * 0.022);
    var stations = podN === 2 ? [0.34] : podN === 4 ? [0.34, 0.64] : podN === 3 ? [0.34] : [];
    stations.forEach(function (eta) {
      [-1, 1].forEach(function (sgn) {
        var yy = sgn * eta * g.b / 2, xle = xq + g.cr / 4 - Math.abs(yy) * Math.tan(g.sweep * DEG) - (g.cr - g.ct) * Math.abs(yy) / (g.b / 2) / 4;
        var xf = xle + podL * (a.eng === 'turbofan' || a.eng === 'turbojet' ? 0.7 : 0.45);
        poly([[xf, yy - podW / 2], [xf, yy + podW / 2], [xf - podL, yy + podW / 2], [xf - podL, yy - podW / 2]], { fillOpacity: Math.min(0.5, fo * 2.2) });
      });
    });
    if (g.aft) {
      var ya = half + podW * 0.6;
      (g.aft === 1 ? [0] : g.aft === 3 ? [-ya, 0, ya] : g.aft === 4 ? [-ya, -ya - podW * 1.05, ya, ya + podW * 1.05] : [-ya, ya]).forEach(function (yy) {
        var xr = l * 0.24 + (yy === 0 ? -l * 0.06 : 0);
        poly([[xr + podL, yy - podW / 2], [xr + podL, yy + podW / 2], [xr, yy + podW / 2], [xr, yy - podW / 2]], { fillOpacity: Math.min(0.5, fo * 2.2) });
      });
    }
    if (o.label) {
      var lab = grp.label(T([-1.2, 0]), o.label, { anchor: 's', tex: false, className: 'small' });
      lab = lab;
    }
    return grp;
  };

  /** Several aircraft side by side, nose up, to one scale. stage: element; ids: DATA ids; opts {gap (m), grid (m),
   *  maxHeight, ariaLabel, select(id) callback when an outline is clicked}. Returns {plane, select(id), ids}. */
  AERO.gallery = function (stage, ids, o) {
    o = o || {};
    // ids: a flat list (one row) or a list of rows (arrays of ids); o.labels:false leaves the names off the plot
    var rows = Array.isArray(ids[0]) ? ids : [ids];
    rows = rows.map(function (r) { return r.map(function (id) { return typeof id === 'string' ? AERO.byId(id) : id; }).filter(Boolean); });
    var list = [].concat.apply([], rows);
    var gap = o.gap != null ? o.gap : 3, H = 0, Wmax = 0;
    list.forEach(function (a) { H = Math.max(H, a.l); });
    rows.forEach(function (r) { var w = -gap; r.forEach(function (a) { w += a.b + gap; }); Wmax = Math.max(Wmax, w); });
    var dy = o.labels === false ? 0 : Wmax * 0.045, rowH = H + gap + (o.labels === false ? 0 : 1.6 + 2.2 * dy);
    var plane = CYL2D.plane(stage, { xRange: [0, 10], yRange: [-2, H + 1], grid: o.grid === false ? 'none' : 'cartesian', gridStep: o.grid || 5, axes: false, ticks: false,
      maxHeight: o.maxHeight || 380, ariaLabel: o.ariaLabel || 'Top views of several aircraft side by side, to the same scale.' });
    var G = {}, labs = [];
    rows.forEach(function (r, ri) {
      var w = -gap; r.forEach(function (a) { w += a.b + gap; });
      var x = (Wmax - w) / 2, y0 = (rows.length - 1 - ri) * rowH;
      r.forEach(function (a, i) {
        var half = a.b / 2;
        x += half;
        G[a.id] = AERO.planform(plane, a, { x0: x, y0: y0, color: 'accent' });
        labs.push({ g: G[a.id], x: x, y: y0, i: i, name: a.name });
        x += half + gap;
      });
    });
    // names below each aircraft, staggered on two rows so neighbours never collide
    if (o.labels !== false) labs.forEach(function (L) { L.g.label([L.x, L.y + (L.i % 2 ? -0.4 - dy : -0.4)], L.name, { anchor: 's', tex: false, className: 'small' }); });
    plane.setRange([-gap / 2, Wmax + gap / 2], [o.labels === false ? -1 : -1.6 - 2.2 * dy, (rows.length - 1) * rowH + H + 1]);
    var api = { plane: plane, ids: list.map(function (a) { return a.id; }) };
    api.select = function (id) {
      Object.keys(G).forEach(function (k) { G[k].el.setAttribute('opacity', !id || k === id ? 1 : 0.4); });
    };
    return api;
  };

  global.AERO = AERO;
})(window);
