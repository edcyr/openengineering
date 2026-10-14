/*
 * Module 4 widgets (physics in assets/js/models/aero.js)
 *   aero-corner   : corner speed vs radius with and without downforce; forces vs speed   (4.1)
 *   aero-balance  : front and rear axle grip limits vs speed, set by aero balance        (4.2)
 *   ggv           : the g-g diagram at several speeds (g-g-V)                            (4.2)
 *   accel-speed   : traction, power and drag vs speed; acceleration from a standstill    (4.3)
 *   wing-tradeoff : lap time vs wing level on a simple circuit                           (4.3)
 */
(function () {
  const RVD = window.RVD;
  const A = RVD.aero;
  const G = A.G;
  const KMH = 3.6;

  const presetOptions = Object.keys(A.presets).map((k) => ({ label: A.presets[k].label, value: k }));
  const fmtKmh = (v) => (isFinite(v) ? `${RVD.fmt(v * KMH, 0)} km/h` : "no limit");
  // Text offsets on fixed-text plots are in screen px; convert to the plot's units.
  const off = (p, v) => v * p.textScale;

  /* Label placement. Each candidate is [x, y, anchor, dx, dy, text?] (data coords, screen-px
     offsets). The first candidate that stays inside the plot and clear of the given curves
     (data-space polylines) and other labels is used; if none is clear the label is hidden.
     The widgets' readouts always carry the same numbers. */
  function placeFirst(p, key, cands, text, cls, lines, others) {
    const [x0, x1] = p.xlim, [y0, y1] = p.ylim;
    const L = Math.min(p.sx(x0), p.sx(x1)), R = Math.max(p.sx(x0), p.sx(x1));
    const T = Math.min(p.sy(y0), p.sy(y1)), B = Math.max(p.sy(y0), p.sy(y1));
    const segs = [];
    (lines || []).forEach((pts) => {
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        if (!isFinite(a[1]) || !isFinite(b[1])) continue;
        segs.push([p.sx(a[0]), p.sy(a[1]), p.sx(b[0]), p.sy(b[1])]);
      }
    });
    const boxes = (others || []).filter((n) => n && n.isConnected && n.textContent).map((n) => n.getBBox());
    const pad = off(p, 2);
    const hitSeg = (bb, sg) => {   // sample the segment; fine enough for plot curves
      const n = Math.max(2, Math.ceil(Math.hypot(sg[2] - sg[0], sg[3] - sg[1]) / 2));
      for (let i = 0; i <= n; i++) {
        const px = sg[0] + ((sg[2] - sg[0]) * i) / n, py = sg[1] + ((sg[3] - sg[1]) * i) / n;
        if (px > bb.x - pad && px < bb.x + bb.width + pad && py > bb.y - pad && py < bb.y + bb.height + pad) return true;
      }
      return false;
    };
    for (const [x, y, anchor, dx, dy, alt] of cands) {
      const t = p.label(key, x, y, alt || text, { cls, anchor, dx: off(p, dx), dy: off(p, dy) });
      const bb = t.getBBox();
      if (!bb.width) return t;                       // not laid out yet: keep the first spot
      if (bb.x < L || bb.x + bb.width > R || bb.y < T || bb.y + bb.height > B) continue;
      if (boxes.some((o) => bb.x < o.x + o.width && o.x < bb.x + bb.width && bb.y < o.y + o.height && o.y < bb.y + bb.height)) continue;
      if (segs.some((sg) => hitSeg(bb, sg))) continue;
      return t;
    }
    p.remove(key);
    return null;
  }
  // Candidates in a ring around a point.
  const SPOTS = [["start", 8, -8], ["end", -8, -8], ["start", 8, 17], ["end", -8, 17], ["middle", 0, -12],
    ["middle", 0, 24], ["start", 14, -24], ["end", -14, -24], ["start", 14, 32], ["end", -14, 32]];
  const placeLabel = (p, key, x, y, text, cls, lines, others) =>
    placeFirst(p, key, SPOTS.map(([a, dx, dy]) => [x, y, a, dx, dy]), text, cls, lines, others);
  // Candidates along a horizontal line at y: right end, left end, middle; above, then below.
  function placeOnHLine(p, key, y, text, cls, lines, others) {
    const [x0, x1] = p.xlim, mid = (x0 + x1) / 2, e = (x1 - x0) * 0.013;
    const c = [];
    [-5, 15].forEach((dy) => c.push([x1 - e, y, "end", 0, dy], [x0 + e, y, "start", 0, dy], [mid, y, "middle", 0, dy]));
    return placeFirst(p, key, c, text, cls, lines, others);
  }

  /* ------------------------------------------------------------------ */
  /* 4.1  Corner speed with and without downforce                        */
  /* ------------------------------------------------------------------ */
  RVD.widgets["aero-corner"] = function (root) {
    const { controls, plots } = RVD.ui.layout(root, { plots: 2 });
    let base = A.presets.fsae;
    const defaultR = { fsae: 30, club: 60, gt: 120 };

    RVD.ui.choice(controls, {
      value: "fsae", options: presetOptions,
      onInput: (k) => { base = A.presets[k]; m.set(base.m); mu.set(base.mu); cla.set(base.ClA); cda.set(base.CdA); R.set(defaultR[k]); draw(); }
    });
    RVD.ui.group(controls, "Car");
    const m = RVD.ui.slider(controls, { label: "Mass (incl. driver)", min: 150, max: 1600, step: 5, value: base.m, digits: 0, unit: "kg", onInput: draw });
    const mu = RVD.ui.slider(controls, { label: "Tire friction μ", min: 0.8, max: 2.0, step: 0.05, value: base.mu, onInput: draw });
    const cla = RVD.ui.slider(controls, { label: "Downforce CLA", min: 0, max: 5, step: 0.05, value: base.ClA, unit: "m²", onInput: draw });
    const cda = RVD.ui.slider(controls, { label: "Drag CDA", min: 0.3, max: 2.0, step: 0.05, value: base.CdA, unit: "m²", onInput: draw });
    RVD.ui.group(controls, "Track and air");
    const R = RVD.ui.slider(controls, { label: "Corner radius R", min: 5, max: 300, step: 1, value: defaultR.fsae, digits: 0, unit: "m", onInput: draw });
    const rho = RVD.ui.slider(controls, { label: "Air density ρ", min: 0.9, max: 1.3, step: 0.005, value: 1.225, digits: 3, unit: "kg/m³", onInput: draw });

    const ro = RVD.ui.readouts(controls);
    const rV0 = RVD.ui.readout(ro, "Corner speed, no aero");
    const rV = RVD.ui.readout(ro, "Corner speed, with aero");
    const rGain = RVD.ui.readout(ro, "Gain from downforce");
    const rFL = RVD.ui.readout(ro, "Downforce in the corner");
    const rAy = RVD.ui.readout(ro, "Lateral acceleration");
    const rRs = RVD.ui.readout(ro, "Aero radius R*");
    const rWs = RVD.ui.readout(ro, "Downforce = weight at");
    const status = RVD.ui.status(controls);

    const YMAX = 350;
    const box1 = RVD.ui.h("div", null, plots);
    const p1 = RVD.plot(box1, {
      xlim: [0, 300], ylim: [0, YMAX], height: 330, fixedText: true, onTextScale: () => draw(),
      xlabel: "Corner radius R (m)", ylabel: "Grip-limited corner speed (km/h)"
    });
    RVD.legend(box1, [
      { label: "With downforce", color: "var(--s1)" },
      { label: "No downforce", color: "var(--text-muted)", dash: true },
      { label: "Power-limited top speed", color: "var(--s5)", dash: true }
    ]);
    const box2 = RVD.ui.h("div", null, plots);
    const p2 = RVD.plot(box2, {
      xlim: [0, 300], ylim: [0, 3], height: 330, fixedText: true, onTextScale: () => draw(),
      xlabel: "Speed (km/h)", ylabel: "Force ÷ weight"
    });
    RVD.legend(box2, [
      { label: "Downforce", color: "var(--s3)" },
      { label: "Drag", color: "var(--s5)" },
      { label: "Weight", color: "var(--text-muted)", dash: true },
      { label: "Corner speed", color: "var(--s1)", dash: true }
    ]);

    function draw() {
      const c = Object.assign({}, base, { m: m.value, mu: mu.value, ClA: cla.value, CdA: cda.value, rho: rho.value });
      const c0 = Object.assign({}, c, { ClA: 0 });
      const Rs = A.aeroRadius(c);

      // Plot 1: corner speed vs radius
      const withAero = [], noAero = [];
      for (let r = 1; r <= 300; r += 1) {
        noAero.push([r, A.cornerSpeed(c0, r) * KMH]);
        const v = A.cornerSpeed(c, r) * KMH;
        if (v <= YMAX * 1.02) withAero.push([r, v]);
      }
      if (withAero.length && withAero[withAero.length - 1][0] < 300) withAero.push([Math.min(Rs, 300), YMAX * 1.05]);
      p1.line("noaero", noAero, "series series--dash cm");
      p1.line("aero", withAero, "series c1");
      const r = R.value;
      const v0 = A.cornerSpeed(c0, r), v = A.cornerSpeed(c, r);
      const vTop = A.topSpeed(c) * KMH;
      const topLine = vTop < YMAX ? [[[0, vTop], [300, vTop]]] : [];
      const rsLine = Rs < 300 ? [[[Rs, 0], [Rs, YMAX]]] : [];
      const lines1 = [noAero, withAero].concat(topLine, rsLine);
      if (Rs < 300) {
        p1.area("beyond", [[Rs, 0], [300, 0], [300, YMAX], [Rs, YMAX]], "f3");
        p1.line("rs", rsLine[0], "series series--thin series--dash c3");
      } else { p1.remove("beyond"); p1.remove("rs"); }
      if (topLine.length) p1.line("top", topLine[0], "series series--thin series--dash c5"); else p1.remove("top");
      ["p1L", "topL", "rsL", "rsL1", "rsL2"].forEach((k) => p1.remove(k));

      p1.point("p0", r, v0 * KMH, { cls: "fm", r: 5 });
      const placed = [];
      if (isFinite(v) && v * KMH <= YMAX) {
        p1.point("p1", r, v * KMH, { cls: "f1", r: 7 });
        placed.push(placeLabel(p1, "p1L", r, v * KMH, fmtKmh(v), "annot f1", lines1, placed));
      } else p1.remove("p1");
      if (topLine.length) placed.push(placeOnHLine(p1, "topL", vTop, `top speed ${RVD.fmt(vTop, 0)} km/h`, "annot f5", [noAero, withAero].concat(rsLine), placed));
      if (Rs < 300) {
        placed.push(placeFirst(p1, "rsL",
          [[Rs, YMAX, "start", 5, 14], [Rs, YMAX, "end", -5, 14], [Rs, YMAX * 0.92, "start", 5, 14], [Rs, YMAX * 0.92, "end", -5, 14]],
          `R* = ${RVD.fmt(Rs, 0)} m`, "annot f3", [noAero, withAero].concat(topLine), placed));
        const mx = (Rs + 300) / 2, cands = [];
        [0.8, 0.65, 0.5, 0.35].forEach((f) => cands.push([mx, YMAX * f, "middle", 0, 0]));
        [0.8, 0.65, 0.5, 0.35].forEach((f) => cands.push([mx, YMAX * f, "middle", 0, 0, "no grip limit"]));
        placeFirst(p1, "rsL1", cands, "grip no longer limits", "annot f3", lines1, placed);
      }

      // Plot 2: forces vs speed
      const W = c.m * G, fl = [], fd = [];
      for (let s = 0; s <= 300; s += 3) { const V = s / KMH; fl.push([s, A.downforce(c, V) / W]); fd.push([s, A.drag(c, V) / W]); }
      const flShown = fl.filter((pt) => pt[1] <= 3.05), fdShown = fd.filter((pt) => pt[1] <= 3.05);
      p2.line("w", [[0, 1], [300, 1]], "series series--thin series--dash cm");
      p2.line("fl", flShown, "series c3");
      p2.line("fd", fdShown, "series c5");
      const vw = A.weightSpeed(c);
      if (vw * KMH <= 300) p2.point("vw", vw * KMH, 1, { cls: "f3", r: 5 }); else p2.remove("vw");
      const vcLine = isFinite(v) && v * KMH <= 300 ? [[[v * KMH, 0], [v * KMH, 2.45]]] : [];   // stops below the note band
      if (vcLine.length) {
        p2.line("vc", vcLine[0], "series series--thin series--dash c1");
        p2.point("vcF", v * KMH, A.downforce(c, v) / W, { cls: "f3", r: 4 });
      } else { p2.remove("vc"); p2.remove("vcF"); }
      p2.remove("wL"); p2.remove("vwL");
      const lines2 = [flShown, fdShown].concat(vcLine);
      const wL = placeOnHLine(p2, "wL", 1, "= weight", "annot fm", lines2, []);
      const vwText = vw * KMH <= 300 ? `downforce = weight at ${RVD.fmt(vw * KMH, 0)} km/h` : "downforce < weight below 300 km/h";
      placeFirst(p2, "vwL", [[0, 3, "start", 6, 15], [300, 3, "end", -6, 15], [0, 2.5, "start", 6, 15], [150, 3, "middle", 0, 15],
        [0, 3, "start", 6, 15, vw * KMH <= 300 ? `F_L = W at ${RVD.fmt(vw * KMH, 0)} km/h` : "F_L < W"], [300, 3, "end", -6, 15, vw * KMH <= 300 ? `F_L = W at ${RVD.fmt(vw * KMH, 0)} km/h` : "F_L < W"]],
        vwText, "annot f3", lines2.concat([[[0, 1], [300, 1]]]), [wL]);

      // Readouts
      rV0.set(fmtKmh(v0));
      rV.set(fmtKmh(v), isFinite(v) ? null : "warn");
      rGain.set(isFinite(v) ? `+${RVD.fmt((v / v0 - 1) * 100, 1)}%` : "—", "ok");
      rFL.set(isFinite(v) ? `${RVD.fmt((A.downforce(c, v) / W) * 100, 0)}% of weight` : "—");
      rAy.set(isFinite(v) ? `${RVD.fmt((v * v) / r / G, 2)} g` : "—");
      rRs.set(isFinite(Rs) ? `${RVD.fmt(Rs, 0)} m` : "none (no downforce)");
      rWs.set(isFinite(vw) ? `${RVD.fmt(vw * KMH, 0)} km/h` : "never");
      if (!isFinite(v)) status.set(`This corner is wider than R* = ${RVD.fmt(Rs, 0)} m: downforce grows faster than the force needed to turn, so in this simple model grip never runs out. Power and drag set the speed instead (Lesson 4.3).`, "warn");
      else if (v * KMH > vTop) status.set(`Grip would allow ${fmtKmh(v)}, but the car's power can only push it to about ${RVD.fmt(vTop, 0)} km/h against drag. In this corner the engine, not the tires, is the limit.`, "warn");
      else status.set(`Downforce adds ${RVD.fmt((v / v0 - 1) * 100, 1)}% to the corner speed here, because at ${fmtKmh(v)} it loads the tires with an extra ${RVD.fmt((A.downforce(c, v) / W) * 100, 0)}% of the car's weight.`, "ok");
    }
    draw();
  };

  /* ------------------------------------------------------------------ */
  /* 4.2  Aero balance: front and rear axle limits vs speed              */
  /* ------------------------------------------------------------------ */
  RVD.widgets["aero-balance"] = function (root) {
    const { controls, plots } = RVD.ui.layout(root, { plots: 2 });
    let base = A.presets.gt;

    RVD.ui.choice(controls, {
      value: "gt", options: presetOptions,
      onInput: (k) => { base = A.presets[k]; wf.set(base.wf * 100); lam.set(base.lam * 100); cla.set(base.ClA); mb.set(0); V.set(Math.min(200, Math.round(A.topSpeed(base) * KMH * 0.8 / 10) * 10)); draw(); }
    });
    RVD.ui.group(controls, "Balance");
    const wf = RVD.ui.slider(controls, { label: "Static front weight b/L", min: 40, max: 60, step: 0.5, value: base.wf * 100, digits: 1, unit: "%", onInput: draw });
    const lam = RVD.ui.slider(controls, { label: "Aero balance λ (front share of downforce)", min: 25, max: 65, step: 0.5, value: base.lam * 100, digits: 1, unit: "%", onInput: draw });
    const mb = RVD.ui.slider(controls, {
      label: "Mechanical (low-speed) balance", min: -8, max: 8, step: 0.5, value: 0, onInput: draw,
      format: (v) => (Math.abs(v) < 0.01 ? "neutral" : v < 0 ? `front grip −${RVD.fmt(-v, 1)}%` : `front grip +${RVD.fmt(v, 1)}%`)
    });
    const cla = RVD.ui.slider(controls, { label: "Downforce CLA", min: 0, max: 5, step: 0.05, value: base.ClA, unit: "m²", onInput: draw });
    const V = RVD.ui.slider(controls, { label: "Speed", min: 0, max: 300, step: 5, value: 200, digits: 0, unit: "km/h", onInput: draw });

    const ro = RVD.ui.readouts(controls);
    const rF = RVD.ui.readout(ro, "Front axle limit");
    const rR = RVD.ui.readout(ro, "Rear axle limit");
    const rBal = RVD.ui.readout(ro, "Balance at this speed");
    const rCP = RVD.ui.readout(ro, "Center of pressure");
    const status = RVD.ui.status(controls);

    const box1 = RVD.ui.h("div", null, plots);
    const p1 = RVD.plot(box1, {
      xlim: [0, 300], ylim: [0, 3], height: 300, fixedText: true, onTextScale: () => draw(),
      xlabel: "Speed (km/h)", ylabel: "Axle grip limit (g)"
    });
    RVD.legend(box1, [
      { label: "Front axle", color: "var(--s2)" },
      { label: "Rear axle", color: "var(--s1)" },
      { label: "Current speed", color: "var(--text-muted)", dash: true }
    ]);
    const box2 = RVD.ui.h("div", null, plots);
    const p2 = RVD.plot(box2, {
      xlim: [0, 300], ylim: [-15, 15], height: 300, fixedText: true, onTextScale: () => draw(),
      xlabel: "Speed (km/h)", ylabel: "Rear − front limit (%)",
      yfmt: (v) => (v > 0 ? "+" : "") + v
    });
    RVD.legend(box2, [
      { label: "Understeer: front saturates first", color: "var(--s2)", area: true },
      { label: "Oversteer: rear saturates first", color: "var(--s1)", area: true }
    ]);

    // Wheelbase strip: rear axle, CG (label above the line), CoP (label below), front axle.
    const strip = RVD.svgEl("svg", { viewBox: "0 0 480 84", class: "ab-strip", role: "img", "aria-label": "Positions of the CG and center of pressure along the wheelbase" }, box1);
    const sx = (frac) => 50 + frac * 380;     // 0 = rear axle, 1 = front axle
    RVD.svgEl("line", { x1: sx(0), y1: 42, x2: sx(1), y2: 42, class: "ab-wb" }, strip);
    [0, 1].forEach((f) => RVD.svgEl("circle", { cx: sx(f), cy: 42, r: 7, class: "ab-axle" }, strip));
    RVD.svgEl("text", { x: sx(0) - 12, y: 46, "text-anchor": "end", class: "ab-txt" }, strip).textContent = "rear";
    RVD.svgEl("text", { x: sx(1) + 12, y: 46, "text-anchor": "start", class: "ab-txt" }, strip).textContent = "front";
    const cgMark = RVD.svgEl("path", { class: "ab-cg" }, strip);
    const cgTxt = RVD.svgEl("text", { y: 18, "text-anchor": "middle", class: "ab-txt ab-cgt" }, strip);
    const cpMark = RVD.svgEl("path", { class: "ab-cp" }, strip);
    const cpTxt = RVD.svgEl("text", { y: 76, "text-anchor": "middle", class: "ab-txt ab-cpt" }, strip);

    function draw() {
      const c = Object.assign({}, base, { wf: wf.value / 100, lam: lam.value / 100, ClA: cla.value, mechBal: mb.value / 100 });
      const vTop = Math.min(300, A.topSpeed(c) * KMH);
      const fr = [], rr = [], diff = [];
      let yMax = 0, cross = null, prevSign = null;
      for (let s = 0; s <= vTop + 1e-9; s += 2) {
        const lim = A.axleLimits(c, s / KMH);
        fr.push([s, lim.front]); rr.push([s, lim.rear]);
        const d = (lim.rear / lim.front - 1) * 100;
        diff.push([s, d]);
        yMax = Math.max(yMax, lim.front, lim.rear);
        const sign = Math.sign(Math.round(d * 1000));
        if (prevSign != null && sign !== prevSign && sign !== 0 && cross == null && s > 0) cross = s;
        if (sign !== 0) prevSign = sign;
      }
      p1.setLimits([0, 300], [0, Math.max(2, Math.ceil(yMax * 2) / 2)]);
      p1.line("front", fr, "series c2");
      p1.line("rear", rr, "series c1");
      if (vTop < 299) {
        p1.area("over", [[vTop, 0], [300, 0], [300, 9], [vTop, 9]], "fm");
        if (300 - vTop > 110) p1.label("overL", (vTop + 300) / 2, p1.ylim[1] * 0.08, "above top speed", { cls: "annot fm", anchor: "middle" });
        else p1.remove("overL");
      } else { p1.remove("over"); p1.remove("overL"); }
      const s = Math.min(V.value, vTop);
      p1.line("now", [[s, 0], [s, p1.ylim[1]]], "series series--thin series--dash cm");
      const lim = A.axleLimits(c, s / KMH);
      p1.point("nf", s, lim.front, { cls: "f2", r: 5 });
      p1.point("nr", s, lim.rear, { cls: "f1", r: 5 });

      // Balance margin plot: rear limit above front (positive) means the front saturates first: understeer.
      const span = Math.max(6, Math.ceil(Math.max(...diff.map((d) => Math.abs(d[1]))) / 3) * 3 + 3);
      p2.setLimits([0, 300], [-span, span]);
      p2.area("us", [[0, 0], [300, 0], [300, span], [0, span]], "f2");
      p2.area("os", [[0, -span], [300, -span], [300, 0], [0, 0]], "f1");
      // Region names at the low-speed end, where the curve stays near the mechanical balance.
      p2.label("usL", 4, span, "understeer", { cls: "annot f2", dy: off(p2, 15) });
      p2.label("osL", 4, -span, "oversteer", { cls: "annot f1", dy: off(p2, -6) });
      p2.line("zero", [[0, 0], [300, 0]], "series series--thin cm");
      p2.line("diff", diff, "series c4");
      const dNow = (lim.rear / lim.front - 1) * 100;
      p2.point("dn", s, dNow, { cls: "f4", r: 5 });
      if (cross != null) {
        // The curve changes side at the crossing: put the label on the side it is not on.
        const after = Math.sign(diff[diff.length - 1][1]), right = cross <= 150;
        const above = right ? after < 0 : after > 0;
        p2.point("x", cross, 0, { cls: "f4", r: 4 });
        p2.label("xL", cross, 0, `balance flips at ${RVD.fmt(cross, 0)} km/h`, { cls: "annot f4", anchor: right ? "start" : "end", dx: off(p2, right ? 8 : -8), dy: off(p2, above ? -8 : 16) });
      } else { p2.remove("x"); p2.remove("xL"); }

      // Strip: positions measured from the rear axle as a fraction of the wheelbase
      const cgF = c.wf, cpF = c.lam;
      cgMark.setAttribute("d", `M${sx(cgF)},33 l-7,-9 h14 z`);
      cgTxt.setAttribute("x", sx(cgF));
      cgTxt.textContent = `CG (${RVD.fmt(c.wf * 100, 1)}% front)`;
      cpMark.setAttribute("d", `M${sx(cpF)},51 l-7,9 h14 z`);
      cpTxt.setAttribute("x", sx(cpF));
      cpTxt.textContent = c.ClA > 0 ? `CoP (${RVD.fmt(c.lam * 100, 1)}% front)` : "";
      cpMark.style.display = c.ClA > 0 ? "" : "none";

      // Readouts
      rF.set(`${RVD.fmt(lim.front, 2)} g`, lim.front < lim.rear - 1e-6 ? "warn" : null);
      rR.set(`${RVD.fmt(lim.rear, 2)} g`, lim.rear < lim.front - 1e-6 ? "bad" : null);
      const verdict = Math.abs(dNow) < 0.25 ? "neutral" : dNow > 0 ? "understeer" : "oversteer";
      rBal.set(verdict, verdict === "oversteer" ? "bad" : verdict === "understeer" ? "warn" : "ok");
      const L = c.L, xcp = (1 - c.lam) * L, xcg = (1 - c.wf) * L;
      rCP.set(c.ClA > 0 ? `${RVD.fmt(xcp, 2)} m behind front axle` : "—");
      const rel = xcp - xcg;
      if (c.ClA === 0) status.set("With no downforce the balance is the mechanical balance at every speed.", null);
      else status.set(
        `The center of pressure is ${RVD.fmt(Math.abs(rel) * 100, 0)} cm ${rel >= 0 ? "behind" : "ahead of"} the CG, so downforce gives the ${rel >= 0 ? "rear" : "front"} axle proportionally more grip as speed rises. ` +
        (Math.abs(c.lam - c.wf) < 0.003 ? "Aero balance equals the weight distribution, so the balance stays the same at every speed." :
          c.lam < c.wf ? "The car becomes more understeery in fast corners." : "The car becomes more oversteery in fast corners: unstable at high speed."),
        c.lam > c.wf + 0.003 ? "bad" : "ok");
    }
    draw();
  };

  /* ------------------------------------------------------------------ */
  /* 4.2  The g-g-V diagram                                              */
  /* ------------------------------------------------------------------ */
  RVD.widgets["ggv"] = function (root) {
    const { controls, plots } = RVD.ui.layout(root, { plots: 2 });
    let base = A.presets.gt;

    RVD.ui.choice(controls, {
      value: "gt", options: presetOptions,
      onInput: (k) => { base = A.presets[k]; cla.set(base.ClA); cda.set(base.CdA); P.set(base.P / 1000); V.set(Math.round(A.topSpeed(base) * KMH * 0.6 / 10) * 10); draw(); }
    });
    RVD.ui.group(controls, "Car");
    const cla = RVD.ui.slider(controls, { label: "Downforce CLA", min: 0, max: 5, step: 0.05, value: base.ClA, unit: "m²", onInput: draw });
    const cda = RVD.ui.slider(controls, { label: "Drag CDA", min: 0.3, max: 2.0, step: 0.05, value: base.CdA, unit: "m²", onInput: draw });
    const P = RVD.ui.slider(controls, { label: "Power at the wheels", min: 20, max: 600, step: 5, value: base.P / 1000, digits: 0, unit: "kW", onInput: draw });
    const V = RVD.ui.slider(controls, { label: "Highlighted speed", min: 10, max: 320, step: 5, value: 180, digits: 0, unit: "km/h", onInput: draw });

    const ro = RVD.ui.readouts(controls);
    const rLat = RVD.ui.readout(ro, "Max lateral");
    const rBrk = RVD.ui.readout(ro, "Max braking");
    const rAcc = RVD.ui.readout(ro, "Max acceleration");
    const rLim = RVD.ui.readout(ro, "Acceleration limited by");
    const rTop = RVD.ui.readout(ro, "Top speed");

    const box1 = RVD.ui.h("div", null, plots);
    const p1 = RVD.plot(box1, {
      xlim: [-3, 3], ylim: [-3, 2], height: 340, fixedText: true, onTextScale: () => draw(),
      xlabel: "Lateral acceleration ay (g)", ylabel: "Longitudinal ax (g)   ↓ braking | accel ↑"
    });
    // Legend rebuilt on every draw: the reference speeds depend on the car's top speed.
    const legendBox = RVD.ui.h("div", null, box1);
    const OPAC = [0.35, 0.6, 0.9];
    const box2 = RVD.ui.h("div", null, plots);
    const p2 = RVD.plot(box2, {
      xlim: [0, 300], ylim: [0, 3], height: 340, fixedText: true, onTextScale: () => draw(),
      xlabel: "Speed (km/h)", ylabel: "Limit (g)"
    });
    RVD.legend(box2, [
      { label: "Braking", color: "var(--s2)" },
      { label: "Lateral", color: "var(--s1)" },
      { label: "Acceleration", color: "var(--s3)" }
    ]);

    // Envelope at speed V: a tire grip circle of radius mu (1 + F_L/W), forward tire force capped
    // by the drive limit, then shifted toward braking by drag.
    function envelope(c, Vms) {
      const W = c.m * G, gt = A.latLimit(c, Vms), cap = A.driveForce(c, Vms) / W, dr = A.drag(c, Vms) / W;
      const pts = [];
      for (let i = 0; i <= 180; i++) {
        const th = (i / 180) * 2 * Math.PI;
        const ay = gt * Math.cos(th);
        const axT = Math.min(gt * Math.sin(th), cap);
        pts.push([ay, axT - dr]);
      }
      return pts;
    }
    let shown = [];

    function draw() {
      const c = Object.assign({}, base, { ClA: cla.value, CdA: cda.value, P: P.value * 1000 });
      const vTop = A.topSpeed(c) * KMH;
      const vMax = Math.min(300, vTop);
      // Three reference envelopes at about 1/4, 1/2 and 3/4 of top speed, labelled at the
      // middle of their top (acceleration) edge, where power makes them far apart.
      const speeds = [0.25, 0.5, 0.75].map((f) => Math.max(10, Math.round((Math.min(vTop, 320) * f) / 10) * 10));
      const latMax = A.latLimit(c, vMax / KMH), brkMax = A.brakeDecel(c, vMax / KMH);
      const L = Math.max(2, Math.ceil(Math.max(latMax, brkMax) * 2) / 2);
      p1.setLimits([-L, L], [-L, Math.max(1, Math.ceil((A.accel(c, 1) + 0.25) * 2) / 2)]);

      shown.forEach((k) => p1.remove("e" + k));
      shown = speeds.slice();
      speeds.forEach((s, i) => {
        const n = p1.line("e" + s, envelope(c, s / KMH), "series c1");
        n.style.opacity = OPAC[i];
      });
      const sNow = Math.min(V.value, vTop * 0.995);
      const vNow = sNow / KMH;
      p1.line("now", envelope(c, vNow), "series c2", { top: true });
      p1.line("ax0", [[-L, 0], [L, 0]], "series series--thin cm");
      legendBox.textContent = "";
      const lg = RVD.legend(legendBox, speeds.map((s) => ({ label: `${s} km/h`, color: "var(--s1)" }))
        .concat([{ label: `${RVD.fmt(sNow, 0)} km/h (your speed)`, color: "var(--s2)" }]));
      lg.querySelectorAll("i").forEach((el, i) => { if (i < OPAC.length) el.style.opacity = OPAC[i]; });

      // Limits vs speed, with markers at the highlighted speed
      const lat = [], brk = [], acc = [];
      for (let s = 2; s <= vMax; s += 2) {
        const v = s / KMH;
        lat.push([s, A.latLimit(c, v)]); brk.push([s, A.brakeDecel(c, v)]); acc.push([s, Math.max(0, A.accel(c, v))]);
      }
      p2.setLimits([0, 300], [0, Math.max(2, Math.ceil(A.brakeDecel(c, vMax / KMH) * 2) / 2)]);
      p2.line("lat", lat, "series c1");
      p2.line("brk", brk, "series c2");
      p2.line("acc", acc, "series c3");
      p2.remove("now");
      p2.point("mLat", sNow, A.latLimit(c, vNow), { cls: "f1", r: 5 });
      p2.point("mBrk", sNow, A.brakeDecel(c, vNow), { cls: "f2", r: 5 });
      p2.point("mAcc", sNow, Math.max(0, A.accel(c, vNow)), { cls: "f3", r: 5 });
      if (vTop < 300) {
        p2.point("top", vTop, 0, { cls: "f3", r: 5 });
        const txt = `top speed ${RVD.fmt(vTop, 0)} km/h`;
        if (vTop < 170) {
          // Nothing is drawn beyond top speed, so the label goes there.
          const yL = Math.min(0.8, A.latLimit(c, 0) * 0.55);
          p2.line("topLine", [[vTop, 0], [vTop, yL]], "series series--thin series--dash c3");
          p2.label("topL", vTop, yL, txt, { cls: "annot f3", dx: off(p2, 4), dy: off(p2, 4) });
        } else {
          // To the left, sit the label just above the acceleration curve it spans, if it fits
          // under the grip curves; otherwise leave it to the readout.
          const lab = p2.label("topL", vTop, 0, txt, { cls: "annot f3", anchor: "end", dx: off(p2, -4) });
          const bb = lab.getBBox();
          const perX = 300 / (p2.sx(300) - p2.sx(0));
          const perY = (p2.ylim[1] - p2.ylim[0]) / (p2.sy(p2.ylim[0]) - p2.sy(p2.ylim[1]));
          const x0 = vTop - (bb.width + off(p2, 6)) * perX;
          let accMax = 0, latMin = Infinity;
          for (let sx = Math.max(0, x0); sx <= vTop; sx += 2) {
            accMax = Math.max(accMax, A.accel(c, sx / KMH));
            latMin = Math.min(latMin, A.latLimit(c, sx / KMH));
          }
          const yL = accMax + off(p2, 5) * perY;
          if (yL + bb.height * perY < latMin - off(p2, 3) * perY) {
            p2.label("topL", vTop, yL, txt, { cls: "annot f3", anchor: "end", dx: off(p2, -4) });
            p2.line("topLine", [[vTop, 0], [vTop, yL]], "series series--thin series--dash c3");
          } else { p2.remove("topL"); p2.remove("topLine"); }
        }
      } else { ["top", "topLine", "topL"].forEach((k) => p2.remove(k)); }
      rTop.set(`${RVD.fmt(vTop, 0)} km/h`);

      rLat.set(`${RVD.fmt(A.latLimit(c, vNow), 2)} g`);
      rBrk.set(`${RVD.fmt(A.brakeDecel(c, vNow), 2)} g`);
      rAcc.set(`${RVD.fmt(Math.max(0, A.accel(c, vNow)), 2)} g`);
      const trac = A.tractionForce(c, vNow) <= A.powerForce(c, vNow);
      rLim.set(trac ? "traction (tires)" : "power", trac ? null : "warn");
    }
    draw();
  };

  /* ------------------------------------------------------------------ */
  /* 4.3  Traction, power and drag vs speed                              */
  /* ------------------------------------------------------------------ */
  RVD.widgets["accel-speed"] = function (root) {
    const { controls, plots } = RVD.ui.layout(root, { plots: 2 });
    let base = A.presets.gt;

    RVD.ui.choice(controls, {
      value: "gt", options: presetOptions,
      onInput: (k) => { base = A.presets[k]; P.set(base.P / 1000); cda.set(base.CdA); cla.set(base.ClA); mu.set(base.mu); draw(); }
    });
    RVD.ui.group(controls, "Car");
    const P = RVD.ui.slider(controls, { label: "Power at the wheels", min: 20, max: 600, step: 5, value: base.P / 1000, digits: 0, unit: "kW", onInput: draw });
    const cda = RVD.ui.slider(controls, { label: "Drag CDA", min: 0.3, max: 2.0, step: 0.05, value: base.CdA, unit: "m²", onInput: draw });
    const cla = RVD.ui.slider(controls, { label: "Downforce CLA", min: 0, max: 5, step: 0.05, value: base.ClA, unit: "m²", onInput: draw });
    const mu = RVD.ui.slider(controls, { label: "Tire friction μ", min: 0.8, max: 2.0, step: 0.05, value: base.mu, onInput: draw });

    const ro = RVD.ui.readouts(controls);
    const rX = RVD.ui.readout(ro, "Traction-limited up to");
    const rTop = RVD.ui.readout(ro, "Top speed");
    const r100 = RVD.ui.readout(ro, "0–100 km/h");
    const r200 = RVD.ui.readout(ro, "0–200 km/h");
    const status = RVD.ui.status(controls);

    const box1 = RVD.ui.h("div", null, plots);
    const p1 = RVD.plot(box1, {
      xlim: [0, 350], ylim: [0, 1.5], height: 330, fixedText: true, onTextScale: () => draw(),
      xlabel: "Speed (km/h)", ylabel: "Force ÷ weight"
    });
    RVD.legend(box1, [
      { label: "Drive force available", color: "var(--s1)" },
      { label: "Traction limit", color: "var(--s2)", dash: true },
      { label: "Power limit P/V", color: "var(--s4)", dash: true },
      { label: "Drag", color: "var(--s5)" },
      { label: "Net accelerating force", color: "var(--s1)", area: true },
      { label: "Traction → power crossover", color: "var(--s1)", dot: true },
      { label: "Top speed", color: "var(--s5)", dot: true }
    ]);
    const box2 = RVD.ui.h("div", null, plots);
    const p2 = RVD.plot(box2, {
      xlim: [0, 30], ylim: [0, 350], height: 330, fixedText: true, onTextScale: () => draw(),
      xlabel: "Time from a standstill (s)", ylabel: "Speed (km/h)"
    });
    RVD.legend(box2, [{ label: "Full-throttle run", color: "var(--s1)" }, { label: "Top speed", color: "var(--s5)", dash: true }]);

    function run(c) {   // standing start, full throttle, RK2 in time
      const pts = [[0, 0]];
      let v = 0.5, t = 0, t100 = null, t200 = null;
      const dt = 0.02, vTop = A.topSpeed(c);
      while (t < 60 && v < vTop * 0.995) {
        const a1 = A.accel(c, v) * G;
        const a2 = A.accel(c, v + 0.5 * dt * a1) * G;
        const vn = v + dt * a2;
        if (t100 == null && vn * KMH >= 100) t100 = t + dt * (100 / KMH - v) / (vn - v);
        if (t200 == null && vn * KMH >= 200) t200 = t + dt * (200 / KMH - v) / (vn - v);
        v = vn; t += dt;
        if (Math.round(t / dt) % 10 === 0) pts.push([t, v * KMH]);
      }
      return { pts, t100, t200, tEnd: t };
    }

    function draw() {
      const c = Object.assign({}, base, { P: P.value * 1000, CdA: cda.value, ClA: cla.value, mu: mu.value });
      const W = c.m * G, vTop = A.topSpeed(c), sTop = vTop * KMH;
      const xMax = Math.min(400, Math.max(150, Math.ceil(sTop * 1.15 / 50) * 50));
      const trac = [], pow = [], drive = [], dr = [], net = [];
      let yMax = 0;
      for (let s = 1; s <= xMax; s += 1) {
        const v = s / KMH;
        const t = A.tractionForce(c, v) / W, pw = A.powerForce(c, v) / W, d = A.drag(c, v) / W;
        trac.push([s, t]); pow.push([s, pw]); drive.push([s, Math.min(t, pw)]); dr.push([s, d]);
        yMax = Math.max(yMax, t);
        if (s <= sTop) net.push([s, Math.min(t, pw)]);
      }
      const yTop = Math.max(1, Math.ceil(yMax * 1.25 * 4) / 4);
      p1.setLimits([0, xMax], [0, yTop]);
      const netPoly = net.concat(net.slice().reverse().map(([s]) => [s, A.drag(c, s / KMH) / W]));
      p1.area("net", netPoly, "f1");
      p1.line("trac", trac, "series series--dash c2");
      p1.line("pow", pow.filter((pt) => pt[1] <= yTop * 1.05), "series series--dash c4");
      p1.line("dr", dr.filter((pt) => pt[1] <= yTop * 1.05), "series c5");
      p1.line("drive", drive, "series c1");
      const curves = [trac, pow.filter((pt) => pt[1] <= yTop * 1.05), dr, drive];
      p1.remove("xL"); p1.remove("tL");
      const vx = A.crossoverSpeed(c), sx = vx * KMH;
      let xL = null;
      if (sx < xMax) {
        const fx = A.tractionForce(c, vx) / W;
        p1.point("x", sx, fx, { cls: "f1", r: 5 });
        xL = placeLabel(p1, "xL", sx, fx, `${RVD.fmt(sx, 0)} km/h`, "annot f1", curves, []);
      } else p1.remove("x");
      if (sTop < xMax) {
        const ft = A.drag(c, vTop) / W;
        p1.point("t", sTop, ft, { cls: "f5", r: 6 });
        placeLabel(p1, "tL", sTop, ft, `${RVD.fmt(sTop, 0)} km/h`, "annot f5", curves, [xL]);
      } else p1.remove("t");

      const r = run(c);
      const tMax = Math.min(60, Math.max(10, Math.ceil(r.tEnd / 5) * 5));
      p2.setLimits([0, tMax], [0, Math.max(150, Math.ceil(sTop * 1.1 / 50) * 50)]);
      p2.line("top", [[0, sTop], [tMax, sTop]], "series series--thin series--dash c5");
      p2.line("run", r.pts, "series c1");
      const runCurves = [r.pts, [[0, sTop], [tMax, sTop]]];
      p2.remove("t100L"); p2.remove("t200L");
      let prev = null;
      [["t100", r.t100, 100], ["t200", r.t200, 200]].forEach(([k, t, s]) => {
        if (t != null) {
          p2.point(k, t, s, { cls: "f1", r: 4 });
          prev = placeLabel(p2, k + "L", t, s, `${s} km/h in ${RVD.fmt(t, 1)} s`, "annot f1", runCurves, [prev]) || prev;
        } else p2.remove(k);
      });

      rX.set(fmtKmh(vx));
      rTop.set(`${RVD.fmt(sTop, 0)} km/h`);
      r100.set(r.t100 != null ? `${RVD.fmt(r.t100, 1)} s` : "not reached");
      r200.set(r.t200 != null ? `${RVD.fmt(r.t200, 1)} s` : "not reached");
      const p10 = Math.cbrt(1.1) - 1;
      status.set(`Below ${fmtKmh(vx)} the tires limit acceleration, so more power would only spin the wheels. Above it, power does, until drag uses all of it at ${RVD.fmt(sTop, 0)} km/h. 10% more power would add only ${RVD.fmt(p10 * 100, 1)}% to the top speed.`, null);
    }
    draw();
  };

  /* ------------------------------------------------------------------ */
  /* 4.3  Wing level trade-off on a simple circuit                       */
  /* ------------------------------------------------------------------ */
  const P_ = Math.PI;
  // Each circuit is a loop of straight + corner segments: S (m), R (m), theta (rad).
  const CIRCUITS = {
    small: {   // for the Formula SAE car
      tight: [{ S: 40, R: 9, theta: P_ }, { S: 60, R: 15, theta: P_ / 2 }, { S: 30, R: 12, theta: P_ / 2 }, { S: 70, R: 25, theta: P_ / 2 }],
      mixed: [{ S: 90, R: 15, theta: P_ }, { S: 140, R: 30, theta: P_ / 2 }, { S: 60, R: 20, theta: P_ / 2 }, { S: 180, R: 45, theta: P_ / 2 }],
      fast: [{ S: 200, R: 30, theta: P_ }, { S: 260, R: 60, theta: P_ / 2 }, { S: 200, R: 30, theta: P_ }, { S: 260, R: 60, theta: P_ / 2 }]
    },
    big: {     // for the club racer and GT car
      tight: [{ S: 150, R: 25, theta: P_ / 2 }, { S: 100, R: 15, theta: P_ }, { S: 200, R: 35, theta: P_ / 2 }, { S: 120, R: 25, theta: P_ / 2 }],
      mixed: [{ S: 400, R: 40, theta: P_ }, { S: 200, R: 120, theta: P_ / 2 }, { S: 400, R: 40, theta: P_ }, { S: 200, R: 120, theta: P_ / 2 }],
      fast: [{ S: 900, R: 60, theta: P_ }, { S: 300, R: 250, theta: P_ / 2 }, { S: 900, R: 60, theta: P_ }, { S: 300, R: 250, theta: P_ / 2 }]
    }
  };
  const circuitFor = (carKey, k) => CIRCUITS[carKey === "fsae" ? "small" : "big"][k];
  const describe = (segs) => {
    const Rs = segs.map((s) => s.R), Ss = segs.map((s) => s.S);
    const len = segs.reduce((a, s) => a + s.S + s.R * s.theta, 0);
    return `${RVD.fmt(len, 0)} m lap: corners R ${Math.min(...Rs)}–${Math.max(...Rs)} m, straights ${Math.min(...Ss)}–${Math.max(...Ss)} m`;
  };

  RVD.widgets["wing-tradeoff"] = function (root) {
    const { controls, plots } = RVD.ui.layout(root, { plots: 2 });
    let carKey = "gt", base = A.presets.gt;

    RVD.ui.choice(controls, {
      value: "gt", options: presetOptions,
      onInput: (k) => { carKey = k; base = A.presets[k]; E.set(base.wingE); wing.set(1); cache = null; draw(); }
    });
    RVD.ui.group(controls, "Circuit");
    const circuit = RVD.ui.choice(controls, {
      value: "mixed",
      options: [{ label: "Tight", value: "tight" }, { label: "Mixed", value: "mixed" }, { label: "Fast", value: "fast" }],
      onInput: () => { cache = null; draw(); }
    });
    const circNote = RVD.ui.h("p", "muted widget-note", controls);
    RVD.ui.group(controls, "Rear wing");
    const wing = RVD.ui.slider(controls, {
      label: "Wing level (× baseline downforce)", min: 0, max: 2.5, step: 0.05, value: 1, onInput: () => draw(),
      format: (v) => `×${RVD.fmt(v, 2)}`
    });
    const E = RVD.ui.slider(controls, { label: "Wing efficiency L/D", min: 2, max: 6, step: 0.1, value: base.wingE, digits: 1, onInput: () => { cache = null; draw(); } });
    const sens = RVD.ui.choice(controls, {
      value: "on", options: [{ label: "Load sensitivity on", value: "on" }, { label: "Off (constant μ)", value: "off" }],
      onInput: () => { cache = null; draw(); }
    });

    const ro = RVD.ui.readouts(controls);
    const rLap = RVD.ui.readout(ro, "Lap time");
    const rDelta = RVD.ui.readout(ro, "vs baseline wing");
    const rTop = RVD.ui.readout(ro, "Top speed on the lap");
    const rBest = RVD.ui.readout(ro, "Fastest wing level");
    const status = RVD.ui.status(controls);

    const box1 = RVD.ui.h("div", null, plots);
    const p1 = RVD.plot(box1, {
      xlim: [0, 2.5], ylim: [0, 1], height: 300, fixedText: true, onTextScale: () => draw(),
      xlabel: "Wing level (× baseline downforce)", ylabel: "Lap time (s)", xfmt: (v) => "×" + v
    });
    RVD.legend(box1, [
      { label: "Lap time", color: "var(--s4)" },
      { label: "Your wing", color: "var(--s1)" },
      { label: "Fastest", color: "var(--s3)" }
    ]);
    const box2 = RVD.ui.h("div", null, plots);
    const p2 = RVD.plot(box2, {
      xlim: [0, 1000], ylim: [0, 300], height: 300, fixedText: true, onTextScale: () => draw(),
      xlabel: "Distance around the lap (m)", ylabel: "Speed (km/h)"
    });
    RVD.legend(box2, [
      { label: "Your wing", color: "var(--s1)" },
      { label: "Baseline wing (×1)", color: "var(--text-muted)", dash: true }
    ]);

    function carAt(w) {
      const dCl = (w - 1) * base.ClA;
      return Object.assign({}, base, {
        ClA: Math.max(0, base.ClA + dCl),
        CdA: Math.max(0.2, base.CdA + dCl / E.value),
        s: sens.value === "on" ? base.sLoad : 0
      });
    }
    function lapTrace(c, segs) {
      const r = A.lap(c, segs);
      const pts = [];
      let s0 = 0;
      r.parts.forEach((part, i) => {
        part.trace.forEach(([s, v]) => pts.push([s0 + s, v * KMH]));
        s0 += segs[i].S + segs[i].R * segs[i].theta;
      });
      return { time: r.time, pts, vMax: Math.max(...r.parts.map((p) => p.vMax)) };
    }

    let cache = null;
    function draw() {
      const segs = circuitFor(carKey, circuit.value);
      circNote.textContent = describe(segs);
      if (!cache) {
        const curve = [];
        for (let w = 0; w <= 2.5001; w += 0.1) curve.push([w, A.lap(carAt(w), segs).time]);
        const best = curve.reduce((a, b) => (b[1] < a[1] ? b : a));
        cache = { curve, best, baseline: lapTrace(carAt(1), segs) };
      }
      const { curve, best, baseline } = cache;
      const ts = curve.map((p) => p[1]);
      const lo = Math.min(...ts), hi = Math.max(...ts), pad = Math.max(0.2, (hi - lo) * 0.12);
      p1.setLimits([0, 2.5], [Math.floor((lo - pad) * 2) / 2, Math.ceil((hi + pad) * 2) / 2]);
      p1.line("lap", curve, "series c4");
      p1.point("best", best[0], best[1], { cls: "f3", r: 6 });
      p1.remove("bestL");
      placeLabel(p1, "bestL", best[0], best[1], "fastest", "annot f3", [curve], []);

      const now = lapTrace(carAt(wing.value), segs);
      p1.point("now", wing.value, now.time, { cls: "f1", r: 7 });

      const len = segs.reduce((a, s) => a + s.S + s.R * s.theta, 0);
      const vMaxPlot = Math.max(now.vMax, baseline.vMax) * KMH;
      p2.setLimits([0, len], [0, Math.max(100, Math.ceil(vMaxPlot * 1.15 / 25) * 25)]);
      p2.line("base", baseline.pts, "series series--thin series--dash cm");
      p2.line("now", now.pts, "series c1");

      rLap.set(`${RVD.fmt(now.time, 2)} s`);
      const d = now.time - baseline.time;
      rDelta.set(`${d >= 0 ? "+" : "−"}${RVD.fmt(Math.abs(d), 2)} s`, d < -0.005 ? "ok" : d > 0.005 ? "bad" : null);
      rTop.set(`${RVD.fmt(now.vMax * KMH, 0)} km/h`);
      rBest.set(`×${RVD.fmt(best[0], 1)}`, "ok");
      const atMax = best[0] > 2.45, atMin = best[0] < 0.05;
      status.set(atMax
        ? "On this circuit the corners matter more than the straights: every bit of extra wing makes the lap faster, up to the most the car can carry."
        : atMin
          ? "On this circuit the straights dominate: the car is fastest with no extra wing at all."
          : `The fastest lap comes at ×${RVD.fmt(best[0], 1)}: more wing than that costs more on the straights than it gains in the corners.`, null);
    }
    draw();
  };
})();
