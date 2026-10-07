// Belt, pouches, harness straps, packs. Rigid on Hips / Chest, straps follow
// the jacket surface.
import * as THREE from 'three';
import { Poly, chamferBox, extrudeProfile, strap, thickSheet, axisTube, lathe, loft, ellipseRing, raycastPoly } from '../lowpoly.js';
import { torsoPoint, torsoNormal, torsoWeights, torsoBackZ, torsoMesh } from './body.js';

const BELT_LOW = 0.852;
const BELT_HIGH = 0.903;
const BELT_OFF = 0.013;

function frameAt(theta, y, offset) {
  const p = torsoPoint(theta, y, offset);
  const n = torsoNormal(theta, y).setY(0).normalize();
  const x = new THREE.Vector3(0, 1, 0).cross(n).normalize(); // tangent (pouch width axis)
  return { p, n, x };
}

/** Place a poly authored in pouch space (x: width, y: up, z: outward) on the belt. */
function placeOnBelt(poly, theta, y = BELT_LOW, offset = BELT_OFF) {
  const { p, n, x } = frameAt(theta, y, offset);
  const m = new THREE.Matrix4().makeBasis(x, new THREE.Vector3(0, 1, 0), n);
  m.setPosition(p);
  return poly.apply(m);
}

export function buildBeltBand() {
  const N = 28;
  const lo = [];
  const hi = [];
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    lo.push(torsoPoint(t, BELT_LOW, BELT_OFF));
    hi.push(torsoPoint(t, BELT_HIGH, BELT_OFF));
  }
  const band = thickSheet(lo, hi, 0.012, (p) => new THREE.Vector3(p.x, 0, p.z).normalize(), { mat: 'webbing', closed: true });
  band.jitter(0.0012, 71);
  // buckle plate at the front
  const plate = chamferBox(0.05, 0.047, 0.01, 0.003, { mat: 'webbing' });
  placeOnBelt(plate.translate(0, 0.0255, 0.004), 0, BELT_LOW, BELT_OFF);
  band.add(plate);
  const frame = chamferBox(0.038, 0.036, 0.006, 0.0015, { mat: 'metal' });
  placeOnBelt(frame.translate(0, 0.0255, 0.011), 0, BELT_LOW, BELT_OFF);
  band.add(frame);
  return band;
}

/** Ammunition pouch with pointed flap and press stud. */
export function buildPouch({ w = 0.124, h = 0.178, d = 0.074, top = 0.068, flapDrop = 0.062 } = {}) {
  const pouch = new Poly('webbing');
  const body = chamferBox(w, h, d, 0.008, { mat: 'webbing', bottom: [0.97, 0.94] });
  body.translate(0, top - h / 2, d / 2);
  body.jitter(0.0015, 81);
  pouch.add(body);
  // flap: front plate with a slight point + lid over the top
  const fw = w / 2 + 0.003;
  const fy = top + 0.004;
  const front = extrudeProfile(
    [
      [-fw, fy],
      [-fw, fy - flapDrop + 0.004],
      [0, fy - flapDrop - 0.01],
      [fw, fy - flapDrop + 0.004],
      [fw, fy],
    ].map(([x, y]) => [x, y]),
    0.008,
    0.002,
    { mat: 'webbing', axis: 'z' },
  );
  front.translate(0, 0, d + 0.003);
  pouch.add(front);
  const lid = chamferBox(w + 0.006, 0.008, d + 0.008, 0.0025, { mat: 'webbing' });
  lid.translate(0, top + 0.004, d / 2 + 0.001);
  pouch.add(lid);
  // press stud
  const stud = lathe(
    [
      [0.0085, 0],
      [0.0085, 0.004],
      [0.005, 0.0065],
      [0, 0.0075],
    ],
    8,
    { mat: 'metal' },
  );
  stud.rotateX(Math.PI / 2).translate(0, fy - flapDrop - 0.0005, d + 0.007);
  pouch.add(stud);
  return pouch;
}

