import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Soldier, GEAR_SLOTS, DEFAULT_LOADOUT } from '../soldier/soldier.js';
import { SLOTS, PRESETS } from '../soldier/palette.js';
import { POSES } from '../soldier/poses.js';
import { ANIMATIONS, buildClips } from '../soldier/animations.js';
import { createRenderer, createStage, placeCamera, VIEWS, CAMERA_TARGET } from './stage.js';
import { Sheet, BOARD, SHEET_VIEWS } from './sheet.js';
import { exportGLB, saveFiles, artifactDownloads } from './export.js';

const params = new URLSearchParams(location.search);
if (params.has('shots')) runShots();
else runApp();

// ---------------------------------------------------------------------------
// Interactive viewer
// ---------------------------------------------------------------------------
function runApp() {
  const $ = (sel) => document.querySelector(sel);
  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem('lowpoly-rifleman:' + key);
        return v ? JSON.parse(v) : fallback;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem('lowpoly-rifleman:' + key, JSON.stringify(value));
      } catch {
        /* storage unavailable: settings just won't persist */
      }
    },
  };

  const savedLoadout = store.get('loadout', {});
  const loadout = { ...DEFAULT_LOADOUT };
  for (const slot of GEAR_SLOTS) {
    const v = savedLoadout[slot.id];
    if (v === null && slot.optional) loadout[slot.id] = null;
    else if (v && slot.items[v]) loadout[slot.id] = v;
  }
  const colors = { ...PRESETS.reference.colors, ...store.get('colors', {}) };
  const state = {
    mode: store.get('mode', 'inspect') === 'sheet' ? 'sheet' : 'inspect',
    preset: store.get('preset', 'reference'),
    anim: 'ready',
    view: 'q34',
    orbit: false,
  };

  const stageEl = $('#stage');
  const canvas = $('#view');
  const renderer = createRenderer(canvas, { preserve: true });
  const stage = createStage();
  const soldier = new Soldier({ colors, loadout });
  stage.scene.add(soldier.group);
  const sheet = new Sheet(renderer, stage, soldier);
  let sheetDirty = false;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0.92, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 1.0;
  controls.maxDistance = 9;
  controls.maxPolarAngle = Math.PI * 0.53;
  controls.screenSpacePanning = true;
  controls.autoRotateSpeed = 1.6;
  const viewDistance = 4.1;
  let dirty = true;
  let tween = null;
  const timer = new THREE.Timer();
  setCamera(state.view, false);

  // animation
  const mixer = new THREE.AnimationMixer(soldier.group);
  let clips = buildClips(soldier);
  let action = null;

  // ---- rendering ----------------------------------------------------------
  controls.addEventListener('change', () => (dirty = true));
  controls.addEventListener('start', () => {
    tween = null;
    userMoved = true;
    setPressed('.views', null);
  });

  function layout() {
    const r = stageEl.getBoundingClientRect();
    let w = r.width;
    let h = r.height;
    const overlay = $('#sheetOverlay');
    if (state.mode === 'sheet') {
      const scale = Math.min(w / BOARD.w, h / BOARD.h);
      const bw = Math.floor(BOARD.w * scale);
      const bh = Math.floor(BOARD.h * scale);
      const left = Math.floor((w - bw) / 2);
      const top = Math.floor((h - bh) / 2);
      for (const el of [canvas, overlay]) {
        Object.assign(el.style, { left: left + 'px', top: top + 'px', width: bw + 'px', height: bh + 'px', inset: 'auto' });
      }
      overlay.style.fontSize = Math.max(7, bh * 0.0175) + 'px';
      w = bw;
      h = bh;
    } else {
      canvas.style.cssText = '';
    }
    renderer.setSize(Math.max(1, w), Math.max(1, h), false);
    const prevAspect = camera.aspect;
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    if (state.mode === 'inspect' && !tween && Math.abs(prevAspect - camera.aspect) > 0.05 && !userMoved) setCamera(state.view, false);
    dirty = true;
    sheetDirty = true;
  }
  let userMoved = false;
  new ResizeObserver(layout).observe(stageEl);

  function render() {
    const size = renderer.getSize(new THREE.Vector2());
    if (state.mode === 'sheet') {
      sheet.render(size.x, size.y);
    } else {
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, size.x, size.y);
      stage.alignLights(camera, controls.target);
      renderer.render(stage.scene, camera);
    }
  }

  function tick(now) {
    timer.update(now);
    const dt = Math.min(timer.getDelta(), 0.1);
    let moving = false;
    if (tween) {
      tween.t = Math.min(1, tween.t + dt / tween.dur);
      const k = tween.t < 0.5 ? 4 * tween.t ** 3 : 1 - (-2 * tween.t + 2) ** 3 / 2;
      const off = tween.from.clone().lerp(tween.to, k);
      const len = THREE.MathUtils.lerp(tween.fromLen, tween.toLen, k);
      camera.position.copy(controls.target).add(off.normalize().multiplyScalar(len));
      camera.lookAt(controls.target);
      if (tween.t >= 1) tween = null;
      moving = true;
    }
    controls.autoRotate = state.orbit && state.mode === 'inspect';
    controls.update(dt);
    if (action) {
      mixer.update(dt);
      moving = true;
    }
    if (dirty || moving || controls.autoRotate || (state.mode === 'sheet' && sheetDirty)) {
      render();
      dirty = false;
      sheetDirty = false;
    }
    requestAnimationFrame(tick);
  }

  function setCamera(view, animate = true) {
    state.view = view;
    const v = VIEWS[view];
    // inspect "top" keeps the orbit up-vector: almost straight down, back at top
    const preset = view === 'top' ? { az: 0, el: 86 } : v;
    const tmp = camera.clone();
    const fitWidth = 1.4 / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.max(0.2, camera.aspect));
    const distance = Math.max(view === 'top' ? 4.4 : viewDistance, fitWidth);
    placeCamera(tmp, preset, { distance, target: controls.target });
    tmp.up.set(0, 1, 0);
    if (!animate) {
      camera.position.copy(tmp.position);
      camera.up.set(0, 1, 0);
      camera.lookAt(controls.target);
      controls.update();
      dirty = true;
      return;
    }
    const from = camera.position.clone().sub(controls.target);
    const to = tmp.position.clone().sub(controls.target);
    tween = { from, to, fromLen: from.length(), toLen: to.length(), t: 0, dur: 0.7 };
  }

  // ---- HUD: views & animations -------------------------------------------
  const viewsEl = $('.views');
  for (const [id, v] of Object.entries(VIEWS)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip-btn';
    b.id = 'view-' + id;
    b.textContent = v.label;
    b.dataset.value = id;
    b.setAttribute('aria-pressed', String(id === state.view));
    b.addEventListener('click', () => {
      userMoved = false;
      setCamera(id);
      setPressed('.views', id);
    });
    viewsEl.appendChild(b);
  }
  $('#orbit').addEventListener('click', (e) => {
    state.orbit = !state.orbit;
    e.currentTarget.setAttribute('aria-pressed', String(state.orbit));
    if (state.orbit) setPressed('.views', null);
  });

  const animsEl = $('#anims');
  for (const a of ANIMATIONS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip-btn';
    b.id = 'anim-' + a.id;
    b.textContent = a.label;
    b.title = a.hint;
    b.dataset.value = a.id;
    b.setAttribute('aria-pressed', String(a.id === state.anim));
    b.addEventListener('click', () => setAnim(a.id));
    animsEl.appendChild(b);
  }

  function setPressed(groupSel, value) {
    document.querySelectorAll(`${groupSel} button`).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === value)));
  }

  function setAnim(id) {
    state.anim = id;
    setPressed('#anims', id);
    if (action) {
      action.stop();
      action = null;
    }
    mixer.stopAllAction();
    if (id === 'ready' || id === 'tpose') {
      soldier.setPose(id);
    } else {
      soldier.setPose('ready');
      soldier.weaponSocket.visible = true;
      action = mixer.clipAction(clips[id]);
      action.reset().play();
    }
    dirty = true;
    sheetDirty = true;
  }

  // ---- loadout --------------------------------------------------------------
  const loadoutEl = $('#loadout');
  for (const slot of GEAR_SLOTS) {
    const fs = document.createElement('fieldset');
    fs.className = 'slot';
    const lg = document.createElement('legend');
    lg.textContent = slot.label;
    fs.appendChild(lg);
    const opts = document.createElement('div');
    opts.className = 'opts';
    const entries = Object.entries(slot.items).map(([id, def]) => [id, def.label]);
    if (slot.optional) entries.push([null, 'None']);
    for (const [id, label] of entries) {
      const lab = document.createElement('label');
      lab.className = 'opt';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'slot-' + slot.id;
      input.id = `slot-${slot.id}-${id ?? 'none'}`;
      input.value = id ?? '';
      input.checked = soldier.loadout[slot.id] === id;
      input.addEventListener('change', () => equip(slot.id, id));
      const span = document.createElement('span');
      span.textContent = label;
      if (id && id === slot.default) {
        const em = document.createElement('em');
        em.textContent = ' · ref';
        span.appendChild(em);
      }
      lab.append(input, span);
      opts.appendChild(lab);
    }
    fs.appendChild(opts);
    loadoutEl.appendChild(fs);
  }

  function syncLoadoutInputs() {
    for (const slot of GEAR_SLOTS) {
      const id = soldier.loadout[slot.id];
      const el = document.getElementById(`slot-${slot.id}-${id ?? 'none'}`);
      if (el) el.checked = true;
    }
  }

  function equip(slotId, id) {
    soldier.equip(slotId, id);
    store.set('loadout', soldier.loadout);
    if (slotId === 'weapon') {
      clips = buildClips(soldier);
      setAnim(state.anim);
    }
    sheet.rebuildGear();
    updateStats();
    dirty = true;
    sheetDirty = true;
  }

  $('#resetLoadout').addEventListener('click', () => {
    for (const slot of GEAR_SLOTS) soldier.equip(slot.id, slot.default, false);
    store.set('loadout', soldier.loadout);
    clips = buildClips(soldier);
    setAnim(state.anim);
    sheet.rebuildGear();
    syncLoadoutInputs();
    updateStats();
  });

  // ---- palette --------------------------------------------------------------
  const presetEl = $('#preset');
  for (const [id, p] of Object.entries(PRESETS)) {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = p.label;
    presetEl.appendChild(o);
  }
  const custom = document.createElement('option');
  custom.value = 'custom';
  custom.textContent = 'Custom';
  presetEl.appendChild(custom);
  presetEl.value = PRESETS[state.preset] ? state.preset : 'custom';

  const paletteEl = $('#palette');
  for (const slot of SLOTS) {
    const li = document.createElement('li');
    const input = document.createElement('input');
    input.type = 'color';
    input.id = 'color-' + slot.id;
    input.value = soldier.colors[slot.id];
    input.title = slot.hint;
    const lab = document.createElement('label');
    lab.htmlFor = input.id;
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = slot.label;
    const code = document.createElement('code');
    code.id = 'hex-' + slot.id;
    code.textContent = soldier.colors[slot.id];
    lab.append(name, code);
    input.addEventListener('input', () => {
      setColor(slot.id, input.value);
      presetEl.value = 'custom';
      state.preset = 'custom';
      store.set('preset', 'custom');
    });
    li.append(input, lab);
    paletteEl.appendChild(li);
  }

  function setColor(id, hex) {
    soldier.setColor(id, hex);
    document.getElementById('color-' + id).value = hex;
    document.getElementById('hex-' + id).textContent = hex;
    store.set('colors', soldier.colors);
    drawSheetOverlay();
    dirty = true;
    sheetDirty = true;
  }

  presetEl.addEventListener('change', () => {
    const p = PRESETS[presetEl.value];
    if (!p) return;
    state.preset = presetEl.value;
    store.set('preset', state.preset);
    for (const [id, hex] of Object.entries(p.colors)) setColor(id, hex);
  });

  // ---- mode switch & sheet overlay -----------------------------------------
  function setMode(mode) {
    state.mode = mode;
    store.set('mode', mode);
    for (const b of document.querySelectorAll('.modes button')) b.setAttribute('aria-selected', String(b.dataset.mode === mode));
    stageEl.classList.toggle('sheet', mode === 'sheet');
    $('#sheetOverlay').hidden = mode !== 'sheet';
    controls.enabled = mode === 'inspect';
    if (mode === 'sheet') sheet.rebuildGear();
    layout();
    drawSheetOverlay();
  }
  for (const b of document.querySelectorAll('.modes button')) b.addEventListener('click', () => setMode(b.dataset.mode));

  // board-space text & frames, mirrored onto the image export
  function sheetMarks() {
    const marks = [];
    for (const v of SHEET_VIEWS) marks.push({ kind: 'label', text: v.label, x: (v.x0 + v.x1) / 2, y: 601, size: 1 });
    marks.push({ kind: 'label', text: 'Palette', x: 1381, y: 114, size: 0.95 });
    const pal = ['olive', 'uniform', 'webbing', 'leather', 'sole', 'metal'];
    pal.forEach((id, i) => marks.push({ kind: 'swatch', color: soldier.colors[id], x: 1344, y: 140 + i * 55, w: 42, h: 42 }));
    marks.push({ kind: 'rule', x: 25, y: 679, w: 1397 });
    marks.push({ kind: 'frame', x: 25, y: 700, w: 1397, h: 305 });
    marks.push({ kind: 'vrule', x: 620, y: 720, h: 268 });
    marks.push({ kind: 'label', text: 'Weapon (shared)', x: 57, y: 731, size: 1, left: true });
    marks.push({ kind: 'label', text: 'Gear details (shared)', x: 678, y: 731, size: 1, left: true });
    return marks;
  }

  function drawSheetOverlay() {
    const ov = $('#sheetOverlay');
    ov.textContent = '';
    if (state.mode !== 'sheet') return;
    const pct = (v, total) => (100 * v) / total + '%';
    for (const m of sheetMarks()) {
      const el = document.createElement('div');
      if (m.kind === 'label') {
        el.className = 'lbl' + (m.left ? ' left' : '');
        el.textContent = m.text;
        el.style.left = pct(m.x, BOARD.w);
        el.style.top = pct(m.y, BOARD.h);
        el.style.fontSize = m.size + 'em';
      } else if (m.kind === 'swatch') {
        el.className = 'sw';
        Object.assign(el.style, { left: pct(m.x, BOARD.w), top: pct(m.y, BOARD.h), width: pct(m.w, BOARD.w), height: pct(m.h, BOARD.h), background: m.color });
      } else if (m.kind === 'rule') {
        el.className = 'rule';
        Object.assign(el.style, { left: pct(m.x, BOARD.w), top: pct(m.y, BOARD.h), width: pct(m.w, BOARD.w) });
      } else if (m.kind === 'vrule') {
        el.className = 'vrule';
        Object.assign(el.style, { left: pct(m.x, BOARD.w), top: pct(m.y, BOARD.h), height: pct(m.h, BOARD.h) });
      } else if (m.kind === 'frame') {
        el.className = 'frame';
        Object.assign(el.style, { left: pct(m.x, BOARD.w), top: pct(m.y, BOARD.h), width: pct(m.w, BOARD.w), height: pct(m.h, BOARD.h) });
      }
      ov.appendChild(el);
    }
  }

  // ---- stats & spec ------------------------------------------------------------
  function updateStats() {
    const tris = soldier.triangleCount();
    $('#stats').textContent = `${tris.toLocaleString('en-US')} tris · ${soldier.rig.bones.length} bones`;
  }
  const spec = [
    ['Height', '1.80 m with helmet (Y-up, metres)'],
    ['Facing', '+Z forward, glTF convention'],
    ['Skeleton', `${soldier.rig.bones.length} bones, humanoid names (Hips, Spine, Chest, LeftUpperArm…)`],
    ['Bind pose', 'T-pose; the ready pose is stored as the default pose'],
    ['Gear', 'Each item is its own skinned mesh on the shared skeleton; weapons hang off a socket on the right hand'],
    ['Materials', `${SLOTS.length} flat colour slots: ${SLOTS.map((s) => s.label.toLowerCase()).join(', ')}`],
    ['Clips', ANIMATIONS.map((a) => a.label).join(', ')],
  ];
  const specEl = $('#spec');
  for (const [k, v] of spec) {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v;
    specEl.append(dt, dd);
  }

  // ---- export ---------------------------------------------------------------
  const toastEl = $('#toast');
  let toastTimer;
  function toast(msg, ok = true) {
    toastEl.textContent = msg;
    toastEl.classList.toggle('bad', !ok);
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3200);
  }

  async function withBusy(btn, fn) {
    btn.disabled = true;
    try {
      const res = await fn();
      if (res) toast(res.message, res.ok);
    } catch (err) {
      console.error(err);
      toast('Export failed: ' + (err && err.message ? err.message : err), false);
    } finally {
      btn.disabled = false;
    }
  }

  function loadoutName() {
    const parts = GEAR_SLOTS.map((s) => soldier.loadout[s.id]).filter(Boolean);
    return parts.join('-');
  }

  async function exportModel(all) {
    // export in the static pose currently selected (ready pose by default)
    const playing = action;
    if (playing) playing.paused = true;
    const pose = state.anim === 'tpose' ? 'tpose' : 'ready';
    soldier.setPose(pose);
    const glb = await exportGLB(soldier, { clips: Object.values(clips), allVariants: all });
    if (playing) playing.paused = false;
    const base = all ? 'rifleman-modular-kit' : `rifleman-${loadoutName()}`;
    const readme = [
      'Low-Poly Rifleman',
      '',
      `${base}.glb  (binary glTF 2.0, metres, Y-up, faces +Z)`,
      '',
      'Nodes: Root/Hips/... humanoid skeleton; Body + one skinned mesh per gear item',
      '(Head_*, Back_*, Harness_*, Belt_*, Feet_*); weapons under RightHand/WeaponSocket.',
      'Animations: ' + Object.values(clips).map((c) => c.name).join(', '),
      all ? 'Modular kit: every variant is included and visible; hide the ones you do not use.' : 'Loadout: ' + JSON.stringify(soldier.loadout),
      '',
    ].join('\n');
    return saveFiles(
      [
        { name: `${base}.glb`, data: glb },
        { name: 'README.txt', data: readme },
      ],
      `${base}.zip`,
    );
  }

  $('#exportGlb').addEventListener('click', (e) => withBusy(e.currentTarget, () => exportModel(false)));
  $('#exportKit').addEventListener('click', (e) => withBusy(e.currentTarget, () => exportModel(true)));
  $('#exportPng').addEventListener('click', (e) =>
    withBusy(e.currentTarget, async () => {
      render();
      const blob = await snapshot();
      const name = state.mode === 'sheet' ? 'rifleman-sheet.png' : `rifleman-${state.view}.png`;
      return saveFiles([{ name, data: blob }], name.replace('.png', '.zip'));
    }),
  );

  /** PNG of the canvas; in sheet mode the labels and frames are painted in. */
  async function snapshot() {
    if (state.mode !== 'sheet') return new Promise((res) => canvas.toBlob(res, 'image/png'));
    const W = canvas.width;
    const H = canvas.height;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    g.drawImage(canvas, 0, 0);
    const sx = W / BOARD.w;
    const sy = H / BOARD.h;
    const font = getComputedStyle(document.documentElement).getPropertyValue('--font-display');
    for (const m of sheetMarks()) {
      if (m.kind === 'label') {
        g.fillStyle = '#b7bab0';
        g.font = `500 ${Math.round(19 * m.size * sy)}px ${font}`;
        g.textAlign = m.left ? 'left' : 'center';
        g.textBaseline = 'middle';
        const text = m.text.toUpperCase().split('').join(String.fromCharCode(8202));
        g.fillText(text, m.x * sx, m.y * sy);
      } else if (m.kind === 'swatch') {
        g.fillStyle = m.color;
        g.fillRect(m.x * sx, m.y * sy, m.w * sx, m.h * sy);
      } else {
        g.strokeStyle = '#4a5257';
        g.lineWidth = Math.max(1, sx);
        g.beginPath();
        if (m.kind === 'rule') {
          g.moveTo(m.x * sx, m.y * sy);
          g.lineTo((m.x + m.w) * sx, m.y * sy);
        } else if (m.kind === 'vrule') {
          g.moveTo(m.x * sx, m.y * sy);
          g.lineTo(m.x * sx, (m.y + m.h) * sy);
        } else if (m.kind === 'frame') {
          const r = 18 * sx;
          g.roundRect(m.x * sx, m.y * sy, m.w * sx, m.h * sy, r);
        }
        g.stroke();
      }
    }
    return new Promise((res) => c.toBlob(res, 'image/png'));
  }

  artifactDownloads().then((dl) => {
    if (dl) $('#exportNote').textContent += ' Inside claude.ai the files arrive zipped, with a short README.';
  });

  // ---- start ------------------------------------------------------------------
  updateStats();
  setMode(state.mode);
  requestAnimationFrame(tick);
  window.__app = {
    soldier,
    renderer,
    camera,
    controls,
    setMode,
    setAnim,
    equip,
    setColor,
    render,
    sheet,
    /** Sheet image used by tools/export-glb.mjs (docs/sheet.png). */
    async sheetBase64() {
      setMode('sheet');
      render();
      const blob = await snapshot();
      const buf = new Uint8Array(await blob.arrayBuffer());
      let bin = '';
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return btoa(bin);
    },
    /** Export used by tools/export-glb.mjs: returns base64 of the GLB. */
    async exportBase64(all = false) {
      soldier.setPose('ready');
      const glb = await exportGLB(soldier, { clips: Object.values(clips), allVariants: all });
      let bin = '';
      const bytes = new Uint8Array(glb);
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    },
  };
  window.__ready = true;
}

