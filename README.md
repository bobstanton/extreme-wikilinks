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
{this.icon} [[{this.linkDestination}|{this.title} {this.Distance}]]
```

Results in:

```text
🥨 [[Pretzel Day Walk|Pretzel Day Walk 1.57 mi]]
```

Templates can be conditionally applied based on headings or target links.

## Templates

Templates are managed in plugin settings.

Built-in values:

- `{this.title}` - linked file basename
- `{this.basename}` - linked file basename
- `{this.path}` - linked file path
- `{this.wikilink}` - Wikilink to the original link destination using the original display text
- `{this.linkDestination}` - original link destination, including headings or block anchors
- `{this.linkDisplayText}` - original link display text, such as `Pizza` from `[[Alfredos Pizza Cafe|Pizza]]`
- `{this.frontmatter}` - linked file frontmatter object

Linked file frontmatter is also available directly, such as `{this.icon}`, `{this.Address}`.

For frontmatter names with spaces or punctuation, use bracket syntax:

```text
{this['Property With Spaces']}
```

Template expressions can use JavaScript:

```text
{h.hasTag(this.tags, 'online-ordering') && this.Website ? this.Website : ''}
```

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
