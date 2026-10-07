// Runs the Khronos glTF validator on the exported models.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import validator from 'gltf-validator';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = process.argv.slice(2).length ? process.argv.slice(2) : ['models/rifleman.glb', 'models/rifleman-modular-kit.glb'];
let failed = false;
for (const f of files) {
  const data = new Uint8Array(await fs.readFile(path.resolve(root, f)));
  const report = await validator.validateBytes(data);
  const { numErrors, numWarnings, numInfos, numHints } = report.issues;
  const info = report.info || {};
  console.log(`${f}: ${numErrors} errors, ${numWarnings} warnings, ${numInfos} infos, ${numHints} hints`);
  console.log(`  meshes ${info.meshCount ?? '?'} · materials ${info.materialCount ?? '?'} · animations ${info.animationCount ?? '?'} · skins ${info.skinCount ?? '?'} · triangles ${info.totalTriangleCount ?? '?'}`);
  for (const m of report.issues.messages.filter((m) => m.severity <= 1).slice(0, 12)) console.log(`  [${m.severity === 0 ? 'error' : 'warn'}] ${m.code}: ${m.message} @ ${m.pointer}`);
  if (numErrors) failed = true;
}
process.exit(failed ? 1 : 0);
