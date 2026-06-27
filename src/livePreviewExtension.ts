import { syntaxTree } from '@codemirror/language';
import { type Extension, RangeSetBuilder, StateEffect } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import { App, Component, editorInfoField, editorLivePreviewField } from 'obsidian';
import type { ExtremeWikilinksSettings } from './settings';
import type { RenderedTemplateParts } from './templateEngine';
import { hasBlockLevelOutput, renderTemplateMarkdown } from './templateOutputRenderer';
import { recordTemplateFailure } from './logger';
import { createExcludeMatcher, createRenderCaches, createWikilinkRenderRequest, findWikilinkTokens, formatOriginalWikilink, getRenderedParts, getWikilinkRenderMatch, isPathExcluded, serializeKey } from './wikilinkRender';

export const refreshDecorationsEffect = StateEffect.define<void>();

interface WikilinkMatch {
  readonly from: number;
  readonly to: number;
  readonly rawTarget: string;
  readonly linkDisplayText: string | null;
  readonly sourceHeading: string;
  readonly sourcePath: string;
  readonly renderKey: string;
  readonly templateBody: string;
  readonly renderParts: () => Promise<RenderedTemplateParts>;
}

interface TrackedRender {
  readonly promise: Promise<RenderedTemplateParts>;
  status: 'pending' | 'resolved' | 'rejected';
  value?: RenderedTemplateParts;
}

function trackRender(start: () => Promise<RenderedTemplateParts>): TrackedRender {
  const tracked: { status: TrackedRender['status']; value?: RenderedTemplateParts } = { status: 'pending' };
  const promise = start().then(
    value => {
      tracked.status = 'resolved';
      tracked.value = value;
      return value;
    },
    error => {
      tracked.status = 'rejected';
      throw error;
    },
  );
  return Object.assign(tracked, { promise });
}

export function createLivePreviewExtension(app: App, getSettings: () => ExtremeWikilinksSettings): Extension {
  const getExcludeRegexps = createExcludeMatcher();

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      cursorWikilinkRange: string;
      isLivePreview: boolean;
      renders: Map<string, TrackedRender>;
      failedKeys: Set<string>;

      constructor(view: EditorView) {
        this.cursorWikilinkRange = getCursorWikilinkRange(view);
        this.isLivePreview = view.state.field(editorLivePreviewField);
        this.renders = new Map();
        this.failedKeys = new Set();
        this.decorations = buildDecorations(app, getSettings, getExcludeRegexps, view, this.renders, this.failedKeys);
      }

      update(update: ViewUpdate): void {
        const hasRefreshEffect = update.transactions.some(tr => tr.effects.some(effect => effect.is(refreshDecorationsEffect)));
        let shouldRebuild = update.docChanged || update.viewportChanged || hasRefreshEffect;
        const isLivePreview = update.view.state.field(editorLivePreviewField);
        const livePreviewChanged = isLivePreview !== this.isLivePreview;
        if (livePreviewChanged) {
          shouldRebuild = true;
          this.isLivePreview = isLivePreview;
        }

        if (update.selectionSet) {
          const cursorWikilinkRange = getCursorWikilinkRange(update.view);
          shouldRebuild ||= cursorWikilinkRange !== this.cursorWikilinkRange;
          this.cursorWikilinkRange = cursorWikilinkRange;
        }

        if (shouldRebuild) {
          if (update.docChanged || livePreviewChanged) {
            this.renders.clear();
            this.failedKeys.clear();
          }
          this.decorations = buildDecorations(app, getSettings, getExcludeRegexps, update.view, this.renders, this.failedKeys);
        }
      }
    },
    { decorations: value => value.decorations },
  );
}

function buildDecorations(app: App, getSettings: () => ExtremeWikilinksSettings, getExcludeRegexps: (settings: ExtremeWikilinksSettings) => RegExp[], view: EditorView, renders: Map<string, TrackedRender>, failedKeys: Set<string>): DecorationSet {
  if (!view.state.field(editorLivePreviewField)) {
    return Decoration.none;
  }

  const sourceFile = view.state.field(editorInfoField).file;
  const settings = getSettings();
  if (!sourceFile || isPathExcluded(sourceFile.path, getExcludeRegexps(settings))) {
    return Decoration.none;
  }

  const builder = new RangeSetBuilder<Decoration>();
  const cursor = view.state.selection.main.head;
  const refresh = () => view.dispatch({ effects: refreshDecorationsEffect.of() });

  for (const match of findWikilinks(app, settings, view, sourceFile.path)) {
    if (cursor >= match.from && cursor <= match.to) continue;

    const key = renderStateKey(match);
    if (failedKeys.has(key)) continue;

    let tracked = renders.get(key);
    if (!tracked) {
      tracked = trackRender(match.renderParts);
      renders.set(key, tracked);
      tracked.promise.then(refresh, error => {
        recordRenderFailure(match, error);
        failedKeys.add(key);
        refresh();
      });
    }
    if (tracked.status !== 'resolved' || !tracked.value) continue;

    builder.add(match.from, match.to, Decoration.replace({
      widget: new WikilinkTemplateWidget(app, match, tracked.value, () => {
        recordRenderFailure(match, 'Markdown renderer failed');
        failedKeys.add(key);
        refresh();
      }),
      inclusive: false,
    }));
  }

  return builder.finish();
}

class WikilinkTemplateWidget extends WidgetType {
  private renderComponent: Component | null = null;
  private destroyed = false;

