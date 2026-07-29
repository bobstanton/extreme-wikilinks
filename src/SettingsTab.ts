import { PluginSettingTab, Setting } from 'obsidian';
import type ExtremeWikilinksPlugin from './main';
import { isValidRegex } from './regexUtils';
import { createExcludePattern } from './settings';
import type { HeadingMatchMode, LinkTemplate } from './settings';
import { validateTemplateSyntax } from './templateEngine';

export class ExtremeWikilinksSettingTab extends PluginSettingTab {
  private isVisible = false;

  constructor(private readonly plugin: ExtremeWikilinksPlugin) {
    super(plugin.app, plugin);
  }

  display(): void {
    this.isVisible = true;
    const { containerEl } = this;
    containerEl.empty();

    this.renderExcludePatterns(containerEl);
    this.renderTemplates(containerEl);
  }

  hide(): void {
    this.isVisible = false;
    this.plugin.flushPendingSave();
    super.hide();
  }

  refresh(): void {
    if (!this.isVisible) {
      return;
    }
    this.display();
  }

  private renderExcludePatterns(containerEl: HTMLElement): void {
    new Setting(containerEl).setName('Exclude patterns').setHeading().setDesc('Patterns are JavaScript regular expressions matched against note paths, like \\.tmp$ or ^archive/.');

    this.plugin.settings.excludePatterns.forEach((excludePattern, index) => {
      const { itemsEl } = createSettingGroup(containerEl, `Pattern ${index + 1}`);

      new Setting(itemsEl).setName('Pattern')
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
            this.plugin.saveSettingsSoon();
          });
        });

      new Setting(itemsEl).setName('Apply to notes containing links').setDesc('Use this pattern against notes that contain wikilinks.')
        .addToggle((toggle) => toggle.setValue(excludePattern.matchSource).onChange((value) => {
          excludePattern.matchSource = value;
          void this.plugin.saveSettings();
        }));

      new Setting(itemsEl).setName('Apply to note targets').setDesc('Use this pattern against resolved wikilink target notes.')
        .addToggle((toggle) => toggle.setValue(excludePattern.matchTarget).onChange((value) => {
          excludePattern.matchTarget = value;
          void this.plugin.saveSettings();
        }));

      new Setting(itemsEl)
        .addButton((button) => button.setButtonText('Remove pattern').onClick(() => {
          this.plugin.settings.excludePatterns.splice(index, 1);
          void this.plugin.saveSettings();
          this.display();
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
      const { heading, itemsEl } = createSettingGroup(containerEl, template.id || `Template ${index + 1}`);

      new Setting(itemsEl).setName('Enabled')
        .addToggle((toggle) => toggle.setValue(template.enabled).onChange((value) => {
          template.enabled = value;
          void this.plugin.saveSettings();
        }));

      new Setting(itemsEl).setName('Template name').setDesc('Name shown in settings. Also set on rendered links as data-extreme-wikilinks-template, so CSS snippets targeting the old name stop matching after a rename.')
        .addText((text) => {
          text.setValue(template.id);
          text.onChange((value) => {
            template.id = value.trim();
            heading.setName(template.id || `Template ${index + 1}`);
            this.plugin.saveSettingsSoon();
          });
        });

      new Setting(itemsEl).setName('Collapse spaces').setDesc('Collapse repeated whitespace in this template output. Separators like - or | are left unchanged.')
        .addToggle((toggle) => toggle.setValue(template.collapseSpaces).onChange((value) => {
          template.collapseSpaces = value;
          void this.plugin.saveSettings();
        }));

      this.addTemplateTextArea(itemsEl, template);
      this.addTemplateTextSetting(itemsEl, 'Linked file property', 'Frontmatter property on the linked file, such as type or status. Leave blank to ignore.', template.targetProperty, value => {
        template.targetProperty = value;
      });
      this.addTemplateTextSetting(itemsEl, 'Linked file value', 'Exact value to match. Leave blank to match any non-empty value.', template.targetValue, value => {
        template.targetValue = value;
      });
      this.addSourceHeadingSettings(itemsEl, template);

      new Setting(itemsEl)
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
      .addTextArea((text) => {
        text.setValue(template.body);
        const errorEl = createDiv({ cls: 'extreme-wikilinks-template-error' });
        text.inputEl.insertAdjacentElement('afterend', errorEl);

        const runValidation = (value: string) => {
          void validateTemplateSyntax(value).then((error) => {
            if (text.inputEl.value !== value) return;
            text.inputEl.toggleClass('mod-warning', error !== null);
            text.inputEl.title = error ?? '';
            errorEl.setText(error ?? '');
          });
        };

        runValidation(template.body);
        text.onChange((value) => {
          template.body = value;
          this.plugin.saveSettingsSoon();
          runValidation(value);
        });
      });
  }

  private addSourceHeadingSettings(templateEl: HTMLElement, template: LinkTemplate): void {
    let headingInputEl: HTMLInputElement | null = null;
    const updateInputState = () => {
      if (!headingInputEl) return;
      const invalid = template.sourceHeadingMatch === 'regex' && !isValidRegex(template.sourceHeading);
      headingInputEl.toggleClass('mod-warning', invalid);
      headingInputEl.title = invalid ? 'Invalid regular expression' : '';
    };

    new Setting(templateEl).setName('Source heading').setDesc('Heading above the link from Obsidian metadata, such as food or hikes. Leave blank to ignore.')
      .addText((text) => {
        headingInputEl = text.inputEl;
        text.setValue(template.sourceHeading);
        updateInputState();
        text.onChange((value) => {
          template.sourceHeading = value;
          updateInputState();
          this.plugin.saveSettingsSoon();
        });
      });

    new Setting(templateEl).setName('Source heading match')
      .addDropdown((dropdown) => dropdown.addOption('exact', 'Exact').addOption('regex', 'Regex').setValue(template.sourceHeadingMatch).onChange((value) => {
        template.sourceHeadingMatch = normalizeHeadingMatchMode(value);
        updateInputState();
        void this.plugin.saveSettings();
      }));
  }

  private addTemplateTextSetting(templateEl: HTMLElement, name: string, description: string, value: string, onChange: (value: string) => void): void {
    new Setting(templateEl).setName(name).setDesc(description)
      .addText((text) => text.setValue(value).onChange((newValue) => {
        onChange(newValue);
        this.plugin.saveSettingsSoon();
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

function createSettingGroup(containerEl: HTMLElement, headingName: string): { heading: Setting; itemsEl: HTMLElement } {
  const groupEl = containerEl.createDiv({ cls: 'setting-group' });
  const heading = new Setting(groupEl).setName(headingName).setHeading();
  const itemsEl = groupEl.createDiv({ cls: 'setting-items' });
  return { heading, itemsEl };
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
