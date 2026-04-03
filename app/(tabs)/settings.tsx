import { View, Text, ScrollView, Switch, TextInput, Image, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { colors, typography, spacing, radius, shadows, layout, wp, fp } from '../../src/constants/theme';
import { getUserProfile, saveUserProfile, trackFeatureInterest } from '../../src/services/storage';
import { isPremium, getPlanName, syncFromRevenueCat } from '../../src/services/premium';
import { restorePurchases, isRevenueCatConfigured } from '../../src/services/revenuecat';
import { useAuth } from '../../src/context/AuthContext';
import { signOut } from '../../src/services/auth';
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

  useEffect(() => {
    // Load persisted preferences once
    AsyncStorage.getItem('sharp:pref_audio').then(v => { if (v !== null) setAudioQuestions(v === 'true'); });
    AsyncStorage.getItem('sharp:pref_haptics').then(v => { if (v !== null) setHaptics(v === 'true'); });
  }, []);

  // Reload profile every time screen gains focus (catches auth changes from modal)
  useFocusEffect(useCallback(() => {
    getUserProfile().then(p => {
      setProfile(p);
      if (p) setNameInput(p.displayName);
    });
  }, []));

  async function saveName() {
    const name = nameInput.trim();
    if (!name) return;
    const updated: UserProfile = { ...profile, displayName: name, isPremium: profile?.isPremium ?? false, createdAt: profile?.createdAt || new Date().toISOString() };
    await saveUserProfile(updated);
    setProfile(updated);
    setEditingName(false);
  }

  async function pickAvatar() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.5 });
    if (!result.canceled && result.assets?.[0]) {
      const updated: UserProfile = { ...profile, displayName: profile?.displayName || 'You', avatarUri: result.assets[0].uri, isPremium: profile?.isPremium ?? false, createdAt: profile?.createdAt || new Date().toISOString() };
      await saveUserProfile(updated);
      setProfile(updated);
    }
  }

  async function clearData() {
    Alert.alert('Clear All Data', 'This will delete all your sessions, context, streak, and profile. Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: async () => { await AsyncStorage.clear(); setProfile(null); Alert.alert('Done', 'All data cleared. Restart the app.'); } },
    ]);
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

        {/* Data */}
        <Text style={s.section}>Data</Text>
        <View style={s.card}>
          <TouchableOpacity style={[s.row, s.rowLast]} onPress={clearData}>
            <Text style={[s.label, { color: colors.error }]}>Clear all data</Text>
            <Text style={[s.value, { color: colors.error }]}>→</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.section}>Account</Text>
        <View style={s.card}>
          <View style={s.row}>
            <Text style={s.label}>Email</Text>
            <Text style={s.value}>{isAuthenticated ? user?.email : 'Not signed in'}</Text>
          </View>
          {isAuthenticated ? (
            <TouchableOpacity style={[s.row, s.rowLast]} onPress={() => {
              Alert.alert('Sign out', 'Are you sure?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sign out', style: 'destructive', onPress: async () => { await signOut(); } },
              ]);
            }}>
              <Text style={[s.label, { color: colors.error }]}>Sign out</Text>
              <Text style={[s.value, { color: colors.error }]}>→</Text>
            </TouchableOpacity>
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
              <Text style={s.planSub}>{isPremium() ? 'All features unlocked' : 'Tap to upgrade'}</Text>
            </View>
            {isPremium() ? (
              <View style={s.proBadge}><Text style={s.proBadgeText}>PRO</Text></View>
            ) : (
              <Text style={[s.value, { color: colors.accent.primary, fontWeight: typography.weight.bold }]}>Upgrade →</Text>
            )}
          </TouchableOpacity>
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

        <Text style={s.section}>Legal</Text>
        <View style={s.card}>
          <TouchableOpacity style={[s.row, s.rowLast]} onPress={() => router.push('/privacy')}>
            <Text style={s.label}>Privacy Policy</Text>
            <Text style={[s.value, { color: colors.accent.primary }]}>→</Text>
          </TouchableOpacity>
        </View>

        <View style={s.versionRow}><Text style={s.version}>Sharp v2.0</Text></View>
      </ScrollView>
    </SafeAreaView>
  );
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
  proBadgeText: { fontSize: fp(9), fontWeight: typography.weight.black, color: colors.text.inverse, letterSpacing: 1 },
  versionRow: { alignItems: 'center', marginTop: spacing.lg },
  version: { fontSize: fp(10), color: colors.text.muted },
});
