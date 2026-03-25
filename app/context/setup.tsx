import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, wp, fp, shadows, layout } from '../../src/constants/theme';
import { getContext, saveContext, trackFeatureInterest } from '../../src/services/storage';
import type { UserContext } from '../../src/types';

const DOC_TYPE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  identity: { bg: colors.docType.identity.bg, text: colors.docType.identity.text, label: 'Identity' },
  aspiration: { bg: colors.docType.aspiration.bg, text: colors.docType.aspiration.text, label: 'Aspiration' },
  evidence: { bg: colors.docType.evidence.bg, text: colors.docType.evidence.text, label: 'Evidence' },
  preparation: { bg: colors.docType.preparation.bg, text: colors.docType.preparation.text, label: 'Preparation' },
};

export default function ContextSetupScreen() {
  const router = useRouter();
  const [ctx, setCtx] = useState<UserContext>({
    roleText: '', currentCompany: '', situationText: '', dreamRoleAndCompany: '', documents: [],
  });

  useEffect(() => {
    getContext().then(c => { if (c) setCtx(c); });
  }, []);

  async function save() {
    await saveContext(ctx);
    Alert.alert('Saved', 'Your context has been updated. Questions will now be personalised.');
    router.back();
  }

  const fieldsFilled = [ctx.roleText, ctx.currentCompany, ctx.situationText, ctx.dreamRoleAndCompany].filter(Boolean).length;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <View>
            <Text style={s.title}>Your Context</Text>
            <Text style={s.subtitle}>The more Sharp knows, the better your coaching</Text>
          </View>
          <TouchableOpacity onPress={() => router.back()} style={s.closeBtn}><Text style={s.close}>×</Text></TouchableOpacity>
        </View>

        {/* Progress indicator */}
        <View style={s.progressRow}>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${Math.max((fieldsFilled / 4) * 100, 5)}%` }]} />
          </View>
          <Text style={s.progressText}>{fieldsFilled}/4 fields</Text>
        </View>

        {/* Fields in cards */}
        <View style={s.fieldCard}>
          <View style={s.fieldHeader}>
            <Text style={s.fieldIcon}>👤</Text>
            <Text style={s.fieldName}>Your role</Text>
          </View>
          <Text style={s.fieldHint}>Job title, team, years of experience</Text>
          <TextInput style={s.input} multiline value={ctx.roleText} onChangeText={t => setCtx({ ...ctx, roleText: t })} placeholder="e.g. Senior product manager, Growth team, 5 years" placeholderTextColor={colors.text.muted} textAlignVertical="top" />
        </View>

        <View style={s.fieldCard}>
          <View style={s.fieldHeader}>
            <Text style={s.fieldIcon}>🏢</Text>
            <Text style={s.fieldName}>Current company</Text>
          </View>
          <TextInput style={[s.input, s.inputSm]} value={ctx.currentCompany} onChangeText={t => setCtx({ ...ctx, currentCompany: t })} placeholder="e.g. Stripe, Google, small startup" placeholderTextColor={colors.text.muted} />
        </View>

        <View style={s.fieldCard}>
          <View style={s.fieldHeader}>
            <Text style={s.fieldIcon}>🎯</Text>
            <Text style={s.fieldName}>Your situation</Text>
          </View>
          <Text style={s.fieldHint}>What are you preparing for or working on?</Text>
          <TextInput style={s.input} multiline value={ctx.situationText} onChangeText={t => setCtx({ ...ctx, situationText: t })} placeholder="e.g. Promotion panel in 6 weeks, switching teams, preparing for interviews" placeholderTextColor={colors.text.muted} textAlignVertical="top" />
        </View>

        <View style={s.fieldCard}>
          <View style={s.fieldHeader}>
            <Text style={s.fieldIcon}>✨</Text>
            <Text style={s.fieldName}>Dream role</Text>
          </View>
          <TextInput style={[s.input, s.inputSm]} value={ctx.dreamRoleAndCompany} onChangeText={t => setCtx({ ...ctx, dreamRoleAndCompany: t })} placeholder="e.g. Engineering Manager at Anthropic" placeholderTextColor={colors.text.muted} />
        </View>

        {/* Documents */}
        <Text style={s.section}>Documents</Text>
        <Text style={s.sectionHint}>Upload CVs, job descriptions, or project briefs for richer coaching</Text>

        {ctx.documents.map(doc => {
          const style = DOC_TYPE_STYLES[doc.documentType] || DOC_TYPE_STYLES.identity;
          return (
            <View key={doc.id} style={s.doc}>
              <View style={[s.docChip, { backgroundColor: style.bg }]}>
                <Text style={[s.docChipText, { color: style.text }]}>{style.label}</Text>
              </View>
              <View style={s.docInfo}>
                <Text style={s.docName} numberOfLines={1}>{doc.filename}</Text>
                <Text style={s.docUsage} numberOfLines={1}>{doc.structuredExtraction?.coachingUsage?.forOneShot?.slice(0, 50) || doc.summary?.slice(0, 50) || ''}</Text>
              </View>
            </View>
          );
        })}

        <TouchableOpacity style={s.addDoc} onPress={() => router.push('/context/documents')} activeOpacity={0.7}>
          <Text style={s.addDocIcon}>📄</Text>
          <Text style={s.addDocText}>Add document</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.mainBtn} onPress={save} activeOpacity={0.8}>
          <Text style={s.mainBtnText}>Save context</Text>
        </TouchableOpacity>

        <View style={s.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  content: { padding: layout.screenPadding, paddingBottom: wp(50) },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.lg },
  title: { fontSize: typography.size.title, fontWeight: typography.weight.black, color: colors.text.primary },
  subtitle: { fontSize: typography.size.xs, color: colors.text.tertiary, marginTop: wp(3) },
  closeBtn: { padding: spacing.sm },
  close: { fontSize: fp(22), color: colors.text.muted },

  // Progress
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xxl },
  progressTrack: { flex: 1, height: wp(4), backgroundColor: colors.borderLight, borderRadius: wp(2), overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.accent.primary, borderRadius: wp(2) },
  progressText: { fontSize: fp(10), color: colors.text.muted, fontWeight: typography.weight.semibold },

  // Field cards
  fieldCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.md, ...shadows.sm },
  fieldHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  fieldIcon: { fontSize: fp(14) },
  fieldName: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.text.primary },
  fieldHint: { fontSize: typography.size.xs, color: colors.text.muted, marginBottom: spacing.sm },
  input: { backgroundColor: colors.bg.tertiary, borderRadius: radius.md, padding: spacing.md, fontSize: typography.size.sm, color: colors.text.primary, lineHeight: fp(20), minHeight: wp(56) },
  inputSm: { minHeight: wp(40) },

  // Documents
  section: { fontSize: fp(11), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.5, marginTop: spacing.xl, marginBottom: spacing.xs },
  sectionHint: { fontSize: typography.size.xs, color: colors.text.muted, marginBottom: spacing.md },
  doc: { backgroundColor: colors.bg.secondary, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.md, ...shadows.sm },
  docChip: { borderRadius: radius.sm, paddingHorizontal: wp(8), paddingVertical: wp(3) },
  docChipText: { fontSize: fp(9), fontWeight: typography.weight.heavy, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  docInfo: { flex: 1 },
  docName: { fontSize: typography.size.sm, fontWeight: typography.weight.bold, color: colors.text.primary },
  docUsage: { fontSize: typography.size.xs, color: colors.text.tertiary, marginTop: 2 },
  addDoc: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderWidth: 1.5, borderColor: colors.accent.border, borderStyle: 'dashed', borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.sm },
  addDocIcon: { fontSize: fp(16) },
  addDocText: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.accent.primary },

  mainBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(16), alignItems: 'center', marginTop: spacing.xxl, ...shadows.accent },
  mainBtnText: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.text.inverse },

  bottomSpacer: { height: wp(20) },
});