export function buildBeltWithPouches() {
  const p = new Poly('webbing');
  p.add(buildBeltBand());
  for (const theta of [1.14, 2.02, -1.14, -2.02]) {
    p.add(placeOnBelt(buildPouch(), theta));
  }
  return p.bone('Hips');
}

export function buildBeltWithCanteen() {
  const p = new Poly('webbing');
  p.add(buildBeltBand());
  for (const theta of [0.95, -0.95]) p.add(placeOnBelt(buildPouch({ w: 0.11 }), theta));
  // canteen in a cover on the right hip, at the back
  const canteen = new Poly('olive');
  const bottle = axisTube(
    [
      [-0.21, 0.07, 0.04],
      [-0.2, 0.078, 0.046],
      [-0.06, 0.08, 0.048],
      [-0.04, 0.07, 0.044],
      [-0.03, 0.03, 0.03],
      [0.0, 0.03, 0.03],
      [0.005],
    ],
    { n: 10, mat: 'olive', phase: Math.PI / 10 },
  );
  bottle.translate(0, 0.07, 0.05);
  bottle.jitter(0.002, 91);
  canteen.add(bottle);
  const cap = axisTube(
    [
      [0.0, 0.022, 0.022],
      [0.024, 0.02, 0.02],
      [0.03],
    ],
    { n: 8, mat: 'metal' },
  );
  cap.translate(0, 0.07, 0.05);
  canteen.add(cap);
  p.add(placeOnBelt(canteen, -2.55));
  // entrenching tool on the left at the back
  const tool = new Poly('webbing');
  const carrier = chamferBox(0.13, 0.17, 0.035, 0.01, { mat: 'webbing' });
  carrier.translate(0, -0.03, 0.02);
  tool.add(carrier);
  const handle = axisTube(
    [
      [-0.27, 0.014, 0.014],
      [-0.1, 0.016, 0.016],
    ],
    { n: 6, mat: 'wood' },
  );
  handle.translate(0, 0.0, 0.035);
  tool.add(handle);
  p.add(placeOnBelt(tool, 2.55));
  return p.bone('Hips');
}

export function buildPlainBelt() {
  return buildBeltBand().bone('Hips');
}

// ---------------------------------------------------------------------------
// Harness (shoulder braces / Y-straps)
// ---------------------------------------------------------------------------

function braceSide(s) {
  const torso = torsoMesh();
  const path = [];
  const normals = [];
  const hit = (origin, dir, lift = 0.0025) => {
    const h = raycastPoly(torso, origin, dir);
    if (!h) return;
    path.push(h.point.addScaledVector(h.normal, lift));
    normals.push(h.normal);
  };
  const xf = 0.17 * s;
  const xb = 0.14 * s;
  const xt = 0.148 * s;
  // up the chest
  for (const y of [BELT_HIGH - 0.012, 0.96, 1.06, 1.16, 1.24, 1.29]) hit(new THREE.Vector3(xf, y, 0), new THREE.Vector3(0, 0, 1));
  // over the shoulder: fan of rays in the sagittal plane, lifted clear of the collar
  for (let i = 1; i <= 9; i++) {
    const u = i / 10;
    const psi = u * Math.PI;
    const x = u < 0.5 ? xf + (xt - xf) * (u / 0.5) : xt + (xb - xt) * ((u - 0.5) / 0.5);
    hit(new THREE.Vector3(x, 1.24, -0.004), new THREE.Vector3(0, Math.sin(psi), Math.cos(psi)), 0.0025 + 0.019 * Math.pow(Math.sin(psi), 0.7));
  }
  // down the back
  for (const y of [1.29, 1.2, 1.1, 1.0, BELT_HIGH - 0.012]) hit(new THREE.Vector3(xb, y, 0), new THREE.Vector3(0, 0, -1));
  const st = strap(path, normals, 0.052, 0.0085, { mat: 'webbing' });
  st.skinBy((p) => (p.y > 1.3 ? [['Chest', 1]] : torsoWeights(p.y)));
  // brace attachment buckle at the belt (front)
  const buckle = chamferBox(0.04, 0.03, 0.01, 0.002, { mat: 'metal' });
  const b = raycastPoly(torso, new THREE.Vector3(xf, BELT_HIGH + 0.014, 0), new THREE.Vector3(0, 0, 1));
  const n = b.normal;
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0).cross(n).normalize(), new THREE.Vector3(0, 1, 0), n);
  m.setPosition(b.point.addScaledVector(n, 0.012));
  buckle.apply(m).skinBy((p) => torsoWeights(p.y));
  st.add(buckle);
  return st;
}

