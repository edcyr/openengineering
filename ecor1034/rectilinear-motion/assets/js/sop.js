/*!
 * sop.js — SOP: the animated figures of the Systems of Particles module, written as widgets so that a lesson and
 * the Systems Lab can mount the same figure with different starting numbers. Classic script (IIFE) that attaches
 * ONE global: SOP. Requires CYL (cyl-core.js), CYL2D (cyl-2d.js), ENERGY (energy.js), MOMENTUM (momentum.js) and
 * FMA (fma.js). Load it after them.
 *
 * Every widget takes {stage, controls, …starting numbers…, sliders: true} and returns a controller
 * {plane, state(), set(values) (changes the numbers and recomputes), destroy()}; sliders: false leaves the panel
 * to the caller. Notation follows Hibbeler: g = 9.81 m/s², positions from fixed points, relative
 * quantities written B/A ("B relative to A"), the center of mass G, (v_A)_1 and (v_A)_2 before and after an impact.
 *
 * Color code, the same in every figure, readout and formula:
 *   relative motion, v_B = v_A + v_{B/A} (and the same for a):  the reference body A or the frame 'accent' (teal),
 *     the relative part B/A 't' (violet), the absolute motion of B 'warn' (amber)       TeX \colRA, \colRel, \colRB
 *   velocity of a body ................ 'good' (green)        acceleration, m a ...... 'bad' (red)
 *   weight W .......................... 'z' (blue)           normal force N ......... 'ink'
 *   internal forces (between particles of the system) 't' (violet)                   TeX \colInt
 *   friction 'r' (orange, thick)       cord tension 'muted' (gray)                   the center of mass G: 'ink' ring
 *
 * Widgets
 *   SOP.relative   two cars crossing, seen from the ground or from car A (Lesson 1)
 *   SOP.river      a boat crossing a river with a current (Lesson 1)
 *   SOP.pulleys    three blocks on two cords and a movable pulley: kinematics or dynamics (Lessons 2, 3)
 *   SOP.link       two collars joined by a rigid link (Lesson 2)
 *   SOP.wedge      a block sliding on a smooth wedge that is free to slide (Lessons 3, 6)
 *   SOP.shell      a shell that bursts into two fragments in flight; the center of mass keeps its parabola (Lesson 4)
 *   SOP.boat       a person walking along a boat on still water (Lesson 4)
 *   SOP.incline    a block on an incline pulled by a hanging block, with the work of each force (Lesson 5)
 *   SOP.plank      a block sliding onto a plank on a smooth floor (Lessons 5, 7)
 *   SOP.ballistic  a bullet into a block hanging on cords (Lesson 7)
 *   SOP.jerk       a slack cord that jerks taut between two blocks (Lesson 7)
 *   SOP.pucks      two pucks in an oblique impact on smooth ice (Lesson 8)
 */
