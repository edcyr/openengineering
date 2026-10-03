/*
 * curv-motion.js — CURV: plane-kinematics helpers and the animated motion figure for the Curvilinear
 * Motion module. Classic script (IIFE) that attaches ONE global: CURV. Requires CYL (cyl-core.js) and
 * CYL2D (cyl-2d.js); load it after both.
 *
 * Kinematics
 *   A motion is {x(t), y(t)} with optional analytic derivatives {vx, vy, ax, ay} (functions of t).
 *   Missing derivatives are found by central differences, so any smooth x(t), y(t) works.
 *   CURV.state(motion, t) -> {t, x, y, vx, vy, ax, ay, v, a, psi, at, an, rho, et, en, turn, center}
 *     psi    direction of travel (rad, atan2(vy, vx)); et/en = unit vectors u_t, u_n as [x, y]; turn = +1 turning
 *            counter-clockwise (left), -1 clockwise, 0 straight; center = center of curvature or null.
 *   CURV.nt(vx, vy, ax, ay) -> the same n-t fields from a velocity and an acceleration.
 *     a_t = a·u_t,  a_n = |v × a| / v  (always >= 0, toward the center of curvature),  rho = v² / a_n.
 *     At rest (v = 0) u_t is taken along a (the direction the particle starts to move).
 *   CURV.niceScale(maxMagnitude, maxLength) -> k from {1, 2, 2.5, 5} × 10^n with maxMagnitude / k <= maxLength.
 *
 * CURV.figure(opts) -> figure controller. An animated particle on its path, with v and a arrows, their
 *   x-y or n-t components, the n-t unit vectors and the osculating circle. It follows the Cylindrical
 *   Coordinates motion simulator (Lesson 10, Figure 10.2): a transport row under the plot (Play/Pause,
 *   Reset, the time slider and Playback), and a control panel of "Show" chips and live values.
 *   opts:
 *     stage (element, required), controls (element: toggles + readouts), transport:true (the transport row
 *     under the plot), playback:true (the Playback select in it: 0.5×, 1×, 2× the figure's speed),
 *     motion (required), t0, t1, t (start time), speed:1 (sim s per real s),
 *     loop:true, autoplay:false (never with reduced motion), xRange, yRange, grid:'cartesian', gridStep,
 *     axisLabels:['x','y'], unit:'m', timeUnit:'s', maxHeight, aria (REQUIRED plain-text description),
 *     height: plot height in px, or a function (stage width) -> px; default min(maxHeight, 400),
 *     show: {path:true, trace:true, v:true, a:true, comps:'none'|'xy'|'nt', frame:false, circle:false},
 *     toggles: ['v','a','comps','frame','circle','trace']   which controls to offer (chips in this order,
 *       under "Show"; 'comps' is the Components select, placed after the chips),
 *     readouts: ['t','pos','psi','rho','v','vx','vy','a','ax','ay','at','an']   which live numbers to list,
 *     readoutsEl: element for the live numbers as cards (State, Velocity, Acceleration) under the stage,
 *       as in Figure 10.2, instead of a list in the control panel,
 *     vScale / aScale: fixed arrow scales (m/s or m/s² per unit of plot length); default: automatic,
 *     arrowMax: longest arrow as a fraction of the plot span (default 0.3),
 *     draggable:true (drag the particle along its path; arrow keys step in time),
 *     decorate(plane): draw fixed scenery (ground, walls…) before the path,
 *     onUpdate(state, fig): called after every redraw.
 *   controller: {plane, el, state(), t(), setT(t), play(), pause(), reset(), isPlaying(), setMotion(motion, t0, t1, t),
 *     setRange(xr, yr), setShow(key, value), setScales(vScale, aScale), update(), destroy(), readoutEls}
 */
