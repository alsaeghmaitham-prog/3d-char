// Scene, lights, floor and camera presets shared by the viewer and the
// turnaround sheet. The look mimics the reference sheet: dark slate studio,
// soft key light from the front-left, faint floor grid.
import * as THREE from 'three';

export const BG = '#2a2f33';

export function createRenderer(canvas, { preserve = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: preserve });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

export function createStage({ grid = true } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.Fog(BG, 9, 22);

  const hemi = new THREE.HemisphereLight(0xe4eaee, 0x3b3b3a, 0.7);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xfffaf3, 3.3);
  key.position.set(-2.4, 2.9, 3.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera;
  sc.left = -1.7;
  sc.right = 1.7;
  sc.top = 2.4;
  sc.bottom = -1.2;
  sc.near = 0.5;
  sc.far = 12;
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.015;
  key.shadow.radius = 4;
  key.shadow.blurSamples = 12;
  scene.add(key, key.target);

  const fill = new THREE.DirectionalLight(0xe2e9ff, 0.4);
  fill.position.set(3.2, 1.6, 2.2);
  scene.add(fill, fill.target);

  const rim = new THREE.DirectionalLight(0xffffff, 0.6);
  rim.position.set(0.6, 3.2, -4.2);
  scene.add(rim, rim.target);

  // lights are defined relative to the camera azimuth (like a photo studio
  // where the subject turns), so every view is lit like the reference sheet
  const rig = [key, fill, rim].map((l) => ({ light: l, offset: l.position.clone() }));
  const _t = new THREE.Vector3();
  function alignLights(camera, target) {
    const az = Math.atan2(camera.position.x - target.x, camera.position.z - target.z);
    const top = Math.abs(camera.position.clone().sub(target).normalize().y) > 0.98;
    for (const { light, offset } of rig) {
      _t.copy(offset).applyAxisAngle(new THREE.Vector3(0, 1, 0), top ? 0 : az);
      light.position.copy(target).add(_t);
      light.target.position.copy(target);
      light.target.updateMatrixWorld();
    }
  }

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(40, 72),
    new THREE.MeshStandardMaterial({ color: 0x2c3135, roughness: 1, metalness: 0 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.name = 'Floor';
  scene.add(floor);

  let gridHelper = null;
  if (grid) {
    gridHelper = new THREE.GridHelper(80, 160, 0x3b4247, 0x353b40);
    gridHelper.position.y = 0.002;
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.9;
    scene.add(gridHelper);
  }
  return { scene, key, fill, rim, hemi, floor, grid: gridHelper, alignLights };
}

// Camera presets (azimuth: 0 = looking at the character's face; negative =
// camera moves towards the character's right side, as on the sheet).
export const VIEWS = {
  front: { label: 'Front', az: 0, el: 9 },
  q34: { label: '3/4 Front', az: -38, el: 9 },
  side: { label: 'Side', az: -90, el: 7 },
  back: { label: 'Back', az: 180, el: 9 },
  top: { label: 'Top down', az: 0, el: 88 },
};

export const CAMERA_TARGET = new THREE.Vector3(0, 0.9, 0);

export function placeCamera(camera, view, { distance = 4.6, target = CAMERA_TARGET } = {}) {
  const v = typeof view === 'string' ? VIEWS[view] : view;
  const az = THREE.MathUtils.degToRad(v.az);
  const el = THREE.MathUtils.degToRad(v.el);
  camera.position.set(
    target.x + Math.sin(az) * Math.cos(el) * distance,
    target.y + Math.sin(el) * distance,
    target.z + Math.cos(az) * Math.cos(el) * distance,
  );
  if (v.el > 80) camera.up.set(0, 0, -1);
  else camera.up.set(0, 1, 0);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
}
