import type { LinkCache, MarkdownSectionInformation, SectionCache } from 'obsidian';

export type WikilinkDirective = { readonly kind: 'skip' } | { readonly kind: 'template'; readonly templateName: string };

export interface WikilinkDirectiveRange {
  readonly from: number;
  readonly to: number;
  readonly directive: WikilinkDirective;
}

export function parseWikilinkDirective(text: string, linkEnd: number): WikilinkDirectiveRange | null {
  if (!text.startsWith('%%ew:', linkEnd)) return null;
  const match = /^%%ew:(skip|template=([^\r\n]*?))%%/.exec(text.slice(linkEnd));
  if (!match) return null;
  const templateName = match[2]?.trim() ?? '';
  if (match[1] !== 'skip' && !templateName) return null;

  return {
    from: linkEnd,
    to: linkEnd + match[0].length,
    directive: match[1] === 'skip' ? { kind: 'skip' } : { kind: 'template', templateName },
  };
}

export function normalizeLinkDestination(destination: string): string {
  try {
    return decodeURIComponent(destination).trim();
  } catch {
    return destination.trim();
  }
}

export function findLinkDirectives(normalizedDestinations: readonly string[], section: MarkdownSectionInformation, sourceLinks: readonly LinkCache[], sourceSections: readonly SectionCache[] = []): Map<number, WikilinkDirective> {
  const directives = new Map<number, WikilinkDirective>();
  if (!section.text.includes('%%ew:')) return directives;
  const comments = findCommentRanges(section.text, sourceSections);

  const renderedByDestination = new Map<string, number[]>();
  normalizedDestinations.forEach((destination, index) => {
    const indices = renderedByDestination.get(destination) ?? [];
    indices.push(index);
    renderedByDestination.set(destination, indices);
  });

  const sourceByDestination = new Map<string, LinkCache[]>();
  for (const link of sourceLinks) {
    if (link.position.start.line < section.lineStart || link.position.end.line > section.lineEnd) continue;
    if (comments.some(([from, to]) => link.position.start.offset >= from && link.position.start.offset < to)) continue;
    const key = normalizeLinkDestination(link.link);
    if (!renderedByDestination.has(key)) continue;
    const references = sourceByDestination.get(key) ?? [];
    references.push(link);
    sourceByDestination.set(key, references);
  }

  for (const [destination, indices] of renderedByDestination) {
    const references = sourceByDestination.get(destination);
    if (!references || references.length !== indices.length) continue;
    references.sort((a, b) => a.position.start.offset - b.position.start.offset);

    if (references.some(link => section.text.slice(link.position.start.offset, link.position.end.offset) !== link.original)) continue;

    references.forEach((link, occurrence) => {
      if (!link.original.startsWith('[[') || !link.original.endsWith(']]')) return;
      const marker = parseWikilinkDirective(section.text, link.position.end.offset);
      if (marker) directives.set(indices[occurrence], marker.directive);
    });
  }

  return directives;
}

function findCommentRanges(text: string, sections: readonly SectionCache[]): Array<readonly [number, number]> {
  const ranges: Array<readonly [number, number]> = [];
  const blocks = sections.filter(section => ['code', 'yaml', 'math', 'html', 'comment'].includes(section.type));
  const masked = text.split('');
  for (const block of blocks) {
    const from = block.position.start.offset;
    const to = block.position.end.offset;
    if (block.type === 'comment') ranges.push([from, to]);
    for (let index = from; index < to && index < masked.length; index += 1) {
      if (masked[index] !== '\n') masked[index] = ' ';
    }
  }

  const source = masked.join('');
  const tokens = /\\[\s\S]|`+|\$\$?|%%|<!--/g;
  let token: RegExpExecArray | null;
  while ((token = tokens.exec(source)) !== null) {
    const delimiter = token[0];
    if (delimiter.startsWith('\\')) continue;
    if (delimiter === '%%' || delimiter === '<!--') {
      const closing = delimiter === '%%' ? '%%' : '-->';
      const end = source.indexOf(closing, tokens.lastIndex);
      if (end < 0) continue;
      if (delimiter === '%%' && source.slice(tokens.lastIndex, end).includes('\n')) {
        const lineStart = source.lastIndexOf('\n', token.index - 1) + 1;
        const prefix = source.slice(lineStart, token.index);
        if (!/^(?:[ \t]|>|(?:[-+*]|\d+[.)])[ \t]+)*$/.test(prefix)) continue;
        const lineEnd = source.indexOf('\n', tokens.lastIndex);
        if (source.slice(tokens.lastIndex, lineEnd).includes('%')) continue;
      }
      ranges.push([token.index, end + closing.length]);
      tokens.lastIndex = end + closing.length;
      continue;
    }

    const closers = new RegExp(delimiter.startsWith('`') ? '`+' : '\\\\[\\s\\S]|\\$\\$?', 'g');
    closers.lastIndex = tokens.lastIndex;
    let closer: RegExpExecArray | null;
    while ((closer = closers.exec(source)) !== null) {
      if (closer[0] !== delimiter) continue;
      tokens.lastIndex = closers.lastIndex;
      break;
    }
  }
  return ranges;
}
