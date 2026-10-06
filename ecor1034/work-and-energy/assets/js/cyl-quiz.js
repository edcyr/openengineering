/*
 * cyl-quiz.js — CYLQuiz: "Check your understanding" questions, practice sets and self-check quizzes
 * for the Work and Energy module. The full API is summarized in the comment block below.
 * Classic script (IIFE), attaches ONE global: CYLQuiz. Requires CYL (cyl-core.js) and CYLExpr (cyl-expr.js).
 *
 * ---------------------------------------------------------------------------------------------------
 * CYLQuiz.question(container, spec) → controller
 *   Appends a .q-card to `container` (usually a <div class="check">).
 *   spec:
 *     id        'l04-q1'  unique; completion is saved per id (CYL.store key "quiz:q:<id>") and restored on
 *                         reload as "answered ✓" with a Reset button. spec.persist:false turns this off.
 *     type      'mc' | 'multi' | 'numeric' | 'fields' | 'point'. Any other value is reported with CYL.error
 *               (so the QA harness flags the typo) and the type implied by the spec's content is used instead.
 *     title     card title (default "Check your understanding")
 *     prompt    HTML (may contain \( \) math)
 *     mc/multi: choices [{html, correct, feedback, fixed}], shuffle:true. The shuffle is DETERMINISTIC
 *               (seeded by the question id), so every student and the answer key see the same order.
 *               A choice with fixed:true keeps its position (e.g. "None of these").
 *     numeric:  answer (number, or an array of acceptable numbers), tol, unit, angle:false, label (HTML),
 *               answerTex (TeX shown as the correct answer; default: exact form if recognizable + decimal),
 *               ariaLabel (see fields)
 *     fields:   fields [{name, label (HTML), answer, tol, angle, unit, answerTex, ariaLabel}]
 *               ariaLabel: the box's accessible name. Optional: by default it is spoken from the label
 *               ("\(\dot{r} =\)" → "r dot", "\(\omega =\)" → "ω") plus the unit ("r dot (in m/s)").
 *     unit      plain text ("m", "m/s", "kg·m²", "m^3") or simple HTML ("m<sup>3</sup>", "kg&middot;m<sup>2</sup>");
 *               it is shown next to the box and normalized to Unicode superscripts in echoes and answers.
 *     point:    system 'cyl' | 'cart', answerPoint [a, b, c], unit (for r/z or x/y/z), tol, angleTol,
 *               answerTex (optional TeX for the whole "Correct answer" line, e.g. to give units per coordinate or θ in
 *               degrees; default: "(r, θ, z) = (…) ≈ (…) unit" built from answerPoint; grading always uses answerPoint).
 *               'cyl': θ compared mod 2π; when the correct r is 0, any θ (even blank) is accepted — but θ text that
 *               cannot be read makes the answer 'unreadable' (the try is not counted), as for any other box.
 *     short     optional short title (HTML, may contain \( \) math) printed in the Question column of a quiz's
 *               results sheet instead of the full prompt, e.g. 'Polar coordinates in quadrant II'.
 *     hints     ['HTML', …]   revealed one at a time with the Hint button
 *     solution  'HTML'        available after a correct answer or after 2 wrong attempts
 *                             (always available in practice mode: spec.mode:'practice')
 *     explain   'HTML'        short "why" text shown with the correct / incorrect feedback
 *     onResult  (correct, attempts) => {}
 *   Tolerances: tol may be a number (absolute) or {abs, rel}; the value passes if |typed − answer| ≤
 *     max(abs, rel·|answer|). Default {rel: 0.01} (1 %), or abs 1e-3 when the answer is ≈ 0.
 *     Angles (angle:true, θ in a point) are compared modulo 2π with a default absolute tolerance of
 *     0.01 rad (≈ 0.57°): a relative tolerance is meaningless for angles (0 ≡ 2π). Pass tol to override.
 *   Inputs accept anything CYLExpr accepts (3pi/4, 2sqrt(3), 5cos(pi/6)…); the parsed value is echoed
 *     live ("= 2.356", or "= 2.356 rad (135°)" for angles). Angle inputs accept degrees with ° or deg.
 *     A trailing copy of the expected unit ("2.5 m") is ignored. Enter checks.
 *   Attempts: pressing Check again on an unchanged wrong answer is not a new attempt (no count, no onResult,
 *     no progress toward "Show solution"); check() returns false and the feedback says it was not counted.
 *   controller: {el, spec, id, check() → true | false | null (null = nothing gradable yet, no attempt counted),
 *     reset(), isCorrect(), attempts (live), getResponse(), setResponse(r), isAnswered(), grade(),
 *     review(), showSolution(show), showHint(), focus()}
 *
 * CYLQuiz.set(container, specs[], opts) → set controller
 *   opts: {mode:'practice'|'quiz', title, shuffle:false (question order), seed, layout:'paged'|'all'
 *          (default: 'paged' in quiz mode, 'all' in practice mode), onComplete(score), storageKey:null}
 *   practice: every card checks as you go; hints and solutions always available; progress bar;
 *             onComplete fires when all questions are correct. Completion persists per question id.
 *   quiz:     answers are graded on Submit; score summary, review of every question with the correct answer
 *             and worked solution, a name field, "Print / Save as PDF" (prints ONLY a results sheet), Retake.
 *             With storageKey, answers-in-progress and results survive a reload.
 *             Submit first lists questions that are not fully answered, cannot be read, or have an angle typed
 *             without a unit that looks like degrees, with "Submit anyway"; the list updates as answers change.
 *             Enter in a box moves to the next empty box of the same question; in the paged layout, Enter on a
 *             complete question (or in its last box) goes to the next question.
 *   title / intro may contain \( \) math.
 *   score:    {mode, correct, total, percent, firstTry (practice), name, results:[{id, index, correct,
 *              attempts, response}]}
 *   set controller: {el, questions, submit(force), retake(), reset(), goTo(i), score(), print()}
 *
 * CYLQuiz.rng(seed) → {seed, next() in [0,1), int(a,b) inclusive, pick(arr), shuffle(arr) (in place, returns arr),
 *                      float(a,b), sign()}      deterministic mulberry32; seed may be a number or a string.
 *
 * Extras (for tests and generators): CYLQuiz.grade(spec, response), CYLQuiz.readNumber(str, {angle, unit}),
 *   CYLQuiz.matches(value, answer, {tol, angle}), CYLQuiz.answerTex(spec), CYLQuiz.version,
 *   CYLQuiz.defaults {rel, zeroAbs, angleTol}.
 * ---------------------------------------------------------------------------------------------------
 */
