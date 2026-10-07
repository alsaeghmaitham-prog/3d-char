// Head slot items. All rigid on the Head bone.
import * as THREE from 'three';
import { Poly, lathe, strap, axisTube, thickSheet } from '../lowpoly.js';
import { HEAD_CENTER, headPoint } from './body.js';

const BRIM_Y = 1.566;

function placeOnHead(poly, tiltDeg = 3, y = BRIM_Y, z = 0.002) {
  poly.rotateX(THREE.MathUtils.degToRad(tiltDeg));
  poly.translate(0, y, z);
  return poly;
}

function chinStrap(fromY = 0.03, theta = 1.42) {
  const pts = [
    [theta, fromY],
    [1.3, -0.035],
    [1.0, -0.09],
    [0.58, -0.132],
    [0.0, -0.157],
    [-0.58, -0.132],
    [-1.0, -0.09],
    [-1.3, -0.035],
    [-theta, fromY],
  ];
  const path = pts.map(([t, y]) => headPoint(t, y, 0.0035));
  const normals = path.map((p) => p.clone().sub(HEAD_CENTER).setY((p.y - HEAD_CENTER.y) * 0.4).normalize());
  return strap(path, normals, 0.015, 0.0045, { mat: 'olive' });
}

/** Faceted kettle/brodie style helmet with wide sloped brim (reference). */
export function buildBrodieHelmet({ strap = true } = {}) {
  const profile = [
    [0.0, 0.238],
    [0.084, 0.214],
    [0.128, 0.148],
    [0.153, 0.062],
    [0.159, 0.002],
    [0.17, -0.012],
    [0.244, -0.026],
    [0.249, -0.009],
    [0.178, 0.003],
    [0.172, 0.006],
    [0.166, 0.07],
    [0.139, 0.142],
    [0.088, 0.208],
    [0.034, 0.25],
    [0.0, 0.264],
  ];
  const shell = lathe(profile, 10, { mat: 'olive', phase: 0 });
  // irregular facets: jitter outer dome & brim a little, keep inside tidy
  shell.jitter(0.0045, 41, [1, 0.6, 1], (p) => p.y > 0.004 || Math.hypot(p.x, p.z) > 0.2);
  shell.warp((p) => {
    // dome slightly longer front-to-back than side-to-side
    p.z *= 1.04;
  });
  placeOnHead(shell, 0);
  const helmet = new Poly('olive');
  helmet.add(shell);
  if (strap) helmet.add(chinStrap());
  return helmet.bone('Head');
}

/** Rounded pot helmet (variant). */
export function buildPotHelmet({ strap = true } = {}) {
  const profile = [
    [0.0, 0.205],
    [0.1, 0.18],
    [0.148, 0.11],
    [0.162, 0.03],
    [0.166, -0.03],
    [0.178, -0.048],
    [0.186, -0.044],
    [0.18, -0.03],
    [0.177, 0.03],
    [0.162, 0.118],
    [0.11, 0.19],
    [0.05, 0.218],
    [0.0, 0.224],
  ];
  const shell = lathe(profile, 12, { mat: 'olive', phase: Math.PI / 12 });
  shell.jitter(0.003, 43, [1, 0.6, 1], (p) => p.y > -0.02);
  shell.warp((p) => {
    p.z *= 1.1;
    // brim lower at the back, slightly raised at the front
    if (p.y < 0.0) p.y -= Math.max(0, -p.z) * 0.12;
  });
  placeOnHead(shell, -2, 1.535, -0.008);
  const helmet = new Poly('olive');
  helmet.add(shell);
  if (strap) helmet.add(chinStrap(0.0, 1.45));
  return helmet.bone('Head');
}

/** Soft field cap with a short peak (variant). */
export function buildFieldCap() {
  const cap = new Poly('olive');
  const crown = axisTube(
    [
      [0.0, 0.142, 0.15],
      [0.05, 0.145, 0.152],
      [0.085, 0.138, 0.15],
      [0.108, 0.1, 0.112],
      [0.115],
    ],
    { n: 12, mat: 'olive', phase: Math.PI / 12 },
  );
  crown.warp((p) => {
    // flattened, slightly forward-leaning crown
    p.z += p.y * 0.12;
  });
  crown.jitter(0.003, 51);
  cap.add(crown);
  // band
  const band = axisTube(
    [
      [-0.006, 0.146, 0.154],
      [0.03, 0.147, 0.155],
    ],
    { n: 12, mat: 'olive', phase: Math.PI / 12, start: false, end: false },
  );
  cap.add(band);
  // peak (visor)
  const peakA = [];
  const peakB = [];
  for (let i = 0; i <= 8; i++) {
    const t = -0.95 + (1.9 * i) / 8;
    peakA.push(new THREE.Vector3(Math.sin(t) * 0.148, 0.004, Math.cos(t) * 0.154));
    peakB.push(new THREE.Vector3(Math.sin(t) * 0.158, -0.022, Math.cos(t) * 0.154 + 0.068 * Math.cos(t * 0.9)));
  }
  const peak = thickSheet(peakA, peakB, 0.007, () => new THREE.Vector3(0, 1, 0.3), { mat: 'olive' });
  cap.add(peak);
  placeOnHead(cap, 4, 1.548, 0.0);
  return cap.bone('Head');
}

export const HEADGEAR = {
  brodie: { label: 'Brodie helmet', build: buildBrodieHelmet, display: () => buildBrodieHelmet({ strap: false }) },
  pot: { label: 'Pot helmet', build: buildPotHelmet, display: () => buildPotHelmet({ strap: false }) },
  cap: { label: 'Field cap', build: buildFieldCap },
};
