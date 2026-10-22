import type { ChargerSearchResultDto } from '@nexvolt/shared';
import { Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { money } from '@/lib/format';
import { colors } from '@/lib/theme';

/** Pins sit at APPROXIMATE public locations (a few hundred metres from the real charger). */
export function MapPin({ c, selected }: { c: ChargerSearchResultDto; selected: boolean }) {
  return (
    <View style={{ backgroundColor: selected ? colors.brand.primary : colors.surface.navy, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 2, borderColor: '#fff' }}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{money(c.unitPriceMinor)}</Text>
    </View>
  );
}

export function ExploreMap({ center, items, selectedId, onSelect }: { center: { lat: number; lng: number }; items: ChargerSearchResultDto[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <MapView
      style={{ flex: 1 }}
      region={{ latitude: center.lat, longitude: center.lng, latitudeDelta: 0.12, longitudeDelta: 0.12 }}
      showsUserLocation
      accessibilityLabel="Map of nearby chargers (approximate locations)"
    >
      {items.map((c) => (
        <Marker key={c.id} coordinate={{ latitude: c.approxLocation.lat, longitude: c.approxLocation.lng }} onPress={() => onSelect(c.id)} accessibilityLabel={`${c.title}, ${money(c.unitPriceMinor)}`}>
          <MapPin c={c} selected={c.id === selectedId} />
        </Marker>
      ))}
    </MapView>
  );
}