export function buildHarness() {
  const p = new Poly('webbing');
  p.add(braceSide(1));
  p.add(braceSide(-1));
  return p;
}

// ---------------------------------------------------------------------------
// Packs (rigid on Chest)
// ---------------------------------------------------------------------------

const PACK = { w: 0.33, top: 1.338, bottom: 0.935, front: -0.139, depth: 0.165 };

function packBody({ w = PACK.w, top = PACK.top, bottom = PACK.bottom, front = PACK.front, depth = PACK.depth } = {}) {
  const h = top - bottom;
  // rounded, slightly bulging canvas bag: loft of superellipse sections
  const sections = [
    [0.0, 0.9, 0.72],
    [0.05, 0.97, 0.9],
    [0.22, 1.02, 1.04],
    [0.5, 1.0, 1.0],
    [0.8, 0.98, 0.96],
    [0.93, 0.94, 0.86],
    [0.985, 0.84, 0.6],
  ];
  const rings = sections.map(([t, sw, sd]) =>
    ellipseRing({ n: 12, rx: (w / 2) * sw, rz: (depth / 2) * sd, y: bottom + h * t, cz: front - depth / 2, power: 3.4, phase: Math.PI / 12 }),
  );
  const body = loft(rings, { mat: 'webbing', start: 'flat', end: new THREE.Vector3(0, top, front - depth / 2) });
  body.jitter(0.0035, 101);
  hugBack(body, front, depth);
  return body;
}

/** Pull the front of a pack onto the curved back of the jacket. */
function hugBack(poly, front, depth, gap = 0.004) {
  poly.warp((p) => {
    const t = Math.min(1, Math.max(0, (p.z - (front - depth / 2)) / (depth / 2)));
    const shift = (torsoBackZ(p.x, p.y) - gap - front) * t;
    if (shift > 0) p.z += shift;
  });
}

function packFlap({ w = PACK.w + 0.014, top = PACK.top, front = PACK.front, depth = PACK.depth, drop = 0.24 } = {}) {
  const back = front - depth;
  const t = 0.012;
  const R = 0.045;
  const zc = back + R;
  const yc = top - R;
  const arc = (rad, rev) => {
    const out = [];
    for (let i = 0; i <= 5; i++) {
      const a = Math.PI / 2 + ((Math.PI / 2) * (rev ? 5 - i : i)) / 5;
      out.push([zc + Math.cos(a) * rad, yc + Math.sin(a) * rad]);
    }
    return out;
  };
  const prof = [
    [front + 0.002, top + t + 0.002],
    ...arc(R + t + 0.002, false),
    [back - t - 0.002, top - drop],
    [back - 0.002, top - drop],
    ...arc(R + 0.002, true),
    [front + 0.002, top + 0.002],
  ];
  const flap = extrudeProfile(prof, w, 0.004, { mat: 'webbing' });
  // curved lower edge: lower in the middle
  flap.warp((p) => {
    if (p.y < top - drop + 0.02) p.y -= 0.018 * (1 - Math.pow(p.x / (w / 2), 2));
  });
  flap.jitter(0.002, 103, [1, 1, 0.4]);
  return flap;
}

