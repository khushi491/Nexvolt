import Ionicons from '@expo/vector-icons/Ionicons';
import type { ChargerSearchResultDto } from '@nexvolt/shared';
import { Image } from 'expo-image';
import { View } from 'react-native';
import { money } from '@/lib/format';
import { colors } from '@/lib/theme';
import { Badge, Card, ConnectorBadge, Row, SampleBadge, T } from './ui';

export function ChargerCard({ c, onPress }: { c: ChargerSearchResultDto; onPress: () => void }) {
  const unit = c.pricingUnit === 'PER_HOUR' ? '/h' : '/kWh';
  return (
    <Card onPress={onPress} accessibilityLabel={`${c.title}, ${c.approxDistanceKm} kilometres away, ${money(c.unitPriceMinor)} ${unit}`} style={{ padding: 0, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row' }}>
        {c.photoUrl ? (
          <Image source={{ uri: c.photoUrl }} style={{ width: 96, minHeight: 112 }} contentFit="cover" accessibilityIgnoresInvertColors />
        ) : (
          <View style={{ width: 96, minHeight: 112, backgroundColor: colors.surface.navy, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="flash" size={28} color={colors.brand.accent} />
          </View>
        )}
        <View style={{ flex: 1, padding: 12, gap: 6 }}>
          <T.H3 style={{ fontSize: 16 }}>{c.title}</T.H3>
          <T.Small numberOfLines={1}>~{c.approxDistanceKm} km · {c.locality}, {c.city}</T.Small>
          <Row>
            {c.connectors.slice(0, 2).map((k) => <ConnectorBadge key={k.connectorType} type={k.connectorType} kw={k.powerKw} />)}
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <T.Body style={{ fontWeight: '700' }}>{money(c.unitPriceMinor)}<T.Small>{unit}</T.Small></T.Body>
            <T.Small>{c.ratingCount ? `★ ${c.ratingAvg} (${c.ratingCount})` : 'New'}</T.Small>
          </Row>
          <Row>
            {c.isSample && <SampleBadge />}
            {c.compatibility?.compatible && <Badge tone="positive" icon="checkmark-circle" label={`Fits your EV · ${c.compatibility.effectiveKw} kW`} />}
            {c.approvalMode === 'MANUAL' && <Badge tone="warning" label="Host approves" />}
            {c.verifiedMeter && <Badge tone="info" label="Verified meter" />}
          </Row>
        </View>
      </View>
    </Card>
  );
}
