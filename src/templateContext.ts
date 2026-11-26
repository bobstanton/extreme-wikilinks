export interface TemplateContext {
  readonly basename: string;
  readonly linkDestination: string;
  readonly linkDisplayText: string;
  readonly path: string;
  readonly title: string;
  readonly wikilink: string;
  readonly frontmatter: Record<string, unknown>;
}
