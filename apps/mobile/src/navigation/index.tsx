import { createNavigationContainerRef, StackActions, useRoute } from '@react-navigation/native';
import { Text, type TextProps } from 'react-native';
import { matchPath, routeDefinitions, type MatchedRoute } from './routes';

export type ScreenParams = Record<string, string | undefined>;

export type RootStackParamList = Record<string, ScreenParams | undefined>;

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

function splitTarget(target: string): { pathname: string; query: Record<string, string> } {
  const [pathname, queryString = ''] = target.split('?');
  return {
    pathname,
    query: Object.fromEntries(new URLSearchParams(queryString).entries()),
  };
}

function currentBasePath(): string {
  const route = navigationRef.getCurrentRoute();
  const definition = routeDefinitions.find((candidate) => candidate.name === route?.name);
  if (!definition) return '/';
  return definition.relativeBase((route?.params ?? {}) as Record<string, string>);
}

function resolvePath(target: string): { pathname: string; query: Record<string, string> } {
  const { pathname, query } = splitTarget(target);
  if (pathname.startsWith('/')) return { pathname, query };

  const base = currentBasePath().replace(/\/$/, '');
  if (pathname === '.') return { pathname: base || '/', query };
  return { pathname: `${base}/${pathname.replace(/^\.\//, '')}`.replace(/\/+/g, '/'), query };
}

function navigate(target: string, replace: boolean): void {
  const { pathname, query } = resolvePath(target);
  const matched = matchPath(pathname);
  if (!matched) {
    throw new Error(`Unknown application route: ${pathname}`);
  }
  if (!navigationRef.isReady()) return;

  const params: ScreenParams = {
    ...matched.params,
    ...query,
  };
  if (replace) {
    navigationRef.dispatch(StackActions.replace(matched.definition.name, params));
  } else {
    navigationRef.navigate(matched.definition.name, params);
  }
}

export const router = {
  push(target: string): void {
    navigate(target, false);
  },
  replace(target: string): void {
    navigate(target, true);
  },
  back(): void {
    if (navigationRef.canGoBack()) navigationRef.goBack();
  },
  canGoBack(): boolean {
    return navigationRef.canGoBack();
  },
};

export function useLocalSearchParams<T extends object = ScreenParams>(): T {
  const route = useRoute();
  const params = (route.params ?? {}) as ScreenParams;
  return params as T;
}

export function Link({ href, onPress, ...props }: TextProps & { href: string }) {
  return <Text {...props} onPress={(event) => { onPress?.(event); router.push(href); }} />;
}

export function Slot() {
  return null;
}

export type { MatchedRoute };
