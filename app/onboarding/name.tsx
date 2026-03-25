import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, layout, wp, fp } from '../../src/constants/theme';
import { saveUserProfile, setOnboardingStep } from '../../src/services/storage';
import { FadeIn } from '../../src/components/Animations';
import { SharpFox, SpeechBubble, ProgressDots } from '../../src/components/Illustrations';

export default function OnboardingName() {
  const router = useRouter();
  const [name, setName] = useState('');

  async function proceed() {
    const trimmed = name.trim();
    if (!trimmed) return;
    await saveUserProfile({ displayName: trimmed, isPremium: false, createdAt: new Date().toISOString() });
    await setOnboardingStep(2);
    router.push('/onboarding/challenge-intro');
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={s.container}>
          <FadeIn>
            <ProgressDots total={4} current={0} />
          </FadeIn>

          <View style={s.center}>
            <FadeIn delay={200}>
              <SharpFox size={wp(100)} expression="happy" />
            </FadeIn>

            <FadeIn delay={500}>
              <SpeechBubble text={name.trim() ? `Nice to meet you, ${name.trim()}! 👋` : "First things first — what's your name?"} />
            </FadeIn>

            <FadeIn delay={800}>
              <TextInput
                style={s.input}
                value={name}
                onChangeText={setName}
                placeholder="Your first name"
                placeholderTextColor={colors.text.muted}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={proceed}
                maxLength={30}
              />
            </FadeIn>
          </View>

          <FadeIn delay={1000}>
            <TouchableOpacity
              style={[s.cta, !name.trim() && s.ctaDisabled]}
              onPress={proceed}
              activeOpacity={0.8}
              disabled={!name.trim()}
            >
              <Text style={s.ctaText}>Continue</Text>
              <Text style={s.ctaArrow}>→</Text>
            </TouchableOpacity>
          </FadeIn>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  flex: { flex: 1 },
  container: { flex: 1, padding: layout.screenPadding, justifyContent: 'space-between', paddingTop: wp(16) },
  center: { alignItems: 'center', gap: spacing.xl },
  input: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, paddingVertical: wp(18), paddingHorizontal: wp(24), fontSize: fp(22), fontWeight: typography.weight.bold, color: colors.text.primary, textAlign: 'center', width: '100%', ...shadows.md },
  cta: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(18), marginBottom: wp(16), ...shadows.accent },
  ctaDisabled: { opacity: 0.3 },
  ctaText: { fontSize: typography.size.md, fontWeight: typography.weight.bold, color: colors.text.inverse },
  ctaArrow: { fontSize: typography.size.md, color: colors.text.inverse, opacity: 0.7 },
});
