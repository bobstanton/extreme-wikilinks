import { App, TFile, parseLinktext } from 'obsidian';
import { compileRegex } from './regexUtils';
import type { ExtremeWikilinksSettings, LinkTemplate } from './settings';
import { chooseTemplate } from './templateMatcher';
import { renderTemplate, templateRenderKey, type RenderedTemplateParts, type TemplateContext } from './templateEngine';

export interface WikilinkRenderMatch {
  readonly rawTarget: string;
  readonly linkDisplayText: string | null;
  readonly originalWikilink: string;
  readonly template: LinkTemplate;
  readonly templateContext: TemplateContext;
  readonly sourceHeading: string;
  readonly sourcePath: string;
  readonly targetFile: TFile;
  readonly targetPath: string;
  readonly renderKey: string;
}

export interface WikilinkRenderRequest {
  readonly rawTarget: string;
  readonly linkDisplayText: string | null;
  readonly sourcePath: string;
  readonly sourceLine?: number;
  readonly sourceHeading?: string;
}

export interface WikilinkRenderCaches {
  readonly targetFiles: Map<string, TFile | null>;
  readonly renderMatches: Map<string, WikilinkRenderMatch | null>;
  readonly renderedParts: Map<string, Promise<RenderedTemplateParts>>;
}

export interface WikilinkToken {
  readonly from: number;
  readonly to: number;
  readonly rawTarget: string;
  readonly linkDisplayText: string | null;
}

export function createRenderCaches(): WikilinkRenderCaches {
  return {
    targetFiles: new Map(),
    renderMatches: new Map(),
    renderedParts: new Map(),
  };
}

export function createWikilinkRenderRequest(sourcePath: string, rawTarget: string, linkDisplayText: string | null, source: { sourceLine?: number; sourceHeading?: string } = {}): WikilinkRenderRequest {
  return {
    rawTarget,
    linkDisplayText,
    sourcePath,
    sourceLine: source.sourceLine,
    sourceHeading: source.sourceHeading,
  };
}

export function getOrCompute<K, V>(cache: Map<K, V>, key: K, compute: () => V): V {
  if (!cache.has(key)) {
    cache.set(key, compute());
  }
  return cache.get(key) as V;
}

export function createExcludeMatcher(): (settings: ExtremeWikilinksSettings) => RegExp[] {
  let key: string | null = null;
  let regexps: RegExp[] = [];
  return (settings) => {
    const nextKey = settings.excludePatterns.join('\n');
    if (nextKey !== key) {
      key = nextKey;
      regexps = settings.excludePatterns.map(pattern => compileRegex(pattern));
    }
    return regexps;
  };
}

export function serializeKey(parts: ReadonlyArray<string | number>): string {
  return parts.map(value => `${String(value).length}:${value}`).join('|');
}

function renderKey(...parts: string[]): string {
  return serializeKey(parts);
}

export function isPathExcluded(sourcePath: string, excludeRegexps: RegExp[]): boolean {
  return excludeRegexps.some(pattern => pattern.test(sourcePath));
}

export function resolveTargetFile(app: App, target: string, sourcePath: string): TFile | null {
  const cleanTarget = parseLinktext(target).path.trim();
  if (!cleanTarget) return null;
  return app.metadataCache.getFirstLinkpathDest(cleanTarget, sourcePath);
}

export function resolveExplicitTargetFile(app: App, path: string): TFile | null {
  const file = app.vault.getAbstractFileByPath(path);
  return file instanceof TFile ? file : null;
}

export function getWikilinkRenderMatch(app: App, settings: ExtremeWikilinksSettings, request: WikilinkRenderRequest, caches: WikilinkRenderCaches): WikilinkRenderMatch | null {
  const targetFile = getOrCompute(caches.targetFiles, request.rawTarget, () => resolveTargetFile(app, request.rawTarget, request.sourcePath));
  if (!targetFile) return null;

  const linkDisplayText = request.linkDisplayText ?? targetFile.basename;
  const sourceHeading = request.sourceHeading ?? findSourceHeadingBefore(app, request.sourcePath, request);
  return getOrCreateRenderMatch(
    app,
    settings.templates,
    targetFile,
    request.rawTarget,
    linkDisplayText,
    request.linkDisplayText,
    sourceHeading,
    request.sourcePath,
    caches.renderMatches,
  );
}

