export type BuiltinGroup = 'Link' | 'Note' | 'Date and vault';

export interface BuiltinValue {
  readonly name: string;
  readonly group: BuiltinGroup;
  readonly description: string;
  readonly lazy?: boolean;
  readonly timestamp?: boolean;
}

export const BUILTIN_VALUES: readonly BuiltinValue[] = [
  { name: 'wikilink', group: 'Link', description: 'The original link rebuilt with its heading and alias, such as `[[Alfredos Pizza Cafe#Menu|Pizza]]`' },
  { name: 'linkDestination', group: 'Link', description: 'The link target as written, including any heading or block reference, such as `Alfredos Pizza Cafe#Menu`' },
  { name: 'linkDisplayText', group: 'Link', description: 'The link alias, such as `Pizza` from `[[Alfredos Pizza Cafe|Pizza]]`, or the note name when the link has no alias' },
  { name: 'title', group: 'Note', description: 'Linked note name without the extension' },
  { name: 'basename', group: 'Note', description: 'Same as `title`' },
  { name: 'name', group: 'Note', description: 'Linked file name with the extension' },
  { name: 'extension', group: 'Note', description: 'Linked file extension, such as `md`' },
  { name: 'path', group: 'Note', description: 'Linked file path in the vault' },
  { name: 'folder', group: 'Note', description: 'Linked file folder, ending in `/`, or empty at the vault root' },
  { name: 'size', group: 'Note', description: 'Linked file size in bytes' },
  { name: 'created', group: 'Note', description: 'Linked file creation time as a timestamp, such as `{h.formatDate(this.created, "YYYY-MM-DD")}`', timestamp: true },
  { name: 'modified', group: 'Note', description: 'Linked file modification time as a timestamp', timestamp: true },
  { name: 'tags', group: 'Note', description: 'Frontmatter tags, without the leading `#`' },
  { name: 'bodyTags', group: 'Note', description: 'Tags written in the note body, without the leading `#`' },
  { name: 'headings', group: 'Note', description: 'Headings in the linked note' },
  { name: 'outgoingLinks', group: 'Note', description: 'Paths of the files the linked note links to' },
  { name: 'frontmatter', group: 'Note', description: 'The frontmatter object, for properties hidden by a built-in name, such as `{this.frontmatter.tags}`' },
  { name: 'content', group: 'Note', description: 'Full text of the linked note, read when a template uses it', lazy: true },
  { name: 'today', group: 'Date and vault', description: 'Current date as `YYYY-MM-DD`' },
  { name: 'now', group: 'Date and vault', description: 'Current time as an ISO timestamp' },
  { name: 'year', group: 'Date and vault', description: 'Current year' },
  { name: 'month', group: 'Date and vault', description: 'Current month, 1 to 12' },
  { name: 'day', group: 'Date and vault', description: 'Current day of the month' },
  { name: 'vault', group: 'Date and vault', description: 'Vault name' },
];

export const BUILTIN_VALUE_NAMES: ReadonlySet<string> = new Set(BUILTIN_VALUES.map(value => value.name));

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

