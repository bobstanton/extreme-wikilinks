import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await build({
  absWorkingDir: root, entryPoints: ['src/core.ts'], bundle: true,
  platform: 'browser', format: 'esm', write: false, logLevel: 'silent',
  plugins: [{ name: 'core-host-contract', setup(context) {
    context.onResolve({ filter: /^(obsidian|electron)(\/|$)/ }, args => ({ errors: [{ text: `Core cannot import ${args.path}` }] }));
  } }],
});
const program = ts.createProgram([path.join(root, 'types/core.d.ts')], {
  noEmit: true, strict: true, types: [], skipLibCheck: false,
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
});
const errors = ts.getPreEmitDiagnostics(program);
assert.equal(errors.length, 0, ts.formatDiagnosticsWithColorAndContext(errors, {
  getCanonicalFileName: file => file, getCurrentDirectory: () => root, getNewLine: () => '\n',
}));
assert.ok(!program.getSourceFiles().some(file => /\/node_modules\/obsidian\//.test(file.fileName)), 'Core declarations reach Obsidian');
console.log('Core bundles without a host shim and exposes portable declarations.');
