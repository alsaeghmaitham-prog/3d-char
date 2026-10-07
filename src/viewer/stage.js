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

/** Studio lights. `alignLights(camera, target)` keeps them camera-relative. */
export function createLights(scene, { shadows = true } = {}) {
  const hemi = new THREE.HemisphereLight(0xe4eaee, 0x3b3b3a, 0.7);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xfffaf3, 3.3);
  key.position.set(-2.4, 2.9, 3.5);
  if (shadows) {
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
  }
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
  const Y = new THREE.Vector3(0, 1, 0);
  function alignLights(camera, target) {
    const dx = camera.position.x - target.x;
    const dz = camera.position.z - target.z;
    const top = Math.hypot(dx, dz) < 0.2 * Math.abs(camera.position.y - target.y);
    const az = top ? 0 : Math.atan2(dx, dz);
    for (const { light, offset } of rig) {
      _t.copy(offset).applyAxisAngle(Y, az);
      if (top) _t.y *= 2.2; // overhead camera: steeper light, shorter shadow
      light.position.copy(target).add(_t);
      light.target.position.copy(target);
      light.target.updateMatrixWorld();
    }
  }
  return { hemi, key, fill, rim, alignLights };
}

function gridMaterial(color = 0x4a5257, size = 0.5, fade = 7) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(color) }, uSize: { value: size }, uFade: { value: fade } },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uSize; uniform float uFade;
      varying vec3 vWorld;
      void main() {
        vec2 c = vWorld.xz / uSize;
        vec2 g = abs(fract(c - 0.5) - 0.5) / fwidth(c);
        float line = 1.0 - min(min(g.x, g.y), 1.0);
        float d = length(vWorld.xz);
        float a = line * (1.0 - smoothstep(uFade * 0.35, uFade, d)) * 0.55;
        gl_FragColor = vec4(uColor, a);
        #include <colorspace_fragment>
      }`,
  });
}

function contactShadow(size = 1.25, strength = 0.55) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, `rgba(0,0,0,${strength})`);
  grad.addColorStop(0.55, `rgba(0,0,0,${strength * 0.45})`);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size * 0.8),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.002;
  m.renderOrder = 1;
  m.name = 'ContactShadow';
  return m;
}

export function createStage({ grid = true } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  const lights = createLights(scene);

  // shadow-only floor so the ground melts into the backdrop
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.42 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.name = 'Floor';
  scene.add(floor);
  const contact = contactShadow();
  scene.add(contact);

  let gridMesh = null;
  if (grid) {
    gridMesh = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), gridMaterial());
    gridMesh.rotation.x = -Math.PI / 2;
    gridMesh.position.y = 0.001;
    gridMesh.name = 'Grid';
    scene.add(gridMesh);
  }
  return { scene, ...lights, floor, contact, grid: gridMesh };
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
