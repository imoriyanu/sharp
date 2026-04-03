import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, layout, wp, fp } from '../../src/constants/theme';
import { FadeIn } from '../../src/components/Animations';
import { ProgressDots } from '../../src/components/Illustrations';
import { signUpWithEmail, signInWithEmail, signInWithApple, isAppleAuthAvailable } from '../../src/services/auth';
import { getUserProfile } from '../../src/services/storage';

export default function OnboardingSignIn() {
  const router = useRouter();
  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [error, setError] = useState('');
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  useEffect(() => { isAppleAuthAvailable().then(setAppleAvailable); }, []);

  const busy = loading || appleLoading;

  async function handleAppleSignIn() {
    setAppleLoading(true);
    setError('');
    try {
      await signInWithApple();
      router.push('/onboarding/challenge-intro');
    } catch (e: any) {
      if (e?.code === 'ERR_REQUEST_CANCELED') return;
      setError(e?.message?.includes('no session') ? 'Sign in failed. Please check your connection.' : 'Apple sign in failed. Please try again.');
    } finally {
      setAppleLoading(false);
    }
  }

  async function handleSubmit() {
    const trimEmail = email.trim().toLowerCase();
    const trimPass = password.trim();
    if (!trimEmail) { setError('Enter your email address'); return; }
    if (!trimEmail.includes('@') || !trimEmail.includes('.')) { setError('That doesn\'t look like a valid email'); return; }
    if (!trimPass) { setError('Enter your password'); return; }
    if (mode === 'signup' && trimPass.length < 6) { setError('Password needs at least 6 characters'); return; }

    setLoading(true);
    setError('');

    try {
      if (mode === 'signup') {
        const profile = await getUserProfile();
        const result = await signUpWithEmail(trimEmail, trimPass, profile?.displayName || '');
        if (result.session) {
          router.push('/onboarding/challenge-intro');
        } else {
          setConfirmEmail(true);
        }
      } else {
        await signInWithEmail(trimEmail, trimPass);
        router.push('/onboarding/challenge-intro');
      }
    } catch (e: any) {
      const msg = e?.message || '';
      if (msg.includes('already registered') || msg.includes('User already registered')) {
        setError('Email already registered');
        setMode('signin');
      } else if (msg.includes('Invalid login')) {
        setError('Wrong email or password');
      } else if (msg.includes('rate') || msg.includes('too many')) {
        setError('Too many attempts. Wait a moment.');
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  // Email confirmation state
  if (confirmEmail) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.centeredFull}>
          <FadeIn>
            <Text style={s.confirmEmoji}>📧</Text>
            <Text style={s.confirmTitle}>Check your email</Text>
            <Text style={s.confirmSub}>We sent a link to {email.trim().toLowerCase()}. Tap it to verify, then come back.</Text>
          </FadeIn>
          <FadeIn delay={300}>
            <TouchableOpacity style={s.primaryBtn} onPress={() => { setConfirmEmail(false); setMode('signin'); }} activeOpacity={0.8}>
              <Text style={s.primaryBtnText}>I've confirmed — sign in</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setConfirmEmail(false)} activeOpacity={0.7} style={s.ghostLink}>
              <Text style={s.ghostLinkText}>Go back</Text>
            </TouchableOpacity>
          </FadeIn>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <ProgressDots total={4} current={1} />

          {/* Title */}
          <View style={s.titleSection}>
            <Text style={s.title}>{mode === 'signup' ? 'Create account' : 'Welcome back'}</Text>
            <Text style={s.subtitle}>Save your sessions, scores, and streaks across devices.</Text>
          </View>

          {/* Apple Sign In */}
          {appleAvailable && (
            <FadeIn>
              <TouchableOpacity style={s.appleBtn} onPress={handleAppleSignIn} activeOpacity={0.8} disabled={busy}>
                {appleLoading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={s.appleBtnText}> Continue with Apple</Text>
                )}
              </TouchableOpacity>

              <View style={s.dividerRow}>
                <View style={s.dividerLine} />
                <Text style={s.dividerText}>or use email</Text>
                <View style={s.dividerLine} />
              </View>
            </FadeIn>
          )}

          {/* Email form */}
          <FadeIn delay={appleAvailable ? 100 : 0}>
            <View style={s.formCard}>
              <View style={s.inputWrap}>
                <Text style={s.inputLabel}>Email</Text>
                <TextInput
                  style={s.input}
                  value={email}
                  onChangeText={(t) => { setEmail(t); setError(''); }}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.text.muted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  editable={!busy}
                />
              </View>

              <View style={s.inputWrap}>
                <Text style={s.inputLabel}>Password</Text>
                <TextInput
                  ref={passwordRef}
                  style={s.input}
                  value={password}
                  onChangeText={(t) => { setPassword(t); setError(''); }}
                  placeholder={mode === 'signup' ? '6+ characters' : 'Your password'}
                  placeholderTextColor={colors.text.muted}
                  secureTextEntry
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                  editable={!busy}
                />
              </View>

              {error ? (
                <View style={s.errorBox}>
                  <Text style={s.errorText}>{error}</Text>
                </View>
              ) : null}

              <TouchableOpacity style={[s.primaryBtn, busy && s.btnDisabled]} onPress={handleSubmit} activeOpacity={0.8} disabled={busy}>
                {loading ? (
                  <ActivityIndicator color={colors.text.inverse} />
                ) : (
                  <Text style={s.primaryBtnText}>{mode === 'signup' ? 'Create account' : 'Sign in'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </FadeIn>

          {/* Switch mode */}
          <TouchableOpacity onPress={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setError(''); }} activeOpacity={0.7} style={s.switchRow}>
            <Text style={s.switchText}>
              {mode === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
              <Text style={s.switchBold}>{mode === 'signup' ? 'Sign in' : 'Sign up'}</Text>
            </Text>
          </TouchableOpacity>

          {/* Skip */}
          <TouchableOpacity onPress={() => router.push('/onboarding/challenge-intro')} activeOpacity={0.7} style={s.skipRow}>
            <Text style={s.skipText}>Skip for now</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  flex: { flex: 1 },
  scrollContent: { padding: layout.screenPadding, paddingTop: wp(12), paddingBottom: wp(40) },

  titleSection: { marginTop: spacing.xl, marginBottom: spacing.xxl },
  title: { fontSize: fp(28), fontWeight: typography.weight.black, color: colors.text.primary, letterSpacing: -0.5 },
  subtitle: { fontSize: typography.size.sm, color: colors.text.tertiary, marginTop: spacing.xs, lineHeight: fp(20) },

  // Apple
  appleBtn: { backgroundColor: '#000', borderRadius: radius.lg, paddingVertical: wp(16), alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  appleBtnText: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: '#FFF' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.borderLight },
  dividerText: { fontSize: fp(10), color: colors.text.muted, fontWeight: typography.weight.semibold },

  // Form
  formCard: { gap: spacing.md },
  inputWrap: { gap: spacing.xs },
  inputLabel: { fontSize: fp(11), fontWeight: typography.weight.bold, color: colors.text.secondary, marginLeft: wp(2) },
  input: { backgroundColor: colors.bg.secondary, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.borderLight, paddingVertical: wp(14), paddingHorizontal: wp(16), fontSize: typography.size.base, color: colors.text.primary },
  errorBox: { backgroundColor: colors.feedback.negativeBg, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  errorText: { fontSize: typography.size.xs, color: colors.error, textAlign: 'center', fontWeight: typography.weight.semibold },
  primaryBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(16), alignItems: 'center', ...shadows.accent, marginTop: spacing.sm },
  primaryBtnText: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.text.inverse },
  btnDisabled: { opacity: 0.6 },

  // Switch mode
  switchRow: { alignItems: 'center', paddingTop: spacing.xl },
  switchText: { fontSize: typography.size.sm, color: colors.text.tertiary },
  switchBold: { color: colors.accent.primary, fontWeight: typography.weight.bold },

  // Skip
  skipRow: { alignItems: 'center', paddingTop: spacing.md, paddingBottom: wp(10) },
  skipText: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.text.muted },

  // Confirm email
  centeredFull: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: layout.screenPadding, gap: spacing.md },
  confirmEmoji: { fontSize: fp(48), textAlign: 'center', marginBottom: spacing.md },
  confirmTitle: { fontSize: fp(24), fontWeight: typography.weight.black, color: colors.text.primary, textAlign: 'center' },
  confirmSub: { fontSize: typography.size.sm, color: colors.text.tertiary, textAlign: 'center', lineHeight: fp(20), marginTop: spacing.sm, paddingHorizontal: spacing.lg },
  ghostLink: { alignItems: 'center', paddingTop: spacing.lg },
  ghostLinkText: { fontSize: typography.size.sm, color: colors.text.muted, fontWeight: typography.weight.semibold },
});
