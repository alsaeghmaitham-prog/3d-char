// Low-poly modelling toolkit.
//
// Parts are authored as `Poly` objects: shared vertices + polygon faces, each
// face tagged with a palette material slot and each vertex with skin weights.
// `buildGeometry` turns a list of Polys into a non-indexed, flat-shaded
// BufferGeometry (one group per material slot) ready for a Mesh/SkinnedMesh.
import * as THREE from 'three';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _n = new THREE.Vector3();

/** Deterministic pseudo random number in [-1, 1] from a position + seed. */
export function hash3(x, y, z, seed = 0) {
  let h = Math.imul(Math.round(x * 4096) | 0, 0x27d4eb2d);
  h = Math.imul(h ^ (Math.round(y * 4096) | 0), 0x165667b1) + 0x3c6ef372;
  h = Math.imul(h ^ (Math.round(z * 4096) | 0), 0x85ebca77) ^ Math.imul(seed + 1, 0xc2b2ae3d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

/** Simple seeded RNG (mulberry32). */
export function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export const deg = (d) => (d * Math.PI) / 180;
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const smooth = (t) => t * t * (3 - 2 * t);

export class Poly {
  constructor(mat = 'uniform') {
    this.mat = mat;
    this.pos = [];
    this.faces = [];
    this.skin = []; // per vertex: [[boneName, weight], ...] or undefined
  }

  get vertexCount() {
    return this.pos.length;
  }

  v(x, y, z) {
    this.pos.push(new THREE.Vector3(x, y, z));
    return this.pos.length - 1;
  }

  vv(vec) {
    this.pos.push(vec.clone());
    return this.pos.length - 1;
  }

  /** Add a polygon face (convex, counter-clockwise seen from outside). */
  f(ids, mat = this.mat) {
    this.faces.push({ ids: ids.slice(), mat });
    return this;
  }

  /** Add a face, flipping it if needed so its normal points along `out`. */
  fOut(ids, out, mat = this.mat) {
    const n = this.faceNormal(ids, _n);
    if (n.dot(out) < 0) ids = ids.slice().reverse();
    return this.f(ids, mat);
  }

  /** Newell normal of a polygon given by vertex ids. */
  faceNormal(ids, target = new THREE.Vector3()) {
    target.set(0, 0, 0);
    for (let i = 0; i < ids.length; i++) {
      const p = this.pos[ids[i]];
      const q = this.pos[ids[(i + 1) % ids.length]];
      target.x += (p.y - q.y) * (p.z + q.z);
      target.y += (p.z - q.z) * (p.x + q.x);
      target.z += (p.x - q.x) * (p.y + q.y);
    }
    return target.normalize();
  }

  faceCenter(ids, target = new THREE.Vector3()) {
    target.set(0, 0, 0);
    for (const i of ids) target.add(this.pos[i]);
    return target.multiplyScalar(1 / ids.length);
  }

  /** Flip faces so that they point away from `center` (only valid for convex-ish solids). */
  orientFrom(center, fromFace = 0) {
    const c = new THREE.Vector3();
    for (let i = fromFace; i < this.faces.length; i++) {
      const face = this.faces[i];
      const n = this.faceNormal(face.ids, _n);
      this.faceCenter(face.ids, c).sub(center);
      if (n.dot(c) < 0) face.ids.reverse();
    }
    return this;
  }

  setMat(mat) {
    for (const f of this.faces) f.mat = mat;
    this.mat = mat;
    return this;
  }

  /** Rigidly bind every vertex to one bone. */
  bone(name) {
    for (let i = 0; i < this.pos.length; i++) this.skin[i] = [[name, 1]];
    return this;
  }

  /** Bind each vertex with a function (pos, index) => [[bone, w], ...]. */
  skinBy(fn) {
    for (let i = 0; i < this.pos.length; i++) this.skin[i] = fn(this.pos[i], i);
    return this;
  }

  apply(m) {
    for (const p of this.pos) p.applyMatrix4(m);
    if (m.determinant() < 0) for (const f of this.faces) f.ids.reverse();
    return this;
  }

  translate(x, y, z) {
    for (const p of this.pos) {
      p.x += x;
      p.y += y;
      p.z += z;
    }
    return this;
  }

  scale(x, y = x, z = x) {
    return this.apply(new THREE.Matrix4().makeScale(x, y, z));
  }

  rotateX(a) {
    return this.apply(new THREE.Matrix4().makeRotationX(a));
  }

  rotateY(a) {
    return this.apply(new THREE.Matrix4().makeRotationY(a));
  }

  rotateZ(a) {
    return this.apply(new THREE.Matrix4().makeRotationZ(a));
  }

  /** Mirror across the YZ plane (x -> -x). */
  mirrorX() {
    return this.apply(new THREE.Matrix4().makeScale(-1, 1, 1));
  }

  /** Move every vertex with fn(pos, index) (mutate pos in place). */
  warp(fn) {
    this.pos.forEach((p, i) => fn(p, i));
    return this;
  }

  /** Deterministic per-vertex jitter giving the faceted, hand-made look. */
  jitter(amount, seed = 1, axes = [1, 1, 1], filter = null) {
    const ax = Array.isArray(amount) ? amount : [amount, amount, amount];
    for (let i = 0; i < this.pos.length; i++) {
      const p = this.pos[i];
      if (filter && !filter(p, i)) continue;
      const x = p.x,
        y = p.y,
        z = p.z;
      p.x += hash3(x, y, z, seed) * ax[0] * axes[0];
      p.y += hash3(x, y, z, seed + 17) * ax[1] * axes[1];
      p.z += hash3(x, y, z, seed + 31) * ax[2] * axes[2];
    }
    return this;
  }

  /** Append another poly (vertices are not welded). Returns index offset. */
  add(other) {
    const off = this.pos.length;
    for (const p of other.pos) this.pos.push(p.clone());
    for (let i = 0; i < other.pos.length; i++) {
      this.skin[off + i] = other.skin[i] ? other.skin[i].map((s) => s.slice()) : undefined;
    }
    for (const f of other.faces) this.faces.push({ ids: f.ids.map((i) => i + off), mat: f.mat });
    return off;
  }

  clone() {
    const p = new Poly(this.mat);
    p.add(this);
    return p;
  }

  bounds() {
    const b = new THREE.Box3();
    for (const p of this.pos) b.expandByPoint(p);
    return b;
  }
}

// ---------------------------------------------------------------------------
// Primitive builders. All return a new Poly unless stated otherwise.
// ---------------------------------------------------------------------------

/**
 * Connect rings of vertex ids (each ring same length, ordered CCW when seen
 * from the end of the sequence) with quads facing outward.
 */
export function bridge(poly, ringA, ringB, mat, closed = true) {
  const n = ringA.length;
  const m = closed ? n : n - 1;
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % n;
    poly.f([ringA[i], ringA[j], ringB[j], ringB[i]], mat);
  }
}

/**
 * Loft through rings of points. `rings` is an array of arrays of Vector3,
 * each ring CCW around the loft direction (first ring -> last ring).
 * caps: 'flat' | 'point' | Vector3 (apex) | false for start and end.
 */
export function loft(rings, { mat = 'uniform', start = 'flat', end = 'flat', closed = true } = {}) {
  const poly = new Poly(mat);
  const ids = rings.map((r) => r.map((p) => poly.vv(p)));
  for (let k = 0; k < ids.length - 1; k++) bridge(poly, ids[k], ids[k + 1], mat, closed);
  const cap = (ring, kind, isEnd) => {
    if (!kind) return;
    if (kind === 'flat') {
      poly.f(isEnd ? ring.slice() : ring.slice().reverse(), mat);
    } else {
      const c = new THREE.Vector3();
      if (kind instanceof THREE.Vector3) c.copy(kind);
      else {
        for (const i of ring) c.add(poly.pos[i]);
        c.multiplyScalar(1 / ring.length);
      }
      const ci = poly.vv(c);
      const n = ring.length;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        poly.f(isEnd ? [ring[i], ring[j], ci] : [ring[j], ring[i], ci], mat);
      }
    }
  };
  cap(ids[0], start, false);
  cap(ids[ids.length - 1], end, true);
  poly.ringIds = ids;
  return poly;
}

