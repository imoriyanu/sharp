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
    usesAppleSignIn: true,
    infoPlist: {
      NSMicrophoneUsageDescription: 'Sharp needs microphone access to record and analyse your spoken answers.',
      ITSAppUsesNonExemptEncryption: false,
    },
    privacyManifests: {
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime',
          NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
          NSPrivacyAccessedAPITypeReasons: ['C617.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace',
          NSPrivacyAccessedAPITypeReasons: ['E174.1'],
        },
      ],
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
  updates: {
    url: 'https://u.expo.dev/12e05e54-293d-47be-8857-4ad2a55926ff',
  },
  runtimeVersion: {
    policy: 'appVersion',
  },
  plugins: [
    'expo-router',
    ['expo-av', { microphonePermission: 'Sharp needs microphone access to record and analyse your spoken answers.' }],
    'expo-asset',
    'expo-font',
    'expo-audio',
    'expo-apple-authentication',
    ['expo-notifications', {
      icon: './assets/icon.png',
      color: '#C07050',
    }],
  ],
  description: 'Sharp trains you to speak clearly, concisely, and with substance. AI-powered scoring and coaching in 30 seconds a day.',
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || '',
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
    apiUrl: process.env.EXPO_PUBLIC_API_URL || '',
    posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY || '',
    revenuecatApiKey: process.env.EXPO_PUBLIC_REVENUECAT_API_KEY || '',
    router: {},
    eas: {
      projectId: '12e05e54-293d-47be-8857-4ad2a55926ff',
    },
  },
});
