const compiledRegexCache = new Map<string, RegExp>();

export function compileRegex(pattern: string): RegExp {
  const cached = compiledRegexCache.get(pattern);
  if (cached) return cached;

  const regex = new RegExp(pattern);
  compiledRegexCache.set(pattern, regex);
  return regex;
}

export function isValidRegex(pattern: string): boolean {
  try {
    compileRegex(pattern);
    return true;
  } catch {
    return false;
  }
}