  constructor(
    private readonly app: App,
    private readonly match: WikilinkMatch,
    private readonly parts: RenderedTemplateParts,
    private readonly onRenderFailure: () => void,
  ) {
    super();
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = view.dom.ownerDocument.createElement('span');
    wrapper.addClass('extreme-wikilinks-link');
    wrapper.addClass('extreme-wikilinks-link-rendering');
    wrapper.textContent = formatOriginalWikilink(this.match.rawTarget, this.match.linkDisplayText);
    void this.render(wrapper);
    return wrapper;
  }

  eq(other: WikilinkTemplateWidget): boolean {
    return this.match.rawTarget === other.match.rawTarget
      && this.match.linkDisplayText === other.match.linkDisplayText
      && this.match.sourceHeading === other.match.sourceHeading
      && this.match.sourcePath === other.match.sourcePath
      && this.match.renderKey === other.match.renderKey
      && this.parts.markdown === other.parts.markdown;
  }

  private async render(wrapper: HTMLElement): Promise<void> {
    if (this.destroyed) return;
    if (!this.parts.markdown) return;

    this.renderComponent?.unload();
    this.renderComponent = new Component();
    this.renderComponent.load();
    try {
      const rendered = wrapper.ownerDocument.createElement('span');
      rendered.addClass('extreme-wikilinks-link');
      await renderTemplateMarkdown(this.app, rendered, this.parts, this.match.sourcePath, this.renderComponent);
      if (hasBlockLevelOutput(rendered)) {
        wrapper.removeClass('extreme-wikilinks-link-rendering');
        this.onRenderFailure();
        return;
      }
      if (this.destroyed) return;

      wrapper.empty();
      while (rendered.firstChild) {
        wrapper.appendChild(rendered.firstChild);
      }
      wrapper.removeClass('extreme-wikilinks-link-rendering');
    } catch {
      wrapper.removeClass('extreme-wikilinks-link-rendering');
      this.onRenderFailure();
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.renderComponent?.unload();
    this.renderComponent = null;
  }
}

function renderStateKey(match: WikilinkMatch): string {
  return serializeKey([
    match.sourcePath,
    match.from,
    match.to,
    match.rawTarget,
    match.linkDisplayText ?? '',
    match.sourceHeading,
    match.renderKey,
  ]);
}

function recordRenderFailure(match: WikilinkMatch, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const wikilink = formatOriginalWikilink(match.rawTarget, match.linkDisplayText);
  recordTemplateFailure({
    sourcePath: match.sourcePath,
    wikilink,
    template: match.templateBody,
    message,
  });
}

function findWikilinks(app: App, settings: ExtremeWikilinksSettings, view: EditorView, sourcePath: string): WikilinkMatch[] {
  const matches: WikilinkMatch[] = [];
  const caches = createRenderCaches();
  const headings = collectHeadings(view);
  let previousTo = -1;

  for (const range of view.visibleRanges) {
    const from = view.state.doc.lineAt(range.from).from;
    const to = view.state.doc.lineAt(range.to).to;
    const text = view.state.doc.sliceString(from, to);
    for (const token of findWikilinkTokens(text, from)) {
      const { from: linkFrom, to: linkTo, rawTarget, linkDisplayText } = token;
      if (linkFrom < previousTo) continue;
      if (isInCodeOrComment(view, linkFrom)) continue;

      const sourceHeading = headingBefore(headings, linkFrom);
      const request = createWikilinkRenderRequest(sourcePath, rawTarget, linkDisplayText, { sourceHeading });
      const renderMatch = getWikilinkRenderMatch(app, settings, request, caches);
      if (!renderMatch) continue;

      matches.push({
        from: linkFrom,
        to: linkTo,
        rawTarget,
        linkDisplayText,
        sourceHeading: renderMatch.sourceHeading,
        sourcePath,
        renderKey: renderMatch.renderKey,
        templateBody: renderMatch.template.body,
        renderParts: () => getRenderedParts(app, renderMatch, caches.renderedParts),
      });
      previousTo = linkTo;
    }
  }

  return matches;
}

function isInCodeOrComment(view: EditorView, pos: number): boolean {
  for (let node: SyntaxNode | null = syntaxTree(view.state).resolveInner(pos, 1); node; node = node.parent) {
    const name = node.type.name.toLowerCase();
    if (name.includes('code') || name.includes('comment')) return true;
  }
  return false;
}

interface HeadingMark {
  readonly from: number;
  readonly text: string;
}

function collectHeadings(view: EditorView): HeadingMark[] {
  const { state } = view;
  const headings: HeadingMark[] = [];
  syntaxTree(state).iterate({
    from: 0,
    to: view.viewport.to,
    enter: (node) => {
      if (!/head(er|ing)/i.test(node.type.name)) return;
      const line = state.doc.lineAt(node.from);
      if (headings.length > 0 && headings[headings.length - 1].from === line.from) return;
      headings.push({ from: line.from, text: cleanHeadingText(line.text) });
    },
  });
  return headings;
}

function cleanHeadingText(line: string): string {
  return line.replace(/^#+\s*/, '').replace(/\s+#+\s*$/, '').trim();
}

function headingBefore(headings: HeadingMark[], pos: number): string {
  let result = '';
  for (const heading of headings) {
    if (heading.from >= pos) break;
    result = heading.text;
  }
  return result;
}

function getCursorWikilinkRange(view: EditorView): string {
  const cursor = view.state.selection.main.head;
  const line = view.state.doc.lineAt(cursor);

  for (const token of findWikilinkTokens(line.text, line.from)) {
    if (cursor >= token.from && cursor <= token.to) return `${token.from}:${token.to}`;
  }

  return '';
}
