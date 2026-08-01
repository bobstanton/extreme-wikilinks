import { PluginSettingTab } from 'obsidian';
import type { SettingDefinitionItem, SettingDefinitionPage, SettingGroupItem } from 'obsidian';
import type ExtremeWikilinksPlugin from './main';
import { isValidRegex } from './regexUtils';
import { createExcludePattern } from './settings';
import type { ExcludePattern, LinkTemplate } from './settings';
import { validateTemplateSyntax } from './templateEngine';

export class ExtremeWikilinksSettingTab extends PluginSettingTab {
  constructor(private readonly plugin: ExtremeWikilinksPlugin) {
    super(plugin.app, plugin);
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        type: 'list',
        heading: 'Exclude patterns',
        emptyState: 'No exclude patterns.',
        onDelete: (index) => {
          this.plugin.settings.excludePatterns.splice(index, 1);
          void this.plugin.saveSettings();
          this.update();
        },
        addItem: {
          name: 'Add exclude pattern',
          action: () => {
            this.plugin.settings.excludePatterns.push(createExcludePattern());
            void this.plugin.saveSettings();
            this.update();
          },
        },
        items: this.plugin.settings.excludePatterns.map((excludePattern, index) => this.excludePatternPage(excludePattern, index)),
      },
      {
        type: 'list',
        heading: 'Templates',
        emptyState: 'No templates.',
        onReorder: (oldIndex, newIndex) => {
          moveTemplate(this.plugin.settings.templates, oldIndex, newIndex);
          void this.plugin.saveSettings();
          this.update();
        },
        onDelete: (index) => {
          this.plugin.settings.templates.splice(index, 1);
          void this.plugin.saveSettings();
          this.update();
        },
        addItem: {
          name: 'Add template',
          action: () => {
            this.plugin.settings.templates.push(createTemplate());
            void this.plugin.saveSettings();
            this.update();
          },
        },
        items: this.plugin.settings.templates.map((template, index) => this.templatePage(template, index)),
      },
    ];
  }

  getControlValue(key: string): unknown {
    const resolved = this.resolveControlTarget(key);
    return resolved ? resolved.target[resolved.field] : undefined;
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    const resolved = this.resolveControlTarget(key);
    if (!resolved) return;
    const { target, field } = resolved;

    if (field === 'id') {
      target[field] = String(value ?? '').trim();
      this.plugin.saveSettingsSoon();
      return;
    }
    if (field === 'sourceHeadingMatch') {
      target[field] = value === 'regex' ? 'regex' : 'exact';
      await this.plugin.saveSettings();
      // Re-renders so the source heading field revalidates under the new mode.
      this.update();
      return;
    }
    if (typeof value === 'boolean') {
      target[field] = value;
      await this.plugin.saveSettings();
      return;
    }
    target[field] = String(value ?? '');
    this.plugin.saveSettingsSoon();
  }

  hide(): void {
    this.plugin.flushPendingSave();
    super.hide();
  }

  refresh(): void {
    this.update();
  }

  private excludePatternPage(excludePattern: ExcludePattern, index: number): SettingDefinitionPage {
    return {
      type: 'page',
      name: `Pattern ${index + 1}`,
      displayValue: () => excludePattern.pattern,
      items: [
        {
          name: 'Pattern',
          desc: 'Patterns are JavaScript regular expressions matched against note paths, like \\.tmp$ or ^archive/.',
          control: {
            type: 'text',
            key: `excludePatterns:${index}:pattern`,
            validate: (value) => (isValidRegex(value) ? undefined : 'Invalid regular expression'),
          },
        },
        {
          name: 'Apply to notes containing links',
          desc: 'Use this pattern against notes that contain wikilinks.',
          control: { type: 'toggle', key: `excludePatterns:${index}:matchSource` },
        },
        {
          name: 'Apply to note targets',
          desc: 'Use this pattern against resolved wikilink target notes.',
          control: { type: 'toggle', key: `excludePatterns:${index}:matchTarget` },
        },
      ],
    };
  }

  private templatePage(template: LinkTemplate, index: number): SettingDefinitionPage {
    return {
      type: 'page',
      name: template.id || `Template ${index + 1}`,
      items: [
        {
          name: 'Enabled',
          control: { type: 'toggle', key: `templates:${index}:enabled` },
        },
        {
          name: 'Template name',
          desc: 'Name shown in settings. Also set on rendered links as data-extreme-wikilinks-template, so CSS snippets targeting the old name stop matching after a rename.',
          control: { type: 'text', key: `templates:${index}:id` },
        },
        {
          name: 'Collapse spaces',
          desc: 'Collapse repeated whitespace in this template output. Separators like - or | are left unchanged.',
          control: { type: 'toggle', key: `templates:${index}:collapseSpaces` },
        },
        this.templateBodyItem(template),
        {
          name: 'Linked file property',
          desc: 'Frontmatter property on the linked file, such as type or status. Leave blank to ignore.',
          control: { type: 'text', key: `templates:${index}:targetProperty` },
        },
        {
          name: 'Linked file value',
          desc: 'Exact value to match. Leave blank to match any non-empty value.',
          control: { type: 'text', key: `templates:${index}:targetValue` },
        },
        {
          name: 'Source heading',
          desc: 'Heading above the link from Obsidian metadata, such as food or hikes. Leave blank to ignore.',
          control: {
            type: 'text',
            key: `templates:${index}:sourceHeading`,
            validate: (value) => (value && template.sourceHeadingMatch === 'regex' && !isValidRegex(value) ? 'Invalid regular expression' : undefined),
          },
        },
        {
          name: 'Source heading match',
          control: {
            type: 'dropdown',
            key: `templates:${index}:sourceHeadingMatch`,
            options: { exact: 'Exact', regex: 'Regex' },
          },
        },
      ],
    };
  }

  private templateBodyItem(template: LinkTemplate): SettingGroupItem {
    return {
      name: 'Template',
      desc: 'Templates are evaluated in order. A template with no conditions acts as a fallback. Templates replace an inline link, so use inline Markdown. Use {this.wikilink} for a Wikilink to the original link destination with the original display text. Linked file frontmatter is available as {this.propertyName}. For names with spaces, use bracket syntax: {this[\'Property With Spaces\']}.',
      render: (setting) => {
        setting.setClass('extreme-wikilinks-template-setting');
        setting.addTextArea((text) => {
          text.setValue(template.body);

          const runValidation = (value: string) => {
            void validateTemplateSyntax(value).then((error) => {
              if (text.inputEl.value !== value) return;
              setting.setErrorMessage(error);
            });
          };

          runValidation(template.body);
          text.onChange((value) => {
            template.body = value;
            this.plugin.saveSettingsSoon();
            runValidation(value);
          });
        });
      },
    };
  }

  private resolveControlTarget(key: string): { target: Record<string, unknown>; field: string } | null {
    const [collection, indexText, field] = key.split(':');
    const index = Number(indexText);
    const entry = collection === 'excludePatterns' ? this.plugin.settings.excludePatterns[index]
      : collection === 'templates' ? this.plugin.settings.templates[index]
        : undefined;
    return entry ? { target: entry as unknown as Record<string, unknown>, field } : null;
  }
}

function createTemplate(): LinkTemplate {
  return {
    id: '',
    body: '{this.wikilink}',
    enabled: true,
    collapseSpaces: true,
    targetProperty: '',
    targetValue: '',
    sourceHeading: '',
    sourceHeadingMatch: 'exact',
  };
}

function moveTemplate(templates: LinkTemplate[], from: number, to: number): void {
  const template = templates[from];
  templates.splice(from, 1);
  templates.splice(to, 0, template);
}
