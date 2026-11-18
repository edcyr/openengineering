/*
 * Module 6 widgets (linear two-degree-of-freedom bicycle model in assets/js/models/bicycle.js, SAE signs)
 *   phase-portrait : sideslip / yaw-rate trajectories after a disturbance, and the modes vs speed   (6.1)
 *   step-steer     : step-steer response simulated with Euler or RK4 and a chosen time step       (6.2)
 */
(function () {
  const RVD = window.RVD;
  const B = RVD.bicycle;
  const RAD = Math.PI / 180, KMH = 3.6, G = 9.81;
  const presetOptions = Object.keys(B.presets).map((k) => ({ label: B.presets[k].label, value: k }));
  const placeLabel = RVD.place.near;

  // Shared car controls: preset, axle cornering stiffness, dynamic index, speed.
  function carControls(controls, onChange, speed) {
    let base = B.presets.club;
    const ctl = {};
    RVD.ui.choice(controls, {
      value: "club", options: presetOptions,
      onInput: (k) => { base = B.presets[k]; ctl.cf.set(base.CfDeg); ctl.cr.set(base.CrDeg); ctl.di.set(base.DI); onChange(); }
    });
    RVD.ui.group(controls, "Car");
    ctl.cf = RVD.ui.slider(controls, { label: "Front axle cornering stiffness Cf", min: 400, max: 5000, step: 50, value: base.CfDeg, digits: 0, unit: "N/deg", onInput: onChange });
    ctl.cr = RVD.ui.slider(controls, { label: "Rear axle cornering stiffness Cr", min: 400, max: 5000, step: 50, value: base.CrDeg, digits: 0, unit: "N/deg", onInput: onChange });
    ctl.di = RVD.ui.slider(controls, { label: "Dynamic index k²/(ab)", min: 0.6, max: 1.3, step: 0.05, value: base.DI, onInput: onChange });
    ctl.V = RVD.ui.slider(controls, { label: "Speed V", min: 10, max: 300, step: 5, value: speed, digits: 0, unit: "km/h", onInput: onChange });
    ctl.car = () => B.axleCar(Object.assign({}, base, { CfDeg: ctl.cf.value, CrDeg: ctl.cr.value, DI: ctl.di.value }));
    return ctl;
  }

  /* ------------------------------------------------------------------ */
  /* 6.1  Phase portrait and modes vs speed                               */
  /* ------------------------------------------------------------------ */
  RVD.widgets["phase-portrait"] = function (root) {
    const { controls, plots } = RVD.ui.layout(root, { plots: 2 });
    const ctl = carControls(controls, draw, 90);
    const dl = RVD.ui.slider(controls, { label: "Steer δ (held fixed)", min: -2, max: 2, step: 0.1, value: 0, digits: 1, unit: "°", onInput: draw });

    const ro = RVD.ui.readouts(controls);
    const rWn = RVD.ui.readout(ro, "Natural frequency");
    const rZ = RVD.ui.readout(ro, "Damping ratio ζ");
    const rT = RVD.ui.readout(ro, "Time for a disturbance to halve");
    const rS = RVD.ui.readout(ro, "Stability");
    const status = RVD.ui.status(controls);

    const box1 = RVD.ui.h("div", null, plots);
    const p1 = RVD.plot(box1, {
      xlim: [-4, 4], ylim: [-20, 20], height: 320, fixedText: true, onTextScale: () => draw(),
      xlabel: "Sideslip β (deg)", ylabel: "Yaw rate r (deg/s)"
    });
    RVD.legend(box1, [
      { label: "Paths after a disturbance", color: "var(--s1)" },
      { label: "Steady state", color: "var(--s2)", dot: true }
    ]);
    const box2 = RVD.ui.h("div", null, plots);
    const p2 = RVD.plot(box2, {
      xlim: [-40, 5], ylim: [-20, 20], height: 320, fixedText: true, onTextScale: () => draw(),
      xlabel: "Real part (1/s): decay rate", ylabel: "Imaginary part (rad/s)"
    });
    RVD.legend(box2, [
      { label: "Modes from 10 to 300 km/h", color: "var(--s4)" },
      { label: "At your speed", color: "var(--s2)", dot: true },
      { label: "Unstable side", color: "var(--s2)", area: true }
    ]);
    let nTraj = 0, nSeg = 0;

    function draw() {
      const p = ctl.car(), Vk = ctl.V.value, V = Vk / KMH;
      const sys = B.linearSystem(p, V), md = B.modes(sys);
      const xs = B.steadyState(sys, dl.value * RAD);
      const bs = xs[0] / RAD, rs = xs[1] / RAD;

      // Phase plane around the steady state
      const dB = 3, dR = 15;
      p1.setLimits([bs - 1.4 * dB, bs + 1.4 * dB], [rs - 1.4 * dR, rs + 1.4 * dR]);
      p1.line("hz", [[bs - 2 * dB, rs], [bs + 2 * dB, rs]], "series series--thin cm");
      p1.line("vt", [[bs, rs - 2 * dR], [bs, rs + 2 * dR]], "series series--thin cm");
      const arrow = p1.arrow("f1");
      for (let i = 0; i < nTraj; i++) { p1.remove("tr" + i); p1.remove("ta" + i); }
      const starts = [];
      for (let k = 0; k < 8; k++) { const th = (k / 8) * 2 * Math.PI + 0.2; starts.push([bs + dB * Math.cos(th), rs + dR * Math.sin(th)]); }
      nTraj = starts.length;
      const T = Math.min(4, Math.max(0.6, 5 / Math.max(0.5, Math.abs(md.complex ? md.re : Math.max(...md.lambdas.map((l) => l[0]))))));
      starts.forEach(([b0, r0], i) => {
        const sim = B.simulate(sys, () => dl.value * RAD, { h: 0.002, T, x0: [b0 * RAD, r0 * RAD] });
        const pts = sim.t.map((_, j) => [sim.beta[j] / RAD, sim.r[j] / RAD]).filter((q) => Math.abs(q[0] - bs) < 4 * dB && Math.abs(q[1] - rs) < 4 * dR);
        p1.line("tr" + i, pts, "series series--thin c1");
        // Arrowhead part-way along the path (arc length measured in plot-scaled units)
        let Ltot = 0; const cum = [0];
        for (let j = 1; j < pts.length; j++) { Ltot += Math.hypot((pts[j][0] - pts[j - 1][0]) / dB, (pts[j][1] - pts[j - 1][1]) / dR); cum.push(Ltot); }
        let ja = cum.findIndex((c) => c >= 0.4 * Ltot);
        if (ja < 1) ja = 1;
        if (pts.length > 1) p1.line("ta" + i, [pts[ja - 1], pts[ja]], "series series--thin c1", { markerEnd: arrow });
        p1.point("s" + i, b0, r0, { cls: "f1", r: 3 });
      });
      p1.point("eq", bs, rs, { cls: "f2", r: 6 });

      // Modes vs speed
      // Each pair of branches (real or complex) is a separate segment; where they switch, both meet at the
      // double root found by bisection on speed, so the paths join without a gap.
      const modeAt = (s) => B.modes(B.linearSystem(p, s / KMH));
      function joinPoint(s0, s1) {
        const c0 = modeAt(s0).complex;
        let lo = s0, hi = s1;
        for (let it = 0; it < 40; it++) { const mid = (lo + hi) / 2; if (modeAt(mid).complex === c0) lo = mid; else hi = mid; }
        return [modeAt((lo + hi) / 2).tr / 2, 0];
      }
      const segs = [];
      let cur = null, prevM = null, prevS = 0, minRe = 0, maxRe = 0, maxIm = 0;
      for (let s = 10; s <= 300; s += 1) {
        const m = modeAt(s);
        if (!cur || m.complex !== prevM.complex) {
          const jp = cur ? joinPoint(prevS, s) : null;
          if (jp) cur.forEach((sg) => sg.push(jp));
          cur = [[], []];
          if (jp) cur.forEach((sg) => sg.push(jp));
          segs.push(cur[0], cur[1]);
        }
        if (m.complex) { cur[0].push([m.re, m.im]); cur[1].push([m.re, -m.im]); }
        else { cur[0].push([m.lambdas[0][0], 0]); cur[1].push([m.lambdas[1][0], 0]); }
        m.lambdas.forEach(([r, i]) => { minRe = Math.min(minRe, r); maxRe = Math.max(maxRe, r); maxIm = Math.max(maxIm, Math.abs(i)); });
        prevM = m; prevS = s;
      }
      // Keep the plot readable: show decay rates down to the value at about 30 km/h.
      const m30 = B.modes(B.linearSystem(p, 30 / KMH));
      const xLo = Math.max(minRe, Math.min(...m30.lambdas.map((l) => l[0])) * 1.1);
      const xHi = Math.max(3, maxRe * 1.3);
      const yHi = Math.max(5, Math.ceil(maxIm * 1.3 / 5) * 5);
      p2.setLimits([xLo, xHi], [-yHi, yHi]);
      p2.area("rhp", [[0, -yHi], [xHi, -yHi], [xHi, yHi], [0, yHi]], "f2");
      p2.line("ax", [[xLo, 0], [xHi, 0]], "series series--thin cm");
      p2.line("im", [[0, -yHi], [0, yHi]], "series series--thin cm");
      for (let i = 0; i < nSeg; i++) p2.remove("sg" + i);
      segs.forEach((sg, i) => p2.line("sg" + i, sg, "series c4"));
      nSeg = segs.length;
      md.lambdas.forEach(([r, i], k) => p2.point("e" + k, Math.min(Math.max(r, xLo), xHi), i, { cls: "f2", r: 6 }));
      p2.remove("eL");
      placeLabel(p2, "eL", Math.min(Math.max(md.lambdas[0][0], xLo), xHi), md.lambdas[0][1], `${Vk} km/h`, "annot f2", segs.concat([[[xLo, 0], [xHi, 0]], [[0, -yHi], [0, yHi]]]), []);

      // Readouts
      if (md.complex) {
        rWn.set(`${RVD.fmt(md.wn / (2 * Math.PI), 2)} Hz (${RVD.fmt(md.wn, 1)} rad/s)`);
        rZ.set(RVD.fmt(md.zeta, 2), md.zeta < 0.5 ? "warn" : null);
      } else { rWn.set("— (no oscillation)"); rZ.set(md.det > 0 ? `${RVD.fmt(md.zeta, 2)} (overdamped)` : "—"); }
      const slowest = Math.max(...md.lambdas.map((l) => l[0]));
      rT.set(slowest < 0 ? `${RVD.fmt(Math.log(2) / -slowest, 3)} s` : "never: it grows", slowest < 0 ? null : "bad");
      const Vc = B.criticalSpeed(p);
      rS.set(md.stable ? "stable" : "unstable", md.stable ? "ok" : "bad");
      status.set(!md.stable
        ? `Above its critical speed (${RVD.fmt(Vc * KMH, 0)} km/h) this oversteering car is unstable: one mode grows, so every path runs away from the steady state.`
        : md.complex
          ? `Every path spirals back to the steady state: the car is stable but oscillates, with a damping ratio of ${RVD.fmt(md.zeta, 2)}.`
          : "Every path returns to the steady state without circling it: the response is overdamped, as it is at low speed.", md.stable ? null : "bad");
    }
    draw();
  };

  /* ------------------------------------------------------------------ */
  /* 6.2  Step-steer simulator                                            */
  /* ------------------------------------------------------------------ */
  RVD.widgets["step-steer"] = function (root) {
    const { controls, plots } = RVD.ui.layout(root, { plots: 2 });
    const ctl = carControls(controls, draw, 90);
    RVD.ui.group(controls, "Test and integration");
    const d0 = RVD.ui.slider(controls, { label: "Steer step δ₀ (road wheels)", min: 0.2, max: 3, step: 0.1, value: 1, digits: 1, unit: "°", onInput: draw });
    const meth = RVD.ui.choice(controls, { value: "euler", options: [{ label: "Explicit Euler", value: "euler" }, { label: "RK4", value: "rk4" }], onInput: draw });
    const hS = RVD.ui.slider(controls, { label: "Time step h", min: 1, max: 120, step: 1, value: 10, digits: 0, unit: "ms", onInput: draw });

    const ro = RVD.ui.readouts(controls);
    const rSS = RVD.ui.readout(ro, "Steady state: r / ay");
    const r90 = RVD.ui.readout(ro, "Time to 90% of steady yaw rate");
    const rOS = RVD.ui.readout(ro, "Yaw-rate overshoot");
    const rLim = RVD.ui.readout(ro, "Euler is stable for h below");
    const rErr = RVD.ui.readout(ro, "Largest error vs reference");
    const status = RVD.ui.status(controls);

    const box1 = RVD.ui.h("div", null, plots);
    const p1 = RVD.plot(box1, {
      xlim: [0, 1.5], ylim: [0, 10], height: 300, fixedText: true, onTextScale: () => draw(),
      xlabel: "Time after the step (s)", ylabel: "Yaw rate r (deg/s)"
    });
    RVD.legend(box1, [
      { label: "Your simulation", color: "var(--s1)" },
      { label: "Reference (RK4, 0.5 ms)", color: "var(--text-muted)", dash: true },
      { label: "Steady state", color: "var(--s3)", dash: true }
    ]);
    const box2 = RVD.ui.h("div", null, plots);
    const p2 = RVD.plot(box2, {
      xlim: [0, 1.5], ylim: [0, 1], height: 300, fixedText: true, onTextScale: () => draw(),
      xlabel: "Time after the step (s)", ylabel: "Lateral acceleration ay (g)"
    });
    RVD.legend(box2, [
      { label: "Your simulation", color: "var(--s4)" },
      { label: "Reference", color: "var(--text-muted)", dash: true },
      { label: "Steady state", color: "var(--s3)", dash: true }
    ]);

    function draw() {
      const p = ctl.car(), V = ctl.V.value / KMH;
      const sys = B.linearSystem(p, V), md = B.modes(sys);
      const delta = d0.value * RAD, h = hS.value / 1000;
      const step = (t) => (t >= 0 ? delta : 0);
      const slowest = Math.max(...md.lambdas.map((l) => l[0]));
      const T = md.stable ? Math.min(3, Math.max(0.6, Math.ceil((6 / -slowest) * 10) / 10)) : 1.5;
      const ref = B.simulate(sys, step, { h: 0.0005, T, method: "rk4" });
      const sim = B.simulate(sys, step, { h, T, method: meth.value });
      const xs = B.steadyState(sys, delta), rss = xs[1] / RAD, ayss = (V * xs[1]) / G;

      const refR = ref.t.map((t, i) => [t, ref.r[i] / RAD]), simR = sim.t.map((t, i) => [t, sim.r[i] / RAD]);
      const refA = ref.t.map((t, i) => [t, ref.ay[i] / G]), simA = sim.t.map((t, i) => [t, sim.ay[i] / G]);
      const maxR = Math.max(rss, ...refR.map((q) => q[1])), maxA = Math.max(ayss, ...refA.map((q) => q[1]));
      // Unstable car: scale to the growing reference response (capped), so the curve is seen running away.
      const yR = md.stable ? Math.max(1, maxR * 1.45) : Math.min(100, Math.max(1, maxR * 1.1));
      const yA = md.stable ? Math.max(0.1, maxA * 1.45) : Math.min(3, Math.max(0.1, maxA * 1.1));
      p1.setLimits([0, T], [Math.min(0, -0.15 * yR), yR]);
      p2.setLimits([0, T], [Math.min(0, -0.15 * yA), yA]);
      // Stop a curve just after it leaves the plot (a blown-up simulation can reach huge values)
      const cut = (pts, lim) => { const i = pts.findIndex((q) => !isFinite(q[1]) || Math.abs(q[1]) > lim); return i < 0 ? pts : pts.slice(0, i + 1).filter((q) => isFinite(q[1])); };
      [[p1, refR, simR, rss, "c1", "f1", yR], [p2, refA, simA, ayss, "c4", "f4", yA]].forEach(([pl, rf, sm, ss, c, fcls, yl]) => {
        pl.line("zero", [[0, 0], [T, 0]], "series series--thin cm");
        if (md.stable) pl.line("ss", [[0, ss], [T, ss]], "series series--thin series--dash c3"); else pl.remove("ss");
        pl.line("ref", cut(rf, 3 * yl), "series series--dash cm");
        pl.line("sim", cut(sm, 3 * yl), `series ${c}`);
        // Show the individual steps when they are coarse enough to see
        const pts = sm.length <= 60 ? sm : [];
        const [ylo, yhi] = pl.ylim;
        for (let i = 0; i < 60; i++) {
          if (i < pts.length && pts[i][1] >= ylo && pts[i][1] <= yhi) pl.point("k" + i, pts[i][0], pts[i][1], { cls: fcls, r: 2.5 });
          else pl.remove("k" + i);
        }
      });

      // Metrics (from your simulation) and error against the reference
      const m = B.stepMetrics(sim.t, sim.r, xs[1]);
      let err = 0;
      sim.t.forEach((t, i) => { const j = Math.min(ref.t.length - 1, Math.round(t / 0.0005)); err = Math.max(err, Math.abs(sim.r[i] - ref.r[j])); });
      const hLim = B.eulerStepLimit(sys);
      const eulerBad = meth.value === "euler" && h >= hLim;
      ["t90", "t90L", "pk", "pkL"].forEach((k) => p1.remove(k));
      if (md.stable && !eulerBad && m.t90 != null && isFinite(m.t90)) {
        p1.point("t90", m.t90, 0.9 * rss, { cls: "f3", r: 5 });
        placeLabel(p1, "t90L", m.t90, 0.9 * rss, `90% at ${RVD.fmt(m.t90 * 1000, 0)} ms`, "annot f3", [refR, simR, [[0, rss], [T, rss]]], []);
      }
      if (md.stable && !eulerBad && m.tPeak != null && m.overshoot > 0.005 && m.peak / RAD < yR) {
        p1.point("pk", m.tPeak, m.peak / RAD, { cls: "f1", r: 5 });
        placeLabel(p1, "pkL", m.tPeak, m.peak / RAD, `+${RVD.fmt(m.overshoot * 100, 0)}%`, "annot f1", [refR, simR, [[0, rss], [T, rss]]], [p1.svg.querySelector("text.annot")]);
      }

      const mu = Math.min(p.muF, p.muR), overGrip = md.stable && ayss > mu;
      rSS.set(md.stable ? `${RVD.fmt(rss, 2)} deg/s / ${RVD.fmt(ayss, 2)} g` : "none (unstable car)", overGrip ? "warn" : null);
      r90.set(m.t90 != null && md.stable && !eulerBad ? `${RVD.fmt(m.t90 * 1000, 0)} ms` : "—");
      rOS.set(md.stable && !eulerBad ? `${RVD.fmt(m.overshoot * 100, 1)}%` : "—");
      rLim.set(isFinite(hLim) && hLim > 0 ? `${RVD.fmt(hLim * 1000, 1)} ms` : "— (car unstable)", eulerBad ? "bad" : null);
      rErr.set(isFinite(err) && err < 1e3 ? `${RVD.fmt(err / RAD, 2)} deg/s` : "blew up", err / RAD > 0.1 * Math.abs(rss) ? "warn" : null);
      status.set(!md.stable
        ? "This car is above its critical speed: the true response grows, whatever the integrator. Within a second the linear model asks for more grip than any tire has; a real car's rear tires would saturate and it would spin."
        : eulerBad
          ? `The time step is above Euler's stability limit of ${RVD.fmt(hLim * 1000, 1)} ms, so the numbers grow without bound even though the car itself is stable.`
          : meth.value === "euler" && err / RAD > 0.05 * rss
            ? `Euler is stable at this step but not accurate: it is off by up to ${RVD.fmt(err / RAD, 2)} deg/s. Halve the step and the error roughly halves.`
            : `The simulation tracks the reference closely. The yaw rate reaches 90% of its steady value in ${RVD.fmt(m.t90 * 1000, 0)} ms; lateral acceleration takes longer to settle.`
          + (overGrip ? ` But a steady ${RVD.fmt(ayss, 2)} g is more than these tires can give (μ = ${RVD.fmt(mu, 1)}): the linear model has no grip limit, so use a smaller steer step.` : ""),
        !md.stable || eulerBad ? "bad" : null);
    }
    draw();
  };
})();
