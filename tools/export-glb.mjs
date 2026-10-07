// Exports the game-ready GLB files by driving the built viewer headlessly.
//   models/rifleman.glb               reference loadout + 5 animation clips
//   models/rifleman-modular-kit.glb   every gear variant as its own mesh
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'models');
await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1640, height: 1300 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
await page.addInitScript(() => {
  try {
    localStorage.clear();
  } catch {}
});
await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
for (const [all, name] of [
  [false, 'rifleman.glb'],
  [true, 'rifleman-modular-kit.glb'],
]) {
  const b64 = await page.evaluate((a) => window.__app.exportBase64(a), all);
  const buf = Buffer.from(b64, 'base64');
  await fs.writeFile(path.join(outDir, name), buf);
  console.log(`models/${name}  ${(buf.length / 1024).toFixed(0)} KB`);
}
// README image: the live turnaround sheet with labels
await fs.mkdir(path.join(root, 'docs'), { recursive: true });
const png = Buffer.from(await page.evaluate(() => window.__app.sheetBase64()), 'base64');
await fs.writeFile(path.join(root, 'docs/sheet.png'), png);
console.log(`docs/sheet.png  ${(png.length / 1024).toFixed(0)} KB`);
await browser.close();
