import { syntaxTree } from '@codemirror/language';
import { type Extension, type Range, StateEffect } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import { App, Component, editorInfoField, editorLivePreviewField } from 'obsidian';
import type { ExtremeWikilinksSettings } from './settings';
import type { RenderedTemplateParts } from './templateEngine';
import { applyTemplateName, hasBlockLevelOutput, renderTemplateMarkdown } from './templateOutputRenderer';
import { recordTemplateFailure } from './logger';
import { createRenderCaches, createWikilinkRenderRequest, findWikilinkTokens, getRenderedParts, getWikilinkRenderMatch, type WikilinkToken } from './wikilinkRender';
import { createExcludeMatcher, formatOriginalWikilink, isPathExcluded, serializeKey, type ExcludeRegexps } from './wikilinkCore';
import { messageOf } from './errors';

const refreshDecorationsEffect = StateEffect.define<void>();
export const invalidateRendersEffect = StateEffect.define<void>();

interface WikilinkMatch {
  readonly from: number;
  readonly to: number;
  readonly rawTarget: string;
  readonly linkDisplayText: string | null;
  readonly formattingClasses: readonly string[];
  readonly sourceHeading: string;
  readonly sourcePath: string;
  readonly renderKey: string;
  readonly templateId: string;
  readonly templateBody: string;
  readonly renderParts: () => Promise<RenderedTemplateParts>;
}

interface TrackedRender {
  readonly promise: Promise<RenderedTemplateParts>;
  status: 'pending' | 'resolved' | 'rejected';
  value?: RenderedTemplateParts;
  stale?: boolean;
}

function trackRender(start: () => Promise<RenderedTemplateParts>): TrackedRender {
  const tracked: { status: TrackedRender['status']; value?: RenderedTemplateParts; stale?: boolean } = { status: 'pending' };
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
      isLivePreview: boolean;
      renders: Map<string, TrackedRender>;
      failedKeys: Set<string>;

      constructor(view: EditorView) {
        this.isLivePreview = view.state.field(editorLivePreviewField);
        this.renders = new Map();
        this.failedKeys = new Set();
        this.decorations = buildDecorations(app, getSettings, getExcludeRegexps, view, this.renders, this.failedKeys);
      }

      update(update: ViewUpdate): void {
        const hasRefreshEffect = update.transactions.some(tr => tr.effects.some(effect => effect.is(refreshDecorationsEffect)));
        const hasInvalidateEffect = update.transactions.some(tr => tr.effects.some(effect => effect.is(invalidateRendersEffect)));
        let shouldRebuild = update.docChanged || update.viewportChanged || update.selectionSet || hasRefreshEffect || hasInvalidateEffect;
        const isLivePreview = update.view.state.field(editorLivePreviewField);
        const livePreviewChanged = isLivePreview !== this.isLivePreview;
        if (livePreviewChanged) {
          shouldRebuild = true;
          this.isLivePreview = isLivePreview;
        }

        if (shouldRebuild) {
          if (livePreviewChanged) {
            this.renders.clear();
            this.failedKeys.clear();
          } else if (hasInvalidateEffect) {
            for (const tracked of this.renders.values()) {
              tracked.stale = true;
            }
            this.failedKeys.clear();
          }
          this.decorations = buildDecorations(app, getSettings, getExcludeRegexps, update.view, this.renders, this.failedKeys);
        }
      }
    },
    { decorations: value => value.decorations },
  );
}

function buildDecorations(app: App, getSettings: () => ExtremeWikilinksSettings, getExcludeRegexps: (settings: ExtremeWikilinksSettings) => ExcludeRegexps, view: EditorView, renders: Map<string, TrackedRender>, failedKeys: Set<string>): DecorationSet {
  if (!view.state.field(editorLivePreviewField)) {
    return Decoration.none;
  }

  const sourceFile = view.state.field(editorInfoField).file;
  const settings = getSettings();
  const excludeRegexps = getExcludeRegexps(settings);
  if (!sourceFile) {
    return Decoration.none;
  }

  const decorations: Range<Decoration>[] = [];
  const caches = createRenderCaches();
  const headings = collectHeadings(view);
  const sourceExcluded = isPathExcluded(sourceFile.path, excludeRegexps.source);
  const refresh = () => view.dispatch({ effects: refreshDecorationsEffect.of() });

  for (const token of findVisibleWikilinks(view)) {
    const end = token.marker?.to ?? token.to;
    if (view.state.selection.ranges.some(range => range.from <= end && range.to >= token.from)) continue;

    if (token.marker) {
      decorations.push(Decoration.replace({ inclusive: false }).range(token.marker.from, token.marker.to));
    }
    if (sourceExcluded) continue;

    const request = createWikilinkRenderRequest(sourceFile.path, token.rawTarget, token.linkDisplayText, {
      sourceHeading: headingBefore(headings, token.from),
      directive: token.marker?.directive,
    });
    const renderMatch = getWikilinkRenderMatch(app, settings, request, caches, excludeRegexps);
    if (!renderMatch) continue;
    const match: WikilinkMatch = {
      from: token.from,
      to: token.to,
      rawTarget: token.rawTarget,
      linkDisplayText: token.linkDisplayText,
      formattingClasses: findFormattingClasses(view, token.from, token.to),
      sourceHeading: renderMatch.sourceHeading,
      sourcePath: sourceFile.path,
      renderKey: renderMatch.renderKey,
      templateId: renderMatch.template.id,
      templateBody: renderMatch.template.body,
      renderParts: () => getRenderedParts(app, renderMatch, caches.renderedParts),
    };

    const key = renderCacheKey(match);
    if (failedKeys.has(key)) continue;

    let tracked = renders.get(key);
    if (!tracked || tracked.stale) {
      const previousValue = tracked?.value;
      const nextTracked = trackRender(match.renderParts);
      
      if (previousValue) nextTracked.value = previousValue;
      renders.set(key, nextTracked);
      nextTracked.promise.then(refresh, error => {
        if (renders.get(key) !== nextTracked) return;
        recordRenderFailure(match, error);
        failedKeys.add(key);
        refresh();
      });
      tracked = nextTracked;
    }
    if (!tracked.value) continue;

    decorations.push(Decoration.replace({ inclusive: false }).range(match.from, match.to));
    decorations.push(Decoration.widget({
      widget: new WikilinkTemplateWidget(app, match, tracked.value, (reason) => {
        recordRenderFailure(match, reason);
        failedKeys.add(key);
        refresh();
      }),
      side: -1,
    }).range(match.to));
  }

  return Decoration.set(decorations, true);
}

