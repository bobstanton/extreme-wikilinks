import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readmePath = path.join(root, 'README.md');
const START = '<!-- builtins:start -->';
const END = '<!-- builtins:end -->';

const entry = `
export { BUILTIN_VALUES, HELPERS } from './src/builtins';
export { collectTemplateValues } from './src/templateEngine';
export { createHelpers, ObsidianContextProvider } from 'placeholder-resolver';
`;
const result = await build({
  absWorkingDir: root, bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent',
  stdin: { contents: entry, resolveDir: root, loader: 'ts' },
  plugins: [{ name: 'obsidian-stub', setup(context) {
    context.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'stub' }));
    context.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: 'export class App {} export class TFile {} export const normalizePath = p => p; export const parseFrontMatterTags = () => null;',
      loader: 'js',
    }));
  } }],
});
const module = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const { BUILTIN_VALUES, HELPERS, collectTemplateValues, createHelpers, ObsidianContextProvider } = module;

const file = { path: 'Folder/Note.md', basename: 'Note', name: 'Note.md', extension: 'md', stat: { ctime: 0, mtime: 0, size: 0 } };
const app = {
  vault: { getName: () => 'Vault', cachedRead: async () => '', getAbstractFileByPath: () => null },
  metadataCache: { getFileCache: () => ({ frontmatter: {} }), getFirstLinkpathDest: () => null },
};
const context = { basename: 'Note', linkDestination: 'Note', linkDisplayText: 'Note', path: file.path, title: 'Note', wikilink: '[[Note]]', frontmatter: {} };
const provided = new Set([
  ...Object.keys(collectTemplateValues(app, file, context)),
  ...Object.keys(new ObsidianContextProvider(app, file).getLazyProperties()),
]);
const documented = new Set(BUILTIN_VALUES.map(value => value.name));
assert.deepEqual([...provided].filter(name => !documented.has(name)), [], 'Template values missing from src/builtins.ts');
assert.deepEqual([...documented].filter(name => !provided.has(name)), [], 'src/builtins.ts lists values templates do not get');
const helperNames = Object.keys(createHelpers());
const documentedHelpers = new Set(HELPERS.map(helper => helper.name));
assert.deepEqual(helperNames.filter(name => !documentedHelpers.has(name)), [], 'Helpers missing from src/builtins.ts');
assert.deepEqual([...documentedHelpers].filter(name => !helperNames.includes(name)), [], 'src/builtins.ts lists helpers that do not exist');

const lines = [START, ''];
for (const group of ['Link', 'Note', 'Date and vault']) {
  lines.push(`**${group}**`, '');
  for (const value of BUILTIN_VALUES.filter(item => item.group === group)) {
    lines.push(`- \`{this.${value.name}}\` - ${value.description}`);
  }
  lines.push('');
}
lines.push('### Helpers', '', 'Helpers are under `h`, such as `{h.joinPresent([this.Distance, this.Address], " - ")}`:', '');
for (const helper of HELPERS) {
  lines.push(`- \`h.${helper.signature}\` - ${helper.description}`);
}
lines.push('', END);
const generated = lines.join('\n');

const readme = await fs.readFile(readmePath, 'utf8');
const start = readme.indexOf(START);
const end = readme.indexOf(END);
assert.ok(start >= 0 && end > start, `README.md needs ${START} and ${END} markers`);
const next = readme.slice(0, start) + generated + readme.slice(end + END.length);

if (process.argv.includes('--check')) {
  assert.equal(readme, next, 'README.md is out of date. Run npm run readme.');
  console.log('README built-in values and helpers match the template engine.');
} else if (next !== readme) {
  await fs.writeFile(readmePath, next);
  console.log('Updated README.md');
} else {
  console.log('README.md is up to date');
}
