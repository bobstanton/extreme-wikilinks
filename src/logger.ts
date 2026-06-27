import { createDebugLogger } from 'obsidian-debug-logger';

export const logger = createDebugLogger('Extreme Wikilinks', {
  defaultConsoleLevel: 'warn',
  bufferSize: 300,
});

export const templateLogger = logger.scope('Template');

export interface TemplateFailureDetails {
  readonly sourcePath: string;
  readonly wikilink: string;
  readonly template: string;
  readonly message: string;
}

export function recordTemplateFailure(details: TemplateFailureDetails): void {
  templateLogger.warn('Template render failed', details);
}
