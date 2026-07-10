const HEX_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3}|[0-9a-fA-F]{8})$/;

export function isValidHex(s: string): boolean {
  return HEX_RE.test(s);
}

export function normalizeHex(s: string): string {
  const upper = s.toUpperCase();
  if (upper.length === 4 && upper[0] === '#') {
    const [, r, g, b] = upper;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return upper;
}
