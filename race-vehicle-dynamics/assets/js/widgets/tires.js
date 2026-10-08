/*
 * Lesson 2.1 widget
 *   tire-curve : lateral force vs slip angle (simplified Magic Formula)
 *                plus peak force vs vertical load (load sensitivity)
 * Needs assets/js/models/tire.js (RVD.tire).
 */
(function () {
  const RVD = window.RVD;

  RVD.widgets["tire-curve"] = function (root) {
    const Fz0 = 3000;
    const { controls, plots } = RVD.ui.layout(root);

    RVD.ui.group(controls, "Operating condition");
    const Fz = RVD.ui.slider(controls, { label: "Vertical load Fz", min: 250, max: 6000, step: 50, value: 3000, digits: 0, unit: "N", onInput: draw });
    RVD.ui.group(controls, "Tire properties");
    const mu0 = RVD.ui.slider(controls, { label: "Peak μ at 3000 N", min: 0.8, max: 2.0, step: 0.05, value: 1.6, onInput: draw });
    const s = RVD.ui.slider(controls, { label: "Load sensitivity s", min: 0, max: 0.25, step: 0.01, value: 0.12, onInput: draw });
    const CC = RVD.ui.slider(controls, { label: "Cornering stiffness coeff.", min: 0.15, max: 0.8, step: 0.01, value: 0.5, unit: "/deg", onInput: draw });
    RVD.ui.group(controls, "Curve shape (Magic Formula)");
    const C = RVD.ui.slider(controls, { label: "Shape factor C", min: 1.1, max: 1.7, step: 0.01, value: 1.3, onInput: draw });
    const E = RVD.ui.slider(controls, { label: "Curvature factor E", min: -3, max: 0.5, step: 0.05, value: -1, onInput: draw });
    RVD.ui.group(controls, "A pair of tires (Module 3 preview)");
    const dF = RVD.ui.slider(controls, { label: "Load transfer ΔFz", min: 0, max: 2500, step: 50, value: 1200, digits: 0, unit: "N", onInput: draw });

    const ro = RVD.ui.readouts(controls);
    const rMu = RVD.ui.readout(ro, "μ at this load");
    const rPeak = RVD.ui.readout(ro, "Peak lateral force");
    const rAlpha = RVD.ui.readout(ro, "Slip angle at peak");
    const rCa = RVD.ui.readout(ro, "Cornering stiffness");
    const rPair = RVD.ui.readout(ro, "Pair grip vs equal loads");

    // Plot 1: Fy vs alpha
    const box1 = RVD.ui.h("div", null, plots);
    const p1 = RVD.plot(box1, { xlim: [0, 15], ylim: [0, 6000], xlabel: "Slip angle α (deg)", ylabel: "Lateral force Fy (N)", height: 320 });
    RVD.legend(box1, [
      { label: "Tire curve", color: "var(--s1)" },
      { label: "Linear model Cα·α", color: "var(--s2)", dash: true },
      { label: "Tire at 3000 N (reference)", color: "var(--text-muted)" }
    ]);

    // Plot 2: peak Fy vs Fz
    const box2 = RVD.ui.h("div", null, plots);
    const p2 = RVD.plot(box2, { xlim: [0, 6000], ylim: [0, 10000], xlabel: "Vertical load Fz (N)", ylabel: "Peak lateral force (N)", height: 320 });
    RVD.legend(box2, [
      { label: "Load-sensitive tire", color: "var(--s1)" },
      { label: "If μ were constant", color: "var(--text-muted)", dash: true },
      { label: "Pair with load transfer", color: "var(--s3)" }
    ]);

    function params(load) {
      return { Fz: load, Fz0, mu0: mu0.value, s: s.value, CC: CC.value, C: C.value, E: E.value };
    }
    const niceCeil = (v, step) => Math.max(step, Math.ceil(v / step) * step);

    function draw() {
      const pr = params(Fz.value);
      const prRef = params(Fz0);

      // --- Plot 1 ---
      const curve = [], ref = [];
      let peakF = 0, peakA = 0;
      for (let a = 0; a <= 15.0001; a += 0.05) {
        const f = RVD.tire.fy(a, pr);
        curve.push([a, f]);
        ref.push([a, RVD.tire.fy(a, prRef)]);
        if (f > peakF) { peakF = f; peakA = a; }
      }
      const Ca = RVD.tire.corneringStiffness(pr);
      const ymax = niceCeil(Math.max(peakF, RVD.tire.peak(Fz0, mu0.value, s.value, Fz0)) * 1.2, 2000);
      p1.setLimits(null, [0, ymax]);

      // Regions: linear until the curve falls 5% below the linear model.
      let aLin = 0;
      for (const [a, f] of curve) { if (a > 0 && f < 0.95 * Ca * a) { aLin = a; break; } }
      const top = ymax;
      p1.area("linReg", [[0, 0], [aLin, 0], [aLin, top], [0, top]], "f3");
      p1.area("fricReg", [[peakA, 0], [15, 0], [15, top], [peakA, top]], "f2");
      p1.label("linLab", aLin / 2, top, "linear", { anchor: "middle", dy: 16, cls: "annot f3" });
      p1.label("trLab", (aLin + peakA) / 2, top, "transitional", { anchor: "middle", dy: 16, cls: "annot" });
      p1.label("frLab", (peakA + 15) / 2, top, "frictional", { anchor: "middle", dy: 16, cls: "annot f2" });

      p1.line("ref", ref, "series series--thin cm");
      p1.line("lin", [[0, 0], [15, Ca * 15]], "series series--dash c2");
      p1.line("fy", curve, "series c1");
      p1.point("peak", peakA, peakF, { cls: "f1" });
      p1.label("peakLab", peakA, peakF, `peak ${RVD.fmt(peakF, 0)} N`, { cls: "annot f1", dx: 8, dy: -10 });

      // --- Plot 2 ---
      const sens = [], flat = [];
      for (let f = 0; f <= 6000; f += 50) {
        sens.push([f, RVD.tire.peak(f, mu0.value, s.value, Fz0)]);
        flat.push([f, mu0.value * f]);
      }
      p2.setLimits(null, [0, niceCeil(mu0.value * 6000 * 1.02, 2000)]);
      p2.line("flat", flat, "series series--dash cm");
      p2.line("sens", sens, "series c1");

      // Pair of tires sharing 2 x Fz0 of load with transfer dF.
      const lo = Math.max(0, Fz0 - dF.value), hi = Fz0 + dF.value;
      const fLo = RVD.tire.peak(lo, mu0.value, s.value, Fz0);
      const fHi = RVD.tire.peak(hi, mu0.value, s.value, Fz0);
      const fEq = RVD.tire.peak(Fz0, mu0.value, s.value, Fz0);
      p2.line("chord", [[lo, fLo], [hi, fHi]], "series series--thin c3");
      p2.point("pLo", lo, fLo, { cls: "f3", r: 5 });
      p2.point("pHi", hi, fHi, { cls: "f3", r: 5 });
      p2.point("pMid", Fz0, (fLo + fHi) / 2, { cls: "f3", r: 4 });
      p2.point("pEq", Fz0, fEq, { cls: "fm", r: 4 });
      p2.point("cur", Fz.value, RVD.tire.peak(Fz.value, mu0.value, s.value, Fz0), { cls: "f1", r: 6 });

      // --- Readouts ---
      rMu.set(RVD.fmt(RVD.tire.mu(Fz.value, mu0.value, s.value, Fz0), 2));
      rPeak.set(RVD.fmt(peakF, 0) + " N");
      rAlpha.set(peakA >= 14.99 ? "> 15°" : RVD.fmt(peakA, 1) + "°");
      rCa.set(RVD.fmt(Ca, 0) + " N/deg");
      const loss = (fLo + fHi) / (2 * fEq) - 1;
      rPair.set((loss <= 0 ? "" : "+") + RVD.fmt(loss * 100, 1) + "%", loss < -0.001 ? "bad" : "ok");
    }
    draw();
  };
})();
