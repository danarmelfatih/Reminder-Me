function hasUnsafePathChars(value) {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (char === '\\' || code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

export function safeRedirectPath(value, fallback, baseUrl) {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    hasUnsafePathChars(value)
  ) {
    return fallback;
  }

  try {
    const base = new URL(baseUrl);
    const target = new URL(value, base);
    if (target.origin !== base.origin) return fallback;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}
