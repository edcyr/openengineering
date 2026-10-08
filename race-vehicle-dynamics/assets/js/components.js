/*
 * Reusable lesson components:
 *   - RVD.store     progress persistence (localStorage, fails soft)
 *   - RVD.ui        slider / readout / button helpers for widgets
 *   - RVD.checks    enhancement of .mcq and .numeric blocks in lesson HTML
 *
 * Authoring syntax for checks is documented in README.md and
 * templates/lesson-template.html.
 */
(function () {
  const RVD = (window.RVD = window.RVD || {});
  RVD.widgets = RVD.widgets || {};

  /* ---------------- Formatting ---------------- */
  RVD.fmt = function (v, digits) {
    if (!isFinite(v)) return "—";
    const d = digits == null ? 2 : digits;
    return Number(v).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
  };
  RVD.G = 9.81;
  RVD.deg = Math.PI / 180;

  /* ---------------- Progress store ---------------- */
  const KEY = "rvd-progress-v1";
  let cache = null;
  function load() {
    if (cache) return cache;
    try { cache = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { cache = {}; }
    cache.completed = cache.completed || {};
    cache.answers = cache.answers || {};
    return cache;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) { /* storage unavailable */ }
  }
  RVD.store = {
    isComplete: (id) => !!load().completed[id],
    setComplete(id, done) {
      const s = load();
      if (done) s.completed[id] = new Date().toISOString(); else delete s.completed[id];
      save();
      document.dispatchEvent(new CustomEvent("rvd:progress"));
    },
    getAnswer: (qid) => load().answers[qid],
    setAnswer(qid, data) { load().answers[qid] = data; save(); },
    reset() { cache = { completed: {}, answers: {} }; save(); document.dispatchEvent(new CustomEvent("rvd:progress")); }
  };

  /* ---------------- Math ---------------- */
  RVD.renderMath = function (el) {
    if (!el || typeof window.renderMathInElement !== "function") return;
    window.renderMathInElement(el, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "\\[", right: "\\]", display: true },
        { left: "\\(", right: "\\)", display: false }
      ],
      throwOnError: false
    });
  };

  /* ---------------- Widget UI helpers ---------------- */
  function h(tag, cls, parent, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }

  let uid = 0;
  RVD.ui = {
    h,

    /* Standard widget layout: controls column + plots column. */
    layout(root, opt) {
      opt = opt || {};
      const fb = root.querySelector(".widget-fallback");
      if (fb) fb.remove();
      const body = h("div", "widget__body" + (opt.stack ? " widget__body--stack" : ""), root);
      const controls = h("div", "widget__controls", body);
      const plots = h("div", "widget__plots" + (opt.plots === 2 ? " widget__plots--2" : opt.plots === 3 ? " widget__plots--3" : ""), body);
      return { body, controls, plots };
    },

    group(parent, title) { return h("div", "control-group-title", parent, title); },

    slider(parent, o) {
      const id = "ctl-" + ++uid;
      const wrap = h("div", "control", parent);
      const label = h("label", null, wrap, o.label);
      label.htmlFor = id;
      const out = h("output", null, wrap);
      const input = h("input", null, wrap);
      Object.assign(input, { type: "range", id, min: o.min, max: o.max, step: o.step || "any", value: o.value });
      const fmt = o.format || ((v) => RVD.fmt(v, o.digits == null ? 2 : o.digits) + (o.unit ? " " + o.unit : ""));
      const show = () => { out.textContent = fmt(+input.value); };
      input.addEventListener("input", () => { show(); o.onInput && o.onInput(+input.value); });
      show();
      return {
        input,
        get value() { return +input.value; },
        set(v) { input.value = v; show(); }
      };
    },

    /* Toggle-button group; returns { get value, set }. */
    choice(parent, o) {
      const row = h("div", "btn-row", parent);
      let value = o.value;
      const btns = o.options.map((opt) => {
        const b = h("button", "btn-sm", row, opt.label);
        b.type = "button";
        b.addEventListener("click", () => { set(opt.value); o.onInput && o.onInput(value); });
        return { b, opt };
      });
      function set(v) {
        value = v;
        btns.forEach(({ b, opt }) => b.setAttribute("aria-pressed", String(opt.value === v)));
      }
      set(value);
      return { get value() { return value; }, set };
    },

    button(parent, label, onClick) {
      const b = h("button", "btn-sm", parent, label);
      b.type = "button";
      b.addEventListener("click", onClick);
      return b;
    },

    readouts(parent) { return h("div", "readouts", parent); },

    readout(parent, label) {
      const box = h("div", "readout", parent);
      h("div", "readout__label", box, label);
      const val = h("div", "readout__value", box, "—");
      return {
        set(text, state) {
          val.textContent = text;
          box.className = "readout" + (state ? " readout--" + state : "");
        }
      };
    },

    status(parent) {
      const div = h("div", "status-line", parent);
      div.setAttribute("aria-live", "polite");
      return {
        set(text, state) {
          div.textContent = text;
          div.className = "status-line" + (state ? " status-line--" + state : "");
        }
      };
    }
  };

  /* ---------------- Multiple choice ---------------- */
  function enhanceMcq(block, index) {
    const qid = block.dataset.id || location.pathname + "#mcq" + index;
    const list = block.querySelector("ul, ol");
    if (!list) return;
    const label = h("div", "mcq__label", null, "Check your understanding");
    block.insertBefore(label, block.firstChild);

    const options = Array.from(list.children).map((li, i) => {
      const why = li.querySelector(".why");
      const whyHTML = why ? why.innerHTML : "";
      if (why) why.remove();
      return { html: li.innerHTML, correct: li.hasAttribute("data-correct"), why: whyHTML, i };
    });

    const ul = h("ul", "mcq__options");
    list.replaceWith(ul);
    const feedback = h("div", "feedback", block);
    feedback.setAttribute("aria-live", "polite");

    const buttons = options.map((opt) => {
      const li = h("li", null, ul);
      const b = h("button", "mcq__option", li);
      b.type = "button";
      h("span", "mcq__option-letter", b, String.fromCharCode(65 + opt.i));
      const span = h("span", null, b);
      span.innerHTML = opt.html;
      b.addEventListener("click", () => choose(opt.i, true));
      return b;
    });

    function choose(i, record) {
      const opt = options[i];
      buttons.forEach((b) => b.classList.remove("is-correct", "is-wrong"));
      buttons[i].classList.add(opt.correct ? "is-correct" : "is-wrong");
      feedback.className = "feedback " + (opt.correct ? "feedback--ok" : "feedback--bad");
      feedback.innerHTML = "<strong>" + (opt.correct ? "Correct." : "Not quite.") + "</strong> " +
        (opt.why || (opt.correct ? "" : "Have another look and try again."));
      RVD.renderMath(feedback);
      if (record) RVD.store.setAnswer(qid, { choice: i, correct: opt.correct, at: Date.now() });
    }

    const prev = RVD.store.getAnswer(qid);
    if (prev && prev.correct && options[prev.choice]) choose(prev.choice, false);
  }

  /* ---------------- Calculator (safe expression evaluator, no eval) ----------------
   * Numbers (incl. 1.2e3), + - * / ^ (or **), parentheses, unary minus.
   * Constants: pi, e, g (9.81), deg (pi/180).
   * Functions: sqrt, cbrt, abs, exp, ln, log (base 10), log10,
   *            sin cos tan asin acos atan (radians), sind cosd tand asind acosd atand (degrees),
   *            atan2(y, x), pow(a, b), min(...), max(...).
   * Also accepts × · ÷ − π √ ² ³ as typed or pasted from a calculator.
   * RVD.calc(text) -> { value } or { error }.
   */
  const CONSTS = { pi: Math.PI, e: Math.E, g: 9.81, deg: Math.PI / 180 };
  const D2R = Math.PI / 180;
  const FUNCS = {
    sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, exp: Math.exp,
    ln: Math.log, log: Math.log10, log10: Math.log10,
    sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
    sind: (x) => Math.sin(x * D2R), cosd: (x) => Math.cos(x * D2R), tand: (x) => Math.tan(x * D2R),
    asind: (x) => Math.asin(x) / D2R, acosd: (x) => Math.acos(x) / D2R, atand: (x) => Math.atan(x) / D2R,
    atan2: Math.atan2, pow: Math.pow, min: Math.min, max: Math.max
  };

  RVD.calc = function (text) {
    let src = String(text)
      .replace(/[×·∙]/g, "*").replace(/÷/g, "/").replace(/[−–—]/g, "-")
      .replace(/π/g, "pi").replace(/²/g, "^2").replace(/³/g, "^3").replace(/\*\*/g, "^").trim();
    // Treat commas as thousands separators unless the expression uses functions with arguments.
    if (!/\(/.test(src)) src = src.replace(/,/g, "");
    if (!src) return { error: "empty" };

    // Tokenize
    const toks = [];
    const re = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z_0-9]*)|(√)|([-+*/^(),]))/y;
    let pos = 0;
    while (pos < src.length) {
      re.lastIndex = pos;
      const m = re.exec(src);
      if (!m) return { error: `unexpected “${src.slice(pos).trim()[0]}”` };
      if (m[1]) toks.push({ t: "num", v: parseFloat(m[1]) });
      else if (m[2]) toks.push({ t: "id", v: m[2].toLowerCase() });
      else if (m[3]) toks.push({ t: "op", v: "√" });
      else toks.push({ t: "op", v: m[4] });
      pos = re.lastIndex;
    }

    let i = 0;
    const peek = () => toks[i];
    const isOp = (v) => peek() && peek().t === "op" && peek().v === v;
    function fail(msg) { throw new Error(msg); }
    function expect(v) { if (!isOp(v)) fail(`expected “${v}”`); i++; }

    function expr() {
      let v = term();
      while (isOp("+") || isOp("-")) { const o = toks[i++].v; const r = term(); v = o === "+" ? v + r : v - r; }
      return v;
    }
    function term() {
      let v = unary();
      for (;;) {
        if (isOp("*") || isOp("/")) { const o = toks[i++].v; const r = unary(); v = o === "*" ? v * r : v / r; }
        // Implicit multiplication: 2pi, 3(4+1), 2 sqrt(3), (1+2)(3+4)
        else if (peek() && (peek().t === "id" || isOp("(") || isOp("√"))) v *= unary();
        else return v;
      }
    }
    function unary() {
      if (isOp("-")) { i++; return -unary(); }
      if (isOp("+")) { i++; return unary(); }
      if (isOp("√")) { i++; return Math.sqrt(unary()); }
      return power();
    }
    function power() {
      const base = atom();
      if (isOp("^")) { i++; return Math.pow(base, unary()); }   // right-associative; -2^2 = -4
      return base;
    }
    function atom() {
      const tk = toks[i++];
      if (!tk) fail("expression ends too soon");
      if (tk.t === "num") return tk.v;
      if (tk.t === "op" && tk.v === "(") { const v = expr(); expect(")"); return v; }
      if (tk.t === "id") {
        if (FUNCS[tk.v]) {
          if (!isOp("(")) fail(`${tk.v} needs brackets, e.g. ${tk.v}(2)`);
          i++;
          const args = [expr()];
          while (isOp(",")) { i++; args.push(expr()); }
          expect(")");
          return FUNCS[tk.v](...args);
        }
        if (tk.v in CONSTS) return CONSTS[tk.v];
        fail(`unknown name “${tk.v}”`);
      }
      fail(`unexpected “${tk.v}”`);
    }

    try {
      const v = expr();
      if (i < toks.length) fail(`unexpected “${toks[i].v}”`);
      if (!isFinite(v)) return { error: "result is not a finite number" };
      return { value: v };
    } catch (err) {
      return { error: err.message };
    }
  };

  const fmtSig = (v) => {
    const a = Math.abs(v);
    if (a !== 0 && (a >= 1e7 || a < 1e-4)) return v.toExponential(4);
    return String(+v.toPrecision(6));
  };
  RVD.calc.format = fmtSig;

  /* ---------------- Numeric answer ---------------- */
  const UNIT_FACTORS = [
    { f: 3.6, msg: "Your answer is off by a factor of 3.6 — check m/s vs km/h." },
    { f: 9.81, msg: "Your answer is off by a factor of g (9.81) — check whether you need m/s² or g, or N vs kg." },
    { f: 1000, msg: "Your answer is off by a factor of 1000 — check N vs kN, or mm vs m." },
    { f: 180 / Math.PI, msg: "Your answer is off by a factor of 57.3 — check degrees vs radians." },
    { f: 2, msg: "Your answer is off by a factor of 2 — check per-wheel vs per-axle values." },
    { f: 100, msg: "Your answer is off by a factor of 100 — check percent vs fraction." }
  ];

  function enhanceNumeric(block, index) {
    const qid = block.dataset.id || location.pathname + "#num" + index;
    const answer = parseFloat(block.dataset.answer);
    const relTol = block.dataset.tol != null ? parseFloat(block.dataset.tol) : 0.02;
    const absTol = block.dataset.abs != null ? parseFloat(block.dataset.abs) : 0;
    const units = block.dataset.units || "";

    block.insertBefore(h("div", "numeric__label", null, "Try it"), block.firstChild);

    const hintSrc = block.querySelector(".hint");
    const solSrc = block.querySelector(".solution");

    const row = h("div", "numeric__row");
    const input = h("input", "numeric__input", row);
    Object.assign(input, { type: "text", inputMode: "text", autocomplete: "off", spellcheck: false, placeholder: "Number or calculation" });
    input.setAttribute("aria-label", "Your answer" + (units ? " in " + units : ""));
    if (units) h("span", "numeric__units", row, units);
    const btn = h("button", "btn-sm", row, "Check");
    btn.type = "button";
    const preview = h("div", "numeric__preview");
    preview.setAttribute("aria-live", "polite");
    const feedback = h("div", "feedback");
    feedback.setAttribute("aria-live", "polite");

    const insertAt = hintSrc || solSrc;
    block.insertBefore(row, insertAt);
    block.insertBefore(preview, insertAt);
    block.insertBefore(feedback, insertAt);

    const TIP = "Tip: you can type a calculation, e.g. sqrt(1.2*g*40)";
    const TIP_TITLE = "Operators: + - * / ^ ( )\nConstants: pi, e, g = 9.81, deg = pi/180\n" +
      "Functions: sqrt, abs, exp, ln, log, sin/cos/tan (radians),\nsind/cosd/tand (degrees), asin, acos, atan, atan2(y, x), min, max";
    preview.title = TIP_TITLE;

    function showTip() {
      preview.className = "numeric__preview is-tip";
      preview.textContent = TIP + " \u2014 ";
      const a = h("a", null, preview, "calculator guide");
      a.href = (document.body.dataset.root || ".") + "/index.html#calculator";
    }

    function isPlainNumber(raw) { return /^[-+]?(\d[\d,]*\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(raw); }

    function updatePreview() {
      const raw = input.value.trim();
      if (!raw) { showTip(); return; }
      const r = RVD.calc(raw);
      if (r.error) {
        preview.className = "numeric__preview is-error";
        preview.textContent = "Can\u2019t calculate this yet: " + r.error;
      } else if (isPlainNumber(raw)) {
        showTip();
      } else {
        preview.className = "numeric__preview is-value";
        preview.textContent = "= " + RVD.calc.format(r.value) + (units ? " " + units : "");
      }
    }
    input.addEventListener("input", updatePreview);

    function toDetails(src, summary) {
      if (!src) return null;
      const d = document.createElement("details");
      h("summary", null, d, summary);
      const inner = h("div", null, d);
      while (src.firstChild) inner.appendChild(src.firstChild);
      src.replaceWith(d);
      return d;
    }
    toDetails(hintSrc, "Hint");
    const sol = toDetails(solSrc, "Worked solution");
    let locked = null;
    if (sol) {
      sol.hidden = true;
      locked = h("p", "muted", null, "Make an attempt to unlock the worked solution.");
      locked.style.fontSize = "14px";
      locked.style.margin = "8px 0 0";
      block.insertBefore(locked, sol);
    }
    function unlock() {
      if (sol) sol.hidden = false;
      if (locked) { locked.remove(); locked = null; }
    }

    function within(v, target) {
      return Math.abs(v - target) <= Math.max(absTol, Math.abs(target) * relTol);
    }

    function check(record) {
      const raw = input.value.trim();
      const r = RVD.calc(raw);
      if (!raw || r.error) {
        feedback.className = "feedback feedback--bad";
        feedback.textContent = raw
          ? "Can\u2019t calculate that: " + r.error + ". Check the brackets and operators."
          : "Enter a number or a calculation" + (units ? " in " + units : "") + ".";
        return;
      }
      const v = r.value;
      unlock();
      let ok = within(v, answer);
      let msg;
      if (ok) {
        msg = "<strong>Correct.</strong> " + RVD.fmt(answer, decimals(answer)) + (units ? " " + units : "") + ".";
      } else {
        msg = "<strong>Not quite.</strong> ";
        const hint = UNIT_FACTORS.find(({ f }) => within(v, answer * f) || within(v, answer / f));
        if (within(-v, answer)) msg += "The magnitude is right — check your sign convention.";
        else if (hint) msg += hint.msg;
        else msg += "Check your working, or open the hint.";
      }
      feedback.className = "feedback " + (ok ? "feedback--ok" : "feedback--bad");
      feedback.innerHTML = msg;
      if (record) RVD.store.setAnswer(qid, { value: v, expr: raw, correct: ok, at: Date.now() });
    }

    function decimals(x) {
      const a = Math.abs(x);
      return a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3;
    }

    btn.addEventListener("click", () => check(true));
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") check(true); });

    const prev = RVD.store.getAnswer(qid);
    if (prev && prev.value != null) { input.value = prev.expr != null ? prev.expr : prev.value; check(false); }
    updatePreview();
  }

  RVD.checks = {
    enhance(root) {
      root.querySelectorAll(".mcq").forEach(enhanceMcq);
      root.querySelectorAll(".numeric").forEach(enhanceNumeric);
    }
  };

  /* ---------------- Widget mounting ---------------- */
  RVD.mountWidgets = function (root) {
    root.querySelectorAll("[data-widget]").forEach((node) => {
      const name = node.dataset.widget;
      const fn = RVD.widgets[name];
      if (!fn) {
        const p = node.querySelector(".widget-fallback") || h("p", "widget-fallback", node);
        p.textContent = `Interactive "${name}" is not available (script not loaded).`;
        return;
      }
      try { fn(node); } catch (err) {
        console.error("Widget " + name + " failed:", err);
        h("p", "widget-fallback", node, "This interactive failed to load. See the browser console for details.");
      }
    });
  };
})();
