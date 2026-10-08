/*
 * Lesson 2.2 widget (needs models/tire.js)
 *   slip-ratio : Fx vs slip ratio, with a wheel-torque demand that finds the
 *                steady operating point, shows lock-up / wheelspin past the peak,
 *                and what ABS / traction control do about it.
 */
(function () {
  const RVD = window.RVD;
  const T = RVD.tire;
  const R_WHEEL = 0.30;            // effective rolling radius, m
  const V0 = 100 / 3.6;            // reference speed for the stopping-distance readout

  RVD.widgets["slip-ratio"] = function (root) {
    const { controls, plots } = RVD.ui.layout(root);

    RVD.ui.group(controls, "Tire");
    const Fz = RVD.ui.slider(controls, { label: "Vertical load Fz", min: 1000, max: 6000, step: 100, value: 3000, digits: 0, unit: "N", onInput: draw });
    const mux = RVD.ui.slider(controls, { label: "Peak μ (longitudinal)", min: 1.0, max: 2.0, step: 0.05, value: 1.65, onInput: draw });
    const CCk = RVD.ui.slider(controls, { label: "Longitudinal stiffness coeff.", min: 10, max: 60, step: 1, value: 32, digits: 0, unit: "/unit slip", onInput: draw });

    RVD.ui.group(controls, "Wheel torque (− brake, + drive)");
    const torque = RVD.ui.slider(controls, {
      label: "Torque at the wheel", min: -2500, max: 2500, step: 25, value: -900,
      format: (v) => `${RVD.fmt(v, 0)} N·m ${v < 0 ? "(braking)" : v > 0 ? "(driving)" : ""}`, onInput: draw
    });
    const assist = RVD.ui.choice(controls, {
      value: "off",
      options: [{ label: "No driver aids", value: "off" }, { label: "ABS / traction control", value: "on" }],
      onInput: draw
    });

    const ro = RVD.ui.readouts(controls);
    const rK = RVD.ui.readout(ro, "Slip ratio");
    const rFx = RVD.ui.readout(ro, "Tire force Fx");
    const rWheel = RVD.ui.readout(ro, "Wheel speed at 100 km/h");
    const rA = RVD.ui.readout(ro, "Car accel. (4 such tires)");
    const rStop = RVD.ui.readout(ro, "Stop from 100 km/h");
    const status = RVD.ui.status(controls);

    const p = RVD.plot(plots, {
      xlim: [-100, 60], ylim: [-6000, 6000], height: 360,
      xlabel: "Slip ratio κ (%)   ← braking | driving →", ylabel: "Longitudinal force Fx (N)"
    });
    RVD.legend(plots, [
      { label: "Tire curve", color: "var(--s1)" },
      { label: "Demand: torque ÷ radius", color: "var(--s2)", dash: true },
      { label: "Aid target band", color: "var(--s3)" }
    ]);

    function params() { return T.params({ Fz: Fz.value, mux0: mux.value, CCk: CCk.value }); }

    /* Steady operating point for a demanded force F (N). */
    function operate(pr, pk, F) {
      const sign = F < 0 ? -1 : 1, Fa = Math.abs(F);
      if (Fa <= pk.fx) {
        let lo = 0, hi = pk.kappa;
        for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (T.fx(mid, pr) < Fa) lo = mid; else hi = mid; }
        return { k: sign * lo, fx: sign * Fa, state: "grip" };
      }
      if (assist.value === "on") {
        const k = 0.9 * pk.kappa;
        return { k: sign * k, fx: sign * T.fx(k, pr), state: "aid" };
      }
      const k = sign < 0 ? 1 : 0.6;     // locked, or spinning up
      return { k: sign * k, fx: sign * T.fx(k, pr), state: sign < 0 ? "locked" : "spin" };
    }

    function draw() {
      const pr = params(), pk = T.peaks(pr);
      const ymax = Math.max(4000, Math.ceil((pk.fx * 1.25) / 1000) * 1000);
      p.setLimits(null, [-ymax, ymax]);

      if (assist.value === "on") {
        const b0 = 0.8 * pk.kappa * 100, b1 = pk.kappa * 100;
        p.area("bandB", [[-b1, -ymax], [-b0, -ymax], [-b0, ymax], [-b1, ymax]], "f3");
        p.area("bandD", [[b0, -ymax], [b1, -ymax], [b1, ymax], [b0, ymax]], "f3");
      } else { p.remove("bandB"); p.remove("bandD"); }

      const curve = [];
      for (let k = -1; k <= 0.6001; k += 0.004) curve.push([k * 100, T.fx(k, pr)]);
      p.line("curve", curve, "series c1");
      p.point("pkB", -pk.kappa * 100, -pk.fx, { cls: "fm", r: 4 });
      p.point("pkD", pk.kappa * 100, pk.fx, { cls: "fm", r: 4 });
      p.label("pkL", pk.kappa * 100, pk.fx, `peak at ${RVD.fmt(pk.kappa * 100, 1)}%`, { dx: 8, dy: -8, cls: "annot" });

      const F = torque.value / R_WHEEL;
      p.line("demand", [[-100, F], [60, F]], "series series--thin series--dash c2");
      const op = operate(pr, pk, F);
      p.point("op", op.k * 100, op.fx, { cls: op.state === "grip" || op.state === "aid" ? "f1" : "f2", r: 7 });

      // Readouts
      rK.set(RVD.fmt(op.k * 100, 1) + "%", op.state === "locked" || op.state === "spin" ? "bad" : null);
      rFx.set(RVD.fmt(op.fx, 0) + " N");
      rWheel.set(op.state === "spin" ? "rising…" : RVD.fmt(V0 * (1 + op.k) * 3.6, 0) + " km/h", op.state === "locked" ? "bad" : null);
      const a = op.fx / pr.Fz;                      // in g, each tire carries Fz of the car's weight
      rA.set(RVD.fmt(a, 2) + " g");
      rStop.set(op.fx < -1 ? RVD.fmt((V0 * V0) / (2 * -a * RVD.G), 1) + " m" : "—");

      const msg = {
        grip: [`The wheel finds a steady slip of ${RVD.fmt(Math.abs(op.k) * 100, 1)}% where the tire force balances the torque.`, "ok"],
        aid: [`Demand exceeds the peak, so the ${op.fx < 0 ? "ABS" : "traction control"} cuts torque to hold slip just below the peak.`, "warn"],
        locked: ["Demand exceeds the peak: there is no steady operating point, so the wheel decelerates to a stop. Locked — the tire slides at its lower sliding force.", "bad"],
        spin: ["Demand exceeds the peak: the wheel keeps spinning up and the force falls away. Wheelspin.", "bad"]
      }[op.state];
      status.set(msg[0], msg[1]);
    }
    draw();
  };
})();
