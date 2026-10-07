// Palette material slots. Every face of the character is tagged with one of
// these slots, so recolouring the soldier = changing a slot colour.
import * as THREE from 'three';

export const SLOTS = [
  { id: 'uniform', label: 'Uniform', hint: 'Tunic, sleeves, trousers' },
  { id: 'olive', label: 'Dark olive', hint: 'Helmet, chin strap, canvas' },
  { id: 'webbing', label: 'Webbing', hint: 'Belt, pouches, straps, pack' },
  { id: 'skin', label: 'Skin', hint: 'Face and hands' },
  { id: 'hair', label: 'Hair', hint: 'Hair' },
  { id: 'leather', label: 'Leather', hint: 'Boots' },
  { id: 'sole', label: 'Sole', hint: 'Boot soles' },
  { id: 'wood', label: 'Wood', hint: 'Rifle furniture' },
  { id: 'metal', label: 'Metal', hint: 'Gun metal, buckles, studs' },
];

export const SLOT_ORDER = SLOTS.map((s) => s.id);

// Base colours (sRGB) tuned so the lit render matches the reference sheet.
export const PRESETS = {
  reference: {
    label: 'Olive drab (reference)',
    colors: {
      uniform: '#7f7d4a',
      olive: '#757243',
      webbing: '#b9925f',
      skin: '#dcaa76',
      hair: '#5a4434',
      leather: '#5a4a3c',
      sole: '#3c3631',
      wood: '#7e4a2a',
      metal: '#3d3d3c',
    },
  },
  desert: {
    label: 'Desert',
    colors: {
      uniform: '#c2a477',
      olive: '#a88d63',
      webbing: '#d4bd8f',
      skin: '#d9a56a',
      hair: '#4a3628',
      leather: '#8a6a48',
      sole: '#4a4038',
      wood: '#8a4f2c',
      metal: '#3b3b3a',
    },
  },
  winter: {
    label: 'Winter',
    colors: {
      uniform: '#d9dcd6',
      olive: '#c7cbc4',
      webbing: '#9a9b8e',
      skin: '#e2b184',
      hair: '#3d2f26',
      leather: '#4e4034',
      sole: '#2f2b28',
      wood: '#7c4a2c',
      metal: '#3b3b3a',
    },
  },
  grey: {
    label: 'Field grey',
    colors: {
      uniform: '#727a72',
      olive: '#5e655e',
      webbing: '#5a4a3a',
      skin: '#d9a56a',
      hair: '#7a5a3a',
      leather: '#3a2f27',
      sole: '#262321',
      wood: '#7a4a2a',
      metal: '#333436',
    },
  },
  jungle: {
    label: 'Jungle green',
    colors: {
      uniform: '#5f6f45',
      olive: '#4e5a37',
      webbing: '#8a8456',
      skin: '#b98557',
      hair: '#2c221b',
      leather: '#4a3a2b',
      sole: '#2a2622',
      wood: '#6e4024',
      metal: '#38393a',
    },
  },
  navy: {
    label: 'Navy',
    colors: {
      uniform: '#3e4a5e',
      olive: '#4c5566',
      webbing: '#b9ad8f',
      skin: '#d9a56a',
      hair: '#5a4231',
      leather: '#2f2925',
      sole: '#1f1d1c',
      wood: '#8a4f2c',
      metal: '#3b3b3a',
    },
  },
};

export function createMaterials(colors = PRESETS.reference.colors) {
  const mats = {};
  for (const slot of SLOTS) {
    const metalLike = slot.id === 'metal';
    const m = new THREE.MeshStandardMaterial({
      name: slot.id,
      color: new THREE.Color(colors[slot.id]),
      roughness: metalLike ? 0.55 : slot.id === 'skin' ? 0.8 : 0.92,
      metalness: metalLike ? 0.35 : 0,
      flatShading: true,
    });
    mats[slot.id] = m;
  }
  return mats;
}
