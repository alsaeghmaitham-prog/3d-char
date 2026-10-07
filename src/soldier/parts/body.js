// Body: head, hair, neck, jacket (torso, collar, placket), sleeves, hands and
// trousers. Metres, +Z forward, +X = character's left. Arms and hands are
// modelled straight out along X and then rotated into the rig's A-pose bind.
import * as THREE from 'three';
import { Poly, loft, ellipseRing, axisTube, chamferBox, thickSheet, strap, lerp, smooth, clamp, raycastPoly } from '../lowpoly.js';
import { DIM, quatFromAxes, armBindMatrix } from '../rig.js';

const Z_AXIS = new THREE.Vector3(0, 0, 1);

// ---------------------------------------------------------------------------
// Torso description (shared with gear that sits on the jacket)
// ---------------------------------------------------------------------------

// y, half width, front depth, back depth, centre z, superellipse power
export const TORSO = [
  [0.735, 0.274, 0.182, 0.176, 0.0, 2.5],
  [0.775, 0.262, 0.172, 0.167, 0.0, 2.5],
  [0.835, 0.232, 0.156, 0.151, 0.002, 2.6],
  [0.9, 0.206, 0.142, 0.14, 0.005, 2.7],
  [0.96, 0.202, 0.143, 0.14, 0.008, 2.7],
  [1.06, 0.21, 0.15, 0.144, 0.01, 2.8],
  [1.16, 0.216, 0.155, 0.147, 0.01, 2.7],
  [1.24, 0.218, 0.152, 0.146, 0.004, 2.7],
  [1.31, 0.218, 0.138, 0.137, -0.002, 2.5],
  [1.355, 0.206, 0.118, 0.124, -0.004, 2.4],
];

export function torsoParams(y) {
  const T = TORSO;
  if (y <= T[0][0]) return T[0];
  for (let i = 0; i < T.length - 1; i++) {
    if (y <= T[i + 1][0]) {
      const t = (y - T[i][0]) / (T[i + 1][0] - T[i][0]);
      return T[i].map((v, k) => lerp(v, T[i + 1][k], t));
    }
  }
  return T[T.length - 1];
}

/** Point on the jacket surface. theta: 0 = front, +PI/2 = character's left. */
export function torsoPoint(theta, y, offset = 0) {
  const [, a, bf, bb, cz, pw] = torsoParams(y);
  const s = Math.sin(theta);
  const c = Math.cos(theta);
  const e = 2 / pw;
  const x = Math.sign(s) * Math.pow(Math.abs(s), e) * a;
  const z = Math.sign(c) * Math.pow(Math.abs(c), e) * (c >= 0 ? bf : bb);
  const p = new THREE.Vector3(x, y, cz + z);
  if (offset) p.addScaledVector(torsoNormal(theta, y), offset);
  return p;
}

/** z of the jacket's back surface at (x, y) — used to make packs hug the back. */
export function torsoBackZ(x, y) {
  const [, a, , bb, cz, pw] = torsoParams(Math.min(y, 1.3));
  const u = Math.min(0.999, Math.abs(x) / a);
  return cz - bb * Math.pow(1 - Math.pow(u, pw), 1 / pw);
}

export function torsoNormal(theta, y) {
  const d = 0.004;
  const t1 = torsoPoint(theta + d, y).sub(torsoPoint(theta - d, y));
  const t2 = torsoPoint(theta, y + d).sub(torsoPoint(theta, y - d));
  return new THREE.Vector3().crossVectors(t1, t2).normalize();
}

/** Skin weights for anything glued to the jacket, by height. */
export function torsoWeights(y) {
  if (y <= 0.9) return [['Hips', 1]];
  if (y < 1.0) {
    const t = smooth((y - 0.9) / 0.1);
    return [
      ['Hips', 1 - t],
      ['Spine', t],
    ];
  }
  if (y <= 1.08) return [['Spine', 1]];
  if (y < 1.16) {
    const t = smooth((y - 1.08) / 0.08);
    return [
      ['Spine', 1 - t],
      ['Chest', t],
    ];
  }
  return [['Chest', 1]];
}

/**
 * Skin weights for the jacket and anything lying on it: torsoWeights by
 * height, with the outer shoulders shared with the clavicle bones so the
 * jacket, sleeve tops and straps move together when the shoulders do.
 */
