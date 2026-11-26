import { App, Component, debounce, Events, MarkdownRenderChild, Notice, parseFrontMatterEntry, setIcon, TFile, type MarkdownPostProcessorContext } from 'obsidian';
import { BUILTIN_VALUE_NAMES, BUILTIN_VALUES, HELPERS, propertyAccess } from './builtins';
import { parseBlockSource, type BlockLink, type BlockSource } from './blockSource';
import { messageOf } from './errors';
import { compileRegex } from './regexUtils';
import { createTemplate, type ExtremeWikilinksSettings, type LinkTemplate } from './settings';
import type { TemplateContext } from './templateContext';
import { createTemplateEditor, type TemplateValues } from './templateEditor';
import { collectTemplateValues, renderTemplate, TemplateRenderError } from './templateEngine';
import { explainTemplateChoice, type TemplateCheck } from './templateMatcher';
import { applyTemplateName, hasBlockLevelOutput, renderTemplateMarkdown } from './templateOutputRenderer';
import { formatValue, UnreadableValue } from './valueFormat';
import { createTemplateContext, findHeadingBeforeLine, resolveTargetFile } from './wikilinkRender';

export const CODE_BLOCK_LANGUAGE = 'extreme-wikilinks';
export const BLOCK_CLASS = 'extreme-wikilinks-block';
export const SETTINGS_CHANGED = 'settings-changed';

export type SaveTemplateResult = 'created' | 'updated';

export interface CodeBlockHost {
  readonly app: App;
  readonly events: Events;
  getSettings(): ExtremeWikilinksSettings;
  saveTemplate(name: string, body: string): Promise<SaveTemplateResult>;
}

export function processCodeBlock(host: CodeBlockHost, source: string, el: HTMLElement, context: MarkdownPostProcessorContext): void {
  context.addChild(new ExtremeWikilinksBlock(host, source, el, context));
}

const STATE_ICONS = { rendered: 'check', plain: 'minus', error: 'alert-triangle' } as const;
const RENDER_DELAY = 250;

interface EntryTarget {
  readonly file: TFile;
  readonly context: TemplateContext;
}

interface EntryBase {
  readonly link: BlockLink;
  readonly tag: string;
  readonly group: string | null;
  readonly why: string;
  readonly skipped: readonly TemplateCheck[];
  readonly template?: LinkTemplate;
  readonly target?: EntryTarget;
}

type Entry = EntryBase & (
  | { readonly state: 'plain' }
  | { readonly state: 'rendered'; readonly markdown: string }
  | { readonly state: 'error'; readonly message: string; readonly diagnostics: readonly string[] }
);

interface Frame {
  readonly component: Component;
  readonly chips: HTMLElement | null;
  readonly list: HTMLElement;
  readonly detail: HTMLElement;
  detailComponent: Component | null;
}

class ExtremeWikilinksBlock extends MarkdownRenderChild {
  private readonly block: BlockSource;
  private readonly bodyEl: HTMLElement;
  private readonly editorEl: HTMLElement | null;
  private readonly watchedPaths = new Set<string>();
  private readonly renderSoon = debounce(() => this.render(), RENDER_DELAY, true);
  private generation = 0;
  private frame: Frame | null = null;
  private entries: Entry[] = [];
  private selected = 0;
  private filter: { readonly group: string | null } | null = null;
  private skippedOpen = false;
  private helpersOpen = false;
  private draft: string;

  constructor(private readonly host: CodeBlockHost, source: string, containerEl: HTMLElement, private readonly context: MarkdownPostProcessorContext) {
    super(containerEl);
    this.block = parseBlockSource(source);
    this.draft = this.block.template ?? '';
    containerEl.empty();
    const root = containerEl.createDiv({ cls: BLOCK_CLASS });
    this.editorEl = this.isDraft ? root.createDiv({ cls: 'extreme-wikilinks-template-editor extreme-wikilinks-block-editor' }) : null;
    this.bodyEl = root.createDiv({ cls: 'extreme-wikilinks-block-body' });
  }

