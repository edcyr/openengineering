/*
 * polar-motion.js — POLAR: kinematics in polar and cylindrical coordinates, and the animated motion figures of the
 * Cylindrical Coordinates module. Classic script (IIFE) that attaches ONE global: POLAR. Requires CYL (cyl-core.js);
 * POLAR.figure also needs CYL2D (cyl-2d.js) and POLAR.figure3d needs CYL3D (cyl-3d.js). Load it after them.
 *
 * Kinematics
 *   A motion is {r(t), th(t), z(t)} (z optional: without it the motion is planar, z = 0), with optional analytic
 *   derivatives {rd, rdd, thd, thdd, zd, zdd} (functions of t). Missing derivatives are found by central
 *   differences, so any smooth r(t), θ(t), z(t) works.
 *   POLAR.state(motion, t) -> {t, r, th, z, rd, rdd, thd, thdd, zd, zdd,
 *       vr = ṙ, vt = rθ̇, vz = ż, ar = r̈ − rθ̇², at = rθ̈ + 2ṙθ̇, az = z̈,
 *       rddTerm = r̈, cent = −rθ̇² (centripetal), ang = rθ̈, cor = 2ṙθ̇ (Coriolis), v = |v|, a = |a|,
 *       x, y, vx, vy, ax, ay (Cartesian), ur = [cos θ, sin θ], ut = [−sin θ, cos θ],
 *       psi: the tangent angle ψ (Hibbeler), from the extended radial line to the tangent of the path in the r-θ
 *            plane, tan ψ = v_θ / v_r = r / (dr/dθ), in (−90°, 90°]; NaN at rest}
 *   POLAR.onPath(f, df, d2f, th, thd, thdd) -> a motion along the path r = f(θ) with θ = th(t), by the chain rule:
 *       ṙ = f′(θ) θ̇, r̈ = f″(θ) θ̇² + f′(θ) θ̈. df, d2f, thd, thdd may be null (numerical derivatives).
 *   POLAR.niceScale(maxMagnitude, maxLength) -> k from {1, 2, 2.5, 5} × 10^n with maxMagnitude / k <= maxLength.
 *
 * POLAR.figure(opts) -> controller. A 2D (r-θ plane) figure: an animated particle on its path with the radial line
 *   and the angle θ, v and a arrows, their radial and transverse (or x-y) components, the unit vectors u_r, u_θ and
 *   the tangent angle ψ. A transport row under the plot (Play/Pause, Reset, time slider, Playback) and a control
 *   panel of "Show" chips. Live numbers as cards under the plot (readoutsEl) or as a list in the control panel.
 *   opts:
 *     stage (element, required), controls (element), transport:true, playback:true, motion (required), t0, t1,
 *     t (start time), speed:1 (simulated s per real s), loop:true, autoplay:false (never with reduced motion),
 *     xRange, yRange, grid:'polar', polarStep, gridStep, axisLabels:['x','y'], unit:'m', timeUnit:'s',
 *     height (px, or a function of the stage width), maxHeight, aria (REQUIRED plain-text description),
 *     show: {path:true, trace:true, v:true, a:true, comps:'rt'|'xy'|'none', frame:false, radial:true, psi:false},
 *     toggles: ['v','a','comps','frame','radial','psi','trace'] (chips in this order; 'comps' is a select),
 *     readouts: keys of RO below, readoutsEl (cards under the stage), vScale / aScale (fixed arrow scales, per unit
 *     of plot length), arrowMax:0.3 (longest arrow as a fraction of the plot span), draggable:true,
 *     guide: false | {width, color} (draw the whole path as a fixed channel, under everything),
 *     arm: null | {length, width} (a slotted arm from O through the particle, turning with θ),
 *     mass: null (kg; enables the ΣF readouts Fr, Ft, Fz, F = m·a), pointLabel:'P', originLabel:'O',
 *     scaleNote:true (the "Arrows are to scale" line under the controls),
 *     decorate(plane): fixed scenery drawn first, onUpdate(state, fig): called after every redraw.
 *   controller: {plane, el, state(), t(), setT(t), play(), pause(), reset(), isPlaying(), setMotion(motion, t0, t1, t),
 *     setRange(xr, yr), setShow(key, value), setScales(vScale, aScale), scales(), update(), destroy(), readoutEls}
 *
 * POLAR.figure3d(opts) -> controller. The same for motion in space (r, θ, z), in a CYL3D view: path, trace, the
 *   radial line from the axis, v and a with their components along u_r, u_θ, u_z (tip to tail), optional unit vectors.
 *   opts: as POLAR.figure where they apply (stage, controls, transport, playback, motion, t0, t1, t, speed,
 *     loop:false, autoplay, aria, readouts, readoutsEl, vScale, aScale, mass, decorate(viewer) -> {update(state)}?,
 *     onUpdate), plus extent:2.5, zRange:[-0.2, 4.2], camera (CYL3D camera spec), arrowMax:1.7 (world units),
 *     show: {path:true, trace:true, v:true, a:true, vc:false, ac:true, radial:true, drop:false, frame:false},
 *     toggles: ['path','v','a','vc','ac','frame'].
 *   controller: {viewer, el, state(), t(), setT(t), play(), pause(), reset(), isPlaying(),
 *     setMotion(motion, t0, t1, t), setShow(key, value), setScales(vScale, aScale), scales(), setCamera(spec, animate),
 *     update(), readoutEls}
 *
 * POLAR.robotArm(viewer, {hw:0.25, column:3}) and POLAR.helixSlide(viewer, {r, th0, thd, z0, zd, t1}): scenery for
 *   figure3d's decorate(). Each returns {group, update(state)}.
 */
