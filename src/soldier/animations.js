// Animation clips sampled from the procedural pose solver. Each clip is a
// regular THREE.AnimationClip with one quaternion track per bone, the hip
// translation and the weapon socket (the hand holds the rifle differently at
// the ready and when aiming), so it plays in the viewer through an
// AnimationMixer and exports into the GLB unchanged (Unity / Unreal / Godot
// read them as-is).
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
  const sock = soldier.weaponSocket;
  const sockPos = [];
  const sockQuat = [];
  let sockPrev = null;
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
    const sq = sock.quaternion.clone();
    if (sockPrev && sockPrev.dot(sq) < 0) sq.set(-sq.x, -sq.y, -sq.z, -sq.w);
    sockPrev = sq;
    sockPos.push(...sock.position.toArray());
    sockQuat.push(sq.x, sq.y, sq.z, sq.w);
  }
  const tracks = [new THREE.VectorKeyframeTrack('Hips.position', times, hips)];
  rig.bones.forEach((b, i) => tracks.push(new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, times, quats[i])));
  tracks.push(
    new THREE.VectorKeyframeTrack(`${sock.name}.position`, times, sockPos),
    new THREE.QuaternionKeyframeTrack(`${sock.name}.quaternion`, times, sockQuat),
  );
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

const DEG = Math.PI / 180;
const ease = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);

/** Height to lift the foot so the heel (or the ball) stays on the ground as it rolls. */
function rollLift(pitch) {
  const s = Math.sin(pitch * DEG); // pitch > 0: toes down (heel up)
  return Math.max(0, -0.1 * s, 0.13 * s);
}

/**
 * One foot through a gait cycle; `u` is this leg's phase, 0 = foot strike.
 * Stance: strike (toes up) -> roll onto the flat foot, which slides back under
 * the body (in-place locomotion) -> heel rise -> toe-off. Swing: the knee
 * folds to clear the ground, then the leg reaches forward and the toes come
 * up for the next strike.
 */
function gaitFoot(side, u, g) {
  const x = side === 'Left' ? g.width : -g.width;
  const yaw = side === 'Left' ? g.toeOut : -g.toeOut;
  if (u < g.stance) {
    const s = u / g.stance;
    let pitch = 0;
    if (s < 0.14) pitch = g.strike * (1 - s / 0.14);
    else if (s > 0.66) pitch = g.toeOff * Math.pow((s - 0.66) / 0.34, 1.6);
    return { pos: [x, g.land + (g.push - g.land) * s], yaw, pitch, lift: rollLift(pitch) };
  }
  const s = (u - g.stance) / (1 - g.stance);
  const pitch = s < 0.4 ? g.toeOff * Math.pow(1 - s / 0.4, 1.5) : g.strike * Math.pow((s - 0.4) / 0.6, 1.2);
  const z = g.push + (g.land - g.push) * ease(s);
  const lift = g.clear * Math.sin(Math.PI * Math.pow(s, g.kick)) + rollLift(pitch) * (1 - s);
  return { pos: [x, z], yaw, pitch, lift };
}

/**
 * In-place locomotion cycle at the ready (left foot strikes at u = 0). The
 * pelvis bobs twice per cycle (low after each strike, high at mid-stance for
 * a walk, high in flight for a run), sways over the stance leg, turns with
 * the swinging leg and drops on the swing side; the chest counter-turns, the
 * head stays steady and the rifle rides with the chest.
 */
