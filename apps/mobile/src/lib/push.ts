import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';

/**
 * Registers the device's native push token (FCM on Android) with the API. Remote push isn't
 * available in Expo Go, so this only runs in development/store builds. iOS delivery through
 * FCM additionally needs the Firebase iOS SDK + APNs key (documented as future work).
 */
export async function registerForPush(): Promise<'registered' | 'skipped' | 'denied'> {
  if (Platform.OS === 'web' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient)
    return 'skipped';
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return 'denied';
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Bookings & safety',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  try {
    const token = await Notifications.getDevicePushTokenAsync();
    await api.users.registerDevice(String(token.data), Platform.OS === 'ios' ? 'ios' : 'android');
    return 'registered';
  } catch {
    return 'skipped';
  }
}
