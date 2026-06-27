export type HeadingMatchMode = 'exact' | 'regex';

export interface LinkTemplate {
  id: string;
  body: string;
  enabled: boolean;
  collapseSpaces: boolean;
  targetProperty: string;
  targetValue: string;
  sourceHeading: string;
  sourceHeadingMatch: HeadingMatchMode;
}

export interface ExtremeWikilinksSettings {
  excludePatterns: string[];
  templates: LinkTemplate[];
}

export const DEFAULT_SETTINGS: ExtremeWikilinksSettings = {
  excludePatterns: [],
  templates: [],
};

type PartialLinkTemplate = Partial<LinkTemplate> & Pick<LinkTemplate, 'id' | 'body'>;
type LegacySettings = Partial<ExtremeWikilinksSettings> & { collapseSpaces?: boolean };

export function normalizeSettings(settings: LegacySettings): ExtremeWikilinksSettings {
  const templates = settings.templates ?? [];
  for (const template of templates) {
    normalizeTemplateInPlace(template, settings.collapseSpaces);
  }

  return {
    templates,
    excludePatterns: settings.excludePatterns ?? [],
  };
}

function normalizeTemplateInPlace(template: PartialLinkTemplate, legacyCollapseSpaces: boolean | undefined): asserts template is LinkTemplate {
  template.enabled ??= true;
  template.collapseSpaces ??= legacyCollapseSpaces ?? true;
  template.targetProperty ??= '';
  template.targetValue ??= '';
  template.sourceHeading ??= '';
  template.sourceHeadingMatch ??= 'exact';
}
