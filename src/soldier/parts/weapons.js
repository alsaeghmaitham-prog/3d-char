// Weapons are static meshes parented to a socket under the right hand.
// Weapon space: +Z towards the muzzle, +Y up (sights), +X = weapon's left side.
// The origin sits on the wrist of the stock where the right hand grips.
//
// Each weapon declares hand grips: `point` (where the palm touches),
// `normal` (palm facing direction, into the weapon), `fingers` (wrist ->
// knuckles direction before curling) and finger curl angles in degrees.
import * as THREE from 'three';
import { Poly, chamferBox, extrudeProfile, tube, lathe, axisTube } from '../lowpoly.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function box(w, h, d, c, mat, x, y, z) {
  return chamferBox(w, h, d, c, { mat }).translate(x, y, z);
}

function barrel(z0, z1, r, y = 0.009, n = 8) {
  const p = axisTube(
    [
      [z0, r, r],
      [z1, r, r],
    ],
    { n, mat: 'metal', phase: Math.PI / n },
  );
  // axisTube runs along +Y: rotate so it runs along +Z
  p.rotateX(Math.PI / 2).translate(0, y, 0);
  return p;
}

function boltHandle(z) {
  const p = new Poly('metal');
  p.add(tube([V(-0.016, 0.022, z), V(-0.034, 0.012, z + 0.004), V(-0.043, 0.002, z + 0.006)], 0.0055, 6, { mat: 'metal' }));
  const knob = lathe(
    [
      [0, -0.012],
      [0.009, -0.008],
      [0.012, 0.0],
      [0.009, 0.008],
      [0, 0.012],
    ],
    6,
    { mat: 'metal' },
  );
  knob.translate(-0.047, -0.001, z + 0.007);
  p.add(knob);
  return p;
}

function triggerGuard(z0 = 0.034, z1 = 0.136, yTop = -0.058, depth = 0.055) {
  const p = new Poly('metal');
  const pts = [
    [z0, yTop - 0.002],
    [z0 + 0.004, yTop - depth * 0.62],
    [z0 + 0.026, yTop - depth],
    [z1 - 0.034, yTop - depth * 1.01],
    [z1 - 0.006, yTop - depth * 0.7],
    [z1, yTop - 0.002],
  ].map(([z, y]) => V(0, y, z));
  p.add(tube(pts, 0.0062, 6, { mat: 'metal', up: V(1, 0, 0) }));
  // trigger blade
  p.add(
    tube([V(0, yTop + 0.002, z0 + 0.038), V(0, yTop - 0.02, z0 + 0.04), V(0, yTop - 0.032, z0 + 0.05)], 0.0042, 5, {
      mat: 'metal',
      up: V(1, 0, 0),
    }),
  );
  return p;
}

/** Bolt-action service rifle exactly as on the reference sheet. */
export function buildRifle({ short = false } = {}) {
  const r = new Poly('wood');
  const fe = short ? 0.43 : 0.545; // forend end
  const mz = short ? 0.655 : 0.808; // muzzle
  // wooden stock / forend side profile (z, y)
  const stock = [
    [-0.258, -0.178],
    [0.04, -0.064],
    [0.15, -0.058],
    [fe, -0.052],
    [fe, 0.03],
    [0.248, 0.03],
    [0.248, 0.006],
    [0.046, 0.006],
    [-0.031, -0.031],
    [-0.062, -0.011],
    [-0.27, -0.046],
  ];
  const wood = extrudeProfile(stock, 0.046, 0.0075, { mat: 'wood' });
  wood.warp((p) => {
    // butt a bit wider than the wrist / forend
    if (p.z < -0.08) p.x *= 1 + Math.min(1, (-0.08 - p.z) / 0.15) * 0.18;
  });
  wood.jitter(0.0012, 201);
  r.add(wood);
  // butt plate
  r.add(
    extrudeProfile(
      [
        [-0.284, -0.048],
        [-0.27, -0.046],
        [-0.258, -0.178],
        [-0.272, -0.181],
      ],
      0.055,
      0.0025,
      { mat: 'metal' },
    ),
  );
  // receiver + sights
  r.add(box(0.036, 0.04, 0.204, 0.006, 'metal', 0, 0.026, 0.147));
  r.add(box(0.026, 0.011, 0.02, 0.0025, 'metal', 0, 0.051, 0.083));
  r.add(box(0.03, 0.009, 0.024, 0.0025, 'metal', 0, 0.049, 0.228));
  r.add(boltHandle(0.082));
  r.add(triggerGuard());
  // nose cap
  r.add(box(0.044, 0.07, 0.026, 0.005, 'metal', 0, -0.011, fe + 0.008));
  // barrel, muzzle ring, front sight
  r.add(barrel(0.24, mz - 0.02, 0.0145));
  r.add(barrel(mz - 0.023, mz, 0.0178));
  r.add(box(0.012, 0.028, 0.022, 0.002, 'metal', 0, 0.036, mz - 0.044));
  r.add(box(0.03, 0.01, 0.03, 0.002, 'metal', 0, 0.024, mz - 0.044));
  return r;
}

