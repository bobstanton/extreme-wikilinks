const compiledRegexCache = new Map<string, RegExp | null>();

export function compileRegex(pattern: string): RegExp | null {
  const cached = compiledRegexCache.get(pattern);
  if (cached !== undefined) return cached;

  let regex: RegExp | null = null;
  try {
    regex = new RegExp(pattern);
  } catch {
    regex = null;
  }
  compiledRegexCache.set(pattern, regex);
  return regex;
}

export function isValidRegex(pattern: string): boolean {
  return compileRegex(pattern) !== null;
}
