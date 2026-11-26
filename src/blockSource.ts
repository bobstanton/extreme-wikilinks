import { findWikilinkTokens, type WikilinkToken } from './wikilinkRender';

export const BLOCK_KEYS = ['template', 'name', 'heading'] as const;
type BlockKey = typeof BLOCK_KEYS[number];

function isBlockKey(key: string): key is BlockKey {
  return (BLOCK_KEYS as readonly string[]).includes(key);
}

export interface BlockLink {
  readonly token: WikilinkToken;
  readonly text: string;
}

export interface BlockSource {
  readonly template?: string;
  readonly name?: string;
  readonly heading?: string;
  readonly links: readonly BlockLink[];
  readonly errors: readonly string[];
  readonly isEmpty: boolean;
}

const KEY_LINE = /^([A-Za-z]+):(.*)$/;

export function parseBlockSource(source: string): BlockSource {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const separator = lines.findIndex(line => line.trim() === '---');
  const values: Partial<Record<BlockKey, string>> = {};
  const errors: string[] = [];

  let index = 0;
  const headerEnd = separator >= 0 ? separator : lines.length;
  while (index < headerEnd) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const match = KEY_LINE.exec(line);
    const key = match?.[1];
    if (!match || !key || !isBlockKey(key)) {
      if (separator >= 0) {
        errors.push(match
          ? `Unknown setting "${match[1]}" on line ${index + 1}. Use ${BLOCK_KEYS.join(', ')}.`
          : `Line ${index + 1} is above the --- line but is not a setting such as "template: …".`);
        index += 1;
        continue;
      }
      break;
    }

    if (values[key] !== undefined) errors.push(`"${key}" is set more than once.`);
    const value = match[2].trim();
    index += 1;
    if (value === '|') {
      const block: string[] = [];
      while (index < headerEnd && (/^[ \t]/.test(lines[index]) || !lines[index].trim())) {
        block.push(lines[index]);
        index += 1;
      }
      values[key] = dedent(block);
    } else {
      values[key] = value;
    }
  }

  const bodyStart = separator >= 0 ? separator + 1 : index;
  const links: BlockLink[] = [];
  for (const line of lines.slice(bodyStart)) {
    for (const token of findWikilinkTokens(line, 0)) {
      links.push({ token, text: line.slice(token.from, token.marker?.to ?? token.to) });
    }
  }

  if (values.template !== undefined && !values.template.trim()) errors.push('"template" is empty.');

  return {
    template: values.template,
    name: values.name || undefined,
    heading: values.heading,
    links,
    errors,
    isEmpty: !source.trim(),
  };
}

function dedent(lines: string[]): string {
  while (lines.length > 0 && !lines[lines.length - 1].trim()) lines.pop();
  const indents = lines.filter(line => line.trim()).map(line => /^[ \t]*/.exec(line)?.[0].length ?? 0);
  const indent = indents.length > 0 ? Math.min(...indents) : 0;
  return lines.map(line => line.slice(indent)).join('\n');
}
