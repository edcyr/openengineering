/*
 * Lesson 0.1 widget
 *   fbd-builder : rear view of a car in a steady LEFT turn. Students choose which
 *                 forces belong on the free-body diagram, then check their choice.
 *                 Every vector is drawn to ONE scale (px per newton), chosen so the
 *                 largest force fits, and arrowheads are drawn per arrow so short
 *                 vectors keep their true length.
 */
(function () {
  const RVD = window.RVD;
  const svgEl = RVD.svgEl;
  const G = RVD.G;

  // Geometry of the rear-view drawing (px)
  const VW = 440, VH = 340;
  const GROUND = 205, CGX = 220, CGY = 140, LW = 150, RW = 290;   // left (inside) / right (outside) contact x
  const MAXLEN = 95;                                               // px for the largest force on the diagram
  const H_CG = 0.40, TRACK = 1.50;                                 // m, for the normal-force split

  const FORCES = [
    { id: "weight", label: "Weight mg, acting down at the CG", correct: true,
      why: "Gravity acts on the whole car; we lump it at the center of gravity." },
    { id: "normal", label: "Normal forces from the road, pushing up on each tire", correct: true,
      why: "The road pushes up on each tire. In a turn the outside tire's normal force is larger (Module 3)." },
    { id: "lateralIn", label: "Sideways tire forces at the road, pointing toward the turn center", correct: true,
      why: "These are the only horizontal forces that can turn the car. Friction at the contact patches supplies them." },
    { id: "centrifugal", label: "Centrifugal force at the CG, pointing away from the turn center", correct: false,
      why: "There is no such force in an inertial (ground-fixed) frame. The car is <em>accelerating</em> toward the center; “centrifugal force” is just \\(-m\\mathbf{a}\\) moved to the other side of the equation. Including it as well as \\(m\\mathbf{a}\\) double-counts." },
    { id: "lateralOut", label: "Sideways tire forces pointing away from the turn center", correct: false,
      why: "If the tire forces pointed outward, the car would accelerate outward, away from the turn. The road must push the tires toward the center." },
    { id: "steering", label: "A “steering force” from the steering wheel, pushing the car toward the center", correct: false,
      why: "Steering only changes the angle of the front wheels. The force that turns the car still comes from the road, through the tires." }
  ];

  RVD.widgets["fbd-builder"] = function (root) {
    const { controls, plots } = RVD.ui.layout(root);

    RVD.ui.group(controls, "The turn");
    const m = RVD.ui.slider(controls, { label: "Mass", min: 200, max: 1600, step: 10, value: 750, digits: 0, unit: "kg", onInput: draw });
    const v = RVD.ui.slider(controls, { label: "Speed", min: 10, max: 160, step: 1, value: 90, digits: 0, unit: "km/h", onInput: draw });
    const R = RVD.ui.slider(controls, { label: "Turn radius", min: 15, max: 300, step: 1, value: 80, digits: 0, unit: "m", onInput: draw });

    RVD.ui.group(controls, "Your free-body diagram");
    const list = RVD.ui.h("div", "fbd-list", controls);
    const chosen = new Set();
    const items = FORCES.map((f) => {
      const lab = RVD.ui.h("label", "fbd-item", list);
      const cb = RVD.ui.h("input", null, lab);
      cb.type = "checkbox";
      RVD.ui.h("span", null, lab, f.label);
      const why = RVD.ui.h("div", "fbd-why", lab);
      cb.addEventListener("change", () => { cb.checked ? chosen.add(f.id) : chosen.delete(f.id); checked = false; draw(); });
      return { f, cb, lab, why };
    });
    const row = RVD.ui.h("div", "btn-row", controls);
    RVD.ui.button(row, "Check my diagram", () => { checked = true; draw(); });
    RVD.ui.button(row, "Clear", () => { chosen.clear(); items.forEach((it) => (it.cb.checked = false)); checked = false; draw(); });
    const status = RVD.ui.status(controls);

    // ---- drawing ----
    const box = RVD.ui.h("div", null, plots);
    const svg = svgEl("svg", { viewBox: `0 0 ${VW} ${VH}`, class: "fbd-svg", role: "img", "aria-label": "Rear view of a car turning left with the forces you selected, drawn to scale" }, box);

    svgEl("line", { x1: 10, y1: GROUND, x2: VW - 10, y2: GROUND, class: "fbd-ground" }, svg);
    svgEl("text", { x: 14, y: 22, class: "fbd-label" }, svg).textContent = "\u2190 turn center";
    svgEl("text", { x: VW - 14, y: 22, "text-anchor": "end", class: "fbd-label" }, svg).textContent = "rear view, turning left";
    // car
    svgEl("rect", { x: 168, y: 72, width: 104, height: 42, rx: 14, class: "fbd-car" }, svg);
    svgEl("rect", { x: 128, y: 110, width: 184, height: 62, rx: 10, class: "fbd-car" }, svg);
    [LW, RW].forEach((x) => svgEl("rect", { x: x - 17, y: 160, width: 34, height: GROUND - 160, rx: 6, class: "fbd-tire" }, svg));
    svgEl("circle", { cx: CGX, cy: CGY, r: 5, class: "fbd-cg" }, svg);
    svgEl("text", { x: CGX + 9, y: CGY - 9, class: "fbd-label" }, svg).textContent = "CG";
    const scaleNote = svgEl("text", { x: VW - 14, y: VH - 10, "text-anchor": "end", class: "fbd-label" }, svg);

    const gArrows = svgEl("g", {}, svg);
    const key = RVD.ui.h("p", "fbd-key", box);
    const ro = RVD.ui.readouts(box);
    const rAy = RVD.ui.readout(ro, "Acceleration toward center");
    const rFy = RVD.ui.readout(ro, "Total sideways tire force");
    const rMu = RVD.ui.readout(ro, "Friction coefficient needed");

    let checked = false;
    const kN = (F) => (Math.abs(F) >= 1000 ? `${RVD.fmt(F / 1000, 2)} kN` : `${RVD.fmt(F, 0)} N`);

    /* Arrow from tail (x1,y1) to tip (x2,y2). The head is drawn as its own triangle,
       sized to the arrow, so the tip is exactly at the end of the vector. */
    function arrow(x1, y1, x2, y2, cls, label, lx, ly, anchor) {
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (len < 0.5) return;
      const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
      const hl = Math.min(12, Math.max(4, 0.45 * len)), hw = hl * 0.55;
      const bx = x2 - ux * hl, by = y2 - uy * hl;
      svgEl("line", { x1, y1, x2: bx, y2: by, class: "fbd-arrow " + cls }, gArrows);
      svgEl("polygon", { points: `${x2},${y2} ${bx - uy * hw},${by + ux * hw} ${bx + uy * hw},${by - ux * hw}`, class: "fbd-head " + cls }, gArrows);
      if (label) {
        const t = svgEl("text", { x: lx, y: ly, class: "fbd-flabel " + cls, "text-anchor": anchor || "start" }, gArrows);
        if (label.includes("<tspan")) t.innerHTML = label; else t.textContent = label;   // allow subscripts
      }
    }

    function draw() {
      const vms = v.value / 3.6;
      const ay = (vms * vms) / R.value;              // m/s^2
      const W = m.value * G, Fy = m.value * ay;
      const dLat = (m.value * ay * H_CG) / TRACK;     // per-wheel normal-force change
      // Vertical balance always holds: once the inside wheel is unloaded, the outside one carries all of mg.
      const Nout = Math.min(W, W / 2 + dLat), Nin = W - Nout;
      const lifts = W / 2 - dLat <= 0;
      const Fin = Fy * (Nin / (Nin + Nout || 1)), Fout = Fy - Fin;
      // ONE scale for every vector: the largest force on the diagram gets MAXLEN px.
      const sc = MAXLEN / Math.max(W, Nout, Fy);
      const L = (F) => F * sc;

      gArrows.textContent = "";
      const state = (id) => {
        if (!checked || !chosen.has(id)) return chosen.has(id) ? "f-sel" : null;
        return FORCES.find((f) => f.id === id).correct ? "f-ok" : "f-bad";
      };
      const missing = (id) => checked && !chosen.has(id) && FORCES.find((f) => f.id === id).correct;

      const draws = {
        // Weight: tail at the CG, pointing down.
        weight: (c) => arrow(CGX, CGY, CGX, CGY + L(W), c, "mg", CGX - 8, CGY + L(W) - 2, "end"),
        // Normal forces: act at the contact patches, pushing UP on the tires, so the tip touches the ground.
        normal: (c) => {
          arrow(LW, GROUND + L(Nin), LW, GROUND, c, "N in", LW - 8, GROUND + Math.max(14, L(Nin) * 0.6), "end");
          arrow(RW, GROUND + L(Nout), RW, GROUND, c, "N out", RW + 8, GROUND + Math.max(14, L(Nout) * 0.6));
        },
        // Sideways tire forces: tail at each contact patch, pointing toward the turn center.
        lateralIn: (c) => {
          // Labels go beyond the arrow tip, but never on top of a tire (tires are 34 px wide).
          arrow(LW, GROUND, LW - L(Fin), GROUND, c, "Fy in", Math.min(LW - L(Fin), LW - 20) - 4, GROUND - 6, "end");
          if (L(Fout) >= 45) arrow(RW, GROUND, RW - L(Fout), GROUND, c, "Fy out", (RW + Math.max(RW - L(Fout), CGX + 12)) / 2, GROUND + 16, "middle");
          else arrow(RW, GROUND, RW - L(Fout), GROUND, c, "Fy out", Math.min(RW - L(Fout), RW - 20) - 4, GROUND - 6, "end");
        },
        centrifugal: (c) => arrow(CGX, CGY, CGX + L(Fy), CGY, c, "\u201cmV\u00b2/R\u201d", CGX + L(Fy) + 5, CGY - 7),
        lateralOut: (c) => {
          arrow(LW, GROUND, LW + L(Fin), GROUND, c, "", 0, 0);
          arrow(RW, GROUND, RW + L(Fout), GROUND, c, "", 0, 0);
        },
        steering: (c) => arrow(CGX + 30, 60, CGX - 40, 60, c, "steering?", CGX - 44, 64, "end")
      };
      FORCES.forEach((f) => {
        const st = state(f.id);
        if (st) draws[f.id](st);
        else if (missing(f.id)) draws[f.id]("f-missing");
      });
      if (checked) {
        // The resultant: ma toward the center, drawn dashed. It is not a force to add.
        arrow(CGX, CGY, CGX - L(Fy), CGY, "f-net", 'ma<tspan dy="4" style="font-size:10px">CG</tspan><tspan dy="-4"> (result)</tspan>', CGX - L(Fy) - 5, CGY - 8, "end");
      }
      scaleNote.textContent = chosen.size || checked ? `drawn to scale: longest arrow = ${kN(MAXLEN / sc)}` : "";
      // Magnitudes of whatever is drawn, listed under the diagram.
      const shown = (id) => chosen.has(id) || missing(id);
      const vals = [];
      if (shown("weight")) vals.push(`mg = ${kN(W)}`);
      if (shown("normal")) vals.push(`N in = ${kN(Nin)}`, `N out = ${kN(Nout)}`);
      if (shown("lateralIn")) vals.push(`Fy in = ${kN(Fin)}`, `Fy out = ${kN(Fout)}`);
      if (checked) vals.push(`ma<sub>CG</sub> = mV\u00b2/R = ${kN(Fy)}`);
      key.innerHTML = vals.join("&nbsp;&nbsp; \u00b7 &nbsp;&nbsp;");

      rAy.set(`${RVD.fmt(ay, 2)} m/s\u00b2 (${RVD.fmt(ay / G, 2)} g)`);
      rFy.set(kN(Fy));
      const mu = ay / G;
      rMu.set(RVD.fmt(mu, 2), mu > 1.6 ? "bad" : mu > 1.0 ? "warn" : "ok");

      // feedback
      items.forEach(({ f, lab, why }) => {
        lab.classList.remove("is-ok", "is-bad", "is-missing");
        why.innerHTML = "";
        if (!checked) return;
        const sel = chosen.has(f.id);
        if (sel && f.correct) { lab.classList.add("is-ok"); why.innerHTML = "\u2713 " + f.why; }
        else if (sel && !f.correct) { lab.classList.add("is-bad"); why.innerHTML = "\u2717 " + f.why; }
        else if (!sel && f.correct) { lab.classList.add("is-missing"); why.innerHTML = "Missing: " + f.why; }
        RVD.renderMath(why);
      });
      if (!checked) {
        status.set(chosen.size ? "Choose all the forces you think act on the car, then check." : "Tick the forces that act on the car, then press Check.", null);
      } else {
        const right = FORCES.every((f) => chosen.has(f.id) === f.correct);
        status.set(right
          ? "Correct! Three real forces. Vertically, N in + N out = mg. Horizontally, Fy in + Fy out = mV\u00b2/R toward the center (dashed arrow)."
          : "Not yet. Read the notes beside each force, adjust, and check again.", right ? "ok" : "bad");
        if (right) RVD.store.setAnswer("m00-l1-fbd", { correct: true, at: Date.now() });
      }
      if (lifts) status.set(`At ${RVD.fmt(mu, 2)} g the moment balance would need more than the whole weight on the outside tire, so the inside wheel lifts (N in = 0). In practice the tires would slide long before this: the turn needs \u03bc = ${RVD.fmt(mu, 2)}.`, "bad");
      else if (mu > 1.6) status.set(`At ${RVD.fmt(mu, 2)} g this turn needs more grip than even racing slicks can give: the car would slide.`, "bad");
    }
    draw();
  };
})();