export function jacketWeights(p) {
  const base = torsoWeights(p.y);
  const k = 0.8 * smooth(clamp((Math.abs(p.x) - 0.12) / 0.09, 0, 1)) * smooth(clamp((p.y - 1.2) / 0.12, 0, 1));
  if (k < 1e-3) return base;
  const out = base.map(([b, w]) => [b, w * (1 - k)]);
  out.push([p.x > 0 ? 'LeftShoulder' : 'RightShoulder', k]);
  return out;
}

// Upper torso rings above the shoulder line, as functions of theta.
function superPoint(theta, a, bf, bb, cz, pw, y) {
  const sn = Math.sin(theta);
  const c = Math.cos(theta);
  const e = 2 / pw;
  return new THREE.Vector3(Math.sign(sn) * Math.pow(Math.abs(sn), e) * a, y, cz + Math.sign(c) * Math.pow(Math.abs(c), e) * (c >= 0 ? bf : bb));
}
const TOP_RINGS = [
  // trapezius: broad, nearly level shoulders, a little higher at the sides
  (t) => superPoint(t, 0.176, 0.096, 0.106, -0.006, 2.2, 1.378 + 0.024 * Math.pow(Math.sin(t), 2)),
  (t) => superPoint(t, 0.082, 0.074, 0.08, -0.008, 2, 1.394 + 0.014 * (1 - Math.cos(t))),
];
const PROFILE = [...TORSO.map(([y, a, bf, bb, cz, pw]) => (t) => superPoint(t, a, bf, bb, cz, pw, y)), ...TOP_RINGS];

/**
 * Point + outward normal on the jacket surface at angle theta and height y,
 * valid all the way up to the collar line.
 */
export function torsoSurface(theta, y) {
  const pts = PROFILE.map((f) => f(theta));
  for (let k = 0; k < pts.length - 1; k++) {
    const A = pts[k],
      B = pts[k + 1];
    if ((y >= A.y && y <= B.y) || k === pts.length - 2) {
      const t = THREE.MathUtils.clamp((y - A.y) / Math.max(1e-6, B.y - A.y), 0, 1);
      const p = A.clone().lerp(B, t);
      const radial = new THREE.Vector3(p.x, 0, p.z).normalize();
      const dr = Math.hypot(B.x, B.z) - Math.hypot(A.x, A.z);
      const dy = B.y - A.y;
      const n = radial.multiplyScalar(dy).add(new THREE.Vector3(0, -dr, 0)).normalize();
      return { p, n };
    }
  }
  return { p: pts[pts.length - 1], n: new THREE.Vector3(0, 1, 0) };
}

let _torsoCache = null;
/** The (deterministic) jacket mesh, cached for surface queries by gear. */
export function torsoMesh() {
  if (!_torsoCache) _torsoCache = buildTorso();
  return _torsoCache;
}

export function buildTorso() {
  const N = 12;
  // small twists between rings give diagonal cloth facets instead of a
  // straight-sided tube (the hem, belt line and shoulders stay untwisted)
  const TWIST = [0, 0, 0.05, 0, 0.07, -0.06, 0.05, 0, 0, 0, 0, 0];
  const rings = PROFILE.map((f, k) => {
    const r = [];
    for (let i = 0; i < N; i++) r.push(f((i / N) * Math.PI * 2 + (TWIST[k] || 0)));
    return r;
  });
  // inner lip closing the hem
  const lip = ellipseRing({ n: N, rx: 0.238, rz: 0.158, rzBack: 0.152, y: 0.752, power: 2.5 });
  const poly = loft([lip, ...rings], { mat: 'uniform', start: 'flat', end: 'flat' });
  poly.jitter(0.0012, 11, [1, 0.5, 1], (p) => p.y > 0.745 && p.y < 1.37);
  poly.skinBy(jacketWeights);

  // placket down the centre front
  const ys = [0.74, 0.78, 0.86, 0.96, 1.06, 1.16, 1.24, 1.32];
  const path = ys.map((y) => torsoPoint(0, y, 0.0015));
  const normals = ys.map((y) => torsoNormal(0, y));
  const placket = strap(path, normals, 0.03, 0.0055, { mat: 'uniform' });
  placket.skinBy((p) => torsoWeights(p.y));
  poly.add(placket);
  return poly;
}

// ---------------------------------------------------------------------------
// Collar: big fold-down tunic collar with pointed tips lying on the chest
// ---------------------------------------------------------------------------

const D2R = Math.PI / 180;

