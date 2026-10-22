// Icon fonts are loaded through expo-font at runtime; in Jest render icons as plain views.
jest.mock('@expo/vector-icons/Ionicons', () => {
  const { View } = jest.requireActual('react-native');
  const Ionicons = (props: { name: string }) => <View testID={`icon-${props.name}`} />;
  Ionicons.glyphMap = {};
  return { __esModule: true, default: Ionicons };
});
