import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { apiPost } from './api';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Register for push notifications and return the Expo push token
export async function registerForPushNotifications(): Promise<string | null> {
  try {
    // Check permissions
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;

    // Get the Expo push token
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return null;

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;

    // Android channel
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('coaching', {
        name: 'Coaching',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    return token;
  } catch (e) {
    __DEV__ && console.error('Push notification registration error:', e);
    return null;
  }
}

// Save the push token to backend/Supabase
export async function savePushToken(token: string, userId: string): Promise<void> {
  try {
    await apiPost('/notifications/register', { token, userId });
  } catch (e) {
    __DEV__ && console.error('Failed to save push token:', e);
  }
}

// Listen for incoming notifications (foreground)
export function addNotificationListener(handler: (notification: Notifications.Notification) => void) {
  return Notifications.addNotificationReceivedListener(handler);
}

// Listen for notification taps
export function addNotificationResponseListener(handler: (response: Notifications.NotificationResponse) => void) {
  return Notifications.addNotificationResponseReceivedListener(handler);
}
