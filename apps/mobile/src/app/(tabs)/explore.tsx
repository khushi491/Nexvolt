import Ionicons from '@expo/vector-icons/Ionicons';
import {
  istToUtc,
  addMinutes,
  type ChargerSearchResultDto,
  type SearchChargersInput,
} from '@nexvolt/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChargerCard } from '@/components/charger-card';
import { DemoBanner } from '@/components/demo-banner';
import { ExploreMap } from '@/components/explore-map';
import {
  activeFilterCount,
  DEFAULT_FILTERS,
  FilterSheet,
  type Filters,
} from '@/components/filter-sheet';
import {
  Banner,
  Button,
  Chip,
  EmptyState,
  ErrorState,
  Row,
  SkeletonCards,
  T,
} from '@/components/ui';
import { api } from '@/lib/api';
import { istDateKey } from '@/lib/format';
import { PLACES, useUserLocation } from '@/lib/location';
import { colors, radii, spacing } from '@/lib/theme';

function windowFor(f: Filters): { startAt?: string; endAt?: string } {
  if (f.when === 'any') return {};
  let start: Date;
  if (f.when === 'now')
    start = new Date(Math.ceil((Date.now() + 16 * 60_000) / (15 * 60_000)) * 15 * 60_000);
  else if (f.when === 'today-evening') start = istToUtc(istDateKey(new Date()), 18 * 60);
  else start = istToUtc(istDateKey(addMinutes(new Date(), 1440)), 8 * 60);
  return {
    startAt: start.toISOString(),
    endAt: addMinutes(start, f.durationMinutes).toISOString(),
  };
}