/**
 * Points of a (super)ellipse ring in the XZ plane at height y.
 * Angle 0 = +Z (front), increasing towards +X, i.e. CCW seen from +Y.
 * opts: { n, rx, rz, y, cx, cz, power, phase, rzBack, rxFn(theta) }
 */
export function ellipseRing({
  n = 8,
  rx = 1,
  rz = 1,
  y = 0,
  cx = 0,
  cz = 0,
  power = 2,
  phase = 0,
  rzBack = null,
  yFn = null,
  rFn = null,
}) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = phase + (i / n) * Math.PI * 2;
    const s = Math.sin(t);
    const c = Math.cos(t);
    const e = 2 / power;
    let x = Math.sign(s) * Math.pow(Math.abs(s), e) * rx;
    let z = Math.sign(c) * Math.pow(Math.abs(c), e) * (c < 0 && rzBack != null ? rzBack : rz);
    if (rFn) {
      const k = rFn(t);
      x *= k;
      z *= k;
    }
    pts.push(new THREE.Vector3(cx + x, y + (yFn ? yFn(t) : 0), cz + z));
  }
  return pts;
}

/** Lathe around +Y. profile: [[radius, y], ...] bottom -> top. */
export function lathe(profile, n = 8, { mat = 'uniform', phase = 0, start = 'flat', end = 'flat', rz = null, power = 2 } = {}) {
  let prof = profile.slice();
  if (prof[0][0] < 1e-6) {
    start = new THREE.Vector3(0, prof[0][1], 0);
    prof = prof.slice(1);
  }
  if (prof[prof.length - 1][0] < 1e-6) {
    end = new THREE.Vector3(0, prof[prof.length - 1][1], 0);
    prof = prof.slice(0, -1);
  }
  const rings = prof.map(([r, y]) => ellipseRing({ n, rx: r, rz: rz ? r * rz : r, y, phase, power }));
  return loft(rings, { mat, start, end });
}

