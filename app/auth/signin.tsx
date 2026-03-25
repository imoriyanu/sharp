import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, layout, wp, fp } from '../../src/constants/theme';
import { FadeIn } from '../../src/components/Animations';
import { SharpFox, SpeechBubble } from '../../src/components/Illustrations';
import { signUpWithEmail, signInWithEmail } from '../../src/services/auth';
import { getUserProfile } from '../../src/services/storage';
import { useAuth } from '../../src/context/AuthContext';

export default function AuthSignIn() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // If already signed in (auth state changed), show success
  if (isAuthenticated || success) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.successContainer}>
          <FadeIn>
            <SharpFox size={wp(110)} expression="celebrating" />
          </FadeIn>
          <FadeIn delay={300}>
            <Text style={s.successTitle}>You're all set!</Text>
          </FadeIn>
          <FadeIn delay={500}>
            <Text style={s.successSub}>Your progress is saved and synced.</Text>
          </FadeIn>
          <FadeIn delay={700}>
            <TouchableOpacity style={s.successBtn} onPress={() => router.back()} activeOpacity={0.8}>
              <Text style={s.successBtnText}>Continue</Text>
            </TouchableOpacity>
          </FadeIn>
        </View>
      </SafeAreaView>
    );
  }

  async function handleSubmit() {
    const trimEmail = email.trim().toLowerCase();
    const trimPass = password.trim();
    if (!trimEmail) { setError('Please enter your email'); return; }
    if (!trimEmail.includes('@') || !trimEmail.includes('.')) { setError('Please enter a valid email'); return; }
    if (!trimPass) { setError('Please enter a password'); return; }
    if (trimPass.length < 6) { setError('Password must be at least 6 characters'); return; }

    setLoading(true);
    setError('');

    try {
      if (mode === 'signup') {
        const profile = await getUserProfile();
        const result = await signUpWithEmail(trimEmail, trimPass, profile?.displayName || '');

        if (result.session) {
          // Immediate sign-in (email confirmation disabled)
          setSuccess(true);
        } else {
          // Email confirmation required
          Alert.alert(
            'Check your email',
            `We sent a confirmation link to ${trimEmail}. Tap it to verify your account.`,
            [{ text: 'OK' }]
          );
        }
      } else {
        await signInWithEmail(trimEmail, trimPass);
        setSuccess(true);
      }
    } catch (e: any) {
      const msg = e.message || 'Something went wrong';
      if (msg.includes('already registered') || msg.includes('User already registered')) {
        setError('This email is already registered.');
        setMode('signin');
      } else if (msg.includes('Invalid login')) {
        setError('Wrong email or password.');
      } else if (msg.includes('Email not confirmed')) {
        setError('Please check your email and click the confirmation link first.');
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
          <View style={s.header}>
            <Text style={s.title}>{mode === 'signup' ? 'Create Account' : 'Sign In'}</Text>
            <TouchableOpacity onPress={() => router.back()} style={s.closeBtn}><Text style={s.close}>×</Text></TouchableOpacity>
          </View>

          <View style={s.center}>
            <FadeIn>
              <SharpFox size={wp(80)} expression="happy" />
            </FadeIn>

            <FadeIn delay={200}>
              <SpeechBubble
                text={mode === 'signup'
                  ? 'Create an account so you never lose your sessions, scores, and streaks.'
                  : 'Welcome back! Sign in to pick up where you left off.'}
                variant="accent"
              />
            </FadeIn>

            <FadeIn delay={400}>
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
                  placeholder={mode === 'signup' ? 'Create password (6+ characters)' : 'Password'}
                  placeholderTextColor={colors.text.muted}
                  secureTextEntry
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                />

                {error ? (
                  <View style={s.errorBox}>
                    <Text style={s.errorText}>{error}</Text>
                  </View>
                ) : null}

                <TouchableOpacity style={[s.submitBtn, loading && s.submitBtnLoading]} onPress={handleSubmit} activeOpacity={0.8} disabled={loading}>
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
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  flex: { flex: 1 },
  container: { flex: 1, padding: layout.screenPadding },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  title: { fontSize: typography.size.title, fontWeight: typography.weight.black, color: colors.text.primary },
  closeBtn: { padding: spacing.sm },
  close: { fontSize: fp(22), color: colors.text.muted },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },

  formCard: { backgroundColor: colors.bg.secondary, borderRadius: wp(20), padding: spacing.xl, width: '100%', gap: spacing.md, ...shadows.md },
  input: { backgroundColor: colors.bg.tertiary, borderRadius: radius.md, paddingVertical: wp(14), paddingHorizontal: wp(16), fontSize: typography.size.base, color: colors.text.primary },
  errorBox: { backgroundColor: colors.feedback.negativeBg, borderRadius: radius.md, padding: spacing.md },
  errorText: { fontSize: typography.size.xs, color: colors.error, textAlign: 'center' },
  submitBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(16), alignItems: 'center', ...shadows.accent },
  submitBtnLoading: { opacity: 0.7 },
  submitText: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.text.inverse },
  switchText: { fontSize: typography.size.xs, color: colors.accent.primary, fontWeight: typography.weight.semibold, textAlign: 'center', paddingTop: spacing.sm },

  // Success state
  successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: layout.screenPadding, gap: spacing.lg },
  successTitle: { fontSize: fp(26), fontWeight: typography.weight.black, color: colors.text.primary },
  successSub: { fontSize: typography.size.sm, color: colors.text.tertiary },
  successBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(16), paddingHorizontal: wp(40), ...shadows.accent, marginTop: spacing.lg },
  successBtnText: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.text.inverse },
});
