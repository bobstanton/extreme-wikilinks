import { App, MarkdownPostProcessorContext, MarkdownRenderChild } from 'obsidian';
import type { ExtremeWikilinksSettings } from './settings';
import { renderTemplateMarkdown } from './templateOutputRenderer';
import { recordTemplateFailure } from './logger';
import { createExcludeMatcher, createRenderCaches, createWikilinkRenderRequest, getRenderedParts, getWikilinkRenderMatch, isPathExcluded, parseWikilinkTarget, type WikilinkRenderCaches } from './wikilinkRender';

export class LinkRenderer {
  private readonly getExcludeRegexps = createExcludeMatcher();

  constructor(private readonly app: App, private readonly getSettings: () => ExtremeWikilinksSettings) {}

  async process(root: HTMLElement, context: MarkdownPostProcessorContext): Promise<void> {
    if (root.closest('.extreme-wikilinks-link')) {
      return;
    }

    const settings = this.getSettings();
    if (isPathExcluded(context.sourcePath, this.getExcludeRegexps(settings))) {
      return;
    }

    const sectionInfo = context.getSectionInfo(root);
    if (!sectionInfo) {
      return;
    }

    const caches = createRenderCaches();
    const links = Array.from(root.querySelectorAll<HTMLAnchorElement>('a.internal-link'));
    await Promise.all(links.map(link => this.processLink(link, context, settings, sectionInfo.lineStart, caches)));
  }

  private async processLink(link: HTMLAnchorElement, context: MarkdownPostProcessorContext, settings: ExtremeWikilinksSettings, sourceLine: number, caches: WikilinkRenderCaches): Promise<void> {
    if (link.closest('.extreme-wikilinks-link')) {
      return;
    }

    const destination = getRenderedLinkDestination(link);
    const request = createWikilinkRenderRequest(context.sourcePath, destination, getRenderedLinkDisplayText(link, destination), { sourceLine });
    const match = getWikilinkRenderMatch(this.app, settings, request, caches);
    if (!match) {
      return;
    }

    try {
      const parts = await getRenderedParts(this.app, match, caches.renderedParts);
      if (!parts.markdown) {
        return;
      }

      const wrapper = link.ownerDocument.createElement('span');
      wrapper.addClass('extreme-wikilinks-link');
      const child = new MarkdownRenderChild(wrapper);
      context.addChild(child);
      await renderTemplateMarkdown(this.app, wrapper, parts, context.sourcePath, child);
      link.replaceWith(wrapper);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      recordTemplateFailure({
        sourcePath: context.sourcePath,
        wikilink: match.originalWikilink,
        template: match.template.body,
        message,
      });
      return;
    }
  }
}

function getRenderedLinkDestination(link: HTMLAnchorElement): string {
  const linkText = link.getAttribute('data-href') ?? link.getAttribute('href') ?? '';
  return decodeURIComponent(linkText).trim();
}

function getRenderedLinkDisplayText(link: HTMLAnchorElement, destination: string): string | null {
  const text = link.textContent?.trim() ?? '';
  const { target, linkDisplayText } = parseWikilinkTarget(destination);
  if (linkDisplayText) return linkDisplayText;
  if (!text || text === target || text === target.split('/').pop()?.replace(/\.md$/, '')) return null;
  return text;
}