export default function Explore() {
  const { loc, locate, choose } = useUserLocation();
  const [mode, setMode] = useState<'list' | 'map'>('list');
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [placeOpen, setPlaceOpen] = useState(false);
  const [placeQuery, setPlaceQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const vehicles = useQuery({ queryKey: ['vehicles'], queryFn: () => api.vehicles.list() });
  const vehicle = vehicles.data?.find((v) => v.isDefault) ?? vehicles.data?.[0];

  const center = loc.kind === 'ready' ? { lat: loc.lat, lng: loc.lng } : null;
  const params: SearchChargersInput | null = center
    ? {
        lat: center.lat,
        lng: center.lng,
        radiusKm: filters.radiusKm,
        connector: filters.connector,
        currentType: filters.currentType,
        minPowerKw: filters.minPowerKw,
        maxPriceMinor: filters.maxPriceRupees ? filters.maxPriceRupees * 100 : undefined,
        vehicleId: filters.onlyCompatible ? vehicle?.id : undefined,
        wheelchairAccessible: filters.wheelchairAccessible || undefined,
        parkingType: filters.parkingType,
        verifiedMeterOnly: filters.verifiedMeterOnly || undefined,
        ...windowFor(filters),
      }
    : null;
  const search = useQuery({
    queryKey: ['search', params],
    queryFn: () => api.search.chargers(params!),
    enabled: !!params,
  });
  const items: ChargerSearchResultDto[] = search.data?.items ?? [];
  const selectedItem = items.find((c) => c.id === selected);
  const places = useMemo(
    () =>
      PLACES.filter((p) => `${p.label} ${p.city}`.toLowerCase().includes(placeQuery.toLowerCase())),
    [placeQuery],
  );
  const n = activeFilterCount(filters);
  const open = (id: string) => router.push({ pathname: '/charger/[id]', params: { id } });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface.background }} edges={['top']}>
      <View style={{ padding: spacing[4], gap: spacing[3] }}>
        <Pressable
          accessibilityRole="search"
          accessibilityLabel="Search by area"
          onPress={() => setPlaceOpen(true)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: colors.surface.card,
            borderRadius: radii.md,
            borderWidth: 1,
            borderColor: colors.border.strong,
            paddingHorizontal: 12,
            minHeight: 48,
          }}
        >
          <Ionicons name="search" size={18} color={colors.text.muted} />
          <T.Body style={{ flex: 1 }} numberOfLines={1}>
            {loc.kind === 'ready'
              ? loc.label
              : loc.kind === 'locating'
                ? 'Finding your location…'
                : 'Search a neighbourhood'}
          </T.Body>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Use my location"
            hitSlop={10}
            onPress={() => void locate()}
          >
            <Ionicons name="locate" size={20} color={colors.brand.primary} />
          </Pressable>
        </Pressable>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row>
            <Chip label="List" selected={mode === 'list'} onPress={() => setMode('list')} />
            <Chip label="Map" selected={mode === 'map'} onPress={() => setMode('map')} />
          </Row>
          <Chip
            label={n ? `Filters · ${n}` : 'Filters'}
            selected={n > 0}
            onPress={() => setFilterOpen(true)}
          />
        </Row>
        {loc.kind === 'denied' && (
          <Banner tone="warning" icon="location-outline">
            Location is off. Search a neighbourhood above instead — you can change this in Settings.
          </Banner>
        )}
        {vehicles.data && vehicles.data.length === 0 && (
          <Banner tone="info" icon="car-outline">
            Add your vehicle to see only compatible chargers.
          </Banner>
        )}
        <DemoBanner />
      </View>
      {mode === 'map' && center ? (
        <View style={{ flex: 1 }}>
          <ExploreMap center={center} items={items} selectedId={selected} onSelect={setSelected} />
          {selectedItem && (
            <View
              style={{
                position: 'absolute',
                left: spacing[4],
                right: spacing[4],
                bottom: spacing[4],
              }}
            >
              <ChargerCard c={selectedItem} onPress={() => open(selectedItem.id)} />
            </View>
          )}
          <View style={{ position: 'absolute', top: 8, alignSelf: 'center' }}>
            <T.Tiny
              style={{
                backgroundColor: 'rgba(255,255,255,0.9)',
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 8,
              }}
            >
              Pins show approximate areas
            </T.Tiny>
          </View>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{
            padding: spacing[4],
            paddingTop: 0,
            gap: spacing[3],
            paddingBottom: spacing[12],
          }}
          refreshing={search.isRefetching}
          onRefresh={() => void search.refetch()}
          renderItem={({ item }) => <ChargerCard c={item} onPress={() => open(item.id)} />}
          ListHeaderComponent={
            items.length ? (
              <T.Small>
                {items.length} verified charger{items.length > 1 ? 's' : ''} within{' '}
                {filters.radiusKm} km · distances are approximate
              </T.Small>
            ) : undefined
          }
          ListEmptyComponent={
            search.isLoading || loc.kind === 'locating' ? (
              <SkeletonCards />
            ) : search.isError ? (
              <ErrorState error={search.error} onRetry={() => void search.refetch()} />
            ) : (
              <EmptyState
                icon="flash-outline"
                title="No chargers here yet"
                body="Try a wider radius, fewer filters or another neighbourhood."
                action={
                  <Button
                    title="Reset filters"
                    variant="secondary"
                    onPress={() => setFilters(DEFAULT_FILTERS)}
                  />
                }
              />
            )
          }
        />
      )}
      <FilterSheet
        visible={filterOpen}
        value={filters}
        onChange={setFilters}
        onClose={() => setFilterOpen(false)}
        hasVehicle={!!vehicle}
      />
      <Modal
        visible={placeOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPlaceOpen(false)}
      >
        <SafeAreaView
          style={{
            flex: 1,
            padding: spacing[4],
            gap: spacing[3],
            backgroundColor: colors.surface.background,
          }}
        >
          <Row style={{ justifyContent: 'space-between' }}>
            <T.H2>Search an area</T.H2>
            <Button title="Close" variant="ghost" onPress={() => setPlaceOpen(false)} />
          </Row>
          <TextInput
            accessibilityLabel="Neighbourhood or city"
            autoFocus
            value={placeQuery}
            onChangeText={setPlaceQuery}
            placeholder="Neighbourhood or city"
            placeholderTextColor={colors.text.muted}
            style={{
              minHeight: 48,
              borderWidth: 1,
              borderColor: colors.border.strong,
              borderRadius: radii.md,
              paddingHorizontal: 12,
              fontSize: 16,
              backgroundColor: colors.surface.card,
            }}
          />
          <Button
            title="Use my current location"
            variant="secondary"
            icon="locate"
            onPress={() => {
              setPlaceOpen(false);
              void locate();
            }}
          />
          <FlatList
            data={places}
            keyExtractor={(p) => p.label}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  choose(item);
                  setPlaceOpen(false);
                }}
                style={{
                  minHeight: 52,
                  justifyContent: 'center',
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border.default,
                }}
              >
                <T.Body>{item.label}</T.Body>
                <T.Small>{item.city}</T.Small>
              </Pressable>
            )}
            ListFooterComponent={
              <T.Tiny style={{ marginTop: spacing[3] }}>
                Street-level address search needs a Google Places key, which isn’t configured in
                this build.
              </T.Tiny>
            }
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
