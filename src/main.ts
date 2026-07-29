import { EditorView } from '@codemirror/view';
import { debounce, MarkdownView, Notice, Plugin, TFile } from 'obsidian';
import { LinkRenderer } from './linkRenderer';
import { ExtremeWikilinksSettingTab } from './SettingsTab';
import { createLivePreviewExtension, invalidateRendersEffect } from './livePreviewExtension';
import { DEFAULT_SETTINGS, normalizeSettings, type ExtremeWikilinksSettings } from './settings';
import { logger } from './logger';

export default class ExtremeWikilinksPlugin extends Plugin {
  settings: ExtremeWikilinksSettings = DEFAULT_SETTINGS;
  private linkRenderer: LinkRenderer | null = null;
  private settingTab: ExtremeWikilinksSettingTab | null = null;
  private pendingWrite: Promise<unknown> = Promise.resolve();

  private readonly debouncedSave = debounce(() => void this.saveSettings(), 400, true);

  async onload(): Promise<void> {
    await this.loadSettings();

    this.linkRenderer = new LinkRenderer(this.app, () => this.settings);
    this.registerMarkdownPostProcessor(async (element, context) => {
      await this.linkRenderer?.process(element, context);
    });
    this.registerEditorExtension(createLivePreviewExtension(this.app, () => this.settings));
    this.registerEvent(this.app.metadataCache.on('changed', (file) => {
      this.refreshOpenMarkdownViews(file);
    }));

    this.addCommand({
      id: 'copy-debug-log',
      name: 'Copy debug log to clipboard',
      callback: async () => {
        try {
          const entryCount = await logger.copyToClipboard();
          new Notice(`Extreme Wikilinks: Debug log copied (${entryCount} entries)`, 3000);
        }
        catch (error) {
          logger.scope('DebugLog').error('Failed to copy debug log', error);
          new Notice('Extreme Wikilinks: Failed to copy debug log', 5000);
        }
      },
    });

    this.settingTab = new ExtremeWikilinksSettingTab(this);
    this.addSettingTab(this.settingTab);
  }

  onunload(): void {
    this.debouncedSave.run();
  }

  async onExternalSettingsChange(): Promise<void> {
    this.debouncedSave.cancel();
    const incoming = await this.readSettings();
    if (JSON.stringify(incoming) === JSON.stringify(this.settings)) {
      return;
    }

    this.settings = incoming;
    this.settingTab?.refresh();
    this.refreshOpenMarkdownViews();
  }

  async loadSettings(): Promise<void> {
    this.settings = await this.readSettings();
  }

  saveSettingsSoon(): void {
    this.debouncedSave();
  }

  flushPendingSave(): void {
    this.debouncedSave.run();
  }

  async saveSettings(): Promise<void> {
    this.debouncedSave.cancel();
    this.pendingWrite = this.pendingWrite
      .catch(() => undefined)
      .then(() => this.saveData(this.settings));
    await this.pendingWrite;
    this.refreshOpenMarkdownViews();
  }

  private async readSettings(): Promise<ExtremeWikilinksSettings> {
    const savedData = await this.loadData() as Partial<ExtremeWikilinksSettings> | null;
    return normalizeSettings(savedData ?? {});
  }

  private refreshOpenMarkdownViews(changedFile?: TFile): void {
    for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
      if (!(leaf.view instanceof MarkdownView)) {
        continue;
      }
      if (changedFile && !this.shouldRefreshViewForFile(leaf.view, changedFile)) {
        continue;
      }

      if (leaf.view.getMode() === 'preview') {
        leaf.view.previewMode.rerender(true);
      } else {
        refreshLivePreviewDecorations(leaf.view);
      }
    }
  }

  private shouldRefreshViewForFile(view: MarkdownView, changedFile: TFile): boolean {
    const sourcePath = view.file?.path;
    if (!sourcePath) return false;
    if (sourcePath === changedFile.path) return true;
    return (this.app.metadataCache.resolvedLinks[sourcePath]?.[changedFile.path] ?? 0) > 0;
  }
}

function refreshLivePreviewDecorations(view: MarkdownView): void {
  const editorView = (view.editor as unknown as { cm?: EditorView }).cm;
  editorView?.dispatch({ effects: invalidateRendersEffect.of() });
}
