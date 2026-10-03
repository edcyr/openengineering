/*
 * inertia.js — INERT: mass moments and products of inertia for the Mass Moments of Inertia and Angular Momentum modules.
 * Classic script (IIFE) that attaches ONE global: INERT. Requires CYL (cyl-core.js) for formatting; the drawing
 * helper needs CYL3D (cyl-3d.js). Used by the lessons, the Practice Lab and the Inertia Explorer.
 *
 * Conventions (Hibbeler, Meriam and Kraige, Beer and Johnston): moments I_xx = ∫(y² + z²) dm, …; products
 * I_xy = ∫xy dm, I_yz = ∫yz dm, I_zx = ∫zx dm; the inertia tensor holds the products with a MINUS sign:
 *     [I] = [[ I_xx, −I_xy, −I_zx], [−I_xy,  I_yy, −I_yz], [−I_zx, −I_yz,  I_zz]]
 * Vectors are [x, y, z]; matrices are arrays of three rows. A rotation matrix R has as its COLUMNS a body's own
 * x, y, z axes written in world coordinates, so a tensor in the body's own axes becomes R·[I]·Rᵀ in world axes.
 *
 * Standard bodies  INERT.body(type, m, d) → {m, I:[Ixx, Iyy, Izz]} about the body's own centroidal axes
 *   (own z = the axis of a rod, cylinder, tube, disk, ring or cone; a plate lies in its own xy-plane):
 *   'point' {}                           'rod' {l}  slender rod along z
 *   'box' {a, b, c} edges along x, y, z  'plate' {a, b} thin, in the xy-plane
 *   'cylinder' {r, h}                    'tube' {r, r0, h} thick-walled (r0 = inner radius; r0 → r: thin-walled)
 *   'disk' {r} thin                      'ring' {r} thin hoop
 *   'sphere' {r}                         'shell' {r} thin spherical shell
 *   'cone' {r, h} solid, about its centroid (h/4 above the base)
 * Parts and composites  INERT.assemble(parts) → {m, G, IO, IG}. A part is {type, m, d, center:[x,y,z], rotation
 *   (3×3) or axis ([x,y,z], own z), hole:true (subtracts)}; IO about the origin, IG about the composite center G.
 * Tensors  INERT.tensor(Ixx, Iyy, Izz, Ixy, Iyz, Izx), INERT.parts(T) → {Ixx, Iyy, Izz, Ixy, Iyz, Izx},
 *   INERT.rotate(T, R), INERT.shift(T, m, d) (parallel axis: from G to a point at −d, i.e. IO = IG + m(|d|²1 − d dᵀ)
 *   where d = position of G relative to the new point), INERT.aboutAxis(T, u) = uᵀTu, INERT.H(T, w), INERT.KE(T, w),
 *   INERT.eig(T) → {values: [I1 ≥ I2 ≥ I3], vectors: [u1, u2, u3]} (right-handed, unit), INERT.axisFrom(u) → R with
 *   z along u, INERT.rotZYX(yaw, pitch, roll) (degrees).
 * TeX  INERT.texMatrix(T, sig), INERT.texVec(v, sig).
 * Drawing  INERT.draw(viewer, part, style) → handle {set(part), setVisible(on), group}; bodies are drawn with
 *   viewer.solid (thin rods, plates, disks and rings get a small visual thickness).
 */
