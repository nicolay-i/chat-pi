import { Slot, useLocalSearchParams } from 'expo-router';
import { Platform } from 'react-native';
import { ProjectWebShell } from '@/components/shell/ProjectWebShell';

/**
 * Layout for every screen under /projects/[projectId].
 *
 * Native: renders the bare <Slot /> so the root Stack's per-screen header
 * (with back button) drives mobile navigation.
 *
 * Web: wraps children in the 3-column ProjectWebShell (sidebar + content +
 * context panel). If web shell breaks a particular screen, set
 * `headerShown: false` on that screen rather than removing this layout.
 */
export default function ProjectLayout() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  if (Platform.OS !== 'web') {
    return <Slot />;
  }
  return (
    <ProjectWebShell projectId={projectId}>
      <Slot />
    </ProjectWebShell>
  );
}
