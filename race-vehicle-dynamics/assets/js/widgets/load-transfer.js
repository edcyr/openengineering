/*
 * Module 3 widget
 *   weight-transfer : four wheel loads under combined ax / ay, plus the
 *                     limit balance that results from tire load sensitivity.
 *
 * Simplified model (stated in the lesson):
 *   - rigid car, roll axis at ground level, equal front/rear track
 *   - total lateral transfer   dLat  = m g ay h / t   (per-wheel, summed over axles)
 *   - front share              dLatF = dLat * (front roll stiffness fraction)
 *   - longitudinal transfer    dLong = m g ax h / L   (axle to axle)
 *   - tire peak force          RVD.tire.peak (load-sensitive, Fz0 = static average wheel load)
 * The turn is a right-hander, so the LEFT wheels are on the outside.
 */
(function () {
  const RVD = window.RVD;
  const G = RVD.G;
  const svgEl = RVD.svgEl;

  const PRESETS = {
    fsae: { label: "Formula SAE", m: 280, h: 0.28, t: 1.22, L: 1.55, wf: 47, rsd: 52, mu0: 1.6, s: 0.15 },
    club: { label: "Club racer", m: 750, h: 0.40, t: 1.50, L: 2.45, wf: 52, rsd: 58, mu0: 1.4, s: 0.12 },
    gt: { label: "GT car", m: 1300, h: 0.45, t: 1.62, L: 2.70, wf: 48, rsd: 55, mu0: 1.5, s: 0.12 }
  };

  /* Pure model — exported so lessons/tests can reuse it. */
  RVD.loadTransfer = {
    wheelLoads(c, ay, ax) {
      const W = c.m * G;
      const Wf = W * c.wf, Wr = W - Wf;
      const dLong = (c.m * G * ax * c.h) / c.L; // ax > 0 accelerating -> load to rear
      const dLat = (c.m * G * ay * c.h) / c.t;  // per-wheel transfer, summed over both axles
      const dF = dLat * c.rsd, dR = dLat * (1 - c.rsd);
      return {
        FL: (Wf - dLong) / 2 + dF, FR: (Wf - dLong) / 2 - dF,
        RL: (Wr + dLong) / 2 + dR, RR: (Wr + dLong) / 2 - dR,
        dLong, dLat, dF, dR, W
      };
    },
    /* Fraction of each axle's lateral grip needed for steady cornering at ay (no ax). */
    utilisation(c, ay) {
      const w = RVD.loadTransfer.wheelLoads(c, ay, 0);
      const Fz0 = w.W / 4;
      const pk = (Fz) => RVD.tire.peak(Math.max(0, Fz), c.mu0, c.s, Fz0);
      const needF = c.m * G * ay * c.wf;      // front axle carries b/L of the lateral force
      const needR = c.m * G * ay * (1 - c.wf);
      return { front: needF / (pk(w.FL) + pk(w.FR)), rear: needR / (pk(w.RL) + pk(w.RR)) };
    },
    /* Lateral acceleration at which the first axle saturates (bisection). */
    limit(c) {
      const worst = (ay) => { const u = RVD.loadTransfer.utilisation(c, ay); return Math.max(u.front, u.rear); };
      let lo = 0.01, hi = 4;
      if (worst(hi) < 1) return { ay: hi, axle: "none" };
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (worst(mid) < 1) lo = mid; else hi = mid;
      }
      const u = RVD.loadTransfer.utilisation(c, lo);
      return { ay: lo, axle: Math.abs(u.front - u.rear) < 0.004 ? "both" : u.front > u.rear ? "front" : "rear", u };
    }
  };

  RVD.widgets["weight-transfer"] = function (root) {
    const { controls, plots } = RVD.ui.layout(root);

    const presetRow = RVD.ui.choice(controls, {
      value: root.dataset.preset || "club",
      options: Object.keys(PRESETS).map((k) => ({ label: PRESETS[k].label, value: k })),
      onInput: (k) => applyPreset(k)
    });

    RVD.ui.group(controls, "Car");
    const m = RVD.ui.slider(controls, { label: "Mass (incl. driver)", min: 150, max: 1600, step: 5, value: 750, digits: 0, unit: "kg", onInput: draw });
    const hh = RVD.ui.slider(controls, { label: "CG height h", min: 0.15, max: 0.65, step: 0.01, value: 0.4, unit: "m", onInput: draw });
    const t = RVD.ui.slider(controls, { label: "Track width t", min: 1.0, max: 1.8, step: 0.01, value: 1.5, unit: "m", onInput: draw });
    const L = RVD.ui.slider(controls, { label: "Wheelbase L", min: 1.4, max: 3.0, step: 0.01, value: 2.45, unit: "m", onInput: draw });
    const wf = RVD.ui.slider(controls, { label: "Front weight", min: 35, max: 65, step: 1, value: 52, digits: 0, unit: "%", onInput: draw });
    RVD.ui.group(controls, "Set-up");
    const rsd = RVD.ui.slider(controls, { label: "Front roll stiffness", min: 25, max: 75, step: 1, value: 58, digits: 0, unit: "%", onInput: draw });
    RVD.ui.group(controls, "Tires");
    const mu0 = RVD.ui.slider(controls, { label: "Peak μ (static load)", min: 0.8, max: 2.0, step: 0.05, value: 1.4, onInput: draw });
    const s = RVD.ui.slider(controls, { label: "Load sensitivity s", min: 0, max: 0.25, step: 0.01, value: 0.12, onInput: draw });
    RVD.ui.group(controls, "Maneuver (right-hand turn)");
    const ay = RVD.ui.slider(controls, { label: "Lateral accel. ay", min: 0, max: 2.0, step: 0.05, value: 1.0, unit: "g", onInput: draw });
    const ax = RVD.ui.slider(controls, { label: "Longitudinal accel. ax", min: -1.5, max: 1.0, step: 0.05, value: 0, unit: "g", onInput: draw });

    const sliders = { m, h: hh, t, L, wf, rsd, mu0, s };
    function applyPreset(k) {
      const p = PRESETS[k];
      Object.keys(sliders).forEach((key) => sliders[key].set(p[key]));
      draw();
    }

    // ---- Car diagram with a tire-curve inset beside each wheel ----
    const carBox = RVD.ui.h("div", null, plots);
    const VW = 600, CX = 300, CYC = 215;
    const svg = svgEl("svg", { viewBox: `0 0 ${VW} 430`, class: "car-svg car-svg--wide", role: "img", "aria-label": "Top view of the car showing wheel loads, with each tire's lateral-force curve beside its wheel" }, carBox);
    svgEl("text", { x: CX, y: 18, "text-anchor": "middle", class: "car-label" }, svg).textContent = "\u2191 front";
    svgEl("rect", { x: CX - 50, y: 50, width: 100, height: 310, rx: 40, class: "car-body" }, svg);
    svgEl("rect", { x: CX - 35, y: 145, width: 70, height: 80, rx: 14, class: "car-cockpit" }, svg);
    const pos = { FL: [CX - 95, 115], FR: [CX + 95, 115], RL: [CX - 95, 305], RR: [CX + 95, 305] };
    const IW = 150, IH = 104;                      // inset size
    const wheels = {};
    Object.keys(pos).forEach((k) => {
      const [x, y] = pos[k];
      svgEl("rect", { x: x - 11, y: y - 26, width: 22, height: 52, rx: 5, class: "car-tire" }, svg);
      const ghost = svgEl("circle", { cx: x, cy: y, class: "load-ghost" }, svg);
      const circ = svgEl("circle", { cx: x, cy: y, class: "load-circle" }, svg);
      // inset frame, outboard of the wheel
      const left = x < CX;
      const ix = left ? 8 : VW - 8 - IW, iy = y - IH / 2 - 6;
      const g = svgEl("g", { class: "tire-inset" }, svg);
      svgEl("rect", { x: ix, y: iy, width: IW, height: IH + 12, rx: 8, class: "ti-frame" }, g);
      svgEl("line", { x1: left ? ix + IW : ix, y1: y, x2: left ? x - 30 : x + 30, y2: y, class: "ti-leader" }, g);
      const title = svgEl("text", { x: ix + 8, y: iy + 15, class: "ti-title" }, g);
      const used = svgEl("text", { x: ix + IW - 8, y: iy + 15, "text-anchor": "end", class: "ti-used" }, g);
      const ox = ix + 10, oy = iy + IH - 6, pw = IW - 22, ph = IH - 34;   // plot area
      svgEl("line", { x1: ox, y1: oy, x2: ox + pw, y2: oy, class: "ti-axis" }, g);
      svgEl("line", { x1: ox, y1: oy, x2: ox, y2: oy - ph, class: "ti-axis" }, g);
      svgEl("text", { x: ox + pw, y: oy + 13, "text-anchor": "end", class: "ti-axislab" }, g).textContent = "slip angle \u2192";
      svgEl("text", { x: ox + 4, y: oy - ph + 2, class: "ti-axislab" }, g).textContent = "Fy";
      const staticCurve = svgEl("polyline", { class: "ti-static", fill: "none" }, g);
      const curve = svgEl("polyline", { class: "ti-curve", fill: "none" }, g);
      const peakLine = svgEl("line", { class: "ti-peak" }, g);
      const peakLab = svgEl("text", { class: "ti-axislab", "text-anchor": "middle" }, g);
      peakLab.textContent = "peak";
      const opLine = svgEl("line", { class: "ti-op-line" }, g);
      const op = svgEl("circle", { r: 5, class: "ti-op" }, g);
      wheels[k] = { ghost, circ, x, y, title, used, staticCurve, curve, peakLine, peakLab, opLine, op, ox, oy, pw, ph };
    });
    // CG + acceleration arrows
    const cg = svgEl("g", {}, svg);
    svgEl("circle", { cx: CX, cy: CYC, r: 7, class: "car-cg" }, cg);
    const defs = svgEl("defs", {}, svg);
    const mk = svgEl("marker", { id: "lt-arrow", viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: "auto-start-reverse" }, defs);
    svgEl("path", { d: "M0,0 L10,5 L0,10 z", class: "car-arrowhead" }, mk);
    const ayArrow = svgEl("line", { x1: CX, y1: CYC, x2: CX, y2: CYC, class: "car-arrow", "marker-end": "url(#lt-arrow)" }, svg);
    const axArrow = svgEl("line", { x1: CX, y1: CYC, x2: CX, y2: CYC, class: "car-arrow", "marker-end": "url(#lt-arrow)" }, svg);
    svgEl("text", { x: CX, y: 404, "text-anchor": "middle", class: "car-label" }, svg).textContent = "turn center \u2192 (right-hand turn)";
    const limitNote = svgEl("text", { x: CX, y: 424, "text-anchor": "middle", class: "ti-limit" }, svg);
    const caption = RVD.ui.h("p", "muted", carBox,
      "Circles: area \u221d wheel load (dashed = static). Insets: each tire's lateral force vs slip angle at its current load (dashed = static load). " +
      "Both tires on an axle run at the same slip angle (dot), which rises until the pair makes the lateral force that axle needs. " +
      "When the dot reaches the peak of the curves, that axle is saturated: it cannot make any more lateral force.");
    caption.style.fontSize = "13px";
    caption.style.margin = "4px 0 0";

    const ro = RVD.ui.readouts(carBox);
    const rLat = RVD.ui.readout(ro, "Lateral transfer (total)");
    const rLatF = RVD.ui.readout(ro, "… at front / rear");
    const rLong = RVD.ui.readout(ro, "Longitudinal transfer");
    const rLim = RVD.ui.readout(ro, "Max lateral accel.");
    const status = RVD.ui.status(carBox);

    // ---- Balance plot ----
    const pBox = RVD.ui.h("div", null, plots);
    const bp = RVD.plot(pBox, {
      xlim: [0.5, 2.2], ylim: [0.5, 1.2], xlabel: "Lateral acceleration ay (g), steady cornering",
      ylabel: "Axle grip used", height: 280, yfmt: (v) => Math.round(v * 100) + "%"
    });
    RVD.legend(pBox, [
      { label: "Front axle", color: "var(--s2)" },
      { label: "Rear axle", color: "var(--s1)" },
      { label: "Current ay", color: "var(--text-muted)", dash: true }
    ]);

    function car() {
      return { m: m.value, h: hh.value, t: t.value, L: L.value, wf: wf.value / 100, rsd: rsd.value / 100, mu0: mu0.value, s: s.value };
    }

    /* Tire insets. Each axle's two tires share one slip angle; find the angle at which
       they make the lateral force the axle needs (steady cornering, ax ignored). */
    function drawInsets(c, w, stat, ayShow) {
      const T = RVD.tire, Fz0 = w.W / 4;
      const tp = (Fz) => T.params({ Fz: Math.max(1, Fz), Fz0, mu0: c.mu0, s: c.s, CC: 0.5, C: 1.3, E: -1 });
      const aPk = T.peaks(tp(Fz0)).alpha;                 // the peak slip angle does not depend on load in this model
      const aMax = Math.max(12, aPk * 1.6);
      const peakOf = (Fz) => (Fz <= 0 ? 0 : T.fy(aPk, tp(Fz)));
      const yMax = Math.max(...Object.keys(wheels).map((k) => Math.max(peakOf(w[k]), peakOf(stat[k])))) * 1.12;
      const axles = { front: ["FL", "FR"], rear: ["RL", "RR"] };
      const need = { front: c.m * RVD.G * ayShow * c.wf, rear: c.m * RVD.G * ayShow * (1 - c.wf) };
      Object.keys(axles).forEach((ax) => {
        const [a, b] = axles[ax];
        const pair = (al) => (w[a] > 0 ? T.fy(al, tp(w[a])) : 0) + (w[b] > 0 ? T.fy(al, tp(w[b])) : 0);
        const cap = pair(aPk);
        const saturated = need[ax] >= cap * 0.999;
        let al = aPk;
        if (!saturated) { let lo = 0, hi = aPk; for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (pair(mid) < need[ax]) lo = mid; else hi = mid; } al = lo; }
        const util = need[ax] / cap;
        [a, b].forEach((k) => {
          const W = wheels[k];
          const X = (v) => W.ox + (v / aMax) * W.pw, Y = (F) => W.oy - (F / yMax) * W.ph;
          const pts = (Fz) => { const out = []; for (let i = 0; i <= 40; i++) { const v = (aMax * i) / 40; out.push(`${X(v).toFixed(1)},${Y(Fz > 0 ? T.fy(v, tp(Fz)) : 0).toFixed(1)}`); } return out.join(" "); };
          W.staticCurve.setAttribute("points", pts(stat[k]));
          W.curve.setAttribute("points", pts(w[k]));
          W.curve.setAttribute("class", "ti-curve" + (W.state ? " is-" + W.state : ""));
          W.peakLine.setAttribute("x1", X(aPk)); W.peakLine.setAttribute("x2", X(aPk));
          W.peakLine.setAttribute("y1", W.oy); W.peakLine.setAttribute("y2", W.oy - W.ph);
          W.peakLab.setAttribute("x", X(aPk)); W.peakLab.setAttribute("y", W.oy - W.ph - 3);
          const Fy = w[k] > 0 ? T.fy(al, tp(w[k])) : 0;
          W.op.setAttribute("cx", X(al)); W.op.setAttribute("cy", Y(Fy));
          W.op.setAttribute("class", "ti-op" + (saturated ? " is-sat" : ""));
          W.opLine.setAttribute("x1", X(al)); W.opLine.setAttribute("x2", X(al));
          W.opLine.setAttribute("y1", W.oy); W.opLine.setAttribute("y2", Y(Fy));
          W.op.style.display = W.opLine.style.display = ayShow > 0.001 ? "" : "none";
          W.title.textContent = `${k}  ${w[k] <= 0 ? "LIFT" : RVD.fmt(w[k], 0) + " N"}`;
          W.used.textContent = saturated ? "saturated" : `${ax} ${RVD.fmt(util * 100, 0)}%`;
          W.used.setAttribute("class", "ti-used" + (saturated ? " is-sat" : util > 0.9 ? " is-near" : ""));
        });
      });
    }

    function draw() {
      const c = car();
      const w = RVD.loadTransfer.wheelLoads(c, ay.value, ax.value);
      const stat = RVD.loadTransfer.wheelLoads(c, 0, 0);
      const ref = w.W / 4;
      const r0 = 30;
      let lifted = [];
      Object.keys(wheels).forEach((k) => {
        const W = wheels[k];
        const Fz = w[k], F0 = stat[k];
        W.ghost.setAttribute("r", r0 * Math.sqrt(Math.max(0, F0) / ref));
        W.circ.setAttribute("r", r0 * Math.sqrt(Math.max(0, Fz) / ref));
        const ch = (Fz - F0) / F0;
        W.circ.setAttribute("class", "load-circle " + (ch > 0.02 ? "is-up" : ch < -0.02 ? "is-down" : ""));
        if (Fz <= 0) lifted.push(k);
        W.state = ch > 0.02 ? "up" : ch < -0.02 ? "down" : "";
      });
      // Tire insets: beyond the limit the car cannot corner harder, so show it AT the limit,
      // where exactly one axle is saturated and the other shows its remaining margin.
      const limNow = RVD.loadTransfer.limit(c);
      const over = ay.value > limNow.ay;
      const ayShow = over ? limNow.ay : ay.value;
      drawInsets(c, over ? RVD.loadTransfer.wheelLoads(c, ayShow, ax.value) : w, stat, ayShow);
      limitNote.textContent = over ? `Insets show the car at its limit (${RVD.fmt(limNow.ay, 2)} g): it cannot corner harder.` : "";

      // Arrows: lateral accel points to the turn center (right); ax forward = up.
      const sc = 60;
      ayArrow.setAttribute("x2", CX + sc * ay.value);
      ayArrow.style.display = ay.value > 0.01 ? "" : "none";
      axArrow.setAttribute("y2", CYC - sc * ax.value);
      axArrow.style.display = Math.abs(ax.value) > 0.01 ? "" : "none";

      rLat.set(RVD.fmt(w.dLat, 0) + " N");
      rLatF.set(RVD.fmt(w.dF, 0) + " / " + RVD.fmt(w.dR, 0) + " N");
      rLong.set(RVD.fmt(Math.abs(w.dLong), 0) + " N " + (ax.value < 0 ? "→ front" : ax.value > 0 ? "→ rear" : ""));

      const lim = RVD.loadTransfer.limit(c);
      rLim.set(RVD.fmt(lim.ay, 2) + " g", lim.ay < ay.value ? "bad" : null);

      // Balance curves
      const fr = [], rr = [];
      for (let a = 0.5; a <= 2.2; a += 0.02) {
        const u = RVD.loadTransfer.utilisation(c, a);
        fr.push([a, u.front]); rr.push([a, u.rear]);
      }
      bp.line("one", [[0.5, 1], [2.2, 1]], "series series--thin cm");
      bp.line("front", fr, "series c2");
      bp.line("rear", rr, "series c1");
      bp.line("cur", [[ay.value, 0.5], [ay.value, 1.2]], "series series--thin series--dash cm");
      bp.point("lim", lim.ay, 1, { cls: lim.axle === "rear" ? "f1" : "f2", r: 6 });
      bp.label("limLab", lim.ay, 1, `limit ${RVD.fmt(lim.ay, 2)} g`, { cls: "annot " + (lim.axle === "rear" ? "f1" : "f2"), dx: 8, dy: 18 });

      // Status message
      const axNote = Math.abs(ax.value) > 0.01 ? " (Balance assumes steady cornering with ax = 0.)" : "";
      if (lifted.length) {
        status.set(`Wheel lift at ${lifted.join(" & ")} — the inside wheel can no longer carry load; the simple model breaks down here.`, "bad");
      } else if (lim.axle === "front") {
        status.set(`Front axle saturates first at ${RVD.fmt(lim.ay, 2)} g → limit understeer (the car pushes wide).${axNote}`, "warn");
      } else if (lim.axle === "rear") {
        status.set(`Rear axle saturates first at ${RVD.fmt(lim.ay, 2)} g → limit oversteer (the rear steps out).${axNote}`, "bad");
      } else {
        status.set(`Both axles saturate together at ${RVD.fmt(lim.ay, 2)} g → neutral at the limit.${axNote}`, "ok");
      }
    }

    applyPreset(presetRow.value);
  };
})();
