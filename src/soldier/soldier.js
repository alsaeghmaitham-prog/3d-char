// The modular soldier: one skeleton, a skinned body and swappable gear items
// (each a separate skinned mesh sharing the skeleton, weapons parented to a
// socket on the right hand).
import * as THREE from 'three';
import { Rig } from './rig.js';
import { buildGeometry } from './lowpoly.js';
import { SLOT_ORDER, PRESETS, createMaterials } from './palette.js';
import { buildBody } from './parts/body.js';
import { HEADGEAR } from './parts/headgear.js';
import { FOOTWEAR } from './parts/footwear.js';
import { BELTS, HARNESS, PACKS } from './parts/webbing.js';
import { WEAPONS } from './parts/weapons.js';
import { applyPose } from './poses.js';

export const GEAR_SLOTS = [
  { id: 'head', label: 'Headgear', node: 'Head', items: HEADGEAR, optional: true, default: 'brodie' },
  { id: 'back', label: 'Backpack', node: 'Back', items: PACKS, optional: true, default: 'field' },
  { id: 'harness', label: 'Harness', node: 'Harness', items: HARNESS, optional: true, default: 'braces' },
  { id: 'belt', label: 'Belt kit', node: 'Belt', items: BELTS, optional: true, default: 'pouches' },
  { id: 'feet', label: 'Footwear', node: 'Feet', items: FOOTWEAR, optional: false, default: 'boots' },
  { id: 'weapon', label: 'Weapon', node: 'Weapon', items: WEAPONS, optional: true, default: 'rifle' },
];

export const DEFAULT_LOADOUT = Object.fromEntries(GEAR_SLOTS.map((s) => [s.id, s.default]));

export class Soldier {
  constructor({ colors = PRESETS.reference.colors, loadout = DEFAULT_LOADOUT, pose = 'ready', materials = null } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'Soldier';
    this.rig = new Rig();
    this.group.add(this.rig.root);
    this.skeleton = this.rig.createSkeleton();
    this.colors = { ...colors };
    this.materials = materials || createMaterials(colors);
    this.body = this._skinned('Body', buildBody());
    this.items = {};
    this.loadout = {};
    this.weaponSocket = new THREE.Group();
    this.weaponSocket.name = 'WeaponSocket';
    this.rig.bone('RightHand').add(this.weaponSocket);
    for (const s of GEAR_SLOTS) this.equip(s.id, loadout[s.id] ?? null, false);
    this.pose = pose;
    this.updatePose();
  }

  _skinned(name, polys) {
    const { geometry, slots, triangles } = buildGeometry(Array.isArray(polys) ? polys : [polys], {
      slotOrder: SLOT_ORDER,
      boneIndex: this.rig.boneIndex,
    });
    const mesh = new THREE.SkinnedMesh(
      geometry,
      slots.map((s) => this.materials[s]),
    );
    mesh.name = name;
    mesh.userData.triangles = triangles;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.bind(this.skeleton, new THREE.Matrix4());
    this.group.add(mesh);
    return mesh;
  }

  _buildItem(slot, id) {
    const def = slot.items[id];
    const name = `${slot.node}_${id}`;
    if (slot.id === 'weapon') {
      const { geometry, slots, triangles } = buildGeometry([def.build()], { slotOrder: SLOT_ORDER });
      const mesh = new THREE.Mesh(
        geometry,
        slots.map((s) => this.materials[s]),
      );
      mesh.name = name;
      mesh.userData.triangles = triangles;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.weaponSocket.add(mesh);
      return mesh;
    }
    return this._skinned(name, def.build());
  }

  item(slotId, id) {
    const slot = GEAR_SLOTS.find((s) => s.id === slotId);
    const key = `${slotId}:${id}`;
    if (!this.items[key]) {
      this.items[key] = this._buildItem(slot, id);
      this.items[key].visible = false;
    }
    return this.items[key];
  }

  equip(slotId, id, repose = true) {
    const slot = GEAR_SLOTS.find((s) => s.id === slotId);
    if (!slot) throw new Error('Unknown slot ' + slotId);
    if (id && !slot.items[id]) throw new Error(`Unknown ${slotId} item ${id}`);
    if (!id && !slot.optional) id = slot.default;
    const cur = this.loadout[slotId];
    if (cur && this.items[`${slotId}:${cur}`]) this.items[`${slotId}:${cur}`].visible = false;
    this.loadout[slotId] = id || null;
    if (id) this.item(slotId, id).visible = true;
    if (slotId === 'weapon' && repose) this.updatePose();
  }

  setPose(pose) {
    this.pose = pose;
    this.updatePose();
  }

  updatePose(opts) {
    applyPose(this, this.pose, opts);
  }

  setColor(slot, hex) {
    this.colors[slot] = hex;
    this.materials[slot].color.set(hex);
  }

  setColors(colors) {
    for (const [k, v] of Object.entries(colors)) if (this.materials[k]) this.setColor(k, v);
  }

  /** Build every gear variant (hidden) — used by the modular export. */
  buildAllItems() {
    for (const slot of GEAR_SLOTS) for (const id of Object.keys(slot.items)) this.item(slot.id, id);
  }

  triangleCount(visibleOnly = true) {
    let n = 0;
    this.group.traverse((o) => {
      if (o.isMesh && (!visibleOnly || isVisible(o))) n += o.userData.triangles || 0;
    });
    return n;
  }
}

function isVisible(o) {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}
