import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AudioModule, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { colors, typography, spacing, radius, wp, fp, shadows, layout } from '../../src/constants/theme';
import { FadeIn, AudioWaveBars, PulseDot, LoadingScreen } from '../../src/components/Animations';
import { SharpFox, SpeechBubble } from '../../src/components/Illustrations';
import { getContext, saveContext } from '../../src/services/storage';
import { playQuestionAudio, stopAudio } from '../../src/services/tts';
import { transcribeAudio } from '../../src/services/transcription';
import { isPremium } from '../../src/services/premium';
import type { UserContext } from '../../src/types';

const FIELDS = [
  { key: 'roleText' as const, question: "Tell me about your role. What's your job title, what team are you on, and how long have you been doing this?", label: 'Your Role', emoji: '👤', placeholder: 'e.g. Senior product manager, Growth team, 5 years' },
  { key: 'currentCompany' as const, question: "What company do you work at?", label: 'Company', emoji: '🏢', placeholder: 'e.g. Stripe, Google, a startup' },
  { key: 'situationText' as const, question: "What are you preparing for right now? An interview, a promotion, a big presentation? Tell me what's coming up.", label: 'Your Situation', emoji: '🎯', placeholder: 'e.g. Staff promotion panel in 6 weeks' },
  { key: 'dreamRoleAndCompany' as const, question: "If you could have any role at any company, what would it be?", label: 'Dream Role', emoji: '✨', placeholder: 'e.g. Engineering Manager at Anthropic' },
];

type ContextKey = typeof FIELDS[number]['key'];
type RecState = 'idle' | 'speaking' | 'ready' | 'recording' | 'processing';

function hasExistingContext(ctx: UserContext): boolean {
  return !!(ctx.roleText || ctx.currentCompany || ctx.situationText || ctx.dreamRoleAndCompany);
}

function filledCount(ctx: UserContext): number {
  return FIELDS.filter(f => !!ctx[f.key]).length;
}

