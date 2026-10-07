// Screenshots of the full viewer page (desktop, sheet mode, phone width).
// usage: node tools/app-shots.mjs [outDir]
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(process.argv[2] || path.join(root, 'out'));
const file = process.argv[3] || 'index.html';
await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function shoot(viewport, name, steps = async () => {}, fullPage = false) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.log(`[${name}] [${m.type()}]`, m.text());
  });
  let failed = null;
  page.on('pageerror', (e) => {
    console.log(`[${name}] [pageerror]`, e.message);
    failed = e;
  });
  await page.goto(pathToFileURL(path.join(root, file)).href);
  const deadline = Date.now() + 60000;
  while (!(await page.evaluate(() => window.__ready === true))) {
    if (failed) throw failed;
    if (Date.now() > deadline) throw new Error('page never became ready');
    await page.waitForTimeout(250);
  }
  await page.evaluate(() => {
    try {
      localStorage.clear();
    } catch {}
  });
  await page.waitForTimeout(600);
  await steps(page);
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(outDir, name + '.png'), fullPage });
  await page.close();
}

await shoot({ width: 1440, height: 900 }, 'desktop');
await shoot({ width: 1440, height: 900 }, 'sheet', async (p) => {
  await p.click('#mode-sheet');
});
await shoot({ width: 1440, height: 900 }, 'variants', async (p) => {
  await p.click('#slot-head-pot');
  await p.click('#slot-back-rucksack');
  await p.click('#slot-weapon-smg');
  await p.click('#slot-belt-canteen');
  await p.selectOption('#preset', 'desert');
});
await shoot({ width: 400, height: 860 }, 'mobile', async () => {}, true);
await browser.close();
console.log('saved to', outDir);
