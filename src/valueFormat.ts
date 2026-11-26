export class UnreadableValue {
  constructor(readonly message: string) {}
}

export interface FormatOptions {
  readonly maxLength?: number;
  readonly timestamp?: boolean;
}

export function formatValue(value: unknown, { maxLength = 300, timestamp = false }: FormatOptions = {}): string {
  if (value instanceof UnreadableValue) return value.message;
  if (timestamp && typeof value === 'number') return new Date(value).toLocaleString();
  if (typeof value === 'string') return value === '' ? '""' : truncate(value, maxLength);
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  let text: string;
  try {
    text = JSON.stringify(value) ?? String(value);
  } catch {
    text = String(value);
  }
  return truncate(text, maxLength);
}

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}
