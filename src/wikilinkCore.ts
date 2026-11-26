import { compileRegex } from './regexUtils';
import type { ExtremeWikilinksSettings } from './settings';

export interface ExcludeRegexps {
  readonly source: RegExp[];
  readonly target: RegExp[];
}

export function createExcludeMatcher(): (settings: ExtremeWikilinksSettings) => ExcludeRegexps {
  let key: string | null = null;
  let regexps: ExcludeRegexps = { source: [], target: [] };
  return (settings) => {
    const nextKey = JSON.stringify(settings.excludePatterns);
    if (nextKey !== key) {
      key = nextKey;
      regexps = {
        source: compileExcludePatterns(settings.excludePatterns.filter(({ matchSource }) => matchSource)),
        target: compileExcludePatterns(settings.excludePatterns.filter(({ matchTarget }) => matchTarget)),
      };
    }
    return regexps;
  };
}

function compileExcludePatterns(patterns: ReadonlyArray<{ pattern: string }>): RegExp[] {
  return patterns.map(({ pattern }) => compileRegex(pattern)).filter((regex): regex is RegExp => regex !== null);
}

export function serializeKey(parts: ReadonlyArray<string | number>): string {
  return parts.map(value => `${String(value).length}:${value}`).join('|');
}

export function isPathExcluded(sourcePath: string, excludeRegexps: RegExp[]): boolean {
  return excludeRegexps.some(pattern => pattern.test(sourcePath));
}

export function formatOriginalWikilink(rawTarget: string, linkDisplayText: string | null): string {
  return linkDisplayText ? `[[${rawTarget}|${linkDisplayText}]]` : `[[${rawTarget}]]`;
}