/**
 * Box centred at origin with chamfered edges.
 * w (x), h (y), d (z), c chamfer. Optional `top` scale [sx, sz] tapering +Y face.
 */
export function chamferBox(w, h, d, c = 0, { mat = 'uniform', top = null, bottom = null } = {}) {
  const poly = new Poly(mat);
  const hw = w / 2,
    hh = h / 2,
    hd = d / 2;
  if (c <= 0) {
    const ids = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) ids.push(poly.v(sx * hw, sy * hh, sz * hd));
    const id = (sx, sy, sz) => ids[((sx + 1) / 2) * 4 + ((sy + 1) / 2) * 2 + (sz + 1) / 2];
    for (const s of [-1, 1]) {
      poly.f([id(s, -1, -1), id(s, 1, -1), id(s, 1, 1), id(s, -1, 1)]);
      poly.f([id(-1, s, -1), id(1, s, -1), id(1, s, 1), id(-1, s, 1)]);
      poly.f([id(-1, -1, s), id(1, -1, s), id(1, 1, s), id(-1, 1, s)]);
    }
  } else {
    const corner = {};
    for (const sx of [-1, 1])
      for (const sy of [-1, 1])
        for (const sz of [-1, 1]) {
          corner[`${sx}${sy}${sz}`] = {
            x: poly.v(sx * hw, sy * (hh - c), sz * (hd - c)),
            y: poly.v(sx * (hw - c), sy * hh, sz * (hd - c)),
            z: poly.v(sx * (hw - c), sy * (hh - c), sz * hd),
          };
        }
    const C = (sx, sy, sz) => corner[`${sx}${sy}${sz}`];
    for (const s of [-1, 1]) {
      poly.f([C(s, -1, -1).x, C(s, 1, -1).x, C(s, 1, 1).x, C(s, -1, 1).x]);
      poly.f([C(-1, s, -1).y, C(1, s, -1).y, C(1, s, 1).y, C(-1, s, 1).y]);
      poly.f([C(-1, -1, s).z, C(1, -1, s).z, C(1, 1, s).z, C(-1, 1, s).z]);
    }
    for (const a of [-1, 1])
      for (const b of [-1, 1]) {
        // edges along x (fixed y=a, z=b)
        poly.f([C(-1, a, b).y, C(1, a, b).y, C(1, a, b).z, C(-1, a, b).z]);
        // edges along y (fixed x=a, z=b)
        poly.f([C(a, -1, b).x, C(a, 1, b).x, C(a, 1, b).z, C(a, -1, b).z]);
        // edges along z (fixed x=a, y=b)
        poly.f([C(a, b, -1).x, C(a, b, 1).x, C(a, b, 1).y, C(a, b, -1).y]);
      }
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) poly.f([C(sx, sy, sz).x, C(sx, sy, sz).y, C(sx, sy, sz).z]);
  }
  if (top || bottom) {
    for (const p of poly.pos) {
      const t = (p.y + hh) / h;
      const sx = lerp(bottom ? bottom[0] : 1, top ? top[0] : 1, t);
      const sz = lerp(bottom ? bottom[1] : 1, top ? top[1] : 1, t);
      p.x *= sx;
      p.z *= sz;
    }
  }
  poly.orientFrom(new THREE.Vector3(0, 0, 0));
  return poly;
}

