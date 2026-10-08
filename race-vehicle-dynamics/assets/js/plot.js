/*
 * Tiny dependency-free SVG plotting helper used by the course widgets.
 *
 *   const p = RVD.plot(container, { xlim: [0, 15], ylim: [0, 6000],
 *                                   xlabel: "Slip angle (deg)", ylabel: "Fy (N)" });
 *   p.line("fy", points, "series c1");        // points: [[x, y], ...]
 *   p.point("peak", x, y, { cls: "f2" });
 *   p.label("txt", x, y, "Peak", { cls: "annot f2", dx: 6, dy: -6 });
 *
 * Calling line/point/label again with the same key updates the element in
 * place, so widgets can simply redraw everything on every slider input.
 * Colors come from CSS classes (c1..c5 stroke, f1..f5 fill) so both themes work.
 */
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const RVD = (window.RVD = window.RVD || {});

  function el(tag, attrs, parent) {
    const node = document.createElementNS(NS, tag);
    for (const k in attrs || {}) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }
  RVD.svgEl = el;

  function niceStep(range, target) {
    const raw = range / Math.max(1, target);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const nice = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
    return nice * mag;
  }

  function ticks(lo, hi, target) {
    const step = niceStep(hi - lo, target);
    const out = [];
    const start = Math.ceil(lo / step - 1e-9) * step;
    for (let v = start; v <= hi + step * 1e-9; v += step) out.push(+v.toFixed(10));
    return { values: out, step: step };
  }

  function fmtTick(v, step) {
    const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
    if (Math.abs(v) >= 10000) return (v / 1000).toFixed(decimals > 0 ? 1 : 0) + "k";
    return v.toFixed(decimals);
  }

  RVD.plot = function (container, opts) {
    const o = Object.assign(
      { width: 560, height: 340, xticks: 6, yticks: 5, margin: {} },
      opts || {}
    );
    // fixedText plots keep text at a constant screen size, so leave more room for it.
    const m = Object.assign(o.fixedText ? { l: 96, r: 16, t: 18, b: 62 } : { l: 58, r: 16, t: 14, b: 46 }, o.margin);
    let k = 1;   // text scale in viewBox units per screen px (fixedText only)
    const W = o.width, H = o.height;
    let vx = 0;  // left edge of the viewBox: trimmed so the y-axis title sits at the left edge
    const iw = W - m.l - m.r, ih = H - m.t - m.b;

    const svg = el("svg", {
      viewBox: `0 0 ${W} ${H}`, class: "plot", role: "img",
      "aria-label": o.ariaLabel || `${o.ylabel || "y"} versus ${o.xlabel || "x"}`
    }, container);
    const clipId = "clip-" + Math.random().toString(36).slice(2, 9);
    const defs = el("defs", {}, svg);
    el("rect", { x: 0, y: 0, width: iw, height: ih }, el("clipPath", { id: clipId }, defs));

    const gAxes = el("g", {}, svg);
    const gPlot = el("g", { transform: `translate(${m.l},${m.t})` }, svg);
    const gData = el("g", { "clip-path": `url(#${clipId})` }, gPlot);
    const gTop = el("g", {}, gPlot);

    // Optional: keep text the same size on screen however wide the plot is drawn.
    // A ResizeObserver feeds the viewBox-to-screen ratio into a CSS variable.
    if (o.fixedText && typeof ResizeObserver !== "undefined") {
      svg.classList.add("plot--fixed-text");
      new ResizeObserver(() => {
        const w = svg.getBoundingClientRect().width;
        if (w > 0) {
          const nk = Math.min((W - vx) / w, 1.65);   // on very small plots, let text shrink a little rather than crowd
          svg.style.setProperty("--pt", nk.toFixed(4));
          if (Math.abs(nk - k) > 0.01) {   // move tick labels / titles to suit the text size
            k = nk; drawAxes();
            if (o.onTextScale) o.onTextScale(k);   // lets a widget re-place its own text
          }
        }
      }).observe(svg);
    }

    const items = new Map();
    let xlim = o.xlim, ylim = o.ylim;

    const sx = (x) => ((x - xlim[0]) / (xlim[1] - xlim[0])) * iw;
    const sy = (y) => ih - ((y - ylim[0]) / (ylim[1] - ylim[0])) * ih;

    function drawAxes() {
      gAxes.textContent = "";
      const g = el("g", { transform: `translate(${m.l},${m.t})` }, gAxes);
      const xt = ticks(xlim[0], xlim[1], o.xticks);
      const yt = ticks(ylim[0], ylim[1], o.yticks);
      xt.values.forEach((v) => {
        el("line", { x1: sx(v), x2: sx(v), y1: 0, y2: ih, class: "plot__grid" }, g);
        const t = el("text", { x: sx(v), y: ih + 5 + 13 * k, "text-anchor": "middle" }, g);
        t.textContent = (o.xfmt || fmtTick)(v, xt.step);
      });
      const yTickText = yt.values.map((v) => {
        el("line", { x1: 0, x2: iw, y1: sy(v), y2: sy(v), class: "plot__grid" }, g);
        const t = el("text", { x: -8, y: sy(v) + 4, "text-anchor": "end" }, g);
        t.textContent = (o.yfmt || fmtTick)(v, yt.step);
        return t;
      });
      if (xlim[0] < 0 && xlim[1] > 0) el("line", { x1: sx(0), x2: sx(0), y1: 0, y2: ih, class: "plot__zero" }, g);
      if (ylim[0] < 0 && ylim[1] > 0) el("line", { x1: 0, x2: iw, y1: sy(0), y2: sy(0), class: "plot__zero" }, g);
      el("line", { x1: 0, x2: iw, y1: ih, y2: ih, class: "plot__axis" }, g);
      el("line", { x1: 0, x2: 0, y1: 0, y2: ih, class: "plot__axis" }, g);
      if (o.xlabel) {
        const t = el("text", { x: iw / 2, y: ih + 10 + 28 * k, "text-anchor": "middle", class: "plot__label" }, g);
        t.textContent = o.xlabel;
      }
      // The y-axis title sits a fixed gap outside the widest tick label, and the viewBox is
      // trimmed (or widened) on the left to match, so there is no empty strip beside it.
      const tickW = Math.max(0, ...yTickText.map((t) => measure(t, 12).width));
      let left = -8 - tickW;
      if (o.ylabel) {
        const t = el("text", { x: -ih / 2, y: 0, transform: "rotate(-90)", "text-anchor": "middle", class: "plot__label" }, g);
        t.textContent = o.ylabel;
        // Rotated -90 deg, the text's local y runs right-to-left on screen: [b.y, b.y + b.height]
        // is its horizontal extent, with the baseline at 0.
        const b = measure(t, 13);
        const baseline = left - 7 * k - (b.y + b.height);
        t.setAttribute("y", baseline);
        left = baseline + b.y;
      }
      const nvx = Math.round(m.l + left - 3);
      if (nvx !== vx) {
        vx = nvx;
        svg.setAttribute("viewBox", `${vx} 0 ${W - vx} ${H}`);
      }
    }

    // Text size in viewBox units; falls back to an estimate when the SVG is not laid out yet.
    function measure(t, px) {
      try {
        const b = t.getBBox();
        if (b.width > 0) return b;
      } catch (e) { /* not rendered */ }
      const fs = px * k;
      return { x: 0, y: -0.93 * fs, width: 0.58 * fs * t.textContent.length, height: 1.15 * fs };
    }

    function upsert(key, tag, parent) {
      let node = items.get(key);
      if (!node || node.tagName !== tag) {
        if (node) node.remove();
        node = el(tag, {}, parent);
        items.set(key, node);
      }
      return node;
    }

    function pathD(pts, close) {
      let d = "";
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (p == null || !isFinite(p[0]) || !isFinite(p[1])) continue;
        d += (d ? "L" : "M") + sx(p[0]).toFixed(2) + "," + sy(p[1]).toFixed(2);
      }
      return close && d ? d + "Z" : d;
    }

    drawAxes();

    return {
      svg, sx, sy, width: W, height: H, inner: { w: iw, h: ih },
      get xlim() { return xlim; },
      get ylim() { return ylim; },
      get textScale() { return k; },

      setLabels(xlabel, ylabel) {
        if (xlabel != null) o.xlabel = xlabel;
        if (ylabel != null) o.ylabel = ylabel;
        drawAxes();
      },

      setLimits(newX, newY) {
        xlim = newX || xlim;
        ylim = newY || ylim;
        drawAxes();
      },

      line(key, pts, cls, extra) {
        const n = upsert(key, "path", extra && extra.top ? gTop : gData);
        n.setAttribute("d", pathD(pts, false));
        n.setAttribute("class", cls || "series c1");
        if (extra && extra.markerEnd) n.setAttribute("marker-end", extra.markerEnd);
        return n;
      },

      area(key, pts, cls) {
        const n = upsert(key, "path", gData);
        n.setAttribute("d", pathD(pts, true));
        n.setAttribute("class", "area " + (cls || "f1"));
        return n;
      },

      point(key, x, y, opt) {
        opt = opt || {};
        const n = upsert(key, "circle", gTop);
        n.setAttribute("cx", sx(x));
        n.setAttribute("cy", sy(y));
        n.setAttribute("r", opt.r || 5);
        n.setAttribute("class", "marker " + (opt.cls || "f1"));
        return n;
      },

      label(key, x, y, text, opt) {
        opt = opt || {};
        const n = upsert(key, "text", gTop);
        n.setAttribute("x", sx(x) + (opt.dx || 0));
        n.setAttribute("y", sy(y) + (opt.dy || 0));
        n.setAttribute("text-anchor", opt.anchor || "start");
        n.setAttribute("class", opt.cls || "annot");
        n.textContent = text;
        return n;
      },

      remove(key) {
        const n = items.get(key);
        if (n) { n.remove(); items.delete(key); }
      },

      /* Arrowhead marker definition; returns a url() for marker-end. */
      arrow(cls) {
        const id = "arw-" + cls.replace(/\W/g, "") + "-" + clipId;
        if (!defs.querySelector("#" + id)) {
          const mk = el("marker", {
            id, viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse"
          }, defs);
          el("path", { d: "M0,0 L10,5 L0,10 z", class: cls }, mk);
        }
        return `url(#${id})`;
      },

      /* Convert a pointer event to data coordinates. */
      toData(evt) {
        const pt = svg.createSVGPoint();
        pt.x = evt.clientX; pt.y = evt.clientY;
        const p = pt.matrixTransform(svg.getScreenCTM().inverse());
        const px = p.x - m.l, py = p.y - m.t;
        return [
          xlim[0] + (px / iw) * (xlim[1] - xlim[0]),
          ylim[0] + ((ih - py) / ih) * (ylim[1] - ylim[0])
        ];
      }
    };
  };

  /* Legend helper: items = [{ label, color: "var(--s1)", dash: true }] */
  RVD.legend = function (container, itemsList) {
    const div = document.createElement("div");
    div.className = "legend";
    itemsList.forEach((it) => {
      const s = document.createElement("span");
      const i = document.createElement("i");
      i.style.background = it.color;
      i.style.color = it.color;
      if (it.dash) i.className = "dash";
      if (it.area) i.className = "area";
      s.appendChild(i);
      s.appendChild(document.createTextNode(it.label));
      div.appendChild(s);
    });
    container.appendChild(div);
    return div;
  };
})();
