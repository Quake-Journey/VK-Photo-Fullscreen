const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
for (const scale of [2, 3, 4]) {
  const modelSource = path.join(root, `node_modules/@upscalerjs/esrgan-slim/models/x${scale}`);
  const target = path.join(root, `extension/models/esrgan-slim-${scale}x`);
  fs.mkdirSync(target, { recursive: true });
  for (const name of ['model.json', 'group1-shard1of1.bin']) fs.copyFileSync(path.join(modelSource, name), path.join(target, name));
}
const licenses = path.join(root, 'extension/licenses'); fs.mkdirSync(licenses, { recursive: true });
for (const [pkg, file] of [['upscaler','UPSCALER.txt'], ['@upscalerjs/esrgan-slim','ESRGAN-SLIM.txt']]) {
  fs.copyFileSync(path.join(root,'node_modules',pkg,'LICENSE'),path.join(licenses,file));
}
esbuild.buildSync({ entryPoints: [path.join(root, 'src/processor.mjs')], bundle: true, minify: true,
  platform: 'browser', format: 'iife', target: 'chrome116', legalComments: 'eof',
  outfile: path.join(root, 'extension/processor.bundle.js') });
console.log('Local AI bundle and ESRGAN Slim 2x/3x/4x weights prepared.');
