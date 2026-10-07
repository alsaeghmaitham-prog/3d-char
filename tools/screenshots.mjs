// Renders views of the built viewer in headless Chromium.
// usage: node tools/screenshots.mjs [outDir] [query]
//   e.g. node tools/screenshots.mjs out "shots=front,q34,side,back,top&w=500&h=920"
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(process.argv[2] || path.join(root, 'out'));
const query = process.argv[3] || 'shots=front,q34,side,back,top&w=500&h=920';
const page404 = [];

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}]`, m.text());
});
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(pathToFileURL(path.join(root, 'index.html')).href + '?' + query);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
await fs.mkdir(outDir, { recursive: true });
const shots = await page.evaluate(() => window.__shots || null);
if (shots) {
  for (const [name, url] of Object.entries(shots)) {
    await fs.writeFile(path.join(outDir, `${name}.png`), Buffer.from(url.split(',')[1], 'base64'));
  }
  console.log('saved', Object.keys(shots).join(', '), 'to', outDir);
} else {
  await page.screenshot({ path: path.join(outDir, 'page.png') });
  console.log('saved page.png');
}
await browser.close();