/** Offset a closed 2D polygon (array of THREE.Vector2, CCW) inward by d using miter joins. */
export function insetPolygon(pts, d) {
  const n = pts.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const e0 = new THREE.Vector2().subVectors(p1, p0).normalize();
    const e1 = new THREE.Vector2().subVectors(p2, p1).normalize();
    // inward normals for CCW polygon: rotate edge by +90 deg
    const n0 = new THREE.Vector2(-e0.y, e0.x);
    const n1 = new THREE.Vector2(-e1.y, e1.x);
    const bis = n0.clone().add(n1);
    const len = bis.length();
    if (len < 1e-6) {
      out.push(p1.clone().addScaledVector(n0, d));
      continue;
    }
    bis.multiplyScalar(1 / len);
    const cosHalf = Math.max(0.35, bis.dot(n0));
    out.push(p1.clone().addScaledVector(bis, d / cosHalf));
  }
  return out;
}

/**
 * Extrude a 2D profile drawn in the (u, v) plane along the third axis with a
 * chamfer on both caps. The profile is CCW in (u,v). Axes map: u->Z, v->Y,
 * thickness along X by default (side profiles of rifles, stocks, flaps).
 */
export function extrudeProfile(profile, thickness, chamfer = 0, { mat = 'uniform', axis = 'x' } = {}) {
  const poly = new Poly(mat);
  const pts = profile.map((p) => (p.isVector2 ? p.clone() : new THREE.Vector2(p[0], p[1])));
  if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse();
  const inset = chamfer > 0 ? insetPolygon(pts, chamfer) : pts;
  const t = thickness / 2;
  const toV = (q, x) => (axis === 'x' ? new THREE.Vector3(x, q.y, q.x) : new THREE.Vector3(q.x, q.y, x));
  const layers = chamfer > 0
    ? [[inset, t], [pts, t - chamfer], [pts, -t + chamfer], [inset, -t]]
    : [[pts, t], [pts, -t]];
  const ids = layers.map(([ring, x]) => ring.map((q) => poly.vv(toV(q, x))));
  // sides
  for (let k = 0; k < ids.length - 1; k++) {
    const A = ids[k],
      B = ids[k + 1];
    for (let i = 0; i < A.length; i++) {
      const j = (i + 1) % A.length;
      poly.f([A[i], B[i], B[j], A[j]]);
    }
  }
  // caps
  const tris = THREE.ShapeUtils.triangulateShape(inset, []);
  const first = ids[0],
    last = ids[ids.length - 1];
  for (const [a, b, c] of tris) {
    poly.f([first[a], first[b], first[c]]);
    poly.f([last[c], last[b], last[a]]);
  }
  // make orientation consistent: the +x cap must face +x
  const capN = poly.faceNormal(poly.faces[poly.faces.length - 2].ids);
  const want = axis === 'x' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
  if (capN.dot(want) < 0) for (const f of poly.faces) f.ids.reverse();
  return poly;
}