(function (window, document) {
  'use strict';
  if (window.CURV) return;
  var CYL = window.CYL;
  var CURV = { version: '1.1.0' };
  var EPS = 1e-9;

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

  CURV.nt = function (vx, vy, ax, ay) {
    var v = Math.sqrt(vx * vx + vy * vy), a = Math.sqrt(ax * ax + ay * ay);
    var out = { v: v, a: a, psi: NaN, at: 0, an: 0, rho: Infinity, et: null, en: null, turn: 0 };
    if (!(v > EPS)) {
      if (a > EPS) { out.et = [ax / a, ay / a]; out.en = [-out.et[1], out.et[0]]; out.at = a; out.psi = Math.atan2(ay, ax); }
      return out;
    }
    var et = [vx / v, vy / v];
    var cross = vx * ay - vy * ax;                       // z-component of v × a
    var an = Math.abs(cross) / v;
    var turn = an > 1e-9 * Math.max(1, a) ? (cross > 0 ? 1 : -1) : 0;
    out.psi = Math.atan2(vy, vx);
    out.et = et;
    out.en = turn >= 0 ? [-et[1], et[0]] : [et[1], -et[0]];
    out.at = ax * et[0] + ay * et[1];
    out.an = turn === 0 ? 0 : an;
    out.rho = turn === 0 ? Infinity : v * v / an;
    out.turn = turn;
    return out;
  };

  CURV.state = function (m, t) {
    var x = val(m.x, t), y = val(m.y, t);
    var vx = m.vx ? val(m.vx, t) : d1(m.x, t), vy = m.vy ? val(m.vy, t) : d1(m.y, t);
    var ax = m.ax ? val(m.ax, t) : (m.vx ? d1(m.vx, t) : d2(m.x, t));
    var ay = m.ay ? val(m.ay, t) : (m.vy ? d1(m.vy, t) : d2(m.y, t));
    var s = CURV.nt(vx, vy, ax, ay);
    s.t = t; s.x = x; s.y = y; s.vx = vx; s.vy = vy; s.ax = ax; s.ay = ay;
    s.center = isFinite(s.rho) && s.en ? [x + s.rho * s.en[0], y + s.rho * s.en[1]] : null;
    return s;
  };

  var NICE = [1, 2, 2.5, 5];
  CURV.niceScale = function (maxMag, maxLen) {
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

  /* ------------------------------------------------------------------ formatting */
  function f4(x) { return CYL.fmt(Math.abs(x) < 1e-6 ? 0 : x, 4); }   // hides numerical-derivative noise such as 4e-10

  /* ------------------------------------------------------------------ transport icons (as in Figure 10.2) */
  var ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 5.2v13.6L18.6 12z"/></svg>';
  var ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M6.8 5h3.6v14H6.8zM13.6 5h3.6v14h-3.6z"/></svg>';
  var ICON_RESET = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4.2h4.2"/></svg>';

  /* ------------------------------------------------------------------ the figure */
  CURV.figure = function (opts) {
    var o = Object.assign({
      t0: 0, t1: 1, speed: 1, loop: true, autoplay: false, transport: true, playback: true, draggable: true,
      grid: 'cartesian', axisLabels: ['x', 'y'], unit: 'm', timeUnit: 's', arrowMax: 0.3,
      toggles: ['v', 'a', 'comps', 'frame', 'circle'],
      readouts: ['t', 'v', 'at', 'an', 'a', 'rho']
    }, opts || {});
    var show = Object.assign({ path: true, trace: true, v: true, a: true, comps: 'none', frame: false, circle: false }, o.show || {});
    var U = o.unit, UV = U + '/' + o.timeUnit;
    var m = o.motion, t0 = o.t0, t1 = o.t1, t = o.t != null ? o.t : o.t0;
    var span = Math.max(o.xRange[1] - o.xRange[0], o.yRange[1] - o.yRange[0]);

    // A fixed plot height, like the module's other figure panels: the plot fills the stage and a wide path
    // shows extra grid above and below instead of floating in empty space. A function of the stage width
    // lets a page follow its breakpoints (it is re-read whenever the figure is resized).
    function baseHeight() {
      if (typeof o.height === 'function') return o.height(o.stage.clientWidth || 0);
      return o.height !== undefined ? o.height : Math.min(o.maxHeight || 480, 400);
    }
    var curH = baseHeight();
    var p = CYL2D.plane(o.stage, {
      xRange: o.xRange, yRange: o.yRange, grid: o.grid, gridStep: o.gridStep || null,
      axisLabels: o.axisLabels, ariaLabel: o.aria, maxHeight: o.maxHeight || 480, height: curH
    });
    if (typeof o.decorate === 'function') { try { o.decorate(p); } catch (e) { CYL.error('CURV.figure decorate failed:', e); } }

    /* ----- drawing items ----- */
    var N = 360, samples = [];
    function sample() {
      samples = [];
      for (var i = 0; i <= N; i++) {
        var tt = t0 + (t1 - t0) * i / N;
        samples.push([val(m.x, tt), val(m.y, tt), tt]);
      }
    }
    sample();
    var ghost = p.polyline([], { color: 'muted', width: 1.5, dashed: true });
    var trace = p.polyline([], { color: 'accent', width: 3 });
    var gCircle = p.group();
    var circle = gCircle.circle({ center: [0, 0], r: 1, color: 'muted', width: 1.4, dashed: true });
    var centerDot = gCircle.point([0, 0], { color: 'muted', r: 3, label: 'C', labelAnchor: 'se' });
    var radius = gCircle.line([0, 0], [0, 0], { color: 'muted', width: 1.2, dashed: true, label: '\\rho', labelSide: 'left' });
    var gFrame = p.group();
    var eT = gFrame.line([0, 0], [0, 0], { color: 't', width: 2.25, arrow: true, label: '\\et', labelAt: 1, labelSide: 'left' });
    var eN = gFrame.line([0, 0], [0, 0], { color: 'n', width: 2.25, arrow: true, label: '\\en', labelAt: 1, labelSide: 'right' });
    var gComp = p.group();
    var cVx = gComp.line([0, 0], [0, 0], { color: 'x', width: 2, arrow: true, dashed: true, label: 'v_x', labelSide: 'right' });
    var cVy = gComp.line([0, 0], [0, 0], { color: 'y', width: 2, arrow: true, dashed: true, label: 'v_y', labelSide: 'right' });
    var cAx = gComp.line([0, 0], [0, 0], { color: 'x', width: 2.25, arrow: true, label: 'a_x', labelSide: 'right' });
    var cAy = gComp.line([0, 0], [0, 0], { color: 'y', width: 2.25, arrow: true, label: 'a_y', labelSide: 'right' });
    var cAt = gComp.line([0, 0], [0, 0], { color: 't', width: 2.25, arrow: true, label: 'a_t', labelSide: 'left' });
    var cAn = gComp.line([0, 0], [0, 0], { color: 'n', width: 2.25, arrow: true, label: 'a_n', labelSide: 'left' });
    var vArrow = p.line([0, 0], [0, 0], { color: 'good', width: 3.25, arrow: true, label: '\\vvec', labelAt: 1, labelSide: 'left' });
    var aArrow = p.line([0, 0], [0, 0], { color: 'bad', width: 3.25, arrow: true, label: '\\avec', labelAt: 1, labelSide: 'right' });

    function nearest(q) {
      var best = 0, bd = Infinity;
      for (var i = 0; i < samples.length; i++) {
        var dx = samples[i][0] - q[0], dy = samples[i][1] - q[1], d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    }
    var dragT = null;
    var dot = p.point([val(m.x, t), val(m.y, t)], {
      color: 'point', r: 6, label: o.pointLabel || null, labelAnchor: 'nw', bounds: false,
      draggable: !!o.draggable,
      ariaLabel: 'Particle',
      snap: function (q) { var i = nearest(q); dragT = samples[i][2]; return [samples[i][0], samples[i][1]]; },
      keyMove: function (pos, d) {
        var step = (t1 - t0) / 100 * ((d[0] || d[1]) > 0 ? 1 : -1);
        dragT = Math.min(t1, Math.max(t0, t + step));
        return [val(m.x, dragT), val(m.y, dragT)];
      },
      ariaFormat: function () { return 't = ' + f4(t) + ' ' + o.timeUnit; },
      onDragStart: function () { pause(); },
      onDrag: function () { if (dragT != null) { t = dragT; sync(); } }
    });

    /* ----- scales ----- */
    var kV = o.vScale || 1, kA = o.aScale || 1;
    function autoScales() {
      var mv = 0, ma = 0;
      for (var i = 0; i <= 80; i++) {
        var s = CURV.state(m, t0 + (t1 - t0) * i / 80);
        if (isFinite(s.v)) mv = Math.max(mv, s.v);
        if (isFinite(s.a)) ma = Math.max(ma, s.a);
      }
      if (!o.vScale) kV = CURV.niceScale(mv, o.arrowMax * span);
      if (!o.aScale) kA = CURV.niceScale(ma, o.arrowMax * span);
    }
    autoScales();

    /* ----- controls: "Show" chips, the Components select, live values, the scale note ----- */
    var panel = o.controls || null;
    var cards = !!o.readoutsEl;
    var ctl = {};
    var readoutEls = {};
    var scaleNote = CYL.el('p', { class: 'mf-note' });
    // label in the control panel, label on a card, color, card group (s: state, v: velocity, a: acceleration).
    // On a card the magnitudes |v| and |a| are the card's total (a rule above, no color: the card title has it).
    var RO = {
      t: ['\\(t\\)', 'Time \\(t\\)', null, 's'],
      pos: ['\\((x, y)\\)', 'Position \\((x, y)\\)', null, 's'],
      psi: ['Direction of \\(\\vvec\\)', 'Direction of \\(\\vvec\\)', null, 's'],
      rho: ['\\(\\rho\\)', 'Radius of curvature \\(\\rho\\)', null, 's'],
      vx: ['\\(v_x\\)', '\\(v_x = \\dot x\\)', 'x', 'v'],
      vy: ['\\(v_y\\)', '\\(v_y = \\dot y\\)', 'y', 'v'],
      v: ['Speed \\(v = |\\vvec|\\)', 'Speed \\(v = |\\vvec|\\)', 'good', 'v', true],
      ax: ['\\(a_x\\)', '\\(a_x = \\ddot x\\)', 'x', 'a'],
      ay: ['\\(a_y\\)', '\\(a_y = \\ddot y\\)', 'y', 'a'],
      at: ['\\(a_t = \\dot v\\)', '\\(a_t = \\dot v\\)', 't', 'a'],
      an: ['\\(a_n = v^2/\\rho\\)', '\\(a_n = v^2/\\rho\\)', 'n', 'a'],
      a: ['\\(|\\avec|\\)', '\\(|\\avec|\\)', 'bad', 'a', true]
    };
    if (panel) {
      var chips = [];
      o.toggles.forEach(function (k) {
        if (k === 'v') chips.push((ctl.v = CYL.toggle({ label: 'Velocity \\(\\vvec\\)', color: 'good', value: show.v, onChange: function (on) { show.v = on; sync(); } })).el);
        if (k === 'a') chips.push((ctl.a = CYL.toggle({ label: 'Acceleration \\(\\avec\\)', color: 'bad', value: show.a, onChange: function (on) { show.a = on; sync(); } })).el);
        if (k === 'frame') chips.push((ctl.frame = CYL.toggle({ label: '\\(\\et, \\en\\)', color: 't', value: show.frame, onChange: function (on) { show.frame = on; sync(); } })).el);
        if (k === 'circle') chips.push((ctl.circle = CYL.toggle({ label: 'Osculating circle', value: show.circle, onChange: function (on) { show.circle = on; sync(); } })).el);
        if (k === 'trace') chips.push((ctl.trace = CYL.toggle({ label: 'Trace', value: show.trace, onChange: function (on) { show.trace = on; sync(); } })).el);
      });
      if (chips.length) {
        panel.appendChild(CYL.el('p', { class: 'viz-title', text: 'Show' }));
        panel.appendChild(CYL.el('div', { class: 'chip-row' }, chips));
      }
      if (o.toggles.indexOf('comps') >= 0) {
        ctl.comps = CYL.select({
          label: 'Components',
          options: [{ value: 'none', label: 'None' }, { value: 'xy', label: 'Rectangular (x, y)' }, { value: 'nt', label: 'Path (t, n)' }],
          value: show.comps,
          onChange: function (v) { show.comps = v; sync(); }
        });
        panel.appendChild(ctl.comps.el);
      }
      if (o.readouts.length && !cards) {
        var grid = CYL.el('div', { class: 'readout-grid', 'aria-live': 'off' });
        o.readouts.forEach(function (k) {
          if (!RO[k]) return;
          readoutEls[k] = CYL.readout(RO[k][0], { color: RO[k][2] });
          grid.appendChild(readoutEls[k].el);
        });
        panel.appendChild(CYL.el('p', { class: 'viz-title', text: 'Live values' }));
        panel.appendChild(grid);
      }
      panel.appendChild(scaleNote);
    }
    if (cards) {
      o.readoutsEl.innerHTML = '';
      var card = function (title, sw, keys) {
        keys = keys.filter(function (k) { return o.readouts.indexOf(k) >= 0; });
        if (!keys.length) return null;
        var h = CYL.el('p', { class: 'mf-card-title' }, [CYL.el('span', { class: 'mf-sw' + (sw ? ' ' + sw : ''), 'aria-hidden': 'true' }), CYL.el('span', { html: title })]);
        CYL.renderMath(h);
        return CYL.el('div', { class: 'mf-card' }, [h, CYL.el('div', { class: 'readout-grid' }, keys.map(function (k) {
          var d = RO[k];
          var r = readoutEls[k] = CYL.readout(d[1], { color: d[4] ? null : d[2] });
          if (d[4]) r.el.classList.add('mf-total');
          return r.el;
        }))]);
      };
      var col = function (list) {
        list = list.filter(Boolean);
        return list.length ? CYL.el('div', { class: 'mf-col' }, list) : null;
      };
      [col([card('State', null, ['t', 'pos', 'psi', 'rho']),
        card('Velocity \\(\\vvec\\) <span class="mf-unit">(' + UV + ')</span>', 'mf-sw-v', ['vx', 'vy', 'v'])]),
       col([card('Acceleration \\(\\avec\\) <span class="mf-unit">(' + UV + '\u00b2)</span>', 'mf-sw-a', ['ax', 'ay', 'at', 'an', 'a'])])
      ].forEach(function (c) { if (c) o.readoutsEl.appendChild(c); });
    }

    /* ----- transport: play/pause, reset, time, playback ----- */
    var playing = false, raf = 0, lastTs = 0, visible = true, rate = 1, playLabel = null;
    var playBtn = null, tSlider = null;
    if (o.transport) {
      var bar = CYL.el('div', { class: 'mf-transport' });
      playBtn = CYL.button(ICON_PLAY + '<span>Play</span>', function () { if (playing) pause(); else play(); }, { primary: true });
      var resetBtn = CYL.button(ICON_RESET + '<span>Reset</span>', function () { reset(); });
      tSlider = makeSlider();
      bar.appendChild(playBtn);
      bar.appendChild(resetBtn);
      bar.appendChild(tSlider.el);
      if (o.playback) {
        var speedSel = CYL.select({
          label: 'Playback',
          options: [{ value: 0.5, label: '0.5\u00d7' }, { value: 1, label: '1\u00d7' }, { value: 2, label: '2\u00d7' }],
          value: 1,
          onChange: function (x) { rate = x; }
        });
        speedSel.el.classList.add('inline');
        bar.appendChild(speedSel.el);
      }
      // The transport sits in its own row under the stage (not inside it), as in the Cylindrical
      // Coordinates motion simulator: stage and transport share a column wrapper, .mf-main.
      var host = o.stage.parentNode, main = host;
      if (host && !host.classList.contains('mf-main')) {
        main = document.createElement('div');
        main.className = 'mf-main';
        host.insertBefore(main, o.stage);
        main.appendChild(o.stage);
      }
      if (main) {
        Array.prototype.forEach.call(main.querySelectorAll(':scope > .mf-transport'), function (n) { n.remove(); });
        main.appendChild(bar);
      } else o.stage.appendChild(bar);
      syncPlay();
    }
    function makeSlider() {
      return CYL.slider({
        label: 'Time \\(t\\)', min: t0, max: t1, step: 'any', value: t, unit: o.timeUnit,
        format: function (v) { return CYL.fmtFixed(v, 2); },
        onInput: function (v) { pause(); t = v; sync(); }
      });
    }
    function syncPlay() {   // Pause while playing; Replay when stopped at the end; Play otherwise
      if (!playBtn) return;
      var key = playing ? 'Pause' : (!o.loop && t >= t1 - 1e-9 ? 'Replay' : 'Play');
      if (key === playLabel) return;
      playLabel = key;
      playBtn.innerHTML = (playing ? ICON_PAUSE : ICON_PLAY) + '<span>' + key + '</span>';
    }
    function frame(ts) {
      raf = 0;
      if (!playing) return;
      var dt = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0;
      lastTs = ts;
      if (visible) {
        t += dt * o.speed * rate;
        if (t >= t1) {
          if (o.loop) t = t0 + (t - t1) % Math.max(EPS, t1 - t0);
          else { t = t1; playing = false; }
        }
        sync();
      }
      if (playing) raf = window.requestAnimationFrame(frame);
    }
    function play() {
      if (playing) return;
      if (t >= t1 - 1e-9) t = t0;
      playing = true; lastTs = 0; syncPlay();
      raf = window.requestAnimationFrame(frame);
    }
    function pause() {
      if (!playing) return;
      playing = false; syncPlay();
      if (raf) { window.cancelAnimationFrame(raf); raf = 0; }
    }
    function reset() { pause(); t = t0; sync(); }
    var unVisible = CYL.onVisible(o.stage, function (on) { visible = on; lastTs = 0; });

    /* ----- redraw ----- */
    var cur = null;
    function add(P, d, k) { return [P[0] + d[0] * k, P[1] + d[1] * k]; }
    function sync() {
      var s = cur = CURV.state(m, t);
      var P = [s.x, s.y];
      dot.set(P);
      var upTo = Math.max(1, Math.round((t - t0) / (t1 - t0 || 1) * N));
      ghost.set(show.path ? samples.map(function (q) { return [q[0], q[1]]; }) : []);
      trace.set(show.trace ? samples.slice(0, upTo + 1).map(function (q) { return [q[0], q[1]]; }).concat([P]) : []);
      var V = [s.vx / kV, s.vy / kV], A = [s.ax / kA, s.ay / kA];
      vArrow.set(P, add(P, V, 1)); vArrow.setVisible(show.v && s.v > EPS);
      aArrow.set(P, add(P, A, 1)); aArrow.setVisible(show.a && s.a > EPS);
      // components, drawn tip to tail from the particle
      var tiny = span * 2e-3;
      var cv = show.v && show.comps === 'xy' && s.v > EPS;
      if (cv) { cVx.set(P, [P[0] + V[0], P[1]]); cVy.set([P[0] + V[0], P[1]], add(P, V, 1)); }
      cVx.setVisible(cv && Math.abs(V[0]) > tiny); cVy.setVisible(cv && Math.abs(V[1]) > tiny);
      var cxy = show.a && show.comps === 'xy' && s.a > EPS;
      if (cxy) { cAx.set(P, [P[0] + A[0], P[1]]); cAy.set([P[0] + A[0], P[1]], add(P, A, 1)); }
      cAx.setVisible(cxy && Math.abs(A[0]) > tiny); cAy.setVisible(cxy && Math.abs(A[1]) > tiny);
      var cnt = show.a && show.comps === 'nt' && s.a > EPS && !!s.et;
      if (cnt) {
        var Q = add(P, s.et, s.at / kA);
        cAt.set(P, Q); cAn.set(Q, add(Q, s.en, s.an / kA));
      }
      cAt.setVisible(cnt && Math.abs(s.at / kA) > tiny); cAn.setVisible(cnt && Math.abs(s.an / kA) > tiny);
      // unit vectors
      var L = 0.13 * span;
      if (show.frame && s.et) { eT.set(P, add(P, s.et, L)); eN.set(P, add(P, s.en, L)); }
      gFrame.setVisible(!!(show.frame && s.et));
      // osculating circle
      var okC = show.circle && s.center && s.rho < 40 * span;
      if (okC) {
        circle.set({ center: s.center, r: s.rho });
        centerDot.set(s.center);
        radius.set(s.center, P);
      }
      gCircle.setVisible(!!okC);
      if (tSlider && Math.abs(tSlider.get() - t) > 1e-9) tSlider.set(t, true);
      syncPlay();
      updateReadouts(s);
      syncNote();
      if (typeof o.onUpdate === 'function') { try { o.onUpdate(s, api); } catch (e) { CYL.error('CURV.figure onUpdate failed:', e); } }
    }
    function updateReadouts(s) {
      function R(k, v) { if (readoutEls[k]) readoutEls[k].set(v); }
      function u(unit) { return cards ? '' : ' ' + unit; }   // on a card the unit is in the card title
      R('t', f4(s.t) + ' ' + o.timeUnit);
      R('pos', '(' + f4(s.x) + ', ' + f4(s.y) + ') ' + U);
      R('v', f4(s.v) + u(UV));
      R('vx', f4(s.vx) + u(UV)); R('vy', f4(s.vy) + u(UV));
      R('a', f4(s.a) + u(UV + '\u00b2'));
      R('ax', f4(s.ax) + u(UV + '\u00b2')); R('ay', f4(s.ay) + u(UV + '\u00b2'));
      R('at', f4(s.at) + u(UV + '\u00b2')); R('an', f4(s.an) + u(UV + '\u00b2'));
      R('rho', !(s.v > 1e-6) ? '\u2014 (at rest)' : isFinite(s.rho) && s.rho < 1e6 ? f4(s.rho) + ' ' + U : '\u221e (straight)');
      R('psi', isFinite(s.psi) ? CYL.fmt(s.psi * 180 / Math.PI, 4) + '\u00b0' : '\u2014');
    }
    var noteKey = null;
    function syncNote() {   // rewritten only when a scale changes (it holds rendered math)
      var key = kV + '|' + kA;
      if (key === noteKey) return;
      noteKey = key;
      scaleNote.innerHTML = 'Arrows are to scale: 1 ' + U + ' on the grid is ' + CYL.fmt(kV) + ' ' + UV + ' for \\(\\vvec\\) and ' +
        CYL.fmt(kA) + ' ' + UV + '\u00b2 for \\(\\avec\\).';
      CYL.renderMath(scaleNote);
    }

    var ro = null;
    var api = {
      plane: p,
      el: o.stage,
      readoutEls: readoutEls,
      controls: ctl,
      state: function () { return cur; },
      t: function () { return t; },
      setT: function (v) { pause(); t = Math.min(t1, Math.max(t0, v)); sync(); return api; },
      play: play, pause: pause,
      reset: function () { reset(); return api; },
      isPlaying: function () { return playing; },
      setMotion: function (motion, a, b, start) {
        pause();
        m = motion; t0 = a; t1 = b; t = start != null ? start : a;
        sample(); autoScales();
        if (tSlider) {                                   // a fresh slider, so its range and fill are right
          var old = tSlider.el;
          tSlider = makeSlider();
          old.parentNode.replaceChild(tSlider.el, old);
        }
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
      destroy: function () { pause(); if (ro) ro.disconnect(); unVisible(); }   // before building a new figure on the same stage
    };
    sync();
    if (panel) CYL.renderMath(panel);

    /* ----- fill the stage: when the controls sit beside the plot and are taller than the plot column
       (plot + transport, + the readout cards under it), grow the plot to match (the extra room shows
       more grid), so there is no empty band around it ----- */
    function fit() {
      var main = o.stage.parentNode, side = panel && (panel.closest('.viz-controls') || panel);
      var base = baseHeight();
      if (!main || !base) return;
      var target = base;
      if (side && side.getBoundingClientRect().left > main.getBoundingClientRect().left + 20) {
        var tr = main.querySelector(':scope > .mf-transport');
        var below = cards && o.readoutsEl.offsetParent !== null ? o.readoutsEl.offsetHeight : 0;
        target = Math.max(base, Math.round(side.offsetHeight - (tr ? tr.offsetHeight : 0) - below - 2));
      }
      if (Math.abs(target - curH) > 4) { curH = target; p.setOptions({ height: target }); sync(); }
    }
    if (window.ResizeObserver) {
      ro = new ResizeObserver(CYL.debounce(fit, 60));
      if (panel) ro.observe(panel.closest('.viz-controls') || panel);
      if (cards) ro.observe(o.readoutsEl);
      if (o.stage.parentNode) ro.observe(o.stage.parentNode);
    }
    window.setTimeout(fit, 0);
    if (o.autoplay && !CYL.prefersReducedMotion()) play();
    return api;
  };

  window.CURV = CURV;
})(window, document);