function gait(soldier, name, g) {
  const P = POSES.ready;
  const stand = soldier.rig.bindWorld.Hips.y; // hip height standing straight
  return sampleClip(soldier, name, g.T, 'ready', (u) => {
    const c = Math.cos(TAU * u);
    const sn = Math.sin(TAU * u);
    const bob = Math.cos(2 * TAU * (u - g.bobPeak));
    const turn = -g.pelvisYaw * c;
    return {
      hipsPos: [g.sway * sn, stand - g.drop + g.bob * bob, g.forward],
      hipsRot: [P.hips.rot[0] + g.lean, turn, g.pelvisRoll * sn],
      body: {
        spine: add(P.spine, [g.lean * 0.5, -turn * 0.45, -g.pelvisRoll * 0.4 * sn]),
        chest: add(P.chest, [g.lean * 0.4 + 0.8 * bob, -turn * 0.55, -g.pelvisRoll * 0.4 * sn]),
        neck: add(P.neck, [-g.lean * 0.6, turn * 0.15, 0]),
        head: add(P.head, [-g.lean * 0.6 - 0.6 * bob, turn * 0.1, 0]),
      },
      feet: { Left: gaitFoot('Left', u, g), Right: gaitFoot('Right', (u + 0.5) % 1, g) },
      weapon: {
        ...P.weapon,
        origin: add(P.weapon.origin, [g.sway * sn * 0.8, stand - P.hips.pos[1] - g.drop + g.bob * Math.cos(2 * TAU * (u - g.bobPeak - 0.04)) * 1.15, g.forward + g.gunForward]),
        dir: add(P.weapon.dir, [0.03 * sn * g.gunSwing, 0.02 * bob * g.gunSwing, 0]),
      },
    };
  });
}

/** Walk at the ready: ~1.1 m/s, 0.62 m steps, 1.1 s cycle. */
const WALK = {
  T: 1.1, stance: 0.62, land: 0.31, push: -0.31, width: 0.105, toeOut: 7, strike: -16, toeOff: 30, clear: 0.1, kick: 0.7,
  drop: 0.014, bob: 0.02, bobPeak: 0.31, sway: 0.016, forward: 0.0, pelvisYaw: 5, pelvisRoll: 3, lean: 3, gunForward: 0.0, gunSwing: 1,
};

/** Combat jog at the ready: ~2.6 m/s with a flight phase, 0.72 s cycle. */
const RUN = {
  T: 0.72, stance: 0.36, land: 0.3, push: -0.36, width: 0.09, toeOut: 4, strike: -7, toeOff: 38, clear: 0.24, kick: 0.62,
  drop: 0.05, bob: 0.03, bobPeak: 0.43, sway: 0.012, forward: 0.03, pelvisYaw: 8, pelvisRoll: 4, lean: 9, gunForward: 0.02, gunSwing: 1.8,
};

/** Rifle shouldered and aimed forward, with a slight breathing sway. */
function aim(soldier) {
  const P = POSES.aim;
  return sampleClip(soldier, 'Aim', 3, 'aim', (u) => {
    const breath = Math.sin(u * TAU);
    return {
      hipsPos: P.hips.pos,
      hipsRot: P.hips.rot,
      body: { spine: P.spine, chest: add(P.chest, [0.5 * breath, 0, 0]), neck: P.neck, head: P.head },
      // the butt stays in the shoulder (it rides on the chest); the muzzle wanders a little
      weapon: { ...P.weapon, dir: add(P.weapon.dir, [0.004 * Math.sin(u * TAU * 2), 0.006 * breath, 0]) },
    };
  });
}

export const ANIMATIONS = [
  { id: 'ready', label: 'Ready', hint: 'Reference pose' },
  { id: 'idle', label: 'Idle', hint: 'Breathing loop' },
  { id: 'walk', label: 'Walk', hint: 'In-place, 1.1 s cycle' },
  { id: 'run', label: 'Run', hint: 'In-place jog, 0.72 s cycle' },
  { id: 'aim', label: 'Aim', hint: 'Shouldered' },
  { id: 'bind', label: 'A-pose', hint: 'Bind pose' },
];

/** Build every clip for the soldier's current loadout (weapon grips matter). */
export function buildClips(soldier) {
  const keep = soldier.pose;
  const clips = {
    ready: sampleClip(soldier, 'Ready', 1, 'ready'),
    idle: idle(soldier),
    walk: gait(soldier, 'Walk', WALK),
    run: gait(soldier, 'Run', RUN),
    aim: aim(soldier),
    bind: sampleClip(soldier, 'APose', 1, 'bind'),
  };
  soldier.pose = keep;
  soldier.updatePose();
  return clips;
}