/**
 * Flat strap (rectangular section) following a path. `normals[i]` gives the
 * outward surface normal at each point; the strap lies on the surface and is
 * extruded outwards by `thickness`.
 */
export function strap(path, normals, width, thickness, { mat = 'webbing', capStart = true, capEnd = true, widths = null } = {}) {
  const poly = new Poly(mat);
  const rings = [];
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    const prev = path[Math.max(0, i - 1)];
    const next = path[Math.min(path.length - 1, i + 1)];
    const tan = new THREE.Vector3().subVectors(next, prev).normalize();
    const nrm = normals[i].clone();
    nrm.addScaledVector(tan, -nrm.dot(tan)).normalize();
    const bin = new THREE.Vector3().crossVectors(tan, nrm).normalize();
    const w = (widths ? widths[i] : width) / 2;
    const r = [
      poly.vv(p.clone().addScaledVector(bin, -w)),
      poly.vv(p.clone().addScaledVector(bin, w)),
      poly.vv(p.clone().addScaledVector(bin, w).addScaledVector(nrm, thickness)),
      poly.vv(p.clone().addScaledVector(bin, -w).addScaledVector(nrm, thickness)),
    ];
    rings.push(r);
  }
  for (let k = 0; k < rings.length - 1; k++) bridge(poly, rings[k], rings[k + 1], mat, true);
  if (capStart) poly.f(rings[0].slice().reverse(), mat);
  if (capEnd) poly.f(rings[rings.length - 1].slice(), mat);
  // orientation: check one side face against the outward normal
  const test = poly.faceNormal(poly.faces[2].ids);
  if (test.dot(normals[0]) < 0) for (const f of poly.faces) f.ids.reverse();
  return poly;
}

/** Tube with a polygonal section along a polyline (barrels, chinstrap, handles). */
export function tube(path, radius, n = 6, { mat = 'metal', capStart = true, capEnd = true, radii = null, up = null } = {}) {
  const rings = [];
  let prevNormal = null;
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    const prev = path[Math.max(0, i - 1)];
    const next = path[Math.min(path.length - 1, i + 1)];
    const tan = new THREE.Vector3().subVectors(next, prev).normalize();
    let nrm;
    if (prevNormal) nrm = prevNormal.clone();
    else nrm = (up ? up.clone() : Math.abs(tan.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0));
    nrm.addScaledVector(tan, -nrm.dot(tan)).normalize();
    prevNormal = nrm;
    const bin = new THREE.Vector3().crossVectors(tan, nrm);
    const r = radii ? radii[i] : radius;
    const ring = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + Math.PI / n;
      ring.push(p.clone().addScaledVector(nrm, Math.cos(a) * r).addScaledVector(bin, Math.sin(a) * r));
    }
    rings.push(ring);
  }
  const poly = loft(rings, { mat, start: capStart ? 'flat' : false, end: capEnd ? 'flat' : false });
  // ensure outward orientation
  const c = path[0].clone().lerp(path[Math.min(1, path.length - 1)], 0.5);
  const f0 = poly.faces[0];
  const fc = poly.faceCenter(f0.ids).sub(c);
  if (poly.faceNormal(f0.ids).dot(fc) < 0) for (const f of poly.faces) f.ids.reverse();
  return poly;
}

/**
 * Thick sheet between two polylines (rowA = inner edge, rowB = outer edge).
 * The given points form the visible top surface; thickness extends below it.
 * `outward(p)` returns the direction the top surface should face near p.
 */
