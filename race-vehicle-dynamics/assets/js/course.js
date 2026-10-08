/*
 * Course shell: builds the top bar, sidebar navigation, lesson header/footer,
 * home-page module grid, instructor-guide tables and planned-lesson stubs —
 * all from RVD_COURSE (assets/js/course-data.js).
 *
 * Every page sets on <body>:
 *   data-root   relative path from the page to the course root ("." or "../..")
 *   data-page   "home" | "lesson" | "planned" | "guide" | "reference"
 *   data-lesson lesson id (lesson pages only)
 *   data-ref    reference page id (reference pages only)
 */
(function () {
  const RVD = (window.RVD = window.RVD || {});
  const C = window.RVD_COURSE;
  const h = RVD.ui.h;

  const body = document.body;
  const root = (body.dataset.root || ".").replace(/\/$/, "");
  const page = body.dataset.page || "lesson";

  /* ---------------- Course index helpers ---------------- */
  const allLessons = [];
  C.modules.forEach((mod) => {
    mod.lessons.forEach((les, i) => allLessons.push(Object.assign({ module: mod, index: i }, les)));
  });
  const byId = (id) => allLessons.find((l) => l.id === id);
  const isAvailable = (l) => l.status === "ready" || l.status === "draft";
  const href = (l) => (l.file ? `${root}/${l.file}` : `${root}/planned.html?id=${encodeURIComponent(l.id)}`);
  const rcvdOf = (l) => l.rcvd || l.module.rcvd || [];
  RVD.course = { allLessons, byId, href };

  function rcvdChip(n) {
    const c = h("span", "chip chip--rcvd", null, `${C.reference.short} Ch. ${n}`);
    c.title = `${C.reference.title}, Ch. ${n}: ${C.rcvdChapters[n] || ""}`;
    return c;
  }
  function statusChip(status) {
    const label = { ready: "Ready", draft: "Draft", planned: "Planned" }[status] || status;
    return h("span", "chip chip--" + status, null, label);
  }

  /* ---------------- Theme ---------------- */
  const THEME_KEY = "rvd-theme";
  function applyTheme(t) {
    if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
  }
  let theme = "auto";
  try { theme = localStorage.getItem(THEME_KEY) || "auto"; } catch (e) {}
  applyTheme(theme);

  /* ---------------- Shell ---------------- */
  function buildShell() {
    const content = Array.from(body.children).filter((n) => n.tagName !== "SCRIPT" && n.tagName !== "NOSCRIPT");

    const top = h("header", "topbar");
    const toggle = h("button", "icon-btn nav-toggle", top, "☰");
    toggle.type = "button";
    toggle.setAttribute("aria-label", "Toggle course navigation");
    toggle.addEventListener("click", () => body.classList.toggle("nav-open"));

    const brand = h("a", "topbar__brand", top);
    brand.href = `${root}/index.html`;
    h("span", "topbar__logo", brand, "RVD");
    h("span", null, brand, C.title);
    h("div", "topbar__spacer", top);

    const prog = h("div", "topbar__progress", top);
    const bar = h("div", "progress-bar", prog);
    const fill = h("span", null, bar);
    const progText = h("span", null, prog);
    function updateProgress() {
      const avail = allLessons.filter(isAvailable);
      const done = avail.filter((l) => RVD.store.isComplete(l.id)).length;
      fill.style.width = avail.length ? (100 * done) / avail.length + "%" : "0";
      progText.textContent = `${done}/${avail.length} done`;
      progText.title = `${done} of ${avail.length} available lessons completed`;
    }
    updateProgress();
    document.addEventListener("rvd:progress", updateProgress);

    const themeBtn = h("button", "icon-btn", top);
    themeBtn.type = "button";
    const themeLabel = () => ({ auto: "◐ Auto", light: "☀ Light", dark: "☾ Dark" }[theme]);
    themeBtn.textContent = themeLabel();
    themeBtn.setAttribute("aria-label", "Change color theme");
    themeBtn.addEventListener("click", () => {
      theme = { auto: "light", light: "dark", dark: "auto" }[theme];
      applyTheme(theme);
      try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
      themeBtn.textContent = themeLabel();
    });

    const layout = h("div", "layout");
    layout.appendChild(buildSidebar());
    const main = h("main", "main", layout);
    main.id = "main";
    const wrap = h("div", "content" + (page === "home" || page === "guide" ? " content--wide" : page === "reference" ? " content--ref" : ""), main);
    content.forEach((n) => wrap.appendChild(n));
    // openengineering.ca: license line under the content of every page
    const lic = h("p", wrap.className + " site-license", main, "\u00a9 2026 Open Engineering \u00b7 \u00a9 ProfCyr \u00b7 ");
    const cc = h("a", null, lic, "CC BY-NC-SA 4.0");
    cc.href = "https://creativecommons.org/licenses/by-nc-sa/4.0/";
    cc.rel = "license";

    body.insertBefore(layout, body.firstChild);
    body.insertBefore(top, layout);
    return wrap;
  }

  function buildSidebar() {
    const nav = h("nav", "sidebar");
    nav.setAttribute("aria-label", "Course contents");
    // openengineering.ca: link back to the site's course list (the site itself when opened from a download)
    const site = h("a", "nav-site", nav);
    site.href = location.protocol === "file:" ? "https://openengineering.ca/#courses" : `${root}/../index.html#courses`;
    h("span", "nav-site__arrow", site, "\u2190").setAttribute("aria-hidden", "true");
    site.appendChild(document.createTextNode("All courses \u00b7 Open Engineering"));
    const home = h("a", "nav-home", nav, "Course home");
    home.href = `${root}/index.html`;

    const current = body.dataset.lesson;
    C.modules.forEach((mod) => {
      const det = h("details", "nav-module", nav);
      const isCurrentModule = mod.lessons.some((l) => l.id === current);
      det.open = isCurrentModule || (page === "home" && false);
      const sum = h("summary", null, det);
      h("span", "nav-module__num", sum, String(mod.number));
      h("span", null, sum, mod.title);
      const ul = h("ul", null, det);
      mod.lessons.forEach((l, i) => {
        const li = h("li", "nav-lesson", ul);
        li.dataset.lesson = l.id;
        const done = RVD.store.isComplete(l.id);
        if (done) li.classList.add("nav-lesson--done");
        if (l.status === "planned") li.classList.add("nav-lesson--planned");
        const a = h("a", null, li);
        a.href = href(Object.assign({ module: mod }, l));
        h("span", "nav-lesson__mark", a, done ? "✓" : l.status === "planned" ? "○" : "");
        h("span", "nav-lesson__num", a, `${mod.number}.${i + 1}`);
        h("span", null, a, l.title);
        if (l.id === current) a.setAttribute("aria-current", "page");
      });
    });
    // Reference modules (formula sheet, …) follow the numbered modules.
    (C.references || []).forEach((ref, k) => {
      const det = h("details", "nav-module nav-module--ref" + (k === 0 ? " nav-module--ref-first" : ""), nav);
      det.open = ref.pages.some((pg) => pg.id === body.dataset.ref);
      const sum = h("summary", null, det);
      h("span", "nav-module__num", sum, ref.label);
      h("span", null, sum, ref.title);
      const ul = h("ul", null, det);
      ref.pages.forEach((pg, i) => {
        const a = h("a", null, h("li", "nav-lesson", ul));
        a.href = `${root}/${pg.file}`;
        h("span", "nav-lesson__mark", a, "");
        h("span", "nav-lesson__num", a, `${ref.label}.${i + 1}`);
        h("span", null, a, pg.title);
        if (pg.id === body.dataset.ref) a.setAttribute("aria-current", "page");
      });
    });
    document.addEventListener("rvd:progress", () => {
      nav.querySelectorAll(".nav-lesson[data-lesson]").forEach((li) => {
        const l = byId(li.dataset.lesson);
        const done = RVD.store.isComplete(l.id);
        li.classList.toggle("nav-lesson--done", done);
        li.querySelector(".nav-lesson__mark").textContent = done ? "✓" : l.status === "planned" ? "○" : "";
      });
    });
    return nav;
  }

  /* ---------------- Lesson header & footer ---------------- */
  function lessonHeader(l) {
    const head = h("header", "lesson-header");
    h("div", "lesson-kicker", head, `Module ${l.module.number} · Lesson ${l.index + 1}`);
    h("h1", null, head, l.title);
    const meta = h("div", "lesson-meta", head);
    if (l.minutes) h("span", "chip", meta, `⏱ ~${l.minutes} min`);
    rcvdOf(l).forEach((n) => meta.appendChild(rcvdChip(n)));
    if (l.status !== "ready") meta.appendChild(statusChip(l.status));
    if (l.module.optional) h("span", "chip chip--optional", meta, "Optional");

    if (l.objectives && l.objectives.length) {
      const box = h("section", "objectives", head);
      h("h2", null, box, "By the end of this lesson you should be able to…");
      const ul = h("ul", null, box);
      l.objectives.forEach((o) => h("li", null, ul, o));
    }
    document.title = `${l.title} — ${C.title}`;
    return head;
  }

  function lessonFooter(l) {
    const foot = h("footer", "lesson-footer");
    if (isAvailable(l)) {
      const row = h("div", "complete-row", foot);
      const btn = h("button", "btn", row);
      btn.type = "button";
      const sync = () => {
        const done = RVD.store.isComplete(l.id);
        btn.textContent = done ? "✓ Lesson complete" : "Mark lesson complete";
        btn.className = "btn " + (done ? "btn--done" : "btn--primary");
      };
      btn.addEventListener("click", () => { RVD.store.setComplete(l.id, !RVD.store.isComplete(l.id)); sync(); });
      sync();
      h("span", "muted", row, "Progress is saved in this browser only.").style.fontSize = "14px";
    }
    const i = allLessons.indexOf(l);
    const pager = h("nav", "pager", foot);
    pager.setAttribute("aria-label", "Lesson navigation");
    const prev = allLessons[i - 1], next = allLessons[i + 1];
    if (prev) {
      const a = h("a", "prev", pager);
      a.href = href(prev);
      h("small", null, a, "← Previous");
      a.appendChild(document.createTextNode(prev.title));
    }
    if (next) {
      const a = h("a", "next", pager);
      a.href = href(next);
      h("small", null, a, "Next →");
      a.appendChild(document.createTextNode(next.title));
    }
    return foot;
  }

  /* ---------------- Page renderers ---------------- */
  function renderLesson(wrap) {
    const l = byId(body.dataset.lesson);
    if (!l) { console.warn("Unknown lesson id", body.dataset.lesson); return; }
    wrap.insertBefore(lessonHeader(l), wrap.firstChild);
    wrap.appendChild(lessonFooter(l));
  }

  function renderPlanned(wrap) {
    const id = new URLSearchParams(location.search).get("id");
    const l = byId(id);
    if (!l) { h("p", null, wrap, "Lesson not found."); return; }
    body.dataset.lesson = l.id;
    // Re-mark the sidebar now that we know the lesson.
    document.querySelectorAll(".nav-lesson[data-lesson]").forEach((li) => {
      if (li.dataset.lesson === l.id) { li.firstChild.setAttribute("aria-current", "page"); li.closest("details").open = true; }
    });
    wrap.textContent = "";
    wrap.appendChild(lessonHeader(l));
    const banner = h("div", "stub-banner", wrap);
    banner.innerHTML = "<strong>Planned lesson.</strong> This page is an outline generated from the course manifest. " +
      "To build it, copy <code>templates/lesson-template.html</code>, write the content, then set <code>file</code> and <code>status</code> for <code>" +
      l.id + "</code> in <code>assets/js/course-data.js</code>.";
    if (l.outline) {
      h("h2", null, wrap, "Planned outline");
      const ol = h("ol", null, wrap);
      l.outline.forEach((o) => h("li", null, ol, o));
    }
    if (l.interactives) {
      h("h2", null, wrap, "Planned interactives");
      const ul = h("ul", null, wrap);
      l.interactives.forEach((o) => h("li", null, ul, o));
    }
    const rc = rcvdOf(l);
    if (rc.length) {
      const co = h("div", "callout callout--rcvd", wrap);
      h("p", "callout__title", co, "Milliken connection");
      const p = h("p", null, co);
      p.textContent = "Supporting reading in " + C.reference.title + ": " +
        rc.map((n) => `Ch. ${n} “${C.rcvdChapters[n]}”`).join("; ") + ".";
    }
    wrap.appendChild(lessonFooter(l));
  }

  function renderHome() {
    const grid = document.getElementById("module-grid");
    if (grid) {
      C.modules.forEach((mod) => {
        const card = h("article", "module-card", grid);
        h("div", "module-card__num", card, `Module ${mod.number}`);
        h("h3", null, card, mod.title);
        h("p", null, card, mod.summary);
        const ul = h("ul", null, card);
        mod.lessons.forEach((l) => {
          const li = h("li", l.status === "planned" ? "is-planned" : null, ul);
          const a = h("a", null, li, l.title);
          a.href = href(Object.assign({ module: mod }, l));
          if (RVD.store.isComplete(l.id)) h("span", "tick", li, "✓");
        });
        const foot = h("div", "module-card__foot", card);
        const ready = mod.lessons.filter(isAvailable).length;
        foot.appendChild(statusChip(ready === mod.lessons.length ? "ready" : ready ? "draft" : "planned"))
          .textContent = `${ready}/${mod.lessons.length} lessons built`;
        mod.rcvd.forEach((n) => foot.appendChild(rcvdChip(n)));
        if (mod.optional) h("span", "chip chip--optional", foot, "Optional");
      });
      (C.references || []).forEach((ref) => {
        const card = h("article", "module-card module-card--ref", grid);
        h("div", "module-card__num", card, ref.title);
        h("h3", null, card, ref.pages.map((pg) => pg.title).join(" · "));
        h("p", null, card, ref.summary);
        const ul = h("ul", null, card);
        ref.pages.forEach((pg) => { h("a", null, h("li", null, ul), pg.title).href = `${root}/${pg.file}`; });
        h("span", "chip", h("div", "module-card__foot", card), "Quick reference");
      });
    }
    fillList("course-outcomes", C.courseOutcomes);
    fillList("course-prereqs", C.prerequisites);
    const start = document.getElementById("start-link");
    if (start) {
      const next = allLessons.find((l) => isAvailable(l) && !RVD.store.isComplete(l.id)) || allLessons.find(isAvailable);
      if (next) { start.href = href(next); start.textContent = (RVD.store.isComplete(allLessons.filter(isAvailable)[0].id) ? "Continue: " : "Start: ") + next.title; }
    }
    wireCalcDemo();
    const reset = document.getElementById("reset-progress");
    if (reset) reset.addEventListener("click", () => {
      if (confirm("Clear all saved progress and answers in this browser?")) { RVD.store.reset(); location.reload(); }
    });
  }

  /* Live calculator practice box on the home page (same evaluator as the answer boxes). */
  function wireCalcDemo() {
    const input = document.getElementById("calc-demo-input");
    const out = document.getElementById("calc-demo-preview");
    if (!input || !out || !RVD.calc) return;
    const update = () => {
      const raw = input.value.trim();
      if (!raw) { out.className = "numeric__preview is-tip"; out.textContent = "Type a number or a calculation."; return; }
      const r = RVD.calc(raw);
      if (r.error) { out.className = "numeric__preview is-error"; out.textContent = "Can\u2019t calculate this yet: " + r.error; }
      else { out.className = "numeric__preview is-value"; out.textContent = "= " + RVD.calc.format(r.value); }
    };
    input.addEventListener("input", update);
    document.querySelectorAll(".calc-example").forEach((b) => b.addEventListener("click", () => {
      input.value = b.dataset.expr; update(); input.focus();
    }));
    update();
  }

  function fillList(id, items) {
    const el = document.getElementById(id);
    if (!el) return;
    items.forEach((t) => h("li", null, el, t));
  }

  function renderGuide() {
    fillList("course-outcomes", C.courseOutcomes);
    fillList("course-prereqs", C.prerequisites);

    const map = document.getElementById("module-map");
    if (map) {
      const table = h("table", "data", map);
      const thead = h("thead", null, table);
      const tr = h("tr", null, thead);
      ["Module", "Lessons (status, est. minutes)", "RCVD chapters"].forEach((t) => h("th", null, tr, t));
      const tb = h("tbody", null, table);
      C.modules.forEach((mod) => {
        const row = h("tr", null, tb);
        const c1 = h("td", null, row);
        h("strong", null, c1, `${mod.number}. ${mod.title}`);
        if (mod.optional) h("div", "muted", c1, "Optional / stretch").style.fontSize = "13px";
        const c2 = h("td", null, row);
        const ul = h("ul", null, c2);
        ul.style.margin = "0"; ul.style.paddingLeft = "1.1em";
        mod.lessons.forEach((l) => {
          const li = h("li", null, ul);
          const a = h("a", null, li, l.title);
          a.href = href(Object.assign({ module: mod }, l));
          h("span", "muted", li, ` — ${l.status}, ~${l.minutes || "?"} min`);
        });
        const c3 = h("td", null, row);
        mod.rcvd.forEach((n) => { h("div", null, c3, `Ch. ${n} ${C.rcvdChapters[n]}`); });
      });
    }

    const cov = document.getElementById("chapter-coverage");
    if (cov) {
      const table = h("table", "data", cov);
      const tr = h("tr", null, h("thead", null, table));
      ["RCVD chapter", "Used in"].forEach((t) => h("th", null, tr, t));
      const tb = h("tbody", null, table);
      Object.keys(C.rcvdChapters).forEach((n) => {
        n = +n;
        const row = h("tr", null, tb);
        h("td", null, row, `${n}. ${C.rcvdChapters[n]}`);
        const used = new Set();
        allLessons.forEach((l) => { if (rcvdOf(l).includes(n)) used.add(`M${l.module.number}`); });
        C.modules.forEach((m) => { if (m.rcvd.includes(n)) used.add(`M${m.number}`); });
        h("td", used.size ? null : "muted", row, used.size ? Array.from(used).join(", ") : "Not used (beyond scope)");
      });
    }

    const stats = document.getElementById("build-status");
    if (stats) {
      const count = (s) => allLessons.filter((l) => l.status === s).length;
      const mins = allLessons.reduce((a, l) => a + (l.minutes || 0), 0);
      stats.textContent = `${allLessons.length} lessons in ${C.modules.length} modules — ` +
        `${count("ready")} ready, ${count("draft")} draft, ${count("planned")} planned. ` +
        `Estimated total learner time ≈ ${Math.round(mins / 60)} hours (excluding RCVD reading).`;
    }
  }

  /* ---------------- Reference pages (formula sheet) ---------------- */
  function renderReference(wrap) {
    let ref, pg, idx;
    (C.references || []).forEach((r) => r.pages.forEach((p, i) => { if (p.id === body.dataset.ref) { ref = r; pg = p; idx = i; } }));
    if (!pg) { console.warn("Unknown reference page", body.dataset.ref); return; }
    const head = h("header", "lesson-header");
    h("div", "lesson-kicker", head, `${ref.title} · ${ref.label}.${idx + 1}`);
    h("h1", null, head, pg.title);
    wrap.insertBefore(head, wrap.firstChild);
    document.title = `${pg.title} — ${C.title}`;

    // Module and lesson headings come from the manifest, so numbers and titles stay in sync.
    const sections = Array.from(wrap.querySelectorAll("[data-module]")).filter((sec) => {
      const mod = C.modules.find((m) => m.id === sec.dataset.module);
      if (!mod) return false;
      sec.id = sec.id || "formulas-" + mod.id;
      sec.insertBefore(h("h2", null, null, `Module ${mod.number} · ${mod.title}`), sec.firstChild);
      return true;
    });
    wrap.querySelectorAll("[data-lesson-ref]").forEach((el) => {
      const l = byId(el.dataset.lessonRef);
      if (!l) return;
      el.textContent = "";
      const a = h("a", null, el);
      a.href = href(l);
      h("span", "formula-lesson__num", a, `${l.module.number}.${l.index + 1}`);
      a.appendChild(document.createTextNode(l.title));
    });

    // Jump links to each section, and a print button.
    const bar = document.getElementById("formula-jump");
    if (bar) {
      Array.from(wrap.querySelectorAll("section[data-jump]")).forEach((sec) => {
        h("a", "chip chip--link", bar, sec.dataset.jump).href = "#" + sec.id;
      });
      sections.forEach((sec) => {
        const mod = C.modules.find((m) => m.id === sec.dataset.module);
        const a = h("a", "chip chip--link", bar, `Module ${mod.number}`);
        a.href = "#" + sec.id;
        a.title = mod.title;
      });
      const pb = h("button", "btn-sm formula-print", bar, "Print / save as PDF");
      pb.type = "button";
      pb.addEventListener("click", () => window.print());
    }

    if (document.getElementById("glossary")) wireGlossary();

    // Modules that have no formula section yet.
    const pend = document.getElementById("formula-pending");
    if (pend) {
      const covered = new Set(sections.map((sec) => sec.dataset.module));
      const missing = C.modules.filter((m) => !covered.has(m.id));
      if (!missing.length) { pend.remove(); return; }
      h("p", null, pend, "Formulas for these modules will be added here as the modules are written:");
      const ul = h("ul", null, pend);
      missing.forEach((m) => h("li", null, ul, `Module ${m.number} · ${m.title}`));
    }
  }

  /* Glossary: sort the entries, add A–Z headings and links to the introducing lesson,
     and filter as the reader types. Entries are <dl class="gloss" data-intro="lesson id">. */
  function wireGlossary() {
    const box = document.getElementById("glossary");
    const key = (dl) => dl.querySelector("dt").textContent.trim().toLowerCase();
    const entries = Array.from(box.querySelectorAll("dl.gloss")).sort((p, q) => key(p).localeCompare(key(q)));

    const letters = new Map();   // letter -> heading element
    entries.forEach((dl) => {
      const L = key(dl)[0].toUpperCase();
      if (!letters.has(L)) {
        const hd = h("h2", "gloss-letter", box, L);
        hd.id = "letter-" + L.toLowerCase();
        letters.set(L, hd);
      }
      box.appendChild(dl);
      const l = byId(dl.dataset.intro);
      if (l) {
        const a = h("a", "gloss__lesson", dl.querySelector("dd"), `Lesson ${l.module.number}.${l.index + 1}`);
        a.href = href(l);
        a.title = l.title;
      }
    });

    const bar = document.getElementById("gloss-letters");
    if (bar) "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach((L) => {
      if (letters.has(L)) h("a", null, bar, L).href = "#letter-" + L.toLowerCase();
      else h("span", "is-empty", bar, L);
    });

    const input = document.getElementById("gloss-filter");
    const count = document.getElementById("gloss-count");
    const empty = document.getElementById("gloss-empty");
    function filter() {
      const q = (input ? input.value : "").trim().toLowerCase();
      let shown = 0;
      entries.forEach((dl) => {
        const hit = !q || (q.length < 2 ? key(dl).startsWith(q) : dl.textContent.toLowerCase().includes(q));
        dl.hidden = !hit;
        if (hit) shown++;
      });
      letters.forEach((hd, L) => { hd.hidden = !entries.some((dl) => !dl.hidden && key(dl)[0].toUpperCase() === L); });
      if (count) count.textContent = q ? `${shown} of ${entries.length} terms` : `${entries.length} terms`;
      if (empty) empty.hidden = shown > 0;
    }
    if (input) input.addEventListener("input", filter);
    filter();
    // The entries were just reordered, so re-apply a #g-… link from another page.
    const target = location.hash && document.getElementById(location.hash.slice(1));
    if (target) requestAnimationFrame(() => target.scrollIntoView());
  }

  /* ---------------- Callout titles ---------------- */
  const CALLOUT_TITLES = {
    key: "Key idea", try: "Try this", rcvd: "Milliken connection",
    misconception: "Common misconception", example: "Worked example"
  };
  function decorateCallouts(scope) {
    scope.querySelectorAll(".callout").forEach((c) => {
      if (c.querySelector(".callout__title")) return;
      const type = (c.className.match(/callout--(\w+)/) || [])[1];
      const title = c.dataset.title || CALLOUT_TITLES[type];
      if (title) c.insertBefore(h("p", "callout__title", null, title), c.firstChild);
    });
  }

  /* ---------------- Init ---------------- */
  function init() {
    const wrap = buildShell();
    if (page === "lesson") renderLesson(wrap);
    else if (page === "planned") renderPlanned(wrap);
    else if (page === "home") renderHome();
    else if (page === "guide") renderGuide();
    else if (page === "reference") renderReference(wrap);

    decorateCallouts(wrap);
    RVD.checks.enhance(wrap);
    RVD.renderMath(wrap);
    RVD.mountWidgets(wrap);

    // Close the mobile nav after choosing a link.
    document.querySelectorAll(".sidebar a").forEach((a) => a.addEventListener("click", () => body.classList.remove("nav-open")));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
