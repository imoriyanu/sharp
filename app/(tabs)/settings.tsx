import { View, Text, ScrollView, Switch, TextInput, Image, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { colors, typography, spacing, radius, shadows, layout, wp, fp } from '../../src/constants/theme';
import { getUserProfile, saveUserProfile, trackFeatureInterest } from '../../src/services/storage';
import { isPremium, getPlanName, syncFromRevenueCat, getUsageDisplay, type UsageDisplay } from '../../src/services/premium';
import { restorePurchases, isRevenueCatConfigured, getManagementUrl } from '../../src/services/revenuecat';
import { FEATURES } from '../../src/constants/features';
import { useAuth } from '../../src/context/AuthContext';
import { signOut, deleteAccount } from '../../src/services/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UserProfile } from '../../src/types';

export default function SettingsScreen() {
  const router = useRouter();
  const [audioQuestions, setAudioQuestions] = useState(true);
  const [haptics, setHaptics] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const { user, isAuthenticated } = useAuth();
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [usage, setUsage] = useState<UsageDisplay | null>(null);

  useEffect(() => {
    // Load persisted preferences once
    AsyncStorage.getItem('sharp:pref_audio').then(v => { if (v !== null) setAudioQuestions(v === 'true'); });
    AsyncStorage.getItem('sharp:pref_haptics').then(v => { if (v !== null) setHaptics(v === 'true'); });
  }, []);

  // Reload profile + usage every time screen gains focus (catches auth changes
  // from modal + usage tick after a One Shot / Threaded finishes elsewhere).
  useFocusEffect(useCallback(() => {
    getUserProfile().then(p => {
      setProfile(p);
      if (p) setNameInput(p.displayName);
    });
    getUsageDisplay().then(setUsage).catch(() => setUsage(null));
  }, []));

  async function saveName() {
    const name = nameInput.trim();
    if (!name) return;
    const updated: UserProfile = { ...profile, displayName: name, isPremium: profile?.isPremium ?? false, createdAt: profile?.createdAt || new Date().toISOString() };
    await saveUserProfile(updated);
    setProfile(updated);
    setEditingName(false);
  }

  function confirmDeleteAccount() {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your account, sessions, streaks, and uploaded documents from our servers. It cannot be undone.\n\nIf you have an active subscription, you must also cancel it separately in Settings > Apple ID > Subscriptions.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            Alert.prompt(
              'Are you sure?',
              'Type DELETE to confirm.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete forever',
                  style: 'destructive',
                  onPress: async (input?: string) => {
                    if ((input || '').trim().toUpperCase() !== 'DELETE') {
                      Alert.alert('Not deleted', 'You must type DELETE to confirm.');
                      return;
                    }
                    try {
                      await deleteAccount();
                      router.replace('/onboarding');
                    } catch (e: any) {
                      Alert.alert('Could not delete account', e?.message || 'Please try again or contact support.');
                    }
                  },
                },
              ],
              'plain-text',
              '',
              'default'
            );
          },
        },
      ],
    );
  }

  async function pickAvatar() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.5 });
    if (!result.canceled && result.assets?.[0]) {
      const updated: UserProfile = { ...profile, displayName: profile?.displayName || 'You', avatarUri: result.assets[0].uri, isPremium: profile?.isPremium ?? false, createdAt: profile?.createdAt || new Date().toISOString() };
      await saveUserProfile(updated);
      setProfile(updated);
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={s.title}>Settings</Text>

        {/* Profile card */}
        <View style={s.profileCard}>
          <TouchableOpacity onPress={pickAvatar} activeOpacity={0.7}>
            {profile?.avatarUri ? (
              <Image source={{ uri: profile.avatarUri }} style={s.profileAvatar} />
            ) : (
              <View style={s.profileAvatarEmpty}>
                <Text style={s.profileAvatarText}>{profile?.displayName?.[0]?.toUpperCase() || '+'}</Text>
              </View>
            )}
            <View style={s.profileAvatarBadge}><Text style={s.profileAvatarBadgeText}>📷</Text></View>
          </TouchableOpacity>
          <View style={s.profileInfo}>
            {editingName ? (
              <View style={s.nameEditRow}>
                <TextInput style={s.nameInput} value={nameInput} onChangeText={setNameInput} placeholder="Your name" placeholderTextColor={colors.text.muted} autoFocus returnKeyType="done" onSubmitEditing={saveName} />
                <TouchableOpacity onPress={saveName}><Text style={s.nameSave}>Save</Text></TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={() => setEditingName(true)}>
                <Text style={s.profileName}>{profile?.displayName || 'Tap to add your name'}</Text>
                <Text style={s.profileSub}>{profile?.displayName ? 'Tap to edit' : 'Personalise your experience'}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Preferences */}
        <Text style={s.section}>Preferences</Text>
        <View style={s.card}>
          <View style={s.row}>
            <Text style={s.label}>Audio questions</Text>
            <Switch value={audioQuestions} onValueChange={(v) => { setAudioQuestions(v); AsyncStorage.setItem('sharp:pref_audio', String(v)); }} trackColor={{ false: colors.border, true: colors.accent.primary }} />
          </View>
          <View style={s.row}>
            <Text style={s.label}>Haptic feedback</Text>
            <Switch value={haptics} onValueChange={(v) => { setHaptics(v); AsyncStorage.setItem('sharp:pref_haptics', String(v)); }} trackColor={{ false: colors.border, true: colors.accent.primary }} />
          </View>
          <View style={[s.row, s.rowLast]}>
            <Text style={s.label}>Daily reminder</Text>
            <Text style={s.value}>9:00 AM</Text>
          </View>
        </View>

        <Text style={s.section}>Account</Text>
        <View style={s.card}>
          <View style={s.row}>
            <Text style={s.label}>Email</Text>
            <Text style={s.value}>{isAuthenticated ? user?.email : 'Not signed in'}</Text>
          </View>
          {isAuthenticated ? (
            <>
              <TouchableOpacity style={s.row} onPress={() => {
                Alert.alert('Sign out', 'Are you sure?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Sign out', style: 'destructive', onPress: async () => { await signOut(); } },
                ]);
              }}>
                <Text style={[s.label, { color: colors.error }]}>Sign out</Text>
                <Text style={[s.value, { color: colors.error }]}>→</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.row, s.rowLast]} onPress={confirmDeleteAccount}>
                <Text style={[s.label, { color: colors.error, fontWeight: typography.weight.bold }]}>Delete account</Text>
                <Text style={[s.value, { color: colors.error }]}>→</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={[s.row, s.rowLast]} onPress={() => router.push('/auth/signin')}>
              <Text style={[s.label, { color: colors.accent.primary }]}>Sign in</Text>
              <Text style={[s.value, { color: colors.accent.primary }]}>→</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={s.section}>Plan</Text>
        <View style={s.card}>
          <TouchableOpacity style={[s.row, !isPremium() && !isRevenueCatConfigured() ? s.rowLast : {}]} onPress={() => !isPremium() && router.push('/premium')} activeOpacity={isPremium() ? 1 : 0.7}>
            <View style={s.planInfo}>
              <Text style={s.label}>{getPlanName()}</Text>
              <Text style={s.planSub}>{formatUsageSub(usage)}</Text>
            </View>
            {isPremium() ? (
              <View style={s.proBadge}><Text style={s.proBadgeText}>PRO</Text></View>
            ) : (
              <Text style={[s.value, { color: colors.accent.primary, fontWeight: typography.weight.bold }]}>Upgrade →</Text>
            )}
          </TouchableOpacity>
          {isPremium() && (
            <TouchableOpacity style={[s.row, s.rowLast]} onPress={async () => {
              const url = await getManagementUrl();
              if (url) {
                const { Linking } = require('react-native');
                Linking.openURL(url);
              } else {
                const { Linking } = require('react-native');
                Linking.openURL('https://apps.apple.com/account/subscriptions');
              }
            }}>
              <Text style={s.label}>Manage subscription</Text>
              <Text style={s.value}>→</Text>
            </TouchableOpacity>
          )}
          {!isPremium() && isRevenueCatConfigured() && (
            <TouchableOpacity style={[s.row, s.rowLast]} onPress={async () => {
              const planId = await restorePurchases();
              if (planId) {
                await syncFromRevenueCat();
                Alert.alert('Restored', 'Your subscription has been restored.');
              } else {
                Alert.alert('No subscription found', 'We couldn\'t find an active subscription for this Apple ID.');
              }
            }}>
              <Text style={[s.label, { color: colors.accent.primary }]}>Restore purchases</Text>
              <Text style={[s.value, { color: colors.accent.primary }]}>→</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={s.section}>Support</Text>
        <View style={s.card}>
          <TouchableOpacity style={s.row} onPress={() => {
            Alert.prompt(
              'Feature Request',
              'What would make Sharp better for you?',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Send', onPress: async (text?: string) => {
                  if (!text?.trim()) return;
                  try {
                    const { apiPost } = require('../../src/services/api');
                    await apiPost('/api/feature-request', { request: text.trim(), userId: user?.id || 'anonymous', timestamp: new Date().toISOString() });
                  } catch {}
                  Alert.alert('Thanks!', 'Your request has been noted. We read every one.');
                }},
              ],
              'plain-text',
              '',
              'default'
            );
          }}>
            <Text style={s.label}>Request a feature</Text>
            <Text style={[s.value, { color: colors.accent.primary }]}>→</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.row, s.rowLast]} onPress={() => {
            const { Linking } = require('react-native');
            Linking.openURL('mailto:support@getsharp.app?subject=Sharp%20App%20Support');
          }}>
            <Text style={s.label}>Contact support</Text>
            <Text style={[s.value, { color: colors.accent.primary }]}>→</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.section}>Legal</Text>
        <View style={s.card}>
          <TouchableOpacity style={s.row} onPress={() => router.push('/privacy')}>
            <Text style={s.label}>Privacy Policy</Text>
            <Text style={[s.value, { color: colors.accent.primary }]}>→</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.row, s.rowLast]} onPress={() => {
            const { Linking } = require('react-native');
            Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/');
          }}>
            <Text style={s.label}>Terms of Use</Text>
            <Text style={[s.value, { color: colors.accent.primary }]}>→</Text>
          </TouchableOpacity>
        </View>

        <View style={s.versionRow}><Text style={s.version}>Sharp v2.2</Text></View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Plan card subline. Pro = today's daily counters. Free = "X/3 One Shots this
