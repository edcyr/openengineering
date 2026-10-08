/*
 * Lesson 1.2 widgets (need assets/js/models/bicycle.js)
 *   hands-off   : open-loop response to a yaw disturbance (gust/bump), no steering
 *   lane-change : closed-loop double lane change, driven by a model driver or by you
 */
(function () {
  const RVD = window.RVD;
  const B = RVD.bicycle;
  const DEG = Math.PI / 180;

  /* ---------- shared helpers ---------- */
  function balanceLabel(v) {
    if (Math.abs(v) < 0.05) return "Neutral";
    return (v > 0 ? "Understeer " : "Oversteer ") + Math.round(Math.abs(v) * 100) + "%";
  }
  function speedLabel(v) { return `${RVD.fmt(v, 0)} m/s (${RVD.fmt(v * 3.6, 0)} km/h)`; }

  function stabilityReadouts(parent) {
    const ro = RVD.ui.readouts(parent);
    const crit = RVD.ui.readout(ro, "Critical speed");
    const verdict = RVD.ui.readout(ro, "Car alone at this speed");
    return function update(p) {
      const st = B.stability(p);
      crit.set(isFinite(st.Ucrit) ? `${RVD.fmt(st.Ucrit * 3.6, 0)} km/h` : "none", isFinite(st.Ucrit) ? "warn" : "ok");
      verdict.set(st.stable ? "Stable" : "Unstable", st.stable ? "ok" : "bad");
      return st;
    };
  }

  /* ================================================================== */
  /*
   * Top-view animation of a hands-off run. The camera follows the car; the
   * road, the original path and distance markers are fixed to the ground.
   * frames: [{ t, X, Y, psi, beta, r }] sampled every DT_FRAME seconds.
   */
  const DT_FRAME = 0.02;
  function carAnimation(parent) {
    const svgEl = RVD.svgEl;
    const W = 640, H = 240, S = 14;            // px per metre
    const cx = 250, cy = H / 2;                // car position on screen (offset left: more road ahead)
    const box = RVD.ui.h("div", "anim-box", parent);
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "anim-svg", role: "img", "aria-label": "Top view of the car during the hands-off test" }, box);
    const defs = svgEl("defs", {}, svg);
    const mk = svgEl("marker", { id: "anim-arw", viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: "auto-start-reverse" }, defs);
    svgEl("path", { d: "M0,0 L10,5 L0,10 z", class: "anim-arrowhead" }, mk);
    const mk2 = svgEl("marker", { id: "anim-arw2", viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: "auto-start-reverse" }, defs);
    svgEl("path", { d: "M0,0 L10,5 L0,10 z", class: "anim-gusthead" }, mk2);

    const mk3 = svgEl("marker", { id: "anim-arw3", viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: "auto-start-reverse" }, defs);
    svgEl("path", { d: "M0,0 L10,5 L0,10 z", class: "anim-orighead" }, mk3);

    const gWorld = svgEl("g", {}, svg);
    const trail = svgEl("polyline", { class: "anim-trail", fill: "none" }, svg);
    const ghostCar = svgEl("g", { class: "anim-ghost" }, svg);
    const car = svgEl("g", {}, svg);
    const hud = svgEl("g", {}, svg);

    function drawCar(g, ghost) {
      // Car frame: x forward, y to the LEFT is screen-up, so draw with y inverted.
      const L = 4.2 * S, Wd = 1.8 * S, ax = 1.225 * S, tw = 0.78 * S;
      [[ax, tw], [ax, -tw], [-ax, tw], [-ax, -tw]].forEach(([x, y]) =>
        svgEl("rect", { x: x - 0.33 * S, y: -y - 0.13 * S, width: 0.66 * S, height: 0.26 * S, rx: 1, class: ghost ? "" : "anim-wheel" }, g));
      svgEl("rect", { x: -L / 2, y: -Wd / 2, width: L, height: Wd, rx: 5, class: ghost ? "" : "anim-body" }, g);
      if (!ghost) {
        svgEl("rect", { x: 2, y: -Wd / 2 + 2.5, width: 7, height: Wd - 5, rx: 2, class: "anim-glass" }, g);
        svgEl("path", { d: `M${L / 2 - 1},-4 L${L / 2 + 5},0 L${L / 2 - 1},4 z`, class: "anim-nose" }, g);
      }
    }
    drawCar(car, false);
    drawCar(ghostCar, true);
    const velArrow = svgEl("line", { x1: 0, y1: 0, x2: 0, y2: 0, class: "anim-vel", "marker-end": "url(#anim-arw)" }, svg);
    const gust = svgEl("g", {}, car);
    svgEl("line", { x1: 17, y1: 46, x2: 17, y2: 13, class: "anim-gust", "marker-end": "url(#anim-arw2)" }, gust);
    svgEl("text", { x: 23, y: 44, class: "anim-gust-label" }, gust).textContent = "gust";

    const hudText = svgEl("text", { x: 12, y: 20, class: "anim-hud" }, hud);
    const hudText2 = svgEl("text", { x: 12, y: 38, class: "anim-hud" }, hud);
    const driftText = svgEl("text", { x: W - 12, y: 20, "text-anchor": "end", class: "anim-hud" }, hud);
    const bigText = svgEl("text", { x: W / 2, y: 40, "text-anchor": "middle", class: "anim-big" }, hud);
    const legend = RVD.ui.h("p", "muted", box,
      "Camera follows the car. Dashed red line: the car's original path. Purple arrow: the direction the car is actually traveling (it differs from where the nose points when the car is sliding sideways).");
    legend.style.cssText = "font-size:13px;margin:6px 0 0";

    function render(run, ghostRun, i) {
      const f = run.frames[Math.min(i, run.frames.length - 1)];
      const camX = f.X, camY = f.Y;
      const toS = (X, Y) => [cx + (X - camX) * S, cy - (Y - camY) * S];
      const x0 = camX - cx / S - 5, x1 = camX + (W - cx) / S + 5;

      // Ground-fixed scenery
      gWorld.textContent = "";
      const yEdge = (Y) => { const [, y] = toS(0, Y); return y; };
      [[5.25, "anim-edge"], [-1.75, "anim-edge"]].forEach(([Y, cls]) => {
        svgEl("line", { x1: 0, x2: W, y1: yEdge(Y), y2: yEdge(Y), class: cls }, gWorld);
      });
      let dashes = "";
      for (let x = Math.floor(x0 / 6) * 6; x < x1; x += 6) {
        const [a] = toS(x, 0), [b] = toS(x + 3, 0);
        dashes += `M${a},${yEdge(1.75)}H${b}`;
      }
      svgEl("path", { d: dashes, class: "anim-lane" }, gWorld);
      svgEl("line", { x1: 0, x2: W, y1: yEdge(0), y2: yEdge(0), class: "anim-orig" }, gWorld);
      // Distance markers pinned to the bottom of the view, so forward motion stays visible.
      for (let x = Math.ceil(x0 / 10) * 10; x < x1; x += 10) {
        const [sx] = toS(x, 0), sy = H - 40;
        svgEl("line", { x1: sx, x2: sx, y1: sy - 5, y2: sy + 5, class: "anim-post" }, gWorld);
        if (x % 20 === 0) svgEl("text", { x: sx, y: sy + 18, "text-anchor": "middle", class: "anim-mark" }, gWorld).textContent = `${x} m`;
      }
      // When the original path is off-screen, point back to it.
      const yo = yEdge(0);
      if (yo > H - 50 || yo < 8) {
        const down = yo > H - 50, ya = down ? H - 62 : 52;
        svgEl("line", { x1: W - 40, x2: W - 40, y1: down ? ya - 26 : ya + 26, y2: ya, class: "anim-orig-arrow", "marker-end": "url(#anim-arw3)" }, gWorld);
        svgEl("text", { x: W - 50, y: down ? ya - 12 : ya + 18, "text-anchor": "end", class: "anim-mark" }, gWorld).textContent = "original path";
      }

      // Trail (last ~3 s)
      const from = Math.max(0, i - 150);
      trail.setAttribute("points", run.frames.slice(from, i + 1).map((q) => toS(q.X, q.Y).join(",")).join(" "));

      // Ghost car at the same moment
      if (ghostRun) {
        const g = ghostRun.frames[Math.min(i, ghostRun.frames.length - 1)];
        const [gx, gy] = toS(g.X, g.Y);
        ghostCar.style.display = "";
        ghostCar.setAttribute("transform", `translate(${gx},${gy}) rotate(${-g.psi / DEG})`);
      } else ghostCar.style.display = "none";

      // Car, velocity direction, gust
      car.setAttribute("transform", `translate(${cx},${cy}) rotate(${-f.psi / DEG})`);
      const course = f.psi + f.beta;
      velArrow.setAttribute("x1", cx); velArrow.setAttribute("y1", cy);
      velArrow.setAttribute("x2", cx + 55 * Math.cos(course)); velArrow.setAttribute("y2", cy - 55 * Math.sin(course));
      gust.style.display = f.t > 0.3 && f.t < 0.6 ? "" : "none";

      hudText.textContent = `t = ${f.t.toFixed(2)} s     heading ${RVD.fmt(f.psi / DEG, 1)}°`;
      hudText2.textContent = `yaw rate ${RVD.fmt(f.r / DEG, 1)}°/s     sideslip ${RVD.fmt(f.beta / DEG, 1)}°`;
      driftText.textContent = `drift from original path: ${RVD.fmt(f.Y, 1)} m`;
      const atEnd = i >= run.frames.length - 1;
      bigText.textContent = atEnd && run.spun ? "SPIN!" : "";
      return f;
    }
    return { render };
  }

  /* ================================================================== */
  RVD.widgets["hands-off"] = function (root) {
    const { controls, plots } = RVD.ui.layout(root);
    const bal = RVD.ui.slider(controls, { label: "Balance", min: -1, max: 1, step: 0.05, value: 0.5, format: balanceLabel, onInput: run });
    const U = RVD.ui.slider(controls, { label: "Speed", min: 15, max: 45, step: 1, value: 30, format: speedLabel, onInput: run });
    const updateStab = stabilityReadouts(controls);
    const ro = RVD.ui.readouts(controls);
    const rHead = RVD.ui.readout(ro, "Heading change");
    const status = RVD.ui.status(controls);

    RVD.ui.group(controls, "Animation");
    const playRow = RVD.ui.h("div", "btn-row", controls);
    const replayBtn = RVD.ui.button(playRow, "▶ Replay", () => play());
    const pace = RVD.ui.choice(controls, {
      value: 1, options: [{ label: "Real time", value: 1 }, { label: "Slow motion", value: 0.35 }], onInput: () => play()
    });
    RVD.ui.button(controls, "Keep this run as a ghost", () => { ghost = last; draw(); play(); });

    const anim = carAnimation(plots);
    const box1 = RVD.ui.h("div", null, plots);
    const p1 = RVD.plot(box1, { xlim: [0, 6], ylim: [-5, 20], xlabel: "Time (s)", ylabel: "Yaw rate (deg/s, + = left)", height: 250 });
    const box2 = RVD.ui.h("div", null, plots);
    const p2 = RVD.plot(box2, { xlim: [0, 180], ylim: [-2, 18], xlabel: "Distance traveled X (m)", ylabel: "Drift Y (m, + = left)", height: 220 });
    RVD.legend(box2, [
      { label: "This car", color: "var(--s1)" },
      { label: "Ghost run", color: "var(--text-muted)", dash: true },
      { label: "Gust acts (0.3–0.6 s)", color: "var(--s5)" }
    ]);

    let last = null, ghost = null, raf = null;
    const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function simulate() {
      const p = B.car(bal.value, U.value);
      let s = { X: 0, Y: 0, psi: 0, beta: 0, r: 0, t: 0 };
      const dt = 0.005, every = Math.round(DT_FRAME / dt);
      const out = { yaw: [], path: [], frames: [{ t: 0, X: 0, Y: 0, psi: 0, beta: 0, r: 0 }], spun: false, p };
      let k = 0;
      while (s.t < 6) {
        const Mz = s.t > 0.3 && s.t < 0.6 ? 600 : 0; // gust: 600 N·m yaw moment for 0.3 s
        s = B.step(s, 0, p, dt, Mz);
        if (++k % every === 0) {
          out.yaw.push([s.t, s.r / DEG]); out.path.push([s.X, s.Y]);
          out.frames.push({ t: s.t, X: s.X, Y: s.Y, psi: s.psi, beta: s.beta, r: s.r });
        }
        if (Math.abs(s.beta) > 20 * DEG) { out.spun = true; break; }
      }
      out.frames.push({ t: s.t, X: s.X, Y: s.Y, psi: s.psi, beta: s.beta, r: s.r });
      out.end = s;
      return out;
    }

    function run() { last = simulate(); draw(); play(); }

    function showFrame(i) {
      const f = anim.render(last, ghost, i);
      p1.line("cursor", [[f.t, -5], [f.t, 20]], "series series--thin cm", { top: true });
      p1.point("cursorPt", f.t, Math.max(-5, Math.min(20, f.r / DEG)), { cls: "f2", r: 5 });
      p2.point("cursorPt", f.X, f.Y, { cls: "f2", r: 5 });
    }

    function play() {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      const n = last.frames.length;
      if (reduceMotion) { showFrame(n - 1); return; }
      let t0 = null;
      const tick = (ts) => {
        if (t0 == null) t0 = ts;
        const i = Math.floor(((ts - t0) / 1000) * pace.value / DT_FRAME);
        showFrame(Math.min(i, n - 1));
        raf = i < n - 1 ? requestAnimationFrame(tick) : null;
      };
      raf = requestAnimationFrame(tick);
    }

    function draw() {
      const r = last;
      // Fit the drift plot to this run (and the ghost) so a spinning car stays in view.
      const pts = r.path.concat(ghost ? ghost.path : []);
      const maxX = Math.max(60, ...pts.map((q) => q[0]));
      const maxY = Math.max(10, ...pts.map((q) => q[1]));
      p2.setLimits([0, Math.ceil(maxX / 20) * 20], [-2, Math.ceil((maxY + 1) / 5) * 5]);
      p1.area("gust", [[0.3, -5], [0.6, -5], [0.6, 20], [0.3, 20]], "f5");
      if (ghost) {
        p1.line("g", ghost.yaw, "series series--thin series--dash cm");
        p2.line("g", ghost.path, "series series--thin series--dash cm");
      }
      p1.line("y", r.yaw, "series c1");
      p2.line("p", r.path, "series c1");
      const endP = r.path[r.path.length - 1];
      if (r.spun) {
        p2.point("end", endP[0], endP[1], { cls: "f2", r: 7 });
        p2.label("endL", endP[0], endP[1], "spin!", { cls: "annot f2", dx: 8, dy: -8 });
      } else { p2.remove("end"); p2.remove("endL"); }

      updateStab(r.p);
      rHead.set(r.spun ? "spun" : RVD.fmt(r.end.psi / DEG, 1) + "°", r.spun ? "bad" : null);
      const finalRate = Math.abs(r.end.r / DEG);
      if (r.spun) status.set("Unstable: the disturbance grew by itself until the car spun — with no steering input at all.", "bad");
      else if (finalRate > 0.5) status.set("Barely stable: the yaw rate is still dying away very slowly. The car is close to its critical speed.", "warn");
      else status.set("Stable: the yaw rate returned to zero by itself. The car settled on a new heading — getting back to the old path is the driver's job.", "ok");
    }
    run();
  };

  /* ================================================================== */
  // Double lane change: 3.5 m offset, 50 m transitions.
  const ramp = (x, x0, x1, y0, y1) => (x <= x0 ? y0 : x >= x1 ? y1 : y0 + ((y1 - y0) * (1 - Math.cos((Math.PI * (x - x0)) / (x1 - x0)))) / 2);
  const pathY = (x) => (x < 90 ? ramp(x, 30, 80, 0, 3.5) : ramp(x, 100, 150, 3.5, 0));
  const END = 200, GATE = 1.6, CAR_HALF = 0.9;
  const CONES = [];
  [[0, 25, 5, 0], [82, 98, 4, 3.5], [155, 200, 5, 0]].forEach(([x0, x1, dx, yc]) => {
    for (let x = x0; x <= x1; x += dx) { CONES.push({ x, y: yc + GATE }); CONES.push({ x, y: yc - GATE }); }
  });

  RVD.widgets["lane-change"] = function (root) {
    const { controls, plots } = RVD.ui.layout(root);

    const mode = RVD.ui.choice(controls, {
      value: "robot",
      options: [{ label: "Model driver", value: "robot" }, { label: "You drive", value: "human" }],
      onInput: () => { syncMode(); reset(); }
    });

    RVD.ui.group(controls, "Car");
    const bal = RVD.ui.slider(controls, { label: "Balance", min: -1, max: 1, step: 0.05, value: 0.3, format: balanceLabel, onInput: reset });
    const U = RVD.ui.slider(controls, { label: "Speed", min: 15, max: 40, step: 1, value: 30, format: speedLabel, onInput: reset });
    const updateStab = stabilityReadouts(controls);

    const robotBox = RVD.ui.h("div", "widget__controls", controls);
    RVD.ui.group(robotBox, "Model driver");
    const G = RVD.ui.slider(robotBox, { label: "Steering gain", min: 0.5, max: 3, step: 0.1, value: 1.5, digits: 1, onInput: reset });
    const tau = RVD.ui.slider(robotBox, { label: "Reaction time", min: 0.05, max: 0.6, step: 0.05, value: 0.2, unit: "s", onInput: reset });
    const KR = RVD.ui.slider(robotBox, { label: "Yaw “feel” (seat of the pants)", min: 0, max: 0.15, step: 0.01, value: 0.05, onInput: reset });

    const humanBox = RVD.ui.h("div", "widget__controls", controls);
    RVD.ui.group(humanBox, "You drive");
    const help = RVD.ui.h("p", "muted", humanBox, "Press Run, then hold ↑ / ↓ (or the buttons) to steer toward the top or bottom of the track view.");
    help.style.cssText = "font-size:13.5px;margin:0";
    const pace = RVD.ui.choice(humanBox, { value: 0.5, options: [{ label: "Half speed", value: 0.5 }, { label: "Real time", value: 1 }] });
    const steerRow = RVD.ui.h("div", "btn-row", humanBox);
    const upBtn = RVD.ui.button(steerRow, "▲ steer up", () => {});
    const dnBtn = RVD.ui.button(steerRow, "▼ steer down", () => {});

    const runRow = RVD.ui.h("div", "btn-row", controls);
    const runBtn = RVD.ui.button(runRow, "▶ Run", () => start());
    runBtn.classList.add("btn-sm");
    RVD.ui.button(runRow, "Keep as ghost", () => { ghost = { trace: trace.slice(), steer: steer.slice() }; drawStatic(); drawDynamic(); });

    const ro = RVD.ui.readouts(controls);
    const rCones = RVD.ui.readout(ro, "Cones hit");
    const rErr = RVD.ui.readout(ro, "Max path error");
    const rRev = RVD.ui.readout(ro, "Steering reversals");
    const rAy = RVD.ui.readout(ro, "Peak lateral accel.");
    const status = RVD.ui.status(controls);

    // ---- plots ----
    const box1 = RVD.ui.h("div", null, plots);
    const p1 = RVD.plot(box1, { xlim: [-5, 205], ylim: [-3, 7], xlabel: "Distance along the track (m) →", ylabel: "Lateral position (m, + = left)", height: 240 });
    RVD.legend(box1, [
      { label: "Car path", color: "var(--s1)" },
      { label: "Ideal line", color: "var(--text-muted)", dash: true },
      { label: "Cones", color: "var(--s5)" }
    ]);
    const box2 = RVD.ui.h("div", null, plots);
    const p2 = RVD.plot(box2, { xlim: [-5, 205], ylim: [-6, 6], xlabel: "Distance along the track (m)", ylabel: "Steer (deg, + = left)", height: 180 });

    // ---- simulation state ----
    let s, t, buf, delta, trace, steer, hits, maxErr, peakAy, rev, ext, dir, done, spun, raf = null, acc, lastTs;
    let ghost = null;
    const keys = { up: false, down: false };

    function car() { return B.car(bal.value, U.value); }

    function reset() {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      s = { X: 0, Y: 0, psi: 0, beta: 0, r: 0, t: 0 };
      t = 0; buf = []; delta = 0; trace = [[0, 0]]; steer = [[0, 0]];
      hits = new Set(); maxErr = 0; peakAy = 0; rev = 0; ext = 0; dir = 0;
      done = false; spun = false;
      updateStab(car());
      drawStatic(); drawDynamic();
      status.set(mode.value === "robot"
        ? "Press Run to watch the model driver attempt the lane change."
        : "Press Run, then steer with ↑ / ↓. Stay between the cones.", null);
      runBtn.disabled = false;
    }

    function syncMode() {
      robotBox.style.display = mode.value === "robot" ? "" : "none";
      humanBox.style.display = mode.value === "human" ? "" : "none";
    }

    function robotSteer(p) {
      const Tp = 1.0, Lp = U.value * Tp;
      const th = Math.atan2(pathY(s.X + Lp) - s.Y, Lp) - s.psi;     // angle to the preview point
      const rTarget = (U.value * 2 * Math.sin(th)) / Lp;            // yaw rate that would reach it
      const cmd = G.value * ((2 * p.L) / Lp) * th - KR.value * (s.r - rTarget);
      buf.push(Math.max(-12 * DEG, Math.min(12 * DEG, cmd)));
      const n = Math.round(tau.value / 0.005);
      return buf.length > n ? buf.shift() : 0;
    }

    function humanSteer(h) {
      const rate = 8 * DEG, max = 5 * DEG;
      const dirn = (keys.up ? 1 : 0) - (keys.down ? 1 : 0);
      if (dirn) delta = Math.max(-max, Math.min(max, delta + dirn * rate * h));
      else delta = Math.sign(delta) * Math.max(0, Math.abs(delta) - 12 * DEG * h);
      return delta;
    }

    function stepOnce(p, h) {
      const d = mode.value === "robot" ? robotSteer(p) : humanSteer(h);
      delta = d;
      const prevX = s.X;
      s = B.step(s, d, p, h);
      t += h;
      peakAy = Math.max(peakAy, Math.abs(s.ay) / RVD.G);
      // steering reversals: count direction changes larger than 0.5 deg
      const dd = d / DEG;
      if (dir >= 0 && dd < ext - 0.5) { if (dir > 0) rev++; dir = -1; ext = dd; }
      else if (dir <= 0 && dd > ext + 0.5) { if (dir < 0) rev++; dir = 1; ext = dd; }
      else if ((dir > 0 && dd > ext) || (dir < 0 && dd < ext)) ext = dd;
      // cones and path error
      CONES.forEach((c, i) => { if (prevX < c.x && s.X >= c.x && Math.abs(s.Y - c.y) < CAR_HALF) hits.add(i); });
      if ((s.X <= 25) || (s.X >= 82 && s.X <= 98) || s.X >= 155) maxErr = Math.max(maxErr, Math.abs(s.Y - pathY(s.X)));
      if (Math.abs(s.beta) > 20 * DEG) { spun = true; done = true; }
      if (s.X >= END || t > 20) done = true;
    }

    function frame(ts) {
      const p = car();
      if (lastTs == null) lastTs = ts;
      const scale = mode.value === "robot" ? 1.5 : pace.value;
      acc += Math.min(0.05, (ts - lastTs) / 1000) * scale;
      lastTs = ts;
      const h = 0.005;
      while (acc >= h && !done) {
        stepOnce(p, h);
        acc -= h;
        if (Math.round(t / h) % 4 === 0) { trace.push([s.X, s.Y]); steer.push([s.X, delta / DEG]); }
      }
      drawDynamic();
      if (done) finish(); else raf = requestAnimationFrame(frame);
    }

    function start() {
      reset();
      acc = 0; lastTs = null;
      runBtn.disabled = true;
      status.set("Running…", null);
      raf = requestAnimationFrame(frame);
    }

    function finish() {
      raf = null;
      runBtn.disabled = false;
      trace.push([s.X, s.Y]); steer.push([s.X, delta / DEG]);
      drawDynamic();
      const st = B.stability(car());
      if (spun) {
        status.set(st.stable
          ? "Spun! The car is stable on its own, but the driver's corrections pushed it past the limit. Try less gain or a quicker reaction."
          : "Spun! This car is unstable at this speed and the driver could not keep catching it. Try a quicker reaction, more yaw feel, or less speed.", "bad");
      } else if (hits.size === 0) {
        status.set(`Clean run. ${rev} steering reversals — ${rev > 6 ? "a high workload for the driver." : "a comfortable workload."}`, "ok");
      } else {
        status.set(`Completed, but ${hits.size} cone${hits.size > 1 ? "s" : ""} hit. ${maxErr > 1 ? "The car could not follow the line closely enough." : ""}`, "warn");
      }
    }

    function drawStatic() {
      const ideal = [];
      for (let x = -5; x <= 205; x += 2) ideal.push([x, pathY(x)]);
      p1.line("ideal", ideal, "series series--thin series--dash cm");
      p2.line("zero", [[-5, 0], [205, 0]], "series series--thin cm");
      if (ghost) {
        p1.line("ghost", ghost.trace, "series series--thin series--dash c4");
        p2.line("ghostS", ghost.steer, "series series--thin series--dash c4");
      }
    }

    function drawDynamic() {
      CONES.forEach((c, i) => p1.point("c" + i, c.x, c.y, { cls: hits.has(i) ? "f2" : "f5", r: hits.has(i) ? 5 : 3 }));
      p1.line("trace", trace, "series c1");
      p2.line("steer", steer, "series c1");
      p1.point("car", s.X, s.Y, { cls: spun ? "f2" : "f1", r: 6 });
      rCones.set(String(hits.size), hits.size ? "bad" : "ok");
      rErr.set(RVD.fmt(maxErr, 2) + " m", maxErr > GATE - CAR_HALF ? "warn" : null);
      rRev.set(String(rev));
      rAy.set(RVD.fmt(peakAy, 2) + " g");
    }

    // ---- input for "You drive" ----
    function setKey(e, down) {
      if (mode.value !== "human" || !raf) return;
      if (e.key === "ArrowUp") { keys.up = down; e.preventDefault(); }
      if (e.key === "ArrowDown") { keys.down = down; e.preventDefault(); }
    }
    window.addEventListener("keydown", (e) => setKey(e, true));
    window.addEventListener("keyup", (e) => setKey(e, false));
    [[upBtn, "up"], [dnBtn, "down"]].forEach(([b, k]) => {
      b.addEventListener("pointerdown", (e) => { keys[k] = true; b.setPointerCapture(e.pointerId); });
      ["pointerup", "pointercancel", "pointerleave"].forEach((ev) => b.addEventListener(ev, () => { keys[k] = false; }));
    });

    syncMode();
    reset();
  };
})();
