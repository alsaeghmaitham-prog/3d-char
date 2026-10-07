// Poses are solved procedurally: body bones get simple rotations, legs and
// arms are placed with two-bone IK (feet on the ground, hands on the weapon
// grips) and the weapon socket is computed from the solved right hand.
import * as THREE from 'three';
import { quatFromAxes } from './rig.js';
import { remapY } from './proportions.js';
import { WEAPONS } from './parts/weapons.js';

const D = THREE.MathUtils.degToRad;
const V = (a) => new THREE.Vector3(...a);
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);

export const POSES = {
  ready: {
    label: 'Rifle ready (reference)',
    hips: { pos: [0, remapY(0.842), 0.0], rot: [2, 0, 0] },
    spine: [3, 0, 0],
    chest: [5, 0, 0],
    neck: [-5, 0, 0],
    head: [-4, 0, 0],
    // collarbones angled down: sloping shoulders, not a square shelf
    shoulders: { Left: [0, -3, -7], Right: [0, 3, 7] },
    feet: { Left: { pos: [0.228, 0.03], yaw: 9 }, Right: { pos: [-0.228, -0.012], yaw: -11 } },
    knees: { Left: [0.3, 0, 1], Right: [-0.3, 0, 1] },
    weapon: { origin: [-0.04, remapY(0.99), 0.285], dir: [0.683, -0.631, 0.368], roll: 40 },
    elbows: { Left: [0.6, -0.3, -0.75], Right: [-0.8, -0.4, -0.5] },
    // right fist wraps the wrist of the stock in line with the forearm, thumb
    // side up; k tilts the fist from "straight wrist" (0) to the stock axis (1)
    wrap: { Right: { thumb: [0, 1, 0], k: 0.25 } },
    unarmed: { Left: [0.29, remapY(0.72), 0.06], Right: [-0.29, remapY(0.72), 0.06] },
  },
  aim: {
    label: 'Aiming',
    // bladed stance: torso turned right, left shoulder towards the target,
    // head turned back to the target and laid on the stock
    hips: { pos: [0, remapY(0.83), 0.0], rot: [3, -20, 0] },
    spine: [3, -8, 0],
    chest: [5, -8, 0],
    neck: [11, 14, 6],
    head: [2, 20, 14],
    shoulders: { Left: [0, -6, -5], Right: [0, -4, -12] }, // firing shoulder raised to the cheek
    feet: { Left: { pos: [0.13, 0.2], yaw: -18 }, Right: { pos: [-0.2, -0.17], yaw: -62 } },
    knees: { Left: [0.2, 0, 1], Right: [-0.4, 0, 1] },
    // butt plate bedded in the right shoulder pocket (offset from the shoulder
    // joint in the chest's frame), rifle level and pointing at the target
    weapon: { shoulder: [0.15, -0.035, 0.105], origin: [-0.135, remapY(1.37), 0.27], dir: [0.0, 0.01, 1], roll: 0 },
    elbows: { Left: [0.25, -1, -0.15], Right: [-0.7, -0.7, -0.25] },
    unarmed: { Left: [0.29, remapY(0.72), 0.06], Right: [-0.29, remapY(0.72), 0.06] },
  },
  relaxed: {
    label: 'Relaxed',
    hips: { pos: [0, remapY(0.855), 0.0], rot: [0, 0, 0] },
    spine: [1, 0, 0],
    chest: [2, 0, 0],
    neck: [0, 0, 0],
    head: [2, 0, 0],
    shoulders: { Left: [0, 0, -7], Right: [0, 0, 7] },
    feet: { Left: { pos: [0.16, 0.0], yaw: 8 }, Right: { pos: [-0.16, 0.0], yaw: -8 } },
    knees: { Left: [0.1, 0, 1], Right: [-0.1, 0, 1] },
    weapon: { origin: [-0.31, remapY(0.83), 0.07], dir: [0.0, 0.97, 0.24], roll: 90, oneHand: true },
    elbows: { Left: [0.3, -0.2, -1], Right: [-0.3, -0.2, -1] },
    unarmed: { Left: [0.3, remapY(0.73), 0.05], Right: [-0.3, remapY(0.73), 0.05] },
  },
  bind: { label: 'A-pose (bind)', bind: true },
};

