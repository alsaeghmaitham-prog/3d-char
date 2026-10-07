// Feet slot items: boots (shaft on the shin bone, foot on Foot/Toes bones).
import * as THREE from 'three';
import { Poly, loft, axisTube, smooth, clamp } from '../lowpoly.js';
import { DIM } from '../rig.js';

const footWeights = (side) => (p) => {
  const t = smooth(clamp((p.z - 0.105) / 0.05, 0, 1));
  if (t <= 0) return [[`${side}Foot`, 1]];
  if (t >= 1) return [[`${side}Toes`, 1]];
  return [
    [`${side}Foot`, 1 - t],
    [`${side}Toes`, t],
  ];
};

// Cross section of the boot upper, CCW seen from the toe (+Z).
function upperSection(z, w, yb, ys, yt, top = 0.27) {
  return [
    new THREE.Vector3(w / 2, yb, z),
    new THREE.Vector3(w / 2, ys, z),
    new THREE.Vector3(w * top, yt, z),
    new THREE.Vector3(-w * top, yt, z),
    new THREE.Vector3(-w / 2, ys, z),
    new THREE.Vector3(-w / 2, yb, z),
  ];
}

function soleSection(z, w, yb, yt) {
  const c = 0.006;
  return [
    new THREE.Vector3(w / 2 - c, yb, z),
    new THREE.Vector3(w / 2, yb + c, z),
    new THREE.Vector3(w / 2, yt, z),
    new THREE.Vector3(-w / 2, yt, z),
    new THREE.Vector3(-w / 2, yb + c, z),
    new THREE.Vector3(-w / 2 + c, yb, z),
  ];
}

function bootFoot(side, { shaftTop = 0.292, shaftR = [0.074, 0.083], gaiter = false } = {}) {
  const boot = new Poly('leather');
  // upper
  const sections = [
    upperSection(-0.1, 0.1, 0.032, 0.094, 0.11),
    upperSection(-0.07, 0.124, 0.03, 0.118, 0.134),
    upperSection(0.02, 0.134, 0.028, 0.119, 0.141),
    upperSection(0.09, 0.14, 0.028, 0.093, 0.117),
    upperSection(0.15, 0.142, 0.028, 0.077, 0.094),
    upperSection(0.205, 0.133, 0.028, 0.07, 0.082),
    upperSection(0.233, 0.104, 0.03, 0.062, 0.067),
  ];
  const upper = loft(sections, { mat: 'leather' });
  upper.jitter(0.0025, 61, [1, 1, 0.6]);
  upper.translate(0, 0, -0.005);
  upper.skinBy(footWeights(side === 'Right' ? 'Right' : 'Left'));
  // sole with heel block and raised arch
  const soles = [
    soleSection(-0.106, 0.104, 0.0, 0.035),
    soleSection(-0.016, 0.13, 0.0, 0.035),
    soleSection(-0.012, 0.13, 0.014, 0.032),
    soleSection(0.04, 0.142, 0.014, 0.031),
    soleSection(0.045, 0.144, 0.0, 0.031),
    soleSection(0.206, 0.14, 0.0, 0.031),
    soleSection(0.241, 0.11, 0.002, 0.033),
  ];
  const sole = loft(soles, { mat: 'sole' });
  sole.translate(0, 0, -0.005);
  sole.skinBy(footWeights(side === 'Right' ? 'Right' : 'Left'));
  boot.add(upper);
  boot.add(sole);
  // shaft around the shin
  const shaft = axisTube(
    [
      [0.098, shaftR[0] - 0.002, shaftR[1] - 0.002],
      [0.2, shaftR[0], shaftR[1]],
      [shaftTop, shaftR[0] + 0.007, shaftR[1] + 0.007],
      [shaftTop + 0.004, shaftR[0] - 0.006, shaftR[1] - 0.006],
      [shaftTop - 0.02, shaftR[0] - 0.01, shaftR[1] - 0.01],
    ],
    { n: 8, mat: gaiter ? 'webbing' : 'leather', phase: Math.PI / 8 },
  );
  shaft.translate(0, 0, -0.008);
  shaft.jitter(0.003, 62, [1, 0.4, 1], (p) => p.y < shaftTop - 0.003);
  shaft.bone(`${side}LowerLeg`);
  boot.add(shaft);
  if (gaiter) {
    // buckled straps on the canvas gaiter
    for (const y of [0.15, 0.235]) {
      const band = axisTube(
        [
          [y - 0.012, shaftR[0] + 0.004, shaftR[1] + 0.004],
          [y + 0.012, shaftR[0] + 0.005, shaftR[1] + 0.005],
        ],
        { n: 8, mat: 'leather', phase: Math.PI / 8 },
      );
      band.translate(0, 0, -0.008).bone(`${side}LowerLeg`);
      boot.add(band);
    }
  }
  boot.translate(DIM.hipX, 0, 0);
  if (side === 'Right') boot.mirrorX();
  return boot;
}

export function buildBoots() {
  const p = new Poly('leather');
  p.add(bootFoot('Left'));
  p.add(bootFoot('Right'));
  return p;
}

export function buildGaiterBoots() {
  const p = new Poly('leather');
  p.add(bootFoot('Left', { gaiter: true, shaftTop: 0.3, shaftR: [0.08, 0.088] }));
  p.add(bootFoot('Right', { gaiter: true, shaftTop: 0.3, shaftR: [0.08, 0.088] }));
  return p;
}

export const FOOTWEAR = {
  boots: { label: 'Field boots', build: buildBoots },
  gaiters: { label: 'Boots + gaiters', build: buildGaiterBoots },
};
