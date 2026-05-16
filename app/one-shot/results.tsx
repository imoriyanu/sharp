import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking, Modal, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect } from 'react';
import { colors, typography, spacing, radius, getScoreColor, wp, fp, shadows, layout } from '../../src/constants/theme';
import { ScoreReveal, FadeIn } from '../../src/components/Animations';
import { playQuestionAudio, playCoachingAudio, playModelAudio, playRecording, stopAudio, prefetchAudio } from '../../src/services/tts';
import * as Haptics from 'expo-haptics';
import { isPremium } from '../../src/services/premium';

const DIMS = ['structure', 'concision', 'substance', 'fillerWords', 'awareness'] as const;
const DIM_LABELS: Record<string, string> = { structure: 'Structure', concision: 'Concision', substance: 'Substance', fillerWords: 'Filler Words', awareness: 'Awareness' };

// Tap a dimension to see what it measures + how to read the score. Descriptions
// avoid book/framework names per project rule. All scored 1-10; for filler
// words, higher = cleaner speech (10 = zero fillers).
const DIM_INFO: Record<string, { what: string; scale: string }> = {
  structure: {
    what: 'How clearly your answer was organised. Did you lead with the point, signpost the flow, and land it cleanly?',
    scale: '5 = jumbled or buried lead. 7 = clear shape, can be tighter. 9 = hook first, signposted, lands hard.',
  },
  concision: {
    what: 'Whether you said it in the right number of words. Tight beats long. Every line should carry weight.',
    scale: '5 = padded or hedged. 7 = mostly tight, a few extra phrases. 9 = nothing wasted.',
  },
  substance: {
    what: 'How real and specific you were. Numbers, named projects, concrete moves. Not abstractions or platitudes.',
    scale: '5 = generalities. 7 = some specifics, some vagueness. 9 = specific enough to verify.',
  },
  fillerWords: {
    what: 'How clean your speech was. "Um", "like", "you know", "kind of". Higher score = fewer fillers.',
    scale: '5 = noticeable fillers throughout. 7 = a handful. 10 = zero fillers detected.',
  },
  awareness: {
    what: 'How well you read the room. Industry, company, role context. Did your answer feel situationally sharp?',
    scale: '5 = generic answer that could fit anywhere. 7 = appropriate fit. 9 = sharp references that show insight.',
  },
};

function safeParse<T>(json: string | undefined, fallback: T): T {
  if (!json) return fallback;
  try { return JSON.parse(json); } catch { return fallback; }
}

