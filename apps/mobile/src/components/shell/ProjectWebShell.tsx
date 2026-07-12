import { ReactNode } from 'react';
import { Link } from '@/navigation';
import { Platform, View, Text, StyleSheet } from 'react-native';
import { tokens } from '@/theme/tokens';

/**
 * ProjectWebShell — 3-column responsive shell used only on web.
 *
 * Left: project-scoped navigation links.
 * Center: the active screen (children via <Slot />).
 * Right: context panel placeholder (TBD: task/chat context).
 *
 * On native (iOS/Android) this component is NOT rendered — the
 * [projectId]/_layout.tsx returns the bare <Slot /> so mobile keeps its
 * default header + back-button stack navigation. Do not import this on
 * native-only paths; it is lazily selected via Platform.OS.
 */
const SIDEBAR_WIDTH = 240;
const CONTEXT_WIDTH = 280;

function NavItem({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} style={styles.navItem}>
      <Text style={styles.navItemText}>{label}</Text>
    </Link>
  );
}

export function ProjectWebShell({
  projectId,
  children,
}: {
  projectId: string;
  children: ReactNode;
}) {
  const isWeb = Platform.OS === 'web';
  if (!isWeb) {
    return <>{children}</>;
  }

  const base = `/projects/${projectId}`;
  return (
    <View style={styles.shell}>
      <View style={styles.sidebar}>
        <Text style={styles.sidebarTitle}>Project</Text>
        <NavItem href={`${base}`} label="Dashboard" />
        <NavItem href={`${base}/chats`} label="Chats" />
        <NavItem href={`${base}/tasks`} label="Tasks" />
        <NavItem href={`${base}/files`} label="Files" />
        <NavItem href={`${base}/actions`} label="Actions" />
        <Text style={[styles.sidebarTitle, { marginTop: 16 }]}>Settings</Text>
        <NavItem href={`${base}/settings/providers`} label="Providers" />
        <NavItem href={`${base}/settings/skills`} label="Skills" />
        <NavItem href={`${base}/settings/prompts`} label="Prompts" />
        <NavItem href={`${base}/settings/packages`} label="Packages" />
        <NavItem href={`${base}/settings/mcp`} label="MCP" />
        <NavItem href={`${base}/settings/theme`} label="Theme" />
      </View>
      <View style={styles.center}>{children}</View>
      <View style={styles.context}>
        <Text style={styles.contextTitle}>Context</Text>
        <Text style={styles.contextMuted}>Right panel placeholder · wired in a later task.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: tokens.color.background,
  },
  sidebar: {
    width: SIDEBAR_WIDTH,
    borderRightWidth: 1,
    borderRightColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    padding: 12,
    gap: 4,
  },
  sidebarTitle: {
    fontSize: tokens.fontSize.sm,
    fontWeight: '700',
    color: tokens.color.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  navItem: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: tokens.radius.sm,
  },
  navItemText: {
    color: tokens.color.text,
    fontSize: tokens.fontSize.md,
  },
  center: {
    flex: 1,
  },
  context: {
    width: CONTEXT_WIDTH,
    borderLeftWidth: 1,
    borderLeftColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    padding: 12,
  },
  contextTitle: {
    fontSize: tokens.fontSize.sm,
    fontWeight: '700',
    color: tokens.color.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  contextMuted: {
    color: tokens.color.textMuted,
    fontSize: tokens.fontSize.md,
  },
});
