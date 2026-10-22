import type { ChargerSearchResultDto } from '@nexvolt/shared';
import { View } from 'react-native';
import { Banner } from './ui';

/** react-native-maps has no web support; the web build shows the list view only. */
export function ExploreMap(_props: { center: { lat: number; lng: number }; items: ChargerSearchResultDto[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <View style={{ padding: 16 }}>
      <Banner tone="info" icon="map-outline">The map is available in the iOS and Android apps. Use the list view on the web.</Banner>
    </View>
  );
}
