/*
 * Lesson 2.4 widgets (need models/tire.js)
 *   tire-window : how camber, inflation pressure and temperature move a tire in
 *                 or out of its operating window. ILLUSTRATIVE curves only —
 *                 shaped like typical race-tire behavior, not data for a real tire.
 *   tire-fit    : fit a simplified Magic Formula to synthetic "test data" at three
 *                 loads, and view the data raw or normalized (Fy / Fz).
 */
(function () {
  const RVD = window.RVD;
  const T = RVD.tire;

  /* ---------------- illustrative grip factors ---------------- */
  const COMPOUNDS = {
    soft: { label: "Soft compound", mu0: 1.65, tOpt: 80, tWidth: 35 },
    hard: { label: "Hard compound", mu0: 1.50, tOpt: 105, tWidth: 45 }
  };
  const GAMMA_OPT = -1.0;   // best camber of the loaded tire, deg
  const P_OPT = 140;        // best hot pressure, kPa

  const fCamber = (g) => Math.max(0.6, 1 - 0.012 * (g - GAMMA_OPT) ** 2);
  const fPressure = (pk) => Math.max(0.6, 1 - 0.00002 * (pk - P_OPT) ** 2);
  const fTemp = (t, c) => 1 - 0.5 * (1 - Math.exp(-(((t - c.tOpt) / c.tWidth) ** 2)));
  RVD.tireWindow = { fCamber, fPressure, fTemp, COMPOUNDS, GAMMA_OPT, P_OPT };

  RVD.widgets["tire-window"] = function (root) {
    const { controls, plots } = RVD.ui.layout(root, { plots: 3 });

    const compound = RVD.ui.choice(controls, {
      value: "soft",
      options: Object.keys(COMPOUNDS).map((k) => ({ label: COMPOUNDS[k].label, value: k })),
      onInput: draw
    });
    RVD.ui.group(controls, "Camber");
    const gStatic = RVD.ui.slider(controls, { label: "Static camber", min: -5, max: 2, step: 0.1, value: 0, digits: 1, unit: "deg", onInput: draw });
    const gRoll = RVD.ui.slider(controls, { label: "Camber change at the limit (outside tire)", min: 0, max: 4, step: 0.1, value: 1.5, digits: 1, unit: "deg", onInput: draw });
    RVD.ui.group(controls, "Pressure and temperature");
    const press = RVD.ui.slider(controls, {
      label: "Hot inflation pressure", min: 80, max: 250, step: 5, value: 170,
      format: (v) => `${RVD.fmt(v, 0)} kPa (${RVD.fmt(v * 0.145, 1)} psi)`, onInput: draw
    });
    const temp = RVD.ui.slider(controls, { label: "Tread temperature", min: 20, max: 150, step: 1, value: 60, digits: 0, unit: "°C", onInput: draw });

    const ro = RVD.ui.readouts(controls);
    const rG = RVD.ui.readout(ro, "Outside-tire camber at limit");
    const rMu = RVD.ui.readout(ro, "Peak μ");
    const rLoss = RVD.ui.readout(ro, "Grip left on the table");
    const status = RVD.ui.status(controls);

    const mk = (xlim, xlabel) => {
      const box = RVD.ui.h("div", null, plots);
      return RVD.plot(box, { xlim, ylim: [0.5, 1.02], width: 320, height: 230, xlabel, ylabel: "Grip factor", yticks: 4, margin: { l: 48 } });
    };
    const pc = mk([-5, 3], "Camber at the limit (deg)");
    const pp = mk([80, 250], "Hot pressure (kPa)");
    const pt = mk([20, 150], "Tread temperature (°C)");
    const note = RVD.ui.h("p", "muted", plots, "Illustrative curves showing typical trends. Real windows come from tire testing and differ for every tire.");
    note.style.cssText = "font-size:13px;margin:0;grid-column:1/-1";

    function curve(fn, x0, x1) {
      const pts = [];
      for (let i = 0; i <= 120; i++) { const x = x0 + ((x1 - x0) * i) / 120; pts.push([x, fn(x)]); }
      return pts;
    }

    function draw() {
      const c = COMPOUNDS[compound.value];
      const gEff = gStatic.value + gRoll.value;
      const fc = fCamber(gEff), fp = fPressure(press.value), ft = fTemp(temp.value, c);

      pc.line("c", curve(fCamber, -5, 3), "series c1");
      pc.point("m", gEff, fc, { cls: "f2", r: 6 });
      pp.line("c", curve(fPressure, 80, 250), "series c1");
      pp.point("m", press.value, fp, { cls: "f2", r: 6 });
      pt.line("c", curve((t) => fTemp(t, c), 20, 150), "series c1");
      pt.point("m", temp.value, ft, { cls: "f2", r: 6 });

      const mu = c.mu0 * fc * fp * ft;
      rG.set(RVD.fmt(gEff, 1) + "°");
      rMu.set(RVD.fmt(mu, 2));
      const loss = 1 - fc * fp * ft;
      rLoss.set(RVD.fmt(loss * 100, 0) + "%", loss > 0.15 ? "bad" : loss > 0.05 ? "warn" : "ok");

      const worst = [["camber", fc], ["pressure", fp], ["temperature", ft]].sort((x, y) => x[1] - y[1])[0];
      if (loss < 0.03) status.set("In the window: camber, pressure and temperature are all close to optimum.", "ok");
      else status.set(`Biggest loss: ${worst[0]} (${RVD.fmt((1 - worst[1]) * 100, 0)}% of peak grip).`, loss > 0.15 ? "bad" : "warn");
    }
    draw();
  };

  /* ---------------- tire-fit ---------------- */
  // Hidden "true" tire used to generate the synthetic test data.
  const TRUE = T.params({ mu0: 1.55, s: 0.12, CC: 0.45, C: 1.35, E: -0.6 });
  const LOADS = [1500, 3000, 4500];

  function rng(seed) {   // mulberry32, deterministic so every student sees the same data
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const DATA = {};
  LOADS.forEach((Fz, j) => {
    const rand = rng(1234 + j), pr = Object.assign({}, TRUE, { Fz });
    const peak = T.peak(Fz, TRUE.mu0, TRUE.s, TRUE.Fz0);
    DATA[Fz] = [];
    for (let a = 0.5; a <= 14.01; a += 0.5) DATA[Fz].push([a, T.fy(a, pr) + (rand() - 0.5) * 0.05 * peak]);
  });
  function bestFit(Fz) {
    const lf = 1 - (TRUE.s * (Fz - TRUE.Fz0)) / TRUE.Fz0;
    return { mu: T.mu(Fz, TRUE.mu0, TRUE.s, TRUE.Fz0), CC: TRUE.CC * lf, C: TRUE.C, E: TRUE.E };
  }
  RVD.tireFit = { DATA, LOADS, bestFit };

  RVD.widgets["tire-fit"] = function (root) {
    const { controls, plots } = RVD.ui.layout(root);

    RVD.ui.group(controls, "Data set to fit");
    const load = RVD.ui.choice(controls, {
      value: 3000, options: LOADS.map((F) => ({ label: `${F} N`, value: F })), onInput: draw
    });
    const view = RVD.ui.choice(controls, {
      value: "raw", options: [{ label: "Raw Fy", value: "raw" }, { label: "Normalized Fy/Fz", value: "norm" }], onInput: draw
    });
    RVD.ui.group(controls, "Your Magic Formula");
    const mu = RVD.ui.slider(controls, { label: "Peak μ  (D = μ Fz)", min: 0.8, max: 2.2, step: 0.01, value: 1.2, onInput: draw });
    const CC = RVD.ui.slider(controls, { label: "Cornering stiffness coeff.", min: 0.15, max: 0.8, step: 0.005, value: 0.3, digits: 3, unit: "/deg", onInput: draw });
    const C = RVD.ui.slider(controls, { label: "Shape factor C", min: 1.0, max: 1.8, step: 0.01, value: 1.6, onInput: draw });
    const E = RVD.ui.slider(controls, { label: "Curvature factor E", min: -3, max: 0.8, step: 0.05, value: 0.3, onInput: draw });
    const btns = RVD.ui.h("div", "btn-row", controls);
    RVD.ui.button(btns, "Reveal best fit", () => {
      const b = bestFit(load.value);
      mu.set(+b.mu.toFixed(2)); CC.set(+b.CC.toFixed(3)); C.set(b.C); E.set(b.E); draw();
    });

    const ro = RVD.ui.readouts(controls);
    const rRms = RVD.ui.readout(ro, "RMS error");
    const rPct = RVD.ui.readout(ro, "… as % of peak");
    const status = RVD.ui.status(controls);

    const p = RVD.plot(plots, { xlim: [0, 15], ylim: [0, 7000], height: 340, xlabel: "Slip angle α (deg)", ylabel: "Lateral force Fy (N)" });
    RVD.legend(plots, [
      { label: "1500 N data", color: "var(--s3)" },
      { label: "3000 N data", color: "var(--s1)" },
      { label: "4500 N data", color: "var(--s4)" },
      { label: "Your fit", color: "var(--s2)" }
    ]);
    const cls = { 1500: "f3", 3000: "f1", 4500: "f4" };

    function draw() {
      const norm = view.value === "norm";
      p.setLabels(null, norm ? "Normalized force Fy / Fz" : "Lateral force Fy (N)");
      p.setLimits(null, norm ? [0, 2] : [0, 7000]);
      const scale = (Fz) => (norm ? 1 / Fz : 1);

      LOADS.forEach((Fz) => {
        DATA[Fz].forEach(([a, f], i) => {
          const n = p.point(`d${Fz}-${i}`, a, f * scale(Fz), { cls: cls[Fz], r: Fz === load.value ? 4 : 3 });
          n.style.opacity = Fz === load.value ? 1 : 0.45;
        });
      });

      const Fz = load.value;
      const pr = T.params({ Fz, Fz0: Fz, s: 0, mu0: mu.value, CC: CC.value, C: C.value, E: E.value });
      const fit = [];
      for (let a = 0; a <= 15.0001; a += 0.1) fit.push([a, T.fy(a, pr) * scale(Fz)]);
      p.line("fit", fit, "series c2", { top: true });

      let se = 0;
      DATA[Fz].forEach(([a, f]) => { se += (T.fy(a, pr) - f) ** 2; });
      const rms = Math.sqrt(se / DATA[Fz].length);
      const peak = Math.max(...DATA[Fz].map((d) => d[1]));
      const pct = (rms / peak) * 100;
      rRms.set(RVD.fmt(rms, 0) + " N", pct < 2 ? "ok" : pct < 6 ? "warn" : "bad");
      rPct.set(RVD.fmt(pct, 1) + "%");
      if (pct < 2) status.set("Excellent fit — the remaining error is about the size of the measurement noise.", "ok");
      else if (pct < 6) status.set("Close. Fine-tune the shape (C) and curvature (E) near the peak.", "warn");
      else status.set("Start with the two physical numbers: the peak (μ) and the initial slope (cornering stiffness).", "bad");
    }
    draw();
  };
})();