/** First hit on the bare jacket, casting from outside towards it. */
function onJacket(origin, dir, lift) {
  const h = raycastPoly(torsoMesh(), origin, dir);
  return h.point.addScaledVector(h.normal, lift);
}

export function buildCollar() {
  const out = new Poly('uniform');
  const T = 0.013; // cloth thickness
  const front = (x, y, lift) => onJacket(new THREE.Vector3(x, y, 0.5), new THREE.Vector3(0, 0, -1), lift);
  const top = (x, z, lift) => onJacket(new THREE.Vector3(x, 1.8, z), new THREE.Vector3(0, -1, 0), lift);
  const ring = (deg, y, r) => new THREE.Vector3(Math.sin(deg * D2R) * r, y, Math.cos(deg * D2R) * r - 0.008);
  // stand: closed band round the neck, level under the jaw, higher at the back
  const standY = (deg) => 1.4 + 0.045 * smooth(clamp((deg - 90) / 90, 0, 1));
  const standR = (deg) => 0.084 + 0.01 * smooth(clamp((deg - 90) / 90, 0, 1));
  const angles = [];
  for (let i = 0; i < 16; i++) angles.push((i / 16) * 360);
  const sd = (deg) => (deg > 180 ? 360 - deg : deg);
  const standTop = angles.map((deg) => ring(deg, standY(sd(deg)), standR(sd(deg))));
  const standBot = angles.map((deg) => ring(deg, torsoSurface(deg * D2R, 1.5).p.y - 0.012, standR(sd(deg)) - 0.004));
  out.add(thickSheet(standTop, standBot, 0.008, (p) => new THREE.Vector3(p.x, 0, p.z + 0.008), { mat: 'uniform', closed: true }));
  // fold-down leaves (left half, mirrored): fold line from the V at the
  // throat up to the stand and round to the back; outer edge from the point
  // on the chest over the shoulder, kept inside the braces
  const fold = [front(0.006, 1.34, T + 0.004), ring(24, standY(24) + 0.004, standR(24) + 0.004), ring(60, standY(60) + 0.004, standR(60) + 0.004), ring(95, standY(95) + 0.004, standR(95) + 0.004), ring(138, standY(138) + 0.004, standR(138) + 0.004), ring(180, standY(180) + 0.004, standR(180) + 0.004)];
  const edge = [front(0.134, 1.305, T + 0.011), front(0.141, 1.356, T + 0.008), top(0.13, 0.03, T + 0.005), top(0.112, -0.03, T + 0.004), top(0.075, -0.084, T + 0.004), top(0, -0.104, T + 0.004)];
  const outward = (p) => new THREE.Vector3(p.x, 0.6, p.z + 0.02).normalize();
  for (const mirror of [false, true]) {
    const m = (row) => row.map((p) => (mirror ? new THREE.Vector3(-p.x, p.y, p.z) : p.clone()));
    out.add(thickSheet(m(fold), m(edge), T, outward, { mat: 'uniform' }));
  }
  // the shirt showing in the V between the leaves, up to the stand
  const v = front(0, 1.332, 0.002);
  const throat = ring(0, standY(0) - 0.004, standR(0) + 0.001);
  const sideL = ring(24, standY(24) - 0.002, standR(24) + 0.002);
  const sideR = sideL.clone().setX(-sideL.x);
  const shirt = new Poly('shirt');
  shirt.f([shirt.vv(v), shirt.vv(sideL), shirt.vv(throat), shirt.vv(sideR)]);
  shirt.orientFrom(new THREE.Vector3(0, 1.3, 0));
  out.add(shirt);
  out.skinBy(jacketWeights);
  return out;
}

// ---------------------------------------------------------------------------
// Head, hair, neck
// ---------------------------------------------------------------------------

export const HEAD_CENTER = new THREE.Vector3(0, 1.543, 0.012);

// yRel, rx, rz front, rz back, cz
const HEAD_RINGS = [
  [-0.152, 0.034, 0.024, 0.02, 0.09],
  [-0.124, 0.094, 0.114, 0.052, 0.0],
  [-0.072, 0.126, 0.128, 0.098, 0.0],
  [-0.02, 0.136, 0.132, 0.128, 0.0],
  [0.04, 0.138, 0.129, 0.14, 0.0],
  [0.1, 0.13, 0.119, 0.138, 0.0],
  [0.145, 0.101, 0.091, 0.11, -0.004],
];

