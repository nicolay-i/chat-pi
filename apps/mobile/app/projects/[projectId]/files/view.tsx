import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams } from '@/navigation';
import type { FileContent } from '@pi-agents/contracts';
import { ApiClient } from '@/api/client';
import { tokens } from '@/theme/tokens';
import { useBackend } from '@/stores/useBackend';
import {
  DISPLAY_TRUNCATE_BYTES,
  LARGE_FILE_THRESHOLD,
  parseFrontmatter,
  parseInline,
  parseMarkdown,
  type MarkdownBlock,
} from '@/features/files/fileTree';

type Status = 'loading' | 'loaded' | 'error';

function kbLabel(bytes: number): string {
  return Math.max(1, Math.round(bytes / 1024)).toString();
}

export default function FileViewScreen() {
  const params = useLocalSearchParams<{ path?: string | string[] }>();
  const rawPath = Array.isArray(params.path) ? params.path[0] : params.path;
  const path = rawPath ? decodeURIComponent(rawPath) : '';
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { baseUrl } = useBackend();
  const [data, setData] = useState<FileContent | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!baseUrl || !projectId || !path) {
      setStatus('error');
      setError(!path ? 'Missing file path' : 'Backend URL is not configured');
      setData(null);
      return;
    }
    let active = true;
    const client = new ApiClient(baseUrl);
    setStatus('loading');
    setError(null);
    client
      .getFileContent(projectId, path)
      .then((file) => {
        if (!active) return;
        setData(file);
        setStatus('loaded');
      })
      .catch((err: unknown) => {
        if (!active) return;
        const message = err instanceof Error ? err.message : String(err);
        setData(null);
        setError(message);
        setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [baseUrl, projectId, path, nonce]);

  if (status === 'loading') {
    return (
      <View testID="files.loading" style={styles.center}>
        <ActivityIndicator color={tokens.color.primary} />
        <Text style={styles.muted}>Loading file…</Text>
      </View>
    );
  }

  if (status === 'error' || !data) {
    return (
      <View testID="files.error" style={styles.center}>
        <Text style={styles.danger}>Failed to load file</Text>
        <Text style={styles.muted}>{error}</Text>
        <Pressable
          testID="files.retry"
          accessibilityRole="button"
          accessibilityLabel="Retry loading file"
          style={styles.retry}
          onPress={refetch}
        >
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const rawContent = data.encoding === 'base64' ? '' : data.content;
  const isLarge = data.size > LARGE_FILE_THRESHOLD;
  const truncated = isLarge && rawContent.length > DISPLAY_TRUNCATE_BYTES;
  const shown = truncated ? rawContent.slice(0, DISPLAY_TRUNCATE_BYTES) : rawContent;
  const fm = parseFrontmatter(shown);
  const body = fm ? fm.body : shown;
  const isMarkdown = path.toLowerCase().endsWith('.md');

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 32 }}>
      <Text style={styles.path} numberOfLines={2}>
        {data.path}
      </Text>

      {isLarge ? (
        <View testID="files.largeWarning" style={styles.banner}>
          <Text style={styles.bannerText}>
            Большой файл ({kbLabel(data.size)} KB). Просмотр может быть медленным.
            {truncated ? ' показано начало' : ''}
          </Text>
        </View>
      ) : null}

      {fm && Object.keys(fm.frontmatter).length > 0 ? (
        <View testID="files.frontmatter" style={styles.frontmatter}>
          {Object.entries(fm.frontmatter).map(([k, v]) => (
            <View key={k} style={styles.fmRow}>
              <Text style={styles.fmKey}>{k}</Text>
              <Text style={styles.fmVal}>{v}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {isMarkdown ? (
        <MarkdownPreview blocks={parseMarkdown(body)} />
      ) : (
        <Text testID="files.raw" style={styles.raw}>
          {body}
        </Text>
      )}
    </ScrollView>
  );
}

function MarkdownPreview({ blocks }: { blocks: MarkdownBlock[] }) {
  return (
    <View testID="files.markdown" style={styles.markdown}>
      {blocks.map((b, i) => {
        const spans = parseInline(b.text);
        if (b.kind === 'h1') {
          return (
            <Text key={i} style={styles.h1}>
              {b.text}
            </Text>
          );
        }
        if (b.kind === 'h2') {
          return (
            <Text key={i} style={styles.h2}>
              {b.text}
            </Text>
          );
        }
        if (b.kind === 'h3') {
          return (
            <Text key={i} style={styles.h3}>
              {b.text}
            </Text>
          );
        }
        if (b.kind === 'bullet') {
          return (
            <View key={i} style={styles.bulletRow}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.paragraph}>
                {spans.map((s, j) =>
                  s.kind === 'code' ? (
                    <Text key={j} style={styles.inlineCode}>
                      {s.text}
                    </Text>
                  ) : (
                    <Text key={j}>{s.text}</Text>
                  ),
                )}
              </Text>
            </View>
          );
        }
        if (b.kind === 'code') {
          return (
            <Text key={i} style={styles.codeBlock}>
              {b.text}
            </Text>
          );
        }
        return (
          <Text key={i} style={styles.paragraph}>
            {spans.map((s, j) =>
              s.kind === 'code' ? (
                <Text key={j} style={styles.inlineCode}>
                  {s.text}
                </Text>
              ) : (
                <Text key={j}>{s.text}</Text>
              ),
            )}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.color.background,
    padding: 16,
  },
  center: {
    flex: 1,
    backgroundColor: tokens.color.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  muted: {
    color: tokens.color.textMuted,
    marginTop: 8,
    textAlign: 'center',
  },
  danger: {
    color: tokens.color.danger,
    fontWeight: '700',
  },
  retry: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.primary,
  },
  retryText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  path: {
    color: tokens.color.textMuted,
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.sm,
    marginBottom: 8,
  },
  banner: {
    backgroundColor: '#FFF6E5',
    borderWidth: 1,
    borderColor: '#F4C46A',
    borderRadius: tokens.radius.md,
    padding: 12,
    marginBottom: 12,
  },
  bannerText: {
    color: '#8A5A00',
    fontSize: tokens.fontSize.sm,
  },
  frontmatter: {
    backgroundColor: tokens.color.surfaceMuted,
    borderRadius: tokens.radius.md,
    padding: 12,
    marginBottom: 12,
  },
  fmRow: {
    flexDirection: 'row',
    paddingVertical: 2,
  },
  fmKey: {
    color: tokens.color.primary,
    fontWeight: '700',
    fontSize: tokens.fontSize.sm,
    marginRight: 8,
  },
  fmVal: {
    color: tokens.color.text,
    fontSize: tokens.fontSize.sm,
    flex: 1,
  },
  markdown: {
    flex: 1,
  },
  h1: {
    fontSize: 22,
    fontWeight: '700',
    color: tokens.color.text,
    marginTop: 8,
    marginBottom: 4,
  },
  h2: {
    fontSize: 18,
    fontWeight: '700',
    color: tokens.color.text,
    marginTop: 8,
    marginBottom: 4,
  },
  h3: {
    fontSize: 16,
    fontWeight: '700',
    color: tokens.color.text,
    marginTop: 6,
    marginBottom: 2,
  },
  paragraph: {
    color: tokens.color.text,
    fontSize: tokens.fontSize.md,
    marginBottom: 6,
  },
  bulletRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  bullet: {
    color: tokens.color.textMuted,
    marginRight: 8,
    fontSize: tokens.fontSize.md,
  },
  inlineCode: {
    fontFamily: 'monospace',
    backgroundColor: tokens.color.codeBg,
    color: tokens.color.successText,
    fontSize: tokens.fontSize.sm,
  },
  codeBlock: {
    fontFamily: 'monospace',
    backgroundColor: tokens.color.surfaceMuted,
    color: tokens.color.text,
    fontSize: tokens.fontSize.sm,
    padding: 8,
    borderRadius: tokens.radius.sm,
    marginBottom: 8,
  },
  raw: {
    fontFamily: 'monospace',
    color: tokens.color.text,
    fontSize: tokens.fontSize.sm,
  },
});