(function (window) {
  'use strict';
  if (window.SOP) return;
  var CYL = window.CYL, CYL2D = window.CYL2D;
  var SOP = { version: '1.0.0', G: 9.81 };
  var G = 9.81, D2R = Math.PI / 180;

  /* ---------- small helpers ---------- */
  function add(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function mul(a, k) { return [a[0] * k, a[1] * k]; }
  function len(a) { return Math.hypot(a[0], a[1]); }
  function unit(a) { var l = len(a); return l > 1e-12 ? [a[0] / l, a[1] / l] : [0, 0]; }
  function rot(v, a) { var c = Math.cos(a), s = Math.sin(a); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c]; }
  function dir(deg) { return [Math.cos(deg * D2R), Math.sin(deg * D2R)]; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function fmt(x, s) { return CYL.fmt(Math.abs(x) < 1e-9 ? 0 : x, s || 4); }
  // live readouts: a fixed number of decimals, so the numbers (and the panel) do not jump while a figure plays
  function fx(x, d) { return CYL.fmtFixed(Math.abs(x) < 1e-9 ? 0 : x, d); }
  function angDeg(v) { var a = Math.atan2(v[1], v[0]) / D2R; return a < 0 ? a + 360 : a; }
  SOP.vec = { add: add, sub: sub, mul: mul, len: len, unit: unit, rot: rot, dir: dir };

  function title(panel, text) { panel.appendChild(CYL.el('p', { class: 'viz-title', text: text })); }
  function grid(panel, ros) { panel.appendChild(CYL.el('div', { class: 'readout-grid', 'aria-live': 'off' }, ros.map(function (r) { return r.el; }))); }
  function slider(panel, label, min, max, step, value, unit, color, onInput) {
    var s = CYL.slider({ label: label, min: min, max: max, step: step, value: value, unit: unit || '', color: color, onInput: onInput });
    panel.appendChild(s.el); return s;
  }
  function note(panel, text) { var n = CYL.el('p', { class: 'mf-note', text: text || '' }); panel.appendChild(n); return n; }
  function chips(panel, items) {            // [{label, color, value, onChange}] -> row of toggles
    var row = CYL.el('div', { class: 'chip-row', role: 'group', 'aria-label': 'Show' }), out = {};
    items.forEach(function (it) { var t = CYL.toggle(it); out[it.key || it.label] = t; row.appendChild(t.el); });
    panel.appendChild(row); return out;
  }
  function ground(p, x0, x1, y) {          // a floor line with hatching below
    p.line([x0, y], [x1, y], { color: 'ink', width: 2.2 });
    var step = (x1 - x0) / 40;
    for (var q = x0 + step / 2; q < x1; q += step) p.line([q, y], [q - step * 0.6, y - step * 0.9], { color: 'muted', width: 1 });
  }
  function ceiling(p, x0, x1, y) {
    p.line([x0, y], [x1, y], { color: 'ink', width: 2.6 });
    var step = (x1 - x0) / 12;
    for (var q = x0 + step / 2; q < x1; q += step) p.line([q, y], [q + step * 0.6, y + step * 0.8], { color: 'muted', width: 1 });
  }
  // an arrow handle drawn from a to a + v (hidden when v is zero)
  function arrow(p, color, label, o) {
    o = o || {};
    var h = p.line([0, 0], [0, 0], { color: color, width: o.width || 2.6, arrow: true, label: label || null, labelAt: o.labelAt == null ? 1 : o.labelAt,
      labelSide: o.labelSide || 'left', dashed: !!o.dashed, anchor: o.anchor || 'start' });
    return {
      handle: h,
      set: function (a, v) { var ok = len(v) > 1e-9; h.setVisible(ok); if (ok) h.set(a, add(a, v)); return this; },
      to: function (a, b) { var ok = len(sub(b, a)) > 1e-9; h.setVisible(ok); if (ok) h.set(a, b); return this; },
      hide: function () { h.setVisible(false); return this; },
      show: function (on) { h.setVisible(!!on); return this; }
    };
  }
  SOP.arrow = arrow;
  // the center of mass: a ring with a cross, labeled G
  function massCenter(p, o) {
    o = o || {};
    var r = o.r || 0.06;
    var ring = p.circle({ center: [0, 0], r: r, color: 'ink', width: 2, fill: 'bg', fillOpacity: 1 });
    var c1 = p.line([0, 0], [0, 0], { color: 'ink', width: 1.6 }), c2 = p.line([0, 0], [0, 0], { color: 'ink', width: 1.6 });
    var lab = o.label === false ? null : p.label([0, 0], o.label || 'G', { color: 'ink', anchor: o.anchor || 'ne', gap: 6 });
    return {
      set: function (c) {
        ring.set({ center: c, r: r }); c1.set([c[0] - r, c[1]], [c[0] + r, c[1]]); c2.set([c[0], c[1] - r], [c[0], c[1] + r]);
        if (lab) lab.set(c); return this;
      },
      show: function (on) { [ring, c1, c2].forEach(function (h) { h.setVisible(!!on); }); if (lab) lab.setVisible(!!on); }
    };
  }
  SOP.massCenter = massCenter;
  function pulleyWheel(p, c, r) {           // a pulley drawn as a disk with its axle
    return [p.circle({ center: c, r: r, color: 'ink', width: 2, fill: 'bg', fillOpacity: 1 }),
      p.circle({ center: c, r: Math.min(0.06, r * 0.3), color: 'ink', width: 1.4, fill: 'muted', fillOpacity: 0.6 }),
      p.circle({ center: c, r: Math.min(0.022, r * 0.12), color: 'ink', fill: 'ink', fillOpacity: 1 })];
  }
  function mover(o, setup) {               // common controller plumbing
    var api = { destroy: function () { if (api.player) api.player.destroy(); if (api.plane && api.plane.destroy) api.plane.destroy(); } };
    return api;
  }

  /* ======================================================================
     SOP.relative — two cars crossing; seen from the ground or from car A
     opts: vA, hA (heading, degrees from +x), vB, hB, rA0, rB0 (m), T (s), frame: 'ground' | 'A'
     ====================================================================== */
  SOP.relative = function (o) {
    o = Object.assign({ vA: 20, hA: 0, vB: 15, hB: 90, rA0: [-200, 0], rB0: [0, -240], O: [-240, -215], T: 24, frame: 'ground', K: 3, sliders: true }, o || {});
    var stage = o.stage, panel = o.controls, api = mover();
    var st = { vA: o.vA, hA: o.hA, vB: o.vB, hB: o.hB, frame: o.frame }, show = { r: true, tri: true };
    var XR = [-270, 270], YR = [-260, 200], K = o.K;
    var p = CYL2D.plane(stage, { xRange: XR, yRange: YR, grid: 'none', axes: false, maxHeight: 470,
      ariaLabel: 'Two cars seen from above on a square grid of 50 m. Car A drives at a steady velocity, car B at another; their position vectors are drawn from a fixed point O, and the vector from A to B is the position of B relative to A. Seen from the ground, the velocity triangle at B shows that the velocity of B is the velocity of A plus the velocity of B relative to A. Seen from car A, A stands still, the ground slides past, and B moves along a straight line with its relative velocity; its closest approach to A is marked.' });
    api.plane = p;
    var gGrid = p.group(), gPath = p.group(), gTop = p.group();
    var O = gTop.label([0, 0], 'O', { color: 'muted', anchor: 'sw', gap: 5 }), Om = gTop.circle({ center: [0, 0], r: 4, color: 'muted', fill: 'muted', fillOpacity: 1 });
    function carShape(color) { return { body: gTop.polyline([], { closed: true, color: 'ink', width: 1.4, fill: color, fillOpacity: 0.55 }) }; }
    var cA = carShape('accent'), cB = carShape('warn');
    var lA = gTop.label([0, 0], 'A', { color: 'ink', anchor: 'sw', gap: 10 }), lB = gTop.label([0, 0], 'B', { color: 'ink', anchor: 'se', gap: 10 });
    var rA = arrow(gTop, 'muted', '\\rvec_A', { width: 1.6, labelAt: 0.55, labelSide: 'right' }), rB = arrow(gTop, 'muted', '\\rvec_B', { width: 1.6, labelAt: 0.55, labelSide: 'left' });
    var rBA = arrow(gTop, 't', '\\rvec_{B/A}', { width: 1.8, dashed: true, labelAt: 0.5, labelSide: 'right' });
    var vAa = arrow(gTop, 'accent', '\\vvec_A'), vBa = arrow(gTop, 'warn', '\\vvec_B', { labelSide: 'left' });
    var vAt = arrow(gTop, 'accent', null, { width: 1.8 }), vBAt = arrow(gTop, 't', '\\vvec_{B/A}', { labelAt: 0.5, labelSide: 'right' });
    var closeMark = gTop.circle({ center: [0, 0], r: 5, color: 't', width: 1.6, fill: 'bg', fillOpacity: 1 }), closeLine = gTop.line([0, 0], [0, 0], { color: 't', width: 1.2, dashed: true });
    var ro = { rel: CYL.readout('Relative velocity \\(v_{B/A}\\)', { color: 't' }), dirn: CYL.readout('its direction'), dist: CYL.readout('Distance \\(r_{B/A}\\) now'), dmin: CYL.readout('Closest approach'), tmin: CYL.readout('at time') };
    if (panel) {
      title(panel, 'View');
      var sel = CYL.select({ label: 'Seen from', options: [{ value: 'ground', label: 'the ground (fixed axes)' }, { value: 'A', label: 'car A (axes moving with A)' }], value: st.frame,
        onChange: function (v) { st.frame = v; drawPaths(); draw(pl.t()); } });
      panel.appendChild(sel.el);
      chips(panel, [{ label: 'Positions', color: 't', value: true, onChange: function (on) { show.r = on; draw(pl.t()); } },
        { label: 'Velocity triangle', color: 'warn', value: true, onChange: function (on) { show.tri = on; draw(pl.t()); } }]);
      title(panel, 'B relative to A');
      grid(panel, [ro.rel, ro.dirn, ro.dist, ro.dmin, ro.tmin]);
      if (o.sliders) {
        title(panel, 'Change the motion');
        slider(panel, 'Speed of \\(A\\)', 0, 30, 1, st.vA, 'm/s', 'accent', function (v) { st.vA = v; recompute(); });
        slider(panel, 'Heading of \\(A\\)', 0, 355, 5, st.hA, '°', 'accent', function (v) { st.hA = v; recompute(); });
        slider(panel, 'Speed of \\(B\\)', 0, 30, 1, st.vB, 'm/s', 'warn', function (v) { st.vB = v; recompute(); });
        slider(panel, 'Heading of \\(B\\)', 0, 355, 5, st.hB, '°', 'warn', function (v) { st.hB = v; recompute(); });
      }
      note(panel, 'Headings are measured counterclockwise from east (+x); O is a fixed point on the ground. The cars are drawn about six times their size; velocity arrows show ' + K + ' s of travel.');
    }
    var vA, vB, vBA, tmin, dmin;
    function recompute() {
      vA = mul(dir(st.hA), st.vA); vB = mul(dir(st.hB), st.vB); vBA = sub(vB, vA);
      var r0 = sub(o.rB0, o.rA0), w2 = vBA[0] * vBA[0] + vBA[1] * vBA[1];
      tmin = w2 > 1e-12 ? clamp(-(r0[0] * vBA[0] + r0[1] * vBA[1]) / w2, 0, o.T) : 0;
      dmin = len(add(r0, mul(vBA, tmin)));
      ro.rel.set(fx(len(vBA), 1) + '\u00a0m/s'); ro.dirn.set(len(vBA) > 1e-9 ? fx(angDeg(vBA), 1) + '\u00b0' : '\u2014');
      ro.dmin.set(fx(dmin, 1) + '\u00a0m'); ro.tmin.set(fx(tmin, 2) + '\u00a0s');
      drawPaths(); if (pl) pl.refresh(); else draw(0);
    }
    function frameOff(t) { return st.frame === 'A' ? add(o.rA0, mul(vA, t)) : [0, 0]; }   // what is subtracted from ground positions
    function car(c, at, head) {
      var h = head * D2R, L = 34, W = 16, pts = [[-L / 2, -W / 2], [L / 2 - 6, -W / 2], [L / 2, -W / 4], [L / 2, W / 4], [L / 2 - 6, W / 2], [-L / 2, W / 2]];
      c.body.set(pts.map(function (q) { return add(at, rot(q, h)); }));
    }
    function drawPaths() {
      gPath.clear();
      if (st.frame !== 'A') {
        [[o.rA0, vA, 'accent'], [o.rB0, vB, 'warn']].forEach(function (a) {
          gPath.line(add(a[0], mul(a[1], -40)), add(a[0], mul(a[1], o.T + 40)), { color: a[2], width: 1.2, dashed: true });
        });
      } else {
        var r0 = sub(o.rB0, o.rA0);
        gPath.line(add(r0, mul(vBA, -40)), add(r0, mul(vBA, o.T + 40)), { color: 't', width: 1.4, dashed: true });
      }
    }
    function draw(t) {
      var off = frameOff(t), pA = sub(add(o.rA0, mul(vA, t)), off), pB = sub(add(o.rB0, mul(vB, t)), off), pO = sub(o.O, off);
      // the ground grid, which slides past when seen from A
      gGrid.clear();
      var sx = ((-off[0]) % 50 + 50) % 50, sy = ((-off[1]) % 50 + 50) % 50;
      for (var x = XR[0] - 50 + sx; x <= XR[1] + 50; x += 50) if (x >= XR[0] - 30 && x <= XR[1] + 30) gGrid.line([x, YR[0] - 20], [x, YR[1] + 20], { color: 'grid', width: 1 });
      for (var y = YR[0] - 50 + sy; y <= YR[1] + 50; y += 50) if (y >= YR[0] - 30 && y <= YR[1] + 30) gGrid.line([XR[0] - 20, y], [XR[1] + 20, y], { color: 'grid', width: 1 });
      Om.set({ center: pO, r: 4 }); O.set(pO);
      car(cA, pA, st.hA); car(cB, pB, st.hB); lA.set(pA); lB.set(pB);
      rA.show(show.r); rB.show(show.r); rBA.show(show.r);
      if (show.r) { rA.to(pO, pA); rB.to(pO, pB); rBA.to(pA, pB); }
      ro.dist.set(fx(len(sub(pB, pA)), 1) + '\u00a0m');
      if (st.frame !== 'A') {
        vAa.set(pA, mul(vA, K)); vBa.set(pB, mul(vB, K));
        if (show.tri) { vAt.set(pB, mul(vA, K)); vBAt.to(add(pB, mul(vA, K)), add(pB, mul(vB, K))); } else { vAt.hide(); vBAt.hide(); }
        closeMark.setVisible(false); closeLine.setVisible(false);
      } else {
        vAa.hide(); vAt.hide(); vBa.hide();
        vBAt.set(pB, mul(vBA, K));
        var pc = add(sub(o.rB0, o.rA0), mul(vBA, tmin));
        closeMark.setVisible(true); closeLine.setVisible(true); closeMark.set({ center: pc, r: 5 }); closeLine.set(pA, pc);
      }
    }
    var pl = null;
    recompute();
    pl = MOMENTUM.player({ stage: stage, duration: function () { return o.T; }, onTime: draw });
    pl.setSpeed(3);
    api.player = pl;
    api.state = function () { return { vA: vA, vB: vB, vBA: vBA, tmin: tmin, dmin: dmin, frame: st.frame }; };
    api.set = function (v) { Object.assign(st, v || {}); recompute(); };
    if (panel) CYL.renderMath(panel);
    return api;
  };

  /* ======================================================================
     SOP.river — a boat crossing a river: v_B = v_W + v_{B/W}
     opts: W (river width, m), u (current, m/s), c (boat speed relative to the water), phi (heading, degrees
     upstream of straight across)
     ====================================================================== */
  SOP.river = function (o) {
    o = Object.assign({ W: 100, u: 1.5, c: 3, phi: 0, sliders: true }, o || {});
    var stage = o.stage, panel = o.controls, api = mover();
    var st = { u: o.u, c: o.c, phi: o.phi }, Wd = o.W;
    var p = CYL2D.plane(stage, { xRange: [-90, 190], yRange: [-30, Wd + 32], grid: 'none', axes: false, maxHeight: 440,
      ariaLabel: 'A river seen from above, flowing to the right between two banks. A boat leaves a dock on the near bank, pointed at an adjustable angle upstream of straight across. At the boat, the velocity of the water plus the boat\u2019s velocity relative to the water gives its velocity over the ground, and the boat\u2019s track over the ground is drawn as it crosses.' });
    api.plane = p;
    p.polyline([[-90, 0], [190, 0], [190, Wd], [-90, Wd]], { closed: true, color: 'z', width: 0, fill: 'z', fillOpacity: 0.12 });
    [0, Wd].forEach(function (y, i) {
      p.polyline([[-90, y], [190, y], [190, y + (i ? 30 : -28)], [-90, y + (i ? 30 : -28)]], { closed: true, color: 'surface', width: 0, fill: 'surface', fillOpacity: 0.45 });
      p.line([-90, y], [190, y], { color: 'ink', width: 2 });
    });
    for (var k = 0; k < 7; k++) { var yy = 12 + k * (Wd - 24) / 6; p.line([-80 + (k % 2) * 30, yy], [-58 + (k % 2) * 30, yy], { color: 'z', width: 1.2, arrow: true }); }
    p.label([-86, Wd / 2], 'current', { tex: false, color: 'z', anchor: 'e' });
    p.circle({ center: [0, 0], r: 2.5, color: 'ink', fill: 'ink', fillOpacity: 1 });
    p.label([-7, -4], 'dock', { tex: false, color: 'muted', anchor: 'sw' });
    p.line([0, 0], [0, Wd], { color: 'muted', width: 1, dashed: true });
    var gTrack = p.group(), gTop = p.group();
    var hull = gTop.polyline([], { closed: true, color: 'ink', width: 1.4, fill: 'warn', fillOpacity: 0.6 });
    var land = gTop.circle({ center: [0, Wd], r: 3, color: 'warn', width: 1.6, fill: 'bg', fillOpacity: 1 });
    var KV = 12;   // m of arrow per m/s
    var aW = arrow(gTop, 'accent', '\\vvec_W', { labelSide: 'right' }), aBW = arrow(gTop, 't', '\\vvec_{B/W}', { labelAt: 0.55, labelSide: 'right' }), aB = arrow(gTop, 'warn', '\\vvec_B', { labelAt: 0.88, labelSide: 'left' });
    var ro = { vB: CYL.readout('Speed over the ground \\(v_B\\)', { color: 'warn' }), t: CYL.readout('Time to cross'), drift: CYL.readout('Lands downstream by'), aim: CYL.readout('Heading for straight across') };
    if (panel) {
      title(panel, 'The crossing'); grid(panel, [ro.vB, ro.t, ro.drift, ro.aim]);
      if (o.sliders) {
        title(panel, 'Change it');
        slider(panel, 'Current \\(v_W\\)', 0, 3, 0.1, st.u, 'm/s', 'accent', function (v) { st.u = v; recompute(); });
        slider(panel, 'Boat speed \\(v_{B/W}\\)', 0.5, 5, 0.1, st.c, 'm/s', 't', function (v) { st.c = v; recompute(); });
        slider(panel, 'Heading upstream of straight across', -40, 80, 1, st.phi, '°', 'warn', function (v) { st.phi = v; recompute(); });
      }
      note(panel, 'The river is ' + Wd + ' m wide. Velocity arrows show ' + KV + ' s of travel; the boat is drawn about twice its size.');
    }
    var vW, vBW, vB, T;
    function recompute() {
      vW = [st.u, 0]; vBW = mul([-Math.sin(st.phi * D2R), Math.cos(st.phi * D2R)], st.c); vB = add(vW, vBW);
      T = vB[1] > 1e-6 ? Wd / vB[1] : 120;
      var x1 = vB[0] * T;
      ro.vB.set(fx(len(vB), 3) + '\u00a0m/s'); ro.t.set(vB[1] > 1e-6 ? fx(T, 2) + '\u00a0s' : 'never');
      ro.drift.set(vB[1] > 1e-6 ? fmt(x1) + '\u00a0m' : '\u2014');
      ro.aim.set(st.u < st.c ? fmt(Math.asin(st.u / st.c) / D2R) + '\u00b0 upstream' : 'impossible: \\(v_W \\ge v_{B/W}\\)');
      if (panel) CYL.renderMath(ro.aim.el);
      gTrack.clear();
      gTrack.line([0, 0], add([0, 0], mul(vB, T)), { color: 'warn', width: 1.4, dashed: true });
      land.setVisible(vB[1] > 1e-6); land.set({ center: [x1, Wd], r: 3 });
      if (pl) pl.refresh(); else draw(0);
    }
    function draw(t) {
      var pos = mul(vB, Math.min(t, T)), h = Math.atan2(vBW[1], vBW[0]);
      var pts = [[-9, -4], [5, -4], [10, 0], [5, 4], [-9, 4]];
      hull.set(pts.map(function (q) { return add(pos, rot(q, h)); }));
      aW.set(pos, mul(vW, KV)); aBW.to(add(pos, mul(vW, KV)), add(pos, mul(vB, KV))); aB.set(pos, mul(vB, KV));
    }
    var pl = null;
    recompute();
    pl = MOMENTUM.player({ stage: stage, duration: function () { return Math.min(T, 120); }, onTime: draw });
    pl.setSpeed(6);
    api.player = pl;
    api.state = function () { return { vB: vB, T: T }; };
    api.set = function (v) { Object.assign(st, v || {}); recompute(); };
    if (panel) CYL.renderMath(panel);
    return api;
  };

  /* ======================================================================
     SOP.pulleys — blocks A, B, C on two cords: cord 1 over the fixed pulley D from A to the axle of the movable
     pulley P; cord 2 over P from B to C. Positions s are measured down from D's axle.
       constraints: s_A + s_P = const, (s_B − s_P) + (s_C − s_P) = const  ->  v_A = −v_P, v_B + v_C = 2 v_P
     mode 'kinematics': opts vA, vB (down positive) give vC. mode 'dynamics': masses mA, mB, mC from rest.
     ====================================================================== */
  SOP.pulleysSolve = function (mA, mB, mC) {
    var T2 = 4 * G / (1 / mB + 1 / mC + 4 / mA), T1 = 2 * T2;
    var aA = G - T1 / mA, aB = G - T2 / mB, aC = G - T2 / mC;
    return { T1: T1, T2: T2, aA: aA, aB: aB, aC: aC, aP: -aA };
  };
  SOP.pulleys = function (o) {
    o = Object.assign({ mode: 'kinematics', vA: 0.4, vB: -0.3, mA: 5, mB: 2, mC: 3, sliders: true }, o || {});
    var stage = o.stage, panel = o.controls, api = mover(), dyn = o.mode === 'dynamics';
    var st = { vA: o.vA, vB: o.vB, mA: o.mA, mB: o.mB, mC: o.mC }, show = { s: !dyn, f: dyn, v: !dyn };
    var RD = 0.55, RP = 0.32, XA = -RD, XP = RD, XB = RD - RP, XC = RD + RP, BW = 0.36, BH = 0.42, AW = 0.5, AH = 0.5;
    var S0 = { A: 1.9, P: 1.6, B: 2.75, C: 2.75 };
    var p = CYL2D.plane(stage, { xRange: [-1.95, 2.35], yRange: [-4.55, 0.75], grid: 'none', axes: false, maxHeight: 520,
      ariaLabel: 'A fixed pulley D hangs from the ceiling. Cord 1 runs from block A, over D, down to the axle of a movable pulley P. Cord 2 runs over P, with block B on its left end and block C on its right end. Dimension lines measure the positions of A, P, B and C down from the axle of D. ' + (dyn ? 'Released from rest, the blocks accelerate; arrows show the tension and weight on each block and its acceleration.' : 'The blocks move at steady speeds; arrows show their velocities, and the two cord lengths stay constant.') });
    api.plane = p;
    ceiling(p, -0.25, 0.25, 0.62);
    p.polyline([[-0.06, 0.62], [0.06, 0.62], [0.03, 0], [-0.03, 0]], { closed: true, color: 'ink', width: 1.4, fill: 'muted', fillOpacity: 0.45 });
    pulleyWheel(p, [0, 0], RD);
    p.arc({ center: [0, 0], r: RD, theta0: 0, theta1: Math.PI, color: 'ink', width: 1.6, arrow: false });
    p.label([-RD * 0.78, RD * 0.78], 'D', { color: 'ink', anchor: 'nw', gap: 3 });
    p.line([-1.85, 0], [2.25, 0], { color: 'muted', width: 1, dashed: true });
    p.label([2.25, 0], '\\text{datum}', { color: 'muted', anchor: 'n', gap: 4 });
    var g = p.group(), gd = p.group(), ga = p.group();
    var cA = g.line([0, 0], [0, 0], { color: 'ink', width: 1.6 }), cP = g.line([0, 0], [0, 0], { color: 'ink', width: 1.6 });
    var cB = g.line([0, 0], [0, 0], { color: 'ink', width: 1.6 }), cC = g.line([0, 0], [0, 0], { color: 'ink', width: 1.6 });
    var wrapP = g.arc({ center: [0, 0], r: RP, theta0: 0, theta1: Math.PI, color: 'ink', width: 1.6, arrow: false });
    var pw = [g.circle({ center: [0, 0], r: RP, color: 'ink', width: 2, fill: 'bg', fillOpacity: 1 }), g.circle({ center: [0, 0], r: 0.025, color: 'ink', fill: 'ink', fillOpacity: 1 })];
    var yoke = g.line([0, 0], [0, 0], { color: 'ink', width: 2.2 }), pl_ = g.label([0, 0], 'P', { color: 'ink', anchor: 'e', gap: 6 });
    var bA = FMA.block(p, { w: AW, h: AH, color: 'accent', label: 'A' }), bB = FMA.block(p, { w: BW, h: BH, color: 'warn', label: 'B' }), bC = FMA.block(p, { w: BW, h: BH, color: 'z', label: 'C' });
    var dims = {}; [['A', -1.3, 'left', XA - AW / 2], ['B', -1.7, 'left', XB - BW / 2], ['P', 1.5, 'left', XP + 0.07], ['C', 1.9, 'right', XC + BW / 2]].forEach(function (d) {
      dims[d[0]] = gd.line([0, 0], [0, 0], { color: 'muted', width: 1.1, arrow: 'both', label: 's_' + d[0], labelAt: 0.5, labelSide: d[2] });
      dims[d[0]].lead = gd.line([0, 0], [0, 0], { color: 'muted', width: 1, dashed: true });
      dims[d[0]].x = d[1]; dims[d[0]].bx = d[3];
    });
    var arr = { A: arrow(ga, 'good', '\\vvec_A'), B: arrow(ga, 'good', '\\vvec_B', { labelSide: 'right' }), C: arrow(ga, 'good', '\\vvec_C', { labelSide: 'right' }), P: arrow(ga, 'good', '\\vvec_P', { labelSide: 'right' }) };
    var acc = { A: arrow(ga, 'bad', '\\avec_A', { labelSide: 'beyond' }), B: arrow(ga, 'bad', '\\avec_B', { labelSide: 'beyond' }), C: arrow(ga, 'bad', '\\avec_C', { labelSide: 'beyond' }) };
    var f = { TA: FMA.force(p, { color: 'muted', label: 'T_1', labelSide: 'left' }), WA: FMA.force(p, { color: 'z', label: 'W_A' }), TB: FMA.force(p, { color: 'muted', label: 'T_2', labelSide: 'left' }), WB: FMA.force(p, { color: 'z', label: 'W_B', labelSide: 'left' }), TC: FMA.force(p, { color: 'muted', label: 'T_2' }), WC: FMA.force(p, { color: 'z', label: 'W_C' }) };
    var ro = dyn ? { aA: CYL.readout('\\(a_A\\)', { color: 'bad' }), aB: CYL.readout('\\(a_B\\)', { color: 'bad' }), aC: CYL.readout('\\(a_C\\)', { color: 'bad' }), T1: CYL.readout('Tension \\(T_1\\)'), T2: CYL.readout('Tension \\(T_2\\)') }
      : { vA: CYL.readout('\\(v_A\\)', { color: 'good' }), vB: CYL.readout('\\(v_B\\)', { color: 'good' }), vP: CYL.readout('\\(v_P = -v_A\\)', { color: 'good' }), vC: CYL.readout('\\(v_C = 2v_P - v_B\\)', { color: 'good' }), L1: CYL.readout('\\(s_A + s_P\\)'), L2: CYL.readout('\\(s_B + s_C - 2s_P\\)') };
    if (panel) {
      if (!dyn) chips(panel, [{ label: 'Positions', color: 't', value: true, onChange: function (on) { show.s = on; draw(pl.t()); } }]);
      else chips(panel, [{ label: 'Forces', color: 'z', value: true, onChange: function (on) { show.f = on; draw(pl.t()); } }, { label: 'Velocity', color: 'good', value: false, onChange: function (on) { show.v = on; draw(pl.t()); } },
        { label: 'Positions', color: 't', value: false, onChange: function (on) { show.s = on; draw(pl.t()); } }]);
      title(panel, dyn ? 'The motion (down positive)' : 'Velocities (down positive)');
      grid(panel, Object.keys(ro).map(function (k) { return ro[k]; }));
      if (o.sliders) {
        title(panel, 'Change it');
        if (!dyn) {
          slider(panel, '\\(v_A\\)', -0.8, 0.8, 0.05, st.vA, 'm/s', 'accent', function (v) { st.vA = v; recompute(); });
          slider(panel, '\\(v_B\\)', -0.8, 0.8, 0.05, st.vB, 'm/s', 'warn', function (v) { st.vB = v; recompute(); });
        } else {
          slider(panel, '\\(m_A\\)', 1, 12, 0.5, st.mA, 'kg', 'accent', function (v) { st.mA = v; recompute(); });
          slider(panel, '\\(m_B\\)', 0.5, 8, 0.5, st.mB, 'kg', 'warn', function (v) { st.mB = v; recompute(); });
          slider(panel, '\\(m_C\\)', 0.5, 8, 0.5, st.mC, 'kg', 'z', function (v) { st.mC = v; recompute(); });
        }
      }
      note(panel, dyn ? 'Light cords and pulleys, smooth axles; released from rest. Forces are drawn to scale; the motion stops when a block or the pulley reaches the end of its travel.'
        : 'You choose the velocities of A and B; the two cords fix those of P and C. Positive is down. The motion stops when a block or the pulley reaches the end of its travel.');
    }
    var V = {}, sol = null, dur = 3;
    function sAt(t) {
      if (!dyn) return { A: S0.A + V.A * t, P: S0.P + V.P * t, B: S0.B + V.B * t, C: S0.C + V.C * t };
      var h = 0.5 * t * t; return { A: S0.A + sol.aA * h, P: S0.P + sol.aP * h, B: S0.B + sol.aB * h, C: S0.C + sol.aC * h };
    }
    function ok(s) { return s.A > 0.75 && s.A < 4.0 && s.P > 0.75 && s.P < 3.1 && s.B - s.P > 0.6 && s.C - s.P > 0.6 && s.B < 4.05 && s.C < 4.05; }
    function recompute() {
      if (!dyn) {
        V = { A: st.vA, B: st.vB, P: -st.vA, C: -2 * st.vA - st.vB };
        ro.vA.set(fx(V.A, 2) + '\u00a0m/s'); ro.vB.set(fx(V.B, 2) + '\u00a0m/s'); ro.vP.set(fx(V.P, 2) + '\u00a0m/s'); ro.vC.set(fx(V.C, 2) + '\u00a0m/s');
      } else {
        sol = SOP.pulleysSolve(st.mA, st.mB, st.mC);
        ro.aA.set(fx(sol.aA, 3) + '\u00a0m/s\u00b2'); ro.aB.set(fx(sol.aB, 3) + '\u00a0m/s\u00b2'); ro.aC.set(fx(sol.aC, 3) + '\u00a0m/s\u00b2');
        ro.T1.set(fx(sol.T1, 2) + '\u00a0N'); ro.T2.set(fx(sol.T2, 2) + '\u00a0N');
      }
      var t = 0; while (t < 12 && ok(sAt(t + 0.02))) t += 0.02;
      dur = Math.max(t, 0.02);
      if (pl) pl.refresh(); else draw(0);
    }
    function draw(t) {
      t = Math.min(t, dur);
      var s = sAt(t), yA = -s.A, yP = -s.P, yB = -s.B, yC = -s.C;
      bA.set([XA, yA - AH / 2], 0); bB.set([XB, yB - BH / 2], 0); bC.set([XC, yC - BH / 2], 0);
      cA.set([XA, 0], [XA, yA]); cP.set([XP, 0], [XP, yP + RP + 0.18]);
      yoke.set([XP, yP + RP + 0.18], [XP, yP]);
      pw[0].set({ center: [XP, yP], r: RP }); pw[1].set({ center: [XP, yP], r: 0.025 }); wrapP.set({ center: [XP, yP], r: RP, theta0: 0, theta1: Math.PI });
      pl_.set([XP - RP, yP]);
      cB.set([XB, yP], [XB, yB]); cC.set([XC, yP], [XC, yC]);
      gd.setVisible(show.s);
      if (show.s) {
        [['A', yA], ['B', yB], ['P', yP], ['C', yC]].forEach(function (q) {
          var d = dims[q[0]]; d.set([d.x, 0], [d.x, q[1]]); d.lead.set([d.x, q[1]], [d.bx, q[1]]);
        });
      }
      var v = dyn ? { A: sol.aA * t, B: sol.aB * t, C: sol.aC * t, P: sol.aP * t } : V, K = dyn ? 0.35 : 1.1;
      // each block's velocity starts on the face it moves toward: the bottom when moving down, the top when moving up
      function vStart(x, yTop, h, vv, dx) { return vv >= 0 ? [x + dx, yTop - h] : [x + dx, yTop]; }
      if (show.v) {
        arr.A.set(vStart(XA, yA, AH, v.A, -0.12), [0, -v.A * K]);
        arr.B.set(vStart(XB, yB, BH, v.B, -0.08), [0, -v.B * K]);
        arr.C.set(vStart(XC, yC, BH, v.C, 0.08), [0, -v.C * K]);
        arr.P.set([XP + RP + 0.12, yP], [0, -v.P * K]);
      } else { arr.A.hide(); arr.B.hide(); arr.C.hide(); arr.P.hide(); }
      if (dyn) {
        var KA = 0.09;
        acc.A.set([XA - AW / 2 - 0.16, yA - AH / 2], [0, -sol.aA * KA]); acc.B.set([XB - BW / 2 - 0.22, yB - BH / 2], [0, -sol.aB * KA]);
        acc.C.set([XC + BW / 2 + 0.15, yC - BH / 2], [0, -sol.aC * KA]);
        var KF = 0.016;
        if (show.f) {
          f.TA.set([XA + 0.17, yA], [0, 1], sol.T1 * KF); f.WA.set([XA, yA - AH / 2], [0, -1], st.mA * G * KF);
          f.TB.set([XB - 0.13, yB], [0, 1], sol.T2 * KF); f.WB.set([XB, yB - BH / 2], [0, -1], st.mB * G * KF);
          f.TC.set([XC + 0.13, yC], [0, 1], sol.T2 * KF); f.WC.set([XC, yC - BH / 2], [0, -1], st.mC * G * KF);
        } else Object.keys(f).forEach(function (k) { f[k].hide(); });
      } else { acc.A.hide(); acc.B.hide(); acc.C.hide(); Object.keys(f).forEach(function (k) { f[k].hide(); }); }
      if (!dyn) { ro.L1.set(fx(s.A + s.P, 3) + '\u00a0m'); ro.L2.set(fx(s.B + s.C - 2 * s.P, 3) + '\u00a0m'); }
    }
    var pl = null;
    recompute();
    pl = MOMENTUM.player({ stage: stage, duration: function () { return dur; }, onTime: draw });
    api.player = pl;
    api.state = function () { return dyn ? sol : V; };
    api.set = function (v) { Object.assign(st, v || {}); recompute(); };
    if (panel) CYL.renderMath(panel);
    return api;
  };

  /* ======================================================================
     SOP.link — collar A slides on a horizontal rod, collar B on a vertical rod; a rigid link of length L joins
     them: x_A² + y_B² = L² -> x_A v_A + y_B v_B = 0 -> v_A² + x_A a_A + v_B² + y_B a_B = 0
     opts: L (m), vA (m/s, constant), x0 (start of A), x1 (end of A)
     ====================================================================== */
  SOP.link = function (o) {
    o = Object.assign({ L: 1.3, vA: 0.5, x0: 0.25, x1: 1.2, sliders: true }, o || {});
    var stage = o.stage, panel = o.controls, api = mover();
    var st = { vA: o.vA }, L = o.L, show = { rel: true };
    var p = CYL2D.plane(stage, { xRange: [-0.45, L + 0.75], yRange: [-0.35, L + 0.4], grid: 'none', axes: false, maxHeight: 440,
      ariaLabel: 'Collar A slides along a horizontal rod and collar B along a vertical rod; a rigid link joins them. A is pushed to the right at a steady speed, so B slides down, slowly at first and then faster and faster as the link nears the horizontal. Arrows show both velocities and the velocity of B relative to A, which is perpendicular to the link.' });
    api.plane = p;
    p.line([-0.05, 0], [L + 0.6, 0], { color: 'ink', width: 3 }); p.line([0, -0.05], [0, L + 0.3], { color: 'ink', width: 3 });
    p.polyline([[-0.2, -0.2], [0, -0.2], [0, 0], [-0.2, 0]], { closed: true, color: 'ink', width: 1.2, fill: 'muted', fillOpacity: 0.35 });
    p.label([L + 0.6, 0], 'x', { color: 'muted', anchor: 'se', gap: 4 }); p.label([0, L + 0.3], 'y', { color: 'muted', anchor: 'nw', gap: 4 });
    var linkL = p.line([0, 0], [0, 0], { color: 'ink', width: 5 });
    var colA = p.polyline([], { closed: true, color: 'ink', width: 1.4, fill: 'accent', fillOpacity: 0.6 }), colB = p.polyline([], { closed: true, color: 'ink', width: 1.4, fill: 'warn', fillOpacity: 0.6 });
    var labA = p.label([0, 0], 'A', { color: 'ink', anchor: 's', gap: 12 }), labB = p.label([0, 0], 'B', { color: 'ink', anchor: 'w', gap: 14 });
    var dx = p.line([0, 0], [0, 0], { color: 'muted', width: 1.1, arrow: 'both', label: 'x_A', labelAt: 0.5, labelSide: 'right' });
    var dy = p.line([0, 0], [0, 0], { color: 'muted', width: 1.1, arrow: 'both', label: 'y_B', labelAt: 0.5, labelSide: 'right' });
    var K = 0.55;
    var aA = arrow(p, 'accent', '\\vvec_A', { labelSide: 'left' }), aB = arrow(p, 'warn', '\\vvec_B', { labelSide: 'beyond' });
    var aAt = arrow(p, 'accent', null, { width: 1.6 }), aBA = arrow(p, 't', '\\vvec_{B/A}', { labelAt: 0.3, labelSide: 'left' });
    var ro = { x: CYL.readout('\\(x_A\\)'), y: CYL.readout('\\(y_B = \\sqrt{L^2 - x_A^2}\\)'), vB: CYL.readout('\\(v_B = -x_A v_A/y_B\\)', { color: 'warn' }), aB: CYL.readout('\\(a_B\\)', { color: 'bad' }) };
    if (panel) {
      chips(panel, [{ label: 'B relative to A', color: 't', value: true, onChange: function (on) { show.rel = on; draw(pl.t()); } }]);
      title(panel, 'The link'); grid(panel, [ro.x, ro.y, ro.vB, ro.aB]);
      if (o.sliders) { title(panel, 'Change it'); slider(panel, 'Speed of \\(A\\), \\(v_A\\)', 0.1, 1.5, 0.05, st.vA, 'm/s', 'accent', function (v) { st.vA = v; recompute(); }); }
      note(panel, 'The link is ' + L + ' m long. A moves at a constant speed, so its acceleration is zero; B\u2019s speed grows without limit as the link flattens. Velocity arrows show ' + K + ' s of travel.');
    }
    var dur = 1;
    function recompute() { dur = (o.x1 - o.x0) / st.vA; if (pl) pl.refresh(); else draw(0); }
    function draw(t) {
      var x = o.x0 + st.vA * Math.min(t, dur), y = Math.sqrt(L * L - x * x), vB = -x * st.vA / y, aBv = -(st.vA * st.vA + vB * vB) / y;
      linkL.set([x, 0], [0, y]);
      var cw = 0.1, ch = 0.07;
      colA.set([[x - cw, -ch], [x + cw, -ch], [x + cw, ch], [x - cw, ch]]); colB.set([[-ch, y - cw], [ch, y - cw], [ch, y + cw], [-ch, y + cw]]);
      labA.set([x, -ch]); labB.set([ch, y]);
      dx.set([0, -0.2], [x, -0.2]); dy.set([-0.28, 0], [-0.28, y]);
      var vA = [st.vA, 0], vBv = [0, vB];
      var b0 = [0.15, y];
      aA.set([x, ch + 0.05], mul(vA, K)); aB.set(b0, mul(vBv, K));
      if (show.rel) { aAt.set(b0, mul(vA, K)); aBA.to(add(b0, mul(vA, K)), add(b0, mul(vBv, K))); } else { aAt.hide(); aBA.hide(); }
      ro.x.set(fx(x, 3) + '\u00a0m'); ro.y.set(fx(y, 3) + '\u00a0m'); ro.vB.set(fx(vB, 3) + '\u00a0m/s'); ro.aB.set(fx(aBv, 3) + '\u00a0m/s\u00b2');
    }
    var pl = null;
    recompute();
    pl = MOMENTUM.player({ stage: stage, duration: function () { return dur; }, onTime: draw });
    api.player = pl;
    api.set = function (v) { Object.assign(st, v || {}); recompute(); };
    if (panel) CYL.renderMath(panel);
    return api;
  };

  /* ======================================================================
     SOP.wedge — block B (mass m) slides down the smooth face of wedge W (mass M), which slides on a smooth floor.
       a_W = m g sinθ cosθ / (M + m sin²θ) (wedge, away from the block),  a_{B/W} = (M + m) g sinθ / (M + m sin²θ)
       N = M m g cosθ / (M + m sin²θ).  fixed: true holds the wedge (a_W = 0, a_{B/W} = g sinθ, N = m g cosθ).
     opts: M, m, th (degrees), fixed, momentum (show the momentum bars of Lesson 6 instead of the triangle)
     ====================================================================== */
  SOP.wedgeSolve = function (M, m, th, fixed) {
    var s = Math.sin(th * D2R), c = Math.cos(th * D2R);
    if (fixed) return { aW: 0, aR: G * s, N: m * G * c, stop: m * G * c * s, Nf: M * G + m * G * c * c };
    var den = M + m * s * s, aW = m * G * s * c / den, aR = (M + m) * G * s / den, N = M * m * G * c / den;
    return { aW: aW, aR: aR, N: N, stop: 0, Nf: M * G + N * c };
  };
  SOP.wedge = function (o) {
    o = Object.assign({ M: 20, m: 5, th: 30, fixed: false, momentum: false, sliders: true, Lf: 2.6 }, o || {});
    var stage = o.stage, panel = o.controls, api = mover();
    var st = { M: o.M, m: o.m, th: o.th, fixed: o.fixed }, show = { f: !o.momentum, a: !o.momentum }, Lf = o.Lf, bw = 0.42, X0 = 0.25;
    var p = CYL2D.plane(stage, { xRange: [-0.35, 4.45], yRange: [-0.95, 2.7], grid: 'none', axes: false, maxHeight: 440,
      ariaLabel: 'A wedge stands on a smooth floor, its sloping face rising to the right; a block slides down the face. Unless the wedge is held, the block pushes it to the right as it slides. Arrows show the weights, the normal force between the block and the wedge (an equal and opposite pair), the floor\u2019s push on the wedge, and the accelerations: the wedge\u2019s, and the block\u2019s as the wedge\u2019s plus its own relative to the wedge.' });
    api.plane = p;
    ground(p, -0.3, 4.4, 0);
    var gW = p.group(), gB = p.group();
    var wedgeP = gW.polyline([], { closed: true, color: 'ink', width: 1.8, fill: 'accent', fillOpacity: 0.25 }), wl = gW.label([0, 0], 'W', { color: 'ink' });
    var arcTh = gW.arc({ center: [0, 0], r: 0.45, theta0: 0, theta1: 0.5, color: 'muted', width: 1.2, arrow: false }), thl = gW.label([0, 0], '\\theta', { color: 'muted', anchor: 'e', gap: 2 });
    var stopB = gW.polyline([], { closed: true, color: 'ink', width: 1.4, fill: 'muted', fillOpacity: 0.5 });
    var blk = FMA.block(p, { w: bw, h: bw, color: 'warn', label: 'B' });
    var cgB = p.circle({ center: [0, 0], r: 0.03, color: 'z', fill: 'z', fillOpacity: 1 }), cgW = p.circle({ center: [0, 0], r: 0.035, color: 'z', fill: 'z', fillOpacity: 1 });
    var f = { WB: FMA.force(p, { color: 'z', label: 'W_B' }), NB: FMA.force(p, { color: 't', label: 'N', labelSide: 'left' }), WW: FMA.force(p, { color: 'z', label: 'W_W', labelSide: 'right', labelAt: 0.72 }),
      NW: FMA.force(p, { color: 't', label: 'N', labelSide: 'left' }), Nf: FMA.force(p, { color: 'ink', label: 'N_f' }), P: FMA.force(p, { color: 'warn', label: 'P', labelSide: 'left' }) };
    var aWa = arrow(p, 'bad', '\\avec_W', { labelSide: 'right' });
    var tW = arrow(p, 'accent', '\\avec_W', { width: 2.2, labelSide: 'left', labelAt: 0.5 }), tR = arrow(p, 't', '\\avec_{B/W}', { width: 2.2, labelAt: 0.5, labelSide: 'right' }), tB = arrow(p, 'warn', '\\avec_B', { width: 2.4, labelAt: 0.55, labelSide: 'left' });
    var ro = { aW: CYL.readout('Wedge \\(a_W\\)', { color: 'bad' }), aR: CYL.readout('Relative \\(a_{B/W}\\)', { color: 't' }), aB: CYL.readout('Block \\(a_B\\)', { color: 'warn' }), N: CYL.readout('Normal force \\(N\\)', { color: 't' }) };
    var pb = null, roPy = null, roVW = null;
    if (panel) {
      var tg = [{ label: 'Forces', color: 'z', value: show.f, onChange: function (on) { show.f = on; draw(pl.t()); } }];
      if (!o.momentum) tg.push({ label: 'Acceleration triangle', color: 'warn', value: show.a, onChange: function (on) { show.a = on; draw(pl.t()); } });
      tg.push({ key: 'fix', label: 'Hold the wedge', color: 'accent', value: st.fixed, onChange: function (on) { st.fixed = on; recompute(); } });
      chips(panel, tg);
      title(panel, 'The accelerations');
      grid(panel, [ro.aW, ro.aR, ro.aB, ro.N]);
      if (o.momentum) {
        roVW = CYL.readout('Wedge speed \\(v_W\\)', { color: 'good' }); roPy = CYL.readout('Total \\(L_y\\) (down is \\(-\\))', { color: 'good' });
        grid(panel, [roVW, roPy]);
        pb = MOMENTUM.pbars(panel, { items: [{ key: 'W', label: '(L_W)_x', color: 'accent' }, { key: 'B', label: '(L_B)_x', color: 'warn' }], total: { label: 'L_x' }, unit: 'kg\u00b7m/s', title: 'Horizontal momentum (kg\u00b7m/s)' });
      }
      if (o.sliders) {
        title(panel, 'Change it');
        slider(panel, 'Wedge \\(m_W\\)', 2, 50, 1, st.M, 'kg', 'accent', function (v) { st.M = v; recompute(); });
        slider(panel, 'Block \\(m_B\\)', 1, 20, 1, st.m, 'kg', 'warn', function (v) { st.m = v; recompute(); });
        slider(panel, 'Slope \\(\\theta\\)', 15, 60, 1, st.th, '°', null, function (v) { st.th = v; recompute(); });
      }
      note(panel, 'Smooth face, smooth floor; released from rest. Forces are drawn to one scale (the floor\u2019s push on the wedge is the longest); held, the wedge needs a horizontal push P from a stop.');
    }
    var sol, dur = 1, u0, u1;
    function geom(t) {
      var th = st.th * D2R, c = Math.cos(th), sn = Math.sin(th), h = 0.5 * t * t;
      var xw = X0 + sol.aW * h, u = u0 - sol.aR * h;
      return { th: th, c: c, s: sn, xw: xw, u: u, A: [xw, 0], Bc: [xw + Lf * c, 0], T: [xw + Lf * c, Lf * sn], vW: sol.aW * t, ur: sol.aR * t };
    }
    function recompute() {
      sol = SOP.wedgeSolve(st.M, st.m, st.th, st.fixed);
      u0 = Lf - bw / 2 - 0.12; u1 = bw / 2 + 0.05;
      dur = Math.sqrt(2 * (u0 - u1) / sol.aR);
      var th = st.th * D2R, aB = [sol.aW - sol.aR * Math.cos(th), -sol.aR * Math.sin(th)];
      ro.aW.set(fx(sol.aW, 3) + '\u00a0m/s\u00b2'); ro.aR.set(fx(sol.aR, 3) + '\u00a0m/s\u00b2'); ro.aB.set(fx(len(aB), 3) + '\u00a0m/s\u00b2'); ro.N.set(fx(sol.N, 2) + '\u00a0N');
      if (pb) pb.setScale(Math.max(1, st.m * sol.aR * dur * Math.cos(th)) * 1.05);
      if (pl) pl.refresh(); else draw(0);
    }
    function draw(t) {
      t = Math.min(t, dur);
      var g = geom(t), th = g.th, n = [-g.s, g.c], d = [-g.c, -g.s];
      wedgeP.set([g.A, g.Bc, g.T]); wl.set([g.A[0] + Lf * g.c * 0.7, Lf * g.s * 0.22]);
      arcTh.set({ center: g.A, r: 0.45, theta0: 0, theta1: th }); thl.set([g.A[0] + 0.62, 0.12]);
      stopB.setVisible(st.fixed); if (st.fixed) stopB.set([[g.Bc[0], 0], [g.Bc[0] + 0.18, 0], [g.Bc[0] + 0.18, 0.32], [g.Bc[0], 0.32]]);
      var foot = add(g.A, mul([g.c, g.s], g.u)), bc = add(foot, mul(n, bw / 2));
      blk.set(bc, th); cgB.set({ center: bc, r: 0.03 });
      var cw = [(g.A[0] + g.Bc[0] + g.T[0]) / 3, g.T[1] / 3]; cgW.set({ center: cw, r: 0.035 });
      var KF = 0.8 / Math.max(sol.Nf, st.m * G);
      [cgB, cgW].forEach(function (h) { h.setVisible(show.f); });
      if (show.f) {
        f.WB.set(bc, [0, -1], st.m * G * KF);
        f.NB.set(add(foot, mul([g.c, g.s], -0.06)), n, sol.N * KF);                   // the face pushes the block: ends on the block's bottom
        f.NW.set(add(foot, mul([g.c, g.s], 0.06)), mul(n, -1), sol.N * KF);            // the block pushes the face: ends on the face
        f.WW.set(cw, [0, -1], st.M * G * KF);
        f.Nf.set([g.A[0] + Lf * g.c * 0.45, 0], [0, 1], sol.Nf * KF);
        if (st.fixed) f.P.set([g.Bc[0], 0.16], [-1, 0], sol.stop * KF); else f.P.hide();
      } else Object.keys(f).forEach(function (k) { f[k].hide(); });
      var KA = 0.11;
      aWa.set([g.Bc[0] + 0.08, 0.55], [sol.aW * KA * 2, 0]);
      if (show.a) {
        var o0 = add(add(bc, mul(n, 0.75)), [-0.35, 0]), pW = mul([sol.aW * KA, 0], 1), pR = mul(d, sol.aR * KA);
        tW.set(o0, pW); tR.to(add(o0, pW), add(add(o0, pW), pR)); tB.to(o0, add(add(o0, pW), pR));
      } else { tW.hide(); tR.hide(); tB.hide(); }
      if (pb) {
        var vB = [g.vW - g.ur * g.c, -g.ur * g.s];
        pb.set({ W: st.M * g.vW, B: st.m * vB[0] });
        roVW.set(fx(g.vW, 3) + '\u00a0m/s'); roPy.set(fx(st.m * vB[1], 2) + '\u00a0kg\u00b7m/s');
      }
    }
    var pl = null;
    recompute();
    pl = MOMENTUM.player({ stage: stage, duration: function () { return dur; }, onTime: draw });
    api.player = pl;
    api.state = function () { return sol; };
    api.set = function (v) { Object.assign(st, v || {}); recompute(); };
    if (panel) CYL.renderMath(panel);
    return api;
  };

  /* ======================================================================
     SOP.shell — a shell fired from the origin bursts at time tb into fragments A (mass fraction f) and B. The burst
     is internal: v̄ is unchanged, v_A = v̄ + (1 − f) Δv u, v_B = v̄ − f Δv u, with u at angle phi. Each fragment flies
     until it lands, then rests; G follows the parabola until the first fragment lands.
     opts: v0 (m/s), al (degrees), f, tb (s), dv (m/s), phi (degrees)
     ====================================================================== */
  SOP.shellRun = function (q) {
    var v0 = [q.v0 * Math.cos(q.al * D2R), q.v0 * Math.sin(q.al * D2R)];
    function free(r, v, t) { return [r[0] + v[0] * t, r[1] + v[1] * t - 0.5 * G * t * t]; }
    function fvel(v, t) { return [v[0], v[1] - G * t]; }
    var tf0 = 2 * v0[1] / G, tb = Math.min(q.tb, tf0 * 0.98);
    var rb = free([0, 0], v0, tb), vb = fvel(v0, tb), u = dir(q.phi);
    var vA = add(vb, mul(u, (1 - q.f) * q.dv)), vB = sub(vb, mul(u, q.f * q.dv));
    function land(v) { var a = 0.5 * G, b = -v[1], c = -rb[1]; return tb + (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a); }   // y = 0 after the burst
    var tA = land(vA), tB = land(vB);
    function frag(v, tl, t) { var tt = Math.min(t, tl) - tb; return free(rb, v, tt); }
    return {
      v0: v0, tb: tb, rb: rb, vb: vb, vA: vA, vB: vB, tA: tA, tB: tB, R: v0[0] * tf0, tf0: tf0, end: Math.max(tA, tB),
      at: function (t) {
        if (t < tb) { var r = free([0, 0], v0, t); return { burst: false, r: r, A: r, B: r, G: r }; }
        var A = frag(vA, tA, t), B = frag(vB, tB, t);
        return { burst: true, A: A, B: B, G: add(mul(A, q.f), mul(B, 1 - q.f)), Gpar: free([0, 0], v0, t), landedA: t >= tA, landedB: t >= tB };
      }
    };
  };
  SOP.shell = function (o) {
    o = Object.assign({ v0: 50, al: 60, f: 0.5, tb: 4.4, dv: 50, phi: 180, sliders: true }, o || {});
    var stage = o.stage, panel = o.controls, api = mover();
    var st = { v0: o.v0, al: o.al, f: o.f, tb: o.tb, dv: o.dv, phi: o.phi };
    var p = CYL2D.plane(stage, { xRange: [-15, 470], yRange: [-12, 200], grid: 'cartesian', gridStep: 50, axes: true, axisLabels: ['x\\ (\\text{m})', 'y\\ (\\text{m})'], maxHeight: 420,
      ariaLabel: 'A shell is fired from the origin on a parabola. At an adjustable time it bursts into two fragments, A and B, which fly apart on new parabolas. The center of mass G of the two fragments, marked by a ring, keeps moving along the shell\u2019s original parabola, drawn dashed, until a fragment lands; then the ground pushes on that fragment and G leaves the parabola.' });
    api.plane = p;
    var gPar = p.group(), gTr = p.group(), gTop = p.group();
    var dA = 0, dB = 0;
    var shellM = gTop.circle({ center: [0, 0], r: 4, color: 'ink', width: 1.4, fill: 'muted', fillOpacity: 0.9 });
    var fA = gTop.circle({ center: [0, 0], r: 4, color: 'ink', width: 1.4, fill: 'accent', fillOpacity: 0.9 }), fB = gTop.circle({ center: [0, 0], r: 4, color: 'ink', width: 1.4, fill: 'warn', fillOpacity: 0.9 });
    var lA = gTop.label([0, 0], 'A', { color: 'ink', anchor: 'nw', gap: 6 }), lB = gTop.label([0, 0], 'B', { color: 'ink', anchor: 'ne', gap: 6 });
    var Gm = massCenter(gTop, { r: 5.5 });
    var ro = { xA: CYL.readout('\\(A\\) lands at \\(x =\\)', { color: 'accent' }), xB: CYL.readout('\\(B\\) lands at \\(x =\\)', { color: 'warn' }), xG: CYL.readout('\\((m_A x_A + m_B x_B)/m\\)'), R: CYL.readout('Range of the unburst shell \\(R\\)') };
    var msg = null;
    if (panel) {
      title(panel, 'Where the pieces land'); grid(panel, [ro.xA, ro.xB, ro.xG, ro.R]);
      msg = note(panel, '');
      if (o.sliders) {
        title(panel, 'The burst');
        slider(panel, 'Mass of \\(A\\) as a fraction of \\(m\\)', 0.2, 0.8, 0.05, st.f, '', 'accent', function (v) { st.f = v; recompute(); });
        slider(panel, 'Bursts at \\(t\\)', 0.5, 8, 0.1, st.tb, 's', null, function (v) { st.tb = v; recompute(); });
        slider(panel, 'Relative speed \\(v_{A/B}\\) after the burst', 0, 80, 1, st.dv, 'm/s', 't', function (v) { st.dv = v; recompute(); });
        slider(panel, 'Direction of \\(\\vvec_{A/B}\\)', 0, 355, 5, st.phi, '°', 't', function (v) { st.phi = v; recompute(); });
      }
      note(panel, 'Fired at ' + o.v0 + ' m/s, ' + o.al + '\u00b0 above the horizontal; no air resistance. The burst only pushes the pieces apart: the relative velocity is shared out so that the center of mass\u2019s velocity does not change.');
    }
    var run;
    function recompute() {
      run = SOP.shellRun(st);
      var a = run.at(run.end), xA = a.A[0], xB = a.B[0];
      ro.xA.set(fx(xA, 1) + '\u00a0m'); ro.xB.set(fx(xB, 1) + '\u00a0m'); ro.xG.set(fx(st.f * xA + (1 - st.f) * xB, 1) + '\u00a0m'); ro.R.set(fx(run.R, 1) + '\u00a0m');
      if (msg) msg.textContent = Math.abs(run.tA - run.tB) < 0.02 ? 'Both pieces land together, so their center of mass lands exactly where the shell would have: at R.'
        : 'The pieces land ' + fmt(Math.abs(run.tA - run.tB), 3) + ' s apart. Once the first one is down, the ground pushes on it, and G no longer follows the parabola.';
      gPar.clear();
      var pts = []; for (var k = 0; k <= 80; k++) { var t = run.tf0 * k / 80; pts.push([run.v0[0] * t, run.v0[1] * t - 0.5 * G * t * t]); }
      gPar.polyline(pts, { color: 'muted', width: 1.4, dashed: true });
      if (pl) pl.refresh(); else draw(0);
    }
    function trace(fn, t0, t1) { var pts = []; for (var k = 0; k <= 40; k++) pts.push(fn(t0 + (t1 - t0) * k / 40)); return pts; }
    function draw(t) {
      t = Math.min(t, run.end);
      var a = run.at(t);
      gTr.clear();
      gTr.polyline(trace(function (tt) { return run.at(tt).r || run.at(tt).G; }, 0, Math.min(t, run.tb)), { color: 'ink', width: 2 });
      shellM.setVisible(!a.burst); fA.setVisible(a.burst); fB.setVisible(a.burst); lA.setVisible(a.burst); lB.setVisible(a.burst);
      if (!a.burst) shellM.set({ center: a.r, r: 5 });
      else {
        gTr.polyline(trace(function (tt) { return run.at(tt).A; }, run.tb, t), { color: 'accent', width: 2 });
        gTr.polyline(trace(function (tt) { return run.at(tt).B; }, run.tb, t), { color: 'warn', width: 2 });
        gTr.polyline(trace(function (tt) { return run.at(tt).G; }, run.tb, t), { color: 'ink', width: 1.2, dashed: true });
        fA.set({ center: a.A, r: 3 + 4 * st.f }); fB.set({ center: a.B, r: 3 + 4 * (1 - st.f) }); lA.set(a.A); lB.set(a.B);
      }
      Gm.set(a.G);
    }
    var pl = null;
    recompute();
    pl = MOMENTUM.player({ stage: stage, duration: function () { return run.end; }, onTime: draw });
    pl.setSpeed(2);
    api.player = pl;
    api.state = function () { return run; };
    api.set = function (v) { Object.assign(st, v || {}); recompute(); };
    if (panel) CYL.renderMath(panel);
    return api;
  };

  /* ======================================================================
     SOP.boat — a person walks the length of a boat on still water (no horizontal external force), so the center of mass
     stays put: m_p Δx_p + m_b Δx_b = 0, Δx_p − Δx_b = d (the walk along the boat).
     opts: mp, mb (kg), u (walking speed relative to the boat, m/s), d (m)
     ====================================================================== */
  SOP.boat = function (o) {
    o = Object.assign({ mp: 80, mb: 120, u: 1, d: 4, sliders: true }, o || {});
    var stage = o.stage, panel = o.controls, api = mover();
    var st = { mp: o.mp, mb: o.mb, u: o.u }, Lb = 5.2, d = o.d, T0 = 0.6;
    var p = CYL2D.plane(stage, { xRange: [-3.8, 6.2], yRange: [-1.0, 2.7], grid: 'none', axes: false, maxHeight: 330,
      ariaLabel: 'Side view of a boat on still water next to a fixed post. A person walks from the stern to the bow. As the person walks forward, the boat slides backward, so that the center of mass of the person and the boat, marked G with a dashed vertical line, stays where it was.' });
    api.plane = p;
    p.polyline([[-3.8, 0], [6.2, 0], [6.2, -1.0], [-3.8, -1.0]], { closed: true, color: 'z', width: 0, fill: 'z', fillOpacity: 0.14 });
    p.line([-3.8, 0], [6.2, 0], { color: 'z', width: 1.6 });
    for (var k = -3; k <= 6; k++) { p.line([k, -0.06], [k, 0.06], { color: 'z', width: 1.2 }); }
    p.polyline([[-3.5, -1.0], [-3.2, -1.0], [-3.2, 1.6], [-3.5, 1.6]], { closed: true, color: 'ink', width: 1.4, fill: 'surface', fillOpacity: 0.7 });
    p.label([-3.35, 1.6], '\\text{post}', { color: 'muted', anchor: 'n', gap: 4 });
    var gB = p.group();
    var hull = gB.polyline([], { closed: true, color: 'ink', width: 1.6, fill: 'warn', fillOpacity: 0.85 });
    var bl = gB.label([0, 0], '\\text{boat}', { color: 'ink' });
    var head = gB.circle({ center: [0, 0], r: 0.17, color: 'ink', width: 1.6, fill: 'accent', fillOpacity: 0.6 });
    var bodyL = gB.polyline([], { color: 'ink', width: 3 }), legs = gB.polyline([], { color: 'ink', width: 3 }), arms = gB.polyline([], { color: 'ink', width: 2.4 });
    var Gm = massCenter(p, { r: 0.08 }), Gline = p.line([0, -0.9], [0, 2.55], { color: 'ink', width: 1, dashed: true });
    var cgP = p.circle({ center: [0, 0], r: 0.045, color: 'accent', fill: 'accent', fillOpacity: 1 }), cgB = p.circle({ center: [0, 0], r: 0.045, color: 'warn', fill: 'warn', fillOpacity: 1 });
    var vP = arrow(p, 'good', '\\vvec_p'), vB = arrow(p, 'good', '\\vvec_b', { labelSide: 'right' });
    var ro = { xp: CYL.readout('Person has moved', { color: 'accent' }), xb: CYL.readout('Boat has moved', { color: 'warn' }), xg: CYL.readout('\\(G\\) has moved'), vb: CYL.readout('Boat speed while walking', { color: 'good' }) };
    var pb = null;
    if (panel) {
      title(panel, 'Over the water (forward +)'); grid(panel, [ro.xp, ro.xb, ro.xg, ro.vb]);
      pb = MOMENTUM.pbars(panel, { items: [{ key: 'p', label: 'm_p v_p', color: 'accent' }, { key: 'b', label: 'm_b v_b', color: 'warn' }], total: { label: '\\sum mv' }, unit: 'kg\u00b7m/s', title: 'Momentum (kg\u00b7m/s)' });
      if (o.sliders) {
        title(panel, 'Change it');
        slider(panel, 'Person \\(m_p\\)', 30, 120, 5, st.mp, 'kg', 'accent', function (v) { st.mp = v; recompute(); });
        slider(panel, 'Boat \\(m_b\\)', 30, 400, 10, st.mb, 'kg', 'warn', function (v) { st.mb = v; recompute(); });
        slider(panel, 'Walking speed on the boat', 0.5, 2, 0.1, st.u, 'm/s', 'good', function (v) { st.u = v; recompute(); });
      }
      note(panel, 'The person walks ' + d + ' m along the boat. Water drag is neglected, so no horizontal external force acts on the person and the boat together. Tick marks on the water are 1 m apart.');
    }
    var vb, tw, dur;
    function recompute() {
      vb = -st.mp * st.u / (st.mp + st.mb); tw = d / st.u; dur = T0 + tw + T0;
      ro.vb.set(fx(vb, 2) + '\u00a0m/s');
      if (pb) pb.setScale(st.mp * st.u * 1.1);
      if (pl) pl.refresh(); else draw(0);
    }
    function draw(t) {
      var tt = clamp(t - T0, 0, tw), walking = t > T0 && t < T0 + tw;
      var xb = vb * tt, xrel = 0.6 + st.u * tt, xp = xb + xrel;
      hull.set([[xb, 0.35], [xb + Lb, 0.35], [xb + Lb - 0.35, -0.3], [xb + 0.25, -0.3]]); bl.set([xb + Lb / 2, 0.19]);
      var ph = walking ? Math.sin(tt * st.u * 5) * 0.18 : 0, y0 = 0.35;
      head.set({ center: [xp, y0 + 1.6], r: 0.17 }); bodyL.set([[xp, y0 + 1.43], [xp, y0 + 0.8]]);
      legs.set([[xp - ph, y0], [xp, y0 + 0.8], [xp + ph, y0]]); arms.set([[xp + ph * 0.8, y0 + 0.85], [xp, y0 + 1.3], [xp - ph * 0.8, y0 + 0.85]]);
      var cp = [xp, y0 + 0.95], cb = [xb + Lb / 2, 0.1], m = st.mp + st.mb, gx = (st.mp * cp[0] + st.mb * cb[0]) / m, gy = (st.mp * cp[1] + st.mb * cb[1]) / m;
      cgP.set({ center: cp, r: 0.045 }); cgB.set({ center: cb, r: 0.045 }); Gm.set([gx, gy]); Gline.set([gx, -0.9], [gx, 2.55]);
      var K = 0.9;
      vP.set([xp, y0 + 2.05], [walking ? (st.u + vb) * K : 0, 0]); vB.set([xb + Lb / 2, -0.6], [walking ? vb * K : 0, 0]);
      var g0 = (st.mp * (0.6) + st.mb * (Lb / 2)) / m;
      ro.xp.set(fx(xp - 0.6, 2) + '\u00a0m'); ro.xb.set(fx(xb, 2) + '\u00a0m'); ro.xg.set(fx(gx - g0, 2) + '\u00a0m');
      if (pb) pb.set({ p: walking ? st.mp * (st.u + vb) : 0, b: walking ? st.mb * vb : 0 });
    }
    var pl = null;
    recompute();
    pl = MOMENTUM.player({ stage: stage, duration: function () { return dur; }, onTime: draw });
    api.player = pl;
    api.set = function (v) { Object.assign(st, v || {}); recompute(); };
    if (panel) CYL.renderMath(panel);
    return api;
  };

  /* ======================================================================
     SOP.incline — block A on an incline θ, tied over a light pulley at the top to block B, which hangs. Released from
     rest. The work of every force on the system, the cord's tension on both blocks included, adds up to ΔT.
     opts: mA, mB (kg), th (degrees), mu (kinetic; static = mu + 0.05), D (m: how far the cord runs)
     ====================================================================== */
  SOP.inclineSolve = function (mA, mB, th, mu) {
    var s = Math.sin(th * D2R), c = Math.cos(th * D2R), drive = mB * G - mA * G * s, Fs = (mu + 0.05) * mA * G * c;
    if (Math.abs(drive) <= Fs) return { moves: false, a: 0, T: mB * G, F: -drive, sgn: 0 };
    var sg = drive > 0 ? 1 : -1, F = mu * mA * G * c, a = (drive - sg * F) / (mA + mB);
    return { moves: true, a: a, T: mB * (G - a), F: -sg * F, sgn: sg };      // a, F along the cord: + means B down, A up the slope
  };
  SOP.incline = function (o) {
    o = Object.assign({ mA: 10, mB: 8, th: 30, mu: 0, D: 2, sliders: true }, o || {});
    var stage = o.stage, panel = o.controls, api = mover();
    var st = { mA: o.mA, mB: o.mB, th: o.th, mu: o.mu }, show = { f: true }, Ls = 4.2, bw = 0.55;
    var p = CYL2D.plane(stage, { xRange: [-0.3, 5.2], yRange: [-0.6, 3.3], grid: 'none', axes: false, maxHeight: 430,
      ariaLabel: 'Block A rests on an incline; a cord tied to it runs up the slope, over a pulley at the top, and down to block B, which hangs. Released, B falls and pulls A up the slope. Force arrows show the weights, the normal force, friction and the tension of the cord on both blocks; the panel adds the work of every force.' });
    api.plane = p;
    var gI = p.group(), gD = p.group();
    var blkA = FMA.block(p, { w: bw, h: bw * 0.8, color: 'accent', label: 'A' }), blkB = FMA.block(p, { w: 0.42, h: 0.5, color: 'warn', label: 'B' });
    var cord1 = p.line([0, 0], [0, 0], { color: 'ink', width: 1.6 }), cord2 = p.line([0, 0], [0, 0], { color: 'ink', width: 1.6 });
    var f = { WA: FMA.force(p, { color: 'z', label: 'W_A' }), NA: FMA.force(p, { color: 'ink', label: 'N_A', labelSide: 'left' }), Ff: FMA.force(p, { color: 'r', label: 'F_f', minLength: 0.25 }),
      TA: FMA.force(p, { color: 'muted', label: 'T', labelSide: 'left' }), WB: FMA.force(p, { color: 'z', label: 'W_B' }), TB: FMA.force(p, { color: 'muted', label: 'T' }) };
    var cgA = p.circle({ center: [0, 0], r: 0.03, color: 'z', fill: 'z', fillOpacity: 1 }), cgB = p.circle({ center: [0, 0], r: 0.03, color: 'z', fill: 'z', fillOpacity: 1 });
    var ro = { a: CYL.readout('Acceleration \\(a\\)', { color: 'bad' }), T: CYL.readout('Tension \\(T\\)'), s: CYL.readout('Distance \\(s\\)'), v: CYL.readout('Speed \\(v\\)', { color: 'good' }) };
    var ledger = null, msg = null;
    if (panel) {
      chips(panel, [{ label: 'Forces', color: 'z', value: true, onChange: function (on) { show.f = on; draw(pl.t()); } }]);
      title(panel, 'The motion'); grid(panel, [ro.a, ro.T, ro.s, ro.v]);
      ledger = ENERGY.ledger(panel, { works: [{ key: 'WB', label: 'U_{W_B}', color: 'z' }, { key: 'WA', label: 'U_{W_A}', color: 'z' }, { key: 'Ff', label: 'U_f', color: 'r' },
        { key: 'TA', label: 'U_{T,A}', color: 'muted' }, { key: 'TB', label: 'U_{T,B}', color: 'muted' }], start: 'T_1', end: 'T_2', title: 'Work on the system so far (J)' });
      msg = note(panel, '');
      if (o.sliders) {
        title(panel, 'Change it');
        slider(panel, 'Mass of \\(A\\), \\(m_A\\)', 1, 20, 1, st.mA, 'kg', 'accent', function (v) { st.mA = v; recompute(); });
        slider(panel, 'Mass of \\(B\\), \\(m_B\\)', 1, 20, 1, st.mB, 'kg', 'warn', function (v) { st.mB = v; recompute(); });
        slider(panel, 'Slope \\(\\theta\\)', 10, 50, 1, st.th, '°', null, function (v) { st.th = v; recompute(); });
        slider(panel, 'Friction \\(\\mu_k\\)', 0, 0.5, 0.05, st.mu, '', 'r', function (v) { st.mu = v; recompute(); });
      }
    }
    var sol, dur = 1, th, c, sn, top, PR = 0.18;
    function recompute() {
      sol = SOP.inclineSolve(st.mA, st.mB, st.th, st.mu);
      th = st.th * D2R; c = Math.cos(th); sn = Math.sin(th); top = [0.2 + Ls * c, Ls * sn];
      gI.clear();
      gI.polyline([[0.2, 0], [top[0], 0], top], { closed: true, color: 'ink', width: 1.6, fill: 'surface', fillOpacity: 0.35 });
      gI.line([-0.25, 0], [5.15, 0], { color: 'ink', width: 2 });
      gI.arc({ center: [0.2, 0], r: 0.5, theta0: 0, theta1: th, color: 'muted', width: 1.2, arrow: false }); gI.label([0.78, 0.13], '\\theta', { color: 'muted' });
      var pc = add(top, [0.16, 0.12]); gI.line(top, pc, { color: 'ink', width: 3 }); pulleyWheel(gI, pc, PR);
      dur = sol.moves ? Math.sqrt(2 * o.D / Math.abs(sol.a)) : 1.5;
      ro.a.set(fx(sol.a, 3) + ' m/s²'); ro.T.set(fx(sol.T, 2) + ' N');
      if (ledger) {
        var U = Math.max(st.mB * G, st.mA * G * sn) * o.D * 1.05; ledger.setScale(-U, U);
      }
      if (msg) msg.textContent = !sol.moves ? 'Static friction holds the blocks: nothing moves, and no work is done.'
        : (sol.sgn > 0 ? 'B falls and pulls A up the slope.' : 'A slides down the slope and pulls B up.') + ' The tension does +Ts on one block and −Ts on the other: together, nothing. Only the weights and friction change the kinetic energy of the system.';
      if (pl) pl.refresh(); else draw(0);
    }
    function draw(t) {
      t = Math.min(t, dur);
      var sd = 0.5 * sol.a * t * t, v = sol.a * t, s0 = Ls * 0.42;      // s along the cord: + means B down
      var ua = s0 + sd, foot = [0.2 + ua * c, ua * sn], n = [-sn, c], along = [c, sn], hA = bw * 0.8;
      var cA = add(foot, mul(n, hA / 2)); blkA.set(cA, th);
      var pc = add(top, [0.16, 0.12]), xB = pc[0] + PR, yB = 1.25 - sd;
      blkB.set([xB, yB - 0.25], 0);
      var tA = add(cA, mul(along, bw / 2)), tang = add(pc, mul([-sn, c], PR));
      cord1.set(tA, tang); cord2.set([xB, pc[1]], [xB, yB]);
      cgA.set({ center: cA, r: 0.03 }); cgB.set({ center: [xB, yB - 0.25], r: 0.03 });
      var KF = 0.9 / Math.max(st.mA, st.mB) / G;
      [cgA, cgB].forEach(function (h) { h.setVisible(show.f); });
      if (show.f) {
        f.WA.set(cA, [0, -1], st.mA * G * KF); f.NA.set(add(foot, mul(along, 0.12)), n, st.mA * G * c * KF);
        if (Math.abs(sol.F) > 1e-9) f.Ff.set(add(foot, mul(along, -0.12)), mul(along, sol.F > 0 ? 1 : -1), Math.abs(sol.F) * KF); else f.Ff.hide();
        f.TA.set(add(tA, mul(n, 0.12)), along, sol.T * KF);
        f.WB.set([xB, yB - 0.25], [0, -1], st.mB * G * KF); f.TB.set([xB + 0.1, yB], [0, 1], sol.T * KF);
      } else Object.keys(f).forEach(function (k) { f[k].hide(); });
      ro.s.set(fx(sd, 2) + ' m'); ro.v.set(fx(Math.abs(v), 2) + ' m/s');
      if (ledger) {
        var T2 = 0.5 * (st.mA + st.mB) * v * v;
        ledger.set({ start: 0, WB: st.mB * G * sd, WA: -st.mA * G * sn * sd, Ff: sol.F * sd, TA: sol.T * sd, TB: -sol.T * sd, end: T2 });
      }
    }
    var pl = null;
    recompute();
    pl = MOMENTUM.player({ stage: stage, duration: function () { return dur; }, onTime: draw });
    api.player = pl;
    api.state = function () { return sol; };
    api.set = function (v) { Object.assign(st, v || {}); recompute(); };
    if (panel) CYL.renderMath(panel);
    return api;
  };

  /* ======================================================================
     SOP.plank — block b slides onto plank p (at rest on a smooth floor) at v0; kinetic friction μk between them.
       a_b = −μk g, a_p = μk g m_b/m_p until they share v_2 = m_b v0/(m_b + m_p). Friction is an internal pair:
       its work on b is −F x_b, on p +F x_p; together −F (x_b − x_p), the energy lost to heat.
     opts: mb, mp (kg), v0 (m/s), mu, Lp (plank length, m), momentum (show the momentum bars)
     ====================================================================== */
  SOP.plankSolve = function (mb, mp, v0, mu, Lp) {
    var F = mu * mb * G, ab = -mu * G, ap = F / mp, vc = mb * v0 / (mb + mp), ts = (v0 - vc) / (mu * G);
    var dmax = Lp - 0.5, ds = v0 * ts + 0.5 * (ab - ap) * ts * ts, off = ds > dmax, te = ts;
    if (off) { var A = 0.5 * (ap - ab), B = -v0; te = (-B - Math.sqrt(B * B - 4 * A * dmax)) / (2 * A); }   // reaches the far end first
    return { F: F, ab: ab, ap: ap, vc: vc, ts: ts, te: te, off: off, d: off ? dmax : ds };
  };
  SOP.plank = function (o) {
    o = Object.assign({ mb: 2, mp: 6, v0: 4, mu: 0.3, Lp: 4, momentum: false, sliders: true }, o || {});
    var stage = o.stage, panel = o.controls, api = mover();
    var st = { mb: o.mb, mp: o.mp, v0: o.v0, mu: o.mu }, Lp = o.Lp, T0 = 0.4, T1 = 0.7, ph = 0.2, bw = 0.6, bh = 0.5;
    var p = CYL2D.plane(stage, { xRange: [-1.6, 6.7], yRange: [-0.45, 1.45], grid: 'none', axes: false, maxHeight: 320,
      ariaLabel: 'A block slides onto the left end of a long plank that rests on a smooth floor. Friction between them slows the block and speeds up the plank until they move together. Friction arrows show the pair of forces between block and plank: backward on the block, forward on the plank.' });
    api.plane = p;
    ground(p, -1.55, 6.65, 0);
    for (var k = -1; k <= 6; k++) p.line([k, 0], [k, -0.12], { color: 'muted', width: 1.2 });
    p.polyline([[-1.55, 0], [-0.03, 0], [-0.03, 0.2], [-1.55, 0.2]], { closed: true, color: 'ink', width: 1.2, fill: 'muted', fillOpacity: 0.45 });
    var plank = p.polyline([], { closed: true, color: 'ink', width: 1.6, fill: 'surface', fillOpacity: 0.85 }), pl_ = p.label([0, 0], '\\text{plank}', { color: 'ink' });
    var blk = FMA.block(p, { w: bw, h: bh, color: 'warn', label: 'b' });
    var fb = FMA.force(p, { color: 'r', label: 'F_f', labelSide: 'right', minLength: 0.3 }), fp = FMA.force(p, { color: 'r', label: 'F_f', labelSide: 'left', minLength: 0.3 });
    var vb = arrow(p, 'good', '\\vvec_b'), vp = arrow(p, 'good', '\\vvec_p');
    var ro = { vb: CYL.readout('Block \\(v_b\\)', { color: 'good' }), vp: CYL.readout('Plank \\(v_p\\)', { color: 'good' }), d: CYL.readout('Slid along the plank'), lost: CYL.readout('Energy lost to friction', { color: 'r' }) };
    var ledger = null, pb = null, msg = null;
    if (panel) {
      title(panel, 'The motion'); grid(panel, [ro.vb, ro.vp, ro.d, ro.lost]);
      if (o.momentum) pb = MOMENTUM.pbars(panel, { items: [{ key: 'b', label: 'm_b v_b', color: 'warn' }, { key: 'p', label: 'm_p v_p', color: 'muted' }], total: { label: '\\sum mv' }, unit: 'kg·m/s', title: 'Momentum (kg·m/s)' });
      else ledger = ENERGY.ledger(panel, { works: [{ key: 'Ub', label: 'U_{f,b}', color: 'r' }, { key: 'Up', label: 'U_{f,p}', color: 'r' }], start: 'T_1', end: 'T_2', title: 'Work on the system so far (J)' });
      msg = note(panel, '');
      if (o.sliders) {
        title(panel, 'Change it');
        slider(panel, 'Block \\(m_b\\)', 1, 10, 0.5, st.mb, 'kg', 'warn', function (v) { st.mb = v; recompute(); });
        slider(panel, 'Plank \\(m_p\\)', 1, 20, 0.5, st.mp, 'kg', null, function (v) { st.mp = v; recompute(); });
        slider(panel, 'Speed \\(v_0\\)', 1, 6, 0.1, st.v0, 'm/s', 'good', function (v) { st.v0 = v; recompute(); });
        slider(panel, 'Friction \\(\\mu_k\\)', 0.1, 0.8, 0.05, st.mu, '', 'r', function (v) { st.mu = v; recompute(); });
      }
    }
    var sol, dur;
    function recompute() {
      sol = SOP.plankSolve(st.mb, st.mp, st.v0, st.mu, Lp); dur = T0 + sol.te + T1;
      var T1e = 0.5 * st.mb * st.v0 * st.v0;
      if (ledger) ledger.setScale(-T1e, T1e * 1.02);
      if (pb) pb.setScale(st.mb * st.v0 * 1.1);
      if (msg) msg.textContent = sol.off ? 'The block reaches the end of the plank before they move together: try a larger μk or a lower speed.'
        : 'They move together at ' + fmt(sol.vc, 3) + ' m/s after sliding ' + fmt(sol.d, 3) + ' m along the plank. ' + (o.momentum ? 'Friction is internal: the total momentum never changes.' : 'Friction does more negative work on the block than positive work on the plank, because the block slides farther.');
      if (pl) pl.refresh(); else draw(0);
    }
    function state(t) {          // positions of the block and the plank (left end), and velocities
      var xb0 = -1.2, xp0 = 0;
      if (t <= T0) return { xb: xb0 + st.v0 * t, xp: xp0, vb: st.v0, vp: 0, slide: false };
      var x0b = xb0 + st.v0 * T0, tt = Math.min(t - T0, sol.te);
      var xb = x0b + st.v0 * tt + 0.5 * sol.ab * tt * tt, xp = 0.5 * sol.ap * tt * tt, vbv = st.v0 + sol.ab * tt, vpv = sol.ap * tt;
      var after = t - T0 - sol.te;
      if (after > 0 && !sol.off) { xb += sol.vc * after; xp += sol.vc * after; }
      if (after > 0 && sol.off) { xb += vbv * after; xp += vpv * after; }
      return { xb: xb, xp: xp, vb: vbv, vp: vpv, slide: t - T0 < sol.te, tt: tt };
    }
    function draw(t) {
      var q = state(t), onPlank = t > T0;
      plank.set([[q.xp, 0], [q.xp + Lp, 0], [q.xp + Lp, ph], [q.xp, ph]]); pl_.set([q.xp + Lp - 0.55, ph + 0.17]);
      var by = ph;                                                  // the block arrives from a fixed ledge at deck height
      blk.set([q.xb + bw / 2, by + bh / 2], 0);
      var KF = 0.45 / Math.max(sol.F, 1);
      if (q.slide && onPlank) {
        var cx = q.xb + bw / 2;
        fb.set([cx - 0.05, by], [-1, 0], sol.F * KF); fp.set([cx + 0.05, ph], [1, 0], sol.F * KF);
      } else { fb.hide(); fp.hide(); }
      var K = 0.28;
      vb.set([q.xb + bw / 2, by + bh + 0.2], [q.vb * K, 0]); vp.set([q.xp + 0.3, ph + 0.18], [q.vp * K, 0]);
      var rel = onPlank ? Math.max(0, (q.xb - (-1.2 + st.v0 * T0)) - q.xp) : 0, lost = sol.F * rel;
      ro.vb.set(fx(q.vb, 2) + ' m/s'); ro.vp.set(fx(q.vp, 2) + ' m/s'); ro.d.set(fx(rel, 2) + ' m'); ro.lost.set(fx(lost, 2) + ' J');
      if (ledger) {
        var tt = q.tt || 0, dxb = st.v0 * tt + 0.5 * sol.ab * tt * tt, dxp = 0.5 * sol.ap * tt * tt;
        ledger.set({ start: 0.5 * st.mb * st.v0 * st.v0, Ub: -sol.F * dxb, Up: sol.F * dxp, end: 0.5 * st.mb * q.vb * q.vb + 0.5 * st.mp * q.vp * q.vp });
      }
      if (pb) pb.set({ b: st.mb * q.vb, p: st.mp * q.vp });
    }
    var pl = null;
    recompute();
    pl = MOMENTUM.player({ stage: stage, duration: function () { return dur; }, onTime: draw });
    api.player = pl;
    api.state = function () { return sol; };
    api.set = function (v) { Object.assign(st, v || {}); recompute(); };
    if (panel) CYL.renderMath(panel);
    return api;
  };

  /* ======================================================================
     SOP.ballistic — a bullet (mb, v) embeds in a block (M) hanging on two parallel cords of length L (the block stays
     level). Plastic impact, momentum conserved: v_2 = mb v/(mb + M); then T + V is conserved during the swing:
     h = v_2²/2g, θ = cos⁻¹(1 − h/L). The bullet's approach is drawn in slow motion.
     opts: mb (kg), M (kg), v (m/s), L (m)
     ====================================================================== */
  SOP.ballistic = function (o) {
    o = Object.assign({ mb: 0.02, M: 4, v: 334, L: 1.5, sliders: true }, o || {});
    var stage = o.stage, panel = o.controls, api = mover();
    var st = { mb: o.mb, M: o.M, v: o.v }, L = o.L, TA = 0.45, BWd = 0.5, BHt = 0.3, SEP = 0.4;
    var p = CYL2D.plane(stage, { xRange: [-1.7, 1.9], yRange: [-1.95, 0.35], grid: 'none', axes: false, maxHeight: 400,
      ariaLabel: 'A block hangs from a beam on two parallel cords. A bullet flies in from the left, shown slowed down, and embeds in the block, which swings up to the right, staying level, to a highest point; a dashed line marks the height it rises.' });
    api.plane = p;
    ceiling(p, -0.65, 0.65, 0.12);
    var pv = [[-SEP / 2, 0.12], [SEP / 2, 0.12]];
    var c1 = p.line([0, 0], [0, 0], { color: 'ink', width: 1.6 }), c2 = p.line([0, 0], [0, 0], { color: 'ink', width: 1.6 });
    var blk = FMA.block(p, { w: BWd, h: BHt, color: 'accent', label: 'M' });
    var bullet = p.polyline([], { closed: true, color: 'ink', width: 1.2, fill: 'warn', fillOpacity: 1 });
    var hLine = p.line([0, 0], [0, 0], { color: 'muted', width: 1, dashed: true }), h0Line = p.line([-0.9, 0], [1.5, 0], { color: 'muted', width: 1, dashed: true });
    var hDim = p.line([0, 0], [0, 0], { color: 'muted', width: 1.1, arrow: 'both', label: 'h', labelAt: 0.5, labelSide: 'left' });
    var vArr = arrow(p, 'good', '\\vvec_2');
    var ro = { vp: CYL.readout('Just after impact \\(v_2\\)', { color: 'good' }), T: CYL.readout('Kinetic energy kept'), h: CYL.readout('Rises \\(h\\)'), th: CYL.readout('Swings to \\(\\theta\\)') };
    var msg = null;
    if (panel) {
      title(panel, 'The impact and the swing'); grid(panel, [ro.vp, ro.T, ro.h, ro.th]);
      msg = note(panel, '');
      if (o.sliders) {
        title(panel, 'Change it');
        slider(panel, 'Bullet mass \\(m\\)', 0.005, 0.05, 0.001, st.mb, 'kg', 'warn', function (v) { st.mb = v; recompute(); });
        slider(panel, 'Bullet speed \\(v_1\\)', 100, 800, 1, st.v, 'm/s', 'good', function (v) { st.v = v; recompute(); });
        slider(panel, 'Block mass \\(M\\)', 1, 10, 0.5, st.M, 'kg', 'accent', function (v) { st.M = v; recompute(); });
      }
      note(panel, 'Cords ' + L + ' m long. The bullet\u2019s last half meter is drawn in slow motion; the swing is in real time.');
    }
    var vp, h, thm, dur, Tq;
    function recompute() {
      vp = st.mb * st.v / (st.mb + st.M); h = vp * vp / (2 * G);
      var c = 1 - h / L; thm = c > 0 ? Math.acos(c) : Math.PI / 2;
      // time to swing up to θm: integrate the pendulum θ'' = −(g/L) sin θ
      var th = 0, w = vp / L, t = 0, dt = 0.0005; while (w > 0 && t < 5) { var a = -(G / L) * Math.sin(th); w += a * dt; th += w * dt; t += dt; }
      Tq = t; dur = TA + Tq + 0.25;
      var T1 = 0.5 * st.mb * st.v * st.v, T2 = 0.5 * (st.mb + st.M) * vp * vp;
      ro.vp.set(fx(vp, 3) + '\u00a0m/s'); ro.T.set(fx(100 * T2 / T1, 2) + '\u00a0% of ' + fx(T1, 0) + '\u00a0J');
      ro.h.set(fx(Math.min(h, L), 3) + '\u00a0m'); ro.th.set(c > 0 ? fx(thm / D2R, 1) + '\u00b0' : 'past 90\u00b0');
      if (msg) msg.textContent = c > 0 ? 'The impact keeps only m/(m + M) of the bullet\u2019s kinetic energy; the rest becomes heat and damage. The swing then conserves T + V.'
        : 'The block would swing past the horizontal, and the cords would go slack: use a slower or lighter bullet.';
      if (pl) pl.refresh(); else draw(0);
    }
    function theta(t) {      // the swing, after the impact at t = TA
      if (t <= TA) return { th: 0, w: 0 };
      var tt = Math.min(t - TA, Tq), th = 0, w = vp / L, dt = 0.0005, k = 0;
      for (var q = 0; q < tt; q += dt) { var a = -(G / L) * Math.sin(th); w += a * dt; th += w * dt; }
      return { th: Math.min(th, thm), w: Math.max(w, 0) };
    }
    function draw(t) {
      var s = theta(t), th = s.th, off = [L * Math.sin(th), -L * Math.cos(th)];
      var top1 = add(pv[0], off), top2 = add(pv[1], off), bc = [off[0], off[1] + 0.12 - BHt / 2];
      c1.set(pv[0], top1); c2.set(pv[1], top2); blk.set(bc, 0);
      var by = bc[1], bx;
      if (t < TA) { bx = -BWd / 2 - 0.05 - 1.0 * (1 - t / TA); bullet.setVisible(true); }
      else { bx = bc[0] - BWd / 2 + 0.06; bullet.setVisible(true); }
      bullet.set([[bx - 0.12, by - 0.018], [bx - 0.02, by - 0.018], [bx + 0.02, by], [bx - 0.02, by + 0.018], [bx - 0.12, by + 0.018]]);
      var yb0 = 0.12 - L - BHt / 2, yTop = yb0 + Math.min(h, L);
      h0Line.set([-0.9, yb0], [1.5, yb0]); hLine.set([-0.3, yTop], [1.5, yTop]); hDim.set([1.4, yb0], [1.4, yTop]);
      var vv = t >= TA ? s.w * L : 0;
      vArr.set([bc[0] + BWd / 2 + 0.08, bc[1]], mul([Math.cos(th), Math.sin(th)], vv * 0.3));
    }
    var pl = null;
    recompute();
    pl = MOMENTUM.player({ stage: stage, duration: function () { return dur; }, onTime: draw });
    api.player = pl;
    api.set = function (v) { Object.assign(st, v || {}); recompute(); };
    if (panel) CYL.renderMath(panel);
    return api;
  };

  /* ======================================================================
     SOP.jerk — block A slides away from block B at v0 on a smooth floor; a slack cord of length Lc joins them. When it
     comes taut, the impulsive tension (inextensible cord, no rebound) gives both the common velocity
     v_2 = mA v0/(mA + mB); the cord's impulse on B is mB v_2.
     opts: mA, mB (kg), v0 (m/s), Lc (m)
     ====================================================================== */
  SOP.jerk = function (o) {
    o = Object.assign({ mA: 3, mB: 1, v0: 4, Lc: 1.6, sliders: true }, o || {});
    var stage = o.stage, panel = o.controls, api = mover();
    var st = { mA: o.mA, mB: o.mB, v0: o.v0 }, Lc = o.Lc, bw = 0.45, bh = 0.4, gap0 = 0.5, XB0 = -2.2;
    var p = CYL2D.plane(stage, { xRange: [-2.75, 5.3], yRange: [-0.35, 1.25], grid: 'none', axes: false, maxHeight: 280,
      ariaLabel: 'Block B rests on a smooth floor; block A slides away from it to the right, trailing a slack cord tied to both. When the cord comes taut it jerks: A slows down and B starts to move, and then they move together at the same speed.' });
    api.plane = p;
    ground(p, -2.7, 5.25, 0);
    for (var k = -2; k <= 5; k++) p.line([k, 0], [k, -0.1], { color: 'muted', width: 1.2 });
    var bA = FMA.block(p, { w: bw, h: bh, color: 'accent', label: 'A' }), bB = FMA.block(p, { w: bw, h: bh, color: 'warn', label: 'B' });
    var cord = p.polyline([], { color: 'ink', width: 1.6 });
    var iA = arrow(p, 'bad', '\\int T\\,dt', { width: 3, labelSide: 'right', labelAt: 0.5 }), iB = arrow(p, 'bad', '\\int T\\,dt', { width: 3, labelSide: 'left', labelAt: 0.5 });
    var vA = arrow(p, 'good', '\\vvec_A'), vB = arrow(p, 'good', '\\vvec_B');
    var ro = { vp: CYL.readout('Common velocity \\(v_2\\)', { color: 'good' }), imp: CYL.readout('Impulse of the cord', { color: 'bad' }), lost: CYL.readout('Energy lost in the jerk') };
    var pb = null;
    if (panel) {
      title(panel, 'The jerk'); grid(panel, [ro.vp, ro.imp, ro.lost]);
      pb = MOMENTUM.pbars(panel, { items: [{ key: 'A', label: 'm_A v_A', color: 'accent' }, { key: 'B', label: 'm_B v_B', color: 'warn' }], total: { label: '\\sum mv' }, unit: 'kg\u00b7m/s', title: 'Momentum (kg\u00b7m/s)' });
      if (o.sliders) {
        title(panel, 'Change it');
        slider(panel, 'Mass of \\(A\\)', 0.5, 6, 0.5, st.mA, 'kg', 'accent', function (v) { st.mA = v; recompute(); });
        slider(panel, 'Mass of \\(B\\)', 0.5, 6, 0.5, st.mB, 'kg', 'warn', function (v) { st.mB = v; recompute(); });
        slider(panel, 'Speed of \\(A\\), \\(v_0\\)', 0.5, 6, 0.1, st.v0, 'm/s', 'good', function (v) { st.v0 = v; recompute(); });
      }
      note(panel, 'Smooth floor, light inextensible cord ' + Lc + ' m long that does not rebound. The red arrows flash the cord\u2019s impulse on each block at the jerk.');
    }
    var vp, tj, dur;
    function recompute() {
      vp = st.mA * st.v0 / (st.mA + st.mB); tj = (Lc - gap0) / st.v0; dur = tj + Math.min(2.2, (5.0 - (XB0 + bw + Lc + bw)) / Math.max(vp, 0.3));
      ro.vp.set(fx(vp, 2) + '\u00a0m/s'); ro.imp.set(fx(st.mB * vp, 2) + '\u00a0N\u00b7s');
      ro.lost.set(fx(0.5 * st.mA * st.v0 * st.v0 - 0.5 * (st.mA + st.mB) * vp * vp, 2) + '\u00a0J');
      if (pb) pb.setScale(st.mA * st.v0 * 1.1);
      if (pl) pl.refresh(); else draw(0);
    }
    function draw(t) {
      var xB, xA, va, vb;
      if (t < tj) { xB = XB0; xA = XB0 + bw + gap0 + st.v0 * t; va = st.v0; vb = 0; }
      else { var tt = t - tj; xB = XB0 + vp * tt; xA = xB + bw + Lc; va = vp; vb = vp; }
      bA.set([xA + bw / 2, bh / 2], 0); bB.set([xB + bw / 2, bh / 2], 0);
      var a = [xB + bw, bh * 0.5], b = [xA, bh * 0.5], dist = b[0] - a[0], sag = dist < Lc ? Math.sqrt(Math.max(0, Lc * Lc - dist * dist)) * 0.35 : 0;
      var pts = []; for (var k = 0; k <= 24; k++) { var u = k / 24; pts.push([a[0] + dist * u, a[1] - sag * 4 * u * (1 - u)]); }
      cord.set(pts);
      var flash = t >= tj && t < tj + 0.35, J = st.mB * vp, LI = Math.min(0.65, 0.2 * J);
      if (flash) { iA.set([xA, bh * 0.5], [-LI, 0]); iB.set([xB + bw, bh * 0.5], [LI, 0]); } else { iA.hide(); iB.hide(); }       // the cord pulls each block from where it is tied
      var K = 0.22;
      vA.set([xA + bw / 2, bh + 0.55], [va * K, 0]); vB.set([xB + bw / 2, bh + 0.55], [vb * K, 0]);
      if (pb) pb.set({ A: st.mA * va, B: st.mB * vb });
    }
    var pl = null;
    recompute();
    pl = MOMENTUM.player({ stage: stage, duration: function () { return dur; }, onTime: draw });
    api.player = pl;
    api.set = function (v) { Object.assign(st, v || {}); recompute(); };
    if (panel) CYL.renderMath(panel);
    return api;
  };

  /* ======================================================================
     SOP.pucks — puck A slides at v toward puck B at rest on smooth ice; at contact A's velocity makes the angle phi
     with the line of impact n (the line through the centers). Smooth pucks: the t components do not change; along n,
     momentum is conserved and (v_B)_n2 − (v_A)_n2 = e[(v_A)_n1 − (v_B)_n1]. Uses MOMENTUM.pucks / MOMENTUM.oblique.
     opts: mA, mB (kg), v (m/s), phi (degrees), e, r (puck radius, m)
     ====================================================================== */
  SOP.pucks = function (o) {
    o = Object.assign({ mA: 0.2, mB: 0.3, v: 4, phi: 30, e: 0.8, r: 0.1, sliders: true }, o || {});
    var stage = o.stage, panel = o.controls, api = mover();
    var st = { mA: o.mA, mB: o.mB, v: o.v, phi: o.phi, e: o.e }, r = o.r, show = { c: true };
    var p = CYL2D.plane(stage, { xRange: [-1.25, 1.45], yRange: [-0.85, 0.85], grid: 'cartesian', gridStep: 0.25, axes: false, maxHeight: 420,
      ariaLabel: 'Two pucks on smooth ice seen from above. Puck A slides in from the left and strikes puck B, at rest, off center. At the moment of impact the line through their centers, the line of impact, and the tangent to it are drawn; after the impact B moves off along the line of impact and A moves off with its tangential velocity unchanged.' });
    api.plane = p;
    var gPath = p.group(), gHit = p.group(), gTop = p.group();
    var pA = gTop.circle({ center: [0, 0], r: r, color: 'ink', width: 1.6, fill: 'accent', fillOpacity: 0.55 }), pB = gTop.circle({ center: [0, 0], r: r, color: 'ink', width: 1.6, fill: 'warn', fillOpacity: 0.55 });
    var lA = gTop.label([0, 0], 'A', { color: 'ink' }), lB = gTop.label([0, 0], 'B', { color: 'ink' });
    var K = 0.09;
    var vA = arrow(gTop, 'good', '\\vvec_A'), vB = arrow(gTop, 'good', '\\vvec_B', { labelSide: 'right' });
    var cAn = arrow(gTop, 't', '(v_A)_{n1}', { width: 1.8, dashed: true, labelSide: 'left' }), cAt = arrow(gTop, 'accent', '(v_A)_{t1}', { width: 1.8, dashed: true, labelSide: 'right' });
    var ro = { phi: CYL.readout('Angle to the line of impact'), vA: CYL.readout('\\((v_A)_2\\)', { color: 'good' }), vB: CYL.readout('\\((v_B)_2\\)', { color: 'good' }), vt: CYL.readout('\\((v_A)_{t1} = (v_A)_{t2}\\)', { color: 'accent' }), lost: CYL.readout('Energy lost') };
    if (panel) {
      chips(panel, [{ label: 'Components of A along n and t', color: 't', value: true, onChange: function (on) { show.c = on; draw(pl.t()); } }]);
      title(panel, 'After the impact'); grid(panel, [ro.phi, ro.vA, ro.vB, ro.vt, ro.lost]);
      if (o.sliders) {
        title(panel, 'Change it');
        slider(panel, 'Angle \\(\\phi\\) between \\(\\vvec_A\\) and the line of impact', 0, 75, 1, st.phi, '°', 't', function (v) { st.phi = v; recompute(); });
        slider(panel, 'Restitution \\(e\\)', 0, 1, 0.05, st.e, '', null, function (v) { st.e = v; recompute(); });
        slider(panel, 'Mass of \\(A\\)', 0.1, 0.6, 0.05, st.mA, 'kg', 'accent', function (v) { st.mA = v; recompute(); });
        slider(panel, 'Mass of \\(B\\)', 0.1, 0.6, 0.05, st.mB, 'kg', 'warn', function (v) { st.mB = v; recompute(); });
      }
      note(panel, 'A slides at ' + o.v + ' m/s; B is at rest. Smooth pucks and smooth ice: only the push along the line of impact acts. The motion is shown at a quarter of real speed; velocity arrows show ' + K + ' s of travel.');
    }
    var run, res;
    function recompute() {
      var b = 2 * r * Math.sin(st.phi * D2R);
      run = MOMENTUM.pucks({ A: { m: st.mA, r: r, p: [-1.0, -b], v: [st.v, 0] }, B: { m: st.mB, r: r, p: [0, 0], v: [0, 0] }, e: st.e, tmax: 0.55 });
      res = run.hit ? run.hit.res : null;
      ro.phi.set(fx(st.phi, 0) + '\u00b0');
      if (res) {
        ro.vA.set(fx(len(res.vA2), 3) + '\u00a0m/s'); ro.vB.set(fx(len(res.vB2), 3) + '\u00a0m/s'); ro.vt.set(fx(Math.abs(res.vA1t), 3) + '\u00a0m/s'); ro.lost.set(fx(res.lost, 3) + '\u00a0J');
      }
      gHit.clear(); gPath.clear();
      if (run.hit) {
        var h = run.hit, n = h.n, t = [-n[1], n[0]], c = mul(add(h.pA, h.pB), 0.5);
        gHit.line(add(h.pA, mul(n, -0.45)), add(h.pB, mul(n, 0.6)), { color: 't', width: 1.2, dashed: true, label: 'n', labelAt: 0, labelSide: 'right' });
        gHit.line(add(c, mul(t, -0.35)), add(c, mul(t, 0.35)), { color: 'accent', width: 1.2, dashed: true, label: 't', labelAt: 1, labelSide: 'right' });
        gHit.circle({ center: h.pA, r: r, color: 'accent', width: 1, dashed: true }); gHit.circle({ center: h.pB, r: r, color: 'warn', width: 1, dashed: true });
        var e1 = run.at(0.55);
        gPath.line([-1.0, h.pA[1]], h.pA, { color: 'accent', width: 1, dashed: true }); gPath.line(h.pA, e1.pA, { color: 'accent', width: 1, dashed: true }); gPath.line(h.pB, e1.pB, { color: 'warn', width: 1, dashed: true });
      }
      if (pl) pl.refresh(); else draw(0);
    }
    function draw(t) {
      var q = run.at(t);
      pA.set({ center: q.pA, r: r }); pB.set({ center: q.pB, r: r }); lA.set(q.pA); lB.set(q.pB);
      vA.set(q.pA, mul(q.vA, K)); vB.set(q.pB, mul(q.vB, K));
      if (show.c && res && !q.after) {   // A's components before the impact; after it, the readout gives (v_A)_t2 = (v_A)_t1
        var n = res.n, tt = res.t;
        cAn.set(q.pA, mul(n, res.vA1n * K)); cAt.set(q.pA, mul(tt, res.vA1t * K));
      } else { cAn.hide(); cAt.hide(); }
    }
    var pl = null;
    recompute();
    pl = MOMENTUM.player({ stage: stage, duration: function () { return 0.55; }, onTime: draw });
    pl.setSpeed(0.25);
    api.player = pl;
    api.state = function () { return res; };
    api.set = function (v) { Object.assign(st, v || {}); recompute(); };
    if (panel) CYL.renderMath(panel);
    return api;
  };

  window.SOP = SOP;
})(window);