// week" framing since the weekly cap is the one that actually bites for free.
// Falls back to the upgrade prompt when usage hasn't loaded yet (offline / cold).
function formatUsageSub(u: UsageDisplay | null): string {
  if (!u) return isPremium() ? '3 One Shots · 2 Threaded · 2 Industry /day' : 'Unlock full coaching and unlimited practice';
  if (u.isPremium) {
    // Voice quota is naturally hidden when conversations.cap === 0, which it
    // is whenever FEATURES.conversation is off (PREMIUM_LIMITS.conversationsPerDay
    // stays 1 but the Home tile / setup screen are unreachable). For an extra
    // belt-and-braces hide, we could check FEATURES.conversation here too.
    const parts = [
      `${u.oneShots.used}/${u.oneShots.cap} One Shots`,
      `${u.threaded.used}/${u.threaded.cap} Threaded`,
      `${u.industry.used}/${u.industry.cap} Industry`,
    ];
    if (u.conversations.cap > 0 && FEATURES.conversation) parts.push(`${u.conversations.used}/${u.conversations.cap} Voice`);
    return `${parts.join(' · ')} · today`;
  }
  // Free tier: cap > 0 means usable; cap = 0 means locked behind paywall.
  const parts: string[] = [];
  if (u.oneShots.cap > 0) parts.push(`${u.oneShots.used}/${u.oneShots.cap} One Shots this week`);
  if (u.threaded.cap > 0) parts.push(`${u.threaded.used}/${u.threaded.cap} Threaded`);
  if (parts.length === 0) return 'Unlock full coaching and unlimited practice';
  return parts.join(' · ');
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  scroll: { flex: 1 },
  content: { padding: layout.screenPadding, paddingBottom: wp(50) },
  title: { fontSize: typography.size.title, fontWeight: typography.weight.black, color: colors.text.primary, marginBottom: spacing.xl },

  // Profile
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.lg, ...shadows.md },
  profileAvatar: { width: wp(56), height: wp(56), borderRadius: wp(28), borderWidth: 2, borderColor: colors.borderLight },
  profileAvatarEmpty: { width: wp(56), height: wp(56), borderRadius: wp(28), backgroundColor: colors.accent.primary, alignItems: 'center', justifyContent: 'center' },
  profileAvatarText: { fontSize: fp(20), fontWeight: typography.weight.black, color: colors.text.inverse },
  profileAvatarBadge: { position: 'absolute', bottom: -2, right: -2, width: wp(22), height: wp(22), borderRadius: wp(11), backgroundColor: colors.bg.secondary, borderWidth: 1.5, borderColor: colors.borderLight, alignItems: 'center', justifyContent: 'center' },
  profileAvatarBadgeText: { fontSize: fp(10) },
  profileInfo: { flex: 1 },
  profileName: { fontSize: typography.size.md, fontWeight: typography.weight.bold, color: colors.text.primary },
  profileSub: { fontSize: typography.size.xs, color: colors.text.muted, marginTop: 2 },
  nameEditRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nameInput: { flex: 1, fontSize: typography.size.md, fontWeight: typography.weight.bold, color: colors.text.primary, backgroundColor: colors.bg.tertiary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  nameSave: { fontSize: typography.size.sm, fontWeight: typography.weight.bold, color: colors.accent.primary },

  section: { fontSize: fp(11), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.5, marginTop: spacing.xl, marginBottom: spacing.md },
  card: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, overflow: 'hidden', ...shadows.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  rowLast: { borderBottomWidth: 0 },
  label: { fontSize: typography.size.base, color: colors.text.primary, fontWeight: typography.weight.semibold },
  value: { fontSize: typography.size.sm, color: colors.text.muted },
  planInfo: { flex: 1 },
  planSub: { fontSize: typography.size.xs, color: colors.text.muted, marginTop: 1 },
  proBadge: { backgroundColor: colors.accent.primary, borderRadius: radius.pill, paddingHorizontal: wp(10), paddingVertical: wp(3) },
  proBadgeText: { fontSize: fp(10), fontWeight: typography.weight.black, color: colors.text.inverse, letterSpacing: 1 },
  versionRow: { alignItems: 'center', marginTop: spacing.lg },
  version: { fontSize: fp(10), color: colors.text.muted },
});