  onload(): void {
    this.registerEvent(this.host.events.on(SETTINGS_CHANGED, () => this.render()));
    this.registerEvent(this.host.app.metadataCache.on('changed', file => {
      if (this.watchedPaths.has(file.path)) this.renderSoon();
    }));
    this.register(() => this.renderSoon.cancel());
    if (this.editorEl) {
      const editor = createTemplateEditor({
        parent: this.editorEl,
        value: this.draft,
        label: 'Template',
        getValues: () => this.selectedValues(),
        onChange: value => {
          this.draft = value;
          this.renderSoon();
        },
      });
      this.register(() => editor.destroy());
    }
    this.render();
  }

  private get sourcePath(): string {
    return this.context.sourcePath;
  }

  private get isDraft(): boolean {
    return this.block.template !== undefined;
  }

  private selectedValues(): TemplateValues | null {
    const target = this.entries[this.selected]?.target;
    if (!target) return null;
    return { builtins: collectTemplateValues(this.host.app, target.file, target.context), frontmatter: target.context.frontmatter };
  }

  private render(): void {
    void this.renderAsync();
  }

  private async renderAsync(): Promise<void> {
    const generation = ++this.generation;
    this.watchedPaths.clear();
    let entries: Entry[] | null = null;
    let failure = '';
    try {
      entries = await this.buildEntries();
    } catch (error) {
      failure = messageOf(error);
    }
    if (generation !== this.generation) return;

    if (this.frame) this.removeChild(this.frame.component);
    this.frame = null;
    const content = createDiv({ cls: 'extreme-wikilinks-block-content' });
    if (entries) {
      this.entries = entries;
      this.renderFrame(content);
    } else {
      renderCallout(content, 'Could not show this block', [failure]);
    }
    this.bodyEl.replaceChildren(content);
  }

  private sourceHeading(): string {
    if (this.block.heading !== undefined) return this.block.heading;
    const section = this.context.getSectionInfo(this.containerEl);
    return section ? findHeadingBeforeLine(this.host.app, this.sourcePath, section.lineStart) : '';
  }

  private async buildEntries(): Promise<Entry[]> {
    const settings = this.host.getSettings();
    const heading = this.sourceHeading();
    return Promise.all(this.block.links.map(link => this.buildEntry(settings, link, heading)));
  }

  private async buildEntry(settings: ExtremeWikilinksSettings, link: BlockLink, heading: string): Promise<Entry> {
    const { app } = this.host;
    const { token } = link;
    const plain = (tag: string, why: string, extra: Partial<EntryBase> = {}): Entry => ({ link, state: 'plain', tag, group: null, why, skipped: [], ...extra });

    const file = resolveTargetFile(app, token.rawTarget, this.sourcePath);
    if (!file) return plain('no note', `No note named "${token.rawTarget}"`);
    this.watchedPaths.add(file.path);

    const target: EntryTarget = { file, context: createTemplateContext(app, file, token.rawTarget, token.linkDisplayText ?? file.basename, this.sourcePath) };
    const leftAlone = this.leftAloneReason(settings, file, link);

    if (this.isDraft) {
      const draft = createTemplate({ id: this.block.name ?? '', body: this.draft });
      const why = leftAlone ? `Your settings leave this link alone: ${leftAlone.why}` : '';
      return this.renderEntry({ link, tag: '', group: null, why, skipped: [], template: draft, target });
    }

    if (leftAlone) return plain(leftAlone.tag, leftAlone.why, { target });

    const directive = token.marker?.directive;
    const choice = explainTemplateChoice(settings.templates, { sourceHeading: heading, templateContext: target.context, readFrontmatter: parseFrontMatterEntry },
      directive?.kind === 'template' ? directive.templateName : undefined);
    const skipped = choice.checks.filter(check => check.outcome === 'skipped');
    const matched = choice.checks.find(check => check.outcome === 'matched');
    if (!matched) return plain('no template', choice.reason ?? 'No template matched', { target, skipped });

    const label = templateLabel(matched);
    return this.renderEntry({ link, tag: label, group: label, why: `${label} · ${matched.reason}`, skipped, template: matched.template, target });
  }

