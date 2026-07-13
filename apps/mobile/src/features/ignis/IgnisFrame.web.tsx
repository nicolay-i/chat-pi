import { View } from 'react-native';
import { ignisEmbedUrl } from './ignisEmbedUrl';

export function IgnisFrame({ url }: { url: string }) {
  return (
    <View style={{ flex: 1 }}>
      <iframe title="Ignis" src={ignisEmbedUrl(url)} style={{ border: 0, width: '100%', height: '100%' }} />
    </View>
  );
}