(function (root) {
  'use strict';

  var VERSION = '1.0.0';
  var TAU = Math.PI * 2;
  var DEG = Math.PI / 180;
  var DEFAULTS = { rel: 0.01, zeroAbs: 1e-3, angleTol: 0.01 };
  var KEY_Q = 'quiz:q:';       // + question id → {correct, attempts, response, at}
  var KEY_SET = 'quiz:set:';   // + storageKey  → quiz-set state
  var KEY_NAME = 'quiz:name';  // student name for printed results
  var ANGLE_HINT = 'radians (e.g. 3pi/4) or degrees (e.g. 135°)';
  var has = Object.prototype.hasOwnProperty;
  function own(o, k) { return o != null && has.call(o, k); }

  /* ================================================================================================
     Small utilities
     ================================================================================================ */
  function core() { return root.CYL || null; }
  function expr() { return root.CYLExpr || null; }
  function reportError(msg, e) {
    var c = core();
    var text = 'CYLQuiz: ' + msg + (e && e.message ? ' (' + e.message + ')' : '');
    if (c && c.error) c.error(text); else if (root.console) root.console.error(text);
  }
  var reported = {};
  function reportOnce(msg) { if (!own(reported, msg)) { reported[msg] = true; reportError(msg); } }
  var TYPES = { mc: 1, multi: 1, numeric: 1, fields: 1, point: 1 };

  var uidN = 0;
  function uid() { uidN += 1; return 'cq' + uidN; }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!own(attrs, k)) continue;
        var v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (k === 'html') n.innerHTML = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') n.addEventListener(k.slice(2), v);
        else n.setAttribute(k, v === true ? '' : String(v));
      }
    }
    if (kids != null) {
      (Array.isArray(kids) ? kids : [kids]).forEach(function (c) {
        if (c == null || c === false) return;
        n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return n;
  }
  function show(node, on) { if (node) { if (on) node.removeAttribute('hidden'); else node.setAttribute('hidden', ''); } }

  var store = {
    get: function (k, fb) { var c = core(); try { return c && c.store ? c.store.get(k, fb) : fb; } catch (e) { return fb; } },
    set: function (k, v) { var c = core(); try { if (c && c.store) c.store.set(k, v); } catch (e) { /* ignore */ } },
    remove: function (k) { var c = core(); try { if (c && c.store) c.store.remove(k); } catch (e) { /* ignore */ } }
  };

  function renderMath(node) {
    var c = core();
    if (!node || !c || !c.renderMath) return;
    try { c.renderMath(node); } catch (e) { reportError('math rendering failed', e); }
  }
  function tex(s) {
    var c = core();
    if (c && c.tex) return c.tex(s);
    return escapeHtml(s);
  }
  function fmt(x, sig) {
    var c = core();
    if (c && c.fmt) return c.fmt(x, sig == null ? 4 : sig);
    if (!isFinite(x)) return String(x);
    if (Math.abs(x) < 1e-10) return '0';
    var s = String(parseFloat((+x).toPrecision(sig || 4)));
    return s.replace(/-/g, '−');
  }
  function fmtTex(x, sig) {
    var c = core();
    if (c && c.fmtTex) return c.fmtTex(x, sig);
    return fmt(x, sig).replace(/−/g, '-');
  }
  function reducedMotion() {
    var c = core();
    try { return c && c.prefersReducedMotion ? c.prefersReducedMotion() : false; } catch (e) { return false; }
  }
  function scrollIntoViewIfNeeded(node) {
    if (!node || !node.getBoundingClientRect) return;
    var r = node.getBoundingClientRect();
    var vh = root.innerHeight || document.documentElement.clientHeight;
    if (r.top < 60 || r.top > vh - 80) {
      try { node.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' }); } catch (e) { node.scrollIntoView(); }
    }
  }
  function focusQuietly(node) {
    if (!node) return;
    try { node.focus({ preventScroll: true }); } catch (e) { node.focus(); }
  }
  // "\(r\)" / "\(\theta\)" → plain text. Only used to derive a shuffle seed for id-less questions, so its
  // output must stay stable; use spokenLabel() for anything a person reads or hears.
  function plainLabel(html) {
    var s = String(html || '').replace(/<[^>]*>/g, '').replace(/\\\(|\\\)|\\\[|\\\]/g, '');
    s = s.replace(/\\col[RTZ]\{([^{}]*)\}/g, '$1').replace(/\\theta/g, 'θ').replace(/\\pi/g, 'π')
      .replace(/\\[a-zA-Z]+/g, '').replace(/[{}]/g, '');
    return s.replace(/\s+/g, ' ').trim();
  }

  var NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', thinsp: ' ', ensp: ' ', emsp: ' ',
    middot: '·', sdot: '·', sup1: '¹', sup2: '²', sup3: '³', micro: 'µ', deg: '°', times: '×', minus: '−', Omega: 'Ω', ohm: 'Ω' };
  function decodeEntities(s) {
    return String(s).replace(/&(#[xX][0-9a-fA-F]+|#\d+|[A-Za-z]+\d?);/g, function (m, e) {
      if (e.charAt(0) === '#') {
        var n = /^#[xX]/.test(e) ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
      }
      return own(NAMED_ENTITIES, e) ? NAMED_ENTITIES[e] : m;
    });
  }

  /* TeX → words a screen reader can say ("\dot{r} =" → "r dot", "v_\theta" → "v θ", "\tfrac{1}{2}" → "1 over 2").
     Greek letters become Unicode letters, which screen readers pronounce by name. */
  var GREEK = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ',
    vartheta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', omicron: 'ο', pi: 'π', rho: 'ρ', varrho: 'ρ',
    sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
    Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω' };
  var TEX_WORDS = { cdot: ' times ', times: ' times ', div: ' divided by ', pm: ' plus or minus ', mp: ' minus or plus ',
    le: ' ≤ ', leq: ' ≤ ', ge: ' ≥ ', geq: ' ≥ ', ne: ' ≠ ', neq: ' ≠ ', approx: ' ≈ ', equiv: ' ≡ ', infty: '∞', partial: '∂',
    nabla: '∇', ell: 'ℓ', circ: '°', degree: '°', ldots: '…', dots: '…', cdots: '…', to: ' to ', rightarrow: ' to ',
    int: ' integral ', iint: ' double integral ', iiint: ' triple integral ', sum: ' sum ', prod: ' product ',
    sin: ' sin ', cos: ' cos ', tan: ' tan ', ln: ' ln ', log: ' log ', exp: ' exp ',
    // the module's KaTeX macros (defined in cyl-core.js)
    er: ' u r ', et: ' u θ ', ez: ' u z ', ihat: ' i ', jhat: ' j ', khat: ' k ',
    rvec: ' vector r ', vvec: ' vector v ', avec: ' vector a ', Fvec: ' vector F ', atantwo: ' atan2 ', dd: ' d ' };
  var ACCENT_AFTER = { dot: ' dot', ddot: ' double dot', dddot: ' triple dot', hat: ' hat', widehat: ' hat', bar: ' bar',
    overline: ' bar', tilde: ' tilde', widetilde: ' tilde', check: ' check', prime: ' prime' };
  var ACCENT_BEFORE = { vec: 'vector ', overrightarrow: 'vector ', mathbf: '', boldsymbol: '', bm: '', mathrm: '', mathit: '',
    mathsf: '', mathcal: '', mathbb: '', text: '', textbf: '', textit: '', textrm: '', mbox: '', operatorname: '',
    colR: '', colT: '', colZ: '', colX: '', colY: '', colV: '', colA: '', colKE: '', colVg: '', colVe: '', colF: '', colP: '', underline: '' };
  var TEX_SKIP_ARG = { htmlClass: 1, textcolor: 1, color: 1, htmlId: 1, htmlStyle: 1, htmlData: 1 };  // drop the first argument
  function texToSpeech(src) {
    var t = String(src || ''), i = 0, n = t.length;
    function skipSpace() { while (i < n && /\s/.test(t.charAt(i))) i++; }
    function arg() {
      skipSpace();
      var c = t.charAt(i);
      if (c === '{') { i++; var s = seq('}'); i++; return s; }
      if (c === '\\') return command();
      if (i < n) { i++; return c; }
      return '';
    }
    function sup(s) {
      s = s.replace(/\s+/g, ' ').trim();
      if (s === '2') return ' squared ';
      if (s === '3') return ' cubed ';
      if (s === '°' || s === '\'' || s === 'prime') return s === '°' ? '°' : ' prime ';
      return s ? ' to the power ' + s + ' ' : '';
    }
    function command() {
      i++;                                                         // the backslash
      var m = /^[A-Za-z]+/.exec(t.slice(i));
      if (!m) { var ch = t.charAt(i++); return /[,;:! \\]/.test(ch) || ch === '' ? ' ' : ch; }   // \, \; \{ …
      var name = m[0];
      i += name.length;
      if (own(GREEK, name)) return GREEK[name];
      if (own(TEX_WORDS, name)) return TEX_WORDS[name];
      if (own(ACCENT_AFTER, name)) return ' ' + arg() + ACCENT_AFTER[name] + ' ';
      if (own(ACCENT_BEFORE, name)) return ' ' + ACCENT_BEFORE[name] + arg() + ' ';
      if (own(TEX_SKIP_ARG, name)) { arg(); return name === 'color' ? '' : arg(); }
      if (name === 'frac' || name === 'tfrac' || name === 'dfrac') { var a = arg(), b = arg(); return ' ' + a + ' over ' + b + ' '; }
      if (name === 'sqrt') {
        skipSpace();
        var root_ = '';
        if (t.charAt(i) === '[') { var j = t.indexOf(']', i); if (j > i) { root_ = t.slice(i + 1, j); i = j + 1; } }
        var body = arg();
        return ' ' + (root_ === '3' ? 'cube root of ' : root_ ? root_ + 'th root of ' : 'square root of ') + body + ' ';
      }
      if (/^(quad|qquad|space|enspace|thinspace)$/.test(name)) return ' ';
      return '';                                                  // \left, \right, \big, \displaystyle, unknown …
    }
    function seq(stop) {
      var out = '';
      while (i < n && t.charAt(i) !== stop) {
        var c = t.charAt(i);
        if (c === '{') { i++; out += seq('}'); i++; }
        else if (c === '\\') out += command();
        else if (c === '_') { i++; out += ' ' + arg() + ' '; }
        else if (c === '^') { i++; out += sup(arg()); }
        else if (c === '}' || c === '$') i++;
        else if (c === '~' || c === '&') { i++; out += ' '; }
        else if (c === '\'') { i++; out += ' prime '; }
        else if (c === '+' || c === '-' || c === '−' || c === '*') { i++; out += c === '+' ? ' plus ' : c === '*' ? ' times ' : ' minus '; }
        else { out += c; i++; }
      }
      return out;
    }
    return seq(null);
  }
  /** Label HTML (may mix text and \( \) math) → a short plain-text name, without a trailing "=" or ":". */
  function spokenLabel(html) {
    var s = String(html == null ? '' : html)
      .replace(/<sup[^>]*>\s*2\s*<\/sup>/gi, ' squared ').replace(/<sup[^>]*>\s*3\s*<\/sup>/gi, ' cubed ')
      .replace(/<[^>]*>/g, ' ');
    s = decodeEntities(s).replace(/\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g, function (m, a, b) { return ' ' + texToSpeech(a != null ? a : b) + ' '; });
    s = s.replace(/\s+/g, ' ').trim();
    for (var k = 0; k < 3; k++) s = s.replace(/\s*[=:]\s*$/, '').trim();
    return s.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/\s+,/g, ',');
  }
  function wrapBlock(html) {
    html = String(html == null ? '' : html);
    return /<(p|div|ul|ol|table|figure|pre|h[1-6]|blockquote|section|details)\b/i.test(html) ? html : '<p>' + html + '</p>';
  }

  /* ================================================================================================
     Angles and seeded random numbers
     ================================================================================================ */
  function wrap2pi(t) {
    var r = t % TAU;
    if (r < 0) r += TAU;
    if (r >= TAU - 1e-12) r = 0;
    return r === 0 ? 0 : r;
  }
  function angleDiff(a, b) { var d = wrap2pi(a - b); return d > Math.PI ? d - TAU : d; }

  function hashSeed(seed) {
    if (typeof seed === 'number' && isFinite(seed) && Math.floor(seed) === seed) return seed >>> 0;
    var s = String(seed), h = 2166136261 >>> 0;             // FNV-1a
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h;
  }
  function rng(seed) {
    if (seed == null) seed = ((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);
    var a = hashSeed(seed);
    function next() {                                           // mulberry32
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    function int(lo, hi) {
      lo = Math.ceil(+lo); hi = Math.floor(+hi);
      if (hi < lo) { var t = lo; lo = hi; hi = t; }
      return lo + Math.floor(next() * (hi - lo + 1));
    }
    function pick(arr) { return arr && arr.length ? arr[Math.floor(next() * arr.length)] : undefined; }
    function shuffle(arr) {                                     // Fisher–Yates, in place; returns arr
      if (!arr) return arr;
      for (var i = arr.length - 1; i > 0; i--) {
        var j = Math.floor(next() * (i + 1));
        var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    }
    return {
      seed: seed,
      next: next,
      int: int,
      pick: pick,
      shuffle: shuffle,
      float: function (lo, hi) { return +lo + next() * (+hi - +lo); },
      sign: function () { return next() < 0.5 ? -1 : 1; }
    };
  }

  /* ================================================================================================
     Reading typed numbers
     ================================================================================================ */
  var DEG_MARK_RE = /[°º˚]|deg/i;
  var PI_RE = /pi|π/i;
  var UNIT_WORD_RE = /^(?:[mcku]?m|µm|μm|km|mi|in|ft|s|ms|min|h|hr|kg|g|t|[kMG]?N|N·?m|Nm|[kMG]?Pa|[kM]?J|[kM]?W|Hz|rpm|L|mL|rad\/s|m\/s|m\/s\^?2|m\/s²|mm\^?[23]|mm[²³]|m\^?[23]|m[²³]|kg\/m\^?3|kg\/m³|kg·m²|kg\s?m\^?2)$/;

  var SUP_OF = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', '−': '⁻', '+': '⁺' };
  var SUP_BACK = {};
  Object.keys(SUP_OF).forEach(function (k) { if (k !== '−') SUP_BACK[SUP_OF[k]] = k; });
  function toSup(d) { return String(d).replace(/[0-9+\-−]/g, function (c) { return SUP_OF[c]; }); }
  /**
   * Unit (plain text or simple HTML such as "m<sup>3</sup>" or "kg&middot;m^2") → display text with Unicode
   * superscripts: "m³", "kg·m²", "s⁻¹". Spaces are kept (collapsed); normUnit() is the space-free comparison key.
   */
  function unitDisplay(u) {
    var s = String(u == null ? '' : u)
      .replace(/<sup[^>]*>\s*([+\-−]?\d+)\s*<\/sup>/gi, function (m, d) { return toSup(d); })
      .replace(/<[^>]*>/g, '');
    s = decodeEntities(s).replace(/\s+/g, ' ').trim()
      .replace(/\s*\^\s*\{?\s*([+\-−]?\d+)\s*\}?/g, function (m, d) { return toSup(d); })
      .replace(/\s*[*⋅]\s*/g, '·').replace(/μ/g, 'µ');
    return s;
  }
  function normUnit(u) { return unitDisplay(u).replace(/\s+/g, ''); }
  // Looser key for recognizing a typed unit: product dots dropped too, so "Nm", "N m", "N*m" all match "N·m".
  function unitKey(u) { return normUnit(u).replace(/·/g, ''); }
  /** Unit display text → TeX that KaTeX renders without warnings: "kg·m²" → \text{kg·m}^{2}, "µm" → \mu\text{m}. */
  function unitToTex(u) {
    u = String(u || '');
    var out = '', buf = '';
    function flush() { if (buf) { out += '\\text{' + buf + '}'; buf = ''; } }
    for (var i = 0; i < u.length; i++) {
      var ch = u.charAt(i);
      if (own(SUP_BACK, ch)) {
        var e = '';
        while (i < u.length && own(SUP_BACK, u.charAt(i))) { e += SUP_BACK[u.charAt(i)]; i++; }
        i--;
        flush();
        out += (out ? '' : '{}') + '^{' + e + '}';
      } else if (ch === 'µ' || ch === 'μ') { flush(); out += '\\mu '; }
      else if (ch === 'Ω') { flush(); out += '\\Omega '; }
      else if (ch === '&' || ch === '%' || ch === '#' || ch === '_' || ch === '$' || ch === '{' || ch === '}') buf += '\\' + ch;
      else if (ch === '\\' || ch === '^' || ch === '~') { /* not meaningful in a unit */ }
      else buf += ch;
    }
    flush();
    return out;
  }
  // Strip a typed copy of the expected unit: "2.5 m" → "2.5", "3 m^2" → "3" (unit m²). The unit must not be
  // glued to a preceding letter, so "2 mm" is NOT read as "2 m" + "m".
  function stripUnit(s, unit) {
    var u = unitKey(unit);
    if (!u) return s;
    var t = s.replace(/\s+$/, '');
    for (var k = 1; k <= Math.min(t.length - 1, u.length * 2 + 6); k++) {
      var suf = t.slice(t.length - k);
      if (/^[\s·*⋅]/.test(suf) || unitKey(suf) !== u) continue;
      var before = t.charAt(t.length - k - 1);
      if (/[A-Za-zµμ]/.test(before)) return s;
      var pre = t.slice(0, t.length - k).trim();
      return pre || s;
    }
    return s;
  }

  /**
   * readNumber(str, {angle, unit}) → {blank, ok, value, error, tex, deg, degSuspect, raw}
   *   deg: the student typed a degree mark; degSuspect: an angle with no unit and |value| > 2π
   *   (probably degrees without the ° sign).
   */
  function readNumber(str, opts) {
    opts = opts || {};
    var angle = !!opts.angle;
    var raw = str == null ? '' : String(str);
    var res = { raw: raw, blank: false, ok: false, value: NaN, error: null, tex: null, deg: false, degSuspect: false };
    if (typeof str === 'number') {
      if (isFinite(str)) { res.ok = true; res.value = str; res.tex = fmtTex(str, 6); } else res.error = 'Not a finite number';
      return res;
    }
    var s = raw.trim();
    if (!s) { res.blank = true; return res; }
    if (opts.unit) s = stripUnit(s, opts.unit);
    if (!s) { res.blank = true; return res; }
    var X = expr();
    if (!X) { res.error = 'The expression reader (cyl-expr.js) is not loaded'; return res; }
    var r;
    if (X.tryParseNumber) r = X.tryParseNumber(s, { angle: angle });
    else { var v = X.parseNumber(s, { angle: angle }); r = { ok: isFinite(v), value: v, error: isFinite(v) ? null : "Couldn't read that as a number", tex: null }; }
    if (!r.ok) {
      res.error = friendlyError(s, r, opts);
      return res;
    }
    res.ok = true;
    res.value = r.value;
    res.tex = r.tex || null;
    if (angle) {
      res.deg = DEG_MARK_RE.test(s);
      res.degSuspect = !res.deg && !PI_RE.test(s) && Math.abs(r.value) > TAU + 0.01;
    }
    return res;
  }

  function friendlyError(s, r, opts) {
    var msg = r.error || "Couldn't read that as a number";
    // A unit typed after an otherwise valid number: "2500 mm", "3 m/s"
    var m = /^(.*?[\d)\]}.πi\s])\s*([A-Za-zµμ°][A-Za-z0-9µμ·*\/^²³]*)$/.exec(s);
    if (m && UNIT_WORD_RE.test(m[2]) && expr() && expr().tryParseNumber) {
      var pre = expr().tryParseNumber(m[1].trim(), { angle: !!opts.angle });
      if (pre.ok) {
        var u = unitDisplay(opts.unit);
        return u ? 'Type just the number in ' + u + ' (the unit is shown next to the box)'
                 : 'Type just the number, without a unit';
      }
    }
    return msg;
  }

  /* ================================================================================================
     Tolerances and comparison
     ================================================================================================ */
  function tolerance(a, f) {
    var t = f.tol;
    var mag = f.angle ? wrap2pi(a) : Math.abs(a);
    var nearZero = f.angle ? Math.abs(angleDiff(a, 0)) < 1e-9 : Math.abs(a) < 1e-9;
    if (typeof t === 'number' && isFinite(t)) return Math.abs(t);
    if (t && (t.abs != null || t.rel != null)) {
      var abs = t.abs != null ? Math.abs(+t.abs) : (nearZero ? DEFAULTS.zeroAbs : 0);
      var rel = t.rel != null ? Math.abs(+t.rel) : 0;
      return Math.max(abs, rel * mag);
    }
    if (f.angle) return DEFAULTS.angleTol;
    return nearZero ? DEFAULTS.zeroAbs : DEFAULTS.rel * mag;
  }
  function closeTo(v, a, f) {
    v = +v; a = +a;
    if (!isFinite(v) || !isFinite(a)) return false;
    var d = f.angle ? Math.abs(angleDiff(v, a)) : Math.abs(v - a);
    return d <= tolerance(a, f) + 1e-12 * Math.max(1, Math.abs(a));
  }
  function answersOf(f) { return Array.isArray(f.answer) ? f.answer : [f.answer]; }
  function matchesField(v, f) { return answersOf(f).some(function (a) { return closeTo(v, a, f); }); }
  function isZero(a) { return answersOf({ answer: a }).every(function (x) { return Math.abs(+x) < 1e-9; }); }

  /* ================================================================================================
     Normalizing specs
     ================================================================================================ */
  function normField(f, i) {
    f = f || {};
    var unit = f.unit || '';
    return {
      name: f.name != null ? String(f.name) : 'f' + i,
      label: f.label != null ? String(f.label) : '',
      ariaLabel: f.ariaLabel || null,
      answer: f.answer,
      tol: f.tol,
      angle: !!f.angle,
      unit: unit,
      unitText: unitDisplay(unit),
      answerTex: f.answerTex || null,
      placeholder: f.placeholder || null,
      nonNegative: !!f.nonNegative,
      anyIfZero: f.anyIfZero || null
    };
  }

  function pointFields(q) {
    var p = q.answerPoint || [0, 0, 0], u = q.unit || '', tol = q.tol;
    if (q.system === 'cart') {
      return [
        normField({ name: 'x', label: '\\(x\\)', answer: p[0], unit: u, tol: tol }, 0),
        normField({ name: 'y', label: '\\(y\\)', answer: p[1], unit: u, tol: tol }, 1),
        normField({ name: 'z', label: '\\(z\\)', answer: p[2], unit: u, tol: tol }, 2)
      ];
    }
    return [
      normField({ name: 'r', label: '\\(\\colR{r}\\)', ariaLabel: 'r', answer: p[0], unit: u, tol: tol, nonNegative: true }, 0),
      normField({ name: 'theta', label: '\\(\\colT{\\theta}\\)', ariaLabel: 'theta', answer: p[1], angle: true, tol: q.angleTol, anyIfZero: 'r' }, 1),
      normField({ name: 'z', label: '\\(\\colZ{z}\\)', ariaLabel: 'z', answer: p[2], unit: u, tol: tol }, 2)
    ];
  }

  function normalize(spec) {
    if (spec && spec.__cylquiz) return spec;
    spec = spec || {};
    var q = {};
    for (var k in spec) if (own(spec, k)) q[k] = spec[k];
    q.__cylquiz = true;
    if (q.type == null || q.type === '') q.type = q.choices ? 'mc' : q.answerPoint ? 'point' : q.fields ? 'fields' : 'numeric';
    else if (!own(TYPES, q.type)) {
      // A typo such as 'multiple' must not silently become an unanswerable numeric box: report it (the QA
      // harness shows CYL.error output) and fall back to the type the spec's content implies.
      var guess = q.choices ? ((q.choices || []).filter(function (c) { return c && c.correct; }).length > 1 ? 'multi' : 'mc')
        : q.answerPoint ? 'point' : q.fields ? 'fields' : 'numeric';
      reportOnce('unknown question type "' + q.type + '"' + (q.id != null ? ' in question "' + q.id + '"' : '') +
        ' (use mc, multi, numeric, fields or point); treating it as "' + guess + '"');
      q.type = guess;
    }
    q.id = q.id != null ? String(q.id) : null;
    q.hints = Array.isArray(q.hints) ? q.hints.filter(function (h) { return h != null && h !== ''; }) : (q.hints ? [q.hints] : []);
    if (q.type === 'mc' || q.type === 'multi') {
      q.choices = (q.choices || []).map(function (c, i) {
        if (typeof c === 'string') c = { html: c };
        return { index: i, html: c.html != null ? String(c.html) : escapeHtml(c.text || ''), correct: !!c.correct,
                 feedback: c.feedback || '', fixed: !!c.fixed, aria: c.aria || c.ariaLabel || null };
      });
      q.fields = null;
    } else if (q.type === 'point') {
      q.system = q.system === 'cart' ? 'cart' : 'cyl';
      q.fields = pointFields(q);
    } else if (q.type === 'fields') {
      q.fields = (q.fields || []).map(normField);
    } else {
      q.type = 'numeric';
      q.fields = [normField({ name: 'value', label: q.label || '', ariaLabel: q.ariaLabel || null, answer: q.answer, tol: q.tol,
                              angle: q.angle, unit: q.unit, answerTex: q.answerTex, placeholder: q.placeholder }, 0)];
    }
    return q;
  }

  function choiceOrder(q) {
    var idx = q.choices.map(function (c) { return c.index; });
    if (q.shuffle === false) return idx;
    var free = idx.filter(function (i) { return !q.choices[i].fixed; });
    rng(q.seed != null ? q.seed : 'cylquiz:' + (q.id || plainLabel(q.prompt).slice(0, 80))).shuffle(free);
    var out = [], fi = 0;
    idx.forEach(function (i) { out.push(q.choices[i].fixed ? i : free[fi++]); });
    return out;
  }

  /* ================================================================================================
     Grading (pure; no DOM)
     ================================================================================================ */
  function selectionOf(q, response) {
    var arr = response == null ? [] : Array.isArray(response) ? response : [response];
    var out = [];
    arr.forEach(function (x) {
      var i = +x;
      if (isFinite(i) && i >= 0 && i < q.choices.length && out.indexOf(i) < 0) out.push(i);
    });
    if (q.type === 'mc') out = out.slice(0, 1);
    return out.sort(function (a, b) { return a - b; });
  }
  function fieldValues(q, response) {
    var vals = {};
    if (q.type === 'numeric') {
      vals.value = response != null && typeof response === 'object' && !Array.isArray(response) ? response.value : response;
      return vals;
    }
    q.fields.forEach(function (f, i) {
      var v;
      if (Array.isArray(response)) v = response[i];
      else if (response && typeof response === 'object') {
        v = own(response, f.name) ? response[f.name] : (f.name === 'theta' && own(response, 'θ') ? response['θ'] : undefined);
      }
      vals[f.name] = v;
    });
    return vals;
  }

  /**
   * grade(spec, response) → {status, correct, selected, parts, wrongPicks, missed, degParts}
   *   status: 'graded' | 'blank' (nothing entered) | 'incomplete' (some boxes empty) | 'unreadable' |
   *           'degrees' (an angle typed in degrees without the ° sign that WOULD be right in degrees)
   *   response: mc → choice index (original order) or null; multi → array of indices; numeric → string/number;
   *             fields/point → {name: string} (point names: r, theta, z | x, y, z) or an array in field order.
   */
  function grade(spec, response) {
    var q = normalize(spec);
    if (q.type === 'mc' || q.type === 'multi') {
      var sel = selectionOf(q, response);
      var corr = q.choices.filter(function (c) { return c.correct; }).map(function (c) { return c.index; });
      var out = { status: sel.length ? 'graded' : 'blank', correct: false, selected: sel, parts: [],
                  wrongPicks: sel.filter(function (i) { return !q.choices[i].correct; }),
                  missed: corr.filter(function (i) { return sel.indexOf(i) < 0; }) };
      if (sel.length) {
        out.correct = q.type === 'mc' ? q.choices[sel[0]].correct : (out.wrongPicks.length === 0 && out.missed.length === 0);
      }
      return out;
    }
    var vals = fieldValues(q, response);
    var parts = q.fields.map(function (f) {
      var raw = vals[f.name];
      var rd = readNumber(raw == null ? '' : raw, { angle: f.angle, unit: f.unit });
      return { name: f.name, field: f, raw: raw == null ? '' : String(raw), read: rd, value: rd.ok ? rd.value : NaN,
               blank: rd.blank, ok: rd.ok, error: rd.error, correct: false, ignored: false, notes: [] };
    });
    parts.forEach(function (p) {
      if (!p.field.anyIfZero) return;
      var ref = q.fields.filter(function (g) { return g.name === p.field.anyIfZero; })[0];
      // any θ is right when r = 0 — but only a blank or readable θ; unreadable text is reported as such
      if (ref && isZero(ref.answer) && (p.blank || p.ok)) { p.ignored = true; p.correct = true; }
    });
    var active = parts.filter(function (p) { return !p.ignored; });
    var res = { status: 'graded', correct: false, parts: parts, selected: null, degParts: [] };
    if (active.every(function (p) { return p.blank; })) { res.status = 'blank'; return res; }
    if (active.some(function (p) { return p.blank; })) { res.status = 'incomplete'; return res; }
    if (active.some(function (p) { return !p.ok; })) { res.status = 'unreadable'; return res; }
    active.forEach(function (p) { p.correct = matchesField(p.value, p.field); });
    var degParts = active.filter(function (p) { return !p.correct && p.read.degSuspect && matchesField(p.value * DEG, p.field); });
    if (degParts.length) { res.status = 'degrees'; res.degParts = degParts; return res; }
    active.forEach(function (p) { if (!p.correct) p.notes = notesFor(p, q); });
    res.correct = active.every(function (p) { return p.correct; });
    return res;
  }

  // Name of a box for use inside a sentence: "\(F_r =\)" → "\(F_r\)".
  function fieldName(f, q) {
    if (q && q.type === 'numeric') return 'your answer';
    var lab = String(f.label || '');
    var m = /^\s*\\\(([\s\S]*?)\s*=?\s*\\\)\s*$/.exec(lab);
    if (m) return '\\(' + m[1] + '\\)';
    return lab ? lab.replace(/\s*[=:]\s*$/, '') : escapeHtml(f.name);
  }
  function notesFor(p, q) {
    var f = p.field, v = p.value, notes = [];
    var a = +answersOf(f)[0];
    var name = fieldName(f, q);
    var nameCap = q && q.type === 'numeric' ? 'Your answer' : name;
    if (f.angle) {
      if (p.read.degSuspect) {
        notes.push('A number without a unit is read as radians, so ' + escapeHtml(p.raw.trim()) + ' means ' +
          escapeHtml(fmt(v)) + ' rad. For degrees, add ° or deg.');
      } else if (closeTo(v + Math.PI, a, f)) {
        notes.push(nameCap + ' is off by \\(\\pi\\) (180°). Check which quadrant the point is in: ' +
          '\\(\\arctan(y/x)\\) on its own can land in the opposite quadrant.');
      } else if (Math.abs(angleDiff(a, 0)) > 1e-6 && Math.abs(angleDiff(a, Math.PI)) > 1e-6 && closeTo(-v, a, f)) {
        notes.push('Check the direction of ' + name + ': \\(\\theta\\) is measured counter-clockwise from the \\(+x\\) axis.');
      }
    } else {
      if (f.nonNegative && v < 0) {
        notes.push(nameCap + ' is a distance from the \\(z\\)-axis, so it cannot be negative.');
      } else if (Math.abs(a) > 1e-9 && closeTo(-v, a, f)) {
        notes.push('Check the sign of ' + name + '.');
      } else if (f.unitText && Math.abs(a) > 1e-9 && [1000, 100, 0.001, 0.01].some(function (k) { return closeTo(v / k, a, f); })) {
        notes.push('Check the units of ' + name + ': enter it in ' + escapeHtml(f.unitText) + '.');
      }
    }
    return notes;
  }

  /* ================================================================================================
     Displaying answers and responses (TeX / HTML)
     ================================================================================================ */
  function exactTex(x) {
    var c = core();
    if (!c) return null;
    var s = c.surdTex ? c.surdTex(x) : null;
    if (s && /\\sqrt/.test(s)) return s;
    var p = c.piFrac ? c.piFrac(x) : null;
    if (p && /\\pi/.test(p)) return p;
    return null;
  }
  function angleTexOf(x, withDeg) {
    var w = wrap2pi(x), c = core();
    if (c && c.angleTex) return c.angleTex(w, { deg: withDeg !== false });
    return fmtTex(w) + (withDeg !== false ? '\\ (' + fmtTex(w / DEG) + '^\\circ)' : '');
  }
  function valueTex(x, f, compact) {
    x = +x;
    if (!isFinite(x)) return '\\text{?}';
    if (f && f.angle) return angleTexOf(x, !compact);
    var e = exactTex(x);
    if (e) return compact ? e : e + ' \\approx ' + fmtTex(x);
    return fmtTex(x);
  }
  function unitTex(f) {
    var u = f && f.unitText;
    return u ? '\\ ' + unitToTex(u) : '';
  }
  function fieldAnswerTex(f, compact) {
    if (f.answerTex) return f.answerTex;
    var ans = answersOf(f);
    return ans.map(function (a) { return valueTex(a, f, compact); }).join('\\ \\text{or}\\ ') + (compact ? '' : unitTex(f));
  }
  function pointNamesTex(q) {
    return q.system === 'cart' ? '(x,\\ y,\\ z)' : '(r,\\ \\theta,\\ z)';
  }
  /** TeX of the correct answer (numeric / fields / point). null for choice questions. */
  function answerTexOf(spec) {
    var q = normalize(spec);
    if (!q.fields) return null;
    if (q.type === 'numeric') return fieldAnswerTex(q.fields[0], false);
    if (q.type === 'point') {
      if (q.answerTex) return String(q.answerTex);   // the page's own wording (display only; grading uses answerPoint)
      var rZero = q.system === 'cyl' && isZero(q.fields[0].answer);
      var cells = q.fields.map(function (f) {
        if (rZero && f.anyIfZero) return '\\text{any }\\theta';
        return fieldAnswerTex(f, true);
      });
      var t = pointNamesTex(q) + ' = (' + cells.join(',\\ ') + ')';
      var dec = q.fields.map(function (f) { return f.angle ? fmtTex(wrap2pi(+answersOf(f)[0])) : fmtTex(+answersOf(f)[0]); });
      var anyExact = q.fields.some(function (f) { return !f.answerTex && exactTex(+answersOf(f)[0]) && !(rZero && f.anyIfZero); });
      if (anyExact && !rZero) t += ' \\approx (' + dec.join(',\\ ') + ')';
      return t + unitTex(q.fields[0]);
    }
    // "F_r = 18.66 N, F_θ = 12.32 N": \nobreak after "=" keeps each value on the line of its label, and
    // \allowbreak after each comma is where a narrow line wraps (KaTeX breaks only after = and operators).
    return q.fields.map(function (f) {
      var lab = plainLabelTex(f);
      return (lab ? lab + ' = \\nobreak ' : '') + fieldAnswerTex(f, false);
    }).join(',\\allowbreak\\quad ');
  }
  // A field label (text and/or \( \) math, may contain simple HTML) → TeX without the trailing "=" / ":",
  // e.g. "\(F_r =\)" → "F_r", "Inner radius \(r_1\) =" → "\text{Inner radius }{r_1}".
  function plainLabelTex(f) {
    var lab = decodeEntities(String(f.label || '').replace(/<[^>]*>/g, ''));
    var parts = [], re = /\\\(([\s\S]*?)\\\)/g, last = 0, m;
    while ((m = re.exec(lab))) {
      if (m.index > last) parts.push({ text: lab.slice(last, m.index) });
      parts.push({ math: m[1] });
      last = re.lastIndex;
    }
    if (last < lab.length) parts.push({ text: lab.slice(last) });
    while (parts.length) {                                         // drop the trailing "=" / ":"
      var p = parts[parts.length - 1];
      if (p.text != null) { p.text = p.text.replace(/[\s=:]+$/, ''); if (!p.text) { parts.pop(); continue; } }
      else { p.math = p.math.replace(/\s*[=:]\s*$/, ''); if (!p.math.trim()) { parts.pop(); continue; } }
      break;
    }
    if (parts.length && parts[0].text != null) parts[0].text = parts[0].text.replace(/^\s+/, '');
    if (parts.length === 1 && parts[0].math != null) return parts[0].math.trim();
    return parts.map(function (p) {
      if (p.math != null) return '{' + p.math + '}';
      return p.text ? '\\text{' + p.text.replace(/[\\^~]/g, '').replace(/[&%#_${}]/g, '\\$&') + '}' : '';
    }).join('');
  }
  function responseTex(p) {
    if (p.blank) return null;
    if (!p.ok) return null;
    return p.read.tex || fmtTex(p.value);
  }
  /** HTML summary of a student's response to a fields/numeric/point question. */
  function responseHtml(q, g) {
    if (!q.fields || !g.parts) return '';
    function one(p) {
      if (p.blank) return '<span class="muted">(blank)</span>';
      if (!p.ok) return '<code>' + escapeHtml(p.raw) + '</code> <span class="muted">(could not be read)</span>';
      var t = responseTex(p);
      var val = p.field.angle ? fmt(p.value) + ' rad' : fmt(p.value);
      var plainNum = /^-?\d+(\.\d+)?$/.test(p.raw.trim().replace(/\s+/g, ''));
      if (p.read.degSuspect) return tex(t) + ' <span class="muted">(no unit: read as radians)</span>';
      return tex(t) + (plainNum ? '' : ' <span class="muted">(= ' + escapeHtml(val) + ')</span>');
    }
    if (q.type === 'numeric') {
      var p0 = g.parts[0];
      return one(p0) + (p0.ok && q.fields[0].unitText ? ' ' + escapeHtml(q.fields[0].unitText) : '');
    }
    return g.parts.map(function (p) {
      var lab = plainLabelTex(p.field);
      return '<span class="nowrap">' + (lab ? tex(lab + ' =') + ' ' : '') + one(p) + '</span>';
    }).join(', ');
  }

  /* ================================================================================================
     Styles (one small <style>; only module.css design tokens)
     ================================================================================================ */
  var CSS = [
    '.q-card .q-title:focus{outline:none}',
    '.q-title-status{margin-left:auto;letter-spacing:.04em}',
    '.q-card.is-incorrect .q-title-status{color:var(--c-bad)}',
    '.q-note{margin:-4px 0 10px;font-size:.85rem;color:var(--ink-muted)}',
    '.q-choice-body{flex:1;min-width:0}',
    '.q-choice-body>p{margin:0}',
    '.q-choice-tag{display:inline-block;margin-left:8px;font-size:.7rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap}',
    '.q-choice.is-correct .q-choice-tag{color:var(--c-good)}.q-choice.is-incorrect .q-choice-tag{color:var(--c-bad)}',
    '.q-card.is-locked .q-choice{cursor:default}.q-card.is-locked .q-choice:hover{border-color:var(--line)}',
    '.q-card.is-locked .q-choice.is-correct:hover{border-color:var(--c-good)}.q-card.is-locked .q-choice.is-incorrect:hover{border-color:var(--c-bad)}',
    '.q-card.is-locked .q-input{cursor:default}',
    /* Each field is a small grid: [label][input][unit], with the live echo and the hint lined up under the input.
       The label and the unit are never squeezed (explicit min-content / max-content tracks, so module.css's
       label min-width cannot lower the label track below its content); the input is the column that gives way
       (9.5rem down to 5.5rem). Fields are sized to their content and wrap onto a new line before they shrink;
       only a field that is alone on its line and still too wide shrinks its input and, as a last resort,
       wraps a long text label between words. */
    '.q-fields{align-items:flex-start}',
    '.q-fields>.q-field{display:grid;grid-template-columns:minmax(min-content,max-content) minmax(5.5rem,9.5rem) minmax(max-content,1fr);' +
      'align-items:center;align-content:start;column-gap:8px;row-gap:3px;flex:0 1 auto;max-width:100%}',
    '.q-fields>.q-field-hint{margin-top:-6px}',
    '.q-fields.q-single>.q-field{flex-basis:100%;grid-template-columns:minmax(min-content,max-content) minmax(5.5rem,13rem) minmax(max-content,1fr)}',
    '.q-field>label{grid-column:1;white-space:normal}',
    '.q-field>label .katex{white-space:nowrap}',
    '.q-field>.q-input{grid-column:2;width:100%;min-width:0}',
    '.q-field>.q-unit{grid-column:3;white-space:nowrap}',
    '.q-field>.q-echo,.q-field>.q-field-hint{grid-column:2/-1;min-width:0;contain:inline-size}',
    '.q-echo{min-height:1.4em;line-height:1.4}',
    '.q-echo:empty{min-height:0}',
    '.q-echo .katex{font-size:1.1em}',
    '.q-echo-warn{color:var(--c-warn)}',
    '.q-feedback p{margin:0 0 .45em}.q-feedback ul{margin:.2em 0 .45em;padding-left:1.2em}',
    '.q-feedback .q-answer{margin-top:.3em}',
    '.q-hints:empty{display:none}',
    '.q-solution-body>:last-child{margin-bottom:0}',
    /* sets */
    '.q-set{margin:2rem 0}',
    '.q-set-head{margin:0 0 14px}',
    '.q-set-title{margin:0 0 4px;font-size:1.17em;font-weight:700;line-height:1.3}',
    '.q-set-intro{margin:0 0 10px;color:var(--ink-muted);font-size:.92rem}',
    '.q-set-progress{display:flex;align-items:center;gap:12px;font-size:.85rem;color:var(--ink-muted)}',
    '.q-set-bar{flex:1;height:8px;border-radius:99px;background:var(--bg-sunken);border:1px solid var(--line);overflow:hidden}',
    '.q-set-bar>span{display:block;height:100%;width:0;background:var(--accent);border-radius:inherit;transition:width .25s}',
    '.q-set-count{white-space:nowrap;font-variant-numeric:tabular-nums}',
    '.q-set-dots{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0 0;padding:0;list-style:none}',
    '.q-set-dot{-webkit-appearance:none;appearance:none;min-width:34px;height:34px;padding:0 8px;border-radius:99px;border:1px solid var(--line);' +
      'background:var(--bg-elev);color:var(--ink-muted);font:inherit;font-size:.84rem;font-weight:650;font-variant-numeric:tabular-nums;cursor:pointer}',
    '.q-set-dot:hover{border-color:var(--accent);color:var(--ink)}',
    '.q-set-dot.is-answered{border-color:var(--accent);color:var(--accent);background:color-mix(in srgb,var(--accent) 10%,var(--bg-elev))}',
    '.q-set-dot[aria-current="step"]{outline:2px solid var(--accent);outline-offset:2px;color:var(--ink)}',
    '.q-set-dot.is-correct{border-color:var(--c-good);color:var(--c-good);background:color-mix(in srgb,var(--c-good) 12%,var(--bg-elev))}',
    '.q-set-dot.is-incorrect{border-color:var(--c-bad);color:var(--c-bad);background:color-mix(in srgb,var(--c-bad) 10%,var(--bg-elev))}',
    '.q-set-list>.q-card{margin:0}.q-set-list>.q-card+.q-card{margin-top:16px}',
    '.q-set-nav{margin-top:16px}',
    '.q-set-confirm,.q-set-done{margin-top:14px;padding:12px 16px;border-radius:var(--radius);border:1px solid var(--line);background:var(--bg-sunken)}',
    '.q-set-confirm{border-color:color-mix(in srgb,var(--c-warn) 45%,var(--line));background:color-mix(in srgb,var(--c-warn) 9%,var(--bg-elev))}',
    '.q-set-done{border-color:color-mix(in srgb,var(--c-good) 45%,var(--line));background:color-mix(in srgb,var(--c-good) 9%,var(--bg-elev))}',
    '.q-set-confirm p,.q-set-done p{margin:0 0 10px}',
    '.q-set-results{margin:0 0 18px;padding:18px 20px;border:1px solid var(--line);border-radius:var(--radius);background:var(--bg-elev);box-shadow:var(--shadow)}',
    '.q-set-results:focus{outline:none}',
    '.q-score{display:flex;flex-wrap:wrap;align-items:center;gap:14px 20px;margin:0 0 14px}',
    '.q-score-ring{--p:0;flex:none;width:92px;height:92px;border-radius:50%;display:grid;place-items:center;' +
      'background:conic-gradient(var(--q-ring,var(--accent)) calc(var(--p)*1%),var(--bg-sunken) 0)}',
    '.q-score-ring>span{width:72px;height:72px;border-radius:50%;background:var(--bg-elev);display:grid;place-items:center;' +
      'font-size:1.25rem;font-weight:750;font-variant-numeric:tabular-nums;color:var(--ink)}',
    '.q-score-text{flex:1;min-width:12rem}',
    '.q-score-label{margin:0;font-size:.76rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--accent)}',
    '.q-score-value{margin:0;font-size:1.6rem;font-weight:750;line-height:1.2;font-variant-numeric:tabular-nums}',
    '.q-score-msg{margin:4px 0 0;color:var(--ink-muted)}',
    '.q-set-namebox{display:flex;flex-wrap:wrap;align-items:flex-end;gap:10px 12px;margin:0 0 12px}',
    '.q-set-namebox .field{flex:1 1 14rem}',
    '.q-set-namebox .q-input{width:100%}',
    '.q-set-review-note{margin:12px 0 0;font-size:.88rem;color:var(--ink-muted)}',
    '.q-set-results .q-set-dots{margin:0 0 16px}',
    /* printable results sheet: hidden on screen; when printing through CYLQuiz only the sheet shows */
    '.cylquiz-print-sheet{display:none}',
    '@media print{',
    'html.cylquiz-printing body>*:not(.cylquiz-print-sheet){display:none!important}',
    'html.cylquiz-printing body>.cylquiz-print-sheet{display:block!important}',
    '.cylquiz-print-sheet{font-size:10.5pt;line-height:1.45;color:var(--ink)}',
    '.cylquiz-print-sheet h1{font-size:18pt;margin:0 0 4pt}',
    '.cqp-eyebrow{margin:0 0 2pt;font-size:8.5pt;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--accent)}',
    '.cqp-meta{border-collapse:collapse;margin:8pt 0 12pt}',
    '.cqp-meta th,.cqp-meta td{text-align:left;padding:3pt 14pt 3pt 0;vertical-align:bottom}',
    '.cqp-meta th{font-weight:700;color:var(--ink-muted);font-size:9pt;text-transform:uppercase;letter-spacing:.06em}',
    '.cqp-blank{display:inline-block;min-width:18em;border-bottom:1px solid var(--ink)}',
    '.cqp-table{width:100%;border:1px solid var(--line)}',
    '.cqp-table td,.cqp-table th{padding:5pt 7pt!important}',
    '.cqp-table tr{break-inside:avoid;page-break-inside:avoid}',
    '.cqp-table p{margin:0 0 3pt}.cqp-table .q-choice-body p{margin:0}',
    '.cqp-ok{color:var(--c-good);font-weight:700;white-space:nowrap}.cqp-bad{color:var(--c-bad);font-weight:700;white-space:nowrap}',
    '.cqp-foot{margin-top:10pt;font-size:8.5pt;color:var(--ink-muted)}',
    '}'
  ].join('\n');
  function injectStyle() {
    if (typeof document === 'undefined' || document.getElementById('cylquiz-style')) return;
    var s = document.createElement('style');
    s.id = 'cylquiz-style';
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  /* ================================================================================================
     A single question card
     ================================================================================================ */
  function makeQuestion(container, spec, ctx) {
    injectStyle();
    ctx = ctx || {};
    var q = normalize(spec);
    var mode = ctx.mode || (spec.mode === 'practice' || spec.practice ? 'practice' : 'check');
    var quiz = mode === 'quiz';
    var practice = mode === 'practice';
    var persist = !quiz && ctx.persist !== false && spec.persist !== false && !!q.id;
    var base = uid();
    var isChoice = q.type === 'mc' || q.type === 'multi';
    var st = { attempts: 0, wrong: 0, correct: false, hintsShown: 0, solutionShown: false, restored: false, reviewed: null,
               lastWrongKey: null };   // the last response that was graded wrong (re-checking it is not a new attempt)

    // ---------------- DOM
    var card = el('div', { class: 'q-card', id: base, 'data-qtype': q.type, 'data-qid': q.id });
    var titleEl = el('p', { class: 'q-title', id: base + '-t', tabindex: '-1' });
    var titleText = el('span', { text: ctx.label || q.title || 'Check your understanding' });
    var titleStatus = el('span', { class: 'q-title-status', hidden: true });
    titleEl.appendChild(titleText);
    titleEl.appendChild(titleStatus);
    var promptEl = el('div', { class: 'q-prompt', id: base + '-p', html: wrapBlock(q.prompt) });
    card.appendChild(titleEl);
    card.appendChild(promptEl);

    var choiceEls = [];   // in display order: {index, label, input, body}
    var fieldEls = [];    // in field order:  {f, input, echo, hint}
    if (isChoice) {
      if (q.type === 'multi') card.appendChild(el('p', { class: 'q-note', id: base + '-n', text: 'Select all that apply.' }));
      var box = el('div', { class: 'q-choices', role: q.type === 'mc' ? 'radiogroup' : 'group',
                            'aria-labelledby': base + '-p', 'aria-describedby': q.type === 'multi' ? base + '-n' : null });
      choiceOrder(q).forEach(function (ci) {
        var c = q.choices[ci];
        // Browsers take little or no text from KaTeX output (Chrome names a radio labelled "\(5\ \text{m}\)" ""),
        // so a choice with math gets an explicit name: choice.aria, or the label spoken as words.
        var aria = c.aria || (/\\[(\[]/.test(c.html) ? spokenLabel(c.html) : '') || null;
        var input = el('input', { type: q.type === 'mc' ? 'radio' : 'checkbox', name: base + '-c', value: String(ci), 'aria-label': aria });
        var body = el('span', { class: 'q-choice-body', html: c.html });
        var label = el('label', { class: 'q-choice', 'data-choice': String(ci) }, [input, body]);
        box.appendChild(label);
        choiceEls.push({ index: ci, label: label, input: input, body: body, aria: aria });
      });
      card.appendChild(box);
    } else {
      var fbox = el('div', { class: 'q-fields' + (q.fields.length === 1 ? ' q-single' : ''), role: 'group', 'aria-labelledby': base + '-p' });
      var lateHints = [];
      q.fields.forEach(function (f, i) {
        var fid = base + '-f' + i;
        var labelHtml = f.label || (q.type === 'numeric' ? 'Answer' : escapeHtml(f.name));
        // An explicit accessible name: the <label> alone is not enough, because browsers derive little or
        // nothing from KaTeX output ("\(\omega =\)" gives an empty name in Chrome). spokenLabel() turns the
        // label into words ("ω", "r dot", "Inner radius r 1") without the trailing "=".
        var aria = f.ariaLabel || spokenLabel(f.label) || (q.type === 'numeric' ? 'Your answer' : f.name);
        if (f.unitText) aria += ' (in ' + f.unitText + ')';
        var label = el('label', { for: fid, html: labelHtml });
        var input = el('input', {
          class: 'q-input', type: 'text', id: fid, name: f.name, autocomplete: 'off', autocapitalize: 'off',
          autocorrect: 'off', spellcheck: 'false', inputmode: 'text', 'aria-label': aria,
          placeholder: f.placeholder || (f.angle ? 'e.g. 3pi/4' : null)
        });
        var echo = el('span', { class: 'q-echo', id: fid + '-e' });
        // Angle hint: under the input for a single box; on its own full-width row when there are several boxes.
        var hint = null;
        if (f.angle) {
          var multi = q.fields.length > 1;
          hint = el('span', { class: 'q-field-hint', id: fid + '-h' });
          // Several boxes: say which box the hint is for ("φ: radians …"), rendered like the label. The prefix
          // is hidden from the input's description, which already has the box's name.
          if (multi) hint.appendChild(el('span', { 'aria-hidden': 'true', html: fieldName(f, q) + ': ' }));
          hint.appendChild(document.createTextNode(ANGLE_HINT));
          if (multi) lateHints.push(hint);
        }
        input.setAttribute('aria-describedby', fid + '-e' + (hint ? ' ' + fid + '-h' : ''));
        // plain-text caret / asterisk notation is shown as the echoes show it ("m/s^2" → "m/s²", "N*m" → "N·m")
        var unit = f.unit ? el('span', { class: 'q-unit', html: /[\^*]/.test(f.unit) ? escapeHtml(f.unitText) : f.unit }) : null;
        var wrap = el('div', { class: 'q-field', 'data-field': f.name }, [label, input, unit, echo, lateHints.indexOf(hint) < 0 ? hint : null]);
        fbox.appendChild(wrap);
        fieldEls.push({ f: f, wrap: wrap, label: label, input: input, echo: echo, hint: hint, errTimer: null });
      });
      lateHints.forEach(function (h) { fbox.appendChild(h); });
      card.appendChild(fbox);
    }

    var checkBtn = null, hintBtn = null, solBtn = null, resetBtn = null, attemptsEl = null, actions = null;
    if (!quiz) {
      checkBtn = el('button', { type: 'button', class: 'btn primary q-check', text: 'Check' });
      if (q.hints.length) hintBtn = el('button', { type: 'button', class: 'btn q-hint-btn', text: 'Show a hint' });
      resetBtn = el('button', { type: 'button', class: 'btn q-reset', text: practice ? 'Try again' : 'Reset', hidden: true });
      attemptsEl = el('span', { class: 'q-attempts', hidden: true });
    }
    if (q.solution) {
      solBtn = el('button', { type: 'button', class: 'btn q-solution-btn', 'aria-expanded': 'false', 'aria-controls': base + '-s',
                              text: 'Show solution', hidden: true });
    }
    if (!quiz) {
      actions = el('div', { class: 'q-actions' }, [checkBtn, hintBtn, solBtn, resetBtn, attemptsEl]);
      card.appendChild(actions);
    }
    var feedback = el('div', { class: 'q-feedback', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true', tabindex: '-1' });
    var hintsBox = el('div', { class: 'q-hints', 'aria-live': 'polite' });
    var solEl = q.solution ? el('div', { class: 'q-solution', id: base + '-s', hidden: true }) : null;
    card.appendChild(feedback);
    card.appendChild(hintsBox);
    if (solEl) card.appendChild(solEl);
    if (container) container.appendChild(card);

    renderMath(card);

    // ---------------- response get / set
    function getResponse() {
      if (isChoice) {
        var sel = choiceEls.filter(function (c) { return c.input.checked; }).map(function (c) { return c.index; }).sort(function (a, b) { return a - b; });
        return q.type === 'mc' ? (sel.length ? sel[0] : null) : sel;
      }
      if (q.type === 'numeric') return fieldEls[0].input.value;
      var o = {};
      fieldEls.forEach(function (fe) { o[fe.f.name] = fe.input.value; });
      return o;
    }
    function setResponse(r) {
      if (isChoice) {
        var sel = selectionOf(q, r);
        choiceEls.forEach(function (c) { c.input.checked = sel.indexOf(c.index) >= 0; });
      } else {
        var vals = fieldValues(q, r);
        fieldEls.forEach(function (fe) { fe.input.value = vals[fe.f.name] == null ? '' : String(vals[fe.f.name]); updateEcho(fe, true); });
      }
    }
    // Answered = every box the grader needs is filled (a blank θ is fine when the correct r is 0).
    function isAnswered() {
      if (isChoice) { var r = getResponse(); return q.type === 'mc' ? r != null : r.length > 0; }
      var stt = grade(q, getResponse()).status;
      return stt !== 'blank' && stt !== 'incomplete';
    }
    function isBlank() {
      if (isChoice) return !isAnswered();
      return fieldEls.every(function (fe) { return fe.input.value.trim() === ''; });
    }
    // Identity of the current response (whitespace-insensitive), to recognise an unchanged re-check.
    function responseKey() {
      var r = getResponse();
      var norm = function (v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); };
      if (typeof r === 'string') r = norm(r);
      else if (r && typeof r === 'object' && !Array.isArray(r)) {
        var o = {};
        Object.keys(r).sort().forEach(function (k) { o[k] = norm(r[k]); });
        r = o;
      }
      return JSON.stringify(r);
    }

    // ---------------- live echo
    function echoHtml(rd, f) {
      var s = '';
      var t = rd.tex;
      var plain = /^-?\d+(\.\d+)?$/.test(String(rd.raw).trim().replace(/\s+/g, ''));
      var simpleDeg = rd.deg && t && /^-?[\d.]+\^\{\\circ\}$/.test(t);
      if (t && !plain && !simpleDeg && !/^-?[\d.]+$/.test(t)) s += tex(t) + ' ';
      s += '= ' + escapeHtml(fmt(rd.value));
      if (f.angle) {
        s += ' rad (' + escapeHtml(fmt(rd.value / DEG)) + '°)';
        if (rd.degSuspect) s += ' <span class="q-echo-warn">· add ° if you meant degrees</span>';
      } else if (f.unitText) {
        s += ' ' + escapeHtml(f.unitText);
      }
      return s;
    }
    function updateEcho(fe, showErrorNow) {
      clearTimeout(fe.errTimer);
      var rd = readNumber(fe.input.value, { angle: fe.f.angle, unit: fe.f.unit });
      if (rd.blank) {
        fe.echo.innerHTML = '';
        fe.echo.className = 'q-echo';
        fe.input.removeAttribute('aria-invalid');
        return rd;
      }
      if (rd.ok) {
        fe.echo.innerHTML = echoHtml(rd, fe.f);
        fe.echo.className = 'q-echo';
        fe.input.removeAttribute('aria-invalid');
        return rd;
      }
      var showErr = function () {
        fe.echo.textContent = rd.error;
        fe.echo.className = 'q-echo is-error';
        fe.input.setAttribute('aria-invalid', 'true');
      };
      if (showErrorNow) showErr();
      else {
        // while typing, a half-finished expression is normal: wait a moment before complaining
        fe.echo.className = 'q-echo';
        fe.echo.textContent = '';
        fe.errTimer = setTimeout(showErr, 700);
      }
      return rd;
    }

    // ---------------- state helpers
    function setLocked(on) {
      card.classList.toggle('is-locked', !!on);
      choiceEls.forEach(function (c) { c.input.disabled = !!on; });
      fieldEls.forEach(function (fe) { fe.input.readOnly = !!on; });
    }
    function clearMarks() {
      card.classList.remove('is-correct', 'is-incorrect');
      choiceEls.forEach(function (c) {
        c.label.classList.remove('is-correct', 'is-incorrect');
        var tag = c.label.querySelector('.q-choice-tag'); if (tag) tag.remove();
        if (c.aria) c.input.setAttribute('aria-label', c.aria);
        var cf = c.body.querySelector('.q-choice-feedback'); if (cf) cf.remove();
      });
      fieldEls.forEach(function (fe) { fe.input.classList.remove('is-correct', 'is-incorrect'); fe.input.removeAttribute('aria-invalid'); });
      show(titleStatus, false);
    }
    function solutionAvailable() {
      return !!q.solution && (practice || st.correct || st.wrong >= 2 || !!st.reviewed);
    }
    function refreshButtons() {
      if (quiz && !st.reviewed) { show(solBtn, false); return; }
      if (checkBtn) show(checkBtn, !st.correct);
      if (resetBtn) show(resetBtn, st.correct);
      if (hintBtn) {
        show(hintBtn, !st.correct && st.hintsShown < q.hints.length);
        hintBtn.textContent = st.hintsShown ? 'Show another hint' : 'Show a hint';
      }
      if (solBtn) {
        show(solBtn, solutionAvailable() || st.solutionShown);   // opened from code: still offer "Hide solution"
        solBtn.textContent = st.solutionShown ? 'Hide solution' : 'Show solution';
        solBtn.setAttribute('aria-expanded', st.solutionShown ? 'true' : 'false');
      }
      if (attemptsEl) {
        show(attemptsEl, st.attempts > 0 && !st.restored);
        attemptsEl.textContent = st.attempts === 1 ? '1 attempt' : st.attempts + ' attempts';
      }
    }
    function setFeedback(html, kind) {
      feedback.className = 'q-feedback' + (kind ? ' ' + kind : '');
      feedback.innerHTML = html || '';
      renderMath(feedback);
    }

    // ---------------- hints and solution
    function showHint() {
      if (st.hintsShown >= q.hints.length) return false;
      var i = st.hintsShown;
      var h = el('div', { class: 'q-hint' }, [
        el('span', { class: 'q-hint-label', text: q.hints.length > 1 ? 'Hint ' + (i + 1) + ' of ' + q.hints.length : 'Hint' }),
        el('div', { html: wrapBlock(q.hints[i]) })
      ]);
      hintsBox.appendChild(h);
      renderMath(h);
      st.hintsShown++;
      // Read this BEFORE refreshButtons(): hiding the button blurs it, after which activeElement is <body>.
      var hadFocus = !!hintBtn && document.activeElement === hintBtn;
      refreshButtons();
      if (hadFocus && hintBtn.hasAttribute('hidden')) {
        // The last hint hid its own button: keep keyboard focus in the card, on the Check button (the new
        // hint is announced by the live region).
        if (checkBtn && !checkBtn.hasAttribute('hidden')) focusQuietly(checkBtn);
        else { h.setAttribute('tabindex', '-1'); focusQuietly(h); }
      }
      return true;
    }
    function fillSolution() {
      if (!solEl || solEl.childNodes.length) return;
      solEl.appendChild(el('span', { class: 'q-solution-label', text: 'Solution' }));
      solEl.appendChild(el('div', { class: 'q-solution-body', html: wrapBlock(q.solution) }));
      renderMath(solEl);
    }
    function showSolution(on) {
      if (!solEl) return false;
      if (on == null) on = true;
      if (on) fillSolution();
      st.solutionShown = !!on;
      show(solEl, !!on);
      refreshButtons();
      return true;
    }

    // ---------------- feedback text
    function wrongChoiceFeedback(g) {
      return g.wrongPicks.map(function (i) { return q.choices[i].feedback; }).filter(Boolean);
    }
    function fieldsSummary(g) {
      if (q.type === 'numeric') return '';
      var ok = [], bad = [];
      g.parts.forEach(function (p) { if (p.ignored) return; (p.correct ? ok : bad).push(fieldName(p.field, q)); });
      function list(a) { return a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
      if (!bad.length) return '';
      if (!ok.length) return 'Check ' + list(bad) + '.';
      return list(ok) + (ok.length > 1 ? ' are' : ' is') + ' right; check ' + list(bad) + '.';
    }
    function anyThetaNote(g) {
      var ign = g.parts && g.parts.some(function (p) { return p.ignored; });
      return ign ? '<p class="small">Because \\(r = 0\\), the point is on the \\(z\\)-axis, so every \\(\\theta\\) describes it: any angle is accepted.</p>' : '';
    }
    function feedbackHtml(g, repeat) {
      var h = '';
      if (g.correct) {
        var chosen = isChoice ? g.selected.map(function (i) { return q.choices[i].feedback; }).filter(Boolean) : [];
        h += '<p><strong class="q-verdict">✓ Correct!</strong>' + (chosen.length ? ' ' + chosen.join(' ') : '') + '</p>';
        h += anyThetaNote(g);
        if (q.explain) h += wrapBlock(q.explain);
        return h;
      }
      var detail;
      if (isChoice) {
        var fb = wrongChoiceFeedback(g);
        if (q.type === 'multi') {
          var bits = [];
          if (g.wrongPicks.length) bits.push(g.wrongPicks.length === 1 ? 'one of your choices is not right' : g.wrongPicks.length + ' of your choices are not right');
          if (g.missed.length) bits.push(g.missed.length === 1 ? 'one correct option is missing' : g.missed.length + ' correct options are missing');
          detail = bits.length ? bits.join(', and ').replace(/^./, function (c) { return c.toUpperCase(); }) + '.' : '';
          if (fb.length) detail += ' ' + fb.join(' ');
        } else detail = fb.join(' ');
      } else detail = fieldsSummary(g);
      h += '<p><strong class="q-verdict">✗ Not quite.</strong>' + (detail ? ' ' + detail : '') + '</p>';
      var notes = [];
      if (g.parts) g.parts.forEach(function (p) { notes = notes.concat(p.notes || []); });
      if (notes.length) h += '<ul>' + notes.map(function (n) { return '<li>' + n + '</li>'; }).join('') + '</ul>';
      h += anyThetaNote(g);
      if (q.explain) h += wrapBlock(q.explain);
      var next;
      if (repeat) next = 'You already checked this answer, so this try was not counted again. Change your answer, then press Check.';
      else if (solutionAvailable()) next = 'Try again, or open the worked solution.';
      else if (hintBtn && st.hintsShown < q.hints.length) next = st.hintsShown ? 'Try again, or show another hint.' : 'Try again. Stuck? Show a hint.';
      else next = 'Try again.';
      h += '<p class="small">' + next + '</p>';
      return h;
    }
    function noticeHtml(g) {
      if (g.status === 'blank') {
        if (q.type === 'mc') return 'Choose an answer first.';
        if (q.type === 'multi') return 'Select at least one option first.';
        return q.fields.length > 1 ? 'Type your answers in the boxes first.' : 'Type your answer first.';
      }
      if (g.status === 'incomplete') {
        var empty = g.parts.filter(function (p) { return p.blank && !p.ignored; }).map(function (p) { return fieldName(p.field, q); });
        return 'Fill in every box first: ' + empty.join(', ') + (empty.length > 1 ? ' are' : ' is') + ' empty.';
      }
      if (g.status === 'unreadable') {
        var bad = g.parts.filter(function (p) { return !p.ignored && !p.blank && !p.ok; });
        return bad.map(function (p) {
          var e = escapeHtml(p.error);            // CYLExpr messages may end in "?" ("did you mean 'abs'?")
          return 'Couldn’t read ' + (q.type === 'numeric' ? 'your answer' : fieldName(p.field, q)) + ': ' + e + (/[.?!]\s*$/.test(e) ? '' : '.');
        }).join(' ') + ' This try was not counted.';
      }
      if (g.status === 'degrees') {
        var p = g.degParts[0];
        var t = escapeHtml(p.raw.trim());
        return 'You typed ' + t + ' with no unit, so it reads as ' + t + ' <em>radians</em>. If you meant degrees, type ' +
          t + '° or ' + t + ' deg (or give the angle in radians). This try was not counted.';
      }
      return '';
    }

    // ---------------- actions
    function persistSave() {
      if (!persist) return;
      store.set(KEY_Q + q.id, { correct: true, attempts: st.attempts, response: getResponse(), at: new Date().toISOString() });
    }
    function markParts(g) {
      if (isChoice) {
        g.selected.forEach(function (i) {
          var c = choiceEls.filter(function (x) { return x.index === i; })[0];
          if (c) c.label.classList.add(q.choices[i].correct ? 'is-correct' : 'is-incorrect');
        });
      } else {
        g.parts.forEach(function (p, i) {
          var fe = fieldEls[i];
          if (p.ignored) return;
          fe.input.classList.add(p.correct ? 'is-correct' : 'is-incorrect');
          if (!p.correct) fe.input.setAttribute('aria-invalid', 'true');
        });
      }
    }

    function check() {
      if (quiz) return grade(q, getResponse()).correct;
      if (st.correct) return true;
      fieldEls.forEach(function (fe) { updateEcho(fe, true); });
      var g = grade(q, getResponse());
      clearMarks();
      if (g.status !== 'graded') {
        setFeedback('<p>' + noticeHtml(g) + '</p>', '');
        return null;
      }
      var key = responseKey();
      if (!g.correct && key === st.lastWrongKey) {
        // Pressing Check again (or Enter twice) on an unchanged wrong answer is not another attempt: it must
        // not count, unlock the solution, or fire onResult again. Show the same feedback with a note.
        markParts(g);
        card.classList.add('is-incorrect');
        setFeedback(feedbackHtml(g, true), 'is-incorrect');
        return false;
      }
      st.attempts++;
      if (g.correct) {
        st.correct = true;
        markParts(g);
        card.classList.add('is-correct');
        var hadFocus = card.contains(document.activeElement);
        setLocked(true);
        persistSave();
        refreshButtons();
        setFeedback(feedbackHtml(g), 'is-correct');
        if (hadFocus && (!document.activeElement || document.activeElement === document.body ||
            document.activeElement.disabled || document.activeElement.hasAttribute('hidden'))) focusQuietly(titleEl);
      } else {
        st.wrong++;
        st.lastWrongKey = key;
        markParts(g);
        card.classList.add('is-incorrect');
        refreshButtons();
        setFeedback(feedbackHtml(g), 'is-incorrect');
      }
      var cb = spec.onResult;
      if (typeof cb === 'function') { try { cb(g.correct, st.attempts); } catch (e) { reportError('onResult callback failed', e); } }
      if (ctx.onResult) ctx.onResult(api, g.correct);
      return g.correct;
    }

    function reset(silent) {
      if (persist) store.remove(KEY_Q + q.id);
      st.attempts = 0; st.wrong = 0; st.correct = false; st.hintsShown = 0; st.restored = false; st.reviewed = null; st.lastWrongKey = null;
      clearMarks();
      setLocked(false);
      choiceEls.forEach(function (c) { c.input.checked = false; });
      fieldEls.forEach(function (fe) { fe.input.value = ''; updateEcho(fe, true); });
      setFeedback('', '');
      hintsBox.innerHTML = '';
      if (solEl) { showSolution(false); }
      refreshButtons();
      if (!silent && ctx.onChange) ctx.onChange(api);
      if (!silent && ctx.onResult) ctx.onResult(api, null);
    }

    /** Quiz review: lock, mark right/wrong, show the correct answer, explanation and solution. */
    function review(g) {
      g = g || grade(q, getResponse());
      st.reviewed = g;
      clearMarks();
      setLocked(true);
      var ok = g.status === 'graded' && g.correct;
      card.classList.add(ok ? 'is-correct' : 'is-incorrect');
      titleStatus.textContent = ok ? '✓ Correct' : (g.status === 'blank' ? '✗ Not answered' : '✗ Incorrect');
      show(titleStatus, true);
      var h = '';
      if (isChoice) {
        var sel = g.selected || [];
        choiceEls.forEach(function (c) {
          var ch = q.choices[c.index], picked = sel.indexOf(c.index) >= 0;
          var tagText = null;
          if (ch.correct) { c.label.classList.add('is-correct'); tagText = picked ? 'Your answer · correct' : 'Correct answer'; }
          else if (picked) { c.label.classList.add('is-incorrect'); tagText = 'Your answer'; }
          if (tagText) {
            c.body.appendChild(el('span', { class: 'q-choice-tag', text: tagText }));
            if (c.aria) c.input.setAttribute('aria-label', c.aria + ' (' + tagText + ')');   // as the visible tag
          }
          if (picked && ch.feedback) {
            var cf = el('span', { class: 'q-choice-feedback', html: ch.feedback });
            c.body.appendChild(cf);
            renderMath(cf);
          }
        });
        h += '<p><strong class="q-verdict">' + (ok ? '✓ Correct.' : g.status === 'blank' ? '✗ Not answered.' : '✗ Incorrect.') + '</strong>' +
          (!ok && q.type === 'multi' && g.status !== 'blank' ? ' The correct options are marked.' : '') + '</p>';
      } else {
        if (g.parts) g.parts.forEach(function (p, i) {
          if (p.ignored || g.status !== 'graded' && g.status !== 'degrees') return;
          fieldEls[i].input.classList.add(p.correct ? 'is-correct' : 'is-incorrect');
        });
        var verdict = ok ? '✓ Correct.' : g.status === 'blank' ? '✗ Not answered.' : '✗ Incorrect.';
        var why = '';
        if (g.status === 'graded' && !ok) why = fieldsSummary(g);
        else if (g.status === 'incomplete') why = 'Some boxes were left empty.';
        else if (g.status === 'unreadable') {
          why = g.parts.filter(function (p) { return !p.ignored && !p.blank && !p.ok; }).map(function (p) {
            return (q.type === 'numeric' ? 'Your answer' : fieldName(p.field, q)) + ' could not be read (' + escapeHtml(p.error) + ').';
          }).join(' ');
        } else if (g.status === 'degrees') {
          var dp = g.degParts[0], dt = escapeHtml(dp.raw.trim());
          why = dt + ' has no unit, so it was read as ' + dt + ' radians. Add ° or deg for degrees.';
        }
        h += '<p><strong class="q-verdict">' + verdict + '</strong>' + (why ? ' ' + why : '') + '</p>';
        var notes = [];
        if (g.parts) g.parts.forEach(function (p) { notes = notes.concat(p.notes || []); });
        if (notes.length) h += '<ul>' + notes.map(function (n) { return '<li>' + n + '</li>'; }).join('') + '</ul>';
        if (!ok) h += '<p class="q-answer">Correct answer: ' + tex(answerTexOf(q)) + '</p>';
        h += anyThetaNote(g);
      }
      if (q.explain) h += wrapBlock(q.explain);
      setFeedback(h, ok ? 'is-correct' : 'is-incorrect');
      if (solEl) showSolution(true);
      refreshButtons();
      return g;
    }

    function restore() {
      if (!persist) return;
      var saved = store.get(KEY_Q + q.id, null);
      if (!saved || !saved.correct) return;
      setResponse(saved.response);
      var g = grade(q, saved.response);
      if (g.status !== 'graded' || !g.correct) { store.remove(KEY_Q + q.id); setResponse(null); fieldEls.forEach(function (fe) { updateEcho(fe, true); }); return; }
      st.correct = true;
      st.restored = true;
      st.attempts = saved.attempts || 1;
      markParts(g);
      card.classList.add('is-correct');
      setLocked(true);
      setFeedback('<p><strong class="q-verdict">✓ Answered.</strong> You got this one right earlier. Press ' +
        (practice ? 'Try again' : 'Reset') + ' to try it again.</p>', 'is-correct');
      refreshButtons();
    }

    // ---------------- events
    fieldEls.forEach(function (fe) {
      fe.input.addEventListener('input', function () {
        updateEcho(fe, false);
        if (fe.input.classList.contains('is-incorrect') || card.classList.contains('is-incorrect')) {
          fe.input.classList.remove('is-incorrect');
          card.classList.remove('is-incorrect');
        }
        if (ctx.onChange) ctx.onChange(api);
      });
      fe.input.addEventListener('blur', function () { if (!fe.input.readOnly) updateEcho(fe, true); });
    });
    choiceEls.forEach(function (c) {
      c.input.addEventListener('change', function () {
        if (!st.reviewed && !st.correct) {
          // the previous check's marks no longer describe the current selection
          card.classList.remove('is-incorrect');
          choiceEls.forEach(function (x) { x.label.classList.remove('is-incorrect', 'is-correct'); });
        }
        if (ctx.onChange) ctx.onChange(api);
      });
    });
    card.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter' || ev.isComposing || ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
      var t = ev.target;
      if (!t || t.tagName !== 'INPUT') return;
      ev.preventDefault();
      if (quiz) {
        if (st.reviewed) return;
        // Students press Enter to move between the boxes of a point question: go to the next empty box of
        // THIS question, and hand Enter to the set (next question) only when the question is complete or the
        // focus is already on its last box.
        var boxes = fieldEls.map(function (fe) { return fe.input; });
        var at = boxes.indexOf(t);
        var target = at >= 0 ? nextEmptyBox(at) : null;
        if (target) { focusQuietly(target); return; }
        if (ctx.onEnter) ctx.onEnter(api);
        return;
      }
      if (!st.correct) check();
    });
    function nextEmptyBox(at) {
      var boxes = fieldEls.map(function (fe) { return fe.input; });
      var empty = function (b) { return b.value.trim() === ''; };
      for (var j = at + 1; j < boxes.length; j++) if (empty(boxes[j])) return boxes[j];
      if (at < boxes.length - 1) for (j = 0; j < at; j++) if (empty(boxes[j])) return boxes[j];
      return null;
    }
    if (checkBtn) checkBtn.addEventListener('click', function () { check(); });
    if (hintBtn) hintBtn.addEventListener('click', function () { showHint(); });
    if (solBtn) solBtn.addEventListener('click', function () { showSolution(!st.solutionShown); });
    if (resetBtn) resetBtn.addEventListener('click', function () {
      reset();
      var first = choiceEls.length ? choiceEls[0].input : fieldEls.length ? fieldEls[0].input : null;
      focusQuietly(first);
    });

    var api = {
      el: card,
      spec: spec,
      id: q.id,
      type: q.type,
      check: check,
      reset: function () { reset(false); },
      isCorrect: function () { return st.reviewed ? !!(st.reviewed.status === 'graded' && st.reviewed.correct) : st.correct; },
      getResponse: getResponse,
      setResponse: function (r) { setResponse(r); if (ctx.onChange) ctx.onChange(api); },
      isAnswered: isAnswered,
      isBlank: isBlank,
      grade: function () { return grade(q, getResponse()); },
      review: review,
      showSolution: showSolution,
      showHint: showHint,
      focus: function () { focusQuietly(titleEl); },
      _q: q,
      _setLabel: function (t) { titleText.textContent = t; },
      _responseHtml: function (g) {
        g = g || grade(q, getResponse());
        if (isChoice) {
          if (!g.selected || !g.selected.length) return '<span class="muted">(not answered)</span>';
          return g.selected.map(function (i) {
            var c = choiceEls.filter(function (x) { return x.index === i; })[0];
            return c ? cleanChoiceHtml(c.body) : '';
          }).join('<br>');
        }
        if (g.status === 'blank') return '<span class="muted">(not answered)</span>';
        return responseHtml(q, g);
      },
      _answerHtml: function () {
        if (isChoice) {
          return choiceEls.filter(function (c) { return q.choices[c.index].correct; }).map(function (c) { return cleanChoiceHtml(c.body); }).join('<br>');
        }
        return tex(answerTexOf(q));
      },
      _promptHtml: function () { return promptEl.innerHTML; }
    };
    Object.defineProperty(api, 'attempts', { enumerable: true, get: function () { return st.attempts; } });
    Object.defineProperty(api, 'restored', { enumerable: true, get: function () { return st.restored; } });

    refreshButtons();
    restore();
    return api;
  }

  function cleanChoiceHtml(body) {
    var c = body.cloneNode(true);
    Array.prototype.forEach.call(c.querySelectorAll('.q-choice-tag, .q-choice-feedback'), function (n) { n.remove(); });
    return c.innerHTML;
  }

  /* ================================================================================================
     Sets: practice and quiz
     ================================================================================================ */
  var printState = { active: null, sheet: null };
  var printHooked = false;
  function hookPrint() {
    if (printHooked || typeof root.addEventListener !== 'function') return;
    printHooked = true;
    root.addEventListener('beforeprint', function () {
      var a = printState.active;
      if (!document.documentElement.classList.contains('cylquiz-printing') && a && a.isSubmitted()) preparePrint(a);
    });
    root.addEventListener('afterprint', cleanupPrint);
  }
  function preparePrint(setApi) {
    cleanupPrint();
    var sheet = setApi._buildSheet();
    document.body.appendChild(sheet);
    printState.sheet = sheet;
    document.documentElement.classList.add('cylquiz-printing');
  }
  function cleanupPrint() {
    if (printState.sheet && printState.sheet.parentNode) printState.sheet.parentNode.removeChild(printState.sheet);
    printState.sheet = null;
    document.documentElement.classList.remove('cylquiz-printing');
  }

  function scoreMessage(pct) {
    if (pct >= 100) return 'Perfect score. You have a solid command of work and energy methods.';
    if (pct >= 80) return 'Great work. Review the questions you missed below.';
    if (pct >= 60) return 'Good effort. Work through the solutions to the questions you missed, then retake the quiz.';
    return 'Keep going. Read the worked solutions below, revisit the lessons they point to, then retake the quiz.';
  }

  function makeSet(container, specs, opts) {
    injectStyle();
    hookPrint();
    opts = opts || {};
    specs = Array.isArray(specs) ? specs : [];
    var mode = opts.mode === 'quiz' ? 'quiz' : 'practice';
    var quiz = mode === 'quiz';
    var layout = opts.layout === 'paged' || opts.layout === 'all' ? opts.layout : (quiz ? 'paged' : 'all');
    var paged = layout === 'paged';
    var n = specs.length;
    var key = opts.storageKey ? KEY_SET + opts.storageKey : null;
    var saved = key ? store.get(key, null) : null;
    if (!saved || saved.v !== 1 || saved.n !== n) saved = null;
    var base = uid();

    var S = {
      seed: saved && saved.seed != null ? saved.seed : (opts.seed != null ? opts.seed : ((Math.random() * 0x7fffffff) | 0)),
      current: saved ? Math.min(Math.max(0, saved.current | 0), Math.max(0, n - 1)) : 0,
      submitted: false,
      startedAt: saved && saved.startedAt || Date.now(),
      submittedAt: saved && saved.submittedAt || null,
      results: null,
      completed: false
    };
    function orderFor(seed) {
      var idx = specs.map(function (_, i) { return i; });
      return opts.shuffle ? rng('set:' + seed).shuffle(idx) : idx;
    }
    var order = orderFor(S.seed);
    function keyOf(i) { return specs[i] && specs[i].id != null ? String(specs[i].id) : '#' + i; }

    // ---------------- DOM skeleton
    var wrap = el('div', { class: 'q-set q-set-' + mode, id: base, 'data-layout': layout });
    var head = el('div', { class: 'q-set-head' });
    if (opts.title) head.appendChild(el('p', { class: 'q-set-title', id: base + '-title', html: opts.title }));
    var introText = opts.intro != null ? opts.intro : quiz
      ? n + ' question' + (n === 1 ? '' : 's') + '. Your answers are checked when you submit, and you can change them until then. ' +
        'You can type expressions such as sqrt(2)/2 or 3pi/4.'
      : 'Check each answer as you go. Hints and worked solutions are available any time.';
    if (introText) head.appendChild(el('p', { class: 'q-set-intro', html: introText }));
    renderMath(head);                                             // title and intro may contain \( \) math
    var bar = el('div', { class: 'q-set-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(n), 'aria-valuenow': '0',
                          'aria-label': quiz ? 'Questions answered' : 'Questions correct' }, [el('span')]);
    var count = el('span', { class: 'q-set-count' });
    var progress = el('div', { class: 'q-set-progress' }, [bar, count]);
    head.appendChild(progress);
    var dots = null, dotEls = [];
    if (paged || quiz) {
      dots = el('div', { class: 'q-set-dots', role: 'group', 'aria-label': 'Questions' });
      for (var d = 0; d < n; d++) {
        (function (pos) {
          var b = el('button', { type: 'button', class: 'q-set-dot', text: String(pos + 1) });
          b.addEventListener('click', function () { dotClick(pos); });
          dots.appendChild(b);
          dotEls.push(b);
        })(d);
      }
      if (!paged) show(dots, false);
      head.appendChild(dots);
    }
    wrap.appendChild(head);

    var results = null, scoreBox = null, scoreRing = null, scoreValue = null, scoreMsg = null, nameInput = null, missedChip = null, resultsTitle = null;
    if (quiz) {
      results = el('section', { class: 'q-set-results', hidden: true, tabindex: '-1', 'aria-labelledby': base + '-rt ' + base + '-rv' });
      scoreRing = el('div', { class: 'q-score-ring', 'aria-hidden': 'true' }, [el('span')]);
      resultsTitle = el('p', { class: 'q-score-label', id: base + '-rt', text: 'Your score' });
      scoreValue = el('p', { class: 'q-score-value', id: base + '-rv' });
      scoreMsg = el('p', { class: 'q-score-msg' });
      scoreBox = el('div', { class: 'q-score' }, [scoreRing, el('div', { class: 'q-score-text' }, [resultsTitle, scoreValue, scoreMsg])]);
      results.appendChild(scoreBox);
      var nid = base + '-name';
      nameInput = el('input', { class: 'q-input', type: 'text', id: nid, autocomplete: 'name', spellcheck: 'false', maxlength: '80' });
      nameInput.value = store.get(KEY_NAME, '') || '';
      nameInput.addEventListener('input', function () { store.set(KEY_NAME, nameInput.value); });
      var printBtn = el('button', { type: 'button', class: 'btn primary', text: 'Print / Save as PDF' });
      printBtn.addEventListener('click', function () { api.print(); });
      var retakeBtn = el('button', { type: 'button', class: 'btn', text: 'Retake quiz' });
      retakeBtn.addEventListener('click', function () { api.retake(); });
      results.appendChild(el('div', { class: 'q-set-namebox' }, [
        el('div', { class: 'field' }, [el('label', { for: nid, text: 'Your name (printed on the results sheet)' }), nameInput]),
        el('div', { class: 'btn-row' }, [printBtn, retakeBtn])
      ]));
      missedChip = el('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', text: 'Show only questions I missed' });
      missedChip.addEventListener('click', function () {
        var on = missedChip.getAttribute('aria-pressed') !== 'true';
        missedChip.setAttribute('aria-pressed', on ? 'true' : 'false');
        applyVisibility();
      });
      results.appendChild(el('div', { class: 'chip-row' }, [missedChip]));
      results.appendChild(el('p', { class: 'q-set-review-note', text: 'Each question below shows your answer, the correct answer and a worked solution.' }));
      wrap.appendChild(results);
    }

    var list = el('div', { class: 'q-set-list' });
    wrap.appendChild(list);

    var nav = el('div', { class: 'q-set-nav btn-row' });
    var prevBtn = el('button', { type: 'button', class: 'btn', text: '← Previous' });
    var nextBtn = el('button', { type: 'button', class: 'btn primary', text: 'Next →' });
    var submitBtn = quiz ? el('button', { type: 'button', class: 'btn', text: 'Submit quiz' }) : null;
    var resetAllBtn = !quiz ? el('button', { type: 'button', class: 'btn small', text: 'Start over' }) : null;
    if (paged) { nav.appendChild(prevBtn); nav.appendChild(nextBtn); }
    nav.appendChild(el('span', { class: 'spacer' }));
    if (submitBtn) nav.appendChild(submitBtn);
    if (resetAllBtn) nav.appendChild(resetAllBtn);
    wrap.appendChild(nav);

    // Pre-submit check ("Question 2 is not fully answered …"). While it is showing it is re-evaluated after every
    // edit, and it hides itself once nothing is left to warn about.
    var confirmBox = null, confirmMsg = null, confirmGo = null, confirmBack = null, confirmFirst = 0;
    if (quiz) {
      confirmBox = el('div', { class: 'q-set-confirm', hidden: true, role: 'alert' });
      confirmMsg = el('p');
      confirmGo = el('button', { type: 'button', class: 'btn primary', text: 'Submit anyway' });
      confirmGo.addEventListener('click', function () { submit(true); });
      confirmBack = el('button', { type: 'button', class: 'btn', text: 'Go to question 1' });
      confirmBack.addEventListener('click', function () {
        show(confirmBox, false);
        if (paged) goTo(confirmFirst, true);
        else { questions[confirmFirst].focus(); scrollIntoViewIfNeeded(questions[confirmFirst].el); }
      });
      confirmBox.appendChild(confirmMsg);
      confirmBox.appendChild(el('div', { class: 'btn-row' }, [confirmGo, confirmBack]));
      wrap.appendChild(confirmBox);
    }
    var doneBox = !quiz ? el('div', { class: 'q-set-done', hidden: true, role: 'status' }) : null;
    if (doneBox) wrap.appendChild(doneBox);

    if (container) container.appendChild(wrap);

    // ---------------- questions
    var saveTimer = null;
    function scheduleSave() {
      if (!key) return;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveNow, 250);
    }
    function saveNow() {
      if (!key) return;
      clearTimeout(saveTimer);
      var responses = {};
      if (quiz) questions.forEach(function (c, pos) { responses[keyOf(order[pos])] = c.getResponse(); });
      store.set(key, { v: 1, n: n, seed: S.seed, current: S.current, submitted: S.submitted, startedAt: S.startedAt,
                       submittedAt: S.submittedAt, responses: responses });
    }

    var questions = [];
    order.forEach(function (si, pos) {
      var sp = specs[si] || {};
      var ctrl = makeQuestion(list, sp, {
        mode: quiz ? 'quiz' : 'practice',
        persist: !quiz && opts.persist !== false,
        label: 'Question ' + (pos + 1) + ' of ' + n,
        onChange: function () { if (quiz) { updateProgress(); scheduleSave(); refreshConfirm(); } },
        onResult: function () { updateProgress(); checkPracticeDone(true); },
        onEnter: function () { onEnter(pos); }
      });
      questions.push(ctrl);
    });

    function onEnter(pos) {
      if (!paged) return;
      if (pos < n - 1) goTo(pos + 1, true);
      else if (submitBtn) focusQuietly(submitBtn);
    }

    // ---------------- progress, visibility, navigation
    function updateProgress() {
      var k, label;
      if (quiz) {
        k = questions.filter(function (c) { return c.isAnswered(); }).length;
        label = k + ' of ' + n + ' answered';
      } else {
        k = questions.filter(function (c) { return c.isCorrect(); }).length;
        label = k + ' of ' + n + ' correct';
      }
      bar.firstChild.style.width = (n ? 100 * k / n : 0) + '%';
      bar.setAttribute('aria-valuenow', String(k));
      count.textContent = label;
      dotEls.forEach(function (b, pos) {
        var c = questions[pos];
        b.classList.remove('is-answered', 'is-correct', 'is-incorrect');
        var status;
        if (S.submitted && S.results) {
          var ok = S.results.results[pos].correct;
          b.classList.add(ok ? 'is-correct' : 'is-incorrect');
          status = ok ? 'correct' : 'incorrect';
        } else if (quiz) {
          if (c.isAnswered()) { b.classList.add('is-answered'); status = 'answered'; } else status = 'not answered';
        } else {
          if (c.isCorrect()) { b.classList.add('is-correct'); status = 'correct'; } else status = 'not done yet';
        }
        b.setAttribute('aria-label', 'Question ' + (pos + 1) + ' (' + status + ')');
        if (paged && !S.submitted && pos === S.current) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
        if (S.submitted && S.results) b.textContent = (pos + 1) + (S.results.results[pos].correct ? ' ✓' : ' ✗');
        else b.textContent = String(pos + 1);
      });
    }
    function applyVisibility() {
      var missedOnly = S.submitted && missedChip && missedChip.getAttribute('aria-pressed') === 'true';
      questions.forEach(function (c, pos) {
        var vis;
        if (S.submitted) vis = !missedOnly || !S.results.results[pos].correct;
        else vis = !paged || pos === S.current;
        show(c.el, vis);
      });
      if (paged && !S.submitted) {
        prevBtn.disabled = S.current === 0;
        show(nextBtn, S.current < n - 1);
        if (submitBtn) submitBtn.className = 'btn' + (S.current === n - 1 ? ' primary' : '');
      } else if (submitBtn) submitBtn.className = 'btn primary';
      show(nav, !S.submitted);
      show(progress, !S.submitted);
      if (dots) show(dots, (paged && !S.submitted) || S.submitted);
    }
    function goTo(pos, focus) {
      if (!n) return;
      pos = Math.max(0, Math.min(n - 1, pos | 0));
      S.current = pos;
      if (confirmBox) show(confirmBox, false);
      applyVisibility();
      updateProgress();
      scheduleSave();
      if (focus) { questions[pos].focus(); scrollIntoViewIfNeeded(questions[pos].el); }
    }
    function dotClick(pos) {
      if (S.submitted) { var c = questions[pos]; show(c.el, true); c.focus(); scrollIntoViewIfNeeded(c.el); return; }
      goTo(pos, true);
    }
    prevBtn.addEventListener('click', function () { goTo(S.current - 1, true); });
    nextBtn.addEventListener('click', function () { goTo(S.current + 1, true); });

    // ---------------- practice completion
    function scoreNow() {
      var res = questions.map(function (c, pos) {
        var g = c.grade();
        var ok = quiz ? (S.results ? S.results.results[pos].correct : (g.status === 'graded' && g.correct)) : c.isCorrect();
        return { id: c.id, index: order[pos], position: pos, correct: !!ok, attempts: c.attempts, response: c.getResponse() };
      });
      var k = res.filter(function (r) { return r.correct; }).length;
      var sc = { mode: mode, correct: k, total: n, percent: n ? Math.round(100 * k / n) : 0, results: res };
      if (!quiz) sc.firstTry = res.filter(function (r) { return r.correct && r.attempts <= 1; }).length;
      if (quiz) sc.name = nameInput ? nameInput.value.trim() : '';
      return sc;
    }
    function checkPracticeDone(fromUser) {
      if (quiz) return;
      var all = n > 0 && questions.every(function (c) { return c.isCorrect(); });
      if (all && !S.completed) {
        S.completed = true;
        var sc = scoreNow();
        doneBox.innerHTML = '';
        doneBox.appendChild(el('p', { html: '<strong>All ' + n + ' correct.</strong> ' +
          (sc.firstTry === n ? 'Every one on the first try.' : sc.firstTry + ' of ' + n + ' on the first try.') }));
        var again = el('button', { type: 'button', class: 'btn small', text: 'Start over' });
        again.addEventListener('click', resetAll);
        doneBox.appendChild(el('div', { class: 'btn-row' }, [again]));
        show(doneBox, true);
        if (fromUser && typeof opts.onComplete === 'function') {
          try { opts.onComplete(sc); } catch (e) { reportError('onComplete callback failed', e); }
        }
      } else if (!all && S.completed) {
        S.completed = false;
        show(doneBox, false);
      }
    }
    function resetAll() {
      questions.forEach(function (c) { c.reset(); });
      S.completed = false;
      if (doneBox) show(doneBox, false);
      goTo(0, false);
      updateProgress();
      if (questions[0]) questions[0].focus();
    }
    if (resetAllBtn) resetAllBtn.addEventListener('click', resetAll);

    // ---------------- quiz submit / results
    // What the pre-submit check warns about: questions not fully answered, entries that cannot be read, and
    // angles typed without a unit that look like degrees (read as radians). The degree check looks only at the
    // typed value (|value| > 2π, no π, no °), never at the answer key, so it reveals nothing about correctness.
    function pendingIssues() {
      var iss = { un: [], bad: [], deg: [] };
      questions.forEach(function (c, pos) {
        if (!c.isAnswered()) { iss.un.push(pos); return; }
        var g = c.grade();
        if (g.status === 'unreadable') iss.bad.push(pos);
        else if (g.parts && g.parts.some(function (p) { return !p.ignored && p.ok && p.read.degSuspect; })) iss.deg.push(pos);
      });
      iss.count = iss.un.length + iss.bad.length + iss.deg.length;
      return iss;
    }
    function listNums(arr) {
      var a = arr.map(function (p) { return String(p + 1); });
      return a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
    }
    function confirmText(iss) {
      var msg = [];
      function qs(a) { return (a.length === 1 ? 'Question ' : 'Questions ') + listNums(a); }
      if (iss.un.length) msg.push(qs(iss.un) + (iss.un.length === 1 ? ' is' : ' are') + ' not fully answered.');
      if (iss.bad.length) msg.push(qs(iss.bad) + (iss.bad.length === 1 ? ' has an entry' : ' have entries') + ' that could not be read.');
      if (iss.un.length || iss.bad.length) msg.push((iss.un.length + iss.bad.length === 1 ? 'It' : 'These') + ' will be marked incorrect.');
      if (iss.deg.length) {
        msg.push(qs(iss.deg) + (iss.deg.length === 1 ? ' has an angle' : ' have angles') + ' with no unit that ' +
          (iss.deg.length === 1 ? 'looks' : 'look') + ' like degrees. A number without ° is read as radians, so add ° (or deg) if you meant degrees.');
      }
      return msg.join(' ');
    }
    function renderConfirm(iss) {
      var t = confirmText(iss);
      if (confirmMsg.textContent !== t) confirmMsg.textContent = t;   // unchanged text: no new alert announcement
      confirmFirst = iss.un.concat(iss.bad, iss.deg).sort(function (a, b) { return a - b; })[0];
      var bt = 'Go to question ' + (confirmFirst + 1);
      if (confirmBack.textContent !== bt) confirmBack.textContent = bt;
    }
    function showConfirm(iss) {
      renderConfirm(iss);
      show(confirmBox, true);
      focusQuietly(confirmGo);
    }
    function refreshConfirm() {
      if (!confirmBox || confirmBox.hasAttribute('hidden') || S.submitted) return;
      var iss = pendingIssues();
      if (!iss.count) show(confirmBox, false); else renderConfirm(iss);
    }
    function renderResults() {
      var sc = S.results;
      var pct = sc.percent;
      scoreRing.style.setProperty('--p', String(pct));
      scoreRing.style.setProperty('--q-ring', pct >= 80 ? 'var(--c-good)' : pct >= 50 ? 'var(--accent)' : 'var(--c-warn)');
      scoreRing.firstChild.textContent = pct + '%';
      scoreValue.textContent = sc.correct + ' / ' + sc.total + ' correct';
      scoreMsg.textContent = scoreMessage(pct);
      if (missedChip) {
        missedChip.setAttribute('aria-pressed', 'false');
        missedChip.disabled = sc.correct === sc.total;
      }
    }
    function submit(force) {
      if (!quiz || S.submitted) return false;
      if (!force) {
        var iss = pendingIssues();
        if (iss.count) { showConfirm(iss); return false; }
      }
      if (confirmBox) show(confirmBox, false);
      finishSubmit(true);
      return true;
    }
    function finishSubmit(fromUser) {
      var gs = questions.map(function (c) { return c.grade(); });
      S.submitted = true;
      if (fromUser || !S.submittedAt) S.submittedAt = Date.now();
      S.results = { results: gs.map(function (g) { return { correct: g.status === 'graded' && g.correct }; }) };
      var sc = scoreNow();
      S.results = sc;
      questions.forEach(function (c, pos) { c.review(gs[pos]); });
      if (dots) results.insertBefore(dots, scoreBox.nextSibling);   // per-question ✓/✗ summary under the score
      renderResults();
      show(results, true);
      applyVisibility();
      updateProgress();
      printState.active = api;
      saveNow();
      if (fromUser) {
        try { results.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' }); } catch (e) { /* ignore */ }
        focusQuietly(results);
        if (typeof opts.onComplete === 'function') {
          try { opts.onComplete(sc); } catch (e) { reportError('onComplete callback failed', e); }
        }
      }
    }
    if (submitBtn) submitBtn.addEventListener('click', function () { submit(false); });

    function retake() {
      if (!quiz) { resetAll(); return; }
      S.submitted = false;
      S.results = null;
      S.submittedAt = null;
      S.startedAt = Date.now();
      if (opts.shuffle && opts.seed == null) {
        S.seed = (Math.random() * 0x7fffffff) | 0;
        var newOrder = orderFor(S.seed);
        var byIndex = {};
        questions.forEach(function (c, pos) { byIndex[order[pos]] = c; });
        order = newOrder;
        questions = order.map(function (si) { return byIndex[si]; });
        questions.forEach(function (c, pos) { list.appendChild(c.el); c._setLabel('Question ' + (pos + 1) + ' of ' + n); });
      }
      questions.forEach(function (c) { c.reset(); });
      if (printState.active === api) printState.active = null;
      if (dots) head.appendChild(dots);
      show(results, false);
      S.current = 0;
      applyVisibility();
      updateProgress();
      saveNow();
      try { wrap.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' }); } catch (e) { /* ignore */ }
      if (questions[0]) questions[0].focus();
    }

    function fmtDate(t) {
      try { return new Date(t).toLocaleString(undefined, { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
      catch (e) { return new Date(t).toString(); }
    }
    function buildSheet() {
      var sc = S.results || scoreNow();
      var name = nameInput ? nameInput.value.trim() : '';
      var sheet = el('div', { class: 'cylquiz-print-sheet' });
      sheet.appendChild(el('p', { class: 'cqp-eyebrow', text: 'Work and Energy · Quiz results' }));
      var h1 = opts.title ? el('h1', { html: opts.title }) : el('h1', { text: (document.title || 'Quiz').split('·')[0].trim() });
      sheet.appendChild(h1);
      if (opts.title) renderMath(h1);
      var meta = el('table', { class: 'cqp-meta' });
      function row(k, vNode) { meta.appendChild(el('tr', null, [el('th', { text: k }), el('td', null, [vNode])])); }
      row('Name', name ? el('span', { text: name }) : el('span', { class: 'cqp-blank', html: '&nbsp;' }));
      row('Date', el('span', { text: fmtDate(S.submittedAt || Date.now()) }));
      row('Score', el('strong', { text: sc.correct + ' / ' + sc.total + ' (' + sc.percent + '%)' }));
      sheet.appendChild(meta);
      var tbl = el('table', { class: 'data cqp-table' });
      tbl.appendChild(el('thead', null, [el('tr', null, ['#', 'Question', 'Your answer', 'Correct answer', 'Result'].map(function (h) { return el('th', { text: h }); }))]));
      var tb = el('tbody');
      questions.forEach(function (c, pos) {
        var g = c.grade();
        var ok = sc.results[pos].correct;
        // spec.short (a one-line title) keeps the sheet short; without it the full prompt is printed.
        var short = (c.spec && c.spec.short) || (c._q && c._q.short) || '';
        var qCell = short ? el('td', { class: 'cqp-q', html: String(short) }) : el('td', { html: c._promptHtml() });
        if (short) renderMath(qCell);
        tb.appendChild(el('tr', null, [
          el('td', { text: String(pos + 1) }),
          qCell,
          el('td', { html: c._responseHtml(g) }),
          el('td', { html: c._answerHtml() }),
          el('td', { html: ok ? '<span class="cqp-ok">✓ Correct</span>' : (g.status === 'blank' ? '<span class="cqp-bad">✗ Not answered</span>' : '<span class="cqp-bad">✗ Incorrect</span>') })
        ]));
      });
      tbl.appendChild(tb);
      sheet.appendChild(tbl);
      sheet.appendChild(el('p', { class: 'cqp-foot', text: 'Self-checked in the browser with the Work and Energy module. ' +
        'Worked solutions for every question are shown on screen after submitting.' }));
      // strip ids copied from the page so the sheet never duplicates them
      Array.prototype.forEach.call(sheet.querySelectorAll('[id]'), function (x) { x.removeAttribute('id'); });
      return sheet;
    }

    var api = {
      el: wrap,
      get questions() { return questions.slice(); },
      mode: mode,
      layout: layout,
      submit: function (force) { return submit(!!force); },
      retake: retake,
      reset: function () { if (quiz) retake(); else resetAll(); },
      goTo: function (i) { goTo(i, true); },
      score: scoreNow,
      isSubmitted: function () { return S.submitted; },
      print: function () {
        if (!quiz || !S.submitted) return false;
        printState.active = api;
        preparePrint(api);
        // afterprint (all current browsers) removes the sheet again; the print-only class has no effect on screen.
        try { if (typeof root.print === 'function') root.print(); } catch (e) { /* ignore */ }
        return true;
      },
      _buildSheet: buildSheet
    };

    // ---------------- restore / initial render
    if (saved && quiz && saved.responses) {
      questions.forEach(function (c, pos) {
        var r = saved.responses[keyOf(order[pos])];
        if (r != null) c.setResponse(r);
      });
    }
    applyVisibility();
    updateProgress();
    if (saved && quiz && saved.submitted) finishSubmit(false);
    if (!quiz) checkPracticeDone(false);
    return api;
  }

  /* ================================================================================================
     Export
     ================================================================================================ */
  function publicQuestion(container, spec) {
    if (typeof container === 'string') container = document.querySelector(container);
    try {
      return makeQuestion(container, spec || {}, null);
    } catch (e) {
      reportError('could not build question ' + (spec && spec.id ? '"' + spec.id + '"' : ''), e);
      throw e;
    }
  }
  function publicSet(container, specs, opts) {
    if (typeof container === 'string') container = document.querySelector(container);
    try {
      return makeSet(container, specs, opts);
    } catch (e) {
      reportError('could not build question set', e);
      throw e;
    }
  }

  root.CYLQuiz = {
    version: VERSION,
    defaults: DEFAULTS,
    question: publicQuestion,
    set: publicSet,
    rng: rng,
    grade: grade,
    readNumber: readNumber,
    matches: function (value, answer, opts) {
      opts = opts || {};
      return matchesField(+value, { answer: answer, tol: opts.tol, angle: !!opts.angle });
    },
    answerTex: answerTexOf
  };
})(typeof window !== 'undefined' ? window : this);
