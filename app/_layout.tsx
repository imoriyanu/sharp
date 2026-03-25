import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../src/constants/theme';
import { stopAudio } from '../src/services/tts';
import { hasOnboarded } from '../src/services/storage';

function AudioGuard() {
  const pathname = usePathname();
  useEffect(() => { stopAudio(); }, [pathname]);
  return null;
}

function OnboardingGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [onboarded, setOnboarded] = useState(true); // default true to avoid flash

  useEffect(() => {
    hasOnboarded().then(val => {
      setOnboarded(val);
      setChecked(true);
      if (!val) {
        // Small delay to let the layout mount
        setTimeout(() => router.replace('/onboarding'), 50);
      }
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
          <Stack.Screen name="context/documents" options={{ presentation: 'modal' }} />
          <Stack.Screen name="duel/create" options={{ presentation: 'modal' }} />
          <Stack.Screen name="duel/accept" options={{ presentation: 'modal' }} />
          <Stack.Screen name="duel/waiting" options={{ presentation: 'modal' }} />
          <Stack.Screen name="duel/results" options={{ presentation: 'modal' }} />
          <Stack.Screen name="coming-soon/conversation" options={{ presentation: 'modal' }} />
          <Stack.Screen name="coming-soon/analytics" options={{ presentation: 'modal' }} />
          <Stack.Screen name="coming-soon/duels" options={{ presentation: 'modal' }} />
          <Stack.Screen name="analytics/index" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="premium/index" options={{ presentation: 'modal' }} />
          <Stack.Screen name="streak/index" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="session/[id]" />
        </Stack>
      </OnboardingGate>
    </>
  );
}
