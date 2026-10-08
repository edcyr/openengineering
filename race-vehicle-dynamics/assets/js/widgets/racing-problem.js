/*
 * Module 1 widgets
 *   corner-speed : maximum cornering speed v = sqrt(mu g R)
 *   gg-diagram   : performance envelope with a draggable demand point
 */
(function () {
  const RVD = window.RVD;
  const G = RVD.G;

  /* ------------------------------------------------------------------ */
  RVD.widgets["corner-speed"] = function (root) {
    const { controls, plots } = RVD.ui.layout(root);
    const mu = RVD.ui.slider(controls, { label: "Friction coefficient μ", min: 0.5, max: 3, step: 0.05, value: 1.4, digits: 2, onInput: draw });
    const R = RVD.ui.slider(controls, { label: "Corner radius R", min: 10, max: 300, step: 1, value: 50, digits: 0, unit: "m", onInput: draw });
    const ro = RVD.ui.readouts(controls);
    const vMs = RVD.ui.readout(ro, "Max speed");
    const vKmh = RVD.ui.readout(ro, "Max speed");
    const gain = RVD.ui.readout(ro, "+10% grip gives");

    const p = RVD.plot(plots, {
      xlim: [0, 300], ylim: [0, 350], xlabel: "Corner radius R (m)", ylabel: "Max speed (km/h)", height: 320
    });
    RVD.legend(plots, [
      { label: "Your μ", color: "var(--s1)" },
      { label: "μ + 10%", color: "var(--s2)", dash: true },
      { label: "Road car on street tires (μ ≈ 0.9)", color: "var(--text-muted)" }
    ]);

    const curve = (m) => {
      const pts = [];
      for (let r = 0; r <= 300; r += 3) pts.push([r, Math.sqrt(m * G * r) * 3.6]);
      return pts;
    };

    function draw() {
      const m = mu.value, r = R.value;
      p.line("road", curve(0.9), "series series--thin cm");
      p.line("plus", curve(m * 1.1), "series series--dash c2");
      p.line("mu", curve(m), "series c1");
      const v = Math.sqrt(m * G * r);
      p.point("pt", r, v * 3.6, { cls: "f1", r: 6 });
      p.label("lab", r, v * 3.6, `${RVD.fmt(v * 3.6, 0)} km/h`, { cls: "annot f1", dx: 8, dy: -8 });
      vMs.set(RVD.fmt(v, 1) + " m/s");
      vKmh.set(RVD.fmt(v * 3.6, 0) + " km/h");
      gain.set("+" + RVD.fmt((Math.sqrt(1.1) - 1) * 100, 1) + "% speed", "ok");
    }
    draw();
  };

  /* ------------------------------------------------------------------ */
  RVD.widgets["gg-diagram"] = function (root) {
    const { controls, plots } = RVD.ui.layout(root);

    RVD.ui.group(controls, "Car capability");
    const muY = RVD.ui.slider(controls, { label: "Lateral grip limit", min: 0.5, max: 2.5, step: 0.05, value: 1.4, unit: "g", onInput: draw });
    const muX = RVD.ui.slider(controls, { label: "Braking grip limit", min: 0.5, max: 2.5, step: 0.05, value: 1.3, unit: "g", onInput: draw });
    const drive = RVD.ui.slider(controls, { label: "Drive limit (power/traction)", min: 0.2, max: 1.5, step: 0.05, value: 0.6, unit: "g", onInput: draw });

    RVD.ui.group(controls, "Driver traces");
    const trace = RVD.ui.choice(controls, {
      value: "none",
      options: [
        { label: "None", value: "none" },
        { label: "Novice", value: "novice" },
        { label: "Expert", value: "expert" }
      ],
      onInput: draw
    });

    const ro = RVD.ui.readouts(controls);
    const rTotal = RVD.ui.readout(ro, "Combined accel.");
    const rUsed = RVD.ui.readout(ro, "Grip used");
    const rAvail = RVD.ui.readout(ro, "Max lateral at this ax");
    const status = RVD.ui.status(controls);

    const L = 2.6;
    const p = RVD.plot(plots, {
      width: 470, height: 450, margin: { l: 60, r: 20, t: 14, b: 46 },
      xlim: [-L, L], ylim: [-L, L],
      xlabel: "Lateral accel. ay (g)    ← left turn | right turn →",
      ylabel: "Longitudinal accel. ax (g)    ↓ braking | accel ↑",
      ariaLabel: "g-g diagram: longitudinal versus lateral acceleration"
    });
    RVD.legend(plots, [
      { label: "Performance envelope", color: "var(--s1)" },
      { label: "Demand (drag me)", color: "var(--s2)" },
      { label: "Driver trace", color: "var(--s4)" }
    ]);

    // Demand point in g: [ay, ax]
    let demand = [0.9, -0.6];

    function envelopePt(theta, scale) {
      const s = scale || 1;
      let ay = s * muY.value * Math.cos(theta);
      let ax = s * muX.value * Math.sin(theta);
      if (ax > s * drive.value) ax = s * drive.value;
      return [ay, ax];
    }

    function utilisation(ay, ax) {
      let u = Math.hypot(ay / muY.value, ax / muX.value);
      if (ax > 0) u = Math.max(u, ax / drive.value);
      return u;
    }

    function draw() {
      const env = [];
      for (let i = 0; i <= 240; i++) env.push(envelopePt((i / 240) * 2 * Math.PI));
      p.area("envFill", env, "f1");
      p.line("env", env, "series c1");

      // Driver traces
      const arrow = p.arrow("f4");
      ["n1", "n2", "n3", "n4", "ex"].forEach((k) => p.remove(k));
      if (trace.value === "novice") {
        const k = 0.9;
        p.line("n1", [[0, 0], [0, -k * muX.value]], "series c4", { markerEnd: arrow, top: true });
        p.line("n2", [[0, 0], [k * muY.value, 0]], "series c4", { markerEnd: arrow, top: true });
        p.line("n3", [[0, 0], [0, k * drive.value]], "series c4", { markerEnd: arrow, top: true });
        p.label("n4", 0.08, -k * muX.value * 0.5, "1 brake → 2 turn → 3 accelerate", { cls: "annot f4" });
      } else if (trace.value === "expert") {
        const pts = [];
        for (let i = 0; i <= 120; i++) pts.push(envelopePt(-Math.PI / 2 + (i / 120) * Math.PI, 0.9));
        p.line("ex", pts, "series c4", { markerEnd: arrow, top: true });
        p.label("n4", -0.1, -muX.value * 0.9, "trail-brake → apex → exit", { cls: "annot f4", anchor: "end" });
      }

      // Demand point
      const [ay, ax] = demand;
      p.line("vec", [[0, 0], [ay, ax]], "series series--thin c2", { top: true });
      const handle = p.point("demand", ay, ax, { cls: "f2 handle", r: 9 });
      handle.setAttribute("tabindex", "0");
      handle.setAttribute("aria-label", "Demand point; use arrow keys to move");

      const u = utilisation(ay, ax);
      const total = Math.hypot(ay, ax);
      rTotal.set(RVD.fmt(total, 2) + " g");
      rUsed.set(RVD.fmt(u * 100, 0) + "%", u > 1.0005 ? "bad" : u > 0.95 ? "warn" : "ok");

      let availAy;
      if (ax > drive.value + 1e-9 || Math.abs(ax) > muX.value) availAy = NaN;
      else availAy = muY.value * Math.sqrt(Math.max(0, 1 - (ax / muX.value) ** 2));
      rAvail.set(isFinite(availAy) ? RVD.fmt(availAy, 2) + " g" : "none");

      if (u > 1.0005) status.set("Beyond the envelope — the tires cannot supply this force. The car slides.", "bad");
      else if (u > 0.95) status.set("At the limit — this is where lap time is found.", "warn");
      else status.set(`Inside the envelope — ${RVD.fmt((1 - u) * 100, 0)}% of the available grip is unused.`, "ok");
    }

    // Dragging
    let dragging = false;
    function moveTo(evt) {
      const [x, y] = p.toData(evt);
      demand = [Math.max(-L, Math.min(L, x)), Math.max(-L, Math.min(L, y))];
      draw();
    }
    p.svg.addEventListener("pointerdown", (e) => { dragging = true; p.svg.setPointerCapture(e.pointerId); moveTo(e); });
    p.svg.addEventListener("pointermove", (e) => { if (dragging) moveTo(e); });
    p.svg.addEventListener("pointerup", () => { dragging = false; });
    p.svg.addEventListener("pointercancel", () => { dragging = false; });
    p.svg.addEventListener("keydown", (e) => {
      const step = e.shiftKey ? 0.2 : 0.05;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
      if (!d) return;
      e.preventDefault();
      demand = [demand[0] + d[0], demand[1] + d[1]];
      draw();
    });

    draw();
  };
})();