/** World rotation for a hand given finger direction and palm normal. */
export function handQuat(side, fingers, normal) {
  const f = side === 'Left' ? fingers.clone() : fingers.clone().negate();
  return quatFromAxes(X, Y, f, normal.clone().negate());
}

const CONTACT = {
  Left: new THREE.Vector3(0.056, -0.027, 0),
  Right: new THREE.Vector3(-0.056, -0.027, 0),
};

/** Weapon frame for a pose: a fixed placement, or the butt in the shoulder. */
function weaponFrame(rig, W, wp) {
  if (!wp.shoulder || !W.butt) return weaponMatrix(wp);
  const M = weaponMatrix({ ...wp, origin: [0, 0, 0] });
  const pocket = rig.worldPos('RightUpperArm').add(V(wp.shoulder).applyQuaternion(rig.getWorldQuat('Chest')));
  M.setPosition(pocket.sub(W.butt.clone().applyMatrix4(M)));
  return M;
}

export function weaponMatrix(w) {
  const z = V(w.dir).normalize();
  const y = new THREE.Vector3(0, 1, 0).addScaledVector(z, -z.y);
  if (y.lengthSq() < 1e-6) y.set(0, 0, -1);
  y.normalize().applyAxisAngle(z, D(w.roll || 0));
  const x = new THREE.Vector3().crossVectors(y, z);
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(V(w.origin));
}

function curlFingers(rig, side, curl) {
  const s = side === 'Left' ? -1 : 1;
  rig.rotate(`${side}Fingers1`, 0, 0, s * curl.f1);
  rig.rotate(`${side}Fingers2`, 0, 0, s * curl.f2);
  const [tx, ty, tz] = curl.t1;
  rig.rotate(`${side}Thumb1`, tx, s * -ty, s * -tz);
  rig.rotate(`${side}Thumb2`, 0, s * -curl.t2 * 0.4, s * -curl.t2);
}

const RELAXED_CURL = { f1: 28, f2: 32, t1: [0, 10, 10], t2: 15 };

/**
 * Solve a pose on a soldier. `opts.weaponOverride` may provide a weapon
 * placement (used by animation clips).
 */
export function applyPose(soldier, poseId, opts = {}) {
  const rig = soldier.rig;
  const P = POSES[poseId] || POSES.ready;
  soldier.poseInfo = {};
  rig.resetPose();
  if (P.bind) {
    soldier.weaponSocket.visible = false;
    return;
  }
  soldier.weaponSocket.visible = true;
  const hips = rig.bone('Hips');
  const hp = opts.hipsPos || P.hips.pos;
  hips.position.set(hp[0], hp[1], hp[2]);
  const hr = opts.hipsRot || P.hips.rot;
  hips.quaternion.setFromEuler(new THREE.Euler(D(hr[0]), D(hr[1]), D(hr[2])));
  const body = opts.body || {};
  rig.rotate('Spine', ...(body.spine || P.spine));
  rig.rotate('Chest', ...(body.chest || P.chest));
  rig.rotate('Neck', ...(body.neck || P.neck));
  rig.rotate('Head', ...(body.head || P.head));
  for (const side of ['Left', 'Right']) rig.rotate(`${side}Shoulder`, ...P.shoulders[side]);
  rig.root.updateMatrixWorld(true);

  // legs
  for (const side of ['Left', 'Right']) {
    const f = (opts.feet && opts.feet[side]) || P.feet[side];
    const lift = f.lift || 0;
    const pitch = f.pitch || 0;
    const footQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(D(pitch), D(f.yaw), 0, 'YXZ'));
    // ankle sits above the sole; account for heel/toe pitch around the sole contact
    const ankleOffset = rig.bindWorld[`${side}Foot`].clone().setX(0).applyQuaternion(footQ);
    const ankle = new THREE.Vector3(f.pos[0], lift, f.pos[1]).add(ankleOffset);
    rig.solveTwoBone(`${side}UpperLeg`, `${side}LowerLeg`, `${side}Foot`, ankle, V(P.knees[side]), X);
    rig.setWorldQuat(`${side}Foot`, footQ);
  }

  // weapon + hands
  const weaponId = soldier.loadout.weapon;
  const W = weaponId ? WEAPONS[weaponId] : null;
  const wp = opts.weapon || P.weapon;
  if (W) {
    const M = weaponFrame(rig, W, wp);
    const sides = wp.oneHand ? ['Right'] : ['Right', 'Left'];
    for (const side of sides) {
      const g = W.grips[side.toLowerCase()];
      const pole = V(P.elbows[side]);
      const wrap = P.wrap && P.wrap[side] && g.wrap ? P.wrap[side] : null;
      const { q, ik } = wrap !== null ? wrapGrip(rig, side, M, g, pole, wrap) : fixedGrip(rig, side, M, g, pole);
      soldier.poseInfo[side] = ik.reach;
      rig.setWorldQuat(`${side}Hand`, q);
      curlFingers(rig, side, wrap !== null ? g.wrapCurl || g.curl : g.curl);
    }
    if (wp.oneHand) relaxedArm(rig, 'Left', P);
    const hand = rig.bone('RightHand');
    hand.updateMatrixWorld(true);
    const local = hand.matrixWorld.clone().invert().multiply(M);
    local.decompose(soldier.weaponSocket.position, soldier.weaponSocket.quaternion, soldier.weaponSocket.scale);
  } else {
    relaxedArm(rig, 'Left', P);
    relaxedArm(rig, 'Right', P);
  }
  rig.root.updateMatrixWorld(true);
}

