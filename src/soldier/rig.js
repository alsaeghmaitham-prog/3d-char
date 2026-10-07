// Humanoid skeleton (T-pose bind, identity bone rotations) + posing helpers.
//
// Bone names follow the common humanoid convention (Hips, Spine, Chest, Neck,
// Head, LeftShoulder, LeftUpperArm, LeftLowerArm, LeftHand, LeftUpperLeg,
// LeftLowerLeg, LeftFoot, LeftToes ...) so Unity's Humanoid avatar, Unreal's
// IK retargeter and Godot's SkeletonProfileHumanoid can auto-map them.
import * as THREE from 'three';

export const DIM = {
  shoulderX: 0.25,
  shoulderY: 1.29,
  upperArm: 0.345,
  lowerArm: 0.3,
  palm: 0.1,
  finger1: 0.05,
  hipX: 0.132,
  hipY: 0.8,
  kneeY: 0.47,
  ankleY: 0.115,
};

export function boneDefs() {
  const d = DIM;
  const defs = [
    ['Root', null, [0, 0, 0]],
    ['Hips', 'Root', [0, 0.86, 0]],
    ['Spine', 'Hips', [0, 0.98, 0]],
    ['Chest', 'Spine', [0, 1.12, 0]],
    ['Neck', 'Chest', [0, 1.335, -0.01]],
    ['Head', 'Neck', [0, 1.42, 0]],
  ];
  for (const [side, s] of [
    ['Left', 1],
    ['Right', -1],
  ]) {
    const sx = d.shoulderX * s;
    const ex = sx + d.upperArm * s;
    const wx = ex + d.lowerArm * s;
    const kx = wx + d.palm * s;
    defs.push(
      [`${side}Shoulder`, 'Chest', [0.055 * s, 1.29, -0.01]],
      [`${side}UpperArm`, `${side}Shoulder`, [sx, d.shoulderY, 0]],
      [`${side}LowerArm`, `${side}UpperArm`, [ex, d.shoulderY, 0]],
      [`${side}Hand`, `${side}LowerArm`, [wx, d.shoulderY, 0]],
      [`${side}Fingers1`, `${side}Hand`, [kx, d.shoulderY - 0.004, 0]],
      [`${side}Fingers2`, `${side}Fingers1`, [kx + d.finger1 * s, d.shoulderY - 0.004, 0]],
      [`${side}Thumb1`, `${side}Hand`, [wx + 0.024 * s, d.shoulderY - 0.013, 0.04]],
      [`${side}Thumb2`, `${side}Thumb1`, [wx + 0.056 * s, d.shoulderY - 0.017, 0.073]],
    );
  }
  for (const [side, s] of [
    ['Left', 1],
    ['Right', -1],
  ]) {
    const x = d.hipX * s;
    defs.push(
      [`${side}UpperLeg`, 'Hips', [x, d.hipY, 0]],
      [`${side}LowerLeg`, `${side}UpperLeg`, [x, d.kneeY, 0]],
      [`${side}Foot`, `${side}LowerLeg`, [x, d.ankleY, -0.01]],
      [`${side}Toes`, `${side}Foot`, [x, 0.035, 0.135]],
    );
  }
  return defs;
}

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _v = new THREE.Vector3();

/** Rotation that maps local axes (a1, a2) onto world axes (w1, w2). */
export function quatFromAxes(a1, a2, w1, w2, target = new THREE.Quaternion()) {
  const A1 = a1.clone().normalize();
  const A2 = a2.clone().addScaledVector(A1, -a2.dot(A1)).normalize();
  const A3 = new THREE.Vector3().crossVectors(A1, A2);
  const W1 = w1.clone().normalize();
  const W2 = w2.clone().addScaledVector(W1, -w2.dot(W1)).normalize();
  const W3 = new THREE.Vector3().crossVectors(W1, W2);
  _m.makeBasis(A1, A2, A3);
  _m2.makeBasis(W1, W2, W3);
  _m.transpose();
  _m2.multiply(_m);
  return target.setFromRotationMatrix(_m2);
}

