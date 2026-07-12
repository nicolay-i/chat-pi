import { View } from 'react-native';

export function IgnisFrame({ url }: { url: string }) {
  return (
    <View style={{ flex: 1 }}>
      <iframe title="Ignis" src={url} style={{ border: 0, width: '100%', height: '100%' }} />
    </View>
  );
}
