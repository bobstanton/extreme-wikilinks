export type HeadingMatchMode = 'exact' | 'regex';

export interface ExcludePattern {
  pattern: string;
  matchSource: boolean;
  matchTarget: boolean;
}

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
  excludePatterns: ExcludePattern[];
  templates: LinkTemplate[];
}

export const DEFAULT_SETTINGS: ExtremeWikilinksSettings = {
  excludePatterns: [],
  templates: [],
};

type PartialLinkTemplate = Partial<LinkTemplate> & Pick<LinkTemplate, 'id' | 'body'>;
type LegacyExcludePattern = string | Partial<ExcludePattern>;
type LegacySettings = Partial<Omit<ExtremeWikilinksSettings, 'excludePatterns'>> & {
  collapseSpaces?: boolean;
  excludePatterns?: LegacyExcludePattern[];
  excludeSourceNotes?: boolean;
  excludeTargetNotes?: boolean;
};

export function normalizeSettings(settings: LegacySettings): ExtremeWikilinksSettings {
  const templates = settings.templates ?? [];
  for (const template of templates) {
    normalizeTemplateInPlace(template, settings.collapseSpaces);
  }

  return {
    templates,
    excludePatterns: normalizeExcludePatterns(settings),
  };
}

export function createExcludePattern(pattern = '\\.tmp$'): ExcludePattern {
  return {
    pattern,
    matchSource: true,
    matchTarget: false,
  };
}

function normalizeExcludePatterns(settings: LegacySettings): ExcludePattern[] {
  return (settings.excludePatterns ?? []).map(item => {
    if (typeof item === 'string') {
      return {
        pattern: item,
        matchSource: settings.excludeSourceNotes ?? true,
        matchTarget: settings.excludeTargetNotes ?? false,
      };
    }

    return {
      pattern: item.pattern ?? '',
      matchSource: item.matchSource ?? settings.excludeSourceNotes ?? true,
      matchTarget: item.matchTarget ?? settings.excludeTargetNotes ?? false,
    };
  });
}

function normalizeTemplateInPlace(template: PartialLinkTemplate, legacyCollapseSpaces: boolean | undefined): asserts template is LinkTemplate {
  template.enabled ??= true;
  template.collapseSpaces ??= legacyCollapseSpaces ?? true;
  template.targetProperty ??= '';
  template.targetValue ??= '';
  template.sourceHeading ??= '';
  template.sourceHeadingMatch ??= 'exact';
}
