export { DEFAULT_SETTINGS, normalizeSettings } from './settings';
export type { ExcludePattern, ExtremeWikilinksSettings, HeadingMatchMode, LinkTemplate } from './settings';
export { chooseTemplate } from './templateMatcher';
export type { TemplateMatchContext } from './templateMatcher';
export { compileRegex } from './regexUtils';
export { createExcludeMatcher, formatOriginalWikilink, isPathExcluded, serializeKey } from './wikilinkRender';
export type { ExcludeRegexps } from './wikilinkRender';
export type { TemplateContext } from './templateEngine';
