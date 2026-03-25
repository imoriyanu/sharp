import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, layout, wp, fp } from '../../src/constants/theme';
import { FadeIn } from '../../src/components/Animations';
import { SharpFox, SpeechBubble, ProgressDots } from '../../src/components/Illustrations';
import { signUpWithEmail, signInWithEmail } from '../../src/services/auth';
import { getUserProfile } from '../../src/services/storage';

export default function OnboardingSignIn() {
  const router = useRouter();
  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    const trimEmail = email.trim().toLowerCase();
    const trimPass = password.trim();

    if (!trimEmail || !trimPass) {
      setError('Please enter both email and password');
      return;
    }
    if (trimPass.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (mode === 'signup') {
        const profile = await getUserProfile();
        await signUpWithEmail(trimEmail, trimPass, profile?.displayName || '');
        Alert.alert('Check your email', 'We sent you a confirmation link. Tap it to verify your account, then come back here.', [
          { text: 'OK', onPress: () => router.push('/onboarding/challenge-intro') },
        ]);
      } else {
        await signInWithEmail(trimEmail, trimPass);
        router.push('/onboarding/challenge-intro');
      }
    } catch (e: any) {
      const msg = e.message || 'Something went wrong';
      if (msg.includes('already registered')) {
        setError('This email is already registered. Try signing in instead.');
        setMode('signin');
      } else if (msg.includes('Invalid login')) {
        setError('Wrong email or password. Try again.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={s.container}>
          <ProgressDots total={4} current={1} />

          <View style={s.center}>
            <FadeIn delay={200}>
              <SharpFox size={wp(90)} expression="happy" />
            </FadeIn>

            <FadeIn delay={400}>
              <SpeechBubble
                text={mode === 'signup' ? 'Create an account to save your progress across devices.' : 'Welcome back! Sign in to continue.'}
                variant="accent"
              />
            </FadeIn>

            <FadeIn delay={600}>
              <View style={s.formCard}>
                <TextInput
                  style={s.input}
                  value={email}
                  onChangeText={(t) => { setEmail(t); setError(''); }}
                  placeholder="Email address"
                  placeholderTextColor={colors.text.muted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                />
                <TextInput
                  style={s.input}
                  value={password}
                  onChangeText={(t) => { setPassword(t); setError(''); }}
                  placeholder={mode === 'signup' ? 'Create a password (6+ chars)' : 'Password'}
                  placeholderTextColor={colors.text.muted}
                  secureTextEntry
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                />

                {error ? <Text style={s.error}>{error}</Text> : null}

                <TouchableOpacity style={s.submitBtn} onPress={handleSubmit} activeOpacity={0.8} disabled={loading}>
                  {loading ? (
                    <ActivityIndicator color={colors.text.inverse} />
                  ) : (
                    <Text style={s.submitText}>{mode === 'signup' ? 'Create account' : 'Sign in'}</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity onPress={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setError(''); }} activeOpacity={0.7}>
                  <Text style={s.switchText}>
                    {mode === 'signup' ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
                  </Text>
                </TouchableOpacity>
              </View>
            </FadeIn>
          </View>

          <FadeIn delay={800}>
            <TouchableOpacity onPress={() => router.push('/onboarding/challenge-intro')} activeOpacity={0.7} style={s.skipRow}>
              <Text style={s.skipText}>Skip for now</Text>
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
  container: { flex: 1, padding: layout.screenPadding, paddingTop: wp(12) },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },

  formCard: { backgroundColor: colors.bg.secondary, borderRadius: wp(20), padding: spacing.xl, width: '100%', gap: spacing.md, ...shadows.md },
  input: { backgroundColor: colors.bg.tertiary, borderRadius: radius.md, paddingVertical: wp(14), paddingHorizontal: wp(16), fontSize: typography.size.base, color: colors.text.primary },
  error: { fontSize: typography.size.xs, color: colors.error, textAlign: 'center' },
  submitBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(16), alignItems: 'center', ...shadows.accent },
  submitText: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.text.inverse },
  switchText: { fontSize: typography.size.xs, color: colors.accent.primary, fontWeight: typography.weight.semibold, textAlign: 'center', paddingTop: spacing.sm },

  skipRow: { alignItems: 'center', paddingVertical: spacing.lg, marginBottom: wp(10) },
  skipText: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.text.muted },
});