function hairline(theta) {
  const a = Math.abs(Math.atan2(Math.sin(theta), Math.cos(theta)));
  const pts = [
    [0, 0.125],
    [0.7, 0.115],
    [1.57, 0.035],
    [2.45, -0.045],
    [Math.PI, -0.078],
  ];
  for (let i = 0; i < pts.length - 1; i++) {
    if (a <= pts[i + 1][0]) {
      const t = (a - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
      return lerp(pts[i][1], pts[i + 1][1], t);
    }
  }
  return pts[pts.length - 1][1];
}

/** Head surface point helper used by the chin strap. theta 0 = face. */
export function headPoint(theta, yRel, offset = 0) {
  let k = 0;
  while (k < HEAD_RINGS.length - 2 && yRel > HEAD_RINGS[k + 1][0]) k++;
  const A = HEAD_RINGS[k],
    B = HEAD_RINGS[k + 1];
  const t = clamp((yRel - A[0]) / (B[0] - A[0]), 0, 1);
  const r = A.map((v, i) => lerp(v, B[i], t));
  const s = Math.sin(theta),
    c = Math.cos(theta);
  const rr = 1 + offset / Math.max(0.05, Math.hypot(s * r[1], c * (c >= 0 ? r[2] : r[3])));
  return new THREE.Vector3(s * r[1] * rr, yRel, r[4] + c * (c >= 0 ? r[2] : r[3]) * rr).add(HEAD_CENTER);
}

export function buildHead() {
  const N = 10;
  const rings = HEAD_RINGS.map(([y, rx, rzf, rzb, cz]) =>
    ellipseRing({ n: N, rx, rz: rzf, rzBack: rzb, y: HEAD_CENTER.y + y, cz: HEAD_CENTER.z + cz }),
  );
  const top = new THREE.Vector3(0, HEAD_CENTER.y + 0.17, HEAD_CENTER.z - 0.006);
  const head = loft(rings, { mat: 'skin', start: 'flat', end: top });
  // hair: faces above the hairline, slightly puffed out
  const rel = new THREE.Vector3();
  const isHair = (p, margin = 0) => {
    rel.subVectors(p, HEAD_CENTER);
    const th = Math.atan2(rel.x, rel.z);
    return rel.y > hairline(th) + margin;
  };
  const c = new THREE.Vector3();
  for (const f of head.faces) {
    head.faceCenter(f.ids, c);
    if (isHair(c)) f.mat = 'hair';
  }
  head.warp((p) => {
    rel.subVectors(p, HEAD_CENTER);
    if (isHair(p, 0.012)) p.copy(HEAD_CENTER).addScaledVector(rel, 1.055);
  });
  head.jitter(0.0025, 3, [1, 1, 0.6]);

  // nose: small faceted wedge
  const nose = new Poly('skin');
  const o = (x, y, z) => nose.v(x, HEAD_CENTER.y + y, HEAD_CENTER.z + z);
  const nt = o(0, -0.03, 0.127);
  const tip = o(0, -0.094, 0.154);
  const wl = o(0.023, -0.1, 0.118);
  const wr = o(-0.023, -0.1, 0.118);
  const un = o(0, -0.109, 0.126);
  const back = new THREE.Vector3(0, HEAD_CENTER.y - 0.07, HEAD_CENTER.z + 0.08);
  nose.f([nt, wl, tip]).f([nt, tip, wr]).f([wl, un, tip]).f([tip, un, wr]).f([nt, wr, un, wl]);
  nose.orientFrom(back);
  head.add(nose);
  head.bone('Head');
  return head;
}

export function buildNeck() {
  const neck = axisTube(
    [
      [1.28, 0.061, 0.058, 0, -0.006],
      [1.35, 0.064, 0.061, 0, -0.008],
      [1.44, 0.06, 0.058, 0, -0.004],
      [1.475, 0.045, 0.045, 0, 0],
    ],
    { n: 8, mat: 'skin' },
  );
  neck.skinBy((p) => {
    if (p.y < 1.33) return [['Chest', 1]];
    if (p.y < 1.415) return [['Neck', 1]];
    return [['Head', 1]];
  });
  return neck;
}

// ---------------------------------------------------------------------------
// Arms and hands (built for the left side, mirrored for the right)
// ---------------------------------------------------------------------------

function sideify(poly, side) {
  if (side === 'Right') poly.mirrorX();
  return poly;
}

/**
 * Skin weights along the sleeve: where it is buried in the jacket it moves
 * exactly like the jacket around it (chest + clavicle), then blends into the
 * upper arm and, across the elbow, into the forearm.
 */
function sleeveWeights(side, s, p) {
  const E = DIM.upperArm;
  const a = smooth(clamp((s - 0.005) / 0.115, 0, 1));
  const b = smooth(clamp((s - (E - 0.05)) / 0.1, 0, 1));
  const out = [];
  if (a < 1) for (const [bone, w] of jacketWeights(p)) out.push([bone, w * (1 - a)]);
  out.push([`${side}UpperArm`, a * (1 - b)], [`${side}LowerArm`, b]);
  return out.filter(([, w]) => w > 1e-3);
}

/**
 * One continuous sleeve from inside the jacket's shoulder to the cuff. The
 * top rings blend from the clavicle bone into the arm (no ball cap at the
 * shoulder) and the elbow blends upper arm -> forearm with a small fold.
 */
export function buildSleeve(side) {
  const E = DIM.upperArm;
  const L = DIM.upperArm + DIM.lowerArm;
  const p = axisTube(
    [
      [-0.095, 0.058, 0.06],
      [-0.055, 0.066, 0.066],
      [-0.015, 0.07, 0.069],
      [0.035, 0.072, 0.07],
      [0.12, 0.07, 0.068],
      [0.22, 0.067, 0.065, 0, 0, 0.12],
      [E - 0.045, 0.064, 0.062, 0, 0, 0.04],
      [E, 0.066, 0.064],
      [E + 0.045, 0.061, 0.059],
      [E + 0.12, 0.058, 0.056, 0, 0, -0.14],
      [L - 0.08, 0.054, 0.052],
      [L - 0.068, 0.059, 0.057],
      [L - 0.008, 0.058, 0.056],
      [L - 0.002, 0.046, 0.044],
      [L - 0.03, 0.042, 0.04],
    ],
    { n: 10, mat: 'uniform', phase: Math.PI / 10 },
  );
  p.warp((q) => {
    // elbow: the point bulges out at the back, the inside creases
    const k = Math.max(0, 1 - Math.abs(q.y - E) / 0.05);
    if (k > 0) q.z = q.z < 0 ? q.z - 0.008 * k : q.z * (1 - 0.14 * k);
  });
  p.jitter(0.001, 21, [1, 0.4, 1], (q) => q.y < L - 0.012);
  const along = p.pos.map((q) => q.y);
  p.rotateZ(-Math.PI / 2).translate(DIM.shoulderX, DIM.shoulderY, 0);
  // Bend into the A-pose around the shoulder: the inner end stays level and
  // its top becomes the top of the shoulder, so the sleeve rolls over the
  // joint into the arm instead of ending in a cap.
  const full = armBindMatrix('Left');
  const pivot = new THREE.Vector3(DIM.shoulderX, DIM.shoulderY, 0);
  p.warp((q) => {
    const t = smooth(clamp((q.x - DIM.shoulderX + 0.07) / 0.15, 0, 1));
    if (t >= 1) return q.applyMatrix4(full);
    if (t <= 0) return q;
    q.sub(pivot).applyAxisAngle(Z_AXIS, (-t * DIM.armDrop * Math.PI) / 180).add(pivot);
  });
  sideify(p, side);
  return p.skinBy((q, i) => sleeveWeights(side, along[i], q));
}

function boxAlong(len, thick, width, chamfer, from, dir, up, mat) {
  const b = chamferBox(len, thick, width, chamfer, { mat });
  b.translate(len / 2, 0, 0);
  const q = quatFromAxes(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), dir, up);
  b.apply(new THREE.Matrix4().makeRotationFromQuaternion(q));
  b.translate(from.x, from.y, from.z);
  return b;
}

