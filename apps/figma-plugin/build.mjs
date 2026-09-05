import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import standalone from 'ajv/dist/standalone/index.js';
const root = resolve(import.meta.dirname, '../..');
const out = resolve(import.meta.dirname, 'dist/plugin');
await mkdir(out, { recursive: true });
const schema = JSON.parse(
  await readFile(
    resolve(root, 'packages/contracts/schemas/artifacts.schema.json'),
    'utf8',
  ),
);
const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  code: { source: true },
});
addFormats(ajv);
const validator = ajv.compile(schema);
await writeFile(resolve(out, 'schema.cjs'), standalone(ajv, validator));
const references = resolve(
  root,
  'packages/contracts/src/reference-validation.ts',
);
await writeFile(
  resolve(out, 'validation.js'),
  `import validate from './schema.cjs';import {validateReferences} from ${JSON.stringify(references)};
export function validateArtifact(input){if(!validate(input))return {ok:false,issues:validate.errors};const issues=validateReferences(input);return issues.length?{ok:false,issues}:{ok:true,value:input};}`,
);
await writeFile(
  resolve(out, 'contracts.js'),
  `export * from ${JSON.stringify(resolve(root, 'packages/contracts/src/live-protocol.ts'))};`,
);
const options = {
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2017',
  plugins: [
    {
      name: 'standalone-validation',
      setup(build) {
        build.onResolve({ filter: /^@website-to-figma\/contracts$/ }, () => ({
          path: resolve(out, 'contracts.js'),
        }));
        build.onResolve({ filter: /^\.\/validation\.js$/ }, () => ({
          path: resolve(out, 'validation.js'),
        }));
      },
    },
  ],
};
const ui = await build({
  ...options,
  entryPoints: [resolve(import.meta.dirname, 'src/ui.ts')],
  write: false,
});
const html = (
  await readFile(resolve(import.meta.dirname, 'ui.html'), 'utf8')
).replace('/* UI_BUNDLE */', ui.outputFiles[0].text);
await build({
  ...options,
  entryPoints: [resolve(import.meta.dirname, 'src/controller.ts')],
  outfile: resolve(out, 'code.js'),
  define: { __html__: JSON.stringify(html) },
});
const manifest = JSON.parse(
  await readFile(resolve(import.meta.dirname, 'manifest.json'), 'utf8'),
);
await writeFile(
  resolve(out, 'manifest.json'),
  JSON.stringify({ ...manifest, main: 'code.js' }, null, 2),
);