export function createRenderMatch(app: App, templates: LinkTemplate[], targetFile: TFile, linkDestination: string, linkDisplayText: string, explicitLinkDisplayText: string | null, sourceHeading: string, sourcePath: string): WikilinkRenderMatch | null {
  const frontmatter = app.metadataCache.getFileCache(targetFile)?.frontmatter ?? {};
  const templateContext: TemplateContext = {
    basename: targetFile.basename,
    linkDestination,
    linkDisplayText,
    path: targetFile.path,
    title: targetFile.basename,
    wikilink: app.fileManager.generateMarkdownLink(targetFile, sourcePath, getLinkSubpath(linkDestination), linkDisplayText),
    frontmatter,
  };
  const template = chooseTemplate(templates, { sourceHeading, templateContext });
  if (!template) return null;

  return {
    rawTarget: linkDestination,
    linkDisplayText: explicitLinkDisplayText,
    originalWikilink: formatOriginalWikilink(linkDestination, explicitLinkDisplayText),
    template,
    templateContext,
    sourceHeading,
    sourcePath,
    targetFile,
    targetPath: targetFile.path,
    renderKey: templateRenderKey(template),
  };
}

export function getOrCreateRenderMatch(app: App, templates: LinkTemplate[], targetFile: TFile, linkDestination: string, linkDisplayText: string, explicitLinkDisplayText: string | null, sourceHeading: string, sourcePath: string, cache: Map<string, WikilinkRenderMatch | null>): WikilinkRenderMatch | null {
  const key = renderKey(sourcePath, targetFile.path, renderKey(linkDestination, linkDisplayText), sourceHeading);
  return getOrCompute(cache, key, () => createRenderMatch(app, templates, targetFile, linkDestination, linkDisplayText, explicitLinkDisplayText, sourceHeading, sourcePath));
}

export function getRenderedParts(app: App, match: WikilinkRenderMatch, cache: Map<string, Promise<RenderedTemplateParts>>): Promise<RenderedTemplateParts> {
  const key = renderKey(
    match.templateContext.linkDestination,
    match.templateContext.linkDisplayText,
    match.sourceHeading,
    match.targetPath,
    templateRenderKey(match.template),
  );
  return getOrCompute(cache, key, () => renderTemplate(app, match.targetFile, match.template, match.templateContext, match.template.collapseSpaces));
}

export function formatOriginalWikilink(rawTarget: string, linkDisplayText: string | null): string {
  return linkDisplayText ? `[[${rawTarget}|${linkDisplayText}]]` : `[[${rawTarget}]]`;
}

export function parseWikilinkTarget(raw: string): { target: string; linkDisplayText: string | null } {
  const pipeIndex = raw.indexOf('|');
  const target = (pipeIndex === -1 ? raw : raw.substring(0, pipeIndex)).trim();
  const linkDisplayText = pipeIndex === -1 ? null : raw.substring(pipeIndex + 1).trim();
  return { target, linkDisplayText: linkDisplayText || null };
}

export function findWikilinkTokens(text: string, baseOffset: number): WikilinkToken[] {
  const tokens: WikilinkToken[] = [];
  const regex = /(^|[^!])\[\[([^\]\n]+)\]\]/g;
  let previousTo = -1;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const from = baseOffset + match.index + match[1].length;
    const to = from + match[2].length + 4;
    if (from < previousTo) continue;

    const { target, linkDisplayText } = parseWikilinkTarget(match[2].trim());
    if (!target) continue;

    tokens.push({ from, to, rawTarget: target, linkDisplayText });
    previousTo = to;
  }

  return tokens;
}

function getLinkSubpath(linkDestination: string): string {
  return parseLinktext(linkDestination).subpath;
}

function findSourceHeadingBefore(app: App, sourcePath: string, request: WikilinkRenderRequest): string {
  if (request.sourceLine === undefined) return '';

  const sourceFile = app.vault.getAbstractFileByPath(sourcePath);
  if (!(sourceFile instanceof TFile)) return '';

  const headings = app.metadataCache.getFileCache(sourceFile)?.headings ?? [];
  let result = '';
  for (const heading of headings) {
    if (heading.position.start.line >= request.sourceLine) break;
    result = heading.heading;
  }
  return result;
}