(function (window) {
  'use strict';
  if (window.INERT) return;
  var INERT = { version: '1.0.0' };
  var TAU = 2 * Math.PI;

  /* ------------------------------------------------------------------ vectors and matrices */
  function v3(a) { return [+a[0] || 0, +a[1] || 0, +a[2] || 0]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { return Math.sqrt(dot(a, a)); }
  function unit(a) { var n = norm(a); return n > 1e-15 ? [a[0] / n, a[1] / n, a[2] / n] : null; }
  function zero3() { return [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; }
  function ident() { return [[1, 0, 0], [0, 1, 0], [0, 0, 1]]; }
  function diag(d) { return [[d[0], 0, 0], [0, d[1], 0], [0, 0, d[2]]]; }
  function T3(A) { return [[A[0][0], A[1][0], A[2][0]], [A[0][1], A[1][1], A[2][1]], [A[0][2], A[1][2], A[2][2]]]; }
  function mul(A, B) {
    var C = zero3();
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) C[i][j] = A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
    return C;
  }
  function mv(A, v) { return [dot(A[0], v), dot(A[1], v), dot(A[2], v)]; }
  function add(A, B, s) { s = s == null ? 1 : s; var C = zero3(); for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) C[i][j] = A[i][j] + s * B[i][j]; return C; }
  function scale(A, s) { return add(zero3(), A, s); }
  INERT.vec = { dot: dot, cross: cross, norm: norm, unit: unit };
  INERT.mat = { zero: zero3, ident: ident, diag: diag, T: T3, mul: mul, mv: mv, add: add, scale: scale };

  /* ------------------------------------------------------------------ standard bodies */
  var BODY = {
    point: function () { return [0, 0, 0]; },
    rod: function (m, d) { var k = m * d.l * d.l / 12; return [k, k, 0]; },
    box: function (m, d) { return [m * (d.b * d.b + d.c * d.c) / 12, m * (d.a * d.a + d.c * d.c) / 12, m * (d.a * d.a + d.b * d.b) / 12]; },
    plate: function (m, d) { return [m * d.b * d.b / 12, m * d.a * d.a / 12, m * (d.a * d.a + d.b * d.b) / 12]; },
    cylinder: function (m, d) { var t = m * (3 * d.r * d.r + d.h * d.h) / 12; return [t, t, m * d.r * d.r / 2]; },
    tube: function (m, d) {
      var r0 = d.r0 == null ? d.r : d.r0, s = d.r * d.r + r0 * r0, t = m * (3 * s + d.h * d.h) / 12;
      return [t, t, m * s / 2];
    },
    disk: function (m, d) { return [m * d.r * d.r / 4, m * d.r * d.r / 4, m * d.r * d.r / 2]; },
    ring: function (m, d) { return [m * d.r * d.r / 2, m * d.r * d.r / 2, m * d.r * d.r]; },
    sphere: function (m, d) { var k = 0.4 * m * d.r * d.r; return [k, k, k]; },
    shell: function (m, d) { var k = 2 * m * d.r * d.r / 3; return [k, k, k]; },
    cone: function (m, d) { var t = 3 * m * (4 * d.r * d.r + d.h * d.h) / 80; return [t, t, 0.3 * m * d.r * d.r]; }
  };
  INERT.TYPES = Object.keys(BODY);
  INERT.body = function (type, m, d) {
    if (!BODY[type]) throw new Error('INERT.body: unknown type ' + type);
    return { m: m, I: BODY[type](m, d || {}) };
  };
  // Volume of a solid body (for density problems); null for lines and surfaces.
  INERT.volume = function (type, d) {
    switch (type) {
      case 'box': return d.a * d.b * d.c;
      case 'cylinder': return Math.PI * d.r * d.r * d.h;
      case 'tube': return Math.PI * (d.r * d.r - (d.r0 || 0) * (d.r0 || 0)) * d.h;
      case 'sphere': return 4 * Math.PI * Math.pow(d.r, 3) / 3;
      case 'cone': return Math.PI * d.r * d.r * d.h / 3;
      default: return null;
    }
  };

  /* ------------------------------------------------------------------ tensors */
  INERT.tensor = function (Ixx, Iyy, Izz, Ixy, Iyz, Izx) {
    Ixy = Ixy || 0; Iyz = Iyz || 0; Izx = Izx || 0;
    return [[Ixx, -Ixy, -Izx], [-Ixy, Iyy, -Iyz], [-Izx, -Iyz, Izz]];
  };
  INERT.parts = function (T) {
    return { Ixx: T[0][0], Iyy: T[1][1], Izz: T[2][2], Ixy: -T[0][1], Iyz: -T[1][2], Izx: -T[0][2] };
  };
  INERT.rotate = function (T, R) { return mul(mul(R, T), T3(R)); };
  // Parallel axis for the whole tensor: d = position of G measured from the new point.
  INERT.shift = function (T, m, d) {
    var x = d[0], y = d[1], z = d[2];
    return add(T, [[y * y + z * z, -x * y, -x * z], [-x * y, x * x + z * z, -y * z], [-x * z, -y * z, x * x + y * y]], m);
  };
  INERT.aboutAxis = function (T, u) { var e = unit(u); return e ? dot(e, mv(T, e)) : NaN; };
  INERT.H = function (T, w) { return mv(T, w); };
  INERT.KE = function (T, w) { return 0.5 * dot(w, mv(T, w)); };

  // Orthonormal basis with z along u (x chosen in the plane of z and the world axis least aligned with u).
  INERT.axisFrom = function (u) {
    var z = unit(u) || [0, 0, 1];
    var ref = Math.abs(z[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    var x = unit(cross(ref, z)), y = cross(z, x);
    return T3([x, y, z]);   // columns x, y, z
  };
  // Rotation from yaw (about z), pitch (about the new y) and roll (about the new x), in degrees: R = Rz·Ry·Rx.
  INERT.rotZYX = function (yaw, pitch, roll) {
    var a = (yaw || 0) * Math.PI / 180, b = (pitch || 0) * Math.PI / 180, c = (roll || 0) * Math.PI / 180;
    var Rz = [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]];
    var Ry = [[Math.cos(b), 0, Math.sin(b)], [0, 1, 0], [-Math.sin(b), 0, Math.cos(b)]];
    var Rx = [[1, 0, 0], [0, Math.cos(c), -Math.sin(c)], [0, Math.sin(c), Math.cos(c)]];
    return mul(mul(Rz, Ry), Rx);
  };
  function partRotation(p) {
    if (p.rotation) return p.rotation;
    if (p.axis) return INERT.axisFrom(p.axis);
    return ident();
  }
  INERT.partRotation = partRotation;

  // Composite: every part's tensor about its own centroid, rotated to world axes, shifted to the origin.
  INERT.assemble = function (parts) {
    var m = 0, S = [0, 0, 0], IO = zero3();
    (parts || []).forEach(function (p) {
      if (!p || !(p.m > 0)) return;
      var s = p.hole ? -1 : 1, b = INERT.body(p.type, p.m, p.d || {}), c = v3(p.center || [0, 0, 0]);
      var TG = INERT.rotate(diag(b.I), partRotation(p));
      IO = add(IO, INERT.shift(TG, p.m, c), s);
      m += s * p.m;
      S = [S[0] + s * p.m * c[0], S[1] + s * p.m * c[1], S[2] + s * p.m * c[2]];
    });
    var G = m > 1e-15 ? [S[0] / m, S[1] / m, S[2] / m] : [0, 0, 0];
    var IG = m > 1e-15 ? INERT.shift(IO, -m, G) : IO;
    return { m: m, G: G, IO: IO, IG: IG };
  };

  /* ------------------------------------------------------------------ principal axes (Jacobi) */
  INERT.eig = function (T) {
    var A = [T[0].slice(), T[1].slice(), T[2].slice()], V = ident();
    for (var sweep = 0; sweep < 60; sweep++) {
      var off = A[0][1] * A[0][1] + A[0][2] * A[0][2] + A[1][2] * A[1][2];
      var scaleA = Math.abs(A[0][0]) + Math.abs(A[1][1]) + Math.abs(A[2][2]) || 1;
      if (off < 1e-26 * scaleA * scaleA) break;
      for (var p = 0; p < 2; p++) for (var q = p + 1; q < 3; q++) {
        if (Math.abs(A[p][q]) < 1e-300) continue;
        var th = (A[q][q] - A[p][p]) / (2 * A[p][q]);
        var t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        var c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (var k = 0; k < 3; k++) {             // A ← Jᵀ A J
          var akp = A[k][p], akq = A[k][q];
          A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq;
        }
        for (k = 0; k < 3; k++) {
          var apk = A[p][k], aqk = A[q][k];
          A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk;
        }
        for (k = 0; k < 3; k++) {
          var vkp = V[k][p], vkq = V[k][q];
          V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq;
        }
      }
    }
    var list = [0, 1, 2].map(function (i) { return { val: A[i][i], vec: [V[0][i], V[1][i], V[2][i]] }; });
    list.sort(function (a, b) { return b.val - a.val; });
    var u1 = unit(list[0].vec), u2 = unit(list[1].vec), u3 = cross(u1, u2);  // right-handed
    return { values: [list[0].val, list[1].val, list[2].val], vectors: [u1, u2, u3] };
  };

  /* ------------------------------------------------------------------ TeX */
  function num(x, sig) { return CYL.fmtTex(Math.abs(x) < 1e-12 ? 0 : x, sig || 4); }
  INERT.texMatrix = function (T, sig) {
    return '\\begin{bmatrix}' + T.map(function (row) { return row.map(function (x) { return num(x, sig); }).join(' & '); }).join(' \\\\ ') + '\\end{bmatrix}';
  };
  INERT.texVec = function (v, sig) { return '(' + v.map(function (x) { return num(x, sig); }).join(',\\ ') + ')'; };
  INERT.fmtNum = num;

  /* ------------------------------------------------------------------ drawing */
  // Visual shape for a part: thin bodies get a small thickness so they can be seen.
  INERT.solidSpec = function (p, style) {
    style = style || {};
    var d = p.d || {}, thin = style.thin || 0.02, R = partRotation(p), c = v3(p.center || [0, 0, 0]);
    var base = { center: c, rotation: R, color: style.color || (p.hole ? 'bad' : 'accent'), opacity: style.opacity == null ? (p.hole ? 0.25 : 0.55) : style.opacity };
    switch (p.type) {
      case 'rod': return Object.assign(base, { shape: 'cylinder', r: style.rodRadius || thin, h: d.l });
      case 'box': return Object.assign(base, { shape: 'box', size: [d.a, d.b, d.c] });
      case 'plate': return Object.assign(base, { shape: 'box', size: [d.a, d.b, style.plateThickness || thin] });
      case 'cylinder': return Object.assign(base, { shape: 'cylinder', r: d.r, h: d.h });
      case 'tube': return Object.assign(base, { shape: 'tube', r: d.r, r0: d.r0 == null ? d.r * 0.9 : d.r0, h: d.h });
      case 'disk': return Object.assign(base, { shape: 'cylinder', r: d.r, h: style.plateThickness || thin });
      case 'ring': return Object.assign(base, { shape: 'tube', r: d.r + (style.rodRadius || thin), r0: Math.max(0, d.r - (style.rodRadius || thin)), h: 2 * (style.rodRadius || thin) });
      case 'sphere': return Object.assign(base, { shape: 'sphere', r: d.r });
      case 'shell': return Object.assign(base, { shape: 'sphere', r: d.r, opacity: style.opacity == null ? 0.3 : style.opacity });
      case 'cone': return Object.assign(base, { shape: 'cone', r: d.r, h: d.h });
      default: return null;   // point: drawn as a point
    }
  };
  INERT.draw = function (v, p, style) {
    style = style || {};
    var g = v.group(style.parent);
    var solid = null, pt = null, cur = null;
    function apply(part) {
      cur = part;
      if (part.type === 'point') {
        if (solid) solid.visible = false;
        if (!pt) pt = v.point(part.center || [0, 0, 0], { color: style.pointColor || 'point', size: style.pointSize || 0.06, label: style.label || null, parent: g });
        else pt.setPosition(part.center || [0, 0, 0]);
        pt.visible = true;
      } else {
        if (pt) pt.visible = false;
        var spec = INERT.solidSpec(part, style);
        if (!solid) { spec.parent = g; solid = v.solid(spec); }
        else solid.set(spec);
        solid.visible = true;
        if (style.color || part.hole) solid.setColor(style.color || (part.hole ? 'bad' : 'accent'));
      }
      v.render();
    }
    apply(p);
    return {
      group: g,
      set: function (part) { apply(part); return this; },
      part: function () { return cur; },
      setVisible: function (on) { g.visible = !!on; v.render(); return this; }
    };
  };

  window.INERT = INERT;
})(window);