export default function ContextSetupScreen() {
  const router = useRouter();
  const [ctx, setCtx] = useState<UserContext>({ roleText: '', currentCompany: '', situationText: '', dreamRoleAndCompany: '', documents: [] });
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<'overview' | 'voice' | 'edit'>('overview');
  const [voiceStep, setVoiceStep] = useState(0);
  const [recState, setRecState] = useState<RecState>('idle');
  const [editingField, setEditingField] = useState<ContextKey | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const recorderRef = useRef<InstanceType<typeof AudioModule.AudioRecorder> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    if (!isPremium()) { router.replace('/premium'); return; }
    mountedRef.current = true;
    getContext().then(c => {
      if (c) setCtx(c);
      setLoaded(true);
      // If no context exists, start voice setup
      if (!c || !hasExistingContext(c)) {
        setMode('voice');
      }
    }).catch(() => setLoaded(true));
    return () => { mountedRef.current = false; stopAudio(); };
  }, []);

  // Voice mode: speak when step changes
  useEffect(() => {
    if (mode === 'voice' && loaded) speakQuestion();
  }, [voiceStep, mode, loaded]);

  async function speakQuestion() {
    if (voiceStep >= FIELDS.length) return;
    setRecState('speaking');
    const greeting = voiceStep === 0 ? "Let's set up your context. I'll ask you a few questions — just speak naturally. " : '';
    await playQuestionAudio(greeting + FIELDS[voiceStep].question);
    if (mountedRef.current) setRecState('ready');
  }

  async function startRecording() {
    try {
      await stopAudio();
      await requestRecordingPermissionsAsync();
      let sessionReady = false;
      for (const m of ['duckOthers', 'mixWithOthers'] as const) {
        try { await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, interruptionMode: m }); sessionReady = true; break; } catch {}
      }
      if (!sessionReady) await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      const recorder = new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY);
      await recorder.prepareToRecordAsync();
      recorder.record();
      recorderRef.current = recorder;
      setRecState('recording');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {
      __DEV__ && console.error('Recording error:', e);
      setRecState('ready');
    }
  }

  async function stopRecording() {
    if (!recorderRef.current) return;
    setRecState('processing');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await recorderRef.current.stop();
      const uri = recorderRef.current.uri;
      recorderRef.current = null;
      if (!uri) throw new Error('No URI');
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const { transcript } = await transcribeAudio(uri);
      if (!mountedRef.current) return;
      const trimmed = transcript.trim();
      if (!trimmed) {
        // Empty transcript — don't overwrite
        setRecState('ready');
        return;
      }
      const key = mode === 'voice' ? FIELDS[voiceStep].key : editingField;
      if (key) {
        setCtx(prev => ({ ...prev, [key]: trimmed }));
        setHasChanges(true);
      }
      setRecState('idle');
      setEditingField(null);
    } catch (e) {
      __DEV__ && console.error('Transcription error:', e);
      if (mountedRef.current) setRecState('ready');
    }
  }

  async function handleSave() {
    await saveContext(ctx);
    setHasChanges(false);
    router.back();
  }

  function voiceNext() {
    if (voiceStep < FIELDS.length - 1) {
      setVoiceStep(voiceStep + 1);
      setRecState('idle');
    } else {
      // Done with voice setup — save and go to overview
      saveContext(ctx);
      setMode('overview');
      setHasChanges(false);
    }
  }

  if (!loaded) return <SafeAreaView style={s.safe}><LoadingScreen message="Loading context..." /></SafeAreaView>;

  // ===== PROCESSING STATE =====
  if (recState === 'processing') {
    return <SafeAreaView style={s.safe}><LoadingScreen message="Listening..." submessage="Transcribing your answer" /></SafeAreaView>;
  }

  // ===== VOICE SETUP MODE =====
  if (mode === 'voice') {
    const current = FIELDS[voiceStep];
    const currentValue = ctx[current.key];

    return (
      <SafeAreaView style={s.safe}>
        <View style={s.container}>
          <View style={s.header}>
            <View style={s.stepBadge}><Text style={s.stepText}>STEP {voiceStep + 1} OF {FIELDS.length}</Text></View>
            <View style={s.headerRight}>
              <TouchableOpacity onPress={() => { stopAudio(); setMode('overview'); }}><Text style={s.editBtn}>✏️ Type instead</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => { stopAudio(); router.back(); }}><Text style={s.close}>×</Text></TouchableOpacity>
            </View>
          </View>

          <View style={s.center}>
            <FadeIn key={voiceStep}>
              <SharpFox size={wp(90)} expression={recState === 'recording' ? 'listening' : recState === 'speaking' ? 'happy' : 'thinking'} />
            </FadeIn>

            {recState === 'speaking' && (
              <FadeIn>
                <View style={s.speakingRow}>
                  <AudioWaveBars active={true} color={colors.accent.primary} height={wp(28)} barCount={16} />
                  <Text style={s.speakingText}>Sharp is asking...</Text>
                </View>
              </FadeIn>
            )}

            <FadeIn key={`bubble-${voiceStep}`} delay={200}>
              <SpeechBubble text={current.question} variant="accent" />
            </FadeIn>

            {currentValue ? (
              <FadeIn>
                <View style={s.answerCard}>
                  <Text style={s.answerLabel}>{current.emoji} {current.label}</Text>
                  <Text style={s.answerText}>"{currentValue}"</Text>
                  <TouchableOpacity onPress={() => { setCtx(prev => ({ ...prev, [current.key]: '' })); setRecState('ready'); }} activeOpacity={0.7}>
                    <Text style={s.reRecordText}>🎤 Re-record</Text>
                  </TouchableOpacity>
                </View>
              </FadeIn>
            ) : null}

            {recState === 'recording' && (
              <FadeIn>
                <View style={s.recordingSection}>
                  <AudioWaveBars active={true} color={colors.recording} height={wp(44)} barCount={24} />
                  <View style={s.recBadge}><PulseDot size={wp(8)} /><Text style={s.recText}>RECORDING</Text></View>
                </View>
              </FadeIn>
            )}
          </View>

          <View style={s.btnArea}>
            {recState === 'ready' && !currentValue && (
              <TouchableOpacity style={s.recordBtn} onPress={startRecording} activeOpacity={0.8}>
                <Text style={s.recordBtnText}>🎤 Tap to answer</Text>
              </TouchableOpacity>
            )}
            {recState === 'recording' && (
              <TouchableOpacity style={s.stopBtn} onPress={stopRecording} activeOpacity={0.8}>
                <View style={s.stopSq} /><Text style={s.stopBtnText}>Done</Text>
              </TouchableOpacity>
            )}
            {currentValue && recState !== 'recording' && (
              <TouchableOpacity style={s.nextBtn} onPress={voiceNext} activeOpacity={0.8}>
                <Text style={s.nextBtnText}>{voiceStep >= FIELDS.length - 1 ? '✓ Save context' : 'Next →'}</Text>
              </TouchableOpacity>
            )}
            {recState === 'speaking' && (
              <TouchableOpacity style={s.skipSpeech} onPress={() => { stopAudio(); setRecState('ready'); }} activeOpacity={0.7}>
                <Text style={s.skipText}>Skip →</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ===== OVERVIEW / EDIT MODE =====
  const filled = filledCount(ctx);

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.overviewContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={s.header}>
            <Text style={s.title}>{hasExistingContext(ctx) ? 'Your Context' : 'Set Up Context'}</Text>
            <TouchableOpacity onPress={() => { stopAudio(); hasChanges ? Alert.alert('Unsaved changes', 'Save before leaving?', [
              { text: 'Discard', style: 'destructive', onPress: () => router.back() },
              { text: 'Save', onPress: handleSave },
            ]) : router.back(); }}>
              <Text style={s.close}>×</Text>
            </TouchableOpacity>
          </View>

          {/* Completion indicator */}
          <View style={s.completionRow}>
            <View style={s.completionTrack}>
              <View style={[s.completionFill, { width: `${(filled / FIELDS.length) * 100}%` }]} />
            </View>
            <Text style={s.completionText}>{filled}/{FIELDS.length} fields</Text>
          </View>

          {/* Fields */}
          {FIELDS.map((field) => {
            const value = ctx[field.key];
            const isEditing = editingField === field.key;

            return (
              <FadeIn key={field.key}>
                <View style={[s.fieldCard, isEditing && s.fieldCardActive]}>
                  <View style={s.fieldHeader}>
                    <View style={s.fieldLabelRow}>
                      <Text style={s.fieldEmoji}>{field.emoji}</Text>
                      <Text style={s.fieldLabel}>{field.label}</Text>
                    </View>
                    {value && !isEditing && (
                      <View style={s.filledBadge}><Text style={s.filledText}>✓</Text></View>
                    )}
                  </View>

                  {isEditing ? (
                    <View style={s.fieldEditArea}>
                      <TextInput
                        style={s.fieldInput}
                        multiline
                        value={value}
                        onChangeText={t => { setCtx(prev => ({ ...prev, [field.key]: t })); setHasChanges(true); }}
                        placeholder={field.placeholder}
                        placeholderTextColor={colors.text.muted}
                        autoFocus
                      />
                      <View style={s.fieldActions}>
                        <TouchableOpacity style={s.fieldVoiceBtn} onPress={() => { setEditingField(field.key); startRecording(); }} activeOpacity={0.7}>
                          <Text style={s.fieldVoiceBtnText}>🎤</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.fieldDoneBtn} onPress={() => setEditingField(null)} activeOpacity={0.7}>
                          <Text style={s.fieldDoneBtnText}>Done</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity onPress={() => setEditingField(field.key)} activeOpacity={0.7}>
                      {value ? (
                        <Text style={s.fieldValue}>{value}</Text>
                      ) : (
                        <Text style={s.fieldPlaceholder}>{field.placeholder}</Text>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              </FadeIn>
            );
          })}

          {/* Recording overlay for voice-in-field */}
          {recState === 'recording' && editingField && (
            <View style={s.voiceOverlay}>
              <AudioWaveBars active={true} color={colors.recording} height={wp(36)} barCount={20} />
              <View style={s.recBadge}><PulseDot size={wp(8)} /><Text style={s.recText}>RECORDING</Text></View>
              <TouchableOpacity style={s.stopBtn} onPress={stopRecording} activeOpacity={0.8}>
                <View style={s.stopSq} /><Text style={s.stopBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Documents */}
          <View style={s.docsSection}>
            <Text style={s.docsTitle}>Documents</Text>
            {ctx.documents.length > 0 ? (
              ctx.documents.map(doc => (
                <View key={doc.id} style={s.docRow}>
                  <View style={s.docInfo}>
                    <Text style={s.docName}>{doc.filename}</Text>
                    <Text style={s.docType}>{doc.documentType}</Text>
                  </View>
                </View>
              ))
            ) : (
              <Text style={s.docsEmpty}>No documents yet</Text>
            )}
            <TouchableOpacity style={s.addDocBtn} onPress={() => router.push('/context/documents')} activeOpacity={0.7}>
              <Text style={s.addDocBtnText}>+ Add document</Text>
            </TouchableOpacity>
          </View>

          {/* Re-do voice setup */}
          {hasExistingContext(ctx) && (
            <TouchableOpacity style={s.voiceRedoBtn} onPress={() => { setVoiceStep(0); setMode('voice'); }} activeOpacity={0.7}>
              <Text style={s.voiceRedoBtnText}>🎤 Redo voice setup</Text>
            </TouchableOpacity>
          )}

          {/* Save */}
          <TouchableOpacity style={[s.saveBtn, !hasChanges && s.saveBtnDisabled]} onPress={handleSave} activeOpacity={hasChanges ? 0.8 : 1} disabled={!hasChanges}>
            <Text style={s.saveBtnText}>{hasChanges ? 'Save changes' : 'Up to date'}</Text>
          </TouchableOpacity>

          <View style={{ height: wp(40) }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  container: { flex: 1, padding: layout.screenPadding },
  overviewContent: { padding: layout.screenPadding, paddingBottom: wp(40) },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  stepBadge: { backgroundColor: colors.accent.light, borderRadius: radius.pill, paddingHorizontal: wp(12), paddingVertical: wp(5) },
  stepText: { fontSize: fp(9), fontWeight: typography.weight.black, color: colors.accent.primary, letterSpacing: 1.5 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  editBtn: { fontSize: fp(10), fontWeight: typography.weight.semibold, color: colors.text.tertiary },
  close: { fontSize: fp(22), color: colors.text.muted },
  title: { fontSize: typography.size.title, fontWeight: typography.weight.black, color: colors.text.primary },

  // Completion
  completionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xl },
  completionTrack: { flex: 1, height: wp(4), backgroundColor: colors.borderLight, borderRadius: wp(2), overflow: 'hidden' },
  completionFill: { height: '100%', backgroundColor: colors.success, borderRadius: wp(2) },
  completionText: { fontSize: fp(10), fontWeight: typography.weight.bold, color: colors.text.muted },

  // Field cards
  fieldCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1.5, borderColor: 'transparent', ...shadows.sm },
  fieldCardActive: { borderColor: colors.accent.primary, ...shadows.accent },
  fieldHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  fieldEmoji: { fontSize: fp(14) },
  fieldLabel: { fontSize: typography.size.sm, fontWeight: typography.weight.bold, color: colors.text.primary },
  filledBadge: { width: wp(20), height: wp(20), borderRadius: wp(10), backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' },
  filledText: { fontSize: fp(10), fontWeight: typography.weight.bold, color: colors.text.inverse },
  fieldValue: { fontSize: typography.size.sm, color: colors.text.secondary, lineHeight: fp(20) },
  fieldPlaceholder: { fontSize: typography.size.sm, color: colors.text.muted, fontStyle: 'italic' },

  fieldEditArea: { gap: spacing.sm },
  fieldInput: { backgroundColor: colors.bg.tertiary, borderRadius: radius.md, padding: spacing.md, fontSize: typography.size.sm, color: colors.text.primary, lineHeight: fp(20), minHeight: wp(60) },
  fieldActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  fieldVoiceBtn: { backgroundColor: colors.bg.tertiary, borderRadius: radius.md, width: wp(36), height: wp(36), alignItems: 'center', justifyContent: 'center' },
  fieldVoiceBtnText: { fontSize: fp(16) },
  fieldDoneBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, alignItems: 'center', justifyContent: 'center' },
  fieldDoneBtnText: { fontSize: typography.size.sm, fontWeight: typography.weight.bold, color: colors.text.inverse },

  // Voice overlay
  voiceOverlay: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },

  // Documents
  docsSection: { marginTop: spacing.lg, marginBottom: spacing.md },
  docsTitle: { fontSize: fp(11), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.5, marginBottom: spacing.md },
  docRow: { backgroundColor: colors.bg.secondary, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, ...shadows.sm },
  docInfo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  docName: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.text.primary, flex: 1 },
  docType: { fontSize: fp(9), fontWeight: typography.weight.bold, color: colors.accent.primary, textTransform: 'uppercase' as const },
  docsEmpty: { fontSize: typography.size.sm, color: colors.text.muted, fontStyle: 'italic', marginBottom: spacing.md },
  addDocBtn: { borderWidth: 1.5, borderColor: colors.accent.border, borderStyle: 'dashed', borderRadius: radius.lg, paddingVertical: wp(12), alignItems: 'center' },
  addDocBtnText: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.accent.primary },

  // Voice redo
  voiceRedoBtn: { backgroundColor: colors.bg.secondary, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: wp(12), alignItems: 'center', marginTop: spacing.md },
  voiceRedoBtnText: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.text.tertiary },

  // Save
  saveBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(16), alignItems: 'center', marginTop: spacing.lg, ...shadows.accent },
  saveBtnDisabled: { backgroundColor: colors.border, shadowOpacity: 0 },
  saveBtnText: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.text.inverse },

  // Voice setup mode
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  speakingRow: { alignItems: 'center', gap: spacing.sm },
  speakingText: { fontSize: typography.size.xs, color: colors.accent.primary, fontWeight: typography.weight.semibold },
  answerCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.xl, width: '100%', ...shadows.md },
  answerLabel: { fontSize: fp(10), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: spacing.sm },
  answerText: { fontSize: typography.size.base, color: colors.text.primary, lineHeight: fp(22), fontStyle: 'italic' },
  reRecordText: { fontSize: typography.size.xs, color: colors.accent.primary, fontWeight: typography.weight.bold, marginTop: spacing.md },
  recordingSection: { alignItems: 'center', gap: spacing.md },
  recBadge: { flexDirection: 'row', alignItems: 'center', gap: wp(6) },
  recText: { fontSize: fp(9), fontWeight: typography.weight.black, color: colors.recording, letterSpacing: 1.5 },
  btnArea: { marginBottom: wp(16) },
  recordBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(18), alignItems: 'center', ...shadows.accent },
  recordBtnText: { fontSize: typography.size.md, fontWeight: typography.weight.bold, color: colors.text.inverse },
  stopBtn: { backgroundColor: colors.bg.secondary, borderWidth: 2, borderColor: colors.feedback.negativeBorder, borderRadius: radius.lg, paddingVertical: wp(16), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: wp(6) },
  stopSq: { width: wp(12), height: wp(12), borderRadius: wp(3), backgroundColor: colors.recording },
  stopBtnText: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.recording },
  nextBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(18), alignItems: 'center', ...shadows.accent },
  nextBtnText: { fontSize: typography.size.md, fontWeight: typography.weight.bold, color: colors.text.inverse },
  skipSpeech: { backgroundColor: colors.bg.tertiary, borderRadius: radius.lg, paddingVertical: wp(14), alignItems: 'center' },
  skipText: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.text.tertiary },
});