export default function ResultsScreen() {
  const router = useRouter();
  const p = useLocalSearchParams();
  const scores = safeParse(p.scores as string, { structure: 0, concision: 0, substance: 0, fillerWords: 0, awareness: 0 });
  const overall = parseFloat((p.overall as string) || '0');
  const progressScore = parseFloat((p.progressScore as string) || '0');
  const progressDelta = parseFloat((p.progressDelta as string) || '0');
  const progressTrend = (p.progressTrend as string) || 'new';
  const progressMessage = (p.progressMessage as string) || '';
  const hasProgress = progressTrend !== 'new' && progressScore > 0;
  const summary = (p.summary as string) || '';
  const positives = (p.positives as string) || '';
  const improvements = (p.improvements as string) || '';
  const insight = (p.coachingInsight as string) || '';
  const awarenessNote = (p.awarenessNote as string) || '';
  const fillers = safeParse<string[]>(p.fillerWordsFound as string, []);
  const fillerCount = parseInt((p.fillerCount as string) || '0');
  const question = (p.question as string) || '';
  const reasoning = (p.reasoning as string) || '';
  const transcript = (p.transcript as string) || '';
  const recordingUri = (p.recordingUri as string) || '';
  const modelAnswer = (p.modelAnswer as string) || '';
  const communicationTip = (p.communicationTip as string) || '';
  const suggestedAngles = safeParse<string[]>(p.suggestedAngles as string, []);
  const suggestedReading = safeParse<{ topic: string; searchTerms: string[]; reason: string } | null>(p.suggestedReading as string, null);
  const rewrite = (p.snippetRewrite as string) || '';

  const [playing, setPlaying] = React.useState<string | null>(null);
  const [textOnly, setTextOnly] = React.useState(false);
  const [showReasoning, setShowReasoning] = React.useState(false);
  const [openDim, setOpenDim] = React.useState<string | null>(null);
  const mountedRef = React.useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    speakFullFeedback();
    // Pre-fetch all listenable audio so tap-to-play is instant
    if (modelAnswer) prefetchAudio(`Here's how I'd say it. ${modelAnswer}`, 'model');
    if (positives) prefetchAudio(positives, 'coaching');
    if (improvements) prefetchAudio(improvements, 'coaching');
    if (insight) prefetchAudio(insight, 'coaching');
    return () => { mountedRef.current = false; stopAudio(); };
  }, []);

  // Session is already saved in recording.tsx. No duplicate save needed

  async function speakFullFeedback() {
    const scoreWord = overall >= 7.5 ? 'Really solid work.' : overall >= 5.5 ? 'OK, not bad.' : 'Alright, let\'s break this down.';
    const positivePart = positives || 'You made an effort and that counts.';
    const improvePart = improvements ? `Now, ${improvements}` : '';
    const insightPart = insight ? `Here's the key takeaway: ${insight}` : '';

    const spoken = `${scoreWord} ${positivePart} ${improvePart} ${insightPart}`;
    if (!mountedRef.current) return;
    setPlaying('feedback');
    const played = await playCoachingAudio(spoken).catch(() => false);
    if (mountedRef.current) { setPlaying(null); if (!played) setTextOnly(true); }
  }

  async function play(key: string, text: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (playing === key) { stopAudio(); setPlaying(null); return; }
    if (!mountedRef.current) return;
    setPlaying(key);
    await stopAudio();
    const played = key === 'model'
      ? await playModelAudio(`Here's how I'd say it. ${text}`).catch(() => false)
      : await playCoachingAudio(text).catch(() => false);
    if (mountedRef.current) { setPlaying(null); if (!played) setTextOnly(true); }
  }

  // Play the user's own recording. Self-contained. Doesn't trigger textOnly
  // mode on failure (the recording can be missing/corrupt while TTS still
  // works for everything else on the screen).
  async function playOwnRecording() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (playing === 'own-recording') { stopAudio(); setPlaying(null); return; }
    if (!mountedRef.current || !recordingUri) return;
    setPlaying('own-recording');
    await stopAudio();
    await playRecording(recordingUri).catch(() => false);
    if (mountedRef.current) setPlaying(null);
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <Text style={s.title}>Results</Text>
            {textOnly && <View style={s.textOnlyBadge}><Text style={s.textOnlyText}>Text only mode</Text></View>}
          </View>
          <TouchableOpacity onPress={() => { stopAudio(); router.replace('/(tabs)'); }}><Text style={s.close}>×</Text></TouchableOpacity>
        </View>

        {/* Score */}
        <FadeIn delay={0}>
          <View style={s.scoreSection}>
            <View style={[s.ring, { borderColor: getScoreColor(hasProgress ? progressScore : overall) }]}>
              <ScoreReveal score={hasProgress ? progressScore : overall} color={getScoreColor(hasProgress ? progressScore : overall)} />
            </View>
            {hasProgress ? (
              <View style={s.progressRow}>
                <Text style={s.scoreLbl}>Your Score</Text>
                <View style={[s.deltaBadge, progressDelta >= 0 ? s.deltaUp : s.deltaDown]}>
                  <Text style={[s.deltaText, progressDelta >= 0 ? s.deltaUpText : s.deltaDownText]}>
                    {progressDelta >= 0 ? '↑' : '↓'} {Math.abs(progressDelta).toFixed(1)} vs avg
                  </Text>
                </View>
              </View>
            ) : (
              <Text style={s.scoreLbl}>Overall Score</Text>
            )}
            {hasProgress && progressMessage ? (
              <Text style={s.progressMsg}>{progressMessage}</Text>
            ) : null}
            {hasProgress && progressScore !== overall ? (
              <Text style={s.rawScore}>Raw: {overall.toFixed(1)}</Text>
            ) : null}
          </View>
        </FadeIn>

        {/* Dimensions. Tap a row to see what it measures + how to read the score */}
        <FadeIn delay={200}>
          <View style={s.card}>
            {DIMS.map((dim) => {
              const val = scores[dim] || 0;
              return (
                <TouchableOpacity key={dim} style={[s.dim, dim === 'awareness' && s.dimSep]} onPress={() => setOpenDim(dim)} activeOpacity={0.6}>
                  <Text style={s.dimName}>{DIM_LABELS[dim]}</Text>
                  <View style={s.dimTrack}><View style={[s.dimFill, { width: `${val * 10}%`, backgroundColor: getScoreColor(val) }]} /></View>
                  <Text style={[s.dimVal, { color: getScoreColor(val) }]}>{val}</Text>
                  <Text style={s.dimHelp}>ⓘ</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </FadeIn>

        {/* Dimension info modal */}
        <Modal visible={!!openDim} animationType="fade" transparent onRequestClose={() => setOpenDim(null)}>
          <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setOpenDim(null)}>
            <TouchableOpacity activeOpacity={1} style={s.modalCard} onPress={() => {}}>
              {openDim && (
                <>
                  <Text style={s.modalTitle}>{DIM_LABELS[openDim]}</Text>
                  <Text style={s.modalScore}>Your score: <Text style={{ color: getScoreColor((scores as Record<string, number>)[openDim] || 0), fontWeight: typography.weight.black }}>{(scores as Record<string, number>)[openDim] || 0}/10</Text></Text>
                  <Text style={s.modalSection}>What it measures</Text>
                  <Text style={s.modalText}>{DIM_INFO[openDim].what}</Text>
                  <Text style={s.modalSection}>How to read it</Text>
                  <Text style={s.modalText}>{DIM_INFO[openDim].scale}</Text>
                  <TouchableOpacity style={s.modalClose} onPress={() => setOpenDim(null)} activeOpacity={0.8}>
                    <Text style={s.modalCloseText}>Got it</Text>
                  </TouchableOpacity>
                </>
              )}
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        {/* What went well */}
        {positives ? (
          <FadeIn delay={400}>
            <Text style={s.section}>What went well</Text>
            <TouchableOpacity style={s.positiveCard} onPress={() => !textOnly && play('positives', positives)} activeOpacity={textOnly ? 1 : 0.7}>
              <View style={s.feedbackHeader}>
                <Text style={s.feedbackEmoji}>✅</Text>
                {!textOnly && <Text style={s.posListenBtn}>{playing === 'positives' ? '⏸ Pause' : '🔊 Listen'}</Text>}
              </View>
              <Text style={s.positiveText}>{positives}</Text>
            </TouchableOpacity>
          </FadeIn>
        ) : null}

        {/* What to improve */}
        {improvements ? (
          <FadeIn delay={500}>
            <Text style={s.section}>To work on</Text>
            <TouchableOpacity style={s.improveCard} onPress={() => !textOnly && play('improvements', improvements)} activeOpacity={textOnly ? 1 : 0.7}>
              <View style={s.feedbackHeader}>
                <Text style={s.feedbackEmoji}>🎯</Text>
                {!textOnly && <Text style={s.listenBtn}>{playing === 'improvements' ? '⏸ Pause' : '🔊 Listen'}</Text>}
              </View>
              <Text style={s.feedbackText}>{improvements}</Text>
            </TouchableOpacity>
          </FadeIn>
        ) : null}

        {/* Coaching insight */}
        {insight ? (
          <FadeIn delay={400}>
            <TouchableOpacity style={s.insightCard} onPress={() => !textOnly && play('insight', insight)} activeOpacity={textOnly ? 1 : 0.7}>
              <View style={s.feedbackHeader}>
                <Text style={s.feedbackEmoji}>💡</Text>
                {!textOnly && <Text style={s.listenBtn}>{playing === 'insight' ? '⏸ Pause' : '🔊 Listen'}</Text>}
              </View>
              <Text style={s.insightText}>{insight}</Text>
            </TouchableOpacity>
          </FadeIn>
        ) : null}

        {/* Your answer ↔ Model answer. Paired side-by-side. Tap your own
            recording to hear yourself, tap the model to hear the sharper take.
            Hearing both back-to-back is where the coaching lands. */}
        {(recordingUri || transcript) || modelAnswer ? (
          <FadeIn delay={600}>
            <Text style={s.section}>{modelAnswer ? 'Your answer vs the model' : 'Your answer'}</Text>

            {/* Your own recording. Only shown when we have the actual file.
                Falls back gracefully if missing (legacy sessions, etc.) */}
            {recordingUri ? (
              <TouchableOpacity style={s.ownCard} onPress={playOwnRecording} activeOpacity={0.7}>
                <View style={s.feedbackHeader}>
                  <Text style={s.feedbackEmoji}>🎙️</Text>
                  <Text style={s.ownListenBtn}>{playing === 'own-recording' ? '⏸ Pause' : '🔊 Hear yourself'}</Text>
                </View>
                <Text style={s.ownText} numberOfLines={4}>"{transcript}"</Text>
                <Text style={s.ownHint}>This is what you said</Text>
              </TouchableOpacity>
            ) : null}

            {/* Model answer. Pro-only post-onboarding. Free users see a
                locked variant with the conversion CTA. Onboarding result
                screen shows this free as the "one taste"; everywhere else
                it's gated to drive trial conversion. */}
            {modelAnswer ? (
              isPremium() ? (
                <TouchableOpacity style={s.modelCard} onPress={() => !textOnly && play('model', modelAnswer)} activeOpacity={textOnly ? 1 : 0.7}>
                  <View style={s.feedbackHeader}>
                    <Text style={s.feedbackEmoji}>✨</Text>
                    {!textOnly && <Text style={s.modelListenBtn}>{playing === 'model' ? '⏸ Pause' : '🔊 Listen to sharper version'}</Text>}
                  </View>
                  <Text style={s.modelText}>"{modelAnswer}"</Text>
                  <Text style={s.modelHint}>Built from your response. This is what a 9/10 sounds like</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={s.modelLockedCard} onPress={() => router.push('/premium')} activeOpacity={0.85}>
                  <View style={s.feedbackHeader}>
                    <Text style={s.feedbackEmoji}>🔒</Text>
                    <Text style={s.modelLockedCta}>Unlock with Pro →</Text>
                  </View>
                  <Text style={s.modelLockedTitle}>Hear what a 9/10 sounds like</Text>
                  <Text style={s.modelLockedDesc}>Sharp Pro builds a model answer from your response and reads it back in the coach voice. Closes the gap faster than any framework can.</Text>
                </TouchableOpacity>
              )
            ) : null}
          </FadeIn>
        ) : null}

        {/* Communication tip */}
        {communicationTip ? (
          <FadeIn delay={800}>
            <View style={s.tipCard}>
              <Text style={s.tipLabel}>Communication tip</Text>
              <Text style={s.tipText}>{communicationTip}</Text>
            </View>
          </FadeIn>
        ) : null}

        {/* Suggested angles */}
        {suggestedAngles.length > 0 && (
          <FadeIn delay={800}>
            <View style={s.anglesCard}>
              <Text style={s.tipLabel}>Other approaches</Text>
              {suggestedAngles.map((angle, i) => (
                <View key={i} style={s.angleRow}>
                  <Text style={s.angleBullet}>→</Text>
                  <Text style={s.angleText}>{angle}</Text>
                </View>
              ))}
            </View>
          </FadeIn>
        )}

        {/* Fillers */}
        {fillerCount > 0 ? (
          <View style={s.fillerSection}>
            <Text style={s.tipLabel}>Filler words · {fillerCount}</Text>
            <View style={s.fillerRow}>
              {countFillers(fillers).map(({ word, count }) => (
                <View key={word} style={s.fillerPill}>
                  <Text style={s.fillerText}>{word}{count > 1 ? ` ×${count}` : ''}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : (
          <View style={s.fillerSection}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Text style={s.tipLabel}>Filler words</Text>
              <View style={[s.fillerPill, { backgroundColor: colors.feedback.positiveBg }]}><Text style={[s.fillerText, { color: colors.success }]}>Zero</Text></View>
            </View>
          </View>
        )}

        {/* Suggested reading */}
        {suggestedReading && (
          <FadeIn delay={850}>
            <View style={s.readingCard}>
              <View style={s.readingHeader}>
                <Text style={s.readingEmoji}>📖</Text>
                <Text style={s.readingLabel}>Go deeper</Text>
              </View>
              <Text style={s.readingReason}>{suggestedReading.reason}</Text>
              <View style={s.readingLinks}>
                {suggestedReading.searchTerms.map((term, i) => (
                  <TouchableOpacity
                    key={i}
                    style={s.readingLink}
                    onPress={() => Linking.openURL(`https://www.google.com/search?q=${encodeURIComponent(term)}`).catch(() => {})}
                    activeOpacity={0.7}
                  >
                    <Text style={s.readingLinkIcon}>🔗</Text>
                    <Text style={s.readingLinkText}>{term}</Text>
                    <Text style={s.readingArrow}>→</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </FadeIn>
        )}

        {/* Awareness */}
        {awarenessNote ? (
          <View style={s.awareCard}><Text style={s.awareText}>⭐ {awarenessNote}</Text></View>
        ) : null}

        {/* Why this question */}
        {reasoning ? (
          <TouchableOpacity onPress={() => setShowReasoning(!showReasoning)} style={s.whyRow}>
            <Text style={s.why}>{showReasoning ? '▾' : '▸'} Why Sharp asked this</Text>
            {showReasoning && <Text style={s.reasoningText}>{reasoning}</Text>}
          </TouchableOpacity>
        ) : null}

        <View style={s.divider} />

        {/* Actions */}
        {isPremium() ? (
          <TouchableOpacity style={s.mainBtn} onPress={() => {
            stopAudio();
            router.push({ pathname: '/one-shot/coaching', params: { original: p.snippetOriginal, problems: p.snippetProblems, rewrite: p.snippetRewrite, explanation: p.snippetExplanation } });
          }} activeOpacity={0.8}>
            <Text style={s.mainBtnText}>✨ Practice the sharper version</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[s.mainBtn, s.mainBtnLocked]} onPress={() => router.push('/premium')} activeOpacity={0.7}>
            <Text style={s.mainBtnText}>🔒 Practice the sharper version</Text>
            <Text style={s.mainBtnSub}>Try free for 7 days</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={s.ghostBtn} onPress={() => { stopAudio(); router.replace('/one-shot/question'); }} activeOpacity={0.7}>
          <Text style={s.ghostBtnText}>↻ New question</Text>
        </TouchableOpacity>

        <View style={s.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

function countFillers(arr: string[]): { word: string; count: number }[] {
  const map: Record<string, number> = {};
  arr.forEach(w => { map[w] = (map[w] || 0) + 1; });
  return Object.entries(map).map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count);
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  content: { padding: layout.screenPadding },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { fontSize: typography.size.title, fontWeight: typography.weight.black, color: colors.text.primary },
  close: { fontSize: fp(24), color: colors.text.muted, padding: spacing.sm, minWidth: wp(44), minHeight: wp(44), textAlign: 'center' },
  textOnlyBadge: { backgroundColor: colors.bg.tertiary, borderRadius: radius.pill, paddingHorizontal: wp(10), paddingVertical: wp(3) },
  textOnlyText: { fontSize: fp(10), fontWeight: typography.weight.semibold, color: colors.text.muted },

  scoreSection: { alignItems: 'center', marginBottom: spacing.xl },
  ring: { width: wp(100), height: wp(100), borderRadius: wp(50), borderWidth: wp(4), alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  scoreNum: { fontSize: fp(36), fontWeight: typography.weight.black, letterSpacing: -1.5 },
  scoreLbl: { fontSize: fp(10), fontWeight: typography.weight.bold, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.5 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  deltaBadge: { borderRadius: radius.pill, paddingHorizontal: wp(8), paddingVertical: wp(2) },
  deltaUp: { backgroundColor: colors.feedback.positiveBg },
  deltaDown: { backgroundColor: colors.feedback.negativeBg },
  deltaText: { fontSize: fp(10), fontWeight: typography.weight.bold },
  deltaUpText: { color: colors.success },
  deltaDownText: { color: colors.error },
  progressMsg: { fontSize: fp(10), fontWeight: typography.weight.semibold, color: colors.text.tertiary, marginTop: wp(3) },
  rawScore: { fontSize: fp(10), color: colors.text.muted, marginTop: wp(2) },

  card: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.lg, ...shadows.md, marginBottom: spacing.lg },
  dim: { flexDirection: 'row', alignItems: 'center', paddingVertical: wp(6) },
  dimSep: { borderTopWidth: 1.5, borderTopColor: colors.borderLight, marginTop: wp(4), paddingTop: wp(8) },
  dimName: { fontSize: fp(11), color: colors.text.tertiary, width: wp(75), fontWeight: typography.weight.semibold },
  dimTrack: { flex: 1, height: wp(8), backgroundColor: colors.borderLight, borderRadius: wp(4), marginHorizontal: wp(8), overflow: 'hidden' },
  dimFill: { height: '100%', borderRadius: wp(4) },
  dimVal: { fontSize: fp(14), fontWeight: typography.weight.black, width: wp(24), textAlign: 'right' },
  dimHelp: { fontSize: fp(11), color: colors.text.muted, marginLeft: wp(6), width: wp(14), textAlign: 'center' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(58,42,26,0.4)', alignItems: 'center', justifyContent: 'center', padding: layout.screenPadding },
  modalCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.xl, width: '100%', maxWidth: wp(380), ...shadows.lg },
  modalTitle: { fontSize: typography.size.title, fontWeight: typography.weight.black, color: colors.text.primary, marginBottom: spacing.sm },
  modalScore: { fontSize: typography.size.sm, color: colors.text.tertiary, marginBottom: spacing.lg },
  modalSection: { fontSize: fp(10), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.5, marginTop: spacing.md, marginBottom: spacing.sm },
  modalText: { fontSize: typography.size.sm, color: colors.text.primary, lineHeight: fp(20) },
  modalClose: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(13), alignItems: 'center', marginTop: spacing.xl, ...shadows.accent },
  modalCloseText: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.text.inverse },

  section: { fontSize: fp(10), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 2, marginBottom: spacing.md },

  positiveCard: { backgroundColor: colors.feedback.positiveBg, borderWidth: 1.5, borderColor: colors.feedback.positiveBorder, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  positiveText: { fontSize: typography.size.sm, color: colors.text.primary, lineHeight: fp(20), fontWeight: typography.weight.semibold },
  posListenBtn: { fontSize: fp(10), fontWeight: typography.weight.bold, color: colors.success },
  improveCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, ...shadows.sm },
  feedbackHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  feedbackEmoji: { fontSize: fp(14) },
  listenBtn: { fontSize: fp(10), fontWeight: typography.weight.bold, color: colors.accent.primary },
  feedbackText: { fontSize: typography.size.sm, color: colors.text.secondary, lineHeight: fp(20) },

  insightCard: { backgroundColor: colors.daily.bg, borderWidth: 1.5, borderColor: colors.daily.border, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg },
  insightText: { fontSize: typography.size.base, color: colors.text.primary, lineHeight: fp(22), fontWeight: typography.weight.bold },

  modelCard: { backgroundColor: colors.feedback.positiveBg, borderWidth: 1.5, borderColor: colors.feedback.positiveBorder, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.lg, ...shadows.sm },
  modelListenBtn: { fontSize: fp(10), fontWeight: typography.weight.bold, color: colors.success },
  modelText: { fontSize: typography.size.base, color: colors.text.primary, lineHeight: fp(22), fontStyle: 'italic' },
  modelHint: { fontSize: fp(10), color: colors.text.muted, marginTop: spacing.sm },

  // Your own recording. Sits next to the model answer. Tertiary bg so it
  // visually anchors "this is mine" before the green model "this is sharper".
  ownCard: { backgroundColor: colors.bg.tertiary, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.md, ...shadows.sm },
  ownListenBtn: { fontSize: fp(10), fontWeight: typography.weight.bold, color: colors.accent.primary },
  ownText: { fontSize: typography.size.base, color: colors.text.secondary, lineHeight: fp(22), fontStyle: 'italic' },
  ownHint: { fontSize: fp(10), color: colors.text.muted, marginTop: spacing.sm },

  // Model answer (LOCKED for free users). Same visual weight as the unlocked
  // card but cream bg + terracotta accent CTA instead of green. Reads as a
  // "this could be yours" upsell, not a flat paywall block.
  modelLockedCard: { backgroundColor: colors.bg.tertiary, borderWidth: 1.5, borderColor: colors.accent.border, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.lg, ...shadows.sm },
  modelLockedCta: { fontSize: fp(11), fontWeight: typography.weight.black, color: colors.accent.primary },
  modelLockedTitle: { fontSize: typography.size.md, fontWeight: typography.weight.black, color: colors.text.primary, marginBottom: spacing.xs, letterSpacing: -0.2 },
  modelLockedDesc: { fontSize: typography.size.xs, color: colors.text.tertiary, lineHeight: fp(18) },

  tipCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, ...shadows.sm },
  tipLabel: { fontSize: fp(10), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.5, marginBottom: spacing.sm },
  tipText: { fontSize: typography.size.sm, color: colors.text.secondary, lineHeight: fp(20) },

  anglesCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, ...shadows.sm },
  angleRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  angleBullet: { fontSize: typography.size.sm, color: colors.accent.primary, fontWeight: typography.weight.bold },
  angleText: { fontSize: typography.size.sm, color: colors.text.secondary, lineHeight: fp(20), flex: 1 },

  fillerSection: { marginBottom: spacing.md },
  fillerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: wp(4), marginTop: spacing.sm },
  fillerPill: { backgroundColor: colors.feedback.negativeBg, borderWidth: 1.5, borderColor: colors.feedback.negativeBorder, borderRadius: radius.sm, paddingHorizontal: wp(8), paddingVertical: wp(3) },
  fillerText: { fontSize: fp(10), fontWeight: typography.weight.bold, color: colors.error },

  awareCard: { backgroundColor: colors.daily.bg, borderWidth: 1.5, borderColor: colors.daily.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  awareText: { fontSize: fp(10), fontWeight: typography.weight.bold, color: colors.accent.primary },

  readingCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.lg, borderWidth: 1.5, borderColor: colors.borderLight, ...shadows.md },
  readingHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  readingEmoji: { fontSize: fp(16) },
  readingLabel: { fontSize: fp(11), fontWeight: typography.weight.black, color: colors.text.primary, textTransform: 'uppercase' as const, letterSpacing: 1 },
  readingReason: { fontSize: typography.size.sm, color: colors.text.secondary, lineHeight: fp(20), marginBottom: spacing.md },
  readingLinks: { gap: spacing.sm },
  readingLink: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg.tertiary, borderRadius: radius.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.md, gap: spacing.sm },
  readingLinkIcon: { fontSize: fp(12) },
  readingLinkText: { fontSize: typography.size.sm, color: colors.accent.primary, fontWeight: typography.weight.semibold, flex: 1 },
  readingArrow: { fontSize: fp(12), color: colors.text.muted },

  whyRow: { marginBottom: spacing.md },
  why: { fontSize: fp(10), color: colors.text.muted, fontWeight: typography.weight.semibold },
  reasoningText: { fontSize: fp(10), color: colors.text.secondary, lineHeight: fp(16), marginTop: spacing.sm },

  divider: { height: 1.5, backgroundColor: colors.borderLight, marginVertical: spacing.lg },

  mainBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(16), alignItems: 'center', marginBottom: spacing.sm, ...shadows.accent },
  mainBtnDisabled: { opacity: 0.4 },
  mainBtnLocked: { backgroundColor: colors.text.muted },
  mainBtnText: { fontSize: fp(13), fontWeight: typography.weight.bold, color: colors.text.inverse },
  mainBtnSub: { fontSize: fp(10), color: 'rgba(255,255,255,0.7)', marginTop: wp(2) },
  ghostBtn: { backgroundColor: colors.bg.secondary, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: wp(13), alignItems: 'center' },
  ghostBtnText: { fontSize: fp(11), fontWeight: typography.weight.semibold, color: colors.text.tertiary },

  bottomSpacer: { height: wp(30) },
});