export function propertyAccess(key: string): string {
  return IDENTIFIER.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`;
}

export interface HelperDescription {
  readonly name: string;
  readonly signature: string;
  readonly description: string;
}

export const HELPERS: readonly HelperDescription[] = [
  { name: 'replace', signature: 'replace(text, search, replacement)', description: 'Replace every occurrence of `search`' },
  { name: 'regexReplace', signature: 'regexReplace(text, pattern, replacement, flags?)', description: 'Replace regular expression matches' },
  { name: 'match', signature: 'match(text, pattern, flags?)', description: 'First regular expression match, or null' },
  { name: 'test', signature: 'test(text, pattern, flags?)', description: 'Whether a regular expression matches' },
  { name: 'lower', signature: 'lower(text)', description: 'Lowercase' },
  { name: 'upper', signature: 'upper(text)', description: 'Uppercase' },
  { name: 'capitalize', signature: 'capitalize(text)', description: 'Uppercase the first letter' },
  { name: 'trim', signature: 'trim(text)', description: 'Remove surrounding whitespace' },
  { name: 'padStart', signature: 'padStart(text, length, char?)', description: 'Pad on the left to `length`' },
  { name: 'padEnd', signature: 'padEnd(text, length, char?)', description: 'Pad on the right to `length`' },
  { name: 'slugify', signature: 'slugify(text)', description: 'Lowercase, hyphen-separated text' },
  { name: 'split', signature: 'split(text, delimiter)', description: 'Split into a list' },
  { name: 'before', signature: 'before(text, delimiter)', description: 'Text before the first `delimiter`' },
  { name: 'after', signature: 'after(text, delimiter)', description: 'Text after the first `delimiter`' },
  { name: 'beforeLast', signature: 'beforeLast(text, delimiter)', description: 'Text before the last `delimiter`' },
  { name: 'afterLast', signature: 'afterLast(text, delimiter)', description: 'Text after the last `delimiter`' },
  { name: 'formatDate', signature: 'formatDate(date, format?)', description: 'Format a date or timestamp with tokens such as `YYYY`, `MM` and `DD`' },
  { name: 'round', signature: 'round(value, decimals?)', description: 'Round a number' },
  { name: 'formatNumber', signature: 'formatNumber(number, decimals?)', description: 'Format a number with thousands separators' },
  { name: 'formatBytes', signature: 'formatBytes(bytes, decimals?)', description: 'Format a size, such as `1.5 KB`' },
  { name: 'pluralize', signature: 'pluralize(count, singular, plural?)', description: 'Choose the singular or plural word for `count`' },
  { name: 'escape', signature: 'escape(text)', description: 'Escape HTML characters' },
  { name: 'truncate', signature: 'truncate(text, length?, suffix?)', description: 'Shorten text, adding `suffix`' },
  { name: 'stripHtml', signature: 'stripHtml(text)', description: 'Remove HTML tags' },
  { name: 'nl2br', signature: 'nl2br(text)', description: 'Turn line breaks into `<br>`' },
  { name: 'default', signature: 'default(value, fallback)', description: '`fallback` when `value` is null or undefined' },
  { name: 'ifEmpty', signature: 'ifEmpty(value, replacement)', description: '`replacement` when `value` is empty' },
  { name: 'join', signature: 'join(list, delimiter?)', description: 'Join a list' },
  { name: 'joinPresent', signature: 'joinPresent(list, delimiter?)', description: 'Join a list, skipping empty values' },
  { name: 'first', signature: 'first(list)', description: 'First item' },
  { name: 'last', signature: 'last(list)', description: 'Last item' },
  { name: 'unique', signature: 'unique(list)', description: 'Remove duplicates' },
  { name: 'sortBy', signature: 'sortBy(list, key, direction?)', description: 'Sort objects by a property' },
  { name: 'groupBy', signature: 'groupBy(list, key)', description: 'Group objects by a property' },
  { name: 'sum', signature: 'sum(numbers)', description: 'Total' },
  { name: 'avg', signature: 'avg(numbers)', description: 'Average' },
  { name: 'min', signature: 'min(numbers)', description: 'Smallest' },
  { name: 'max', signature: 'max(numbers)', description: 'Largest' },
  { name: 'keys', signature: 'keys(object)', description: 'Property names' },
  { name: 'values', signature: 'values(object)', description: 'Property values' },
  { name: 'entries', signature: 'entries(object)', description: 'Name and value pairs' },
  { name: 'pick', signature: 'pick(object, ...keys)', description: 'Keep only the named properties' },
  { name: 'omit', signature: 'omit(object, ...keys)', description: 'Remove the named properties' },
  { name: 'json', signature: 'json(value, pretty?)', description: 'Convert to JSON' },
  { name: 'parseJson', signature: 'parseJson(text)', description: 'Parse JSON' },
  { name: 'sqlIn', signature: 'sqlIn(list, escape?)', description: 'Format a list for a SQL `IN (...)` clause' },
  { name: 'sqlEscape', signature: 'sqlEscape(text)', description: 'Escape text for SQL' },
  { name: 'sqlLiteral', signature: 'sqlLiteral(value)', description: 'Format a value as a SQL literal' },
  { name: 'unquote', signature: 'unquote(text)', description: 'Remove surrounding quotes' },
  { name: 'isBlank', signature: 'isBlank(text)', description: 'Whether text is empty or whitespace' },
  { name: 'hasTag', signature: 'hasTag(tags, tag)', description: 'Whether a tag list contains `tag`, such as `h.hasTag(this.tags, "pizza")`' },
  { name: 'markdownLink', signature: 'markdownLink(label, url)', description: 'Build a Markdown link' },
  { name: 'filename', signature: 'filename(path)', description: 'File name from a path' },
  { name: 'pathBasename', signature: 'pathBasename(path)', description: 'File name without the extension' },
  { name: 'pathExtension', signature: 'pathExtension(path)', description: 'File extension' },
  { name: 'pathParent', signature: 'pathParent(path)', description: 'Parent folder of a path' },
];