  private async renderEntry(base: EntryBase & { readonly template: LinkTemplate; readonly target: EntryTarget }): Promise<Entry> {
    const { template, target } = base;
    try {
      const { markdown } = await renderTemplate(this.host.app, target.file, template, target.context, template.collapseSpaces);
      if (!markdown) return { ...base, state: 'plain', why: [base.why, 'Produced no text, so the normal link shows'].filter(Boolean).join(' · ') };
      return { ...base, state: 'rendered', markdown };
    } catch (error) {
      return { ...base, state: 'error', message: messageOf(error), diagnostics: error instanceof TemplateRenderError ? error.diagnostics : [] };
    }
  }

  private leftAloneReason(settings: ExtremeWikilinksSettings, file: TFile, link: BlockLink): { tag: string; why: string } | null {
    const sourcePattern = findExcludePattern(settings, this.sourcePath, 'source');
    if (sourcePattern !== null) return { tag: 'excluded', why: `This note matches the exclude pattern ${sourcePattern}` };
    const targetPattern = findExcludePattern(settings, file.path, 'target');
    if (targetPattern !== null) return { tag: 'excluded', why: `${file.path} matches the exclude pattern ${targetPattern}` };
    if (link.token.marker?.directive.kind === 'skip') return { tag: 'skip', why: 'Marked %%ew:skip%%' };
    return null;
  }

  private renderFrame(content: HTMLElement): void {
    if (this.block.errors.length > 0) renderCallout(content, 'Block settings', this.block.errors);

    if (this.entries.length === 0) {
      content.createDiv({ cls: 'extreme-wikilinks-block-empty', text: 'Add wikilinks to this block to test them.' });
      return;
    }

    const side = content.createDiv({ cls: 'extreme-wikilinks-block-side' });
    const chips = this.isDraft ? null : side.createDiv({ cls: 'extreme-wikilinks-block-chips', attr: { role: 'group', 'aria-label': 'Templates to show' } });
    const list = side.createDiv({ cls: 'extreme-wikilinks-block-list', attr: { role: 'listbox', tabindex: '0', 'aria-label': 'Links' } });
    list.addEventListener('keydown', event => this.onListKey(event));
    if (this.isDraft) this.renderSaveAction(side);

    this.frame = {
      component: this.addChild(new Component()),
      chips,
      list,
      detail: content.createDiv({ cls: 'extreme-wikilinks-block-detail' }),
      detailComponent: null,
    };
    this.show();
  }

  private visibleIndexes(): number[] {
    const { filter } = this;
    return this.entries.flatMap((entry, index) => (filter === null || entry.group === filter.group ? [index] : []));
  }

  private show(): void {
    const { filter } = this;
    if (filter !== null && !this.entries.some(entry => entry.group === filter.group)) this.filter = null;
    const visible = this.visibleIndexes();
    if (!visible.includes(this.selected)) this.selected = visible[0] ?? 0;
    this.renderChips();
    this.renderList(visible);
    void this.renderDetail();
  }

  private renderChips(): void {
    const chips = this.frame?.chips;
    if (!chips) return;
    chips.empty();

    const counts = new Map<string | null, number>();
    for (const entry of this.entries) counts.set(entry.group, (counts.get(entry.group) ?? 0) + 1);
    const groups = [...counts.keys()].sort((a, b) => Number(a === null) - Number(b === null));

    const addChip = (text: string, filter: { readonly group: string | null } | null): HTMLElement => {
      const pressed = filter === null ? this.filter === null : this.filter?.group === filter.group;
      const chip = chips.createEl('button', { cls: 'extreme-wikilinks-block-chip', text, attr: { type: 'button', 'aria-pressed': String(pressed) } });
      chip.addEventListener('click', () => {
        this.filter = filter;
        this.show();
      });
      return chip;
    };
    addChip(`All ${this.entries.length}`, null);
    for (const group of groups) {
      const chip = addChip(`${group ?? 'No template'} ${counts.get(group)}`, { group });
      if (group === null) chip.addClass('extreme-wikilinks-block-chip-none');
    }
  }

