import type { LinkTemplate } from './settings';
import type { TemplateContext } from './templateContext';
import { compileRegex } from './regexUtils';

export interface TemplateMatchContext {
  readonly sourceHeading: string;
  readonly readFrontmatter?: (frontmatter: Record<string, unknown>, key: string) => unknown;
  readonly templateContext: TemplateContext;
}

export function chooseTemplate(templates: LinkTemplate[], context: TemplateMatchContext, templateName?: string): LinkTemplate | null {
  if (templateName !== undefined) {
    const named = templatesNamed(templates, templateName);
    return named.length === 1 && named[0].enabled ? named[0] : null;
  }
  return templates.find(template => template.enabled && failedCondition(template, context) === null) ?? null;
}

export type TemplateCheckOutcome = 'matched' | 'skipped' | 'not-checked';

export interface TemplateCheck {
  readonly template: LinkTemplate;
  readonly index: number;
  readonly outcome: TemplateCheckOutcome;
  readonly reason: string;
}

export interface TemplateChoice {
  readonly template: LinkTemplate | null;
  readonly checks: readonly TemplateCheck[];
  readonly reason?: string;
}

export function explainTemplateChoice(templates: LinkTemplate[], context: TemplateMatchContext, templateName?: string): TemplateChoice {
  if (templateName !== undefined) {
    const named = templatesNamed(templates, templateName);
    if (named.length === 0) return { template: null, checks: [], reason: `No template is named "${templateName}"` };
    if (named.length > 1) return { template: null, checks: [], reason: `${named.length} templates are named "${templateName}"` };
    const [template] = named;
    const index = templates.indexOf(template);
    return template.enabled
      ? { template, checks: [{ template, index, outcome: 'matched', reason: `chosen by %%ew:template=${templateName}%%` }] }
      : { template: null, checks: [{ template, index, outcome: 'skipped', reason: 'disabled' }] };
  }

  const checks: TemplateCheck[] = [];
  let chosen: LinkTemplate | null = null;
  for (const [index, template] of templates.entries()) {
    if (chosen) {
      checks.push({ template, index, outcome: 'not-checked', reason: 'an earlier template matched' });
    } else if (!template.enabled) {
      checks.push({ template, index, outcome: 'skipped', reason: 'disabled' });
    } else {
      const failure = failedCondition(template, context);
      checks.push({ template, index, outcome: failure ? 'skipped' : 'matched', reason: failure ? failure() : describeConditions(template) });
      if (!failure) chosen = template;
    }
  }
  return { template: chosen, checks, reason: templates.length === 0 ? 'There are no templates' : undefined };
}

function templatesNamed(templates: LinkTemplate[], name: string): LinkTemplate[] {
  return templates.filter(template => template.id.trim() === name);
}

function describeConditions(template: LinkTemplate): string {
  const conditions: string[] = [];
  const property = template.targetProperty.trim();
  if (property) {
    const expected = template.targetValue.trim();
    conditions.push(expected ? `"${property}" is "${expected}"` : `"${property}" is set`);
  }
  const heading = template.sourceHeading.trim();
  if (heading) {
    conditions.push(template.sourceHeadingMatch === 'regex' ? `under a heading matching /${heading}/` : `under the heading "${heading}"`);
  }
  return conditions.length > 0 ? conditions.join(' and ') : 'matches every link';
}

function failedCondition(template: LinkTemplate, context: TemplateMatchContext): (() => string) | null {
  const property = template.targetProperty.trim();
  if (property) {
    const expected = template.targetValue.trim();
    const value: unknown = (context.readFrontmatter ?? readFrontmatter)(context.templateContext.frontmatter, property);
    if (!matchesValue(value, expected)) {
      return () => {
        if (value == null) return `"${property}" is not set`;
        return expected ? `"${property}" is ${describeValue(value)}, not "${expected}"` : `"${property}" is ${describeValue(value)}`;
      };
    }
  }

  const heading = template.sourceHeading.trim();
  const actual = context.sourceHeading;
  if (heading && !matchesHeading(actual, heading, template.sourceHeadingMatch)) {
    return () => {
      if (!actual) return 'the link is not under a heading';
      if (template.sourceHeadingMatch === 'exact') return `the link is under "${actual}", not "${heading}"`;
      return compileRegex(heading) ? `the heading "${actual}" does not match /${heading}/` : `/${heading}/ is not a valid regular expression`;
    };
  }

  return null;
}

function describeValue(value: unknown): string {
  if (value === '') return 'empty';
  if (value === false) return 'false';
  const comparable = toComparableString(value);
  if (comparable !== null) return `"${comparable}"`;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return 'a nested value';
  }
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

function readFrontmatter(frontmatter: Record<string, unknown>, key: string): unknown {
  if (key in frontmatter) return frontmatter[key];
  const normalize = (value: string): string => value.toLowerCase().replace(/[\s_-]/g, '');
  const found = Object.keys(frontmatter).find(candidate => normalize(candidate) === normalize(key));
  return found === undefined ? null : frontmatter[found];
}