export function buildHand(side) {
  const hand = new Poly('skin');
  const W = DIM.shoulderX + DIM.upperArm + DIM.lowerArm;
  const Y = DIM.shoulderY;
  const wrist = axisTube(
    [
      [-0.055, 0.029, 0.033],
      [0.02, 0.031, 0.035],
    ],
    { n: 6, mat: 'skin', phase: Math.PI / 6 },
  );
  wrist.rotateZ(-Math.PI / 2).translate(W, Y, 0).bone('Hand');
  hand.add(wrist);

  const palm = chamferBox(0.106, 0.052, 0.104, 0.013, { mat: 'skin' });
  palm.warp((p) => {
    // slightly thicker at the heel of the hand, domed back
    if (p.y > 0) p.y += 0.004 * (1 - Math.abs(p.z) / 0.05);
    if (p.x < 0) p.y -= 0.003;
  });
  palm.translate(W + 0.05, Y, 0).bone('Hand');
  hand.add(palm);

  const fingerZ = [0.0381, 0.0127, -0.0127, -0.0381];
  const fingerLen = [0.96, 1.0, 0.96, 0.84];
  const X = new THREE.Vector3(1, 0, 0);
  const UP = new THREE.Vector3(0, 1, 0);
  fingerZ.forEach((z, k) => {
    const sc = fingerLen[k];
    const base = new THREE.Vector3(W + DIM.palm - 0.006, Y - 0.004, z);
    const prox = boxAlong(0.054 * sc + 0.006, 0.029, 0.0236, 0.006, base, X, UP, 'skin');
    prox.bone('Fingers1');
    const mid = new THREE.Vector3(W + DIM.palm + DIM.finger1 - 0.004, Y - 0.004, z);
    const dist = boxAlong(0.046 * sc + 0.004, 0.027, 0.0226, 0.006, mid, X, UP, 'skin');
    dist.bone('Fingers2');
    hand.add(prox);
    hand.add(dist);
  });

  const t1 = new THREE.Vector3(W + 0.024, Y - 0.013, 0.04);
  const t2 = new THREE.Vector3(W + 0.056, Y - 0.017, 0.073);
  const dir = t2.clone().sub(t1).normalize();
  const thumb1 = boxAlong(0.055, 0.032, 0.034, 0.007, t1.clone().addScaledVector(dir, -0.012), dir, UP, 'skin').bone('Thumb1');
  const thumb2 = boxAlong(0.045, 0.029, 0.031, 0.0065, t2.clone().addScaledVector(dir, -0.004), dir, UP, 'skin').bone('Thumb2');
  hand.add(thumb1);
  hand.add(thumb2);
  hand.jitter(0.0012, 7);
  hand.apply(armBindMatrix('Left'));
  if (side === 'Right') hand.mirrorX();
  // prefix bone names with side
  hand.skin = hand.skin.map((s) => s.map(([b, w]) => [`${side}${b}`, w]));
  return hand;
}

