/*
 * Module 5 widgets (physics in assets/js/models/bicycle.js, SAE signs: positive = right turn)
 *   ackermann        : top-down turning-circle sketcher with adjustable steering geometry   (5.1)
 *   bicycle-steady   : steady-turn solver: top view with velocity/force vectors + angles vs speed (5.2)
 *   handling-diagram : axle pair analysis and the handling diagram                          (5.3)
 *   speed-response   : yaw-rate gain and constant-radius steer vs speed                     (5.3)
 */
(function () {
  const RVD = window.RVD;
  const B = RVD.bicycle;
  const svgEl = RVD.svgEl;
  const G = 9.81, RAD = Math.PI / 180, KMH = 3.6;
  const presetOptions = Object.keys(B.presets).map((k) => ({ label: B.presets[k].label, value: k }));
  const fmtDeg = (rad, d) => `${rad < -1e-9 ? "−" : rad > 1e-9 ? "+" : ""}${RVD.fmt(Math.abs(rad / RAD), d == null ? 2 : d)}°`;
  const placeFirst = RVD.place.first, placeLabel = RVD.place.near;

  // Arrow marker defs for custom SVGs
  function markers(svg, id, kinds) {
    const defs = svgEl("defs", {}, svg);
    kinds.forEach((k) => {
      const mk = svgEl("marker", { id: `${id}-${k}`, viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: "auto-start-reverse" }, defs);
      svgEl("path", { d: "M0,0 L10,5 L0,10 z", class: "sv-head-" + k }, mk);
    });
    return (k) => `url(#${id}-${k})`;
  }
  let uid = 0;

  /* ------------------------------------------------------------------ */
  /* 5.1  Turning-circle sketcher                                         */
  /* ------------------------------------------------------------------ */
  RVD.widgets["ackermann"] = function (root) {
    const { controls, plots } = RVD.ui.layout(root);
    let base = B.presets.club;

    RVD.ui.choice(controls, {
      value: "club", options: presetOptions,
      onInput: (k) => { base = B.presets[k]; L.set(base.L); T.set(base.t); draw(); }
    });
    RVD.ui.group(controls, "Car and turn");
    const L = RVD.ui.slider(controls, { label: "Wheelbase L", min: 1.4, max: 3.2, step: 0.01, value: base.L, unit: "m", onInput: draw });
    const T = RVD.ui.slider(controls, { label: "Track width t", min: 1.0, max: 1.8, step: 0.01, value: base.t, unit: "m", onInput: draw });
    const R = RVD.ui.slider(controls, { label: "Turn radius R (rear-axle center)", min: 3, max: 20, step: 0.1, value: 8, digits: 1, unit: "m", onInput: draw });
    RVD.ui.group(controls, "Steering geometry");
    const ack = RVD.ui.slider(controls, {
      label: "Ackermann", min: -60, max: 120, step: 5, value: 100, onInput: draw,
      format: (v) => `${RVD.fmt(v, 0)}%` + (v === 100 ? " (Ackermann)" : v === 0 ? " (parallel)" : v < 0 ? " (anti)" : "")
    });

    const ro = RVD.ui.readouts(controls);
    const rD = RVD.ui.readout(ro, "Bicycle steer δ = atan(L/R)");
    const rI = RVD.ui.readout(ro, "Inside wheel: needs / gets");
    const rO = RVD.ui.readout(ro, "Outside wheel: needs / gets");
    const rS = RVD.ui.readout(ro, "Front slip angles at walking pace");
    const rOff = RVD.ui.readout(ro, "Off-tracking (front vs rear path)");
    const status = RVD.ui.status(controls);

    const W = 520, HMAX = 400;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${HMAX}`, class: "ack-svg", role: "img", "aria-label": "Top view of a car turning right about a turn center, with each wheel's axis line drawn" }, plots);
    const g = svgEl("g", {}, svg);
    const note = svgEl("text", { x: 12, y: HMAX - 10, class: "sv-note" }, svg);
    note.textContent = "Drawn to scale. The car turns right about the turn center.";
    RVD.legend(plots, [
      { label: "Inside front wheel's axis", color: "var(--s3)", dash: true },
      { label: "Outside front wheel's axis", color: "var(--s4)", dash: true },
      { label: "Rear-axle line", color: "var(--text-muted)", dash: true },
      { label: "Front-axle path", color: "var(--s2)", dash: true },
      { label: "Rear-axle path", color: "var(--s1)", dash: true }
    ]);

    function draw() {
      g.textContent = "";
      const Lv = L.value, t = T.value, Rv = Math.max(R.value, t / 2 + 0.5);
      // Needed (kinematic) steer angles, turn center to the right of the rear axle.
      const dB = Math.atan(Lv / Rv), dI = Math.atan(Lv / (Rv - t / 2)), dO = Math.atan(Lv / (Rv + t / 2));
      const p = ack.value / 100;
      const gI = dB + p * (dI - dB), gO = dB - p * (dB - dO);   // what the linkage gives

      // World: x forward (up), y right. Rear-axle center at the origin, turn center at (0, R).
      const xmin = -1.2, xmax = Lv + 1.4, ymin = -t / 2 - 1.2, ymax = Rv + 1.2;
      // Scale to fit, then size the drawing to its content (no empty band at the bottom).
      const sc = Math.min((W - 30) / (ymax - ymin), (HMAX - 50) / (xmax - xmin));
      const H = Math.round(sc * (xmax - xmin) + 50);
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      note.setAttribute("y", H - 8);
      const ox = 15 + ((W - 30) - sc * (ymax - ymin)) / 2 - ymin * sc;
      const oy = 12 + xmax * sc;
      const P = (x, y) => [ox + y * sc, oy - x * sc];
      const line = (a, b, cls, extra) => svgEl("line", Object.assign({ x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: cls }, extra || {}), g);

      // Paths: rear-axle center (radius R) and front-axle center (radius sqrt(R² + L²)) — arcs ahead of the car
      const Rf = Math.hypot(Rv, Lv);
      const arc = (rad, a0, a1, cls) => {
        const pts = [];
        for (let i = 0; i <= 40; i++) { const th = a0 + ((a1 - a0) * i) / 40; pts.push(P(rad * Math.sin(th), Rv - rad * Math.cos(th))); }
        svgEl("polyline", { points: pts.map((q) => q.join(",")).join(" "), class: cls }, g);
      };
      arc(Rv, -0.15, 0.9, "sv-path sv-path-r");
      arc(Rf, Math.atan2(Lv, Rv) - 0.15, Math.atan2(Lv, Rv) + 0.9, "sv-path sv-path-f");

      // Body
      const bw = t / 2 + 0.12;
      const body = [[-0.55, -bw], [Lv + 0.55, -bw], [Lv + 0.55, bw], [-0.55, bw]].map(([x, y]) => P(x, y).join(",")).join(" ");
      svgEl("polygon", { points: body, class: "sv-body" }, g);

      // Wheels and their axis lines
      const wheel = (x, y, steer, cls) => {
        const hl = 0.32, hw = 0.11;
        const c = Math.cos(steer), s = Math.sin(steer);
        const pts = [[hl, -hw], [hl, hw], [-hl, hw], [-hl, -hw]].map(([u, v]) => P(x + u * c - v * s, y + u * s + v * c).join(",")).join(" ");
        svgEl("polygon", { points: pts, class: "sv-wheel " + (cls || "") }, g);
      };
      // Rear axle line through the turn center
      line(P(0, -t / 2), P(0, Rv), "sv-axis sv-axis-r");
      // Front wheel axis lines: perpendicular to each wheel's heading, toward the turn center side
      const axisLine = (y, steer, cls) => {
        const dir = [-Math.sin(steer), Math.cos(steer)];   // (x, y) of the wheel's axis pointing right
        const len = (Rv - y) / Math.max(0.05, dir[1]) * 1.12;
        line(P(Lv, y), P(Lv + dir[0] * len, y + dir[1] * len), "sv-axis " + cls);
        return dir;
      };
      const dirI = axisLine(t / 2, gI, "sv-axis-i");
      const dirO = axisLine(-t / 2, gO, "sv-axis-o");
      // Where the two front axis lines cross (the front axle's turn center)
      const det = dirI[0] * dirO[1] - dirI[1] * dirO[0];
      let cross = null;
      if (Math.abs(det) > 1e-9) {
        // Solve (Lv, t/2) + u dirI = (Lv, -t/2) + w dirO for u (Cramer's rule).
        const u = (t * dirO[0]) / det;
        cross = [Lv + u * dirI[0], t / 2 + u * dirI[1]];
      }
      [[0, -t / 2, 0], [0, t / 2, 0], [Lv, -t / 2, gO, "sv-wheel-o"], [Lv, t / 2, gI, "sv-wheel-i"]].forEach(([x, y, st, cls]) => wheel(x, y, st, cls));

      // Turn center and the front-axle crossing point
      const O = P(0, Rv);
      svgEl("circle", { cx: O[0], cy: O[1], r: 5, class: "sv-center" }, g);
      const tcLabel = svgEl("text", { x: O[0] - 8, y: O[1] + 18, "text-anchor": "end", class: "sv-label" }, g);
      tcLabel.textContent = "turn center";
      if (cross && Math.abs(p - 1) > 0.02) {
        const Cq = P(cross[0], cross[1]);
        if (Cq[0] > 0 && Cq[0] < W && Cq[1] > 0 && Cq[1] < H - 20) {
          svgEl("circle", { cx: Cq[0], cy: Cq[1], r: 4, class: "sv-cross" }, g);
          const right = Cq[0] > W / 2;   // keep the label inside the drawing
          const xl = svgEl("text", { x: Cq[0] + (right ? -8 : 8), y: Cq[1] - 10, "text-anchor": right ? "end" : "start", class: "sv-label sv-label-x" }, g);
          xl.textContent = "front axis lines meet";
          // If it lands on the "turn center" label, lift it above both points.
          const a1 = xl.getBBox(), a2 = tcLabel.getBBox();
          if (a1.x < a2.x + a2.width && a2.x < a1.x + a1.width && a1.y < a2.y + a2.height && a2.y < a1.y + a1.height)
            xl.setAttribute("y", Math.min(Cq[1], O[1]) - 12);
        }
      }
      // Readouts
      const sI = gI - dI, sO = gO - dO;     // extra steer beyond what the path needs = slip angle (sign: toe-out)
      rD.set(`${RVD.fmt(dB / RAD, 2)}°`);
      rI.set(`${RVD.fmt(dI / RAD, 2)}° / ${RVD.fmt(gI / RAD, 2)}°`);
      rO.set(`${RVD.fmt(dO / RAD, 2)}° / ${RVD.fmt(gO / RAD, 2)}°`);
      const scrub = Math.max(Math.abs(sI), Math.abs(sO));
      rS.set(`${RVD.fmt(Math.abs(sI) / RAD, 2)}° / ${RVD.fmt(Math.abs(sO) / RAD, 2)}°`, scrub < 0.05 * RAD ? "ok" : scrub > 1 * RAD ? "bad" : "warn");
      rOff.set(`${RVD.fmt((Rf - Rv) * 100, 0)} cm`);
      status.set(Math.abs(p - 1) < 0.02
        ? "With full Ackermann every wheel's axis line passes through the turn center, so all four wheels roll without scrubbing."
        : `The front wheels disagree by ${RVD.fmt(Math.abs((gI - gO) - (dI - dO)) / RAD, 2)}° about where the turn center is, so at walking pace they scrub sideways against each other.`, Math.abs(p - 1) < 0.02 ? "ok" : null);
    }
    draw();
  };

  /* ------------------------------------------------------------------ */
  /* 5.2  Steady-turn solver                                              */
  /* ------------------------------------------------------------------ */
  RVD.widgets["bicycle-steady"] = function (root) {
    const { controls, plots } = RVD.ui.layout(root, { plots: 2 });
    let base = B.presets.club;

    RVD.ui.choice(controls, {
      value: "club", options: presetOptions,
      onInput: (k) => { base = B.presets[k]; wf.set(base.wf * 100); cf.set(base.CfDeg); cr.set(base.CrDeg); draw(); }
    });
    RVD.ui.group(controls, "Car");
    const wf = RVD.ui.slider(controls, { label: "Static front weight b/L", min: 35, max: 65, step: 0.5, value: base.wf * 100, digits: 1, unit: "%", onInput: draw });
    const cf = RVD.ui.slider(controls, { label: "Front axle cornering stiffness Cf", min: 400, max: 5000, step: 50, value: base.CfDeg, digits: 0, unit: "N/deg", onInput: draw });
    const cr = RVD.ui.slider(controls, { label: "Rear axle cornering stiffness Cr", min: 400, max: 5000, step: 50, value: base.CrDeg, digits: 0, unit: "N/deg", onInput: draw });
    RVD.ui.group(controls, "Turn");
    const R = RVD.ui.slider(controls, { label: "Corner radius R", min: 20, max: 200, step: 5, value: 50, digits: 0, unit: "m", onInput: draw });
    const V = RVD.ui.slider(controls, { label: "Speed V", min: 5, max: 200, step: 1, value: 72, digits: 0, unit: "km/h", onInput: draw });

    const ro = RVD.ui.readouts(controls);
    const rAy = RVD.ui.readout(ro, "Lateral acceleration");
    const rDelta = RVD.ui.readout(ro, "Steer δ (Ackermann L/R)");
    const rAf = RVD.ui.readout(ro, "Front slip angle αf");
    const rAr = RVD.ui.readout(ro, "Rear slip angle αr");
    const rBeta = RVD.ui.readout(ro, "Sideslip β at the CG");
    const rF = RVD.ui.readout(ro, "Axle forces Fyf / Fyr");
    const status = RVD.ui.status(controls);

    // Top view
    const box1 = RVD.ui.h("div", null, plots);
    const W = 420, H = 380, S = 60, cx = 190, cy = 222;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "sv-svg", role: "img", "aria-label": "Top view of the car in a steady right turn with velocity and tire-force vectors" }, box1);
    const mk = markers(svg, "bs" + ++uid, ["v", "f", "ax"]);
    const g = svgEl("g", {}, svg);
    const note = svgEl("text", { x: 10, y: H - 24, class: "sv-note" }, svg);
    const note2 = svgEl("text", { x: 10, y: H - 8, class: "sv-note" }, svg);
    RVD.legend(box1, [
      { label: "Velocity", color: "var(--s4)" },
      { label: "Tire lateral force", color: "var(--s5)" },
      { label: "Wheel heading", color: "var(--text-muted)", dash: true }
    ]);

    // Angles vs speed
    const box2 = RVD.ui.h("div", null, plots);
    const p2 = RVD.plot(box2, {
      xlim: [0, 200], ylim: [-3, 6], height: 320, fixedText: true, onTextScale: () => draw(),
      xlabel: "Speed V (km/h), same radius", ylabel: "Angle (deg, + = right)"
    });
    RVD.legend(box2, [
      { label: "Steer δ", color: "var(--s3)" },
      { label: "Ackermann L/R", color: "var(--text-muted)", dash: true },
      { label: "Front slip αf", color: "var(--s2)" },
      { label: "Rear slip αr", color: "var(--s1)" },
      { label: "Sideslip β", color: "var(--s4)" }
    ]);

    let EX = 8;
    const toS = (x, y) => [cx + y * S, cy - x * S];
    const angPt = (x0, y0, ang, len) => toS(x0 + len * Math.cos(ang), y0 + len * Math.sin(ang));

    function draw() {
      const p = B.axleCar({ m: base.m, L: base.L, wf: wf.value / 100, CfDeg: cf.value, CrDeg: cr.value, mu: base.mu });
      const Rv = R.value, Vlim = Math.sqrt(base.mu * G * Rv) * KMH;
      const Vk = Math.min(V.value, Math.floor(Vlim));
      const st = B.steadyLinear(p, Vk / KMH, Rv);
      const vF = st.beta + (p.a * st.r) / (Vk / KMH), vR = st.ar;   // velocity directions at the axles (SAE)

      // Magnify so the largest drawn angle is about 35°
      const maxA = Math.max(Math.abs(st.delta), Math.abs(st.beta), Math.abs(vF), Math.abs(vR), 0.2 * RAD);
      EX = Math.max(1, Math.min(30, Math.floor((35 * RAD) / maxA)));
      const E = (a) => a * EX;

      g.textContent = "";
      const Ls = p.L / 2.45 * 2.2;              // drawing wheelbase in "S" units, about 2.2
      const af = (p.a / p.L) * Ls, ar = (p.b / p.L) * Ls;
      const body = [[af + 0.45, -0.55], [af + 0.45, 0.55], [-ar - 0.45, 0.55], [-ar - 0.45, -0.55]].map(([x, y]) => toS(x, y).join(",")).join(" ");
      svgEl("polygon", { points: body, class: "sv-body" }, g);
      const wheel = (x, y, steer) => {
        const c = Math.cos(steer), s = Math.sin(steer);
        const pts = [[0.3, -0.1], [0.3, 0.1], [-0.3, 0.1], [-0.3, -0.1]].map(([u, v]) => toS(x + u * c - v * s, y + u * s + v * c).join(",")).join(" ");
        svgEl("polygon", { points: pts, class: "sv-wheel" }, g);
      };
      wheel(af, 0, E(st.delta)); wheel(-ar, 0, 0);
      const cgp = toS(0, 0);
      svgEl("circle", { cx: cgp[0], cy: cgp[1], r: 4, class: "sv-cg" }, g);
      // Wheel headings (dashed)
      const h0 = toS(af, 0), h1 = angPt(af, 0, E(st.delta), 1.6);
      svgEl("line", { x1: h0[0], y1: h0[1], x2: h1[0], y2: h1[1], class: "sv-heading" }, g);
      const r0 = toS(-ar, 0), r1 = toS(-ar + 1.3, 0);
      svgEl("line", { x1: r0[0], y1: r0[1], x2: r1[0], y2: r1[1], class: "sv-heading" }, g);
      // Velocities
      const arrow = (x0, y0, ang, len, cls, head) => { const a = toS(x0, y0), b = angPt(x0, y0, ang, len); svgEl("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: cls, "marker-end": mk(head) }, g); return b; };
      arrow(af, 0, E(vF), 1.5, "sv-vel", "v");
      arrow(0, 0, E(st.beta), 0.75, "sv-vel", "v");
      arrow(-ar, 0, E(vR), 0.75, "sv-vel", "v");
      // Tire lateral forces: perpendicular to the wheel heading, length ∝ force (1 unit = m g)
      const fs = 2.2 / (p.m * G);
      const fArrow = (x, steer, F) => {
        const len = Math.max(0.05, Math.abs(F) * fs), dir = Math.sign(F) || 1;
        const a = toS(x + 0, 0), ang = steer + (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
        const b = angPt(x, 0, ang, len);
        svgEl("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: "sv-force", "marker-end": mk("f") }, g);
        return b;
      };
      const fb = fArrow(af, E(st.delta), st.Fyf), rb = fArrow(-ar, 0, st.Fyr);
      svgEl("text", { x: fb[0] + 6, y: fb[1] + 4, class: "sv-label sv-label-f" }, g).textContent = "Fyf";
      svgEl("text", { x: rb[0] + 6, y: rb[1] + 4, class: "sv-label sv-label-f" }, g).textContent = "Fyr";
      svgEl("text", { x: cgp[0] - 8, y: cgp[1] + 4, "text-anchor": "end", class: "sv-label" }, g).textContent = "CG";
      // Turn direction
      svgEl("text", { x: W - 10, y: 20, "text-anchor": "end", class: "sv-note" }, g).textContent = `right turn, R = ${Rv} m →`;
      note.textContent = EX > 1 ? `Angles drawn ${EX}× larger than real.` : "Angles drawn true size.";
      note2.textContent = "Forces to scale: the car's width = half its weight.";

      // Angles vs speed
      const curves = { d: [], lr: [], af: [], ar: [], b: [] };
      const vMax = Math.max(40, Math.ceil(Vlim / 10) * 10);
      for (let s = 2; s <= vMax; s += 2) {
        const q = B.steadyLinear(p, s / KMH, Rv);
        curves.d.push([s, q.delta / RAD]); curves.lr.push([s, p.L / Rv / RAD]); curves.af.push([s, q.af / RAD]);
        curves.ar.push([s, q.ar / RAD]); curves.b.push([s, q.beta / RAD]);
      }
      const all = [].concat(...Object.values(curves).map((c) => c.map((q) => q[1])));
      const lo = Math.floor(Math.min(-1, ...all)), hi = Math.ceil(Math.max(1, ...all));
      p2.setLimits([0, vMax], [lo, hi]);
      p2.line("zero", [[0, 0], [vMax, 0]], "series series--thin cm");
      p2.line("lr", curves.lr, "series series--thin series--dash cm");
      p2.line("d", curves.d, "series c3");
      p2.line("af", curves.af, "series c2");
      p2.line("ar", curves.ar, "series c1");
      p2.line("b", curves.b, "series c4");
      p2.point("pd", Vk, st.delta / RAD, { cls: "f3", r: 5 });
      p2.point("paf", Vk, st.af / RAD, { cls: "f2", r: 5 });
      p2.point("par", Vk, st.ar / RAD, { cls: "f1", r: 5 });
      p2.point("pb", Vk, st.beta / RAD, { cls: "f4", r: 5 });
      const bz = Math.sqrt((p.b * p.L * p.Cr) / (p.m * p.a)) * KMH;    // speed where beta = 0
      if (bz < vMax) {
        p2.point("bz", bz, 0, { cls: "f4", r: 4 });
        p2.remove("bzL");
        placeLabel(p2, "bzL", bz, 0, `β = 0 at ${RVD.fmt(bz, 0)} km/h`, "annot f4", Object.values(curves), []);
      } else { p2.remove("bz"); p2.remove("bzL"); }
      if (Vlim < vMax + 1) {
        p2.area("lim", [[Vlim, lo], [vMax, lo], [vMax, hi], [Vlim, hi]], "fm");
      } else p2.remove("lim");

      // Readouts
      rAy.set(`${RVD.fmt(st.ay / G, 2)} g`);
      rDelta.set(`${fmtDeg(st.delta)} (${RVD.fmt(p.L / Rv / RAD, 2)}°)`);
      rAf.set(fmtDeg(st.af)); rAr.set(fmtDeg(st.ar)); rBeta.set(fmtDeg(st.beta));
      rF.set(`${RVD.fmt(st.Fyf, 0)} / ${RVD.fmt(st.Fyr, 0)} N`);
      const extra = st.delta - p.L / Rv;
      status.set(V.value > Vk
        ? `Above about ${RVD.fmt(Vlim, 0)} km/h the tires would need more than μ = ${base.mu} to hold this radius, so the solver stops there.`
        : `The car needs ${fmtDeg(extra)} of steer ${extra >= 0 ? "more" : "less"} than the low-speed Ackermann angle: the front slip angle is ${RVD.fmt(Math.abs(st.af / RAD), 2)}° and the rear ${RVD.fmt(Math.abs(st.ar / RAD), 2)}°, and their difference is what the driver adds.`, null);
    }
    draw();
  };

  /* ------------------------------------------------------------------ */
  /* 5.3  Pair analysis and handling diagram                              */
  /* ------------------------------------------------------------------ */
  RVD.widgets["handling-diagram"] = function (root) {
    const { controls, plots } = RVD.ui.layout(root, { plots: 2 });
    let base = B.presets.club;

    RVD.ui.choice(controls, {
      value: "club", options: presetOptions,
      onInput: (k) => { base = B.presets[k]; wf.set(base.wf * 100); cf.set(base.CfDeg); cr.set(base.CrDeg); muF.set(base.mu); muR.set(base.mu); draw(); }
    });
    RVD.ui.group(controls, "Axles");
    const wf = RVD.ui.slider(controls, { label: "Static front weight b/L", min: 35, max: 65, step: 0.5, value: base.wf * 100, digits: 1, unit: "%", onInput: draw });
    const cf = RVD.ui.slider(controls, { label: "Front cornering stiffness Cf", min: 400, max: 5000, step: 50, value: base.CfDeg, digits: 0, unit: "N/deg", onInput: draw });
    const cr = RVD.ui.slider(controls, { label: "Rear cornering stiffness Cr", min: 400, max: 5000, step: 50, value: base.CrDeg, digits: 0, unit: "N/deg", onInput: draw });
    const muF = RVD.ui.slider(controls, { label: "Front axle grip μf", min: 0.6, max: 2.0, step: 0.02, value: base.mu, onInput: draw });
    const muR = RVD.ui.slider(controls, { label: "Rear axle grip μr", min: 0.6, max: 2.0, step: 0.02, value: base.mu, onInput: draw });
    RVD.ui.group(controls, "Operating point");
    const ay = RVD.ui.slider(controls, { label: "Lateral acceleration ay", min: 0.05, max: 2.0, step: 0.01, value: 0.8, unit: "g", onInput: draw });

    const ro = RVD.ui.readouts(controls);
    const rK = RVD.ui.readout(ro, "Understeer gradient K");
    const rAf = RVD.ui.readout(ro, "Front slip |αf|");
    const rAr = RVD.ui.readout(ro, "Rear slip |αr|");
    const rX = RVD.ui.readout(ro, "Steer beyond L/R");
    const rLim = RVD.ui.readout(ro, "At the limit");
    const status = RVD.ui.status(controls);

    const box1 = RVD.ui.h("div", null, plots);
    const p1 = RVD.plot(box1, {
      xlim: [0, 10], ylim: [0, 1.6], height: 300, fixedText: true, onTextScale: () => draw(),
      xlabel: "Slip angle |α| (deg)", ylabel: "Axle force ÷ axle weight (g)"
    });
    RVD.legend(box1, [
      { label: "Front axle", color: "var(--s2)" },
      { label: "Rear axle", color: "var(--s1)" },
      { label: "Lateral acceleration", color: "var(--text-muted)", dash: true }
    ]);
    const box2 = RVD.ui.h("div", null, plots);
    const p2 = RVD.plot(box2, {
      xlim: [-4, 6], ylim: [0, 1.6], height: 300, fixedText: true, onTextScale: () => draw(),
      xlabel: "Steer beyond Ackermann, δ − L/R (deg)", ylabel: "Lateral acceleration ay (g)"
    });
    RVD.legend(box2, [
      { label: "Handling curve", color: "var(--s4)" },
      { label: "Linear model, slope K", color: "var(--s4)", dash: true },
      { label: "Understeer side", color: "var(--s2)", area: true },
      { label: "Oversteer side", color: "var(--s1)", area: true }
    ]);

    function draw() {
      const p = B.axleCar({ m: base.m, L: base.L, wf: wf.value / 100, CfDeg: cf.value, CrDeg: cr.value, muF: muF.value, muR: muR.value });
      const Wf = p.m * G * p.wf, Wr = p.m * G * (1 - p.wf);
      const K = B.understeerGradient(p), Kdg = (K * G) / RAD;
      const yTop = Math.max(1.2, Math.ceil(Math.max(muF.value, muR.value) * 10 + 2) / 10);

      // Pair analysis: each axle's force coefficient vs slip angle
      const fC = [], rC = [];
      for (let a = 0; a <= 10.0001; a += 0.1) {
        fC.push([a, (p.Df / Wf) * Math.tanh((p.Cf * a * RAD) / p.Df)]);
        rC.push([a, (p.Dr / Wr) * Math.tanh((p.Cr * a * RAD) / p.Dr)]);
      }
      p1.setLimits([0, 10], [0, yTop]);
      p1.line("f", fC, "series c2");
      p1.line("r", rC, "series c1");
      const A = ay.value;
      p1.line("ay", [[0, A], [10, A]], "series series--thin series--dash cm");
      const sf = A < muF.value ? Math.abs(B.axleSlip(p.Cf, p.Df, A * Wf)) / RAD : null;
      const sr = A < muR.value ? Math.abs(B.axleSlip(p.Cr, p.Dr, A * Wr)) / RAD : null;
      [["pf", "df", sf, "f2", "c2"], ["pr", "dr", sr, "f1", "c1"]].forEach(([kp, kd, s, f, c]) => {
        if (s != null && s <= 10) {
          p1.point(kp, s, A, { cls: f, r: 5 });
          p1.line(kd, [[s, 0], [s, A]], `series series--thin series--dash ${c}`);
        } else { p1.remove(kp); p1.remove(kd); }
      });

      // Handling diagram: ay vs (delta - L/R) = |alpha_f| - |alpha_r|
      const curve = [];
      const aMax = Math.min(muF.value, muR.value);
      for (let i = 0; i <= 200; i++) {
        const a = (aMax * i) / 200 * 0.999;
        const xf = Math.abs(B.axleSlip(p.Cf, p.Df, a * Wf)) / RAD, xr = Math.abs(B.axleSlip(p.Cr, p.Dr, a * Wr)) / RAD;
        curve.push([xf - xr, a]);
      }
      const xs = curve.map((q) => q[0]).filter((x) => isFinite(x));
      const span = Math.max(3, Math.min(12, Math.ceil(Math.max(...xs.map(Math.abs)) * 0.7)));
      p2.setLimits([-span, span], [0, yTop]);
      p2.area("us", [[0, 0], [span, 0], [span, yTop], [0, yTop]], "f2");
      p2.area("os", [[-span, 0], [0, 0], [0, yTop], [-span, yTop]], "f1");
      p2.line("zero", [[0, 0], [0, yTop]], "series series--thin cm");
      const lin = [[0, 0], [Kdg * yTop, yTop]];
      p2.line("lin", lin, "series series--thin series--dash c4");
      p2.line("hc", curve.filter((q) => Math.abs(q[0]) <= span * 1.5), "series c4");
      const xNow = sf != null && sr != null ? sf - sr : null;
      if (xNow != null && Math.abs(xNow) <= span) p2.point("now", xNow, A, { cls: "f4", r: 6 }); else p2.remove("now");
      p2.remove("usL"); p2.remove("osL");
      placeFirst(p2, "usL", [[span, yTop, "end", -6, 15], [span, yTop * 0.6, "end", -6, 0], [span, yTop * 0.3, "end", -6, 0]], "understeer", "annot f2", [curve, lin], []);
      placeFirst(p2, "osL", [[-span, yTop, "start", 6, 15], [-span, yTop * 0.6, "start", 6, 0], [-span, yTop * 0.3, "start", 6, 0]], "oversteer", "annot f1", [curve, lin], []);

      // Readouts
      rK.set(`${Kdg >= 0 ? "+" : "−"}${RVD.fmt(Math.abs(Kdg), 2)} deg/g`, Kdg < -0.02 ? "bad" : null);
      rAf.set(sf != null ? `${RVD.fmt(sf, 2)}°` : "saturated", sf == null ? "bad" : null);
      rAr.set(sr != null ? `${RVD.fmt(sr, 2)}°` : "saturated", sr == null ? "bad" : null);
      rX.set(xNow != null ? `${xNow >= 0 ? "+" : "−"}${RVD.fmt(Math.abs(xNow), 2)}°` : "—");
      const frontFirst = muF.value < muR.value - 1e-9, rearFirst = muR.value < muF.value - 1e-9;
      rLim.set(frontFirst ? `front saturates at ${RVD.fmt(muF.value, 2)} g: limit understeer`
        : rearFirst ? `rear saturates at ${RVD.fmt(muR.value, 2)} g: limit oversteer` : `both at ${RVD.fmt(muF.value, 2)} g`, rearFirst ? "bad" : frontFirst ? "warn" : "ok");
      if (A >= aMax) status.set(`At ${RVD.fmt(A, 2)} g the ${frontFirst ? "front" : rearFirst ? "rear" : "front and rear"} axle${!frontFirst && !rearFirst ? "s are" : " is"} already past its grip limit: the car cannot hold this lateral acceleration.`, "bad");
      else status.set(`At ${RVD.fmt(A, 2)} g the front axle needs ${RVD.fmt(sf, 2)}° of slip and the rear ${RVD.fmt(sr, 2)}°, so the driver must steer ${RVD.fmt(Math.abs(xNow), 2)}° ${xNow >= 0 ? "more" : "less"} than the low-speed angle.`, null);
    }
    draw();
  };

  /* ------------------------------------------------------------------ */
  /* 5.3  Speed response: yaw-rate gain and constant-radius steer          */
  /* ------------------------------------------------------------------ */
  RVD.widgets["speed-response"] = function (root) {
    const { controls, plots } = RVD.ui.layout(root, { plots: 2 });
    let base = B.presets.club;

    RVD.ui.choice(controls, {
      value: "club", options: presetOptions,
      onInput: (k) => { base = B.presets[k]; Ls.set(base.L); const p = B.axleCar(base); Kd.set(Math.round((B.understeerGradient(p) * G / RAD) * 20) / 20); draw(); }
    });
    const Ls = RVD.ui.slider(controls, { label: "Wheelbase L", min: 1.4, max: 3.2, step: 0.01, value: base.L, unit: "m", onInput: draw });
    const Kd = RVD.ui.slider(controls, { label: "Understeer gradient K", min: -1.5, max: 3, step: 0.05, value: 0.75, unit: "deg/g", onInput: draw });
    const R = RVD.ui.slider(controls, { label: "Constant radius for the steer test", min: 30, max: 300, step: 10, value: 100, digits: 0, unit: "m", onInput: draw });

    const ro = RVD.ui.readouts(controls);
    const rK = RVD.ui.readout(ro, "K in rad/(m/s²)");
    const rV = RVD.ui.readout(ro, "Characteristic / critical speed");
    const status = RVD.ui.status(controls);

    const box1 = RVD.ui.h("div", null, plots);
    const p1 = RVD.plot(box1, {
      xlim: [0, 300], ylim: [0, 30], height: 300, fixedText: true, onTextScale: () => draw(),
      xlabel: "Speed V (km/h)", ylabel: "Yaw-rate gain r/δ (1/s)"
    });
    RVD.legend(box1, [{ label: "Your car", color: "var(--s1)" }, { label: "Neutral steer (K = 0)", color: "var(--text-muted)", dash: true }]);
    const box2 = RVD.ui.h("div", null, plots);
    const p2 = RVD.plot(box2, {
      xlim: [0, 300], ylim: [-2, 4], height: 300, fixedText: true, onTextScale: () => draw(),
      xlabel: "Speed V (km/h)", ylabel: "Steer needed δ (deg)"
    });
    RVD.legend(box2, [{ label: "Your car", color: "var(--s3)" }, { label: "Neutral steer: L/R", color: "var(--text-muted)", dash: true }]);

    function draw() {
      const L = Ls.value, K = (Kd.value * RAD) / G, Rv = R.value;
      const gain = [], neutral = [], steer = [];
      let yMax = 0;
      for (let s = 1; s <= 300; s += 1) {
        const v = s / KMH, den = 1 + (K * v * v) / L;
        neutral.push([s, v / L]);
        gain.push([s, den > 0.02 ? v / L / den : NaN]);
        steer.push([s, (L / Rv + K * v * v / Rv) / RAD]);
        if (den > 0.02) yMax = Math.max(yMax, v / L / den);
      }
      const top = Math.min(60, Math.max(10, Math.ceil(Math.min(yMax, 3 * 300 / KMH / L) / 5) * 5));
      p1.setLimits([0, 300], [0, top]);
      p1.line("n", neutral, "series series--thin series--dash cm");
      // Split the gain curve where it is undefined (beyond the critical speed)
      const segs = []; let cur = [];
      gain.forEach((q) => { if (isNaN(q[1]) || q[1] > top * 1.2) { if (cur.length) segs.push(cur); cur = []; } else cur.push(q); });
      if (cur.length) segs.push(cur);
      p1.line("g", segs[0] || [], "series c1");
      const Vch = K > 0 ? Math.sqrt(L / K) : Infinity, Vcr = K < 0 ? Math.sqrt(-L / K) : Infinity;
      ["chP", "chL", "crL", "crLine"].forEach((k) => p1.remove(k));
      if (isFinite(Vch) && Vch * KMH <= 300) {
        const gmax = Vch / L / 2;
        p1.point("chP", Vch * KMH, gmax, { cls: "f1", r: 5 });
        placeLabel(p1, "chL", Vch * KMH, gmax, `peak at ${RVD.fmt(Vch * KMH, 0)} km/h`, "annot f1", [segs[0] || [], neutral], []);
      }
      if (isFinite(Vcr) && Vcr * KMH <= 300) {
        p1.line("crLine", [[Vcr * KMH, 0], [Vcr * KMH, top]], "series series--thin series--dash c2");
        placeFirst(p1, "crL", [[Vcr * KMH, top, "end", -5, 15], [Vcr * KMH, top, "start", 5, 15], [Vcr * KMH, top * 0.5, "start", 5, 0]],
          `critical ${RVD.fmt(Vcr * KMH, 0)} km/h`, "annot f2", [segs[0] || [], neutral, [[Vcr * KMH, 0], [Vcr * KMH, top]]], []);
      }

      // Constant-radius steer test
      const vals = steer.map((q) => q[1]);
      const lo = Math.min(-0.5, Math.floor(Math.min(...vals) * 2) / 2), hi = Math.max(1, Math.ceil(Math.max(...vals) * 2) / 2);
      p2.setLimits([0, 300], [Math.max(lo, -6), Math.min(hi, 12)]);
      p2.line("zero", [[0, 0], [300, 0]], "series series--thin cm");
      p2.line("lr", [[0, L / Rv / RAD], [300, L / Rv / RAD]], "series series--thin series--dash cm");
      p2.line("st", steer, "series c3");
      const vMaxGrip = Math.sqrt(base.mu * G * Rv) * KMH;   // beyond this the tires cannot hold the radius
      if (vMaxGrip < 300) p2.area("lim", [[vMaxGrip, -20], [300, -20], [300, 20], [vMaxGrip, 20]], "fm"); else p2.remove("lim");

      rK.set(K.toExponential(2));
      rV.set(isFinite(Vch) ? `characteristic ${RVD.fmt(Vch * KMH, 0)} km/h` : isFinite(Vcr) ? `critical ${RVD.fmt(Vcr * KMH, 0)} km/h` : "none (neutral)", isFinite(Vcr) ? "bad" : null);
      status.set(K > 1e-9
        ? `An understeering car: its response to steering grows with speed up to ${RVD.fmt(Vch * KMH, 0)} km/h, then falls. It needs more steer the faster it takes the same corner.`
        : K < -1e-9
          ? `An oversteering car: its response to steering grows without limit as speed approaches ${RVD.fmt(Vcr * KMH, 0)} km/h, where it becomes unstable. It needs less steer the faster it goes, and countersteer beyond that speed.`
          : "A neutral-steer car: yaw-rate gain rises in proportion to speed and the steer for a given radius never changes.", K < -1e-9 ? "bad" : null);
    }
    draw();
  };
})();