function armIK(rig, side, wrist, pole) {
  return rig.solveTwoBone(`${side}UpperArm`, `${side}LowerArm`, `${side}Hand`, wrist, pole, side === 'Left' ? Y.clone().negate() : Y);
}

/** Hand placed by the weapon's fixed grip frame (point, palm normal, fingers). */
function fixedGrip(rig, side, M, g, pole) {
  const pt = g.point.clone().applyMatrix4(M);
  const nrm = g.normal.clone().transformDirection(M);
  const fing = g.fingers.clone().normalize().transformDirection(M);
  const q = handQuat(side, fing, nrm);
  const ik = armIK(rig, side, pt.sub(CONTACT[side].clone().applyQuaternion(q)), pole);
  return { q, ik };
}

/**
 * Fist wrapped around a round part of the weapon (the wrist of a stock). The
 * hand continues the forearm, rolled so its thumb side faces `opts.thumb`
 * (world), then tilted by `opts.k` towards the part's own axis. Iterates
 * because the forearm direction depends on where the hand ends up.
 */
function wrapGrip(rig, side, M, g, pole, opts) {
  const w = g.wrap;
  const C = w.center.clone().applyMatrix4(M);
  const axis = w.thumb.clone().normalize().transformDirection(M);
  const hint = V(opts.thumb).normalize();
  let q = handQuat(side, g.fingers.clone().normalize().transformDirection(M), g.normal.clone().transformDirection(M));
  const elbow = new THREE.Vector3();
  const wristPos = new THREE.Vector3();
  const place = () => {
    const N = new THREE.Vector3(0, -1, 0).applyQuaternion(q);
    const wrist = C.clone().addScaledVector(N, -w.radius).sub(CONTACT[side].clone().applyQuaternion(q));
    return armIK(rig, side, wrist, pole);
  };
  for (let it = 0; it < 12; it++) {
    place();
    rig.worldPos(`${side}LowerArm`, elbow);
    rig.worldPos(`${side}Hand`, wristPos);
    const d = wristPos.sub(elbow).normalize();
    const Z = hint.clone().addScaledVector(d, -hint.dot(d)).normalize();
    const A = axis.clone().multiplyScalar(Math.sign(axis.dot(Z)) || 1);
    Z.lerp(A, opts.k ?? 0).normalize();
    const F = d.clone().addScaledVector(Z, -d.dot(Z)).normalize();
    const N = side === 'Right' ? new THREE.Vector3().crossVectors(Z, F) : new THREE.Vector3().crossVectors(F, Z);
    q = handQuat(side, F, N);
  }
  return { q, ik: place() };
}

function relaxedArm(rig, side, P) {
  const s = side === 'Left' ? 1 : -1;
  const target = V(P.unarmed[side]);
  rig.solveTwoBone(`${side}UpperArm`, `${side}LowerArm`, `${side}Hand`, target, new THREE.Vector3(0.3 * s, 0, -1), side === 'Left' ? Y.clone().negate() : Y);
  // palm facing the thigh, fingers down
  const q = handQuat(side, new THREE.Vector3(0.0, -1, 0.12), new THREE.Vector3(-s, 0, 0.1));
  rig.setWorldQuat(`${side}Hand`, q);
  curlFingers(rig, side, RELAXED_CURL);
}
