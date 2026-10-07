// Bundles the viewer into a single self-contained HTML file (index.html).
import * as esbuild from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const watch = process.argv.includes('--watch');
const outFile = path.join(root, process.argv.find((a) => a.startsWith('--out='))?.slice(6) || 'index.html');

async function build() {
  const t0 = Date.now();
  const result = await esbuild.build({
    entryPoints: [path.join(root, 'src/viewer/main.js')],
    bundle: true,
    format: 'iife',
    minify: true,
    write: false,
    target: 'es2020',
    legalComments: 'none',
    logLevel: 'warning',
  });
  const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const css = await fs.readFile(path.join(root, 'src/viewer/styles.css'), 'utf8');
  const html = (await fs.readFile(path.join(root, 'src/viewer/template.html'), 'utf8'))
    .replace('/*__CSS__*/', () => css)
    .replace('/*__JS__*/', () => js);
  await fs.writeFile(outFile, html);
  console.log(`built ${path.relative(root, outFile)} (${(html.length / 1024).toFixed(0)} KB) in ${Date.now() - t0} ms`);
}

await build();
if (watch) {
  const { watch: fsWatch } = await import('node:fs');
  let timer = null;
  fsWatch(path.join(root, 'src'), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => build().catch((e) => console.error(e.message)), 120);
  });
  console.log('watching src/ ...');
}
