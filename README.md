# Extreme Wikilinks

Take your Wikilinks to the eXtreme! by using frontmatter to customize their appearance. EXTREME!

![Extreme Wikilinks demo](demo.gif)


Using frontmatter such as:

```yaml
---
Address: 1040 S Washington Ave, Scranton, Pennsylvania 18505
icon: 🍕
---
```

With a template like:

```text
{this.icon} {this.wikilink}
```

Will result in:

```text
🍕 [[Alfredos Pizza Cafe]]
```

Or with frontmatter:

```yaml
---
Distance: 1.57 mi
icon: 🥨
---
```

And template:

```text
{this.icon} [[{this.linkDestination}|{this.linkDisplayText} {this.Distance}]]
```

Results in:

```text
🥨 [[Pretzel Day Walk|Pretzel Day Walk 1.57 mi]]
```

Templates can be conditionally applied based on headings or target links. A template without conditions applies to every link, and the first enabled matching template in the list wins.

## Skip an individual link

Add `%%ew:skip%%` immediately after a wikilink to skip extreme processing:

```text
[[Alfredos Pizza Cafe]]%%ew:skip%%
[[Alfredos Pizza Cafe|Pizza]]%%ew:skip%%
[[Alfredos Pizza Cafe#Menu|Menu]]%%ew:skip%%
```

## Choose a template for an individual link

Add `%%ew:template=compact%%` immediately after a wikilink to use the enabled template named `compact`, regardless of its conditions or position in the template list:

```text
[[Alfredos Pizza Cafe]]%%ew:template=compact%%
[[Alfredos Pizza Cafe#Menu|Dinner]]%%ew:template=compact%%
```

Names are case-sensitive. Missing, disabled, or duplicate names leave the ordinary wikilink. Exclude patterns still apply. 

## Templates

Templates are managed in plugin settings.

### Built-in values

<!-- builtins:start -->

**Link**

- `{this.wikilink}` - The original link rebuilt with its heading and alias, such as `[[Alfredos Pizza Cafe#Menu|Pizza]]`
- `{this.linkDestination}` - The link target as written, including any heading or block reference, such as `Alfredos Pizza Cafe#Menu`
- `{this.linkDisplayText}` - The link alias, such as `Pizza` from `[[Alfredos Pizza Cafe|Pizza]]`, or the note name when the link has no alias

**Note**

- `{this.title}` - Linked note name without the extension
- `{this.basename}` - Same as `title`
- `{this.name}` - Linked file name with the extension
- `{this.extension}` - Linked file extension, such as `md`
- `{this.path}` - Linked file path in the vault
- `{this.folder}` - Linked file folder, ending in `/`, or empty at the vault root
- `{this.size}` - Linked file size in bytes
- `{this.created}` - Linked file creation time as a timestamp, such as `{h.formatDate(this.created, "YYYY-MM-DD")}`
- `{this.modified}` - Linked file modification time as a timestamp
- `{this.tags}` - Frontmatter tags, without the leading `#`
- `{this.bodyTags}` - Tags written in the note body, without the leading `#`
- `{this.headings}` - Headings in the linked note
- `{this.outgoingLinks}` - Paths of the files the linked note links to
- `{this.frontmatter}` - The frontmatter object, for properties hidden by a built-in name, such as `{this.frontmatter.tags}`
- `{this.content}` - Full text of the linked note, read when a template uses it

**Date and vault**

- `{this.today}` - Current date as `YYYY-MM-DD`
- `{this.now}` - Current time as an ISO timestamp
- `{this.year}` - Current year
- `{this.month}` - Current month, 1 to 12
- `{this.day}` - Current day of the month
- `{this.vault}` - Vault name

### Helpers

Helpers are under `h`, such as `{h.joinPresent([this.Distance, this.Address], " - ")}`:

