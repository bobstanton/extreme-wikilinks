import { App, TFile } from 'obsidian';
import type { LinkTemplate } from './settings';
import { CompositeContextProvider, ObsidianContextProvider, PlaceholderResolver, SimpleContextProvider } from 'placeholder-resolver';

export interface TemplateContext {
  readonly basename: string;
  readonly linkDestination: string;
  readonly linkDisplayText: string;
  readonly path: string;
  readonly title: string;
  readonly wikilink: string;
  readonly frontmatter: Record<string, unknown>;
}

export interface RenderedTemplateParts {
  readonly markdown: string;
}

export class TemplateRenderError extends Error {
  constructor(
    message: string,
    readonly diagnostics: readonly string[],
  ) {
    super(message);
    this.name = 'TemplateRenderError';
  }
}

export async function renderTemplate(app: App, targetFile: TFile, template: LinkTemplate, context: TemplateContext, collapseSpaces: boolean): Promise<RenderedTemplateParts> {
  const resolver = new PlaceholderResolver(new CompositeContextProvider([
    new ObsidianContextProvider(app, targetFile),
    new SimpleContextProvider(buildWikilinkContext(context)),
  ]), {
    formatArray: formatMarkdownArray,
  });
  const { result, hasUnresolved, diagnostics } = await resolver.resolveWithDetails(template.body);
  if (hasUnresolved) {
    throw new TemplateRenderError(
      'Template contains unresolved placeholders',
      diagnostics.map(diagnostic => diagnostic.message ? `${diagnostic.placeholder}: ${diagnostic.message}` : diagnostic.placeholder),
    );
  }

  return { markdown: collapseSpaces ? result.replace(/\s+/g, ' ').trim() : result };
}

export function templateRenderKey(template: LinkTemplate): string {
  return JSON.stringify([template.body, template.collapseSpaces]);
}

export async function validateTemplateSyntax(body: string): Promise<string | null> {
  if (!body.trim()) return null;

  const resolver = new PlaceholderResolver(new SimpleContextProvider(createForgivingContext()), {
    formatArray: formatMarkdownArray,
  });

  let diagnostics;
  try {
    ({ diagnostics } = await resolver.resolveWithDetails(body));
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  const diagnostic = diagnostics[0];
  if (!diagnostic) return null;

  const target = diagnostic.expression !== undefined ? `{${diagnostic.expression}}` : diagnostic.placeholder;
  return diagnostic.message ? `${diagnostic.message} in ${target}` : `Invalid template syntax near ${target}`;
}

function createForgivingContext(): Record<string, unknown> {
  const forgiving: object = new Proxy(function forgivingTarget() { return undefined; }, {
    get: (_target, key) => {
      if (key === 'then') return undefined;
      if (key === Symbol.toPrimitive) return () => '';
      return forgiving;
    },
    apply: () => forgiving,
    construct: () => forgiving,
  });
  return forgiving as Record<string, unknown>;
}

function formatMarkdownArray(values: readonly unknown[], escapeValue: (value: string) => string): string {
  return values
    .filter(value => value !== null && value !== undefined && value !== '')
    .map(value => escapeValue(String(value)))
    .join(', ');
}

function buildWikilinkContext(context: TemplateContext): Record<string, unknown> {
  return {
    linkDestination: context.linkDestination,
    linkDisplayText: context.linkDisplayText,
    title: context.title,
    wikilink: context.wikilink,
  };
}
