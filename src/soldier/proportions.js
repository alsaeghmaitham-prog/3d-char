// Realistic proportions. The parts are modelled at the reference sheet's
// stylised proportions (big head, no neck, short legs, very broad chest);
// this module reshapes the finished meshes and the skeleton into an adult
// build of about 7.3 heads: legs and trunk ~15% longer, head and helmet 20%
// smaller on a 4 cm longer neck, chest a little narrower.
// It runs once on every built part, so gear (including your own) is fitted
// the same way as the body:
//   - anything on the trunk or legs follows a height remap (cloth stretches),
//   - the arm chain moves rigidly with its shoulder joint (arm length and
//     thickness are already right for the taller body),
//   - the head and everything on it scales uniformly about the neck joint,
//   - rigid kit (belt pouches, packs) keeps its size and moves with the body.
import * as THREE from 'three';
import { smooth, clamp } from './lowpoly.js';

// old height -> new height at the joints (ankle, knee, hip, shoulder)
const KEYS = [
  [0.0, 0.0],
  [0.115, 0.12],
  [0.47, 0.535],
  [0.8, 0.915],
  [1.31, 1.5],
];

/** Height remap for the trunk and legs; above the shoulders it is a shift. */
export function remapY(y) {
  if (y <= KEYS[0][0]) return y;
  for (let i = 0; i < KEYS.length - 1; i++) {
    const [a0, b0] = KEYS[i];
    const [a1, b1] = KEYS[i + 1];
    if (y <= a1) return b0 + ((y - a0) * (b1 - b0)) / (a1 - a0);
  }
  const [a, b] = KEYS[KEYS.length - 1];
  return b + (y - a);
}

/** Chest and shoulders a little narrower than the sheet; waist and hem as modelled. */
function widthScale(y) {
  return 1 - 0.06 * smooth(clamp((y - 0.92) / 0.22, 0, 1));
}

export const HEAD_SCALE = 0.8;
const NECK_EXTRA = 0.04; // the chin clears the collar
const NECK_JOINT = new THREE.Vector3(0, 1.435, 0); // Head bone as modelled

const ARM = /^(Left|Right)(UpperArm|LowerArm|Hand|Fingers1|Fingers2|Thumb1|Thumb2)$/;
const SHOULDER_JOINT = 0.25; // DIM.shoulderX / DIM.shoulderY as modelled
const SHOULDER_Y = 1.31;

function trunk(p, out = new THREE.Vector3()) {
  return out.set(p.x * widthScale(p.y), remapY(p.y), p.z);
}

const _j = new THREE.Vector3();
function armShift(side, out = new THREE.Vector3()) {
  const s = side === 'Left' ? 1 : -1;
  _j.set(SHOULDER_JOINT * s, SHOULDER_Y, 0);
  return trunk(_j, out).sub(_j);
}

function head(p, out = new THREE.Vector3()) {
  out.copy(p).sub(NECK_JOINT).multiplyScalar(HEAD_SCALE).add(trunk(NECK_JOINT));
  out.y += NECK_EXTRA;
  return out;
}

/** Where a point moves when it is carried by `bone`. */
export function fitPoint(p, bone, out = new THREE.Vector3()) {
  const m = bone && ARM.exec(bone);
  if (m) return out.copy(p).add(armShift(m[1]));
  if (bone === 'Head') return head(p, out);
  return trunk(p, out);
}

/** New bind position of a bone (positions as modelled, T-pose layout). */
export function fitBone(name, pos) {
  return fitPoint(pos, name, new THREE.Vector3());
}

/** Reshape a skinned part in place: each vertex follows its weighted bones. */
export function fitPoly(poly) {
  const acc = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  poly.pos.forEach((p, i) => {
    const skin = poly.skin[i];
    if (!skin || !skin.length) return p.copy(trunk(p, tmp));
    acc.set(0, 0, 0);
    let sum = 0;
    for (const [bone, w] of skin) {
      acc.addScaledVector(fitPoint(p, bone, tmp), w);
      sum += w;
    }
    p.copy(acc.multiplyScalar(1 / sum));
  });
  return poly;
}

/** Rigid kit: keep its size, move it with the body at `anchor`. */
export function fitRigid(poly, anchor) {
  const a = new THREE.Vector3(...anchor);
  const d = trunk(a).sub(a);
  return poly.translate(d.x, d.y, d.z);
}

/** Apply a gear definition's fit (rigid anchor or skinned). */
export function fitPart(poly, fit) {
  return fit && fit.anchor ? fitRigid(poly, fit.anchor) : fitPoly(poly);
}
