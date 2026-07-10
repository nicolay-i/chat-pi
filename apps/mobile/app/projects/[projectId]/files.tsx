import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { SearchResult } from '@pi-agents/contracts';
import { ApiClient } from '@/api/client';
import { tokens } from '@/theme/tokens';
import { useProjectFiles } from '@/features/files/useProjectFiles';
import { flattenNodes } from '@/features/files/fileTree';
import { useBackend } from '@/state/backendStore';

const rowTestID = (path: string): string => `files.row.${path.replace(/\//g, '_')}`;

export default function FilesScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { nodes, status, error, refetch } = useProjectFiles(projectId);
  const { baseUrl } = useBackend();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searchStatus, setSearchStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [searchError, setSearchError] = useState<string | null>(null);

  const runSearch = useCallback(
    (q: string) => {
      if (!baseUrl || !projectId) return;
      if (q.trim().length === 0) {
        setResults(null);
        setSearchStatus('idle');
        setSearchError(null);
        return;
      }
      const client = new ApiClient(baseUrl);
      setSearchStatus('loading');
      setSearchError(null);
      client
        .searchFiles(projectId, { query: q })
        .then((rows) => {
          setResults(rows);
          setSearchStatus('idle');
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          setSearchError(message);
          setSearchStatus('error');
        });
    },
    [baseUrl, projectId],
  );

  useEffect(() => {
    runSearch(query);
  }, [query, runSearch]);

  const isSearching = query.trim().length > 0;
  const flat = nodes ? flattenNodes(nodes) : [];

  const openFile = (path: string): void => {
    router.push(`./files/view?path=${encodeURIComponent(path)}`);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Files</Text>
      <TextInput
        testID="files.search"
        style={styles.search}
        placeholder="Search files…"
        placeholderTextColor={tokens.color.textMuted}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
      />

      {!isSearching && status === 'loading' ? (
        <View testID="files.loading" style={styles.center}>
          <ActivityIndicator color={tokens.color.primary} />
          <Text style={styles.muted}>Loading files…</Text>
        </View>
      ) : null}

      {!isSearching && status === 'error' ? (
        <View testID="files.error" style={styles.center}>
          <Text style={styles.danger}>Failed to load files</Text>
          <Text style={styles.muted}>{error}</Text>
          <Pressable
          testID="files.retry"
          accessibilityRole="button"
          accessibilityLabel="Retry loading files"
          style={styles.retry}
          onPress={refetch}
        >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {!isSearching && status === 'empty' ? (
        <View testID="files.empty" style={styles.center}>
          <Text style={styles.muted}>No files yet.</Text>
        </View>
      ) : null}

      {!isSearching && status === 'loaded' ? (
        <ScrollView testID="files.tree">
          {flat.map((node) => (
            <Pressable
              key={node.path}
              testID={rowTestID(node.path)}
              accessibilityRole="button"
              accessibilityLabel={node.type === 'file' ? `Open file ${node.name}` : node.name}
              style={[styles.row, { paddingLeft: 12 + node.depth * 16 }]}
              onPress={() => node.type === 'file' ? openFile(node.path) : undefined}
            >
              <Text style={styles.rowIcon}>{node.type === 'dir' ? '▸' : '•'}</Text>
              <Text style={styles.rowText}>{node.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {isSearching && searchStatus === 'loading' ? (
        <View testID="files.searchLoading" style={styles.center}>
          <ActivityIndicator color={tokens.color.primary} />
          <Text style={styles.muted}>Searching…</Text>
        </View>
      ) : null}

      {isSearching && searchStatus === 'error' ? (
        <View testID="files.searchError" style={styles.center}>
          <Text style={styles.danger}>Search failed</Text>
          <Text style={styles.muted}>{searchError}</Text>
        </View>
      ) : null}

      {isSearching && searchStatus === 'idle' ? (
        <ScrollView testID="files.results">
          {results && results.length === 0 ? (
            <View testID="files.noResults" style={styles.center}>
              <Text style={styles.muted}>No matches for “{query}”.</Text>
            </View>
          ) : null}
          {results
            ? results.map((r, i) => (
                <Pressable
                  key={`${r.path}:${r.line}:${i}`}
                  testID={`files.result.${i}`}
                  accessibilityRole="link"
                  accessibilityLabel={`Open result ${r.path}:${r.line}`}
                  style={styles.resultRow}
                  onPress={() => openFile(r.path)}
                >
                  <Text style={styles.resultPath}>{r.path}:{r.line}</Text>
                  <Text style={styles.resultPreview} numberOfLines={2}>
                    {r.preview}
                  </Text>
                </Pressable>
              ))
            : null}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.color.background,
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: tokens.color.text,
  },
  search: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: tokens.color.text,
    fontSize: tokens.fontSize.md,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border,
  },
  rowIcon: {
    color: tokens.color.textMuted,
    marginRight: 8,
    fontSize: tokens.fontSize.md,
  },
  rowText: {
    color: tokens.color.text,
    fontSize: tokens.fontSize.md,
  },
  resultRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border,
  },
  resultPath: {
    color: tokens.color.primary,
    fontSize: tokens.fontSize.sm,
    fontWeight: '700',
  },
  resultPreview: {
    marginTop: 2,
    color: tokens.color.text,
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.sm,
  },
});
