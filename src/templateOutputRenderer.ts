import { App, Component, MarkdownRenderer } from 'obsidian';
import type { RenderedTemplateParts } from './templateEngine';

export const TEMPLATE_NAME_ATTRIBUTE = 'data-extreme-wikilinks-template';

export function applyTemplateName(element: HTMLElement, templateId: string): void {
  const name = templateId.trim();
  if (!name) return;
  element.setAttribute(TEMPLATE_NAME_ATTRIBUTE, name);
}

export async function renderTemplateMarkdown(app: App, parent: HTMLElement, parts: RenderedTemplateParts, sourcePath: string, component: Component): Promise<void> {
  await MarkdownRenderer.render(app, parts.markdown, parent, sourcePath, component);
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