export class Rig {
  constructor() {
    this.bones = [];
    this.byName = {};
    this.bindWorld = {};
    for (const [name, parent, pos] of boneDefs()) {
      const b = new THREE.Bone();
      b.name = name;
      const w = new THREE.Vector3(...pos);
      this.bindWorld[name] = w;
      if (parent) {
        this.byName[parent].add(b);
        b.position.copy(w).sub(this.bindWorld[parent]);
      } else b.position.copy(w);
      b.userData.bindPosition = b.position.clone();
      this.bones.push(b);
      this.byName[name] = b;
    }
    this.root = this.byName.Root;
    this.boneIndex = {};
    this.bones.forEach((b, i) => (this.boneIndex[b.name] = i));
    this.skeleton = null;
  }

  bone(name) {
    const b = this.byName[name];
    if (!b) throw new Error('No bone ' + name);
    return b;
  }

  /** Put every bone back to the T-pose bind configuration. */
  resetPose() {
    for (const b of this.bones) {
      b.position.copy(b.userData.bindPosition);
      b.quaternion.identity();
      b.scale.set(1, 1, 1);
    }
    this.root.updateMatrixWorld(true);
  }

  /** Must be called with the rig in bind pose and its parent at identity. */
  createSkeleton() {
    this.resetPose();
    this.skeleton = new THREE.Skeleton(this.bones);
    this.skeleton.calculateInverses();
    return this.skeleton;
  }

  worldPos(name, target = new THREE.Vector3()) {
    return this.bone(name).getWorldPosition(target);
  }

  /** Set a bone's world-space rotation (parent rotations already applied). */
  setWorldQuat(name, qWorld) {
    const b = this.bone(name);
    b.parent.getWorldQuaternion(_q);
    b.quaternion.copy(_q.invert().multiply(qWorld));
    b.updateMatrixWorld(true);
  }

  getWorldQuat(name, target = new THREE.Quaternion()) {
    return this.bone(name).getWorldQuaternion(target);
  }

  /** Local Euler rotation helper (degrees, XYZ order). */
  rotate(name, x = 0, y = 0, z = 0, order = 'XYZ') {
    const b = this.bone(name);
    b.quaternion.setFromEuler(new THREE.Euler((x * Math.PI) / 180, (y * Math.PI) / 180, (z * Math.PI) / 180, order));
    b.updateMatrixWorld(true);
  }

  /**
   * Two bone IK. upper -> lower -> end. `target` is where `end`'s origin must
   * land, `pole` a world direction the middle joint should bend towards and
   * `hingeLocal` the local axis about which positive flexion happens.
   */
  solveTwoBone(upper, lower, end, target, pole, hingeLocal) {
    const U = this.bone(upper),
      Lw = this.bone(lower),
      E = this.bone(end);
    U.parent.updateMatrixWorld(true);
    U.updateMatrixWorld(true);
    const S = U.getWorldPosition(new THREE.Vector3());
    const L1 = Lw.userData.bindPosition.length();
    const L2 = E.userData.bindPosition.length();
    const toT = new THREE.Vector3().subVectors(target, S);
    let d = toT.length();
    const u = toT.clone().normalize();
    d = THREE.MathUtils.clamp(d, Math.abs(L1 - L2) + 1e-4, (L1 + L2) * 0.9995);
    const p = pole.clone().addScaledVector(u, -pole.dot(u));
    if (p.lengthSq() < 1e-8) p.set(0, 0, 1).addScaledVector(u, -u.z);
    p.normalize();
    const cosA = THREE.MathUtils.clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
    const sinA = Math.sqrt(1 - cosA * cosA);
    const elbow = S.clone().addScaledVector(u, L1 * cosA).addScaledVector(p, L1 * sinA);
    const tgt = S.clone().addScaledVector(u, d);
    const a = elbow.clone().sub(S).normalize();
    const b = tgt.clone().sub(elbow).normalize();
    let h = new THREE.Vector3().crossVectors(a, b);
    if (h.lengthSq() < 1e-10) h.crossVectors(u, p);
    h.normalize();
    const restU = Lw.userData.bindPosition.clone().normalize();
    const restL = E.userData.bindPosition.clone().normalize();
    this.setWorldQuat(upper, quatFromAxes(restU, hingeLocal, a, h));
    this.setWorldQuat(lower, quatFromAxes(restL, hingeLocal, b, h));
    return { elbow, reach: toT.length() / (L1 + L2) };
  }
}
