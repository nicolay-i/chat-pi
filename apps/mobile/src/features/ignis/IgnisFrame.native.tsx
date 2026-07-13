import { WebView } from 'react-native-webview';

export function IgnisFrame({ url }: { url: string }) {
  return (
    <WebView
      testID="ignis.webview"
      source={{ uri: url }}
      style={{ flex: 1 }}
      javaScriptEnabled
      domStorageEnabled
      setSupportMultipleWindows={false}
    />
  );
}
