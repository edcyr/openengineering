/*
 * Lesson 0.2 widgets
 *   axes-3d    : a car drawn in 3-D (projected SVG) with its body axes. Roll, pitch
 *                and yaw sliders follow either the SAE (x fwd, y right, z down) or
 *                the ISO 8855 (x fwd, y left, z up) convention. Drag to orbit.
 *   angles-top : top view showing steer angle, sideslip, yaw rate and the resulting
 *                front/rear slip angles, with signs in either convention.
 *
 * Internally both widgets store the physical state in one convention and only
 * change how it is labelled, so switching convention never moves the car.
 */
(function () {
  const RVD = window.RVD;
  const svgEl = RVD.svgEl;
  const DEG = Math.PI / 180;

  const CONV = {
    sae: { label: "SAE (RCVD)", y: "y (right)", z: "z (down)", ySign: -1, zSign: -1 },
    iso: { label: "ISO 8855", y: "y (left)", z: "z (up)", ySign: 1, zSign: 1 }
  };

  /* ---------------- tiny 3-D helpers (internal frame: x fwd, y left, z up) ---------------- */
  const v3 = (x, y, z) => [x, y, z];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

  function rotZYX(yaw, pitch, roll) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
    // R = Rz(yaw) * Ry(pitch) * Rx(roll)
    return [
      [cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr],
      [sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr],
      [-sp, cp * sr, cp * cr]
    ];
  }
  const mul = (M, p) => [dot(M[0], p), dot(M[1], p), dot(M[2], p)];

  /* ---------- shape builders (internal frame: x forward, y left, z up; metres) ---------- */
  // Closed six-sided solid from two aligned quads (Q0 and Q1, corners in the same order).
  // Face normals are computed and flipped to point away from the solid's centre.
  function hexa(Q0, Q1, cls) {
    const all = Q0.concat(Q1);
    const c = scl(all.reduce((a, p) => add(a, p), [0, 0, 0]), 1 / all.length);
    const quads = [Q0, Q1.slice().reverse()];
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quads.push([Q0[i], Q0[j], Q1[j], Q1[i]]); }
    return quads.map((pts) => {
      const fc = scl(pts.reduce((a, p) => add(a, p), [0, 0, 0]), 1 / pts.length);
      let n = norm(cross(add(pts[1], scl(pts[0], -1)), add(pts[2], scl(pts[0], -1))));
      if (dot(n, add(fc, scl(c, -1))) < 0) n = scl(n, -1);
      return { pts, n, cls };
    });
  }
  // Block tapering along x: cross-section [y0,y1]x[z0,z1] at x0 becomes [Y0,Y1]x[Z0,Z1] at x1.
  function taper(x0, y0, y1, z0, z1, x1, Y0, Y1, Z0, Z1, cls) {
    return hexa(
      [v3(x0, y0, z0), v3(x0, y1, z0), v3(x0, y1, z1), v3(x0, y0, z1)],
      [v3(x1, Y0, Z0), v3(x1, Y1, Z0), v3(x1, Y1, Z1), v3(x1, Y0, Z1)], cls);
  }
  const block = (x0, x1, y0, y1, z0, z1, cls) => taper(x0, y0, y1, z0, z1, x1, y0, y1, z0, z1, cls);
  // Square-section rod from p to q (tubes, wishbones, wing supports).
  function rod(p, q, t, cls) {
    const d = norm(add(q, scl(p, -1)));
    const u = scl(norm(cross(d, Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0])), t / 2);
    const w = scl(cross(d, norm(u)), t / 2);
    const ring = (o) => [add(add(o, u), w), add(add(o, scl(u, -1)), w), add(add(o, scl(u, -1)), scl(w, -1)), add(add(o, u), scl(w, -1))];
    return hexa(ring(p), ring(q), cls);
  }
  // Mirror a list of faces in y (build the left side, get the right side free).
  const mirrorY = (faces) => faces.map((f) => ({ pts: f.pts.map((p) => v3(p[0], -p[1], p[2])).reverse(), n: v3(f.n[0], -f.n[1], f.n[2]), cls: f.cls }));
  const both = (faces) => faces.concat(mirrorY(faces));

  /* Wheel as a cylinder about the y axis: n tread faces plus two sidewall caps
     and a hub disc on each side, so it looks round from any viewpoint. */
  function wheel(cx, cy, cz, r, w) {
    const n = 20, faces = [], y0 = cy - w / 2, y1 = cy + w / 2;
    const at = (t, y, rr) => v3(cx + rr * Math.cos(t), y, cz + rr * Math.sin(t));
    for (let i = 0; i < n; i++) {
      const t0 = (i / n) * 2 * Math.PI, t1 = ((i + 1) / n) * 2 * Math.PI, tm = (t0 + t1) / 2;
      faces.push({ pts: [at(t0, y0, r), at(t1, y0, r), at(t1, y1, r), at(t0, y1, r)], n: v3(Math.cos(tm), 0, Math.sin(tm)), cls: "a3-tread" });
    }
    [[y0, -1], [y1, 1]].forEach(([y, sgn]) => {
      const ring = (rr, yy) => Array.from({ length: n }, (_, i) => at((i / n) * 2 * Math.PI, yy, rr));
      faces.push({ pts: ring(r, y), n: v3(0, sgn, 0), cls: "a3-wheel" });
      faces.push({ pts: ring(r * 0.55, y + sgn * 0.004), n: v3(0, sgn, 0), cls: "a3-hub" });   // drawn just proud of the sidewall
    });
    return faces;
  }

  /*
   * A typical Formula SAE car, built about its CG (0.30 m above the ground).
   * Wheelbase 1.55 m (front axle 0.82 m ahead of the CG), tracks 1.22 / 1.18 m,
   * 0.46 m diameter wheels, overall length about 2.8 m.
   */
  const XF = 0.82, XR = -0.73, ZW = -0.07, RW = 0.23;
  function wishbones(x, yIn, yOut) {
    const arm = (zIn, zOut) => [].concat(
      rod(v3(x - 0.13, yIn, zIn), v3(x, yOut, zOut), 0.022, "a3-arm"),
      rod(v3(x + 0.13, yIn, zIn), v3(x, yOut, zOut), 0.022, "a3-arm"));
    return both([].concat(arm(0.02, 0.07), arm(-0.19, -0.19)));
  }
  function hoop(x, yBase, yTop, zBase, zTop, t) {
    return [].concat(
      rod(v3(x, yBase, zBase), v3(x - 0.02, yTop, zTop), t, "a3-hoop"),
      rod(v3(x, -yBase, zBase), v3(x - 0.02, -yTop, zTop), t, "a3-hoop"),
      rod(v3(x - 0.02, yTop, zTop), v3(x - 0.02, -yTop, zTop), t, "a3-hoop"));
  }
  const CAR = [].concat(
    // Chassis: tub, nose cone and engine bay
    taper(-0.55, -0.26, 0.26, -0.24, 0.16, 0.55, -0.24, 0.24, -0.24, 0.12, "a3-body"),
    taper(0.55, -0.24, 0.24, -0.24, 0.12, 1.28, -0.07, 0.07, -0.20, -0.08, "a3-body"),
    taper(-1.00, -0.18, 0.18, -0.22, 0.05, -0.55, -0.26, 0.26, -0.24, 0.16, "a3-body"),
    // Sidepods (radiator inlets face forward)
    both(taper(-0.42, 0.26, 0.40, -0.22, -0.02, 0.22, 0.26, 0.47, -0.22, 0.05, "a3-pod")),
    // Cockpit opening and driver
    taper(-0.12, -0.17, 0.17, 0.146, 0.152, 0.42, -0.15, 0.15, 0.127, 0.133, "a3-cockpit"),
    taper(-0.15, -0.11, 0.11, 0.13, 0.30, 0.06, -0.11, 0.11, 0.13, 0.30, "a3-suit"),
    taper(-0.15, -0.105, 0.105, 0.30, 0.44, 0.07, -0.095, 0.095, 0.30, 0.42, "a3-helmet"),
    // Roll hoops: main hoop behind the helmet (with rear bracing), front hoop ahead of the cockpit
    hoop(-0.21, 0.20, 0.15, 0.14, 0.52, 0.035),
    both(rod(v3(-0.23, 0.15, 0.52), v3(-0.62, 0.15, 0.15), 0.03, "a3-hoop")),
    hoop(0.44, 0.22, 0.16, 0.10, 0.30, 0.03),
    // Front wing: main plane and endplates
    taper(1.08, -0.64, 0.64, -0.22, -0.20, 1.44, -0.64, 0.64, -0.26, -0.24, "a3-wing"),
    both(block(1.06, 1.46, 0.64, 0.66, -0.27, -0.10, "a3-wing")),
    // Rear wing: main plane, upper flap, endplates and supports
    taper(-1.25, -0.45, 0.45, 0.62, 0.65, -0.98, -0.45, 0.45, 0.55, 0.58, "a3-wing"),
    taper(-1.30, -0.45, 0.45, 0.76, 0.79, -1.12, -0.45, 0.45, 0.68, 0.71, "a3-wing"),
    both(block(-1.32, -0.94, 0.45, 0.47, 0.40, 0.82, "a3-wing")),
    both(rod(v3(-0.95, 0.12, 0.04), v3(-1.08, 0.12, 0.58), 0.03, "a3-hoop")),
    // Suspension: double wishbones from the chassis to each wheel
    wishbones(XF, 0.23, 0.49),
    wishbones(XR, 0.21, 0.47),
    // Wheels
    wheel(XF, 0.61, ZW, RW, 0.20), wheel(XF, -0.61, ZW, RW, 0.20),
    wheel(XR, 0.59, ZW, RW, 0.22), wheel(XR, -0.59, ZW, RW, 0.22)
  );

  RVD.widgets["axes-3d"] = function (root) {
    const { controls, plots } = RVD.ui.layout(root);
    let conv = "sae", last = "yaw";

    const convChoice = RVD.ui.choice(controls, {
      value: conv, options: Object.keys(CONV).map((k) => ({ label: CONV[k].label, value: k })),
      onInput: (k) => {
        // Keep the car where it is: pitch and yaw change sign between conventions.
        pitch.set(-pitch.value); yaw.set(-yaw.value);
        conv = k; draw();
      }
    });
    RVD.ui.group(controls, "Rotate the car");
    const roll = RVD.ui.slider(controls, { label: "Roll φ (about x)", min: -25, max: 25, step: 1, value: 0, digits: 0, unit: "°", onInput: () => { last = "roll"; draw(); } });
    const pitch = RVD.ui.slider(controls, { label: "Pitch θ (about y)", min: -25, max: 25, step: 1, value: 0, digits: 0, unit: "°", onInput: () => { last = "pitch"; draw(); } });
    const yaw = RVD.ui.slider(controls, { label: "Yaw ψ (about z)", min: -60, max: 60, step: 1, value: 20, digits: 0, unit: "°", onInput: () => { last = "yaw"; draw(); } });
    RVD.ui.button(controls, "Reset", () => { roll.set(0); pitch.set(0); yaw.set(0); draw(); });
    const status = RVD.ui.status(controls);

    const W = 520, H = 360;
    const box2 = RVD.ui.h("div", null, plots);
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "a3-svg", role: "img", "aria-label": "3-D view of a car with its body axes" }, box2);
    const defs = svgEl("defs", {}, svg);
    ["x", "y", "z"].forEach((a) => {
      const mk = svgEl("marker", { id: `a3-${a}-${root.id || "w"}`, viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: "auto-start-reverse" }, defs);
      svgEl("path", { d: "M0,0 L10,5 L0,10 z", class: "a3-head-" + a }, mk);
    });
    const g = svgEl("g", {}, svg);
    const hint = RVD.ui.h("p", "muted", box2, "Drag the picture to look from another angle. Curved arrows show the positive direction of each rotation (right-hand rule).");
    hint.style.cssText = "font-size:13px;margin:4px 0 0";

    let az = 35 * DEG, el = 22 * DEG;       // front-left three-quarter view
    const S = 100, cx = W / 2, cy = H / 2 + 20;

    function camera() {
      const d = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
      const f = scl(d, -1);
      const right = norm(cross(f, [0, 0, 1]));
      const up = cross(right, f);
      return { d, right, up };
    }

    function draw() {
      const c = CONV[conv];
      // Physical rotations in the internal (ISO-like, z up) frame. Roll has the same
      // sense in both conventions (right side down); SAE pitch and yaw are mirrored
      // because its y and z axes point the opposite way.
      const flip = conv === "sae" ? -1 : 1;
      const M = rotZYX(flip * yaw.value * DEG, flip * pitch.value * DEG, roll.value * DEG);
      const cam = camera();
      const P = (p) => [cx + S * dot(p, cam.right), cy - S * dot(p, cam.up), dot(p, cam.d)];
      g.textContent = "";

      // Ground grid (fixed)
      for (let k = -6; k <= 6; k++) {
        const i = k * 0.5, ZG = -0.30;   // 0.5 m grid on the ground, CG is 0.30 m up
        const a = P([i, -3, ZG]), b = P([i, 3, ZG]), c1 = P([-3, i, ZG]), d1 = P([3, i, ZG]);
        svgEl("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: "a3-grid" }, g);
        svgEl("line", { x1: c1[0], y1: c1[1], x2: d1[0], y2: d1[1], class: "a3-grid" }, g);
      }

      // Car faces, painter's algorithm
      const light = norm([0.3, 0.5, 1]);
      const faces = CAR.map((f) => {
        const pts = f.pts.map((p) => P(mul(M, p)));
        const n = mul(M, f.n);
        return { pts, depth: pts.reduce((s, q) => s + q[2], 0) / pts.length, facing: dot(n, cam.d), shade: 0.55 + 0.45 * Math.max(0, dot(n, light)), cls: f.cls };
      }).filter((f) => f.facing > 0).sort((a, b) => a.depth - b.depth);
      faces.forEach((f) => {
        const poly = svgEl("polygon", { points: f.pts.map((q) => q[0].toFixed(1) + "," + q[1].toFixed(1)).join(" "), class: "a3-face " + f.cls }, g);
        poly.style.fillOpacity = f.shade.toFixed(2);
      });

      // Body axes in the chosen convention
      const axes = [
        { k: "x", dir: [1, 0, 0], len: 2.1, label: "x (forward)" },
        { k: "y", dir: [0, c.ySign, 0], len: 1.35, label: c.y },
        { k: "z", dir: [0, 0, c.zSign], len: 1.2, label: c.z }
      ];
      const active = { roll: "x", pitch: "y", yaw: "z" }[last];
      axes.forEach((a) => {
        const dir = mul(M, a.dir);
        const o = P([0, 0, 0]), tip = P(scl(dir, a.len));
        svgEl("line", { x1: o[0], y1: o[1], x2: tip[0], y2: tip[1], class: "a3-axis a3-" + a.k, "marker-end": `url(#a3-${a.k}-${root.id || "w"})` }, g);
        svgEl("text", { x: tip[0] + 6, y: tip[1] - 6, class: "a3-label a3-" + a.k + "-t" }, g).textContent = a.label;
        // Right-hand-rule arc around the axis near its tip.
        let u = norm(cross(dir, Math.abs(dir[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
        const w = cross(dir, u);
        const centre = scl(dir, a.len * 0.74), r = 0.2, pts = [];
        for (let t = 0; t <= 1.5 * Math.PI; t += 0.12) pts.push(P(add(centre, add(scl(u, r * Math.cos(t)), scl(w, r * Math.sin(t))))));
        svgEl("polyline", { points: pts.map((q) => q[0] + "," + q[1]).join(" "), class: "a3-arc a3-" + a.k + (a.k === active ? " is-active" : ""), "marker-end": `url(#a3-${a.k}-${root.id || "w"})` }, g);
      });
      svgEl("circle", { cx: P([0, 0, 0])[0], cy: P([0, 0, 0])[1], r: 4, class: "a3-cg" }, g);

      const what = {
        roll: roll.value === 0 ? "" : `Roll ${roll.value > 0 ? "+" : ""}${roll.value}°: the ${roll.value > 0 ? "right" : "left"} side goes down.`,
        pitch: pitch.value === 0 ? "" : `Pitch ${pitch.value > 0 ? "+" : ""}${pitch.value}°: nose ${(pitch.value > 0) === (conv === "sae") ? "up" : "down"}.`,
        yaw: yaw.value === 0 ? "" : `Yaw ${yaw.value > 0 ? "+" : ""}${yaw.value}°: nose turns ${(yaw.value > 0) === (conv === "sae") ? "right" : "left"}.`
      };
      const msg = [what.roll, what.pitch, what.yaw].filter(Boolean).join(" ");
      status.set(msg || "Move a slider to rotate the car about one of its axes.", null);
    }

    // Orbit by dragging
    let drag = null;
    svg.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, az, el }; svg.setPointerCapture(e.pointerId); });
    svg.addEventListener("pointermove", (e) => {
      if (!drag) return;
      az = drag.az - (e.clientX - drag.x) * 0.01;
      el = Math.max(-0.1, Math.min(1.45, drag.el + (e.clientY - drag.y) * 0.01));
      draw();
    });
    ["pointerup", "pointercancel"].forEach((ev) => svg.addEventListener(ev, () => { drag = null; }));
    draw();
  };

  /* ================================================================== */
  const PRESETS = {
    straight: { label: "Straight", d: 0, r: 0, b: 0, V: 25 },
    right: { label: "Right turn", d: 3, r: 11.5, b: -0.5, V: 25 },
    left: { label: "Left turn", d: -3, r: -11.5, b: 0.5, V: 25 },
    drift: { label: "Drifting right", d: -6, r: 20, b: -12, V: 15 }
  };
  const A = 1.2, Bd = 1.3; // CG to front / rear axle (m)

  RVD.widgets["angles-top"] = function (root) {
    const { controls, plots } = RVD.ui.layout(root);
    let conv = "sae";
    // Physical state is stored in SAE values (positive = clockwise from above / to the right).
    const st = { d: 3, r: 11.5, b: -0.5, V: 25 };
    const sgn = () => (conv === "sae" ? 1 : -1);

    const convChoice = RVD.ui.choice(controls, {
      value: conv, options: Object.keys(CONV).map((k) => ({ label: CONV[k].label, value: k })),
      onInput: (k) => { conv = k; syncSliders(); draw(); }
    });
    const preset = RVD.ui.choice(controls, {
      value: "right", options: Object.keys(PRESETS).map((k) => ({ label: PRESETS[k].label, value: k })),
      onInput: (k) => { Object.assign(st, PRESETS[k]); syncSliders(); draw(true); }
    });
    RVD.ui.group(controls, "Motion (signs in the chosen convention)");
    const dS = RVD.ui.slider(controls, { label: "Steer angle δ", min: -15, max: 15, step: 0.5, value: 3, digits: 1, unit: "°", onInput: (x) => { st.d = x * sgn(); preset.set(null); draw(); } });
    const rS = RVD.ui.slider(controls, { label: "Yaw rate r", min: -30, max: 30, step: 0.5, value: 11.5, digits: 1, unit: "°/s", onInput: (x) => { st.r = x * sgn(); preset.set(null); draw(); } });
    const bS = RVD.ui.slider(controls, { label: "Sideslip β (at CG)", min: -15, max: 15, step: 0.5, value: -0.5, digits: 1, unit: "°", onInput: (x) => { st.b = x * sgn(); preset.set(null); draw(); } });
    const VS = RVD.ui.slider(controls, { label: "Speed V", min: 5, max: 40, step: 1, value: 25, digits: 0, unit: "m/s", onInput: (x) => { st.V = x; preset.set(null); draw(); } });
    function syncSliders() { dS.set(st.d * sgn()); rS.set(st.r * sgn()); bS.set(st.b * sgn()); VS.set(st.V); }

    // Angles are only a few degrees, so they are DRAWN magnified (the numbers are exact).
    // "Magnified" picks a factor so the largest angle is drawn at about 45°, and only changes
    // it when the angles drift well away from that, so dragging a slider does not make it jump.
    // One factor for the whole car keeps the front, CG and rear velocity directions comparable.
    const FACTORS = [1, 2, 3, 5, 10, 15, 20, 30];
    let magMode = "auto", EX = 10;
    RVD.ui.group(controls, "Drawing");
    RVD.ui.choice(controls, {
      value: "auto", options: [{ label: "Angles magnified", value: "auto" }, { label: "True size", value: "true" }],
      onInput: (v) => { magMode = v; draw(true); }
    });
    function pickMag(maxDeg, fresh) {
      if (magMode === "true") return 1;
      if (maxDeg < 0.05) return EX;
      const fit = FACTORS.filter((f) => f * maxDeg <= 45).pop() || 1;
      const drawn = EX * maxDeg;
      return fresh || drawn > 65 || drawn < 15 ? fit : EX;
    }

    const ro = RVD.ui.readouts(controls);
    const rAf = RVD.ui.readout(ro, "Front slip angle αf");
    const rAr = RVD.ui.readout(ro, "Rear slip angle αr");
    const status = RVD.ui.status(controls);

    const W = 460, H = 480, S = 58, cx = W / 2, cy = H / 2 + 12;   // car points UP the screen
    const box2 = RVD.ui.h("div", null, plots);
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "at-svg", role: "img", "aria-label": "Top view of the car showing steer, sideslip and slip angles" }, box2);
    const defs = svgEl("defs", {}, svg);
    ["v", "ax", "f"].forEach((k) => {
      const mk = svgEl("marker", { id: `at-${k}-${root.id || "w"}`, viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: "auto-start-reverse" }, defs);
      svgEl("path", { d: "M0,0 L10,5 L0,10 z", class: "at-head-" + k }, mk);
    });
    const mk = (k) => `url(#at-${k}-${root.id || "w"})`;
    const g = svgEl("g", {}, svg);

    // Screen mapping: body x (forward) = screen up; SAE y (right) = screen right.
    const toS = (x, y) => [cx + y * S, cy - x * S];
    const angPt = (x0, y0, ang, len) => toS(x0 + len * Math.cos(ang), y0 + len * Math.sin(ang)); // ang from +x, clockwise (SAE)
    const E = (a) => Math.max(-1.25, Math.min(1.25, a * EX));

    // A shaded ring segment between drawn directions a0 and a1, radii r0..r1 about (x0, y0).
    // Returns the middle of its outer arc, where the label's leader line ends.
    function wedge(x0, y0, a0, a1, r0, r1, cls) {
      if (Math.abs(a1 - a0) >= 0.05 * DEG) {
        const n = Math.max(6, Math.ceil(Math.abs(a1 - a0) / (3 * DEG)));
        const outer = [], inner = [];
        for (let i = 0; i <= n; i++) {
          const a = a0 + ((a1 - a0) * i) / n;
          outer.push(angPt(x0, y0, a, r1));
          inner.push(angPt(x0, y0, a, r0));
        }
        svgEl("polygon", { points: outer.concat(inner.reverse()).map((p) => p.join(",")).join(" "), class: "at-wedge " + cls }, g);
        svgEl("polyline", { points: outer.map((p) => p.join(",")).join(" "), class: "at-arc " + cls }, g);
      }
      return angPt(x0, y0, (a0 + a1) / 2, r1);
    }
    // Value labels sit in a column beside the car (on the side away from the drawn y axis),
    // each level with its wedge and joined to it by a leader. Rows are nudged apart if needed.
    function labelColumn(rows) {
      const side = CONV[conv].ySign < 0 ? -1 : 1;     // SAE: y drawn right, labels left
      const colX = toS(0, side * 2.3)[0];
      rows.sort((p, q) => p.at[1] - q.at[1]);
      let prev = -Infinity;
      rows.forEach((r) => { r.y = Math.max(r.at[1], prev + 19); prev = r.y; });
      rows.forEach((r) => {
        svgEl("line", { x1: colX - side * 6, y1: r.y - 4, x2: r.at[0], y2: r.at[1], class: "at-lead " + r.cls }, g);
        svgEl("text", { x: colX, y: r.y, "text-anchor": side < 0 ? "end" : "start", class: "at-angle " + r.cls }, g).textContent = r.text;
      });
    }
    function arrowTo(x0, y0, ang, len, cls, head) {
      const a = toS(x0, y0), b = angPt(x0, y0, ang, len);
      svgEl("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: cls, "marker-end": mk(head) }, g);
    }
    const fmtA = (rad) => `${rad * sgn() >= 0 ? "+" : "−"}${RVD.fmt(Math.abs(rad / DEG), 1)}°`;

    function draw(fresh) {
      g.textContent = "";
      const c = CONV[conv];
      const d = st.d * DEG, r = st.r * DEG, b = st.b * DEG, V = st.V;

      // Velocities (SAE, small yaw-rate kinematics): v = V(cos b, sin b) + r x pos
      const vx = V * Math.cos(b), vy = V * Math.sin(b);
      const vf = [vx, vy + A * r], vr = [vx, vy - Bd * r];
      const angF = Math.atan2(vf[1], vf[0]), angR = Math.atan2(vr[1], vr[0]);
      const aF = angF - d, aR = angR;
      EX = pickMag(Math.max(Math.abs(d), Math.abs(b), Math.abs(angF), Math.abs(angR)) / DEG, fresh);

      // Body axes (convention-dependent labels and direction of y)
      arrowTo(0, 0, 0, 3.4, "at-axis", "ax");
      const xt = toS(3.55, 0);
      svgEl("text", { x: xt[0], y: xt[1], "text-anchor": "middle", class: "at-axis-label" }, g).textContent = "x";
      const yEnd = c.ySign < 0 ? 1.9 : -1.9;  // SAE y to the right, ISO y to the left
      const o = toS(0, 0), ye = toS(0, yEnd);
      svgEl("line", { x1: o[0], y1: o[1], x2: ye[0], y2: ye[1], class: "at-axis", "marker-end": mk("ax") }, g);
      svgEl("text", { x: ye[0] + (yEnd > 0 ? 10 : -10), y: ye[1] + 4, "text-anchor": yEnd > 0 ? "start" : "end", class: "at-axis-label" }, g).textContent = c.y;
      svgEl("text", { x: 14, y: H - 10, class: "at-note" }, g).textContent = EX === 1
        ? "Angles drawn true size."
        : `Angles drawn ${EX}× larger than real for clarity; the numbers are exact.`;
      svgEl("text", { x: 14, y: 22, class: "at-note" }, g).textContent = conv === "sae"
        ? "z points into the screen (down). Positive angles: clockwise."
        : "z points out of the screen (up). Positive angles: counter-clockwise.";

      // Car body and wheels (body frame)
      const corners = [[2.2, -0.9], [2.2, 0.9], [-2.2, 0.9], [-2.2, -0.9]].map(([x, y]) => toS(x, y).join(",")).join(" ");
      svgEl("polygon", { points: corners, class: "at-body" }, g);
      const wheel = (x, y, steer) => {
        const pts = [[0.33, -0.12], [0.33, 0.12], [-0.33, 0.12], [-0.33, -0.12]].map(([px, py]) => {
          const rx = px * Math.cos(steer) - py * Math.sin(steer), ry = px * Math.sin(steer) + py * Math.cos(steer);
          return toS(x + rx, y + ry).join(",");
        }).join(" ");
        svgEl("polygon", { points: pts, class: "at-wheel" }, g);
      };
      [[A, -0.8, E(d)], [A, 0.8, E(d)], [-Bd, -0.8, 0], [-Bd, 0.8, 0]].forEach(([x, y, s]) => wheel(x, y, s));
      const cg = toS(0, 0);
      svgEl("circle", { cx: cg[0], cy: cg[1], r: 4, class: "at-cg" }, g);

      // Each angle is a shaded ring segment. Front δ and αf use separate rings so they stay
      // distinct even when the velocity lies almost along the x axis.
      const rows = [];
      // CG velocity and sideslip
      arrowTo(0, 0, E(b), 1.1, "at-vel", "v");
      rows.push({ text: "β " + fmtA(b), cls: "at-beta", at: wedge(0, 0, 0, E(b), 0.25, 0.82, "at-beta") });
      // Front axle: wheel heading (dashed), velocity, steer and slip angles
      const hf0 = toS(A, 0), hf1 = angPt(A, 0, E(d), 2.2);
      svgEl("line", { x1: hf0[0], y1: hf0[1], x2: hf1[0], y2: hf1[1], class: "at-heading" }, g);
      arrowTo(A, 0, E(angF), 2.0, "at-vel", "v");
      rows.push({ text: "δ " + fmtA(d), cls: "at-delta", at: wedge(A, 0, 0, E(d), 0.95, 1.3, "at-delta") });
      rows.push({ text: "αf " + fmtA(aF), cls: "at-alpha", at: wedge(A, 0, E(d), E(angF), 1.42, 1.78, "at-alpha") });
      // Rear axle
      const hr0 = toS(-Bd, 0), hr1 = toS(-Bd + 1.1, 0);
      svgEl("line", { x1: hr0[0], y1: hr0[1], x2: hr1[0], y2: hr1[1], class: "at-heading" }, g);
      arrowTo(-Bd, 0, E(angR), 1.1, "at-vel", "v");
      rows.push({ text: "αr " + fmtA(aR), cls: "at-alpha", at: wedge(-Bd, 0, 0, E(angR), 0.3, 0.82, "at-alpha") });
      labelColumn(rows);
      // Yaw rate indicator
      if (Math.abs(r) > 0.001) {
        const pts = [];
        for (let t = 0; t <= 1; t += 0.05) { const ang = -Math.PI / 2 + Math.sign(r) * t * 1.2; pts.push(toS(-2.9 + 0.5 * Math.cos(ang), 0.5 * Math.sin(ang) + 0.5 * 0)); }
        svgEl("polyline", { points: pts.map((p) => p.join(",")).join(" "), class: "at-yaw", "marker-end": mk("f") }, g);
        const tp = toS(-3.25, 0.9 * Math.sign(r));
        svgEl("text", { x: tp[0], y: tp[1], "text-anchor": "middle", class: "at-angle at-yawt" }, g).textContent = "r " + fmtA(r).replace("°", "°/s");
      }
      // Tire lateral forces oppose the slip: Fy = -C alpha (SAE). Show direction only.
      [[A, aF], [-Bd, aR]].forEach(([x, a]) => {
        if (Math.abs(a) < 0.2 * DEG) return;
        const dir = -Math.sign(a);                  // +1 = toward +y SAE = right
        const p0 = toS(x, 1.25 * dir), p1 = toS(x, 2.1 * dir);
        svgEl("line", { x1: p0[0], y1: p0[1], x2: p1[0], y2: p1[1], class: "at-force", "marker-end": mk("f") }, g);
      });

      rAf.set(fmtA(aF));
      rAr.set(fmtA(aR));
      const side = (a) => (a < 0 ? "right" : "left");
      const turning = Math.abs(st.r) < 0.5 ? "driving straight" : `turning ${st.r > 0 ? "right" : "left"}`;
      status.set(Math.abs(aF) < 0.2 * DEG && Math.abs(aR) < 0.2 * DEG
        ? "No slip angles: no lateral tire forces."
        : `The car is ${turning}. Front tire force points ${side(aF)}, rear points ${side(aR)} (orange arrows). ` +
          (conv === "sae" ? "In SAE, a negative slip angle gives a positive (rightward) force: Fy = −Cα·α." : "In ISO, a positive slip angle gives a positive (leftward) force."), null);
    }
    syncSliders();
    draw(true);
  };
})();
