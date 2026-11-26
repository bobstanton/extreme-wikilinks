import { PluginSettingTab } from 'obsidian';
import type { SettingDefinitionItem, SettingDefinitionPage, SettingGroupItem } from 'obsidian';
import type ExtremeWikilinksPlugin from './main';
import { isValidRegex } from './regexUtils';
import { createExcludePattern, createTemplate } from './settings';
import type { ExcludePattern, LinkTemplate } from './settings';
import { validateTemplateSyntax } from './templateEngine';
import { createTemplateEditor } from './templateEditor';
import type { EditorView } from '@codemirror/view';

export class ExtremeWikilinksSettingTab extends PluginSettingTab {
  private editors: EditorView[] = [];

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
      target[field] = (typeof value === 'string' ? value : '').trim();
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
    target[field] = typeof value === 'string' ? value : '';
    this.plugin.saveSettingsSoon();
  }

  hide(): void {
    this.plugin.flushPendingSave();
    for (const editor of this.editors) editor.destroy();
    this.editors = [];
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
          control: { type: 'toggle', key: `excludePatterns:${index}:matchSource` },
        },
        {
          name: 'Apply to note targets',
          control: { type: 'toggle', key: `excludePatterns:${index}:matchTarget` },
        },
        this.deleteItem('Delete pattern', () => {
          this.removeItem('excludePatterns', excludePattern);
        }),
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
          desc: 'Renaming requires updating %%ew:template=name%% directives and CSS snippets using data-extreme-wikilinks-template.',
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
          control: { type: 'text', key: `templates:${index}:targetProperty` },
        },
        {
          name: 'Linked file value',
          control: { type: 'text', key: `templates:${index}:targetValue` },
        },
        {
          name: 'Source heading',
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
        this.deleteItem('Delete template', () => {
          this.removeItem('templates', template);
        }),
      ],
    };
  }

  private deleteItem(name: string, onDelete: () => void): SettingGroupItem {
    return {
      name,
      render: (setting) => {
        setting.addButton((button) => {
          button.setButtonText('Delete').setDestructive().onClick(() => {
            setting.settingEl.closest('.setting-page')
              ?.querySelector<HTMLElement>('.setting-page-back-button')?.click();
            onDelete();
          });
        });
      },
    };
  }

  private removeItem(collection: 'excludePatterns' | 'templates', item: ExcludePattern | LinkTemplate): void {
    const entries = this.plugin.settings[collection];
    const index = entries.findIndex((entry) => entry === item);
    if (index < 0) return;
    entries.splice(index, 1);
    void this.plugin.saveSettings();
    this.update();
  }

  private templateBodyItem(template: LinkTemplate): SettingGroupItem {
    return {
      name: 'Template',
      render: (setting) => {
        setting.setClass('extreme-wikilinks-template-setting');
        const runValidation = (value: string) => {
          void validateTemplateSyntax(value).then((error) => {
            if (template.body !== value) return;
            setting.setErrorMessage(error);
          });
        };

        this.editors.push(createTemplateEditor({
          parent: setting.controlEl.createDiv({ cls: 'extreme-wikilinks-template-editor' }),
          value: template.body,
          label: 'Template',
          onChange: (value) => {
            template.body = value;
            this.plugin.saveSettingsSoon();
            runValidation(value);
          },
        }));
        runValidation(template.body);
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

function moveTemplate(templates: LinkTemplate[], from: number, to: number): void {
  const template = templates[from];
  templates.splice(from, 1);
  templates.splice(to, 0, template);
}
