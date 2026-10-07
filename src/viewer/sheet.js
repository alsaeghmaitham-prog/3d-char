// Live turnaround sheet laid out like the reference board (1448 x 1086):
// five character views across the top, a palette column, then a panel with
// the weapon and the gear pieces. Every cell is a scissored viewport of one
// WebGL canvas; text and frames are HTML on top (see main.js).
import * as THREE from 'three';
import { createLights, placeCamera } from './stage.js';
import { buildGeometry } from '../soldier/lowpoly.js';
import { SLOT_ORDER } from '../soldier/palette.js';
import { GEAR_SLOTS } from '../soldier/soldier.js';

export const BOARD = { w: 1448, h: 1086 };

export const SHEET_VIEWS = [
  { id: 'front', label: 'Front', x0: 28, x1: 292 },
  { id: 'q34', label: '3/4 Front', x0: 290, x1: 548 },
  { id: 'side', label: 'Side', x0: 540, x1: 792 },
  { id: 'back', label: 'Back', x0: 792, x1: 1066 },
  { id: 'top', label: 'Top down', x0: 1066, x1: 1336 },
];
const FIG = { y0: 112, y1: 584 };

const WEAPON_CELLS = [
  { x0: 52, x1: 604, y0: 742, y1: 860, az: 0, el: 6, fill: 0.95 },
  { x0: 150, x1: 604, y0: 860, y1: 1000, az: 32, el: 26, fill: 1.2 },
];

const GEAR_CELLS = [
  { slot: 'head', x0: 640, x1: 840, az: -28, el: 18, fill: 1.0 },
  { slot: 'back', x0: 838, x1: 1028, az: 205, el: 14, fill: 0.86 },
  { slot: 'belt', x0: 1022, x1: 1232, az: 8, el: 7, fill: 1.0 },
  { slot: 'feet', x0: 1222, x1: 1414, az: -82, el: 12, fill: 0.9 },
];
const GEAR_Y = { y0: 760, y1: 1000 };

export class Sheet {
  constructor(renderer, stage, soldier) {
    this.renderer = renderer;
    this.stage = stage;
    this.soldier = soldier;
    this.camera = new THREE.PerspectiveCamera(20, 1, 0.05, 100);
    this.gearScene = new THREE.Scene();
    this.gearLights = createLights(this.gearScene, { shadows: false });
    this.gearRoot = new THREE.Group();
    this.gearScene.add(this.gearRoot);
    this.displays = {};
    this.rebuildGear();
  }

  /** Static copies of the equipped gear for the bottom panel. */
  rebuildGear() {
    this.gearRoot.clear();
    this.displays = {};
    const s = this.soldier;
    const mats = (geometry, slots) => slots.map((id) => s.materials[id]);
    const make = (poly) => {
      const { geometry, slots } = buildGeometry([poly], { slotOrder: SLOT_ORDER });
      const mesh = new THREE.Mesh(geometry, mats(geometry, slots));
      return mesh;
    };
    const center = (obj) => {
      const box = new THREE.Box3().setFromObject(obj);
      const c = box.getCenter(new THREE.Vector3());
      obj.position.sub(c);
      const holder = new THREE.Group();
      holder.add(obj);
      holder.userData.size = box.getSize(new THREE.Vector3());
      holder.visible = false;
      this.gearRoot.add(holder);
      return holder;
    };
    for (const cell of GEAR_CELLS) {
      const slot = GEAR_SLOTS.find((g) => g.id === cell.slot);
      const id = s.loadout[cell.slot];
      if (!id) continue;
      const def = slot.items[id];
      this.displays[cell.slot] = center(make(def.display ? def.display() : def.build()));
    }
    const wid = s.loadout.weapon;
    if (wid) {
      const slot = GEAR_SLOTS.find((g) => g.id === 'weapon');
      const mesh = make(slot.items[wid].build());
      mesh.rotation.y = Math.PI / 2; // muzzle to the right, bolt side to camera
      const holder = new THREE.Group();
      holder.add(mesh);
      const box = new THREE.Box3().setFromObject(holder);
      mesh.position.sub(box.getCenter(new THREE.Vector3()));
      holder.userData.size = box.getSize(new THREE.Vector3());
      holder.visible = false;
      this.gearRoot.add(holder);
      this.displays.weapon = holder;
    }
  }

