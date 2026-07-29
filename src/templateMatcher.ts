import { parseFrontMatterEntry } from 'obsidian';
import type { LinkTemplate } from './settings';
import type { TemplateContext } from './templateEngine';
import { compileRegex } from './regexUtils';

export interface TemplateMatchContext {
  readonly sourceHeading: string;
  readonly templateContext: TemplateContext;
}

export function chooseTemplate(templates: LinkTemplate[], context: TemplateMatchContext): LinkTemplate | null {
  return templates.find(template => template.enabled && templateMatches(template, context)) ?? null;
}

function templateMatches(template: LinkTemplate, context: TemplateMatchContext): boolean {
  if (template.targetProperty.trim()) {
    const value: unknown = parseFrontMatterEntry(context.templateContext.frontmatter, template.targetProperty.trim());
    if (!matchesValue(value, template.targetValue.trim())) {
      return false;
    }
  }

  if (template.sourceHeading.trim()) {
    if (!matchesHeading(context.sourceHeading, template.sourceHeading.trim(), template.sourceHeadingMatch)) {
      return false;
    }
  }

  return true;
}

function matchesValue(value: unknown, expected: string): boolean {
  if (!expected) {
    return value != null && value !== false && value !== '';
  }

  if (Array.isArray(value)) {
    return value.some(item => matchesValue(item, expected));
  }

  return toComparableString(value) === expected;
}

/*
 * Frontmatter values can be nested maps, which have no meaningful string form.
 * Stringifying them yields "[object Object]", so a configured value could never
 * match one, and two unrelated objects would compare equal to each other. Only
 * primitives are comparable to the value typed in settings.
 */
function toComparableString(value: unknown): string | null {
  switch (typeof value) {
    case 'string':
      return value;
    case 'number':
    case 'boolean':
    case 'bigint':
      return String(value);
    default:
      return null;
  }
}

function matchesHeading(actual: string, expected: string, mode: 'exact' | 'regex'): boolean {
  if (!actual) {
    return false;
  }

  if (mode === 'exact') {
    return actual === expected;
  }

  const regex = compileRegex(expected);
  return regex ? regex.test(actual) : false;
}