class WikilinkTemplateWidget extends WidgetType {
  private renderComponent: Component | null = null;
  private destroyed = false;

  constructor(private readonly app: App, private readonly match: WikilinkMatch, private readonly parts: RenderedTemplateParts, private readonly onRenderFailure: (reason: string) => void) {
    super();
  }

  toDOM(): HTMLElement {
    const wrapper = createSpan({ cls: ['extreme-wikilinks-link', 'extreme-wikilinks-link-rendering'] });
    for (const formattingClass of this.match.formattingClasses) {
      wrapper.addClass(formattingClass);
    }
    applyTemplateName(wrapper, this.match.templateId);
    wrapper.textContent = this.match.linkDisplayText ?? this.match.rawTarget;
    void this.render(wrapper);
    return wrapper;
  }

  eq(other: WikilinkTemplateWidget): boolean {
    return this.match.rawTarget === other.match.rawTarget
      && this.match.linkDisplayText === other.match.linkDisplayText
      && this.match.formattingClasses.join(' ') === other.match.formattingClasses.join(' ')
      && this.match.sourceHeading === other.match.sourceHeading
      && this.match.sourcePath === other.match.sourcePath
      && this.match.templateId === other.match.templateId
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
      const rendered = createSpan({ cls: 'extreme-wikilinks-link' });
      await renderTemplateMarkdown(this.app, rendered, this.parts, this.match.sourcePath, this.renderComponent);
      if (hasBlockLevelOutput(rendered)) {
        wrapper.removeClass('extreme-wikilinks-link-rendering');
        this.onRenderFailure('Template produced block-level output; only inline Markdown is supported');
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
      this.onRenderFailure('Markdown renderer failed');
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.renderComponent?.unload();
    this.renderComponent = null;
  }
}

function renderCacheKey(match: WikilinkMatch): string {
  return serializeKey([
    match.sourcePath,
    match.rawTarget,
    match.linkDisplayText ?? '',
    match.sourceHeading,
    match.renderKey,
  ]);
}

function recordRenderFailure(match: WikilinkMatch, error: unknown): void {
  const message = messageOf(error);
  const wikilink = formatOriginalWikilink(match.rawTarget, match.linkDisplayText);
  recordTemplateFailure({
    sourcePath: match.sourcePath,
    wikilink,
    template: match.templateBody,
    message,
  });
}

function findVisibleWikilinks(view: EditorView): WikilinkToken[] {
  const matches: WikilinkToken[] = [];
  let previousTo = -1;

  for (const range of view.visibleRanges) {
    const from = view.state.doc.lineAt(range.from).from;
    const to = view.state.doc.lineAt(range.to).to;
    const text = view.state.doc.sliceString(from, to);
    for (const token of findWikilinkTokens(text, from)) {
      const { from: linkFrom, to: linkTo } = token;
      if (linkFrom < previousTo) continue;
      if (isInExcludedSyntax(view, linkFrom)) continue;

      matches.push(token);
      previousTo = linkTo;
    }
  }

  return matches;
}

const EXCLUDED_SYNTAX_NAMES = ['code', 'comment', 'math', 'frontmatter'];

function isInExcludedSyntax(view: EditorView, pos: number): boolean {
  for (let node: SyntaxNode | null = syntaxTree(view.state).resolveInner(pos, 1); node; node = node.parent) {
    const name = node.type.name.toLowerCase();
    if (EXCLUDED_SYNTAX_NAMES.some(excluded => name.includes(excluded))) return true;
  }
  return false;
}

const FORMATTING_CLASSES: ReadonlyArray<readonly [nodeName: string, cssClass: string]> = [
  ['em', 'cm-em'],
  ['strong', 'cm-strong'],
  ['strikethrough', 'cm-strikethrough'],
  ['highlight', 'cm-highlight'],
];

function findFormattingClasses(view: EditorView, from: number, to: number): string[] {
  const startNames = syntaxNameSegments(view, from + 2, 1);
  const endNames = syntaxNameSegments(view, to - 2, -1);
  return FORMATTING_CLASSES
    .filter(([nodeName]) => startNames.has(nodeName) && endNames.has(nodeName))
    .map(([, cssClass]) => cssClass);
}

function syntaxNameSegments(view: EditorView, pos: number, side: -1 | 1): Set<string> {
  const segments = new Set<string>();
  for (let node: SyntaxNode | null = syntaxTree(view.state).resolveInner(pos, side); node; node = node.parent) {
    for (const segment of node.type.name.toLowerCase().split('_')) {
      segments.add(segment);
    }
  }
  return segments;
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
