// Bundles the viewer into self-contained HTML:
//   index.html                  complete document, open it straight from disk
//   dist/artifact.html          same page without the html/head/body wrapper,
//                               the shape claude.ai artifacts are published in
import * as esbuild from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const watch = process.argv.includes('--watch');

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
  const template = await fs.readFile(path.join(root, 'src/viewer/template.html'), 'utf8');
  const filled = template.replace('/*__CSS__*/', () => css).replace('/*__JS__*/', () => js);
  const [head, body] = filled.split('<!--BODY-->');
  const full = [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    head.trim(),
    '</head>',
    '<body>',
    body.trim(),
    '</body>',
    '</html>',
    '',
  ].join('\n');
  await fs.writeFile(path.join(root, 'index.html'), full);
  await fs.mkdir(path.join(root, 'dist'), { recursive: true });
  await fs.writeFile(path.join(root, 'dist/artifact.html'), head.trim() + '\n' + body.trim() + '\n');
  console.log(`built index.html (${(full.length / 1024).toFixed(0)} KB) + dist/artifact.html in ${Date.now() - t0} ms`);
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
