import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Extends app.json. Google Maps keys are injected from the environment for store builds only;
 * Expo Go needs no key. Never commit keys — set them as EAS secrets.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  name: 'Nexvolt',
  slug: 'nexvolt',
  plugins: [
    ...((config.plugins ?? []) as NonNullable<ExpoConfig['plugins']>),
    [
      'react-native-maps',
      {
        androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY ?? '',
        iosGoogleMapsApiKey: process.env.GOOGLE_MAPS_IOS_API_KEY ?? '',
      },
    ],
    [
      'expo-location',
      { locationWhenInUsePermission: 'Nexvolt uses your location to show chargers near you. You can search by area instead.' },
    ],
  ],
});
