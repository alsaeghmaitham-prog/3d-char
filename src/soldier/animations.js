// Animation clips sampled from the procedural pose solver. Each clip is a
// regular THREE.AnimationClip with one quaternion track per bone plus the
// hip translation, so it plays in the viewer through an AnimationMixer and
// exports into the GLB unchanged (Unity / Unreal / Godot read them as-is).
import * as THREE from 'three';
import { applyPose, POSES } from './poses.js';

const FPS = 30;
const TAU = Math.PI * 2;
const add = (a, b) => a.map((v, i) => v + (b[i] || 0));

function sampleClip(soldier, name, duration, poseId, optsAt) {
  const rig = soldier.rig;
  const frames = Math.max(1, Math.round(duration * FPS));
  const times = [];
  const quats = rig.bones.map(() => []);
  const prev = rig.bones.map(() => null);
  const hips = [];
  for (let f = 0; f <= frames; f++) {
    const t = (f / frames) * duration;
    applyPose(soldier, poseId, optsAt ? optsAt(f / frames) : {});
    times.push(t);
    rig.bones.forEach((b, i) => {
      const q = b.quaternion.clone();
      if (prev[i] && prev[i].dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
      prev[i] = q;
      quats[i].push(q.x, q.y, q.z, q.w);
    });
    hips.push(...rig.bone('Hips').position.toArray());
  }
  const tracks = [new THREE.VectorKeyframeTrack('Hips.position', times, hips)];
  rig.bones.forEach((b, i) => tracks.push(new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, times, quats[i])));
  const clip = new THREE.AnimationClip(name, duration, tracks);
  clip.optimize();
  return clip;
}

/** Rifle-ready idle: breathing, a slow look around, weapon riding the chest. */
function idle(soldier) {
  const P = POSES.ready;
  return sampleClip(soldier, 'Idle', 4, 'ready', (u) => {
    const breath = Math.sin(u * TAU * 2);
    const look = Math.sin(u * TAU);
    return {
      hipsPos: add(P.hips.pos, [0, 0.004 * breath, 0]),
      hipsRot: add(P.hips.rot, [0, 1.5 * look, 0]),
      body: {
        spine: add(P.spine, [0.6 * breath, 0, 0]),
        chest: add(P.chest, [1.2 * breath, 1.2 * look, 0]),
        neck: add(P.neck, [0, 2 * Math.sin(u * TAU + 1), 0]),
        head: add(P.head, [1.5 * Math.sin(u * TAU * 2 + 0.5), 5 * Math.sin(u * TAU + 1), 0]),
      },
      weapon: { ...P.weapon, origin: add(P.weapon.origin, [0.004 * look, 0.007 * breath, 0.004 * breath]) },
    };
  });
}

/** In-place walk with the rifle held at the ready (two steps per cycle). */
function walk(soldier) {
  const P = POSES.ready;
  const stride = 0.44;
  const foot = (side, u) => {
    const phase = (u + (side === 'Left' ? 0 : 0.5)) % 1;
    const x = side === 'Left' ? 0.15 : -0.15;
    if (phase < 0.5) {
      // stance: foot planted, sliding back under the body
      const s = phase / 0.5;
      return { pos: [x, stride / 2 - stride * s], yaw: side === 'Left' ? 4 : -4, lift: 0, pitch: 0 };
    }
    const s = (phase - 0.5) / 0.5;
    const ease = 0.5 - 0.5 * Math.cos(Math.PI * s);
    return {
      pos: [x, -stride / 2 + stride * ease],
      yaw: side === 'Left' ? 4 : -4,
      lift: 0.085 * Math.sin(Math.PI * s),
      pitch: 14 * Math.sin(TAU * s) * (s < 0.5 ? -1 : 0.6),
    };
  };
  return sampleClip(soldier, 'Walk', 1.0, 'ready', (u) => {
    const sway = Math.sin(u * TAU);
    const bob = 0.5 - 0.5 * Math.cos(u * TAU * 2);
    return {
      hipsPos: add(P.hips.pos, [0.012 * sway, -0.03 + 0.022 * bob, 0.02]),
      hipsRot: add(P.hips.rot, [3, 6 * sway, -2.5 * sway]),
      body: {
        spine: add(P.spine, [1, -3 * sway, 1.2 * sway]),
        chest: add(P.chest, [2, -3 * sway, 1.2 * sway]),
        neck: P.neck,
        head: add(P.head, [-2, 2 * sway, 0]),
      },
      feet: { Left: foot('Left', u), Right: foot('Right', u) },
      weapon: { ...P.weapon, origin: add(P.weapon.origin, [0.02 * sway, -0.02 + 0.016 * bob, 0.03]) },
    };
  });
}

/** Rifle shouldered and aimed forward, with a slight breathing sway. */
function aim(soldier) {
  const P = POSES.aim;
  return sampleClip(soldier, 'Aim', 3, 'aim', (u) => {
    const breath = Math.sin(u * TAU);
    return {
      hipsPos: P.hips.pos,
      hipsRot: P.hips.rot,
      body: { spine: P.spine, chest: add(P.chest, [0.5 * breath, 0, 0]), neck: P.neck, head: P.head },
      weapon: { ...P.weapon, origin: add(P.weapon.origin, [0.002 * breath, 0.004 * breath, 0]), dir: add(P.weapon.dir, [0.004 * Math.sin(u * TAU * 2), 0.006 * breath, 0]) },
    };
  });
}

export const ANIMATIONS = [
  { id: 'ready', label: 'Ready', hint: 'Reference pose' },
  { id: 'idle', label: 'Idle', hint: 'Breathing loop' },
  { id: 'walk', label: 'Walk', hint: 'In-place, 1 s cycle' },
  { id: 'aim', label: 'Aim', hint: 'Shouldered' },
  { id: 'tpose', label: 'T-pose', hint: 'Bind pose' },
];

/** Build every clip for the soldier's current loadout (weapon grips matter). */
export function buildClips(soldier) {
  const keep = soldier.pose;
  const clips = {
    ready: sampleClip(soldier, 'Ready', 1, 'ready'),
    idle: idle(soldier),
    walk: walk(soldier),
    aim: aim(soldier),
    tpose: sampleClip(soldier, 'TPose', 1, 'tpose'),
  };
  soldier.pose = keep;
  soldier.updatePose();
  return clips;
}