export function thickSheet(rowA, rowB, thickness, outward, { mat = 'uniform', closed = false } = {}) {
  const n = rowA.length;
  const poly = new Poly(mat);
  const top = [];
  const bot = [];
  const normals = [];
  const at = (row, i) => row[closed ? (i + n) % n : THREE.MathUtils.clamp(i, 0, n - 1)];
  for (let i = 0; i < n; i++) {
    const a = rowA[i],
      b = rowB[i];
    const along = at(rowA, i + 1).clone().sub(at(rowA, i - 1)).add(at(rowB, i + 1).clone().sub(at(rowB, i - 1)));
    const across = b.clone().sub(a);
    const nrm = new THREE.Vector3().crossVectors(along, across).normalize();
    const mid = a.clone().add(b).multiplyScalar(0.5);
    if (nrm.dot(outward(mid)) < 0) nrm.negate();
    normals.push(nrm);
    top.push([poly.vv(a), poly.vv(b)]);
    bot.push([poly.vv(a.clone().addScaledVector(nrm, -thickness)), poly.vv(b.clone().addScaledVector(nrm, -thickness))]);
  }
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % n;
    const nrm = normals[i].clone().add(normals[j]).normalize();
    poly.fOut([top[i][0], top[j][0], top[j][1], top[i][1]], nrm);
    poly.fOut([bot[i][0], bot[j][0], bot[j][1], bot[i][1]], nrm.clone().negate());
    const inward = rowA[i].clone().sub(rowB[i]).normalize();
    poly.fOut([top[i][0], top[j][0], bot[j][0], bot[i][0]], inward);
    poly.fOut([top[i][1], top[j][1], bot[j][1], bot[i][1]], inward.clone().negate());
  }
  if (!closed) {
    const s = rowA[0].clone().sub(rowA[1]).add(rowB[0].clone().sub(rowB[1])).normalize();
    poly.fOut([top[0][0], top[0][1], bot[0][1], bot[0][0]], s);
    const e = rowA[n - 1].clone().sub(rowA[n - 2]).add(rowB[n - 1].clone().sub(rowB[n - 2])).normalize();
    poly.fOut([top[n - 1][0], top[n - 1][1], bot[n - 1][1], bot[n - 1][0]], e);
  }
  return poly;
}

/** Build a tube along an axis from rings [[s, r1, r2], ...] (r1/r2 radii). */
export function axisTube(rings, { n = 8, mat = 'uniform', start = 'flat', end = 'flat', phase = 0, power = 2 } = {}) {
  const pts = [];
  let s0 = null,
    s1 = null;
  const list = rings.slice();
  if (list[0].length === 1) s0 = list.shift()[0];
  if (list[list.length - 1].length === 1) s1 = list.pop()[0];
  for (const [s, r1, r2 = r1, ox = 0, oz = 0] of list) pts.push(ellipseRing({ n, rx: r1, rz: r2, y: s, cx: ox, cz: oz, phase, power }));
  const avg = (ring) => ring.reduce((acc, p) => acc.add(p), new THREE.Vector3()).multiplyScalar(1 / ring.length);
  const st = s0 != null ? avg(pts[0]).setY(s0) : start;
  const en = s1 != null ? avg(pts[pts.length - 1]).setY(s1) : end;
  return loft(pts, { mat, start: st, end: en });
}

/**
 * Cast a ray against a poly's faces. Returns the nearest hit in front of the
 * origin as { point, normal } (the face's own outward normal), or null.
 */
