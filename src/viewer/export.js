// GLB export + file saving. Inside a claude.ai artifact the page cannot
// download directly, so it asks the viewer through the `downloads`
// capability (zip-wrapped, since .glb is not an allowed extension there);
// opened as a local file it triggers a normal browser download.
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

export async function exportGLB(soldier, { clips = [], allVariants = false } = {}) {
  const shown = [];
  if (allVariants) {
    soldier.buildAllItems();
    for (const obj of Object.values(soldier.items)) {
      shown.push([obj, obj.visible]);
      obj.visible = true;
    }
  }
  // the weapon socket is hidden in the bind pose; make sure it exports
  const sockVis = soldier.weaponSocket.visible;
  soldier.weaponSocket.visible = true;
  soldier.group.updateMatrixWorld(true);
  try {
    const exporter = new GLTFExporter();
    // skinned meshes must be root nodes in glTF (their parent transform is
    // ignored by spec), so export the skeleton and meshes as scene roots
    const roots = [soldier.rig.root, ...soldier.group.children.filter((c) => c !== soldier.rig.root)];
    const glb = await exporter.parseAsync(roots, {
      binary: true,
      onlyVisible: true,
      // multi-root export takes one animation list per root; clips bind to the skeleton
      animations: roots.map((r, i) => (i === 0 ? clips : [])),
    });
    return glb;
  } finally {
    for (const [obj, vis] of shown) obj.visible = vis;
    soldier.weaponSocket.visible = sockVis;
  }
}

// --- minimal stored (uncompressed) ZIP writer ------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zip(files) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const { name, data } of files) {
    const bytes = data instanceof Uint8Array ? data : typeof data === 'string' ? enc.encode(data) : new Uint8Array(data);
    const nameBytes = enc.encode(name);
    const crc = crc32(bytes);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true);
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, bytes.length, true);
    local.setUint32(22, bytes.length, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);
    chunks.push(new Uint8Array(local.buffer), nameBytes, bytes);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true);
    cen.setUint16(6, 20, true);
    cen.setUint16(8, 0x0800, true);
    cen.setUint16(10, 0, true);
    cen.setUint16(12, dosTime, true);
    cen.setUint16(14, dosDate, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, bytes.length, true);
    cen.setUint32(24, bytes.length, true);
    cen.setUint16(28, nameBytes.length, true);
    cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), nameBytes);
    offset += 30 + nameBytes.length + bytes.length;
  }
  const cenSize = central.reduce((s, c) => s + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cenSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

// --- saving -----------------------------------------------------------------
let downloadsNs;
/** Resolves the artifact `downloads` capability, or null outside claude.ai. */
export function artifactDownloads() {
  if (downloadsNs !== undefined) return Promise.resolve(downloadsNs);
  if (!window.claude || typeof window.claude.use !== 'function') return Promise.resolve((downloadsNs = null));
  return window.claude
    .use('downloads')
    .then((ns) => (downloadsNs = ns || null))
    .catch(() => (downloadsNs = null));
}

function browserDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Save a file. `files` is [{name, data}]; with one file outside claude.ai it
 * downloads directly, otherwise it is zipped (needed for .glb in artifacts).
 * Resolves to a short status string for the UI.
 */
export async function saveFiles(files, zipName) {
  const dl = await artifactDownloads();
  const direct = files.length === 1 && /\.(png|json|txt|md|csv)$/i.test(files[0].name);
  if (dl) {
    const payload = direct ? { filename: files[0].name, data: toBlob(files[0].data) } : { filename: zipName, data: zip(files) };
    try {
      await dl.save(payload);
      return { ok: true, message: `Saved ${payload.filename}` };
    } catch (e) {
      if (e && e.code === 'declined') return { ok: false, message: 'Save cancelled' };
      return { ok: false, message: `Could not save (${(e && e.code) || 'error'})` };
    }
  }
  if (files.length === 1) browserDownload(toBlob(files[0].data), files[0].name);
  else browserDownload(zip(files), zipName);
  return { ok: true, message: `Downloaded ${files.length === 1 ? files[0].name : zipName}` };
}

function toBlob(data) {
  return data instanceof Blob ? data : new Blob([data]);
}

