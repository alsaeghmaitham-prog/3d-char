import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Soldier } from '../soldier/soldier.js';
import { POSES } from '../soldier/poses.js';
import { createRenderer, createStage, placeCamera, CAMERA_TARGET } from './stage.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('view');
const renderer = createRenderer(canvas, { preserve: true });
const stage = createStage();
const soldier = new Soldier();
stage.scene.add(soldier.group);
window.__soldier = soldier;
const camera = new THREE.PerspectiveCamera(27, 1, 0.05, 100);

if (params.has('shots')) {
  const W = +params.get('w') || 480;
  const H = +params.get('h') || 880;
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  // debug overrides for pose tuning: wo=origin, wd=dir, wr=roll, el/er=elbow poles
  const P = POSES[params.get('pose') || 'ready'];
  const num = (k) => params.get(k).split(',').map(Number);
  if (params.has('wo')) P.weapon.origin = num('wo');
  if (params.has('wd')) P.weapon.dir = num('wd');
  if (params.has('wr')) P.weapon.roll = +params.get('wr');
  if (params.has('el')) P.elbows.Left = num('el');
  if (params.has('er')) P.elbows.Right = num('er');
  if (params.has('pose')) soldier.setPose(params.get('pose'));
  else soldier.updatePose();
  if (params.has('solo')) {
    // show a single gear item on its own (debug)
    const [slot, id] = params.get('solo').split(':');
    const obj = soldier.item(slot, id);
    soldier.group.visible = false;
    const clone = slot === 'weapon' ? new THREE.Mesh(obj.geometry, obj.material) : obj;
    if (slot === 'weapon') {
      clone.castShadow = true;
      clone.rotation.y = -Math.PI / 2;
      clone.position.set(0, 1.0, 0);
      clone.scale.setScalar(1.6);
      stage.scene.add(clone);
    }
  }
  const out = {};
  if (params.has('loadout')) {
    for (const kv of params.get('loadout').split(';')) {
      const [k, v] = kv.split(':');
      soldier.equip(k, v === 'none' ? null : v);
    }
  }
  if (params.has('fov')) camera.fov = +params.get('fov');
  if (params.has('tm')) {
    renderer.toneMapping = { none: THREE.NoToneMapping, linear: THREE.LinearToneMapping, aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping, neutral: THREE.NeutralToneMapping, cineon: THREE.CineonToneMapping }[params.get('tm')];
  }
  if (params.has('exp')) renderer.toneMappingExposure = +params.get('exp');
  if (params.has('key')) stage.key.intensity = +params.get('key');
  if (params.has('hemi')) stage.hemi.intensity = +params.get('hemi');
  const vec = (s) => new THREE.Vector3(...s.split(',').map(Number));
  for (const v of params.get('shots').split(',')) {
    if (v.startsWith('cam')) {
      camera.position.copy(vec(params.get(v)));
      camera.up.set(0, 1, 0);
      camera.lookAt(vec(params.get(v + 't') || '0,0.9,0'));
      camera.updateProjectionMatrix();
    } else placeCamera(camera, v, { distance: +params.get('d') || 4.15 });
    stage.alignLights(camera, CAMERA_TARGET);
    renderer.render(stage.scene, camera);
    out[v] = canvas.toDataURL('image/png');
  }
  window.__shots = out;
  console.warn('poseInfo', JSON.stringify(soldier.poseInfo), 'tris', soldier.triangleCount());
  window.__ready = true;
} else {
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(CAMERA_TARGET);
  placeCamera(camera, 'q34');
  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize);
  resize();
  renderer.setAnimationLoop(() => {
    controls.update();
    stage.alignLights(camera, controls.target);
    renderer.render(stage.scene, camera);
  });
  window.__ready = true;
}