// ---------------------------------------------------------------------------
// Headless screenshot harness (?shots=front,q34,...) used by tools/screenshots
// ---------------------------------------------------------------------------
function runShots() {
  document.body.classList.add('shots');
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const renderer = createRenderer(canvas, { preserve: true });
  const stage = createStage();
  const soldier = new Soldier();
  stage.scene.add(soldier.group);
  window.__soldier = soldier;
  const camera = new THREE.PerspectiveCamera(27, 1, 0.05, 100);
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
  if (params.has('loadout')) {
    for (const kv of params.get('loadout').split(';')) {
      const [k, v] = kv.split(':');
      soldier.equip(k, v === 'none' ? null : v);
    }
  }
  if (params.has('colors')) soldier.setColors(PRESETS[params.get('colors')].colors);
  if (params.has('pose')) soldier.setPose(params.get('pose'));
  else soldier.updatePose();
  if (params.has('clip')) {
    const clips = buildClips(soldier);
    const mixer = new THREE.AnimationMixer(soldier.group);
    const act = mixer.clipAction(clips[params.get('clip')]);
    act.play();
    mixer.setTime(+params.get('t') || 0);
  }
  if (params.has('solo')) {
    const [slot, id] = params.get('solo').split(':');
    const obj = soldier.item(slot, id);
    soldier.group.visible = false;
    if (slot === 'weapon') {
      const clone = new THREE.Mesh(obj.geometry, obj.material);
      clone.castShadow = true;
      clone.rotation.y = -Math.PI / 2;
      clone.position.set(0, 1.0, 0);
      clone.scale.setScalar(1.6);
      stage.scene.add(clone);
    }
  }
  if (params.has('fov')) camera.fov = +params.get('fov');
  if (params.has('exp')) renderer.toneMappingExposure = +params.get('exp');
  const out = {};
  const vec = (s) => new THREE.Vector3(...s.split(',').map(Number));
  for (const v of params.get('shots').split(',')) {
    if (v === 'sheet') {
      renderer.setSize(W, Math.round((W * BOARD.h) / BOARD.w), false);
      const sheet = new Sheet(renderer, stage, soldier);
      const size = renderer.getSize(new THREE.Vector2());
      sheet.render(size.x, size.y);
      out[v] = canvas.toDataURL('image/png');
      renderer.setSize(W, H, false);
      continue;
    }
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
}
