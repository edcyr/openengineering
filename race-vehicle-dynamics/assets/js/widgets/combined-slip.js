/*
 * Lesson 2.3 widget (needs models/tire.js)
 *   combined-slip : one tire under slip angle AND slip ratio.
 *     Left  — force plane (Fx, Fy) with the friction ellipse and lines of constant slip angle
 *     Right — lateral force vs slip angle, pure cornering vs at the current slip ratio
 */
(function () {
  const RVD = window.RVD;
  const T = RVD.tire;

  const PRESETS = {
    corner: { label: "Pure cornering", a: 7, k: 0 },
    trail: { label: "Trail braking", a: 5, k: -0.06 },
    locked: { label: "Locked wheel", a: 8, k: -1 },
    power: { label: "Too much power", a: 7, k: 0.25 }
  };

  RVD.widgets["combined-slip"] = function (root) {
    const { controls, plots } = RVD.ui.layout(root, { plots: 2 });

    const preset = RVD.ui.choice(controls, {
      value: "trail",
      options: Object.keys(PRESETS).map((k) => ({ label: PRESETS[k].label, value: k })),
      onInput: (k) => { alpha.set(PRESETS[k].a); kap.set(PRESETS[k].k * 100); draw(); }
    });
    RVD.ui.group(controls, "Operating point");
    const alpha = RVD.ui.slider(controls, { label: "Slip angle α", min: 0, max: 15, step: 0.01, value: 5, digits: 1, unit: "deg", onInput: draw });
    const kap = RVD.ui.slider(controls, {
      label: "Slip ratio κ", min: -100, max: 40, step: 0.05, value: -6,
      format: (v) => `${RVD.fmt(v, 1)}% ${v < -0.01 ? "(braking)" : v > 0.01 ? "(driving)" : ""}`, onInput: draw
    });
    RVD.ui.group(controls, "Tire");
    const Fz = RVD.ui.slider(controls, { label: "Vertical load Fz", min: 1000, max: 6000, step: 100, value: 3000, digits: 0, unit: "N", onInput: draw });

    const ro = RVD.ui.readouts(controls);
    const rFx = RVD.ui.readout(ro, "Fx (long.)");
    const rFy = RVD.ui.readout(ro, "Fy (lateral)");
    const rUse = RVD.ui.readout(ro, "Grip used");
    const rLoss = RVD.ui.readout(ro, "Fy lost vs pure cornering");
    const status = RVD.ui.status(controls);

    const box1 = RVD.ui.h("div", "span-all", plots);   // force plane spans both columns
    const p1 = RVD.plot(box1, {
      xlim: [-6000, 6000], ylim: [0, 6000], width: 460, height: 280, fixedText: true,
      xlabel: "Fx (N)   ← braking | driving →", ylabel: "Fy (N)"
    });
    RVD.legend(box1, [
      { label: "Friction ellipse", color: "var(--s1)" },
      { label: "Constant α (2, 4, 8, 12°)", color: "var(--text-muted)" },
      { label: "Operating point", color: "var(--s2)" }
    ]);
    const box2 = RVD.ui.h("div", null, plots);
    const p2 = RVD.plot(box2, { xlim: [0, 15], ylim: [0, 6000], width: 460, height: 300, fixedText: true, xlabel: "Slip angle α (deg)", ylabel: "Fy (N)" });
    RVD.legend(box2, [
      { label: "Pure cornering (κ = 0)", color: "var(--text-muted)", dash: true },
      { label: "At the current κ", color: "var(--s2)" }
    ]);
    const box3 = RVD.ui.h("div", null, plots);
    const p3 = RVD.plot(box3, {
      xlim: [-100, 40], ylim: [-6000, 6000], width: 460, height: 300, fixedText: true, xticks: 4,
      xlabel: "Slip ratio κ (%)  ← braking | driving →", ylabel: "Fx (N)"
    });
    RVD.legend(box3, [
      { label: "Pure braking/driving (α = 0)", color: "var(--text-muted)", dash: true },
      { label: "At the current α", color: "var(--s2)" }
    ]);

    /*
     * Drag support: invert the combined-slip model. For a target force (Fx, Fy),
     * normalise by the peak forces, X = Fx/Fx_pk and Y = Fy/Fy_pk, then find the
     * normalised total slip n in (0, 1] with  (X/gx(n))^2 + (Y/gy(n))^2 = 1,
     * where gx, gy are the pure curves scaled to 1 at their peaks (both rise
     * monotonically on 0..1, so bisection works). The slip direction follows from
     * cos(theta) = X/gx(n), sin(theta) = Y/gy(n). Targets outside the ellipse are
     * pulled back onto it. Dragging therefore covers the rising (pre-peak) part of
     * every curve; locked wheels and wheelspin are still reached with the sliders.
     */
    function slipsFor(Fx, Fy) {
      const pr = T.params({ Fz: Fz.value }), pk = T.peaks(pr);
      let X = Fx / pk.fx, Y = Math.max(0, Fy) / pk.fy;
      const r = Math.hypot(X, Y);
      if (r < 1e-6) return { a: 0, k: 0 };
      if (r > 1) { X /= r; Y /= r; }
      const gx = (n) => T.fx(n * pk.kappa, pr) / pk.fx, gy = (n) => T.fy(n * pk.alpha, pr) / pk.fy;
      const h = (n) => (X / gx(n)) ** 2 + (Y / gy(n)) ** 2 - 1;
      let lo = 1e-4, hi = 1;
      if (h(hi) > 0) lo = hi;                       // on the boundary already
      else for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (h(mid) > 0) lo = mid; else hi = mid; }
      const n = (lo + hi) / 2;
      const th = Math.atan2(Y / gy(n), X / gx(n));
      return { a: n * Math.sin(th) * pk.alpha, k: n * Math.cos(th) * pk.kappa };
    }

    let dragging = false;
    function dragTo(evt) {
      const [fx, fy] = p1.toData(evt);
      const { a, k } = slipsFor(fx, fy);
      alpha.set(Math.min(15, Math.max(0, a)));
      kap.set(Math.min(40, Math.max(-100, k * 100)));
      draw();
    }
    p1.svg.addEventListener("pointerdown", (e) => { e.preventDefault(); dragging = true; p1.svg.setPointerCapture(e.pointerId); p1.svg.classList.add("is-dragging"); dragTo(e); });
    p1.svg.addEventListener("pointermove", (e) => { if (dragging) dragTo(e); });
    ["pointerup", "pointercancel"].forEach((ev) => p1.svg.addEventListener(ev, () => { dragging = false; p1.svg.classList.remove("is-dragging"); }));

    function draw() {
      const pr = T.params({ Fz: Fz.value });
      const pk = T.peaks(pr);
      const a = alpha.value, k = kap.value / 100;
      const lim = Math.max(4000, Math.ceil((Math.max(pk.fx, pk.fy) * 1.15) / 1000) * 1000);
      p1.setLimits([-lim, lim], [0, lim]);
      p2.setLimits(null, [0, lim]);
      p3.setLimits(null, [-lim, lim]);

      // Friction ellipse (upper half) and constant-alpha lines
      const ell = [];
      for (let i = 0; i <= 180; i++) { const t = (i / 180) * Math.PI; ell.push([pk.fx * Math.cos(t), pk.fy * Math.sin(t)]); }
      p1.line("ell", ell, "series c1");
      [2, 4, 8, 12].forEach((aa) => {
        const pts = [];
        for (let kk = -1; kk <= 0.4001; kk += 0.005) { const c = T.combined(aa, kk, pr, pk); pts.push([c.fx, c.fy]); }
        p1.line("a" + aa, pts, "series series--thin cm");
      });
      const c = T.combined(a, k, pr, pk);
      p1.line("vec", [[0, 0], [c.fx, c.fy]], "series series--thin c2", { top: true });
      p1.point("op", c.fx, c.fy, { cls: "f2 handle", r: 9 });

      // Fy vs alpha
      const pure = [], cur = [];
      for (let aa = 0; aa <= 15.0001; aa += 0.1) { pure.push([aa, T.fy(aa, pr)]); cur.push([aa, T.combined(aa, k, pr, pk).fy]); }
      p2.line("pure", pure, "series series--dash cm");
      p2.line("cur", cur, "series c2");
      p2.point("op2", a, c.fy, { cls: "f2", r: 6 });

      // Fx vs slip ratio: pure (no slip angle) and at the current slip angle
      const pureX = [], curX = [];
      for (let kk = -1; kk <= 0.4001; kk += 0.005) { pureX.push([kk * 100, T.fx(kk, pr)]); curX.push([kk * 100, T.combined(a, kk, pr, pk).fx]); }
      p3.line("zero", [[-100, 0], [40, 0]], "series series--thin cm");
      p3.line("pure", pureX, "series series--dash cm");
      p3.line("cur", curX, "series c2");
      p3.point("op3", k * 100, c.fx, { cls: "f2", r: 6 });

      const use = Math.hypot(c.fx / pk.fx, c.fy / pk.fy);
      const fyPure = T.fy(a, pr);
      rFx.set(RVD.fmt(c.fx, 0) + " N");
      rFy.set(RVD.fmt(c.fy, 0) + " N");
      rUse.set(RVD.fmt(use * 100, 0) + "%", use > 0.97 ? "warn" : null);
      rLoss.set(fyPure > 1 ? RVD.fmt((1 - c.fy / fyPure) * 100, 0) + "%" : "—", c.fy < 0.5 * fyPure ? "bad" : null);

      if (k <= -0.9) status.set("Locked wheel: the tire slides in its direction of travel, so almost all of its force points backward. Steering does almost nothing.", "bad");
      else if (k >= 0.2) status.set("Wheelspin: the driven tire has used its grip budget for Fx, so it can hold little lateral force. On the rear axle this is power oversteer.", "bad");
      else if (Math.abs(k) < 0.002) status.set("Pure cornering: all of the grip budget is available for lateral force.", "ok");
      else status.set(`Combined slip: ${k < 0 ? "braking" : "driving"} uses part of the grip budget, ${fyPure > 1 ? `leaving ${RVD.fmt((c.fy / fyPure) * 100, 0)}% of the pure-cornering lateral force at this slip angle.` : "with no slip angle, all of it goes into Fx."}`, use > 0.97 ? "warn" : "ok");
      // keep the preset highlight honest
      const match = Object.keys(PRESETS).find((key) => Math.abs(PRESETS[key].a - a) < 0.01 && Math.abs(PRESETS[key].k * 100 - kap.value) < 0.01);
      preset.set(match || null);
    }
    alpha.set(PRESETS.trail.a); kap.set(PRESETS.trail.k * 100);
    draw();
  };
})();
