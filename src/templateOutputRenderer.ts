import { App, Component, MarkdownRenderer } from 'obsidian';
import type { RenderedTemplateParts } from './templateEngine';

export async function renderTemplateMarkdown(app: App, parent: HTMLElement, parts: RenderedTemplateParts, sourcePath: string, component: Component): Promise<void> {
  await MarkdownRenderer.render(app, parts.markdown, parent, sourcePath, component);
  parent.querySelectorAll<HTMLAnchorElement>('a.internal-link').forEach(link => link.addClass('extreme-wikilinks-linked-token'));
  parent.querySelectorAll(':scope > p').forEach(paragraph => unwrapParagraph(parent, paragraph));
}

export function hasBlockLevelOutput(parent: HTMLElement): boolean {
  return Array.from(parent.children).some(child => isBlockLevelElement(child));
}

function unwrapParagraph(parent: HTMLElement, paragraph: Element): void {
  while (paragraph.firstChild) {
    parent.insertBefore(paragraph.firstChild, paragraph);
  }
  paragraph.remove();
}

function isBlockLevelElement(element: Element): boolean {
  return [
    'ADDRESS',
    'ARTICLE',
    'ASIDE',
    'BLOCKQUOTE',
    'DETAILS',
    'DIV',
    'DL',
    'FIGURE',
    'FOOTER',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'HEADER',
    'HR',
    'LI',
    'OL',
    'PRE',
    'SECTION',
    'TABLE',
    'UL',
  ].includes(element.tagName);
}
