import type { FileNode } from '@pi-agents/contracts';

export type FlatNode = {
  path: string;
  type: 'file' | 'dir';
  depth: number;
  name: string;
  size?: number;
};

export function flattenNodes(nodes: FileNode[]): FlatNode[] {
  const out: FlatNode[] = [];
  const walk = (list: FileNode[]): void => {
    for (const node of list) {
      const segments = node.path.split('/').filter((s) => s.length > 0);
      const depth = Math.max(0, segments.length - 1);
      const name = segments[segments.length - 1] ?? node.path;
      out.push({ path: node.path, type: node.type, depth, name, size: node.size });
      if (node.children && node.children.length > 0) {
        walk(node.children);
      }
    }
  };
  walk(nodes);
  out.sort((a, b) => {
    if (a.path < b.path) return -1;
    if (a.path > b.path) return 1;
    return 0;
  });
  return out;
}

export type Frontmatter = Record<string, string>;

export function parseFrontmatter(content: string): { frontmatter: Frontmatter; body: string } | null {
  if (!content.startsWith('---\n')) return null;
  const afterOpener = content.slice(4);
  const endIdx = afterOpener.indexOf('\n---');
  if (endIdx === -1) return null;
  const raw = afterOpener.slice(0, endIdx);
  const bodyStart = endIdx + 4;
  let body = bodyStart < afterOpener.length ? afterOpener.slice(bodyStart) : '';
  if (body.startsWith('\n')) body = body.slice(1);
  const frontmatter: Frontmatter = {};
  for (const line of raw.split('\n')) {
    if (line.trim().length === 0) continue;
    const sep = line.indexOf(':');
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    const value = line.slice(sep + 1).trim();
    if (key.length > 0) frontmatter[key] = value;
  }
  return { frontmatter, body };
}

export type MarkdownBlock =
  | { kind: 'h1'; text: string }
  | { kind: 'h2'; text: string }
  | { kind: 'h3'; text: string }
  | { kind: 'bullet'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'paragraph'; text: string };

export type InlineSpan =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string };

export function parseInline(text: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  let i = 0;
  while (i < text.length) {
    const next = text.indexOf('`', i);
    if (next === -1) {
      spans.push({ kind: 'text', text: text.slice(i) });
      break;
    }
    if (next > i) spans.push({ kind: 'text', text: text.slice(i, next) });
    const close = text.indexOf('`', next + 1);
    if (close === -1) {
      spans.push({ kind: 'text', text: text.slice(next) });
      break;
    }
    spans.push({ kind: 'code', text: text.slice(next + 1, close) });
    i = close + 1;
  }
  return spans;
}

export function parseMarkdown(content: string): MarkdownBlock[] {
  const lines = content.split('\n');
  const blocks: MarkdownBlock[] = [];
  let inCode = false;
  let codeBuf: string[] = [];
  for (const line of lines) {
    if (line.startsWith('```')) {
      if (inCode) {
        blocks.push({ kind: 'code', text: codeBuf.join('\n') });
        codeBuf = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }
    if (line.startsWith('### ')) {
      blocks.push({ kind: 'h3', text: line.slice(4).trim() });
    } else if (line.startsWith('## ')) {
      blocks.push({ kind: 'h2', text: line.slice(3).trim() });
    } else if (line.startsWith('# ')) {
      blocks.push({ kind: 'h1', text: line.slice(2).trim() });
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      blocks.push({ kind: 'bullet', text: line.slice(2).trim() });
    } else if (line.trim().length === 0) {
      continue;
    } else {
      blocks.push({ kind: 'paragraph', text: line });
    }
  }
  if (inCode && codeBuf.length > 0) {
    blocks.push({ kind: 'code', text: codeBuf.join('\n') });
  }
  return blocks;
}

export const LARGE_FILE_THRESHOLD = 512 * 1024;
export const DISPLAY_TRUNCATE_BYTES = 50 * 1024;