function flapStrap(x, { top = PACK.top, front = PACK.front, depth = PACK.depth, drop = 0.24 } = {}) {
  const back = front - depth - 0.013;
  const p = new Poly('webbing');
  const tab = chamferBox(0.027, 0.07, 0.006, 0.002, { mat: 'webbing' });
  tab.translate(x, top - drop - 0.022, back - 0.002);
  p.add(tab);
  const buckle = chamferBox(0.032, 0.024, 0.006, 0.0018, { mat: 'metal' });
  buckle.translate(x, top - drop - 0.046, back - 0.006);
  p.add(buckle);
  const bar = chamferBox(0.022, 0.006, 0.004, 0.001, { mat: 'webbing' });
  bar.translate(x, top - drop - 0.046, back - 0.0095);
  p.add(bar);
  return p;
}

export function buildFieldPack() {
  const p = new Poly('webbing');
  p.add(packBody());
  p.add(packFlap());
  p.add(flapStrap(-0.07));
  p.add(flapStrap(0.07));
  return p.bone('Chest');
}

export function buildFieldPackWithSides() {
  const p = buildFieldPack();
  for (const s of [-1, 1]) {
    const side = chamferBox(0.06, 0.27, 0.13, 0.016, { mat: 'olive', top: [0.92, 0.9] });
    side.translate(s * (PACK.w / 2 + 0.026), PACK.bottom + 0.15, PACK.front - PACK.depth / 2 - 0.004);
    side.jitter(0.003, 111 + s);
    const lid = chamferBox(0.066, 0.012, 0.136, 0.004, { mat: 'olive' });
    lid.translate(s * (PACK.w / 2 + 0.026), PACK.bottom + 0.29, PACK.front - PACK.depth / 2 - 0.004);
    p.add(side.bone('Chest'));
    p.add(lid.bone('Chest'));
  }
  return p;
}

export function buildRucksack() {
  const p = new Poly('webbing');
  const big = { w: 0.36, top: 1.36, bottom: 0.9, front: -0.146, depth: 0.2 };
  p.add(packBody(big));
  p.add(packFlap({ w: big.w + 0.012, top: big.top, front: big.front, depth: big.depth, drop: 0.2 }));
  p.add(flapStrap(-0.08, { top: big.top, front: big.front, depth: big.depth, drop: 0.2 }));
  p.add(flapStrap(0.08, { top: big.top, front: big.front, depth: big.depth, drop: 0.2 }));
  // rolled blanket on top
  const roll = axisTube(
    [
      [-0.25],
      [-0.235, 0.05, 0.05],
      [-0.2, 0.062, 0.062],
      [0.2, 0.062, 0.062],
      [0.235, 0.05, 0.05],
      [0.25],
    ],
    { n: 8, mat: 'olive' },
  );
  roll.rotateZ(Math.PI / 2).translate(0, big.top + 0.07, big.front - big.depth / 2 - 0.01);
  roll.jitter(0.004, 121);
  p.add(roll);
  for (const x of [-0.13, 0.13]) {
    const tie = axisTube(
      [
        [-0.012, 0.066, 0.066],
        [0.012, 0.066, 0.066],
      ],
      { n: 8, mat: 'webbing', start: false, end: false },
    );
    tie.rotateZ(Math.PI / 2).translate(x, big.top + 0.07, big.front - big.depth / 2 - 0.01);
    p.add(tie);
  }
  return p.bone('Chest');
}

export const BELTS = {
  pouches: { label: 'Belt + 4 pouches', build: buildBeltWithPouches },
  canteen: { label: 'Belt, canteen, tool', build: buildBeltWithCanteen },
  plain: { label: 'Plain belt', build: buildPlainBelt },
};

export const HARNESS = {
  braces: { label: 'Shoulder braces', build: buildHarness },
};

export const PACKS = {
  field: { label: 'Field pack', build: buildFieldPack },
  sides: { label: 'Pack + side pouches', build: buildFieldPackWithSides },
  rucksack: { label: 'Rucksack + blanket', build: buildRucksack },
};