export function raycastPoly(poly, origin, dir) {
  const d = dir.clone().normalize();
  let best = null;
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const pv = new THREE.Vector3();
  const tv = new THREE.Vector3();
  const qv = new THREE.Vector3();
  for (const face of poly.faces) {
    for (const tri of triangulateFace(poly, face.ids)) {
      const a = poly.pos[tri[0]],
        b = poly.pos[tri[1]],
        c = poly.pos[tri[2]];
      e1.subVectors(b, a);
      e2.subVectors(c, a);
      pv.crossVectors(d, e2);
      const det = e1.dot(pv);
      if (Math.abs(det) < 1e-12) continue;
      const inv = 1 / det;
      tv.subVectors(origin, a);
      const u = tv.dot(pv) * inv;
      if (u < 0 || u > 1) continue;
      qv.crossVectors(tv, e1);
      const v = d.dot(qv) * inv;
      if (v < 0 || u + v > 1) continue;
      const t = e2.dot(qv) * inv;
      if (t > 1e-6 && (!best || t < best.t)) {
        const n = new THREE.Vector3().crossVectors(e1, e2).normalize();
        best = { t, point: origin.clone().addScaledVector(d, t), normal: n };
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Geometry assembly
// ---------------------------------------------------------------------------

function triangulateFace(poly, ids) {
  if (ids.length === 3) return [ids];
  if (ids.length === 4) {
    const [a, b, c, d] = ids;
    const P = poly.pos;
    const ac = P[a].distanceToSquared(P[c]);
    const bd = P[b].distanceToSquared(P[d]);
    return ac <= bd ? [[a, b, c], [a, c, d]] : [[a, b, d], [b, c, d]];
  }
  const out = [];
  for (let i = 1; i < ids.length - 1; i++) out.push([ids[0], ids[i], ids[i + 1]]);
  return out;
}

/**
 * Build a flat-shaded, non-indexed geometry from polys.
 * slotOrder: array of material slot names (group i uses material i).
 * boneIndex: map boneName -> index (omit for static meshes).
 * Returns { geometry, slots } where slots lists the slot per group.
 */
export function buildGeometry(polys, { slotOrder = null, boneIndex = null } = {}) {
  const bySlot = new Map();
  for (const poly of polys) {
    for (const face of poly.faces) {
      if (!bySlot.has(face.mat)) bySlot.set(face.mat, []);
      for (const tri of triangulateFace(poly, face.ids)) bySlot.get(face.mat).push([poly, tri]);
    }
  }
  const slots = (slotOrder || [...bySlot.keys()]).filter((s) => bySlot.has(s));
  for (const s of bySlot.keys()) if (!slots.includes(s)) slots.push(s);

  let triCount = 0;
  for (const s of slots) triCount += bySlot.get(s).length;
  const position = new Float32Array(triCount * 9);
  const normal = new Float32Array(triCount * 9);
  const skinIndex = boneIndex ? new Uint16Array(triCount * 12) : null;
  const skinWeight = boneIndex ? new Float32Array(triCount * 12) : null;
  const geometry = new THREE.BufferGeometry();
  let t = 0;
  for (let g = 0; g < slots.length; g++) {
    const list = bySlot.get(slots[g]);
    geometry.addGroup(t * 3, list.length * 3, g);
    for (const [poly, tri] of list) {
      const p0 = poly.pos[tri[0]],
        p1 = poly.pos[tri[1]],
        p2 = poly.pos[tri[2]];
      _a.subVectors(p1, p0);
      _b.subVectors(p2, p0);
      _c.crossVectors(_a, _b);
      const len = _c.length();
      if (len > 0) _c.multiplyScalar(1 / len);
      for (let k = 0; k < 3; k++) {
        const p = poly.pos[tri[k]];
        const o = t * 9 + k * 3;
        position[o] = p.x;
        position[o + 1] = p.y;
        position[o + 2] = p.z;
        normal[o] = _c.x;
        normal[o + 1] = _c.y;
        normal[o + 2] = _c.z;
        if (boneIndex) {
          const sk = poly.skin[tri[k]];
          if (!sk) throw new Error('Vertex without skin binding in skinned geometry');
          const sorted = sk.slice().sort((x, y) => y[1] - x[1]).slice(0, 4);
          let sum = 0;
          for (const s of sorted) sum += s[1];
          for (let w = 0; w < 4; w++) {
            const so = t * 12 + k * 4 + w;
            if (w < sorted.length) {
              const bi = boneIndex[sorted[w][0]];
              if (bi === undefined) throw new Error('Unknown bone ' + sorted[w][0]);
              skinIndex[so] = bi;
              skinWeight[so] = sorted[w][1] / sum;
            }
          }
        }
      }
      t++;
    }
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  if (boneIndex) {
    geometry.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
    geometry.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { geometry, slots, triangles: triCount };
}