(function (window, document) {
  'use strict';
  if (window.POLAR) return;
  var CYL = window.CYL;
  var POLAR = { version: '1.0.0' };
  var EPS = 1e-9, PI = Math.PI, TAU = 2 * Math.PI;

  /* ------------------------------------------------------------------ kinematics */
  function val(f, t) {
    try { var v = f(t); return typeof v === 'number' ? v : NaN; } catch (e) { return NaN; }
  }
  function d1(f, t) {
    var h = 1e-4 * Math.max(1, Math.abs(t));
    return (val(f, t + h) - val(f, t - h)) / (2 * h);
  }
  function d2(f, t) {
    var h = 2e-3 * Math.max(1, Math.abs(t));
    return (val(f, t + h) - 2 * val(f, t) + val(f, t - h)) / (h * h);
  }
  function deriv(m, key, dkey, ddkey, t) {   // [value, first, second] for one coordinate
    var f = m[key];
    if (!f) return [0, 0, 0];
    var x = val(f, t);
    var xd = m[dkey] ? val(m[dkey], t) : d1(f, t);
    var xdd = m[ddkey] ? val(m[ddkey], t) : (m[dkey] ? d1(m[dkey], t) : d2(f, t));
    return [x, xd, xdd];
  }
  function lineAngle(vr, vt) {               // ψ in (−π/2, π/2]: the tangent LINE, not the direction of travel
    if (!(Math.abs(vr) + Math.abs(vt) > EPS)) return NaN;
    var a = Math.atan2(vt, vr);
    if (a > PI / 2 + 1e-12) a -= PI;
    else if (a <= -PI / 2 + 1e-12) a += PI;
    return a;
  }

  POLAR.state = function (m, t) {
    var R = deriv(m, 'r', 'rd', 'rdd', t), T = deriv(m, 'th', 'thd', 'thdd', t), Z = deriv(m, 'z', 'zd', 'zdd', t);
    var r = R[0], rd = R[1], rdd = R[2], th = T[0], thd = T[1], thdd = T[2];
    var c = Math.cos(th), s = Math.sin(th);
    var vr = rd, vt = r * thd, vz = Z[1];
    var cent = -r * thd * thd, ang = r * thdd, cor = 2 * rd * thd;
    var ar = rdd + cent, at = ang + cor, az = Z[2];
    return {
      t: t, r: r, th: th, z: Z[0], rd: rd, rdd: rdd, thd: thd, thdd: thdd, zd: Z[1], zdd: Z[2],
      vr: vr, vt: vt, vz: vz, ar: ar, at: at, az: az,
      rddTerm: rdd, cent: cent, ang: ang, cor: cor,
      v: Math.sqrt(vr * vr + vt * vt + vz * vz), a: Math.sqrt(ar * ar + at * at + az * az),
      x: r * c, y: r * s,
      vx: vr * c - vt * s, vy: vr * s + vt * c, ax: ar * c - at * s, ay: ar * s + at * c,
      ur: [c, s], ut: [-s, c],
      psi: lineAngle(vr, vt)
    };
  };

  POLAR.onPath = function (f, df, d2f, th, thd, thdd) {
    var h = 1e-4;
    df = df || function (q) { return (f(q + h) - f(q - h)) / (2 * h); };
    d2f = d2f || function (q) { var k = 2e-3; return (f(q + k) - 2 * f(q) + f(q - k)) / (k * k); };
    var m = { th: th, r: function (t) { return f(th(t)); } };
    if (thd) {
      m.thd = thd;
      m.rd = function (t) { return df(th(t)) * thd(t); };
      if (thdd) {
        m.thdd = thdd;
        m.rdd = function (t) { var q = th(t), w = thd(t); return d2f(q) * w * w + df(q) * thdd(t); };
      }
    }
    return m;
  };

  var NICE = [1, 2, 2.5, 5];
  POLAR.niceScale = function (maxMag, maxLen) {
    if (!(maxMag > EPS) || !(maxLen > 0)) return 1;
    var need = maxMag / maxLen;
    var e = Math.floor(Math.log(need) / Math.LN10);
    for (var k = e - 1; k <= e + 1; k++) {
      for (var i = 0; i < NICE.length; i++) {
        var c = NICE[i] * Math.pow(10, k);
        if (c >= need * (1 - 1e-9)) return +c.toPrecision(3);
      }
    }
    return need;
  };
  function niceStep(raw) {                   // 1, 2, 5 × 10^n at or above raw
    if (!(raw > 0)) return 0.01;
    var m = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), n = raw / m;
    return +((n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * m).toPrecision(3);
  }

  /* ------------------------------------------------------------------ formatting */
  function f4(x) { return CYL.fmt(Math.abs(x) < 1e-6 ? 0 : x, 4); }   // hides numerical-derivative noise such as 4e-10
  function deg(x) { return CYL.fmt(Math.abs(x) < 1e-9 ? 0 : x * 180 / PI, 4) + '\u00b0'; }

  /* ------------------------------------------------------------------ live numbers (shared by both figures)
     key: [label in the control panel, label on a card, color, card (s state, v velocity, a acceleration, f force),
           kind ('total' = the card's magnitude row, 'sub' = a part of the row above it)] */
  var RO = {
    t: ['\\(t\\)', 'Time \\(t\\)', null, 's'],
    r: ['\\(r\\)', '\\(r\\)', 'r', 's'],
    th: ['\\(\\theta\\)', '\\(\\theta\\)', 't', 's'],
    z: ['\\(z\\)', '\\(z\\)', 'z', 's'],
    pos: ['\\((x, y)\\)', 'Position \\((x, y)\\)', null, 's'],
    rd: ['\\(\\dot r\\)', '\\(\\dot r\\)', 'r', 's'],
    thd: ['\\(\\dot\\theta\\)', '\\(\\dot\\theta\\)', 't', 's'],
    zd: ['\\(\\dot z\\)', '\\(\\dot z\\)', 'z', 's'],
    rdd: ['\\(\\ddot r\\)', '\\(\\ddot r\\)', 'r', 's'],
    thdd: ['\\(\\ddot\\theta\\)', '\\(\\ddot\\theta\\)', 't', 's'],
    psi: ['Tangent angle \\(\\psi\\)', 'Tangent angle \\(\\psi\\)', null, 's'],
    vr: ['\\(v_r = \\dot r\\)', '\\(v_r = \\dot r\\)', 'r', 'v'],
    vt: ['\\(v_\\theta = r\\dot\\theta\\)', '\\(v_\\theta = r\\dot\\theta\\)', 't', 'v'],
    vz: ['\\(v_z = \\dot z\\)', '\\(v_z = \\dot z\\)', 'z', 'v'],
    vx: ['\\(v_x\\)', '\\(v_x\\)', 'x', 'v'],
    vy: ['\\(v_y\\)', '\\(v_y\\)', 'y', 'v'],
    v: ['Speed \\(v = |\\vvec|\\)', 'Speed \\(v = |\\vvec|\\)', 'good', 'v', 'total'],
    ar: ['\\(a_r = \\ddot r - r\\dot\\theta^2\\)', '\\(a_r = \\ddot r - r\\dot\\theta^2\\)', 'r', 'a'],
    ar_rdd: ['\\(\\ddot r\\)', '\\(\\ddot r\\)', null, 'a', 'sub'],
    ar_cent: ['centripetal \\(-r\\dot\\theta^2\\)', 'centripetal \\(-r\\dot\\theta^2\\)', null, 'a', 'sub'],
    at: ['\\(a_\\theta = r\\ddot\\theta + 2\\dot r\\dot\\theta\\)', '\\(a_\\theta = r\\ddot\\theta + 2\\dot r\\dot\\theta\\)', 't', 'a'],
    at_ang: ['\\(r\\ddot\\theta\\)', '\\(r\\ddot\\theta\\)', null, 'a', 'sub'],
    at_cor: ['Coriolis \\(2\\dot r\\dot\\theta\\)', 'Coriolis \\(2\\dot r\\dot\\theta\\)', null, 'a', 'sub'],
    az: ['\\(a_z = \\ddot z\\)', '\\(a_z = \\ddot z\\)', 'z', 'a'],
    ax: ['\\(a_x\\)', '\\(a_x\\)', 'x', 'a'],
    ay: ['\\(a_y\\)', '\\(a_y\\)', 'y', 'a'],
    a: ['\\(|\\avec|\\)', '\\(|\\avec|\\)', 'bad', 'a', 'total'],
    Fr: ['\\(\\Sigma F_r = m a_r\\)', '\\(\\Sigma F_r = m a_r\\)', 'r', 'f'],
    Ft: ['\\(\\Sigma F_\\theta = m a_\\theta\\)', '\\(\\Sigma F_\\theta = m a_\\theta\\)', 't', 'f'],
    Fz: ['\\(\\Sigma F_z = m a_z\\)', '\\(\\Sigma F_z = m a_z\\)', 'z', 'f'],
    F: ['\\(|\\Sigma\\Fvec|\\)', '\\(|\\Sigma\\Fvec|\\)', null, 'f', 'total']
  };
  var CARD_ORDER = {
    s: ['t', 'r', 'th', 'z', 'pos', 'rd', 'thd', 'zd', 'rdd', 'thdd', 'psi'],
    v: ['vr', 'vt', 'vz', 'vx', 'vy', 'v'],
    a: ['ar', 'ar_rdd', 'ar_cent', 'at', 'at_ang', 'at_cor', 'az', 'ax', 'ay', 'a'],
    f: ['Fr', 'Ft', 'Fz', 'F']
  };

  // Builds the live numbers: cards in o.readoutsEl, or a list in the control panel. Returns set(state).
  function makeReadouts(o, panel) {
    var els = {}, cards = !!o.readoutsEl, U = o.unit, UV = U + '/' + o.timeUnit, UA = UV + '\u00b2';
    var keys = (o.readouts || []).filter(function (k) { return RO[k] && (o.mass || RO[k][3] !== 'f'); });
    if (cards) {
      o.readoutsEl.innerHTML = '';
      var card = function (title, sw, group) {
        var list = CARD_ORDER[group].filter(function (k) { return keys.indexOf(k) >= 0; });
        if (!list.length) return null;
        var h = CYL.el('p', { class: 'mf-card-title' }, [CYL.el('span', { class: 'mf-sw' + (sw ? ' ' + sw : ''), 'aria-hidden': 'true' }), CYL.el('span', { html: title })]);
        CYL.renderMath(h);
        return CYL.el('div', { class: 'mf-card' }, [h, CYL.el('div', { class: 'readout-grid' }, list.map(function (k) {
          var d = RO[k];
          var r = els[k] = CYL.readout(d[1], { color: d[4] ? null : d[2] });
          if (d[4] === 'total') r.el.classList.add('mf-total');
          if (d[4] === 'sub') r.el.classList.add('mf-sub');
          return r.el;
        }))]);
      };
      var col = function (list) {
        list = list.filter(Boolean);
        return list.length ? CYL.el('div', { class: 'mf-col' }, list) : null;
      };
      [col([card('State', null, 's'), card('Velocity \\(\\vvec\\) <span class="mf-unit">(' + UV + ')</span>', 'mf-sw-v', 'v')]),
       col([card('Acceleration \\(\\avec\\) <span class="mf-unit">(' + UA + ')</span>', 'mf-sw-a', 'a'),
            card('Resultant force \\(\\Sigma\\Fvec = m\\avec\\) <span class="mf-unit">(N)</span>', 'mf-sw-f', 'f')])
      ].forEach(function (c) { if (c) o.readoutsEl.appendChild(c); });
    } else if (panel && keys.length) {
      var grid = CYL.el('div', { class: 'readout-grid', 'aria-live': 'off' });
      keys.forEach(function (k) {
        var d = RO[k];
        els[k] = CYL.readout(d[0], { color: d[4] === 'sub' ? null : d[2] });
        if (d[4] === 'sub') els[k].el.classList.add('mf-sub');
        grid.appendChild(els[k].el);
      });
      panel.appendChild(CYL.el('p', { class: 'viz-title', text: 'Live values' }));
      panel.appendChild(grid);
    }
    function u(unit) { return cards ? '' : '\u00a0' + unit; }   // on a card the unit is in the card title
    function set(s) {
      function R(k, v) { if (els[k]) els[k].set(v); }
      R('t', f4(s.t) + '\u00a0' + o.timeUnit);
      R('r', f4(s.r) + '\u00a0' + U);
      R('th', f4(s.th) + '\u00a0rad (' + deg(s.th) + ')');
      R('z', f4(s.z) + '\u00a0' + U);
      R('pos', '(' + f4(s.x) + ', ' + f4(s.y) + ')\u00a0' + U);
      R('rd', f4(s.rd) + '\u00a0' + UV);
      R('thd', f4(s.thd) + '\u00a0rad/' + o.timeUnit);
      R('zd', f4(s.zd) + '\u00a0' + UV);
      R('rdd', f4(s.rdd) + '\u00a0' + UA);
      R('thdd', f4(s.thdd) + '\u00a0rad/' + o.timeUnit + '\u00b2');
      R('psi', isFinite(s.psi) ? deg(s.psi) : '\u2014');
      R('vr', f4(s.vr) + u(UV)); R('vt', f4(s.vt) + u(UV)); R('vz', f4(s.vz) + u(UV));
      R('vx', f4(s.vx) + u(UV)); R('vy', f4(s.vy) + u(UV));
      R('v', f4(s.v) + u(UV));
      R('ar', f4(s.ar) + u(UA)); R('ar_rdd', f4(s.rddTerm) + u(UA)); R('ar_cent', f4(s.cent) + u(UA));
      R('at', f4(s.at) + u(UA)); R('at_ang', f4(s.ang) + u(UA)); R('at_cor', f4(s.cor) + u(UA));
      R('az', f4(s.az) + u(UA)); R('ax', f4(s.ax) + u(UA)); R('ay', f4(s.ay) + u(UA));
      R('a', f4(s.a) + u(UA));
      if (o.mass) {
        var m = o.mass;
        R('Fr', f4(m * s.ar) + u('N')); R('Ft', f4(m * s.at) + u('N')); R('Fz', f4(m * s.az) + u('N'));
        R('F', f4(m * s.a) + u('N'));
      }
    }
    return { els: els, set: set };
  }

  /* ------------------------------------------------------------------ transport (shared)
     ctx: {stage, o, getT(), setT(t), range() -> [t0, t1], drive(fn(dt) -> false to stop) -> stop()} */
  var ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 5.2v13.6L18.6 12z"/></svg>';
  var ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M6.8 5h3.6v14H6.8zM13.6 5h3.6v14h-3.6z"/></svg>';
  var ICON_RESET = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4.2h4.2"/></svg>';

  function makeTransport(ctx) {
    var o = ctx.o, stop = null, rate = 1, playLabel = null, playBtn = null, tSlider = null;
    function hund(x) { return Math.round(x * 100) / 100; }
    function syncPlay() {   // Pause while playing; Replay when stopped at the end; Play otherwise
      if (!playBtn) return;
      var rg = ctx.range();
      var key = stop ? 'Pause' : (!o.loop && ctx.getT() >= rg[1] - 1e-9 ? 'Replay' : 'Play');
      if (key === playLabel) return;
      playLabel = key;
      playBtn.innerHTML = (stop ? ICON_PAUSE : ICON_PLAY) + '<span>' + key + '</span>';
    }
    function play() {
      if (stop) return;
      var rg = ctx.range();
      if (!(rg[1] - rg[0] > 1e-9)) return;
      if (ctx.getT() >= rg[1] - 1e-9) ctx.setT(rg[0]);
      stop = ctx.drive(function (dt) {
        var r2 = ctx.range(), t = ctx.getT() + dt * o.speed * rate, ended = false;
        if (t >= r2[1]) {
          if (o.loop) t = r2[0] + (t - r2[1]) % Math.max(EPS, r2[1] - r2[0]);
          else { t = r2[1]; ended = true; }
        }
        ctx.setT(t);
        if (ended) { stop = null; syncPlay(); return false; }
      });
      syncPlay();
    }
    function pause() {   // stopping mid-play rounds t to the hundredth shown, so the numbers match it
      if (stop) {
        stop(); stop = null;
        var rg = ctx.range();
        ctx.setT(Math.min(rg[1], Math.max(rg[0], hund(ctx.getT()))));
      }
      syncPlay();
    }
    function reset() { pause(); ctx.setT(ctx.range()[0]); }
    var api = { play: play, pause: pause, reset: reset, isPlaying: function () { return !!stop; }, syncPlay: syncPlay, syncSlider: function () {} };
    if (!o.transport) return api;

    var bar = CYL.el('div', { class: 'mf-transport' });
    playBtn = CYL.button(ICON_PLAY + '<span>Play</span>', function () { if (stop) pause(); else play(); }, { primary: true });
    var resetBtn = CYL.button(ICON_RESET + '<span>Reset</span>', function () { reset(); });
    // The slider's value is the fraction u = (t − t0)/(t1 − t0), so a new motion needs no new slider. Scrubbing sets t
    // to whole hundredths of a second, so the readouts match the time shown. Keyboard: arrows step by a round time
    // step (about 1/50 of the motion; Shift: a fifth of that), Page Up/Down by 10 steps, Home/End to the ends.
    function tText(t) { return CYL.fmtFixed(hund(t), 2) + '\u00a0' + o.timeUnit; }
    tSlider = CYL.slider({
      label: 'Time \\(t\\)', min: 0, max: 1, step: 'any', value: 0,
      format: function (u) { var rg = ctx.range(); return tText(rg[0] + u * (rg[1] - rg[0])); },
      onInput: function (u) { pause(); var rg = ctx.range(); ctx.setT(Math.min(rg[1], hund(rg[0] + u * (rg[1] - rg[0])))); }
    });
    tSlider.input.addEventListener('keydown', function (e) {
      var rg = ctx.range(), T = rg[1] - rg[0];
      if (e.altKey || e.ctrlKey || e.metaKey || !(T > 1e-9)) return;
      var st = niceStep(T / 50), t = ctx.getT() - rg[0], nt;
      if (e.shiftKey) st = st / 5;
      switch (e.key) {
        case 'ArrowRight': case 'ArrowUp': nt = (Math.floor(t / st + 1e-6) + 1) * st; break;
        case 'ArrowLeft': case 'ArrowDown': nt = (Math.ceil(t / st - 1e-6) - 1) * st; break;
        case 'PageUp': nt = (Math.floor(t / (10 * st) + 1e-6) + 1) * 10 * st; break;
        case 'PageDown': nt = (Math.ceil(t / (10 * st) - 1e-6) - 1) * 10 * st; break;
        case 'Home': nt = 0; break;
        case 'End': nt = T; break;
        default: return;
      }
      e.preventDefault();
      pause();
      ctx.setT(rg[0] + Math.min(T, Math.max(0, hund(nt))));
    });
    bar.appendChild(playBtn);
    bar.appendChild(resetBtn);
    bar.appendChild(tSlider.el);
    if (o.playback) {
      var opts = o.playbackRates || [0.5, 1, 2];
      var speedSel = CYL.select({
        label: 'Playback',
        options: opts.map(function (x) { return { value: x, label: CYL.fmt(x) + '\u00d7' }; }),
        value: opts.indexOf(1) >= 0 ? 1 : opts[0],
        onChange: function (x) { rate = x; }
      });
      rate = speedSel.get();
      speedSel.el.classList.add('inline');
      bar.appendChild(speedSel.el);
    }
    // The transport sits in its own row under the stage: stage and transport share a column wrapper, .mf-main.
    var host = ctx.stage.parentNode, main = host;
    if (host && !host.classList.contains('mf-main')) {
      main = document.createElement('div');
      main.className = 'mf-main';
      host.insertBefore(main, ctx.stage);
      main.appendChild(ctx.stage);
    }
    if (main) {
      Array.prototype.forEach.call(main.querySelectorAll(':scope > .mf-transport'), function (n) { n.remove(); });
      main.appendChild(bar);
    } else ctx.stage.appendChild(bar);
    api.syncSlider = function () {
      var rg = ctx.range(), T = rg[1] - rg[0], t = ctx.getT();
      var u = T > 0 ? (t - rg[0]) / T : 0;
      // move the slider only when it does not already show this time (never undo a keyboard step)
      if (tText(rg[0] + tSlider.get() * T) !== tText(t) || Math.abs(tSlider.get() - u) > 0.02) tSlider.set(u, true);
      playBtn.disabled = !(T > 1e-9);
      tSlider.input.disabled = !(T > 1e-9);
    };
    api.refreshSlider = function () { tSlider.set(tSlider.get(), true); };   // re-format after the range changed
    api.bar = bar;
    syncPlay();
    return api;
  }

  /* ================================================================== 2D figure */
  POLAR.figure = function (opts) {
    var o = Object.assign({
      t0: 0, t1: 1, speed: 1, loop: true, autoplay: false, transport: true, playback: true, draggable: true,
      grid: 'polar', axisLabels: ['x', 'y'], unit: 'm', timeUnit: 's', arrowMax: 0.3,
      toggles: ['v', 'a', 'comps', 'frame', 'radial'],
      readouts: ['t', 'r', 'th', 'vr', 'vt', 'v', 'ar', 'at', 'a'],
      pointLabel: 'P', originLabel: 'O', mass: null, guide: false, arm: null
    }, opts || {});
    var show = Object.assign({ path: true, trace: true, v: true, a: true, comps: 'rt', frame: false, radial: true, psi: false }, o.show || {});
    var m = o.motion, t0 = o.t0, t1 = o.t1, t = o.t != null ? o.t : o.t0;
    var span = Math.max(o.xRange[1] - o.xRange[0], o.yRange[1] - o.yRange[0]);

    function baseHeight() {
      if (typeof o.height === 'function') return o.height(o.stage.clientWidth || 0);
      return o.height !== undefined ? o.height : Math.min(o.maxHeight || 480, 400);
    }
    var curH = baseHeight();
    var planeOpts = {
      xRange: o.xRange, yRange: o.yRange, grid: o.grid, gridStep: o.gridStep || null,
      axisLabels: o.axisLabels, ariaLabel: o.aria, maxHeight: o.maxHeight || 480, height: curH
    };
    if (o.polarStep) planeOpts.polarStep = o.polarStep;
    if (o.polarMax) planeOpts.polarMax = o.polarMax;
    if (o.angleLabels) planeOpts.angleLabels = o.angleLabels;
    var p = CYL2D.plane(o.stage, planeOpts);
    if (typeof o.decorate === 'function') { try { o.decorate(p); } catch (e) { CYL.error('POLAR.figure decorate failed:', e); } }

    /* ----- drawing items, back to front ----- */
    var N = 360, samples = [];
    function sample() {
      samples = [];
      for (var i = 0; i <= N; i++) {
        var tt = t0 + (t1 - t0) * i / N, r = val(m.r, tt), th = val(m.th, tt);
        samples.push([r * Math.cos(th), r * Math.sin(th), tt]);
      }
    }
    sample();
    function pts() { return samples.map(function (q) { return [q[0], q[1]]; }); }
    var guide = o.guide ? p.polyline(pts(), { color: o.guide.color || 'surface', width: o.guide.width || 12, opacity: 0.4 }) : null;
    var arm = o.arm ? p.line([0, 0], [1, 0], { color: o.arm.color || 'surface', width: o.arm.width || 9, opacity: 0.6 }) : null;
    var ghost = p.polyline([], { color: 'muted', width: 1.5, dashed: true });
    var trace = p.polyline([], { color: 'accent', width: 3 });
    var gRad = p.group();
    var radial = gRad.line([0, 0], [1, 0], { color: 'r', width: 2, label: 'r', labelSide: 'left', labelAt: 0.3 });   // off-center: a often ends mid-way
    var thArc = gRad.arc({ center: [0, 0], rPx: 30, theta0: 0, theta1: 0.5, color: 't', width: 1.75, arrow: true, label: '\\theta' });
    var gPsi = p.group();
    var extLine = gPsi.line([0, 0], [1, 0], { color: 'muted', width: 1.25, dashed: true });
    var tanLine = gPsi.line([0, 0], [1, 0], { color: 'muted', width: 1.25, dashed: true });
    var psiArc = gPsi.arc({ center: [0, 0], rPx: 26, theta0: 0, theta1: 0.5, color: 'warn', width: 1.75, arrow: false, label: '\\psi' });
    var gFrame = p.group();
    var eR = gFrame.line([0, 0], [1, 0], { color: 'r', width: 2.25, arrow: true, label: '\\er', labelAt: 1, labelSide: 'right' });
    var eT = gFrame.line([0, 0], [0, 1], { color: 't', width: 2.25, arrow: true, label: '\\et', labelAt: 1, labelSide: 'left' });
    var gComp = p.group();
    var cV1 = gComp.line([0, 0], [0, 0], { color: 'r', width: 2, arrow: true, dashed: true, label: 'v_r', labelSide: 'right' });
    var cV2 = gComp.line([0, 0], [0, 0], { color: 't', width: 2, arrow: true, dashed: true, label: 'v_\\theta', labelSide: 'right' });
    var cA1 = gComp.line([0, 0], [0, 0], { color: 'r', width: 2.25, arrow: true, label: 'a_r', labelSide: 'left' });
    var cA2 = gComp.line([0, 0], [0, 0], { color: 't', width: 2.25, arrow: true, label: 'a_\\theta', labelSide: 'left' });
    var vArrow = p.line([0, 0], [0, 0], { color: 'good', width: 3.25, arrow: true, label: '\\vvec', labelAt: 1, labelSide: 'left' });
    var aArrow = p.line([0, 0], [0, 0], { color: 'bad', width: 3.25, arrow: true, label: '\\avec', labelAt: 1, labelSide: 'right' });
    var overlay = p.group();                   // for pages: forces and other arrows drawn in onUpdate
    if (o.originLabel) p.point([0, 0], { color: 'ink', r: 3.5, label: o.originLabel, labelAnchor: 'sw' });

    function nearest(q) {
      var best = 0, bd = Infinity;
      for (var i = 0; i < samples.length; i++) {
        var dx = samples[i][0] - q[0], dy = samples[i][1] - q[1], d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    }
    var dragT = null;
    var dot = p.point([val(m.r, t) * Math.cos(val(m.th, t)), val(m.r, t) * Math.sin(val(m.th, t))], {
      color: 'point', r: 6, label: o.pointLabel || null, labelAnchor: 'ne', bounds: false,
      draggable: !!o.draggable,
      ariaLabel: 'Particle',
      snap: function (q) { var i = nearest(q); dragT = samples[i][2]; return [samples[i][0], samples[i][1]]; },
      keyMove: function (pos, d) {
        var step = (t1 - t0) / 100 * ((d[0] || d[1]) > 0 ? 1 : -1);
        dragT = Math.min(t1, Math.max(t0, t + step));
        var r = val(m.r, dragT), th = val(m.th, dragT);
        return [r * Math.cos(th), r * Math.sin(th)];
      },
      ariaFormat: function () { return 't = ' + f4(t) + ' ' + o.timeUnit; },
      onDragStart: function () { tr.pause(); },
      onDrag: function () { if (dragT != null) { t = dragT; sync(); } }
    });

    /* ----- arrow scales ----- */
    var kV = o.vScale || 1, kA = o.aScale || 1;
    function autoScales() {
      var mv = 0, ma = 0;
      for (var i = 0; i <= 80; i++) {
        var s = POLAR.state(m, t0 + (t1 - t0) * i / 80);
        if (isFinite(s.v)) mv = Math.max(mv, Math.hypot(s.vr, s.vt));
        if (isFinite(s.a)) ma = Math.max(ma, Math.hypot(s.ar, s.at));
      }
      if (!o.vScale) kV = POLAR.niceScale(mv, o.arrowMax * span);
      if (!o.aScale) kA = POLAR.niceScale(ma, o.arrowMax * span);
    }
    autoScales();

    /* ----- controls: "Show" chips, the Components select, live values, the scale note ----- */
    var panel = o.controls || null, ctl = {};
    var scaleNote = CYL.el('p', { class: 'mf-note' });
    if (panel) {
      var chips = [];
      o.toggles.forEach(function (k) {
        function chip(label, color) {
          ctl[k] = CYL.toggle({ label: label, color: color, value: !!show[k], onChange: function (on) { show[k] = on; sync(); } });
          chips.push(ctl[k].el);
        }
        if (k === 'v') chip('Velocity \\(\\vvec\\)', 'good');
        else if (k === 'a') chip('Acceleration \\(\\avec\\)', 'bad');
        else if (k === 'frame') chip('\\(\\er, \\et\\)', 'r');
        else if (k === 'radial') chip('\\(r\\) and \\(\\theta\\)', 't');
        else if (k === 'psi') chip('Angle \\(\\psi\\)', null);
        else if (k === 'trace') chip('Trace', null);
      });
      if (chips.length) {
        panel.appendChild(CYL.el('p', { class: 'viz-title', text: 'Show' }));
        panel.appendChild(CYL.el('div', { class: 'chip-row' }, chips));
      }
      if (o.toggles.indexOf('comps') >= 0) {
        ctl.comps = CYL.select({
          label: 'Components',
          options: [{ value: 'rt', label: 'Radial and transverse (r, \u03b8)' }, { value: 'xy', label: 'Rectangular (x, y)' }, { value: 'none', label: 'None' }],
          value: show.comps,
          onChange: function (v) { show.comps = v; sync(); }
        });
        panel.appendChild(ctl.comps.el);
      }
    }
    var ro = makeReadouts(o, panel);
    if (panel && o.scaleNote !== false) panel.appendChild(scaleNote);

    /* ----- transport ----- */
    var visible = true;
    var unVisible = CYL.onVisible(o.stage, function (on) { visible = on; });
    var tr = makeTransport({
      o: o, stage: o.stage,
      getT: function () { return t; },
      setT: function (v) { t = v; sync(); },
      range: function () { return [t0, t1]; },
      drive: function (fn) {
        var raf = 0, last = 0, dead = false;
        function frame(ts) {
          raf = 0;
          if (dead) return;
          var dt = last ? Math.min(0.1, (ts - last) / 1000) : 0;
          last = ts;
          if (!visible) last = 0;
          else if (fn(dt) === false) { dead = true; return; }
          raf = window.requestAnimationFrame(frame);
        }
        raf = window.requestAnimationFrame(frame);
        return function () { dead = true; if (raf) window.cancelAnimationFrame(raf); raf = 0; };
      }
    });

    /* ----- redraw ----- */
    var cur = null;
    function add(P, d, k) { return [P[0] + d[0] * k, P[1] + d[1] * k]; }
    function sync() {
      var s = cur = POLAR.state(m, t);
      var P = [s.x, s.y], ur = s.ur, ut = s.ut;
      dot.set(P);
      var upTo = Math.max(1, Math.round((t - t0) / (t1 - t0 || 1) * N));
      ghost.set(show.path ? pts() : []);
      trace.set(show.trace ? samples.slice(0, upTo + 1).map(function (q) { return [q[0], q[1]]; }).concat([P]) : []);
      if (arm) arm.set([0, 0], [o.arm.length * ur[0], o.arm.length * ur[1]]);
      // radial line and θ (for the arc, θ in (−π, 0) is kept, anything else is wrapped into [0, 2π))
      var okR = show.radial && s.r > 1e-9;
      if (okR) {
        radial.set([0, 0], P);
        var thw = s.th > -PI && s.th < 0 ? s.th : CYL.math.wrap2pi(s.th);   // a small negative θ is drawn clockwise
        thArc.set({ theta0: 0, theta1: Math.abs(thw) < 1e-6 ? NaN : thw });
      }
      gRad.setVisible(okR);
      // tangent angle ψ: from the extended radial line to the tangent (in the r-θ plane)
      var okPsi = show.psi && isFinite(s.psi) && s.r > 1e-9;
      if (okPsi) {
        var L = 0.2 * span, dirT = s.th + s.psi;
        extLine.set(P, add(P, ur, L));
        var tu = [Math.cos(dirT), Math.sin(dirT)];
        tanLine.set(add(P, tu, -L), add(P, tu, L));
        var a0 = s.th, a1 = s.th + s.psi;
        psiArc.set({ center: P, theta0: Math.min(a0, a1), theta1: Math.abs(s.psi) < 1e-3 ? NaN : Math.max(a0, a1) });
      }
      gPsi.setVisible(okPsi);
      // unit vectors at the particle
      var Lf = 0.12 * span;
      if (show.frame) { eR.set(P, add(P, ur, Lf)); eT.set(P, add(P, ut, Lf)); }
      gFrame.setVisible(!!show.frame);
      // v and a, with components drawn tip to tail from the particle
      var V = [s.vx / kV, s.vy / kV], A = [s.ax / kA, s.ay / kA];
      var vOn = show.v && Math.hypot(s.vx, s.vy) > EPS, aOn = show.a && Math.hypot(s.ax, s.ay) > EPS;
      vArrow.set(P, add(P, V, 1)); vArrow.setVisible(vOn);
      aArrow.set(P, add(P, A, 1)); aArrow.setVisible(aOn);
      var tiny = span * 2e-3, d1v, d2v, d1a, d2a, lab;
      if (show.comps === 'xy') { d1v = [V[0], 0]; d2v = [0, V[1]]; d1a = [A[0], 0]; d2a = [0, A[1]]; lab = ['x', 'y']; }
      else { d1v = add([0, 0], ur, s.vr / kV); d2v = add([0, 0], ut, s.vt / kV); d1a = add([0, 0], ur, s.ar / kA); d2a = add([0, 0], ut, s.at / kA); lab = ['r', 't']; }
      var cv = vOn && show.comps !== 'none', ca = aOn && show.comps !== 'none';
      if (cv) { var Q = add(P, d1v, 1); cV1.set(P, Q); cV2.set(Q, add(Q, d2v, 1)); }
      if (ca) { var Qa = add(P, d1a, 1); cA1.set(P, Qa); cA2.set(Qa, add(Qa, d2a, 1)); }
      if (lab[0] !== compMode) {   // recolor and relabel when the component system changes
        compMode = lab[0];
        var xy = compMode === 'x';
        cV1.setColor(xy ? 'x' : 'r'); cV2.setColor(xy ? 'y' : 't'); cA1.setColor(xy ? 'x' : 'r'); cA2.setColor(xy ? 'y' : 't');
        if (cV1.setLabel) { cV1.setLabel(xy ? 'v_x' : 'v_r'); cV2.setLabel(xy ? 'v_y' : 'v_\\theta'); cA1.setLabel(xy ? 'a_x' : 'a_r'); cA2.setLabel(xy ? 'a_y' : 'a_\\theta'); }
      }
      cV1.setVisible(cv && Math.hypot(d1v[0], d1v[1]) > tiny); cV2.setVisible(cv && Math.hypot(d2v[0], d2v[1]) > tiny);
      cA1.setVisible(ca && Math.hypot(d1a[0], d1a[1]) > tiny); cA2.setVisible(ca && Math.hypot(d2a[0], d2a[1]) > tiny);
      tr.syncSlider();
      tr.syncPlay();
      ro.set(s);
      syncNote();
      if (typeof o.onUpdate === 'function') { try { o.onUpdate(s, api); } catch (e) { CYL.error('POLAR.figure onUpdate failed:', e); } }
    }
    var compMode = 'r';
    var noteKey = null;
    function syncNote() {   // rewritten only when a scale changes (it holds rendered math)
      var key = kV + '|' + kA;
      if (key === noteKey) return;
      noteKey = key;
      var U = o.unit, UV = U + '/' + o.timeUnit;
      scaleNote.innerHTML = 'Arrows are to scale: 1 ' + U + ' on the grid is ' + CYL.fmt(kV) + ' ' + UV + ' for \\(\\vvec\\) and ' +
        CYL.fmt(kA) + ' ' + UV + '\u00b2 for \\(\\avec\\).';
      CYL.renderMath(scaleNote);
    }

    var resizeObs = null;
    var api = {
      plane: p,
      overlay: overlay,
      el: o.stage,
      readoutEls: ro.els,
      controls: ctl,
      state: function () { return cur; },
      t: function () { return t; },
      setT: function (v) { tr.pause(); t = Math.min(t1, Math.max(t0, v)); sync(); return api; },
      play: function () { tr.play(); return api; },
      pause: function () { tr.pause(); return api; },
      reset: function () { tr.reset(); return api; },
      isPlaying: function () { return tr.isPlaying(); },
      setMotion: function (motion, a, b, start) {
        tr.pause();
        m = motion; t0 = a; t1 = b; t = start != null ? Math.min(b, Math.max(a, start)) : a;
        sample(); autoScales();
        if (guide) guide.set(pts());
        if (tr.refreshSlider) tr.refreshSlider();
        sync();
        return api;
      },
      setRange: function (xr, yr) {
        o.xRange = xr; o.yRange = yr;
        span = Math.max(xr[1] - xr[0], yr[1] - yr[0]);
        p.setRange(xr, yr);
        autoScales(); sync();
        return api;
      },
      setShow: function (k, v) { show[k] = v; if (ctl[k] && ctl[k].set) ctl[k].set(v, true); sync(); return api; },
      setScales: function (sv, sa) { o.vScale = sv; o.aScale = sa; kV = sv || kV; kA = sa || kA; if (!sv || !sa) autoScales(); sync(); return api; },
      scales: function () { return { v: kV, a: kA }; },
      update: function () { sync(); return api; },
      destroy: function () { tr.pause(); if (resizeObs) resizeObs.disconnect(); unVisible(); }
    };
    sync();
    if (panel) CYL.renderMath(panel);

    /* ----- fill the stage: when the controls sit beside the plot and are taller than the plot column, grow the
       plot to match (the extra room shows more grid), so there is no empty band around it ----- */
    function fit() {
      var main = o.stage.parentNode, side = panel && (panel.closest('.viz-controls') || panel);
      var base = baseHeight();
      if (!main || !base) return;
      var target = base;
      if (side && side.getBoundingClientRect().left > main.getBoundingClientRect().left + 20) {
        var trEl = main.querySelector(':scope > .mf-transport');
        var below = o.readoutsEl && o.readoutsEl.offsetParent !== null ? o.readoutsEl.offsetHeight : 0;
        target = Math.max(base, Math.round(side.offsetHeight - (trEl ? trEl.offsetHeight : 0) - below - 2));
      }
      if (Math.abs(target - curH) > 4) { curH = target; p.setOptions({ height: target }); sync(); }
    }
    if (window.ResizeObserver) {
      resizeObs = new ResizeObserver(CYL.debounce(fit, 60));
      if (panel) resizeObs.observe(panel.closest('.viz-controls') || panel);
      if (o.readoutsEl) resizeObs.observe(o.readoutsEl);
      if (o.stage.parentNode) resizeObs.observe(o.stage.parentNode);
    }
    window.setTimeout(fit, 0);
    if (o.autoplay && !CYL.prefersReducedMotion()) tr.play();
    return api;
  };

  /* ================================================================== 3D figure */
  var BIG3 = { width: 0.028, headLength: 0.17, headRadius: 0.068 };
  var THIN3 = { width: 0.016, headLength: 0.13, headRadius: 0.048 };
  function arrowOpts(base, color, label, parent) {
    return { color: color, label: label, width: base.width, headLength: base.headLength, headRadius: base.headRadius, parent: parent };
  }

  POLAR.figure3d = function (opts) {
    var o = Object.assign({
      t0: 0, t1: 1, speed: 1, loop: false, autoplay: false, transport: true, playback: true,
      unit: 'm', timeUnit: 's', extent: 2.5, zRange: [-0.2, 4.2], arrowMax: 1.7,
      toggles: ['path', 'v', 'a', 'vc', 'ac'],
      readouts: ['t', 'r', 'th', 'z', 'thd', 'vr', 'vt', 'vz', 'v', 'ar', 'ar_rdd', 'ar_cent', 'at', 'at_ang', 'at_cor', 'az', 'a'],
      mass: null, playbackRates: [0.25, 0.5, 1]
    }, opts || {});
    var show = Object.assign({ path: true, trace: true, v: true, a: true, vc: false, ac: true, radial: true, drop: false, frame: false }, o.show || {});
    var m = o.motion, t0 = o.t0, t1 = o.t1, t = o.t != null ? o.t : o.t0;
    var v = CYL3D.create(o.stage, { extent: o.extent, zRange: o.zRange, ariaLabel: o.aria, camera: o.camera || undefined });
    var scenery = null;
    if (typeof o.decorate === 'function') { try { scenery = o.decorate(v) || null; } catch (e) { CYL.error('POLAR.figure3d decorate failed:', e); } }

    function pos(tt) { var r = val(m.r, tt), th = val(m.th, tt); return [r * Math.cos(th), r * Math.sin(th), m.z ? val(m.z, tt) : 0]; }
    var ghost = v.curve(function (s) { return pos(s); }, t0, t1, { color: 'muted', width: 1.5, dashed: true, segments: 240 });
    var rGuide = v.line([[0, 0, 0], [1, 0, 0]], { color: 'r', width: 2.5 });
    var drop = v.line([[1, 0, 0], [1, 0, 1]], { color: 'muted', width: 1.25, dashed: true });
    var trace = v.curve(function (s) { return pos(s); }, t0, t0, { color: 'accent', width: 3.5, segments: 300 });
    var P0 = pos(t);
    var dot = v.point(P0, { color: 'point', size: 0.075 });
    var gVC = v.group(), gAC = v.group(), gFr = v.group();
    var vc = ['r', 't', 'z'].map(function (c, i) { return v.arrow(P0, P0, arrowOpts(THIN3, c, ['v_r', 'v_\\theta', 'v_z'][i], gVC)); });
    var ac = ['r', 't', 'z'].map(function (c, i) { return v.arrow(P0, P0, arrowOpts(THIN3, c, ['a_r', 'a_\\theta', 'a_z'][i], gAC)); });
    var fr = ['r', 't', 'z'].map(function (c, i) { return v.arrow(P0, P0, arrowOpts(THIN3, c, ['\\er', '\\et', '\\ez'][i], gFr)); });
    var vArrow = v.arrow(P0, P0, arrowOpts(BIG3, 'good', '\\vvec'));
    var aArrow = v.arrow(P0, P0, arrowOpts(BIG3, 'bad', '\\avec'));

    /* ----- scales: "1 m of arrow = k units", k a round number, so the longest arrow is at most arrowMax ----- */
    var kV = o.vScale || 1, kA = o.aScale || 1;
    function autoScales() {
      var mv = 0, ma = 0;
      for (var i = 0; i <= 80; i++) {
        var s = POLAR.state(m, t0 + (t1 - t0) * i / 80);
        if (isFinite(s.v)) mv = Math.max(mv, s.v);
        if (isFinite(s.a)) ma = Math.max(ma, s.a);
      }
      if (!o.vScale) kV = POLAR.niceScale(mv, o.arrowMax);
      if (!o.aScale) kA = POLAR.niceScale(ma, o.arrowMax);
    }
    autoScales();

    /* ----- controls ----- */
    var panel = o.controls || null, ctl = {};
    var scaleNote = CYL.el('p', { class: 'mf-note' });
    if (panel) {
      var chips = [];
      o.toggles.forEach(function (k) {
        function chip(label, color) {
          ctl[k] = CYL.toggle({ label: label, color: color, value: !!show[k], onChange: function (on) { show[k] = on; applyVisibility(); } });
          chips.push(ctl[k].el);
        }
        if (k === 'path') chip('Path', null);
        else if (k === 'v') chip('Velocity \\(\\vvec\\)', 'good');
        else if (k === 'a') chip('Acceleration \\(\\avec\\)', 'bad');
        else if (k === 'vc') chip('\\(\\vvec\\) components', null);
        else if (k === 'ac') chip('\\(\\avec\\) components', null);
        else if (k === 'frame') chip('\\(\\er, \\et, \\ez\\)', 'r');
      });
      if (chips.length) {
        panel.appendChild(CYL.el('p', { class: 'viz-title', text: 'Show' }));
        panel.appendChild(CYL.el('div', { class: 'chip-row' }, chips));
      }
    }
    var ro = makeReadouts(o, panel);
    if (panel) panel.appendChild(scaleNote);

    var tr = makeTransport({
      o: o, stage: o.stage,
      getT: function () { return t; },
      setT: function (x) { t = x; sync(); },
      range: function () { return [t0, t1]; },
      drive: function (fn) { return v.animate(function (dt) { return fn(Math.min(0.1, dt)); }); }
    });

    /* ----- redraw ----- */
    var cur = null;
    function sync() {
      var s = cur = POLAR.state(m, t);
      var c = Math.cos(s.th), sn = Math.sin(s.th);
      var P = [s.r * c, s.r * sn, s.z];
      dot.setPosition(P);
      trace.setFn(null, t0, Math.max(t0 + 1e-6, t));
      var sv = 1 / kV, sa = 1 / kA;
      function tip(Q, sc, cr, ct, cz) {   // Q + sc·(cr u_r + ct u_θ + cz u_z)
        return [Q[0] + sc * (cr * c - ct * sn), Q[1] + sc * (cr * sn + ct * c), Q[2] + sc * cz];
      }
      vArrow.set(P, tip(P, sv, s.vr, s.vt, s.vz));
      aArrow.set(P, tip(P, sa, s.ar, s.at, s.az));
      var V1 = tip(P, sv, s.vr, 0, 0), V2 = tip(V1, sv, 0, s.vt, 0);
      vc[0].set(P, V1); vc[1].set(V1, V2); vc[2].set(V2, tip(V2, sv, 0, 0, s.vz));
      var A1 = tip(P, sa, s.ar, 0, 0), A2 = tip(A1, sa, 0, s.at, 0);
      ac[0].set(P, A1); ac[1].set(A1, A2); ac[2].set(A2, tip(A2, sa, 0, 0, s.az));
      var L = 0.32 * o.extent;
      fr[0].set(P, tip(P, L, 1, 0, 0)); fr[1].set(P, tip(P, L, 0, 1, 0)); fr[2].set(P, tip(P, L, 0, 0, 1));
      rGuide.setPoints([[0, 0, s.z], P]);
      drop.setPoints([[P[0], P[1], 0], P]);
      if (scenery && scenery.update) { try { scenery.update(s); } catch (e) { CYL.error('POLAR.figure3d scenery failed:', e); } }
      tr.syncSlider();
      tr.syncPlay();
      ro.set(s);
      syncNote();
      if (typeof o.onUpdate === 'function') { try { o.onUpdate(s, api); } catch (e) { CYL.error('POLAR.figure3d onUpdate failed:', e); } }
    }
    function applyVisibility() {
      ghost.visible = !!show.path;
      trace.visible = !!show.trace && !!show.path;
      rGuide.visible = !!show.radial;
      drop.visible = !!show.drop;
      vArrow.visible = !!show.v;
      aArrow.visible = !!show.a;
      gVC.visible = !!show.vc;
      gAC.visible = !!show.ac;
      gFr.visible = !!show.frame;
      v.render();
    }
    var noteKey = null;
    function syncNote() {
      var key = kV + '|' + kA;
      if (key === noteKey) return;
      noteKey = key;
      var U = o.unit, UV = U + '/' + o.timeUnit;
      scaleNote.innerHTML = 'Arrows are to scale: 1 ' + U + ' in the view is ' + CYL.fmt(kV) + ' ' + UV + ' for \\(\\vvec\\) and ' +
        CYL.fmt(kA) + ' ' + UV + '\u00b2 for \\(\\avec\\). Grid rings are 0.5 ' + U + ' apart.';
      CYL.renderMath(scaleNote);
    }

    var api = {
      viewer: v,
      el: o.stage,
      readoutEls: ro.els,
      controls: ctl,
      state: function () { return cur; },
      t: function () { return t; },
      setT: function (x) { tr.pause(); t = Math.min(t1, Math.max(t0, x)); sync(); return api; },
      play: function () { tr.play(); return api; },
      pause: function () { tr.pause(); return api; },
      reset: function () { tr.reset(); return api; },
      isPlaying: function () { return tr.isPlaying(); },
      setMotion: function (motion, a, b, start) {
        tr.pause();
        m = motion; t0 = a; t1 = b; t = start != null ? Math.min(b, Math.max(a, start)) : a;
        ghost.setFn(function (s) { return pos(s); }, t0, t1);
        trace.setFn(function (s) { return pos(s); }, t0, t0 + 1e-6);
        autoScales();
        if (tr.refreshSlider) tr.refreshSlider();
        sync();
        return api;
      },
      setScenery: function (sc) { scenery = sc; sync(); return api; },
      setShow: function (k, x) { show[k] = x; if (ctl[k] && ctl[k].set) ctl[k].set(x, true); applyVisibility(); return api; },
      setScales: function (sv, sa) { o.vScale = sv; o.aScale = sa; kV = sv || kV; kA = sa || kA; if (!sv || !sa) autoScales(); sync(); return api; },
      scales: function () { return { v: kV, a: kA }; },
      setCamera: function (spec, animate) { v.setCamera(spec, animate); v.setHome(spec); return api; },   // Reset view returns here
      update: function () { sync(); return api; }
    };
    applyVisibility();
    sync();
    if (panel) CYL.renderMath(panel);
    if (o.autoplay && !CYL.prefersReducedMotion()) tr.play();
    return api;
  };

  /* ------------------------------------------------------------------ 3D scenery */
  function rod(v, a, b, width, parent) {   // a lit 3D rod: an arrow without a head
    return v.arrow(a, b, { color: 'surface', width: width, headLength: 1e-4, headRadius: 0, parent: parent });
  }
  // A cylindrical robot: base, column, a carriage that slides up it, a telescoping arm and a short wrist. The gripper
  // (the particle) hangs hw below the arm, so the arm never hides the radial arrows.
  POLAR.robotArm = function (v, opts) {
    var o = Object.assign({ hw: 0.25, column: 3 }, opts || {});
    var g = v.group();
    v.wedge({ r0: 0, r1: 0.3, theta0: 0, theta1: TAU, z0: 0, z1: 0.1, color: 'surface', opacity: 0.55, edges: false, parent: g });
    rod(v, [0, 0, 0], [0, 0, o.column], 0.07, g);
    var carriage = rod(v, [0, 0, 1.67], [0, 0, 1.83], 0.11, g);
    var arm = rod(v, [0, 0, 1.75], [0.5, 0, 1.75], 0.042, g);
    var wrist = rod(v, [0.5, 0, 1.75], [0.5, 0, 1.5], 0.024, g);
    return {
      group: g,
      update: function (s) {
        var c = Math.cos(s.th), sn = Math.sin(s.th), zA = s.z + o.hw;
        var E = [s.r * c, s.r * sn, zA];
        carriage.set([0, 0, zA - 0.08], [0, 0, zA + 0.08]);
        arm.set([0, 0, zA], E);
        wrist.set(E, [E[0], E[1], s.z]);
      }
    };
  };
  // A spiral slide: a central pole and a helical chute (a ribbon 0.4 m wide centered on the path).
  POLAR.helixSlide = function (v, h) {
    var g = v.group();
    rod(v, [0, 0, 0], [0, 0, Math.max(h.z0, h.z0 + h.zd * h.t1) + 0.35], 0.06, g);
    v.surface(function (u, w) {
      var th = h.th0 + h.thd * u, rr = h.r + w;
      return [rr * Math.cos(th), rr * Math.sin(th), h.z0 + h.zd * u];
    }, { u: [0, h.t1], w: [-0.2, 0.2], segments: [160, 2], color: 'surface', opacity: 0.32, parent: g });
    return { group: g, update: function () {} };
  };

  window.POLAR = POLAR;
})(window, document);
