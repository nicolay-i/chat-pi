export function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase());
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function randomId(): string {
  return crypto.randomUUID();
}
