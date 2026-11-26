import { autocompletion, snippetCompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { BUILTIN_VALUE_NAMES, BUILTIN_VALUES, HELPERS, propertyAccess } from './builtins';
import { formatValue } from './valueFormat';

export interface TemplateEditorOptions {
  readonly parent: HTMLElement;
  readonly value: string;
  readonly label: string;
  onChange(value: string): void;
  getValues?(): TemplateValues | null;
}

export interface TemplateValues {
  readonly builtins: Readonly<Record<string, unknown>>;
  readonly frontmatter: Readonly<Record<string, unknown>>;
}

export function createTemplateEditor(options: TemplateEditorOptions): EditorView {
  return new EditorView({
    parent: options.parent,
    state: EditorState.create({
      doc: options.value,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ 'aria-label': options.label, spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off' }),
        autocompletion({ override: [context => completeTemplate(context, options.getValues?.() ?? null)], icons: false }),
        EditorView.updateListener.of(update => {
          if (update.docChanged) options.onChange(update.state.doc.toString());
        }),
      ],
    }),
  });
}

const WORD = /^[\w$]*$/;

const SECTIONS = {
  frontmatter: { name: 'Frontmatter', rank: 0 },
  builtin: { name: 'Built-in values', rank: 1 },
  helper: { name: 'Helpers', rank: 2 },
};

function completeTemplate(context: CompletionContext, values: TemplateValues | null): CompletionResult | null {
  const member = context.matchBefore(/\b(?:this|h)\.[\w$]*/);
  if (member) {
    const from = member.from + member.text.indexOf('.') + 1;
    const options = member.text.startsWith('h.') ? helperCompletions('') : valueCompletions(values, 'member');
    return { from, options, validFor: WORD };
  }

  const opened = context.matchBefore(/\{[\w$]*/);
  if (!opened) return null;
  return {
    from: opened.from + 1,
    options: [...valueCompletions(values, 'expression'), ...helperCompletions('h.')],
    validFor: WORD,
  };
}

function helperCompletions(prefix: string): Completion[] {
  return HELPERS.map(helper => {
    const args = /\((.*)\)/.exec(helper.signature)?.[1] ?? '';
    const fields = args ? args.split(', ').map(arg => `\${${arg}}`).join(', ') : '';
    return snippetCompletion(`${prefix}${helper.name}(${fields})`, {
      label: helper.name,
      displayLabel: `h.${helper.name}`,
      detail: `(${args})`,
      info: stripCode(helper.description),
      type: 'function',
      section: SECTIONS.helper,
    });
  });
}

function valueCompletions(values: TemplateValues | null, mode: 'member' | 'expression'): Completion[] {
  const frontmatter = Object.keys(values?.frontmatter ?? {})
    .filter(key => key !== 'position' && !BUILTIN_VALUE_NAMES.has(key))
    .map((key): Completion => ({
      label: key,
      displayLabel: `this${propertyAccess(key)}`,
      detail: preview(values?.frontmatter[key]),
      type: 'property',
      section: SECTIONS.frontmatter,
      apply: valueApply(key, mode),
    }));

  const builtins = BUILTIN_VALUES.map((builtin): Completion => ({
    label: builtin.name,
    displayLabel: `this${propertyAccess(builtin.name)}`,
    detail: values && !builtin.lazy ? preview(values.builtins[builtin.name], builtin.timestamp) : undefined,
    info: stripCode(builtin.description),
    type: 'variable',
    section: SECTIONS.builtin,
    apply: valueApply(builtin.name, mode),
  }));

  return [...frontmatter, ...builtins];
}

function valueApply(key: string, mode: 'member' | 'expression'): Completion['apply'] {
  const access = propertyAccess(key);
  if (mode === 'expression') return `this${access}`;
  if (access.startsWith('.')) return key;
  return (view, _completion, from, to) => {
    view.dispatch({ changes: { from: from - 1, to, insert: access }, selection: { anchor: from - 1 + access.length } });
  };
}

function preview(value: unknown, timestamp = false): string | undefined {
  return value === undefined || value === null ? undefined : formatValue(value, { maxLength: 40, timestamp });
}

function stripCode(text: string): string {
  return text.replace(/`/g, '');
}