// ---------------------------------------------------------------------------
// Trousers
// ---------------------------------------------------------------------------

export function buildLeg(side) {
  // One continuous trouser leg from inside the tunic down to the boot top,
  // bloused over the boot. The knee is blended between the thigh and shin
  // bones, so there is no seam or step when the leg bends.
  const knee = DIM.hipY - DIM.kneeY;
  const p = axisTube(
    [
      [-0.12],
      [-0.08, 0.082, 0.092],
      [0.0, 0.094, 0.112],
      [0.09, 0.105, 0.125],
      [0.2, 0.105, 0.127, 0, 0, 0.22],
      [knee, 0.097, 0.118, 0, 0, -0.1],
      [knee + 0.09, 0.098, 0.116, 0, 0, 0.14],
      [knee + 0.135, 0.107, 0.123, 0, 0, -0.06],
      [knee + 0.15, 0.106, 0.122, 0, 0, -0.06],
      [knee + 0.162, 0.082, 0.088, 0, 0, -0.06],
    ],
    { n: 8, mat: 'uniform', phase: Math.PI / 8 },
  );
  p.warp((q) => {
    // crease behind the knee, a fold across the front of the knee
    const k = Math.max(0, 1 - Math.abs(q.y - knee) / 0.05);
    if (k > 0) q.z *= q.z < 0 ? 1 - 0.08 * k : 1 + 0.03 * k;
  });
  p.skinBy((q) => {
    const t = smooth(clamp((q.y - (knee - 0.045)) / 0.09, 0, 1));
    if (t <= 0) return [[`${side}UpperLeg`, 1]];
    if (t >= 1) return [[`${side}LowerLeg`, 1]];
    return [
      [`${side}UpperLeg`, 1 - t],
      [`${side}LowerLeg`, t],
    ];
  });
  p.rotateZ(Math.PI).translate(DIM.hipX, DIM.hipY, 0);
  return sideify(p, side);
}

export function buildBody() {
  const parts = [buildTorso(), buildCollar(), buildHead(), buildNeck()];
  for (const side of ['Left', 'Right']) {
    parts.push(buildSleeve(side), buildHand(side), buildLeg(side));
  }
  return parts;
}