- `h.replace(text, search, replacement)` - Replace every occurrence of `search`
- `h.regexReplace(text, pattern, replacement, flags?)` - Replace regular expression matches
- `h.match(text, pattern, flags?)` - First regular expression match, or null
- `h.test(text, pattern, flags?)` - Whether a regular expression matches
- `h.lower(text)` - Lowercase
- `h.upper(text)` - Uppercase
- `h.capitalize(text)` - Uppercase the first letter
- `h.trim(text)` - Remove surrounding whitespace
- `h.padStart(text, length, char?)` - Pad on the left to `length`
- `h.padEnd(text, length, char?)` - Pad on the right to `length`
- `h.slugify(text)` - Lowercase, hyphen-separated text
- `h.split(text, delimiter)` - Split into a list
- `h.before(text, delimiter)` - Text before the first `delimiter`
- `h.after(text, delimiter)` - Text after the first `delimiter`
- `h.beforeLast(text, delimiter)` - Text before the last `delimiter`
- `h.afterLast(text, delimiter)` - Text after the last `delimiter`
- `h.formatDate(date, format?)` - Format a date or timestamp with tokens such as `YYYY`, `MM` and `DD`
- `h.round(value, decimals?)` - Round a number
- `h.formatNumber(number, decimals?)` - Format a number with thousands separators
- `h.formatBytes(bytes, decimals?)` - Format a size, such as `1.5 KB`
- `h.pluralize(count, singular, plural?)` - Choose the singular or plural word for `count`
- `h.escape(text)` - Escape HTML characters
- `h.truncate(text, length?, suffix?)` - Shorten text, adding `suffix`
- `h.stripHtml(text)` - Remove HTML tags
- `h.nl2br(text)` - Turn line breaks into `<br>`
- `h.default(value, fallback)` - `fallback` when `value` is null or undefined
- `h.ifEmpty(value, replacement)` - `replacement` when `value` is empty
- `h.join(list, delimiter?)` - Join a list
- `h.joinPresent(list, delimiter?)` - Join a list, skipping empty values
- `h.first(list)` - First item
- `h.last(list)` - Last item
- `h.unique(list)` - Remove duplicates
- `h.sortBy(list, key, direction?)` - Sort objects by a property
- `h.groupBy(list, key)` - Group objects by a property
- `h.sum(numbers)` - Total
- `h.avg(numbers)` - Average
- `h.min(numbers)` - Smallest
- `h.max(numbers)` - Largest
- `h.keys(object)` - Property names
- `h.values(object)` - Property values
- `h.entries(object)` - Name and value pairs
- `h.pick(object, ...keys)` - Keep only the named properties
- `h.omit(object, ...keys)` - Remove the named properties
- `h.json(value, pretty?)` - Convert to JSON
- `h.parseJson(text)` - Parse JSON
- `h.sqlIn(list, escape?)` - Format a list for a SQL `IN (...)` clause
- `h.sqlEscape(text)` - Escape text for SQL
- `h.sqlLiteral(value)` - Format a value as a SQL literal
- `h.unquote(text)` - Remove surrounding quotes
- `h.isBlank(text)` - Whether text is empty or whitespace
- `h.hasTag(tags, tag)` - Whether a tag list contains `tag`, such as `h.hasTag(this.tags, "pizza")`
- `h.markdownLink(label, url)` - Build a Markdown link
- `h.filename(path)` - File name from a path
- `h.pathBasename(path)` - File name without the extension
- `h.pathExtension(path)` - File extension
- `h.pathParent(path)` - Parent folder of a path

<!-- builtins:end -->

### Frontmatter

Linked file frontmatter is also available directly, such as `{this.icon}`, `{this.Address}`.

For frontmatter names with spaces or punctuation, use bracket syntax:

```text
{this['Property With Spaces']}
```

Template expressions can use JavaScript:

```text
{h.hasTag(this.tags, 'online-ordering') && this.Website ? this.Website : ''}
```

## Test templates in a note

An `extreme-wikilinks` code block shows how links render, which template each one uses, and why the others were skipped. Select a link and expand **Values** to see every value a template can read for it.

````text
```extreme-wikilinks
[[Alfredos Pizza Cafe]]
[[Alfredos Pizza Cafe#Menu|Dinner]]
```
````

Add a draft template above a `---` line to try it on the same links. The block shows the template in an editor, and the links re-render as you type. With a `name`, the block can save the draft as a new template, or overwrite the template with that name:

````text
```extreme-wikilinks
name: compact
template: {this.icon} [[{this.linkDestination}|{this.linkDisplayText}]]
---
[[Alfredos Pizza Cafe]]
[[Alfredos Pizza Cafe#Menu|Dinner]]
```
````

Use `template: |` followed by indented lines for a multi-line template. Without a template, `heading: Restaurants` tests your saved templates as if the links were under that heading.

## Styling

Every rendered link is wrapped in a `span.extreme-wikilinks-link`, with a data attribute for the template name, custom CSS can style each template:

```css
[data-extreme-wikilinks-template="Archived"] {
  --link-color: var(--text-muted);
  --link-color-hover: var(--text-normal);
}
```

And there are built in classes for `extreme-wikilinks-faint` and `extreme-wikilinks-highlight`:

```text
<span class="extreme-wikilinks-faint">{this.wikilink}</span>
```
