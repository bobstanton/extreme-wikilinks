import { EditorView } from '@codemirror/view';
import { MarkdownView, Notice, Plugin, TFile } from 'obsidian';
import { LinkRenderer } from './linkRenderer';
import { ExtremeWikilinksSettingTab } from './SettingsTab';
import { createLivePreviewExtension, refreshDecorationsEffect } from './livePreviewExtension';
import { DEFAULT_SETTINGS, normalizeSettings, type ExtremeWikilinksSettings } from './settings';
import { logger } from './logger';

export default class ExtremeWikilinksPlugin extends Plugin {
  settings: ExtremeWikilinksSettings = DEFAULT_SETTINGS;
  private linkRenderer: LinkRenderer | null = null;

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

    this.addSettingTab(new ExtremeWikilinksSettingTab(this));
  }

  async loadSettings(): Promise<void> {
    const savedData = await this.loadData() as Partial<ExtremeWikilinksSettings> | null;
    this.settings = normalizeSettings(savedData ?? {});
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.refreshOpenMarkdownViews();
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
  editorView?.dispatch({ effects: refreshDecorationsEffect.of() });
}
