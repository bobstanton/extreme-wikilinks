import { PluginSettingTab, Setting } from 'obsidian';
import type ExtremeWikilinksPlugin from './main';
import { isValidRegex } from './regexUtils';
import { createExcludePattern } from './settings';
import type { HeadingMatchMode, LinkTemplate } from './settings';

export class ExtremeWikilinksSettingTab extends PluginSettingTab {
  constructor(private readonly plugin: ExtremeWikilinksPlugin) {
    super(plugin.app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    this.renderExcludePatterns(containerEl);
    this.renderTemplates(containerEl);
  }

  private renderExcludePatterns(containerEl: HTMLElement): void {
    new Setting(containerEl).setName('Exclude patterns').setHeading().setDesc('Patterns are JavaScript regular expressions matched against note paths, like \\.tmp$ or ^archive/.');

    this.plugin.settings.excludePatterns.forEach((excludePattern, index) => {
      const patternEl = containerEl.createDiv({ cls: 'extreme-wikilinks-exclude-pattern' });
      new Setting(patternEl).setName(`Pattern ${index + 1}`)
        .addText((text) => {
          text.setValue(excludePattern.pattern);
          this.updateRegexInputState(text.inputEl, excludePattern.pattern);

          text.onChange((value) => {
            if (!isValidRegex(value)) {
              this.updateRegexInputState(text.inputEl, value);
              return;
            }

            excludePattern.pattern = value;
            this.updateRegexInputState(text.inputEl, value);
            void this.plugin.saveSettings();
          });
        })
          .addButton((button) => button.setButtonText('Remove').onClick(() => {
          this.plugin.settings.excludePatterns.splice(index, 1);
          void this.plugin.saveSettings();
          this.display();
        }));

      new Setting(patternEl).setName('Apply to notes containing links').setDesc('Use this pattern against notes that contain wikilinks.')
        .addToggle((toggle) => toggle.setValue(excludePattern.matchSource).onChange((value) => {
          excludePattern.matchSource = value;
          void this.plugin.saveSettings();
        }));

      new Setting(patternEl).setName('Apply to note targets').setDesc('Use this pattern against resolved wikilink target notes.')
        .addToggle((toggle) => toggle.setValue(excludePattern.matchTarget).onChange((value) => {
          excludePattern.matchTarget = value;
          void this.plugin.saveSettings();
        }));
    });

    new Setting(containerEl)
      .addButton((button) => button.setButtonText('Add exclude pattern').setCta().onClick(() => {
        this.plugin.settings.excludePatterns.push(createExcludePattern());
        void this.plugin.saveSettings();
        this.display();
      }));
  }

  private renderTemplates(containerEl: HTMLElement): void {
    new Setting(containerEl).setName('Templates').setHeading().setDesc('Templates are evaluated in order. A template with no conditions acts as a fallback. Templates replace an inline link, so use inline Markdown. Use {this.wikilink} for a Wikilink to the original link destination with the original display text. Linked file frontmatter is available as {this.propertyName}. For names with spaces, use bracket syntax: {this[\'Property With Spaces\']}.');

    for (const [index, template] of this.plugin.settings.templates.entries()) {
      const templateEl = containerEl.createDiv({ cls: 'extreme-wikilinks-template' });
      const heading = new Setting(templateEl).setName(template.id || `Template ${index + 1}`).setHeading();

      new Setting(templateEl).setName('Enabled')
        .addToggle((toggle) => toggle.setValue(template.enabled).onChange((value) => {
          template.enabled = value;
          void this.plugin.saveSettings();
        }));

      new Setting(templateEl).setName('Template name').setDesc('Name shown in settings.')
        .addText((text) => {
          text.setValue(template.id);
          text.onChange((value) => {
            template.id = value.trim();
            heading.setName(template.id || `Template ${index + 1}`);
            void this.plugin.saveSettings();
          });
        });

      new Setting(templateEl).setName('Collapse spaces').setDesc('Collapse repeated whitespace in this template output. Separators like - or | are left unchanged.')
        .addToggle((toggle) => toggle.setValue(template.collapseSpaces).onChange((value) => {
          template.collapseSpaces = value;
          void this.plugin.saveSettings();
        }));

      this.addTemplateTextArea(templateEl, template);
      this.addTemplateTextSetting(templateEl, 'Linked file property', 'Frontmatter property on the linked file, such as type or status. Leave blank to ignore.', template.targetProperty, value => {
        template.targetProperty = value;
      });
      this.addTemplateTextSetting(templateEl, 'Linked file value', 'Exact value to match. Leave blank to match any non-empty value.', template.targetValue, value => {
        template.targetValue = value;
      });
      this.addTemplateTextSetting(templateEl, 'Source heading', 'Heading above the link from Obsidian metadata, such as Food or Hikes. Leave blank to ignore.', template.sourceHeading, value => {
        template.sourceHeading = value;
      });

      new Setting(templateEl).setName('Source heading match')
        .addDropdown((dropdown) => dropdown.addOption('exact', 'Exact').addOption('regex', 'Regex').setValue(template.sourceHeadingMatch).onChange((value) => {
          template.sourceHeadingMatch = normalizeHeadingMatchMode(value);
          void this.plugin.saveSettings();
        }));

      new Setting(templateEl)
        .addButton((button) => button.setButtonText('Move up').setDisabled(index === 0).onClick(() => {
          moveTemplate(this.plugin.settings.templates, index, index - 1);
          void this.plugin.saveSettings();
          this.display();
        }))
        .addButton((button) => button.setButtonText('Move down').setDisabled(index === this.plugin.settings.templates.length - 1).onClick(() => {
          moveTemplate(this.plugin.settings.templates, index, index + 1);
          void this.plugin.saveSettings();
          this.display();
        }))
        .addButton((button) => button.setButtonText('Remove template').onClick(() => {
          this.plugin.settings.templates.splice(index, 1);
          void this.plugin.saveSettings();
          this.display();
        }));
    }

    new Setting(containerEl)
      .addButton((button) => button.setButtonText('Add template').setCta().onClick(() => {
        this.plugin.settings.templates.push(createTemplate());
        void this.plugin.saveSettings();
        this.display();
      }));
  }

  private addTemplateTextArea(templateEl: HTMLElement, template: LinkTemplate): void {
    new Setting(templateEl).setName('Template').setClass('extreme-wikilinks-template-setting')
      .addTextArea((text) => text.setValue(template.body).onChange((value) => {
        template.body = value;
        void this.plugin.saveSettings();
      }));
  }

  private addTemplateTextSetting(templateEl: HTMLElement, name: string, description: string, value: string, onChange: (value: string) => void): void {
    new Setting(templateEl).setName(name).setDesc(description)
      .addText((text) => text.setValue(value).onChange((newValue) => {
        onChange(newValue);
        void this.plugin.saveSettings();
      }));
  }

  private updateRegexInputState(inputEl: HTMLInputElement, pattern: string): void {
    if (!isValidRegex(pattern)) {
      inputEl.addClass('mod-warning');
      inputEl.title = 'Invalid regular expression';
      return;
    }

    inputEl.removeClass('mod-warning');
    inputEl.title = '';
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

function normalizeHeadingMatchMode(value: string): HeadingMatchMode {
  return value === 'regex' ? 'regex' : 'exact';
}
