/*
 * Module 3 widgets (need models/tire.js and models/roll.js)
 *   roll-components : side view of the roll axis + stacked bars of unsprung,
 *                     geometric and elastic load transfer per axle (Lesson 3.2)
 *   brake-balance   : brake-force diagram with ideal curve, lock lines and the
 *                     installed bias line (Lesson 3.3)
 */
(function () {
  const RVD = window.RVD;
  const svgEl = RVD.svgEl;
  const G = RVD.G;

  /* ================================================================== */
  const ROLL_PRESETS = {
    fsae: { label: "Formula SAE", L: 1.55, wf: 0.47, tf: 1.22, tr: 1.18, ms: 230, musf: 25, musr: 25, hs: 0.30, hus: 0.23, hrcf: 0.03, hrcr: 0.06, Kphi: 700, rsf: 0.52, mu0: 1.6, s: 0.15 },
    club: { label: "Club racer", L: 2.45, wf: 0.52, tf: 1.50, tr: 1.50, ms: 630, musf: 60, musr: 60, hs: 0.42, hus: 0.30, hrcf: 0.05, hrcr: 0.10, Kphi: 1500, rsf: 0.58, mu0: 1.4, s: 0.12 },
    gt: { label: "GT car", L: 2.70, wf: 0.48, tf: 1.62, tr: 1.60, ms: 1150, musf: 75, musr: 75, hs: 0.47, hus: 0.33, hrcf: 0.06, hrcr: 0.12, Kphi: 3500, rsf: 0.55, mu0: 1.5, s: 0.12 }
  };

  RVD.widgets["roll-components"] = function (root) {
    const { controls, plots } = RVD.ui.layout(root);
    let base = ROLL_PRESETS[root.dataset.preset || "club"];

    const preset = RVD.ui.choice(controls, {
      value: root.dataset.preset || "club",
      options: Object.keys(ROLL_PRESETS).map((k) => ({ label: ROLL_PRESETS[k].label, value: k })),
      onInput: (k) => applyPreset(k)
    });
    const info = RVD.ui.h("p", "muted", controls);
    info.style.cssText = "font-size:13px;margin:0";

    RVD.ui.group(controls, "Cornering");
    const ay = RVD.ui.slider(controls, { label: "Lateral accel. ay", min: 0, max: 2, step: 0.05, value: 1.0, unit: "g", onInput: draw });
    RVD.ui.group(controls, "Suspension geometry");
    const cm = (v) => `${RVD.fmt(v * 100, 1)} cm`;
    const hf = RVD.ui.slider(controls, { label: "Front roll-center height", min: -0.05, max: 0.50, step: 0.005, value: base.hrcf, format: cm, onInput: draw });
    const hr = RVD.ui.slider(controls, { label: "Rear roll-center height", min: -0.05, max: 0.50, step: 0.005, value: base.hrcr, format: cm, onInput: draw });
    RVD.ui.group(controls, "Springs and anti-roll bars");
    const rsf = RVD.ui.slider(controls, { label: "Front roll-stiffness share", min: 25, max: 75, step: 1, value: base.rsf * 100, digits: 0, unit: "%", onInput: draw });
    const kphi = RVD.ui.slider(controls, { label: "Total roll stiffness", min: 300, max: 6000, step: 50, value: base.Kphi, digits: 0, unit: "N·m/deg", onInput: draw });

    const ro = RVD.ui.readouts(controls);
    const rShare = RVD.ui.readout(ro, "Front share of transfer");
    const rRoll = RVD.ui.readout(ro, "Body roll at this ay");
    const rGrad = RVD.ui.readout(ro, "Roll gradient");
    const rLim = RVD.ui.readout(ro, "Max lateral accel.");
    const status = RVD.ui.status(controls);

    // Side view
    const box1 = RVD.ui.h("div", null, plots);
    const p1 = RVD.plot(box1, { xlim: [-0.6, 3.1], ylim: [-0.05, 0.6], height: 250, fixedText: true, xlabel: "Distance from the rear axle (m)  → front", ylabel: "Height (m)" });
    RVD.legend(box1, [
      { label: "Roll axis", color: "var(--s2)" },
      { label: "Roll moment arm (sprung CG to roll axis)", color: "var(--s4)" }
    ]);
    const exag = RVD.ui.h("p", "muted", box1, "Height scale exaggerated.");
    exag.style.cssText = "font-size:13px;margin:2px 0 0";
    // Bars
    const box2 = RVD.ui.h("div", null, plots);
    const p2 = RVD.plot(box2, {
      fixedText: true,
      xlim: [0.4, 2.6], ylim: [0, 1500], height: 270, ylabel: "Wheel-load change ΔFz (N)",
      xfmt: (v) => (Math.abs(v - 1) < 1e-6 ? "Front axle" : Math.abs(v - 2) < 1e-6 ? "Rear axle" : "")
    });
    RVD.legend(box2, [
      { label: "Unsprung", color: "var(--s5)" },
      { label: "Geometric (through the links)", color: "var(--s2)" },
      { label: "Elastic (springs & bars)", color: "var(--s3)" },
      { label: "Lesson 3.1 simple model", color: "var(--text-muted)", dash: true }
    ]);

    function car() {
      return Object.assign({}, base, { hrcf: hf.value, hrcr: hr.value, rsf: rsf.value / 100, Kphi: kphi.value });
    }

    function applyPreset(k) {
      base = ROLL_PRESETS[k];
      hf.set(base.hrcf); hr.set(base.hrcr); rsf.set(base.rsf * 100); kphi.set(base.Kphi);
      draw();
    }

    function draw() {
      const c = car();
      const lt = RVD.roll.components(c, ay.value);
      const lt1 = RVD.roll.components(c, 1);
      info.textContent = `${RVD.fmt(c.ms + c.musf + c.musr, 0)} kg total (${c.musf + c.musr} kg unsprung), sprung CG ${RVD.fmt(c.hs * 100, 0)} cm high, wheelbase ${c.L} m, track ${c.tf}/${c.tr} m.`;

      // ---- side view (x from rear axle) ----
      p1.setLimits([-0.6, c.L + 0.6], [-0.05, Math.max(0.55, c.hs + 0.12)]);
      const xCG = c.L - lt.aS;
      p1.line("ground", [[-0.6, 0], [c.L + 0.6, 0]], "series series--thin cm");
      // Axle positions (wheels omitted: the vertical scale is exaggerated, so circles would look like ovals)
      p1.line("axR", [[0, 0], [0, c.hus]], "series series--thin series--dash cm");
      p1.line("axF", [[c.L, 0], [c.L, c.hus]], "series series--thin series--dash cm");
      p1.point("hubR", 0, c.hus, { cls: "fm", r: 4 });
      p1.point("hubF", c.L, c.hus, { cls: "fm", r: 4 });
      // axle labels sit inboard of the hubs, clear of the y-axis numbers and the plot edge
      p1.label("hubRL", 0, c.hus, "rear axle", { cls: "annot", dx: 7, dy: -8 });
      p1.label("hubFL", c.L, c.hus, "front axle", { cls: "annot", dx: -7, dy: -8, anchor: "end" });
      const slope = (c.hrcf - c.hrcr) / c.L;
      p1.line("axis", [[-0.4, c.hrcr - 0.4 * slope], [c.L + 0.4, c.hrcf + 0.4 * slope]], "series c2");
      p1.point("rcr", 0, c.hrcr, { cls: "f2", r: 5 });
      p1.point("rcf", c.L, c.hrcf, { cls: "f2", r: 5 });
      p1.label("rcrL", 0, c.hrcr, "rear RC", { cls: "annot f2", dx: 8, dy: 16 });
      p1.label("rcfL", c.L, c.hrcf, "front RC", { cls: "annot f2", dx: -8, dy: 16, anchor: "end" });
      p1.line("arm", [[xCG, lt.hra], [xCG, c.hs]], "series c4");
      p1.point("cg", xCG, c.hs, { cls: "f4", r: 6 });
      p1.label("cgL", xCG, c.hs, "sprung CG", { cls: "annot f4", dx: -9, dy: -6, anchor: "end" });
      p1.label("armL", xCG, (lt.hra + c.hs) / 2, `arm ${RVD.fmt((c.hs - lt.hra) * 100, 1)} cm`, { cls: "annot f4", dx: 8, dy: 4 });

      // ---- stacked bars ----
      const tot = (a) => a.unsprung + a.geometric + a.elastic;
      const totalAll = lt.front.total + lt.rear.total;
      const ymax = Math.max(200, Math.ceil((Math.max(Math.abs(lt.front.total), Math.abs(lt.rear.total), 1) * 1.3) / 200) * 200);
      p2.setLimits(null, [Math.min(0, Math.min(lt.front.geometric, lt.rear.geometric, lt.front.elastic, lt.rear.elastic) * 1.3), ymax]);
      const bar = (key, x, parts) => {
        let y0 = 0;
        parts.forEach(([name, v, cls]) => {
          const y1 = y0 + v;
          p2.area(`${key}-${name}`, [[x - 0.3, y0], [x + 0.3, y0], [x + 0.3, y1], [x - 0.3, y1]], cls);
          y0 = y1;
        });
        return y0;
      };
      const parts = (a) => [["u", a.unsprung, "f5 bar-solid"], ["g", a.geometric, "f2 bar-solid"], ["e", a.elastic, "f3 bar-solid"]];
      const tf = bar("F", 1, parts(lt.front)), tr = bar("R", 2, parts(lt.rear));
      // Totals sit in the middle of the (largest) elastic segment, clear of the dashed comparison lines.
      const mid = (a) => a.unsprung + a.geometric + a.elastic / 2;
      p2.label("tF", 1, mid(lt.front), `total ${RVD.fmt(tf, 0)} N`, { anchor: "middle", dy: 5, cls: "annot bar-label" });
      p2.label("tR", 2, mid(lt.rear), `total ${RVD.fmt(tr, 0)} N`, { anchor: "middle", dy: 5, cls: "annot bar-label" });
      // Lesson 3.1 comparison: total m ay h / t split purely by roll stiffness share
      const simpleF = c.rsf * totalAll, simpleR = (1 - c.rsf) * totalAll;
      p2.line("sF", [[0.62, simpleF], [1.38, simpleF]], "series series--thin series--dash cm", { top: true });
      p2.line("sR", [[1.62, simpleR], [2.38, simpleR]], "series series--thin series--dash cm", { top: true });

      // ---- readouts ----
      const share = totalAll > 0 ? lt.front.total / totalAll : c.rsf;
      rShare.set(`${RVD.fmt(share * 100, 1)}% (simple model ${RVD.fmt(c.rsf * 100, 0)}%)`);
      rRoll.set(`${RVD.fmt(lt.rollDeg, 2)}°`);
      rGrad.set(`${RVD.fmt(lt1.rollDeg, 2)}°/g`);
      const lim = RVD.roll.limit(c);
      rLim.set(`${RVD.fmt(lim.ay, 2)} g`, lim.ay < ay.value ? "bad" : null);

      if (lt.hra >= c.hs) status.set("The roll axis is at or above the sprung CG: there is no roll moment left, so the body does not roll (or leans into the turn). The links carry all the transfer, and the lateral forces jack the car up.", "warn");
      else if (lim.axle === "front") status.set(`Front axle saturates first at ${RVD.fmt(lim.ay, 2)} g → limit understeer.`, "warn");
      else if (lim.axle === "rear") status.set(`Rear axle saturates first at ${RVD.fmt(lim.ay, 2)} g → limit oversteer.`, "bad");
      else status.set(`Both axles saturate together at ${RVD.fmt(lim.ay, 2)} g → neutral at the limit.`, "ok");
    }
    applyPreset(preset.value);
  };

  /* ================================================================== */
  const BRAKE_PRESETS = {
    fsae: { label: "Formula SAE", wf: 0.47, h: 0.28, L: 1.55, mass: 280 },
    club: { label: "Club racer", wf: 0.52, h: 0.40, L: 2.45, mass: 750 },
    gt: { label: "GT car", wf: 0.48, h: 0.45, L: 2.70, mass: 1300 }
  };

  // Sutherland–Hodgman: keep the part of a convex polygon where fn(q) > 0.
  function clipHalfPlane(poly, fn) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const A = poly[i], Bq = poly[(i + 1) % poly.length];
      const fa = fn(A), fb = fn(Bq);
      if (fa > 0) out.push(A);
      if ((fa > 0) !== (fb > 0)) {
        const t = fa / (fa - fb);
        out.push([A[0] + t * (Bq[0] - A[0]), A[1] + t * (Bq[1] - A[1])]);
      }
    }
    return out;
  }

  RVD.widgets["brake-balance"] = function (root) {
    const { controls, plots } = RVD.ui.layout(root);
    const B = RVD.brakes;
    let car = BRAKE_PRESETS.club;

    const preset = RVD.ui.choice(controls, {
      value: "club", options: Object.keys(BRAKE_PRESETS).map((k) => ({ label: BRAKE_PRESETS[k].label, value: k })),
      onInput: (k) => { car = BRAKE_PRESETS[k]; wf.set(car.wf * 100); h.set(car.h); draw(); }
    });
    RVD.ui.group(controls, "Car and track");
    const wf = RVD.ui.slider(controls, { label: "Static front weight", min: 35, max: 65, step: 1, value: 52, digits: 0, unit: "%", onInput: draw });
    const h = RVD.ui.slider(controls, { label: "CG height h", min: 0.15, max: 0.65, step: 0.01, value: 0.40, unit: "m", onInput: draw });
    const mu = RVD.ui.slider(controls, { label: "Tire grip μ", min: 0.5, max: 1.8, step: 0.05, value: 1.4, onInput: draw });
    const surf = RVD.ui.h("div", "btn-row", controls);
    RVD.ui.button(surf, "Dry (μ 1.4)", () => { mu.set(1.4); draw(); });
    RVD.ui.button(surf, "Wet (μ 0.8)", () => { mu.set(0.8); draw(); });
    RVD.ui.group(controls, "Brakes");
    const bias = RVD.ui.slider(controls, { label: "Brake bias (front share)", min: 40, max: 90, step: 0.5, value: 68, digits: 1, unit: "%", onInput: draw });
    const pedal = RVD.ui.slider(controls, { label: "Pedal: deceleration asked for", min: 0, max: 1.8, step: 0.02, value: 0.8, unit: "g", onInput: draw });

    const ro = RVD.ui.readouts(controls);
    const rIdeal = RVD.ui.readout(ro, "Ideal bias at this μ");
    const rMax = RVD.ui.readout(ro, "Max decel. with your bias");
    const rFirst = RVD.ui.readout(ro, "Locks first");
    const rLoads = RVD.ui.readout(ro, "Axle loads now (F / R)");
    const status = RVD.ui.status(controls);

    const box = RVD.ui.h("div", "brake-plot-row", plots);
    const pbox = RVD.ui.h("div", null, box);
    const p = RVD.plot(pbox, {
      xlim: [0, 1.4], ylim: [0, 0.8], height: 380, width: 520, fixedText: true,
      onTextScale: () => draw(),
      xlabel: "Front braking force ÷ weight", ylabel: "Rear braking force ÷ weight"
    });
    RVD.legend(pbox, [
      { label: "Ideal (both axles at their limit together)", color: "var(--s1)" },
      { label: "Front-lock line", color: "var(--s2)" },
      { label: "Rear-lock line", color: "var(--s4)" },
      { label: "Fronts locked", color: "var(--s2)", area: true },
      { label: "Rears locked", color: "var(--s4)", area: true },
      { label: "Your bias line", color: "var(--s3)" },
      { label: "Constant deceleration", color: "var(--text-muted)", dash: true }
    ]);

    // Mini top view of the car showing locked wheels
    const cbox = RVD.ui.h("div", "brake-car", box);
    const csvg = svgEl("svg", { viewBox: "0 0 130 248", role: "img", "aria-label": "Top view showing which wheels are locked" }, cbox);
    svgEl("rect", { x: 35, y: 30, width: 60, height: 170, rx: 22, class: "bk-body" }, csvg);
    svgEl("text", { x: 65, y: 18, "text-anchor": "middle", class: "bk-label" }, csvg).textContent = "front";
    const wheel = (x, y) => svgEl("rect", { x: x - 8, y: y - 17, width: 16, height: 34, rx: 4, class: "bk-wheel" }, csvg);
    const wheels = { front: [wheel(28, 62), wheel(102, 62)], rear: [wheel(28, 168), wheel(102, 168)] };
    const conseq = [222, 238].map((y) => svgEl("text", { x: 65, y, "text-anchor": "middle", class: "bk-label" }, csvg));

    let decelKeys = new Set();
    function draw() {
      const w = wf.value / 100, hL = h.value / car.L, m = mu.value, beta = bias.value / 100;
      const lock = B.lockDecel(w, hL, m, beta);
      const xmax = Math.max(1.0, Math.ceil(m * (w + m * hL) * 1.2 * 10) / 10);
      const ymax = Math.max(0.5, Math.ceil(m * (1 - w) * 1.15 * 10) / 10);
      p.setLimits([0, xmax], [0, ymax]);

      // Lock-up regions. A point (Bf, Br) is a braking demand at deceleration Bf + Br.
      // Fronts lock where Bf > mu*Nf:  Bf(1 - mu hL) - mu hL Br - mu w > 0
      // Rears lock where Br > mu*Nr:   Br(1 + mu hL) + mu hL Bf - mu (1 - w) > 0
      // Each region is the plot rectangle clipped to that half-plane; where they overlap, all four lock.
      const fLock = (q) => q[0] * (1 - m * hL) - m * hL * q[1] - m * w;
      const rLock = (q) => q[1] * (1 + m * hL) + m * hL * q[0] - m * (1 - w);
      const rect = [[0, 0], [xmax, 0], [xmax, ymax], [0, ymax]];
      const neg = (fn) => (q) => -fn(q);
      const fPoly = clipHalfPlane(rect, fLock), rPoly = clipHalfPlane(rect, rLock);
      if (fPoly.length > 2) p.area("fReg", fPoly, "f2"); else p.remove("fReg");
      if (rPoly.length > 2) p.area("rReg", rPoly, "f4"); else p.remove("rReg");
      // Region labels hug a plot edge, starting in a corner and sliding along the edge until the
      // whole label fits inside its region without crossing the bias line. No fit, no label.
      const inF = (q) => fLock(q) > 0, inR = (q) => rLock(q) > 0;
      const biasSide = (q) => Math.sign(q[1] * beta - q[0] * (1 - beta));
      const toX = (px) => (xmax * (px - p.sx(0))) / (p.sx(xmax) - p.sx(0));
      const toY = (py) => (ymax * (py - p.sy(0))) / (p.sy(ymax) - p.sy(0));
      const k = p.textScale;   // offsets are in screen px, the plot's text may be scaled
      const placeLabel = (key, text, cls, x, anchor, dx, dy, fromTop, test) => {
        // Try the label on one line first, then wrapped onto two (narrow screens).
        const words = text.split(" ");
        for (const lines of [[text], [words[0], words.slice(1).join(" ")]]) {
          for (let i = 0; i <= 36; i++) {
            const y = fromTop ? ymax * (1 - i / 40) : (ymax * i) / 40;
            // A two-line label growing upward from the bottom edge starts one line higher.
            const lift = !fromTop && lines.length > 1 ? -14 : 0;
            const t = p.label(key, x, y, "", { cls: "annot " + cls, anchor, dx: dx * k, dy: (dy + lift) * k });
            lines.forEach((ln, j) => {
              const ts = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
              ts.setAttribute("x", t.getAttribute("x"));
              if (j) ts.setAttribute("dy", "1.15em");
              ts.textContent = ln;
              t.appendChild(ts);
            });
            let b;
            try { b = t.getBBox(); } catch (e) { return; }
            if (!b.width) return;
            const pad = 4 * k;   // keep a little clear space between the label and the lines
            const x0 = b.x - pad, x1 = b.x + b.width + pad, y0 = b.y - pad, y1 = b.y + b.height + pad;
            const pts = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([px, py]) => [toX(px), toY(py)]);
            const side = biasSide(pts[0]);
            if (pts.every((q) => test(q) && biasSide(q) === side)) return;
          }
        }
        p.remove(key);
      };
      placeLabel("rRegL", "rears locked", "f4", 0, "start", 8, 18, true, (q) => inR(q) && !inF(q));
      placeLabel("fRegL", "fronts locked", "f2", xmax, "end", -8, -24, false, (q) => inF(q) && !inR(q));
      placeLabel("bRegL", "all locked", "f2", xmax, "end", -8, 18, true, (q) => inF(q) && inR(q));

      // Constant-deceleration lines Bf + Br = a, every 0.25 g. Labelled every 0.5 g on big plots
      // and every 0.25 g on small (low-grip) ones. Lines from a previous, larger scale are removed.
      const labelStep = xmax > 1.2 ? 0.5 : 0.25;
      const flX0 = (m * w) / (1 - m * hL);   // where the front-lock line meets the x-axis
      const keep = new Set();
      for (let i = 1; 0.25 * i <= xmax + ymax + 1e-9; i++) {
        const a = 0.25 * i, key = "d" + a.toFixed(2);
        keep.add(key);
        p.line(key, [[0, a], [a, 0]], "series series--thin series--dash cm");
        const txt = `${RVD.fmt(a, labelStep < 0.5 && i % 2 ? 2 : 1)} g`;
        if (Math.abs(a / labelStep - Math.round(a / labelStep)) > 1e-9) continue;
        // Label to the right of its line, or to the left if the front-lock line runs through it.
        // On the left, step back far enough that the up-and-left dashed line clears the text.
        const pxX = p.sx(xmax) / xmax, pxY = (p.sy(0) - p.sy(ymax)) / ymax;
        const pad = (3 * p.textScale) / pxX, textH = (16 * p.textScale) / pxY;
        const back = 2 * p.textScale + textH * pxX;
        const lw = ((txt.length * 7 + 4) * p.textScale) / pxX;
        // The front-lock line leans right as it rises, so it spans [flX0, flX1] over the label's height.
        const flX1 = flX0 + (m * hL * textH) / (1 - m * hL);
        const hitsLock = (x0, x1) => flX1 + pad > x0 && flX0 - pad < x1;
        if (a + lw > xmax) continue;
        const side = !hitsLock(a, a + lw) ? 1 : a - lw - back / pxX >= 0 && !hitsLock(a - lw - back / pxX, a) ? -1 : 0;
        if (side) {
          p.label(key + "L", a, 0, txt, { cls: "annot", anchor: side > 0 ? "start" : "end", dx: side > 0 ? 2 * p.textScale : -back, dy: -4 * p.textScale });
          keep.add(key + "L");
        }
      }
      decelKeys.forEach((key) => { if (!keep.has(key)) p.remove(key); });
      decelKeys = keep;
      // Ideal curve
      const ideal = [];
      for (let a = 0; a <= Math.min(m, (1 - w) / hL) + 1e-9; a += m / 80) ideal.push([a * (w + a * hL), a * (1 - w - a * hL)]);
      p.line("ideal", ideal, "series c1");
      p.point("idealPt", m * (w + m * hL), m * (1 - w - m * hL), { cls: "f1", r: 5 });
      // Front lock line: Br = (Bf (1 - mu hL) - mu w) / (mu hL)
      // It is straight, so draw it from the x-axis to the top of the plot.
      const bfAt = (br) => (m * hL * br + m * w) / (1 - m * hL);
      p.line("fl", [[bfAt(0), 0], [bfAt(ymax), ymax]], "series c2");
      // Rear lock line: Br = (mu (1 - w) - mu hL Bf) / (1 + mu hL)
      p.line("rl", [[0, (m * (1 - w)) / (1 + m * hL)], [xmax, (m * (1 - w) - m * hL * xmax) / (1 + m * hL)]], "series c4");
      // Bias line
      const reach = xmax + ymax;
      p.line("bias", [[0, 0], [beta * reach, (1 - beta) * reach]], "series series--thin c3");
      // Lock points on the bias line
      [["front", lock.front, "f2"], ["rear", lock.rear, "f4"]].forEach(([k, a, cls]) => {
        if (isFinite(a) && beta * a <= xmax && (1 - beta) * a <= ymax) p.point("lp" + k, beta * a, (1 - beta) * a, { cls, r: 4 });
        else p.remove("lp" + k);
      });
      // Operating point
      const ask = pedal.value, got = Math.min(ask, lock.max);
      const locked = ask > lock.max + 1e-9 ? lock.first : null;
      p.point("op", beta * got, (1 - beta) * got, { cls: locked ? "f2" : "f3", r: 7 });

      // Readouts
      const ideal100 = B.idealBias(w, hL, m) * 100;
      rIdeal.set(`${RVD.fmt(ideal100, 1)}% front`);
      rMax.set(`${RVD.fmt(lock.max, 2)} g`, Math.abs(lock.max - m) < 0.01 ? "ok" : null);
      rFirst.set(lock.first === "both" ? "both together" : lock.first === "front" ? "front axle" : "rear axle", lock.first === "rear" ? "bad" : lock.first === "front" ? "warn" : "ok");
      const loads = B.axleLoads(w, hL, got);
      rLoads.set(`${RVD.fmt(loads.front * 100, 0)}% / ${RVD.fmt(loads.rear * 100, 0)}%`);

      // Car picture
      ["front", "rear"].forEach((ax) => wheels[ax].forEach((el) => el.setAttribute("class", "bk-wheel" + (locked && (locked === ax || locked === "both") ? " is-locked" : ""))));
      const caption = !locked ? ["rolling", ""] : locked === "rear" ? ["rears locked:", "spin risk"] : locked === "front" ? ["fronts locked:", "no steering"] : ["all locked", ""];
      conseq.forEach((t, i) => (t.textContent = caption[i]));

      // Status
      if (locked === "rear") status.set(`The rear wheels lock at ${RVD.fmt(lock.max, 2)} g. A car with locked rears loses its rear lateral grip and tends to spin (Lesson 2.3). Move the bias forward.`, "bad");
      else if (locked === "front") status.set(`The front wheels lock at ${RVD.fmt(lock.max, 2)} g. The car stays straight and stable but cannot steer. Release a little, or move the bias rearward toward ${RVD.fmt(ideal100, 0)}%.`, "warn");
      else if (locked === "both") status.set("Both axles lock together: you have found the ideal bias for this grip level.", "ok");
      else status.set(`Braking at ${RVD.fmt(got, 2)} g with all wheels rolling. Ask for more to find which axle locks first (at ${RVD.fmt(lock.max, 2)} g).`, "ok");
    }
    draw();
  };
})();
