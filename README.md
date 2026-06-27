# Extreme Wikilinks

Take your Wikilinks to the eXtreme! by using frontmatter to customize their appearance. EXTREME!

[Screencast_20260625_183949.webm](https://github.com/user-attachments/assets/e623fa1f-c1ac-461a-8078-35a5098b75b9)


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
🍕 Alfredos Pizza Cafe
```

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