/** Simple submachine gun (variant): wooden stock, pistol grip, foregrip, box magazine. */
export function buildSMG() {
  const g = new Poly('wood');
  const stock = extrudeProfile(
    [
      [-0.3, -0.14],
      [-0.06, -0.05],
      [-0.02, -0.035],
      [-0.02, 0.02],
      [-0.07, 0.02],
      [-0.3, -0.03],
    ],
    0.042,
    0.007,
    { mat: 'wood' },
  );
  g.add(stock);
  g.add(chamferBox(0.05, 0.13, 0.016, 0.003, { mat: 'metal' }).rotateX(-0.36).translate(0, -0.086, -0.304));
  // receiver
  g.add(box(0.044, 0.06, 0.25, 0.008, 'metal', 0, 0.0, 0.1));
  g.add(box(0.03, 0.012, 0.03, 0.003, 'metal', 0, 0.034, 0.0));
  g.add(boltHandle(0.15));
  // pistol grip (wood)
  const grip = extrudeProfile(
    [
      [0.03, -0.03],
      [0.075, -0.03],
      [0.06, -0.14],
      [0.02, -0.135],
    ],
    0.034,
    0.006,
    { mat: 'wood' },
  );
  g.add(grip);
  g.add(triggerGuard(0.075, 0.15, -0.03, 0.045));
  // magazine
  g.add(box(0.026, 0.17, 0.04, 0.004, 'metal', 0, -0.11, 0.19));
  // foregrip
  const fg = extrudeProfile(
    [
      [0.27, -0.03],
      [0.33, -0.03],
      [0.32, -0.12],
      [0.285, -0.12],
    ],
    0.036,
    0.006,
    { mat: 'wood' },
  );
  g.add(fg);
  // barrel with cooling fins
  g.add(barrel(0.22, 0.46, 0.014, 0.004));
  for (let i = 0; i < 5; i++) g.add(barrel(0.235 + i * 0.025, 0.245 + i * 0.025, 0.021, 0.004));
  g.add(barrel(0.44, 0.47, 0.018, 0.004));
  g.add(box(0.01, 0.022, 0.012, 0.002, 'metal', 0, 0.026, 0.45));
  return g;
}

// Grips shared by the rifle and the carbine. `wrap` describes the stock's
// wrist for poses that fit the fist around it (centre line, the direction the
// thumb side of the fist faces, radius); the fixed point/normal/fingers grip
// is used when shouldering the rifle.
const RIFLE_GRIPS = {
  right: {
    point: V(-0.0235, -0.03, 0.004),
    normal: V(1, 0, 0),
    fingers: V(0, -0.78, 0.62),
    curl: { f1: 82, f2: 78, t1: [-10, 10, 20], t2: 30 },
    wrap: { center: V(0, -0.056, -0.022), thumb: V(0, -0.37, -0.93), radius: 0.027 },
    wrapCurl: { f1: 88, f2: 84, t1: [0, 46, -20], t2: -20 },
  },
  left: {
    point: V(0.002, -0.054, 0.21),
    normal: V(0, 1, 0),
    fingers: V(-1, 0, 0.22),
    curl: { f1: 72, f2: 64, t1: [0, 20, 40], t2: 20 },
  },
};

export const WEAPONS = {
  rifle: {
    label: 'Bolt-action rifle',
    build: () => buildRifle(),
    grips: RIFLE_GRIPS,
    butt: V(0, -0.11, -0.284), // centre of the butt plate (bedded in the shoulder when aiming)
    length: 1.09,
  },
  carbine: {
    label: 'Carbine',
    build: () => buildRifle({ short: true }),
    grips: { right: RIFLE_GRIPS.right, left: { ...RIFLE_GRIPS.left, point: V(0.002, -0.054, 0.22) } },
    butt: V(0, -0.11, -0.284),
    length: 0.94,
  },
  smg: {
    label: 'Submachine gun',
    build: buildSMG,
    grips: {
      right: {
        point: V(-0.018, -0.085, 0.045),
        normal: V(1, 0, 0),
        fingers: V(0, -0.25, 1),
        curl: { f1: 80, f2: 80, t1: [0, 0, 30], t2: 30 },
      },
      left: {
        point: V(0.019, -0.075, 0.305),
        normal: V(-1, 0, 0),
        fingers: V(0, -0.2, 1),
        curl: { f1: 80, f2: 75, t1: [0, 0, 30], t2: 30 },
      },
    },
    butt: V(0, -0.085, -0.302),
    length: 0.78,
  },
};
