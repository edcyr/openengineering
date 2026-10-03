/*
 * cyl-expr.js - CYLExpr: a small, SAFE math-expression parser for the Mass Moments of Inertia module.
 * No eval, no Function constructor, no dependencies. Classic script (IIFE); attaches ONE global: CYLExpr.
 *
 * API
 *   CYLExpr.parse(str, {vars, angle})         -> AST            (throws CYLExpr.SyntaxError)
 *        vars defaults to CYLExpr.DEFAULT_VARS (r, theta, z, x, y, t, u, v); an array may be passed instead of opts.
 *   CYLExpr.compile(str, varNames=[], {angle}) -> f(...values) -> number   (throws CYLExpr.SyntaxError)
 *        e.g. const f = CYLExpr.compile('r^2 cos(2theta)', ['r', 'theta']); f(2, 0) === 4
 *        f.ast and f.varNames are attached. str may also be an AST from parse().
 *   CYLExpr.evaluate(str, scope={}, {angle})   -> number (NaN / Infinity possible)   (throws CYLExpr.SyntaxError)
 *        e.g. CYLExpr.evaluate('2 r^2', {r: 3}) === 18. Compiled expressions are cached.
 *   CYLExpr.parseNumber(str, {angle:false})    -> finite number | NaN   (never throws; no variables allowed)
 *   CYLExpr.tryParseNumber(str, {angle})       -> {ok, value, error, pos, end, tex}   (never throws)
 *        Same as parseNumber but also returns the friendly error message (and where it is) and a TeX echo.
 *   CYLExpr.toTex(strOrAst, {vars, angle})     -> TeX string | null   (never throws)
 *        '3pi/4' -> '\frac{3\pi}{4}',  'sqrt(2)*r^2' -> '\sqrt{2}\,r^{2}',  '135 deg' ({angle:true}) -> '135^{\circ}'
 *   CYLExpr.SyntaxError   Error subclass. .message is student-friendly ("Missing closing parenthesis ')'",
 *                         "Unknown name 'thetaa' - did you mean 'theta'?"); .pos / .end = 0-based character range
 *                         in the input that the message refers to; .input = the input string.
 *   CYLExpr.DEFAULT_VARS, CYLExpr.FUNCTIONS, CYLExpr.version
 *
 * AST nodes (all have pos/end = source range):
 *   {type:'number', value, raw}  {type:'constant', name:'pi'|'e', value}  {type:'variable', name}
 *   {type:'unary', op:'-', arg}  {type:'binary', op:'+'|'-'|'*'|'/'|'^', left, right, implicit?:true}
 *   {type:'call', name, args:[...]}  {type:'unit', unit:'deg'|'rad', arg}
 *
 * Syntax (and the decisions made for ambiguous input):
 *  - Numbers: 12, 0.5, .5, 5., 1e-3, 2.5E4. A lone "e" is Euler's number: 2e = 2*e, 2e-x = 2e - x.
 *  - Operators: + - * / ^ (also ** for ^). Unicode: minus/dashes (−, –), ×, ·, ⋅, ÷ are accepted.
 *    Superscript digits work as powers: r² = r^2, x⁻¹ = x^(-1).
 *  - Precedence: ^ is right-associative and binds tighter than unary minus: 2^3^2 = 512, -2^2 = -4, 2^-1 = 0.5.
 *  - Implicit multiplication has the SAME precedence as * and /, evaluated left to right (like most calculators
 *    and WolframAlpha): 3pi/4 = (3pi)/4, 1/2pi = (1/2)*pi, 2 r^2 = 2*(r^2), 2(1+x), (1+x)(2), pi r, 3sqrt(2).
 *  - A number cannot follow another factor without an operator ("2 3", "pi 2", "r² 3" are errors), except
 *    right after a closing parenthesis: (1+x)2 = 2(1+x).
 *  - Brackets ( ), [ ], { } all group; they must match.
 *  - Constants pi, π, e. Functions: sqrt abs sin cos tan asin acos atan atan2(y,x) exp ln log (base 10) log2
 *    sec csc cot min max; aliases arcsin arccos arctan log10. Function and constant names are case-insensitive
 *    (SIN, Pi). Single-letter variable names are case-sensitive (R is not r); longer names are not (Theta = theta).
 *    Greek symbols and names are interchangeable for variables (θ = theta, φ = phi, ...).
 *  - Runs of letters are split into known names when they are not a name themselves: 2pir = 2*pi*r,
 *    rcos(theta) = r*cos(theta), costheta = cos(theta), xy = x*y. Digits may directly follow a FUNCTION name in
 *    a run (sqrt2 = sqrt(2), cos2theta = cos(2 theta)); "r2" or "pi2" are errors with a hint (write r^2 or 2r).
 *  - √ and sqrt WITHOUT parentheses apply to one factor (with its power): √2 r = √2·r, √3/2 = (√3)/2, 2√3,
 *    sqrt2 = √2, √(3) = √3.
 *  - Other one-input functions WITHOUT parentheses take the implicit product that follows, stopping at the next
 *    function name or any explicit operator: sin 2x = sin(2x), sin x cos x = sin(x)cos(x), sin x/2 = sin(x)/2,
 *    cos 30° = cos(30°). A bare argument may not start with a sign ("sin -x", "sin + 1" are errors: use
 *    parentheses). Multi-input functions (atan2, min, max) always need parentheses.
 *  - f^n(x) and f²(x) mean (f(x))^n: sin^2(x) + cos^2(x). sin^-1(x), sin⁻¹(x) mean asin(x) (also cos, tan).
 *  - Angles: "°" (also º, ˚) always means degrees (x π/180), so sin(30°) works everywhere. The words
 *    deg / degree(s) / rad / radian(s) are accepted only with {angle:true}. A unit applies to the product or
 *    quotient before it: 135° , 135 deg, -45deg = -π/4, 180/4° = 45°, 3pi/4 rad = 3π/4, 90° + 45° = 3π/4.
 *    parseNumber without {angle:true} rejects "°" (NaN) because it only makes sense for angles.
 *  - Not supported (friendly error instead): "=", |x| bars (use abs), factorial "!", decimal commas "2,5".
 */
