import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Sharp',
  slug: 'sharp-ai',
  version: '2.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'sharp',
  userInterfaceStyle: 'light',
  newArchEnabled: true,
  splash: {
    image: './assets/icon.png',
    backgroundColor: '#FAF6F0',
    resizeMode: 'contain',
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.sharp.ai',
    buildNumber: '1',
    infoPlist: {
      NSMicrophoneUsageDescription: 'Sharp needs microphone access to record and analyse your spoken answers.',
      ITSAppUsesNonExemptEncryption: false,
    },
    privacyManifests: {
      NSPrivacyAccessedAPITypes: [],
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/icon.png',
      backgroundColor: '#FAF6F0',
    },
    package: 'com.sharp.ai',
    versionCode: 1,
    permissions: [
      'RECORD_AUDIO',
      'android.permission.RECORD_AUDIO',
      'android.permission.MODIFY_AUDIO_SETTINGS',
    ],
  },
  plugins: [
    'expo-router',
    ['expo-av', { microphonePermission: 'Sharp needs microphone access to record and analyse your spoken answers.' }],
    'expo-asset',
    'expo-font',
    'expo-audio',
  ],
  description: 'Sharp trains you to speak clearly, concisely, and with substance. AI-powered scoring and coaching in 30 seconds a day.',
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || '',
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
    apiUrl: process.env.EXPO_PUBLIC_API_URL || '',
    posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY || '',
    router: {},
    eas: {
      projectId: '12e05e54-293d-47be-8857-4ad2a55926ff',
    },
  },
});
