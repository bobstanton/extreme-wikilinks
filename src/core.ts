export { DEFAULT_SETTINGS, normalizeSettings } from './settings';
export type { ExcludePattern, ExtremeWikilinksSettings, HeadingMatchMode, LinkTemplate } from './settings';
export { chooseTemplate } from './templateMatcher';
export type { TemplateMatchContext } from './templateMatcher';
export { compileRegex } from './regexUtils';
export { createExcludeMatcher, formatOriginalWikilink, isPathExcluded, serializeKey } from './wikilinkCore';
export type { ExcludeRegexps } from './wikilinkCore';
export type { TemplateContext } from './templateContext';