(function (root) {
  'use strict';

  var VERSION = '1.0.0';
  var DEG = Math.PI / 180;
  var MAX_LEN = 1000;
  var MAX_DEPTH = 60;
  var has = Object.prototype.hasOwnProperty;
  function own(o, k) { return has.call(o, k); }

  // ---------------------------------------------------------------- error type
  class ExprSyntaxError extends Error {
    constructor(message, pos, end, input) {
      super(message);
      this.name = 'CYLExpr.SyntaxError';
      this.pos = typeof pos === 'number' ? pos : 0;
      this.end = typeof end === 'number' ? Math.max(end, this.pos) : this.pos + 1;
      this.input = input == null ? '' : String(input);
    }
  }

  // ---------------------------------------------------------------- tables
  function sec(x) { return 1 / Math.cos(x); }
  function csc(x) { return 1 / Math.sin(x); }
  function cot(x) { return Math.cos(x) / Math.sin(x); }

  // min/max: number of inputs; eg: example shown in messages; tex: operator name; inv: meaning of f^-1
  var FUNCS = {
    sqrt:  { f: Math.sqrt,  min: 1, max: 1, eg: 'sqrt(2)' },
    abs:   { f: Math.abs,   min: 1, max: 1, eg: 'abs(-3)' },
    sin:   { f: Math.sin,   min: 1, max: 1, eg: 'sin(pi/6)', tex: '\\sin', inv: 'asin' },
    cos:   { f: Math.cos,   min: 1, max: 1, eg: 'cos(pi/3)', tex: '\\cos', inv: 'acos' },
    tan:   { f: Math.tan,   min: 1, max: 1, eg: 'tan(pi/4)', tex: '\\tan', inv: 'atan' },
    asin:  { f: Math.asin,  min: 1, max: 1, eg: 'asin(0.5)', tex: '\\arcsin' },
    acos:  { f: Math.acos,  min: 1, max: 1, eg: 'acos(0.5)', tex: '\\arccos' },
    atan:  { f: Math.atan,  min: 1, max: 1, eg: 'atan(1)',   tex: '\\arctan' },
    atan2: { f: Math.atan2, min: 2, max: 2, eg: 'atan2(y, x)', tex: '\\operatorname{atan2}' },
    exp:   { f: Math.exp,   min: 1, max: 1, eg: 'exp(1)',    tex: '\\exp' },
    ln:    { f: Math.log,   min: 1, max: 1, eg: 'ln(2)',     tex: '\\ln' },
    log:   { f: Math.log10, min: 1, max: 1, eg: 'log(100)',  tex: '\\log_{10}' },
    log2:  { f: Math.log2,  min: 1, max: 1, eg: 'log2(8)',   tex: '\\log_{2}' },
    sec:   { f: sec,        min: 1, max: 1, eg: 'sec(pi/3)', tex: '\\sec' },
    csc:   { f: csc,        min: 1, max: 1, eg: 'csc(pi/6)', tex: '\\csc' },
    cot:   { f: cot,        min: 1, max: 1, eg: 'cot(pi/4)', tex: '\\cot' },
    min:   { f: Math.min,   min: 1, max: Infinity, eg: 'min(a, b)', tex: '\\min' },
    max:   { f: Math.max,   min: 1, max: Infinity, eg: 'max(a, b)', tex: '\\max' }
  };
  var FUNC_ALIAS = { arcsin: 'asin', arccos: 'acos', arctan: 'atan', log10: 'log' };
  var CONSTS = { pi: Math.PI, e: Math.E };
  var UNIT_WORDS = { deg: 'deg', degs: 'deg', degree: 'deg', degrees: 'deg',
                     rad: 'rad', rads: 'rad', radian: 'rad', radians: 'rad' };
  var DEFAULT_VARS = ['r', 'theta', 'z', 'x', 'y', 't', 'u', 'v'];

  var GREEK = { alpha: '\u03B1', beta: '\u03B2', gamma: '\u03B3', delta: '\u03B4', epsilon: '\u03B5',
    zeta: '\u03B6', eta: '\u03B7', theta: '\u03B8', iota: '\u03B9', kappa: '\u03BA', lambda: '\u03BB',
    mu: '\u03BC', nu: '\u03BD', xi: '\u03BE', rho: '\u03C1', sigma: '\u03C3', tau: '\u03C4',
    upsilon: '\u03C5', phi: '\u03C6', chi: '\u03C7', psi: '\u03C8', omega: '\u03C9' };
  var GREEK_SYM = {};                                   // symbol -> name
  Object.keys(GREEK).forEach(function (k) { GREEK_SYM[GREEK[k]] = k; });
  var VARIANT = { '\u03D1': '\u03B8', '\u03D5': '\u03C6', '\u03F5': '\u03B5' };   // ϑ ϕ ϵ -> θ φ ε
  var PI_SYM = '\u03C0';

  // characters
  var MINUS = '-\u2212\u2010\u2011\u2012\u2013\u2014\uFE63\uFF0D';
  var PLUS = '+\uFF0B';
  var TIMES = '*\u00D7\u00B7\u22C5\u2219\u2022\u2217\u2715';
  var DIVIDE = '/\u00F7\u2215\u2044';
  var DEGREE = '\u00B0\u00BA\u02DA';
  var SQRT_SYM = '\u221A';
  var OPEN = { '(': ')', '[': ']', '{': '}' };
  var CLOSE = { ')': 1, ']': 1, '}': 1 };
  var BRACKET_WORD = { '(': 'parenthesis', '[': 'bracket', '{': 'brace', ')': 'parenthesis', ']': 'bracket', '}': 'brace' };
  var SUP = { '\u2070': '0', '\u00B9': '1', '\u00B2': '2', '\u00B3': '3', '\u2074': '4', '\u2075': '5',
              '\u2076': '6', '\u2077': '7', '\u2078': '8', '\u2079': '9' };
  var SUP_MINUS = '\u207B', SUP_PLUS = '\u207A';
  var DASH = ' \u2014 ';

  function isDigit(c) { return c >= '0' && c <= '9'; }
  function isLetter(c) {
    if (!c) return false;
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_') return true;
    var k = c.charCodeAt(0);
    return k >= 0x0370 && k <= 0x03FF;            // Greek and Coptic block (θ, π, φ, ...)
  }
  function isSpace(c) { return /\s/.test(c) || c === '\u200B'; }

  function normVars(v) {
    if (v == null) return [];
    if (typeof v === 'string') v = v.split(/[\s,]+/);
    if (!Array.isArray(v)) return [];
    return v.map(String).filter(function (s) { return s.length > 0; });
  }
  function isAst(x) { return !!x && typeof x === 'object' && typeof x.type === 'string'; }

  // Optimal string alignment distance (Levenshtein + adjacent transposition), for "did you mean".
  function editDistance(a, b) {
    var m = a.length, n = b.length, d = [], i, j;
    for (i = 0; i <= m; i++) { d.push(new Array(n + 1)); d[i][0] = i; }
    for (j = 0; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) {
      for (j = 1; j <= n; j++) {
        var cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
    return d[m][n];
  }

  // ---------------------------------------------------------------- name resolution context
  function makeContext(vars, angle) {
    var exact = Object.create(null), ci = Object.create(null);
    vars.forEach(function (v) {
      if (!(v in exact)) exact[v] = v;
      var lc = v.toLowerCase();
      if (own(GREEK, lc) && !(GREEK[lc] in exact)) exact[GREEK[lc]] = v;          // theta -> also θ
      if (own(GREEK_SYM, v)) {                                                     // θ -> also theta
        var nm = GREEK_SYM[v];
        if (!(nm in exact)) exact[nm] = v;
        if (!(nm in ci)) ci[nm] = v;
      }
      if (v.length > 1 && !(lc in ci)) ci[lc] = v;
    });

    function resolve(word) {
      if (word in exact) return { kind: 'var', name: exact[word] };
      var lc = word.toLowerCase();
      if (own(FUNCS, lc)) return { kind: 'func', name: lc };
      if (own(FUNC_ALIAS, lc)) return { kind: 'func', name: FUNC_ALIAS[lc] };
      if (lc === PI_SYM) return { kind: 'const', name: 'pi' };
      if (own(CONSTS, lc)) return { kind: 'const', name: lc };
      if (angle && own(UNIT_WORDS, lc)) return { kind: 'unit', name: UNIT_WORDS[lc] };
      if (word.length > 1 && lc in ci) return { kind: 'var', name: ci[lc] };
      return null;
    }

    // Split a letter run like "2pir"'s "pir" into known names. Longest match first, with backtracking.
    // Digits may only directly follow a function name (sqrt2, cos2theta).
    function split(run) {
      if (run.length > 40) return null;
      function go(i, prevFunc) {
        if (i === run.length) return [];
        if (isDigit(run[i])) {
          if (!prevFunc) return null;
          var j = i;
          while (j < run.length && isDigit(run[j])) j++;
          var rest0 = go(j, false);
          return rest0 ? [{ digits: run.slice(i, j), off: i }].concat(rest0) : null;
        }
        for (var len = run.length - i; len >= 1; len--) {
          var s = run.slice(i, i + len);
          if (/\d/.test(s) && isDigit(run[i + len] || '')) continue;      // log100 -> log 100, not log10 0
          var r = resolve(s);
          if (!r) continue;
          var rest = go(i + len, r.kind === 'func');
          if (rest) return [{ res: r, text: s, off: i }].concat(rest);
        }
        return null;
      }
      return go(0, false);
    }

    function suggest(word) {
      var lc = word.toLowerCase();
      if (lc === 'in') return 'ln';
      if (lc.length < 3) return null;
      var limit = lc.length >= 6 ? 2 : 1;
      var cands = vars.concat(Object.keys(FUNCS), Object.keys(FUNC_ALIAS), ['pi'], angle ? ['deg', 'rad', 'degrees', 'radians'] : []);
      var best = null, bestD = Infinity;
      cands.forEach(function (c) {
        var d = editDistance(lc, c.toLowerCase());
        if (d < bestD && d <= limit) { best = c; bestD = d; }
      });
      return best;
    }

    return { resolve: resolve, split: split, suggest: suggest, vars: vars, angle: angle };
  }

  // ---------------------------------------------------------------- tokenizer
  function tokenize(src, ctx, fail) {
    var toks = [], i = 0, n = src.length;

    function pushName(res, text, pos) {
      if (res.kind === 'unit') toks.push({ t: 'unit', name: res.name, text: text, pos: pos, end: pos + text.length });
      else toks.push({ t: 'name', kind: res.kind, name: res.name, text: text, pos: pos, end: pos + text.length });
    }
    function nextNonSpace(j) { while (j < n && isSpace(src[j])) j++; return src[j]; }

    function unknownMessage(run, s) {
      var e = s + run.length;
      var m = /^(.*?\D)(\d+)$/.exec(run);
      if (m) {
        var base = ctx.resolve(m[1]);
        if (base && (base.kind === 'var' || base.kind === 'const')) {
          return "Unknown name '" + run + "'" + DASH + 'for a power write ' + m[1] + '^' + m[2] +
                 ', for a product write ' + m[2] + m[1];
        }
      }
      var last = toks[toks.length - 1];
      if (/^x\d/.test(run) && last && last.t === 'num' && last.end === s && !ctx.resolve('x')) {
        return 'Use * or \u00D7 for multiplication (not the letter x)';
      }
      var isFn = nextNonSpace(e) === '(';
      var msg = 'Unknown ' + (isFn ? 'function' : 'name') + " '" + run + "'";
      var sug = ctx.suggest(run);
      if (sug) msg += DASH + "did you mean '" + sug + "'?";
      else if (!ctx.vars.length && !isFn) msg += DASH + 'this answer should be a number (you can use pi, sqrt( ), ...)';
      return msg;
    }

    function nameRun(run, s) {
      var res = ctx.resolve(run);
      if (res) { pushName(res, run, s); return; }
      var lc = run.toLowerCase();
      if (own(UNIT_WORDS, lc) && !ctx.angle) fail("'" + run + "' can only be used where an angle is expected", s, s + run.length);
      var parts = ctx.split(run);
      if (parts) {
        parts.forEach(function (part) {
          var p0 = s + part.off;
          if (part.digits) toks.push({ t: 'num', value: parseFloat(part.digits), raw: part.digits, text: part.digits, pos: p0, end: p0 + part.digits.length });
          else pushName(part.res, part.text, p0);
        });
        return;
      }
      fail(unknownMessage(run, s), s, s + run.length);
    }

    function op(v, len) {
      toks.push({ t: 'op', v: v, text: src.slice(i, i + len), pos: i, end: i + len });
      i += len;
    }

    while (i < n) {
      var c = src[i], s = i;
      if (isSpace(c)) { i++; continue; }

      // numbers: 12  0.5  .5  5.  1e-3  2.5E4
      if (isDigit(c) || (c === '.' && isDigit(src[i + 1]))) {
        while (i < n && isDigit(src[i])) i++;
        if (src[i] === '.') { i++; while (i < n && isDigit(src[i])) i++; }
        if (src[i] === 'e' || src[i] === 'E') {
          var j = i + 1;
          if (src[j] === '+' || src[j] === '-' || src[j] === '\u2212') j++;
          if (isDigit(src[j])) { i = j; while (i < n && isDigit(src[i])) i++; }
        }
        if (src[i] === '.') {
          var k = i;
          while (k < n && (isDigit(src[k]) || src[k] === '.')) k++;
          fail("Malformed number '" + src.slice(s, k) + "'", s, k);
        }
        var raw = src.slice(s, i).replace('\u2212', '-');
        toks.push({ t: 'num', value: parseFloat(raw), raw: raw, text: src.slice(s, i), pos: s, end: i });
        continue;
      }
      if (c === '.') fail('A decimal point needs digits next to it, e.g. 0.5', i, i + 1);

      // names: letters (Latin, Greek, _) followed by letters/digits
      if (isLetter(c)) {
        i++;
        while (i < n && (isLetter(src[i]) || isDigit(src[i]))) i++;
        var run = src.slice(s, i).replace(/[\u03D1\u03D5\u03F5]/g, function (m) { return VARIANT[m]; });
        nameRun(run, s);
        continue;
      }

      // superscript powers: ² ³ ⁻¹ ...
      if (own(SUP, c) || c === SUP_MINUS || c === SUP_PLUS) {
        var sign = '';
        if (c === SUP_MINUS || c === SUP_PLUS) { sign = c === SUP_MINUS ? '-' : ''; i++; }
        var ds = '';
        while (i < n && own(SUP, src[i])) { ds += SUP[src[i]]; i++; }
        if (!ds) fail("Unexpected character '" + c + "'", s, s + 1);
        toks.push({ t: 'sup', value: parseFloat(sign + ds), text: src.slice(s, i), pos: s, end: i });
        continue;
      }

      if (PLUS.indexOf(c) >= 0) { op('+', 1); continue; }
      if (MINUS.indexOf(c) >= 0) { op('-', 1); continue; }
      if (TIMES.indexOf(c) >= 0) { if (c === '*' && src[i + 1] === '*') op('^', 2); else op('*', 1); continue; }
      if (DIVIDE.indexOf(c) >= 0) { op('/', 1); continue; }
      if (c === '^') { op('^', 1); continue; }
      if (own(OPEN, c)) { toks.push({ t: 'open', v: c, close: OPEN[c], text: c, pos: i, end: i + 1 }); i++; continue; }
      if (own(CLOSE, c)) { toks.push({ t: 'close', v: c, text: c, pos: i, end: i + 1 }); i++; continue; }
      if (c === ',') { toks.push({ t: ',', text: ',', pos: i, end: i + 1 }); i++; continue; }
      if (c === SQRT_SYM) { toks.push({ t: 'sqrt', text: c, pos: i, end: i + 1 }); i++; continue; }
      if (DEGREE.indexOf(c) >= 0) { toks.push({ t: 'unit', name: 'deg', text: c, pos: i, end: i + 1 }); i++; continue; }
      if (c === '=') fail("Just type the value or expression" + DASH + "no '=' needed", i, i + 1);
      if (c === '|') fail('Use abs( ) for absolute value, e.g. abs(-3)', i, i + 1);
      if (c === '!') fail("Factorials (!) aren't supported", i, i + 1);
      var cp = src.codePointAt(i), ch = String.fromCodePoint(cp);
      fail("Unexpected character '" + ch + "'", i, i + ch.length);
    }
    toks.push({ t: 'eof', text: '', pos: n, end: n });
    return toks;
  }

  // ---------------------------------------------------------------- parser
  function parseInternal(src, opts) {
    if (Array.isArray(opts) || typeof opts === 'string') opts = { vars: opts };
    opts = opts || {};
    src = src == null ? '' : String(src);
    var vars = normVars(opts.vars === undefined ? DEFAULT_VARS : opts.vars);
    var ctx = makeContext(vars, !!opts.angle);
    function fail(msg, pos, end) { throw new ExprSyntaxError(msg, pos, end, src); }
    if (src.length > MAX_LEN) fail('That expression is too long', 0, src.length);

    var toks = tokenize(src, ctx, fail);
    var p = 0, depth = 0;

    function peek() { return toks[p]; }
    function prev() { return p > 0 ? toks[p - 1] : null; }
    function isOp(tok, v) { return tok.t === 'op' && (v === undefined || tok.v === v); }
    function q(tok) { return "'" + tok.text + "'"; }
    function bin(op, l, r, implicit) {
      var nd = { type: 'binary', op: op, left: l, right: r, pos: Math.min(l.pos, r.pos), end: Math.max(l.end, r.end) };
      if (implicit) nd.implicit = true;
      return nd;
    }
    function startsFactor(tok) { return tok.t === 'num' || tok.t === 'name' || tok.t === 'open' || tok.t === 'sqrt'; }
    function startsOperand(tok) { return startsFactor(tok) || isOp(tok, '-') || isOp(tok, '+'); }

    function commaError(tok) {
      var k = toks.indexOf(tok), a = toks[k - 1], b = toks[k + 1];
      if (a && b && a.t === 'num' && b.t === 'num' && a.end === tok.pos && b.pos === tok.end) {
        fail('Use a period for decimals (e.g. 2.5)' + DASH + 'commas only separate the inputs of a function like atan2(y, x)', a.pos, b.end);
      }
      fail('Commas can only separate the inputs of a function, like atan2(y, x)', tok.pos, tok.end);
    }

    function operandError(tok) {
      var pv = prev();
      if (tok.t === 'eof') {
        if (!pv) fail('Enter a number or expression', 0, src.length);
        fail('Missing a number or expression after ' + q(pv), pv.pos, pv.end);
      }
      if (tok.t === 'close') {
        if (pv && (pv.t === 'op' || pv.t === 'sqrt')) fail('Missing a number or expression after ' + q(pv), pv.pos, pv.end);
        if (pv && pv.t === ',') fail("Missing an input after ','", pv.pos, pv.end);
        fail('Unmatched closing ' + BRACKET_WORD[tok.v] + ' ' + q(tok), tok.pos, tok.end);
      }
      if (tok.t === ',') {
        if (pv && pv.t === 'open') fail("Missing an input before ','", tok.pos, tok.end);
        if (pv && pv.t === 'op') fail('Missing a number or expression after ' + q(pv), pv.pos, pv.end);
        commaError(tok);
      }
      if (tok.t === 'op') {
        if (!pv) fail("An expression can't start with " + q(tok), tok.pos, tok.end);
        if (pv.t === 'op') fail('Missing a number or expression between ' + q(pv) + ' and ' + q(tok), pv.pos, tok.end);
        fail('Missing a number or expression before ' + q(tok), tok.pos, tok.end);
      }
      if (tok.t === 'unit') fail(q(tok) + ' must come right after a number, e.g. 45' + (tok.text.length === 1 ? tok.text : ' ' + tok.text), tok.pos, tok.end);
      if (tok.t === 'sup') fail('A power like ' + q(tok) + ' must come right after a number or name, e.g. r\u00B2', tok.pos, tok.end);
      fail('Unexpected ' + q(tok), tok.pos, tok.end);
    }

    function checkImplicitNumber(tok) {
      var pv = prev();
      if (tok.t === 'num' && pv && pv.t !== 'close') {
        fail('Missing an operator between ' + q(pv) + ' and ' + q(tok), pv.pos, tok.end);
      }
    }

    function expectClose(open) {
      var tok = peek();
      if (tok.t === 'close') {
        if (tok.v !== open.close) fail("Mismatched brackets: '" + open.text + "' is closed by '" + tok.text + "'", open.pos, tok.end);
        p++;
        return tok;
      }
      if (tok.t === 'eof') fail('Missing closing ' + BRACKET_WORD[open.v] + " '" + open.close + "'", open.pos, open.end);
      if (tok.t === ',') commaError(tok);
      fail('Unexpected ' + q(tok), tok.pos, tok.end);
    }

    function unitNode(arg, tok) {
      return { type: 'unit', unit: tok.name, arg: arg, pos: arg.pos, end: tok.end, symPos: tok.pos, symEnd: tok.end };
    }

    // expr := term (('+'|'-') term)*
    function parseExpr() {
      if (++depth > MAX_DEPTH) fail('Too many nested parentheses', peek().pos, peek().end);
      var left = parseTerm();
      while (isOp(peek(), '+') || isOp(peek(), '-')) {
        p++;
        left = bin(toks[p - 1].v, left, parseTerm());
      }
      depth--;
      return left;
    }

    // term := unary (('*'|'/') unary | implicit power | unit)*
    function parseTerm() {
      var left = parseUnary();
      for (;;) {
        var tok = peek();
        if (isOp(tok, '*') || isOp(tok, '/')) {
          p++;
          left = bin(tok.v, left, parseUnary());
        } else if (tok.t === 'unit') {
          if (prev().t === 'unit') fail('Unexpected ' + q(tok), tok.pos, tok.end);
          p++;
          left = unitNode(left, tok);
        } else if (startsFactor(tok)) {
          checkImplicitNumber(tok);
          left = bin('*', left, parsePower(), true);
        } else break;
      }
      return left;
    }

    // unary := ('-'|'+') unary | power
    function parseUnary() {
      var tok = peek();
      if (isOp(tok, '-') || isOp(tok, '+')) {
        p++;
        var arg = parseUnary();
        if (tok.v === '+') return arg;
        return { type: 'unary', op: '-', arg: arg, pos: tok.pos, end: arg.end };
      }
      return parsePower();
    }

    // power := postfix ('^' unary)?      (right-associative through unary -> power)
    function parsePower() {
      var base = parsePostfix();
      var tok = peek();
      if (isOp(tok, '^')) {
        p++;
        if (!startsOperand(peek())) fail('Missing exponent after ' + q(tok), tok.pos, tok.end);
        return bin('^', base, parseUnary());
      }
      return base;
    }

    // postfix := primary superscript*
    function parsePostfix() {
      var nd = parsePrimary();
      while (peek().t === 'sup') {
        var s = toks[p++];
        var num = { type: 'number', value: Math.abs(s.value), raw: String(Math.abs(s.value)), pos: s.pos, end: s.end };
        nd = bin('^', nd, s.value < 0 ? { type: 'unary', op: '-', arg: num, pos: s.pos, end: s.end } : num);
      }
      return nd;
    }

    function parsePrimary() {
      var tok = peek();
      if (tok.t === 'num') {
        p++;
        return { type: 'number', value: tok.value, raw: tok.raw, pos: tok.pos, end: tok.end };
      }
      if (tok.t === 'name') {
        if (tok.kind === 'var') { p++; return { type: 'variable', name: tok.name, pos: tok.pos, end: tok.end }; }
        if (tok.kind === 'const') { p++; return { type: 'constant', name: tok.name, value: CONSTS[tok.name], pos: tok.pos, end: tok.end }; }
        return parseCall();
      }
      if (tok.t === 'open') {
        p++;
        if (peek().t === 'close') {
          if (peek().v !== tok.close) fail("Mismatched brackets: '" + tok.text + "' is closed by '" + peek().text + "'", tok.pos, peek().end);
          fail("Empty parentheses '" + tok.text + peek().text + "'" + DASH + 'put something inside', tok.pos, peek().end);
        }
        var e = parseExpr();
        expectClose(tok);
        return e;
      }
      if (tok.t === 'sqrt') {
        p++;
        if (!startsFactor(peek())) fail(q(tok) + ' needs a number after it, e.g. \u221A2 or \u221A(x+1)', tok.pos, tok.end);
        var arg = parseUnary();
        return { type: 'call', name: 'sqrt', args: [arg], pos: tok.pos, end: arg.end };
      }
      return operandError(tok);
    }

    // Bare argument of a one-input function (no parentheses): implicit product, stops at the next function.
    function parseChain() {
      var left = parseUnary();
      for (;;) {
        var tok = peek();
        if (startsFactor(tok) && tok.t !== 'sqrt' && !(tok.t === 'name' && tok.kind === 'func')) {
          checkImplicitNumber(tok);
          left = bin('*', left, parsePower(), true);
        } else break;
      }
      if (peek().t === 'unit') left = unitNode(left, toks[p++]);
      return left;
    }

    function parseCall() {
      var ft = toks[p++];
      var name = ft.name, info = FUNCS[name], powExp = null;
      var tok = peek();

      // f^n(x), f²(x), f^-1(x)
      if (tok.t === 'sup' || isOp(tok, '^')) {
        var ex, exPos = tok.pos, exEnd;
        if (tok.t === 'sup') { p++; ex = tok.value; exEnd = tok.end; }
        else {
          p++;
          var sgn = 1;
          if (isOp(peek(), '-')) { p++; sgn = -1; } else if (isOp(peek(), '+')) p++;
          var nt = peek();
          if (nt.t !== 'num') fail('After ' + q(ft) + " and '^' put a whole number, e.g. " + name + '^2(x)', ft.pos, nt.end);
          p++;
          ex = sgn * nt.value;
          exEnd = nt.end;
        }
        if (ex === -1) {
          if (!info.inv) fail("'" + ft.text + "^-1' isn't supported" + DASH + 'write 1/' + name + '(x) for a reciprocal', ft.pos, exEnd);
          name = info.inv;
          info = FUNCS[name];
        } else {
          powExp = { type: 'number', value: Math.abs(ex), raw: String(Math.abs(ex)), pos: exPos, end: exEnd };
          if (ex < 0) powExp = { type: 'unary', op: '-', arg: powExp, pos: exPos, end: exEnd };
        }
        tok = peek();
      }

      var args, end;
      if (tok.t === 'open') {
        var open = toks[p++];
        if (peek().t === 'close') {
          if (peek().v !== open.close) fail("Mismatched brackets: '" + open.text + "' is closed by '" + peek().text + "'", open.pos, peek().end);
          fail(ft.text + '( ) is missing its input, e.g. ' + info.eg, ft.pos, peek().end);
        }
        args = [parseExpr()];
        while (peek().t === ',') {
          var comma = toks[p++];
          var nx = peek();
          if (nx.t === 'close' || nx.t === 'eof' || nx.t === ',') fail("Missing an input after ','", comma.pos, comma.end);
          args.push(parseExpr());
        }
        end = expectClose(open).end;
      } else {
        if (info.max !== 1) fail(ft.text + ' needs parentheses, e.g. ' + info.eg, ft.pos, ft.end);
        // A bare argument may not start with a sign: "sin + 1" / "sin -x" are ambiguous -> ask for parentheses.
        if (!startsFactor(tok)) fail(ft.text + ' needs an input, e.g. ' + info.eg, ft.pos, ft.end);
        var a = name === 'sqrt' ? parseUnary() : parseChain();
        args = [a];
        end = a.end;
      }

      var nArgs = args.length;
      if (nArgs < info.min || nArgs > info.max) {
        var msg;
        if (name === 'atan' && nArgs === 2) msg = 'atan takes 1 input' + DASH + 'for two inputs use atan2(y, x)';
        else if (info.min === info.max) {
          msg = name + ' takes ' + info.min + (info.min === 1 ? ' input' : ' inputs') + ' but was given ' + nArgs + DASH + 'e.g. ' + info.eg;
        } else msg = name + ' needs at least ' + info.min + ' input' + DASH + 'e.g. ' + info.eg;
        fail(msg, ft.pos, end);
      }
      var call = { type: 'call', name: name, args: args, pos: ft.pos, end: end };
      return powExp ? bin('^', call, powExp) : call;
    }

    var ast = parseExpr();
    var t = peek();
    if (t.t !== 'eof') {
      if (t.t === 'close') fail('Unmatched closing ' + BRACKET_WORD[t.v] + ' ' + q(t), t.pos, t.end);
      if (t.t === ',') commaError(t);
      fail('Unexpected ' + q(t), t.pos, t.end);
    }
    return ast;
  }

  // ---------------------------------------------------------------- compiler (closures; no eval)
  function build(nd, idx) {
    switch (nd.type) {
      case 'number': { var v = nd.value; return function () { return v; }; }
      case 'constant': { var c = CONSTS[nd.name]; return function () { return c; }; }
      case 'variable': {
        var i = idx[nd.name];
        if (i === undefined) throw new ExprSyntaxError("Unknown name '" + nd.name + "'", nd.pos, nd.end, '');
        return function (env) { return +env[i]; };
      }
      case 'unary': { var a = build(nd.arg, idx); return function (env) { return -a(env); }; }
      case 'binary': {
        var L = build(nd.left, idx), R = build(nd.right, idx);
        switch (nd.op) {
          case '+': return function (env) { return L(env) + R(env); };
          case '-': return function (env) { return L(env) - R(env); };
          case '*': return function (env) { return L(env) * R(env); };
          case '/': return function (env) { return L(env) / R(env); };
          case '^': return function (env) { return Math.pow(L(env), R(env)); };
        }
        break;
      }
      case 'call': {
        var info = own(FUNCS, nd.name) ? FUNCS[nd.name] : null;
        if (!info) throw new ExprSyntaxError("Unknown function '" + nd.name + "'", nd.pos, nd.end, '');
        var f = info.f, as = nd.args.map(function (x) { return build(x, idx); });
        if (as.length === 1) { var a0 = as[0]; return function (env) { return f(a0(env)); }; }
        if (as.length === 2) { var b0 = as[0], b1 = as[1]; return function (env) { return f(b0(env), b1(env)); }; }
        return function (env) { return f.apply(null, as.map(function (g) { return g(env); })); };
      }
      case 'unit': {
        var u = build(nd.arg, idx);
        if (nd.unit === 'deg') return function (env) { return u(env) * DEG; };
        return u;
      }
    }
    throw new Error('CYLExpr: unknown AST node ' + nd.type);
  }

  function compile(str, varNames, opts) {
    var vars = normVars(varNames);
    var ast = isAst(str) ? str : parseInternal(str, { vars: vars, angle: !!(opts && opts.angle) });
    var idx = Object.create(null);
    for (var i = 0; i < vars.length; i++) if (!(vars[i] in idx)) idx[vars[i]] = i;
    var fn = build(ast, idx);
    var f = function () { return fn(arguments); };
    f.ast = ast;
    f.varNames = vars.slice();
    return f;
  }

  var cache = new Map();
  function evaluate(str, scope, opts) {
    scope = scope || {};
    var names = Object.keys(scope);
    if (isAst(str)) return compile(str, names, opts).apply(null, names.map(function (k) { return scope[k]; }));
    var key = (opts && opts.angle ? 'A' : 'N') + names.join('\u0001') + '\u0000' + String(str);
    var f = cache.get(key);
    if (!f) {
      f = compile(String(str), names, opts);
      if (cache.size >= 500) cache.clear();
      cache.set(key, f);
    }
    var vals = new Array(names.length);
    for (var i = 0; i < names.length; i++) vals[i] = scope[names[i]];
    return f.apply(null, vals);
  }

  function findUnit(nd) {
    if (!nd || typeof nd !== 'object') return null;
    if (nd.type === 'unit' && nd.unit === 'deg') return nd;
    var kids = nd.type === 'call' ? nd.args : [nd.arg, nd.left, nd.right];
    for (var i = 0; i < kids.length; i++) { var r = findUnit(kids[i]); if (r) return r; }
    return null;
  }

  function readNumber(str, opts, wantTex) {
    var angle = !!(opts && opts.angle);
    var res = { ok: false, value: NaN, error: null, pos: null, end: null, tex: null };
    if (typeof str === 'number') {
      if (isFinite(str)) { res.ok = true; res.value = str; if (wantTex) res.tex = toTex(String(str)); }
      else res.error = 'Not a finite number';
      return res;
    }
    var src = str == null ? '' : String(str);
    try {
      var ast = parseInternal(src, { vars: [], angle: angle });
      if (wantTex) res.tex = safeTex(ast);
      if (!angle) {
        var u = findUnit(ast);
        if (u) {
          res.error = 'The degree sign (\u00B0) can only be used for angles';
          res.pos = u.symPos; res.end = u.symEnd;
          return res;
        }
      }
      var v = build(ast, Object.create(null))([]);
      if (typeof v !== 'number' || !isFinite(v)) {
        res.error = "That doesn't work out to a real number (check for division by zero or a square root of a negative)";
        return res;
      }
      res.ok = true;
      res.value = v;
    } catch (e) {
      if (e instanceof ExprSyntaxError) { res.error = e.message; res.pos = e.pos; res.end = e.end; }
      else res.error = "Couldn't read that expression";
    }
    return res;
  }
  function parseNumber(str, opts) { return readNumber(str, opts, false).value; }
  function tryParseNumber(str, opts) { return readNumber(str, opts, true); }

  // ---------------------------------------------------------------- TeX
  function paren(s) { return '\\left(' + s + '\\right)'; }
  function isAddSub(nd) { return nd.type === 'binary' && (nd.op === '+' || nd.op === '-'); }
  function isSciNumber(nd) { return nd.type === 'number' && /[eE]/.test(String(nd.raw)); }
  function isSimple(nd) {
    return (nd.type === 'number' && !isSciNumber(nd)) || nd.type === 'variable' || nd.type === 'constant';
  }

  function numTex(raw) {
    raw = String(raw);
    function mant(s) {
      if (s[0] === '.') s = '0' + s;
      if (s[s.length - 1] === '.') s = s.slice(0, -1);
      return s;
    }
    var m = /^([\d.]*)[eE]([+-]?\d+)$/.exec(raw);
    if (m) return mant(m[1]) + '\\times 10^{' + m[2].replace(/^\+/, '') + '}';
    return mant(raw);
  }

  function varTex(name) {
    name = String(name);
    if (own(GREEK_SYM, name)) name = GREEK_SYM[name];
    var us = name.indexOf('_');
    if (us > 0 && us < name.length - 1) {
      var sub = name.slice(us + 1).replace(/_/g, '');
      return varTex(name.slice(0, us)) + '_{' + (/^(\d+|[A-Za-z0-9])$/.test(sub) ? sub : '\\mathrm{' + sub + '}') + '}';
    }
    var m = /^([A-Za-z]+)(\d+)$/.exec(name);
    if (m) return varTex(m[1]) + '_{' + m[2] + '}';
    if (own(GREEK, name)) return '\\' + name;
    if (name.length === 1) return name;
    if (/^[A-Za-z]+$/.test(name)) return '\\mathit{' + name + '}';
    return '\\text{' + name.replace(/[^A-Za-z0-9 ]/g, '') + '}';
  }

  function mulSep(ls, rs, R, rWrapped) {
    if (rWrapped || rs.indexOf('\\left(') === 0) return '';
    if (/^[\d.]/.test(rs) || rs.indexOf('\\frac') === 0) return '\\cdot ';
    if (/\d$/.test(ls)) return '';
    if (R.type === 'call' && R.name !== 'sqrt' && R.name !== 'abs') return ' ';
    return '\\,';
  }

  function tex(nd) {
    switch (nd.type) {
      case 'number': return numTex(nd.raw != null ? nd.raw : nd.value);
      case 'constant': return nd.name === 'pi' ? '\\pi' : 'e';
      case 'variable': return varTex(nd.name);
      case 'unary': {
        var us = tex(nd.arg);
        if (isAddSub(nd.arg) || us[0] === '-') us = paren(us);
        return '-' + us;
      }
      case 'unit': {
        var a = nd.arg, s = tex(a);
        if (nd.unit === 'deg') {
          if (!(isSimple(a) || (a.type === 'unary' && isSimple(a.arg)))) s = paren(s);
          return s + '^{\\circ}';
        }
        if (isAddSub(a)) s = paren(s);
        return s + '\\,\\mathrm{rad}';
      }
      case 'call': {
        var args = nd.args.map(tex);
        if (nd.name === 'sqrt') return '\\sqrt{' + args[0] + '}';
        if (nd.name === 'abs') return '\\left|' + args[0] + '\\right|';
        var info = own(FUNCS, nd.name) ? FUNCS[nd.name] : null;
        var opName = info && info.tex ? info.tex : '\\operatorname{' + String(nd.name).replace(/[^A-Za-z0-9]/g, '') + '}';
        return opName + paren(args.join(',\\,'));
      }
      case 'binary': {
        var op = nd.op, L = nd.left, R = nd.right, ls, rs;
        if (op === '+' || op === '-') {
          ls = tex(L); rs = tex(R);
          if (rs[0] === '-' || (op === '-' && isAddSub(R))) rs = paren(rs);   // a+(-b), a-(b+c)
          return ls + op + rs;
        }
        if (op === '/') {
          if (L.type === 'unary') return '-\\frac{' + tex(L.arg) + '}{' + tex(R) + '}';   // (-a)/b -> -a/b
          return '\\frac{' + tex(L) + '}{' + tex(R) + '}';
        }
        if (op === '^') {
          ls = tex(L);
          if (!(isSimple(L) || L.type === 'call')) ls = paren(ls);
          return ls + '^{' + tex(R) + '}';
        }
        // '*' (explicit or implicit): juxtapose where unambiguous, \cdot before numbers and fractions
        ls = tex(L); rs = tex(R);
        if (isAddSub(L)) ls = paren(ls);
        var rw = false;
        if (isAddSub(R) || rs[0] === '-') { rs = paren(rs); rw = true; }
        return ls + mulSep(ls, rs, R, rw) + rs;
      }
    }
    throw new Error('CYLExpr: unknown AST node ' + nd.type);
  }
  function safeTex(ast) { try { return tex(ast); } catch (e) { return null; } }

  function toTex(input, opts) {
    try {
      if (Array.isArray(opts) || typeof opts === 'string') opts = { vars: opts };
      opts = opts || {};
      var ast = isAst(input) ? input : parseInternal(input, {
        vars: opts.vars === undefined ? DEFAULT_VARS : opts.vars, angle: !!opts.angle });
      return tex(ast);
    } catch (e) {
      return null;
    }
  }

  // ---------------------------------------------------------------- export
  var CYLExpr = {
    version: VERSION,
    parse: function (str, opts) { return parseInternal(str, opts); },
    compile: compile,
    evaluate: evaluate,
    parseNumber: parseNumber,
    tryParseNumber: tryParseNumber,
    toTex: toTex,
    SyntaxError: ExprSyntaxError,
    DEFAULT_VARS: Object.freeze(DEFAULT_VARS.slice()),
    FUNCTIONS: Object.freeze(Object.keys(FUNCS))
  };
  root.CYLExpr = CYLExpr;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
