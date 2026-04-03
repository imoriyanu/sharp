import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../src/constants/theme';
import { stopAudio } from '../src/services/tts';
import { hasOnboarded, clearStaleThread } from '../src/services/storage';
import { initPremium } from '../src/services/premium';
import { initErrorTracking } from '../src/services/errorTracking';
import { initAnalytics, trackEvent, Events } from '../src/services/analytics';
import { registerForPushNotifications, savePushToken } from '../src/services/notifications';
import { AuthProvider, useAuth } from '../src/context/AuthContext';

function AudioGuard() {
  const pathname = usePathname();
  useEffect(() => { stopAudio(); }, [pathname]);
  return null;
}

function PushRegistration() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user?.id) return;
    registerForPushNotifications().then(token => {
      if (token) savePushToken(token, user.id);
    });
  }, [user?.id]);
  return null;
}

function OnboardingGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [onboarded, setOnboarded] = useState(true); // default true to avoid flash

  useEffect(() => {
    Promise.all([hasOnboarded(), initPremium(), clearStaleThread(), initErrorTracking(), initAnalytics()]).then(([val]) => {
      trackEvent(Events.APP_OPENED);
      setOnboarded(val);
      setChecked(true);
      if (!val) {
        setTimeout(() => router.replace('/onboarding'), 50);
      }
    }).catch(() => {
      // If storage fails, let the user through rather than freezing
      setOnboarded(true);
      setChecked(true);
    });
  }, []);

  if (!checked) return <View style={{ flex: 1, backgroundColor: colors.bg.primary }} />;
  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <AudioGuard />
      <AuthProvider>
      <PushRegistration />
      <OnboardingGate>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg.primary },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="onboarding/index" options={{ animation: 'fade' }} />
          <Stack.Screen name="onboarding/name" />
          <Stack.Screen name="onboarding/signin" />
          <Stack.Screen name="onboarding/challenge-intro" />
          <Stack.Screen name="onboarding/recording" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="onboarding/result" options={{ animation: 'fade' }} />
          <Stack.Screen name="onboarding/value" />
          <Stack.Screen name="onboarding/paywall" options={{ presentation: 'modal' }} />
          <Stack.Screen name="onboarding/welcome" options={{ animation: 'fade' }} />
          <Stack.Screen name="daily/challenge" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="daily/result" />
          <Stack.Screen name="one-shot/question" />
          <Stack.Screen name="one-shot/recording" />
          <Stack.Screen name="one-shot/results" />
          <Stack.Screen name="one-shot/coaching" />
          <Stack.Screen name="threaded/follow-up" />
          <Stack.Screen name="threaded/debrief" />
          <Stack.Screen name="context/setup" options={{ presentation: 'modal' }} />
          <Stack.Screen name="duel/create" options={{ presentation: 'modal' }} />
          <Stack.Screen name="duel/accept" options={{ presentation: 'modal' }} />
          <Stack.Screen name="duel/waiting" options={{ presentation: 'modal' }} />
          <Stack.Screen name="duel/results" options={{ presentation: 'modal' }} />
          <Stack.Screen name="analytics/index" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="premium/index" options={{ presentation: 'formSheet', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="streak/index" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="auth/signin" options={{ presentation: 'modal' }} />
          <Stack.Screen name="session/[id]" />
          <Stack.Screen name="privacy/index" options={{ presentation: 'modal' }} />
        </Stack>
      </OnboardingGate>
      </AuthProvider>
    </>
  );
}