  private renderList(visible: number[]): void {
    const list = this.frame?.list;
    if (!list) return;
    list.empty();
    for (const index of visible) {
      const entry = this.entries[index];
      const row = list.createDiv({
        cls: 'extreme-wikilinks-block-row',
        attr: { role: 'option', 'aria-selected': String(index === this.selected), 'data-state': entry.state },
      });
      setIcon(row.createSpan({ cls: 'extreme-wikilinks-block-row-icon', attr: { 'aria-hidden': 'true' } }), STATE_ICONS[entry.state]);
      row.createSpan({ cls: 'extreme-wikilinks-block-row-source', text: entry.link.text, attr: { title: entry.link.text } });
      const tag = entry.state === 'error' ? 'error' : entry.tag;
      if (tag) row.createSpan({ cls: 'extreme-wikilinks-block-row-tag', text: tag });
      row.addEventListener('click', () => {
        this.selected = index;
        this.show();
      });
    }
  }

  private onListKey(event: KeyboardEvent): void {
    const visible = this.visibleIndexes();
    const at = visible.indexOf(this.selected);
    const moves: Partial<Record<string, number>> = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: visible.length - 1 };
    const to = moves[event.key];
    if (to === undefined) return;
    event.preventDefault();
    this.selected = visible[Math.max(0, Math.min(to, visible.length - 1))];
    this.show();
  }

  private async renderDetail(): Promise<void> {
    const frame = this.frame;
    const entry = this.entries[this.selected];
    if (!frame || !entry) return;
    if (frame.detailComponent) frame.component.removeChild(frame.detailComponent);
    const component = frame.detailComponent = frame.component.addChild(new Component());
    const el = createDiv();

    const outputEl = el.createDiv({ cls: 'extreme-wikilinks-block-output' });
    if (entry.state === 'rendered') {
      const output = outputEl.createSpan({ cls: 'extreme-wikilinks-link' });
      applyTemplateName(output, entry.template?.id ?? '');
      await renderTemplateMarkdown(this.host.app, output, { markdown: entry.markdown }, this.sourcePath, component);
      if (hasBlockLevelOutput(output)) {
        renderCallout(el, 'Live preview shows the normal link', ['Only inline Markdown is supported, and this output has a block such as a list or heading.'], { kind: 'warning' });
      }
    } else {
      outputEl.addClass('extreme-wikilinks-block-plain');
      outputEl.setText(entry.link.token.linkDisplayText ?? entry.link.token.rawTarget);
    }

    if (entry.why) el.createDiv({ cls: 'extreme-wikilinks-block-why', text: entry.why });
    if (entry.skipped.length > 0) this.renderSkipped(el, entry.skipped);
    if (entry.state === 'error') renderCallout(el, entry.message, entry.diagnostics, { code: true });
    if (entry.state === 'rendered') el.createEl('code', { cls: 'extreme-wikilinks-block-markdown', text: entry.markdown });
    if (entry.target) renderValues(el, collectTemplateValues(this.host.app, entry.target.file, entry.target.context), entry.target.context.frontmatter);
    this.renderHelpers(el);

    if (frame === this.frame && entry === this.entries[this.selected]) frame.detail.replaceChildren(el);
  }

  private renderSkipped(parent: HTMLElement, skipped: readonly TemplateCheck[]): void {
    const details = parent.createEl('details', { cls: 'extreme-wikilinks-block-skipped-section' });
    details.open = this.skippedOpen;
    details.addEventListener('toggle', () => {
      this.skippedOpen = details.open;
    });
    details.createEl('summary', { text: `${skipped.length} skipped` });
    const list = details.createEl('ul', { cls: 'extreme-wikilinks-block-skipped' });
    for (const check of skipped) list.createEl('li', { text: `${templateLabel(check)}: ${check.reason}` });
  }

  private renderHelpers(parent: HTMLElement): void {
    const details = parent.createEl('details', { cls: 'extreme-wikilinks-block-helpers-section' });
    details.open = this.helpersOpen;
    details.addEventListener('toggle', () => {
      this.helpersOpen = details.open;
    });
    details.createEl('summary', { text: `Helpers (${HELPERS.length})` });
    const list = details.createDiv({ cls: 'extreme-wikilinks-block-helpers' });
    for (const helper of HELPERS) {
      const item = list.createDiv();
      item.createEl('code', { text: `h.${helper.signature}` });
      item.createSpan({ cls: 'extreme-wikilinks-block-hint', text: ` ${helper.description.replace(/`/g, '')}` });
    }
  }

  private renderSaveAction(parent: HTMLElement): void {
    const name = this.block.name?.trim();
    const draft = this.draft;
    if (!name || !draft.trim()) return;
    const actions = parent.createDiv({ cls: 'extreme-wikilinks-block-actions' });

    const named = this.host.getSettings().templates.filter(template => template.id.trim() === name);
    if (named.length > 1) {
      actions.createSpan({ cls: 'extreme-wikilinks-block-hint', text: `${named.length} templates are named "${name}"` });
      return;
    }
    if (named.length === 1 && named[0].body === draft) {
      actions.createSpan({ cls: 'extreme-wikilinks-block-hint', text: `Saved as "${name}"` });
      return;
    }

    const overwriting = named.length === 1;
    const label = overwriting ? `Overwrite "${name}"` : `Save as "${name}"`;
    const button = actions.createEl('button', { cls: 'mod-cta', text: label, attr: { type: 'button' } });
    const setConfirming = (confirming: boolean): void => {
      button.setText(confirming ? 'Select again to overwrite' : label);
      button.toggleClass('mod-cta', !confirming);
      button.toggleClass('mod-warning', confirming);
    };
    const stopConfirming = debounce(() => setConfirming(false), 4000, true);

    button.addEventListener('click', () => {
      if (overwriting && !button.hasClass('mod-warning')) {
        setConfirming(true);
        stopConfirming();
        return;
      }
      stopConfirming.cancel();
      button.disabled = true;
      this.host.saveTemplate(name, this.draft).then(result => {
        new Notice(result === 'created' ? `Saved template "${name}" at the end of your templates.` : `Updated template "${name}".`, 5000);
      }, (error: unknown) => {
        button.disabled = false;
        new Notice(`Could not save template: ${messageOf(error)}`, 5000);
      });
    });
  }
}

function templateLabel(check: TemplateCheck): string {
  return check.template.id.trim() || `Template ${check.index + 1}`;
}

function findExcludePattern(settings: ExtremeWikilinksSettings, path: string, side: 'source' | 'target'): string | null {
  const pattern = settings.excludePatterns.find(candidate => (side === 'source' ? candidate.matchSource : candidate.matchTarget) && compileRegex(candidate.pattern)?.test(path));
  return pattern?.pattern ?? null;
}

function renderCallout(parent: HTMLElement, title: string, lines: readonly string[], { code = false, kind = 'error' }: { code?: boolean; kind?: 'error' | 'warning' } = {}): void {
  const callout = parent.createDiv({ cls: `extreme-wikilinks-block-callout extreme-wikilinks-block-callout-${kind}` });
  callout.createDiv({ cls: 'extreme-wikilinks-block-callout-title', text: title });
  for (const line of lines) {
    const el = callout.createDiv();
    if (code) el.createEl('code', { text: line });
    else el.setText(line);
  }
}

function renderValues(parent: HTMLElement, values: Record<string, unknown>, frontmatter: Record<string, unknown>): void {
  const body = parent.createEl('table', { cls: 'extreme-wikilinks-block-values' }).createEl('tbody');
  for (const key of Object.keys(frontmatter).filter(key => key !== 'position')) {
    addValueRow(body, `this${BUILTIN_VALUE_NAMES.has(key) ? '.frontmatter' : ''}${propertyAccess(key)}`, frontmatter[key]);
  }
  for (const builtin of BUILTIN_VALUES) {
    if (builtin.lazy) continue;
    addValueRow(body, `this.${builtin.name}`, values[builtin.name], builtin.description, builtin.timestamp);
  }
}

function addValueRow(body: HTMLElement, name: string, value: unknown, description?: string, timestamp?: boolean): void {
  const row = body.createEl('tr');
  row.createEl('td').createEl('code', { text: name, attr: description ? { title: description } : {} });
  const cell = row.createEl('td');
  if (value instanceof UnreadableValue) cell.createSpan({ cls: 'extreme-wikilinks-block-error', text: value.message });
  else if (value === undefined || value === null) cell.createSpan({ cls: 'extreme-wikilinks-block-hint', text: value === null ? 'null' : '—' });
  else cell.setText(formatValue(value, { timestamp }));
}