  /** Board-space rectangle -> pixel viewport (bottom-left origin for GL). */
  rect(x0, y0, x1, y1, W, H) {
    const sx = W / BOARD.w;
    const sy = H / BOARD.h;
    const x = Math.round(x0 * sx);
    const w = Math.round((x1 - x0) * sx);
    const h = Math.round((y1 - y0) * sy);
    const y = Math.round(H - y1 * sy);
    return { x, y, w, h };
  }

  drawCell(r, scene, camera) {
    const R = this.renderer;
    R.setViewport(r.x, r.y, r.w, r.h);
    R.setScissor(r.x, r.y, r.w, r.h);
    camera.aspect = r.w / r.h;
    camera.updateProjectionMatrix();
    R.render(scene, camera);
  }

  render(W, H) {
    const R = this.renderer;
    const cam = this.camera;
    R.setScissorTest(true);
    R.autoClear = true;
    // whole board background
    R.setViewport(0, 0, W, H);
    R.setScissor(0, 0, W, H);
    R.setClearColor(this.stage.scene.background, 1);
    R.clear();

    // character views (the soldier stays put; the camera and studio orbit)
    const target = new THREE.Vector3(0, 0.93, 0);
    for (const v of SHEET_VIEWS) {
      const r = this.rect(v.x0, FIG.y0, v.x1, FIG.y1, W, H);
      cam.fov = 20;
      const distance = v.id === 'top' ? 5.3 : 5.75;
      placeCamera(cam, v.id, { distance, target: v.id === 'top' ? new THREE.Vector3(0.04, 0.9, 0.16) : target });
      this.stage.alignLights(cam, target);
      this.drawCell(r, this.stage.scene, cam);
    }

    // weapon (two angles) and gear pieces on a plain background
    const prevBg = this.gearScene.background;
    this.gearScene.background = null;
    const zero = new THREE.Vector3();
    const show = (holder) => {
      for (const c of this.gearRoot.children) c.visible = c === holder;
    };
    const frame = (holder, cell, fov = 24) => {
      // fit the item's bounding box as seen from this camera direction
      const r = cell.r;
      const aspect = r.w / r.h;
      cam.fov = fov;
      placeCamera(cam, { az: cell.az, el: cell.el }, { distance: 10, target: zero });
      cam.updateMatrixWorld(true);
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
      const fwd = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 2);
      const box = new THREE.Box3().setFromObject(holder.children[0]);
      let hx = 0;
      let hy = 0;
      let hz = 0;
      for (let i = 0; i < 8; i++) {
        const p = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
        hx = Math.max(hx, Math.abs(p.dot(right)));
        hy = Math.max(hy, Math.abs(p.dot(up)));
        hz = Math.max(hz, Math.abs(p.dot(fwd)));
      }
      const t = Math.tan(THREE.MathUtils.degToRad(fov / 2));
      const fill = cell.fill || 0.85;
      const distance = Math.max(hy / (t * fill), hx / (t * aspect * fill)) + hz;
      placeCamera(cam, { az: cell.az, el: cell.el }, { distance, target: zero });
      this.gearLights.alignLights(cam, zero);
      this.drawCell(r, this.gearScene, cam);
    };
    if (this.displays.weapon) {
      show(this.displays.weapon);
      for (const c of WEAPON_CELLS) frame(this.displays.weapon, { ...c, r: this.rect(c.x0, c.y0, c.x1, c.y1, W, H) }, 18);
    }
    for (const c of GEAR_CELLS) {
      const d = this.displays[c.slot];
      if (!d) continue;
      show(d);
      frame(d, { ...c, r: this.rect(c.x0, GEAR_Y.y0, c.x1, GEAR_Y.y1, W, H) }, 26);
    }
    this.gearScene.background = prevBg;
    R.setScissorTest(false);
    R.setViewport(0, 0, W, H);
  }
}
