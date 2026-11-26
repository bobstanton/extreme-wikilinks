import { App, MarkdownPostProcessorContext, MarkdownRenderChild } from 'obsidian';
import type { ExtremeWikilinksSettings } from './settings';
import { applyTemplateName, renderTemplateMarkdown } from './templateOutputRenderer';
import { recordTemplateFailure } from './logger';
import { BLOCK_CLASS } from './codeBlock';
import { createRenderCaches, createWikilinkRenderRequest, getRenderedParts, getWikilinkRenderMatch, parseWikilinkTarget, resolveExplicitTargetFile, type WikilinkRenderCaches } from './wikilinkRender';
import { createExcludeMatcher, isPathExcluded, type ExcludeRegexps } from './wikilinkCore';
import { messageOf } from './errors';
import { findLinkDirectives, normalizeLinkDestination, type WikilinkDirective } from './wikilinkDirective';

const ORIGINAL_DESTINATION_ATTRIBUTE = 'data-extreme-wikilinks-original-destination';

export class LinkRenderer {
  private readonly getExcludeRegexps = createExcludeMatcher();

  constructor(private readonly app: App, private readonly getSettings: () => ExtremeWikilinksSettings) {}

  async process(root: HTMLElement, context: MarkdownPostProcessorContext): Promise<void> {
    if (root.closest(`.extreme-wikilinks-link, .${BLOCK_CLASS}`)) {
      return;
    }

    const settings = this.getSettings();
    const excludeRegexps = this.getExcludeRegexps(settings);
    if (isPathExcluded(context.sourcePath, excludeRegexps.source)) {
      return;
    }

    const sectionInfo = context.getSectionInfo(root);
    if (!sectionInfo) {
      return;
    }

    const caches = createRenderCaches();
    const embed = root.closest('.internal-embed');
    const links = Array.from(root.querySelectorAll<HTMLElement>(`a.internal-link, [${ORIGINAL_DESTINATION_ATTRIBUTE}]`))
      .filter(link => {
        const wrapper = link.closest('.extreme-wikilinks-link');
        return (!wrapper || wrapper === link) && link.closest('.internal-embed') === embed && !link.closest(`.${BLOCK_CLASS}`);
      });
    const sourceFile = resolveExplicitTargetFile(this.app, context.sourcePath);
    const sourceCache = sourceFile ? this.app.metadataCache.getFileCache(sourceFile) : null;
    const destinations = links.map(link => link.getAttribute(ORIGINAL_DESTINATION_ATTRIBUTE) ?? getRenderedLinkDestination(link));
    const directives = findLinkDirectives(destinations, sectionInfo, sourceCache?.links ?? [], sourceCache?.sections ?? []);
    const linksToRender = links.map((link, index) => ({ link, directive: directives.get(index) }))
      .filter(({ link, directive }) => directive?.kind !== 'skip' && !link.hasAttribute(ORIGINAL_DESTINATION_ATTRIBUTE));
    await Promise.all(linksToRender.map(({ link, directive }) => this.processLink(link as HTMLAnchorElement, context, settings, excludeRegexps, sectionInfo.lineStart, caches, directive)));
  }

  private async processLink(link: HTMLAnchorElement, context: MarkdownPostProcessorContext, settings: ExtremeWikilinksSettings, excludeRegexps: ExcludeRegexps, sourceLine: number, caches: WikilinkRenderCaches, directive?: WikilinkDirective): Promise<void> {
    if (link.closest('.extreme-wikilinks-link')) {
      return;
    }

    const destination = getRenderedLinkDestination(link);
    const request = createWikilinkRenderRequest(context.sourcePath, destination, getRenderedLinkDisplayText(link, destination), { sourceLine, directive });
    const match = getWikilinkRenderMatch(this.app, settings, request, caches, excludeRegexps);
    if (!match) {
      return;
    }

    try {
      const parts = await getRenderedParts(this.app, match, caches.renderedParts);
      if (!parts.markdown) {
        return;
      }

      const wrapper = createSpan({ cls: 'extreme-wikilinks-link' });
      wrapper.setAttribute(ORIGINAL_DESTINATION_ATTRIBUTE, destination);
      applyTemplateName(wrapper, match.template.id);
      const child = new MarkdownRenderChild(wrapper);
      context.addChild(child);
      await renderTemplateMarkdown(this.app, wrapper, parts, context.sourcePath, child);
      link.replaceWith(wrapper);
    } catch (error) {
      recordTemplateFailure({
        sourcePath: context.sourcePath,
        wikilink: match.originalWikilink,
        template: match.template.body,
        message: messageOf(error),
      });
      return;
    }
  }
}

function getRenderedLinkDestination(link: HTMLElement): string {
  const linkText = link.getAttribute('data-href') ?? link.getAttribute('href') ?? '';
  return normalizeLinkDestination(linkText);
}

function getRenderedLinkDisplayText(link: HTMLAnchorElement, destination: string): string | null {
  const text = link.textContent?.trim() ?? '';
  const { target, linkDisplayText } = parseWikilinkTarget(destination);
  if (linkDisplayText) return linkDisplayText;
  if (!text || text === target || text === target.split('/').pop()?.replace(/\.md$/, '')) return null;
  return text;
}
