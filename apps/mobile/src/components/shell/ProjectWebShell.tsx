import { ReactNode } from 'react';
import { Link } from '@/navigation';
import { Platform, ScrollView, View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { tokens } from '@/theme/tokens';

/**
 * ProjectWebShell — responsive project workspace used only on web.
 *
 * Desktop and tablet keep project navigation visible while giving the active
 * screen the rest of the viewport. Phones use a horizontally scrollable nav.
 *
 * On native (iOS/Android) this component is NOT rendered — the
 * [projectId]/_layout.tsx returns the bare <Slot /> so mobile keeps its
 * default header + back-button stack navigation. Do not import this on
 * native-only paths; it is lazily selected via Platform.OS.
 */
const DESKTOP_SIDEBAR_WIDTH = 232;
const TABLET_SIDEBAR_WIDTH = 196;
const MOBILE_BREAKPOINT = 720;
const DESKTOP_BREAKPOINT = 1200;
const CONTENT_MAX_WIDTH = 1180;

const PROJECT_LINKS = [
  ['Dashboard', ''],
  ['Chats', '/chats'],
  ['Tasks', '/tasks'],
  ['Files', '/files'],
  ['Actions', '/actions'],
] as const;

const SETTINGS_LINKS = [
  ['Project settings', '/settings/project'],
  ['Providers', '/settings/providers'],
  ['Skills', '/settings/skills'],
  ['Prompts', '/settings/prompts'],
  ['MCP', '/settings/mcp'],
  ['Theme', '/settings/theme'],
] as const;

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
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  if (!isWeb) {
    return <>{children}</>;
  }

  const base = `/projects/${projectId}`;
  if (width < MOBILE_BREAKPOINT) {
    return (
      <View style={styles.mobileShell}>
        <ScrollView
          horizontal
          style={styles.mobileNavScroll}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.mobileNav}
          accessibilityLabel="Project navigation"
        >
          {[...PROJECT_LINKS, ...SETTINGS_LINKS].map(([label, suffix]) => (
            <NavItem key={label} href={`${base}${suffix}`} label={label} />
          ))}
        </ScrollView>
        <View style={styles.mobileCenter}>{children}</View>
      </View>
    );
  }

  const isDesktop = width >= DESKTOP_BREAKPOINT;

  return (
    <View style={styles.shell}>
      <ScrollView
        style={[styles.sidebar, { width: isDesktop ? DESKTOP_SIDEBAR_WIDTH : TABLET_SIDEBAR_WIDTH }]}
        contentContainerStyle={styles.sidebarContent}
        showsVerticalScrollIndicator={false}
        accessibilityLabel="Project navigation"
      >
        <Text style={styles.sidebarTitle}>Project</Text>
        {PROJECT_LINKS.map(([label, suffix]) => (
          <NavItem key={label} href={`${base}${suffix}`} label={label} />
        ))}
        <Text style={[styles.sidebarTitle, styles.settingsTitle]}>Settings</Text>
        {SETTINGS_LINKS.map(([label, suffix]) => (
          <NavItem key={label} href={`${base}${suffix}`} label={label} />
        ))}
      </ScrollView>
      <View style={styles.center}>
        <View style={styles.contentFrame}>{children}</View>
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
  mobileShell: {
    flex: 1,
    backgroundColor: tokens.color.background,
  },
  mobileNav: {
    minHeight: 48,
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 2,
  },
  mobileNavScroll: {
    flexGrow: 0,
    flexShrink: 0,
    height: 48,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  sidebar: {
    flexGrow: 0,
    flexShrink: 0,
    borderRightWidth: 1,
    borderRightColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  sidebarContent: {
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
    minHeight: 40,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: tokens.radius.sm,
  },
  navItemText: {
    color: tokens.color.text,
    fontSize: tokens.fontSize.md,
  },
  center: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
  },
  mobileCenter: {
    flex: 1,
    minWidth: 0,
    width: '100%',
  },
  contentFrame: {
    flex: 1,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
  },
  settingsTitle: {
    marginTop: 16,
  },
});
