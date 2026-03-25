import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect } from 'react';
import { colors, typography, spacing, radius, getScoreColor, wp, fp, shadows, layout } from '../../src/constants/theme';
import { ScoreReveal, FadeIn } from '../../src/components/Animations';
import { playQuestionAudio, stopAudio } from '../../src/services/tts';
import { saveSession, generateId } from '../../src/services/storage';
import { isPremium, canPracticeAgain, trackPracticeAgainUsage } from '../../src/services/premium';

const DIMS = ['structure', 'concision', 'substance', 'fillerWords', 'awareness'] as const;
const DIM_LABELS: Record<string, string> = { structure: 'Structure', concision: 'Concision', substance: 'Substance', fillerWords: 'Filler Words', awareness: 'Awareness' };

export default function ResultsScreen() {
  const router = useRouter();
  const p = useLocalSearchParams();
  const scores = JSON.parse((p.scores as string) || '{}');
  const overall = parseFloat((p.overall as string) || '0');
  const summary = (p.summary as string) || '';
  const positives = (p.positives as string) || '';
  const improvements = (p.improvements as string) || '';
  const insight = (p.coachingInsight as string) || '';
  const awarenessNote = (p.awarenessNote as string) || '';
  const fillers = JSON.parse((p.fillerWordsFound as string) || '[]');
  const fillerCount = parseInt((p.fillerCount as string) || '0');
  const question = (p.question as string) || '';
  const reasoning = (p.reasoning as string) || '';
  const transcript = (p.transcript as string) || '';
  const recordingUri = (p.recordingUri as string) || '';
  const modelAnswer = (p.modelAnswer as string) || '';
  const communicationTip = (p.communicationTip as string) || '';
  const suggestedAngles: string[] = p.suggestedAngles ? JSON.parse(p.suggestedAngles as string) : [];
  const rewrite = (p.snippetRewrite as string) || '';

  const [playing, setPlaying] = React.useState<string | null>(null);
  const [showReasoning, setShowReasoning] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [practiceRemaining, setPracticeRemaining] = React.useState<number | null>(null);
  const mountedRef = React.useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    speakFullFeedback();
    saveFullSession();
    checkPracticeRemaining();
    return () => { mountedRef.current = false; stopAudio(); };
  }, []);

  async function checkPracticeRemaining() {
    if (!isPremium()) { setPracticeRemaining(0); return; }
    const { limit, used } = await canPracticeAgain();
    setPracticeRemaining(limit - used);
  }

  async function saveFullSession() {
    if (saved) return;
    setSaved(true);
    await saveSession({
      id: generateId(), type: (p.mode as string) === 'threaded' ? 'threaded' : 'one_shot',
      scenario: question.slice(0, 50),
      turns: [{
        id: generateId(), turnNumber: 1, question, questionReasoning: reasoning,
        questionTargets: 'substance', questionDifficulty: 5,
        transcript, recordingUri, modelAnswer,
        scores, overall, summary, coachingInsight: insight,
        awarenessNote, snippet: {
          original: (p.snippetOriginal as string) || '', problems: JSON.parse((p.snippetProblems as string) || '[]'),
          rewrite, explanation: (p.snippetExplanation as string) || '',
        },
      }],
      createdAt: new Date().toISOString(),
    });
  }

  async function speakFullFeedback() {
    const scoreWord = overall >= 7.5 ? 'Really solid work.' : overall >= 5.5 ? 'OK, not bad.' : 'Alright, let\'s break this down.';
    const positivePart = positives || 'You made an effort and that counts.';
    const improvePart = improvements ? `Now, ${improvements}` : '';
    const insightPart = insight ? `Here's the key takeaway: ${insight}` : '';

    const spoken = `${scoreWord} ${positivePart} ${improvePart} ${insightPart}`;
    if (!mountedRef.current) return;
    setPlaying('feedback');
    await playQuestionAudio(spoken);
    if (mountedRef.current) setPlaying(null);
  }

  async function play(key: string, text: string) {
    if (playing === key) { stopAudio(); setPlaying(null); return; }
    if (!mountedRef.current) return;
    setPlaying(key);
    await stopAudio();
    const spoken = key === 'model' ? `Here's how I'd say it. ${text}` : text;
    await playQuestionAudio(spoken);
    if (mountedRef.current) setPlaying(null);
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.title}>Results</Text>
          <TouchableOpacity onPress={() => { stopAudio(); router.replace('/(tabs)'); }}><Text style={s.close}>×</Text></TouchableOpacity>
        </View>

        {/* Score */}
        <FadeIn delay={0}>
          <View style={s.scoreSection}>
            <View style={[s.ring, { borderColor: getScoreColor(overall) }]}>
              <ScoreReveal score={overall} color={getScoreColor(overall)} />
            </View>
            <Text style={s.scoreLbl}>Overall Score</Text>
          </View>
        </FadeIn>

        {/* Dimensions */}
        <FadeIn delay={200}>
          <View style={s.card}>
            {DIMS.map((dim) => {
              const val = scores[dim] || 0;
              return (
                <View key={dim} style={[s.dim, dim === 'awareness' && s.dimSep]}>
                  <Text style={s.dimName}>{DIM_LABELS[dim]}</Text>
                  <View style={s.dimTrack}><View style={[s.dimFill, { width: `${val * 10}%`, backgroundColor: getScoreColor(val) }]} /></View>
                  <Text style={[s.dimVal, { color: getScoreColor(val) }]}>{val}</Text>
                </View>
              );
            })}
          </View>
        </FadeIn>

        {/* What went well */}
        {positives ? (
          <FadeIn delay={400}>
            <Text style={s.section}>What went well</Text>
            <TouchableOpacity style={s.positiveCard} onPress={() => play('positives', positives)} activeOpacity={0.7}>
              <View style={s.feedbackHeader}>
                <Text style={s.feedbackEmoji}>✅</Text>
                <Text style={s.posListenBtn}>{playing === 'positives' ? '⏸ Pause' : '🔊 Listen'}</Text>
              </View>
              <Text style={s.positiveText}>{positives}</Text>
            </TouchableOpacity>
          </FadeIn>
        ) : null}

        {/* What to improve */}
        {improvements ? (
          <FadeIn delay={500}>
            <Text style={s.section}>To work on</Text>
            <TouchableOpacity style={s.improveCard} onPress={() => play('improvements', improvements)} activeOpacity={0.7}>
              <View style={s.feedbackHeader}>
                <Text style={s.feedbackEmoji}>🎯</Text>
                <Text style={s.listenBtn}>{playing === 'improvements' ? '⏸ Pause' : '🔊 Listen'}</Text>
              </View>
              <Text style={s.feedbackText}>{improvements}</Text>
            </TouchableOpacity>
          </FadeIn>
        ) : null}

        {/* Coaching insight */}
        {insight ? (
          <FadeIn delay={400}>
            <TouchableOpacity style={s.insightCard} onPress={() => play('insight', insight)} activeOpacity={0.7}>
              <View style={s.feedbackHeader}>
                <Text style={s.feedbackEmoji}>💡</Text>
                <Text style={s.listenBtn}>{playing === 'insight' ? '⏸ Pause' : '🔊 Listen'}</Text>
              </View>
              <Text style={s.insightText}>{insight}</Text>
            </TouchableOpacity>
          </FadeIn>
        ) : null}

        {/* Model answer — the star feature */}
        {modelAnswer ? (
          <FadeIn delay={600}>
            <Text style={s.section}>Model Answer</Text>
            <TouchableOpacity style={s.modelCard} onPress={() => play('model', modelAnswer)} activeOpacity={0.7}>
              <View style={s.feedbackHeader}>
                <Text style={s.feedbackEmoji}>✨</Text>
                <Text style={s.modelListenBtn}>{playing === 'model' ? '⏸ Pause' : '🔊 Listen to model'}</Text>
              </View>
              <Text style={s.modelText}>"{modelAnswer}"</Text>
              <Text style={s.modelHint}>Built from your response — this is what a 9/10 sounds like</Text>
            </TouchableOpacity>
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
        {fillerCount > 0 && (
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
        {isPremium() && practiceRemaining !== null && practiceRemaining > 0 ? (
          <TouchableOpacity style={s.mainBtn} onPress={async () => {
            await trackPracticeAgainUsage();
            setPracticeRemaining(prev => (prev || 1) - 1);
            stopAudio();
            router.push({ pathname: '/one-shot/coaching', params: { original: p.snippetOriginal, problems: p.snippetProblems, rewrite: p.snippetRewrite, explanation: p.snippetExplanation } });
          }} activeOpacity={0.8}>
            <Text style={s.mainBtnText}>✨ Practice the sharper version</Text>
            <Text style={s.mainBtnSub}>{practiceRemaining} practice{practiceRemaining !== 1 ? 's' : ''} remaining today</Text>
          </TouchableOpacity>
        ) : isPremium() && practiceRemaining === 0 ? (
          <View style={[s.mainBtn, s.mainBtnDisabled]}>
            <Text style={s.mainBtnText}>Practice limit reached</Text>
            <Text style={s.mainBtnSub}>Resets tomorrow</Text>
          </View>
        ) : (
          <TouchableOpacity style={[s.mainBtn, s.mainBtnLocked]} onPress={() => router.push('/premium')} activeOpacity={0.7}>
            <Text style={s.mainBtnText}>🔒 Practice the sharper version</Text>
            <Text style={s.mainBtnSub}>Upgrade to Pro</Text>
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
  title: { fontSize: typography.size.title, fontWeight: typography.weight.black, color: colors.text.primary },
  close: { fontSize: fp(22), color: colors.text.muted },

  scoreSection: { alignItems: 'center', marginBottom: spacing.xl },
  ring: { width: wp(100), height: wp(100), borderRadius: wp(50), borderWidth: wp(4), alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  scoreNum: { fontSize: fp(36), fontWeight: typography.weight.black, letterSpacing: -1.5 },
  scoreLbl: { fontSize: fp(9), fontWeight: typography.weight.bold, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.5 },

  card: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.lg, ...shadows.md, marginBottom: spacing.lg },
  dim: { flexDirection: 'row', alignItems: 'center', paddingVertical: wp(6) },
  dimSep: { borderTopWidth: 1.5, borderTopColor: colors.borderLight, marginTop: wp(4), paddingTop: wp(8) },
  dimName: { fontSize: fp(11), color: colors.text.tertiary, width: wp(75), fontWeight: typography.weight.semibold },
  dimTrack: { flex: 1, height: wp(6), backgroundColor: colors.borderLight, borderRadius: wp(3), marginHorizontal: wp(8), overflow: 'hidden' },
  dimFill: { height: '100%', borderRadius: wp(3) },
  dimVal: { fontSize: fp(14), fontWeight: typography.weight.black, width: wp(24), textAlign: 'right' },

  section: { fontSize: fp(10), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 2, marginBottom: spacing.md },

  positiveCard: { backgroundColor: colors.feedback.positiveBg, borderWidth: 1.5, borderColor: colors.feedback.positiveBorder, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  positiveText: { fontSize: typography.size.sm, color: colors.text.primary, lineHeight: fp(20), fontWeight: typography.weight.semibold },
  posListenBtn: { fontSize: fp(9), fontWeight: typography.weight.bold, color: colors.success },
  improveCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, ...shadows.sm },
  feedbackHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  feedbackEmoji: { fontSize: fp(14) },
  listenBtn: { fontSize: fp(9), fontWeight: typography.weight.bold, color: colors.accent.primary },
  feedbackText: { fontSize: typography.size.sm, color: colors.text.secondary, lineHeight: fp(20) },

  insightCard: { backgroundColor: colors.daily.bg, borderWidth: 1.5, borderColor: colors.daily.border, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg },
  insightText: { fontSize: typography.size.base, color: colors.text.primary, lineHeight: fp(22), fontWeight: typography.weight.bold },

  modelCard: { backgroundColor: colors.feedback.positiveBg, borderWidth: 1.5, borderColor: colors.feedback.positiveBorder, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.lg, ...shadows.sm },
  modelListenBtn: { fontSize: fp(9), fontWeight: typography.weight.bold, color: colors.success },
  modelText: { fontSize: typography.size.base, color: colors.text.primary, lineHeight: fp(22), fontStyle: 'italic' },
  modelHint: { fontSize: fp(9), color: colors.text.muted, marginTop: spacing.sm },

  tipCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, ...shadows.sm },
  tipLabel: { fontSize: fp(9), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.5, marginBottom: spacing.sm },
  tipText: { fontSize: typography.size.sm, color: colors.text.secondary, lineHeight: fp(20) },

  anglesCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, ...shadows.sm },
  angleRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  angleBullet: { fontSize: typography.size.sm, color: colors.accent.primary, fontWeight: typography.weight.bold },
  angleText: { fontSize: typography.size.sm, color: colors.text.secondary, lineHeight: fp(20), flex: 1 },

  fillerSection: { marginBottom: spacing.md },
  fillerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: wp(4), marginTop: spacing.sm },
  fillerPill: { backgroundColor: colors.feedback.negativeBg, borderWidth: 1.5, borderColor: colors.feedback.negativeBorder, borderRadius: radius.sm, paddingHorizontal: wp(8), paddingVertical: wp(3) },
  fillerText: { fontSize: fp(9), fontWeight: typography.weight.bold, color: colors.error },

  awareCard: { backgroundColor: colors.daily.bg, borderWidth: 1.5, borderColor: colors.daily.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  awareText: { fontSize: fp(10), fontWeight: typography.weight.bold, color: colors.accent.primary },

  whyRow: { marginBottom: spacing.md },
  why: { fontSize: fp(10), color: colors.text.muted, fontWeight: typography.weight.semibold },
  reasoningText: { fontSize: fp(10), color: colors.text.secondary, lineHeight: fp(16), marginTop: spacing.sm },

  divider: { height: 1.5, backgroundColor: colors.borderLight, marginVertical: spacing.lg },

  mainBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(15), alignItems: 'center', marginBottom: spacing.sm, ...shadows.accent },
  mainBtnDisabled: { opacity: 0.4 },
  mainBtnLocked: { backgroundColor: colors.text.muted },
  mainBtnText: { fontSize: fp(13), fontWeight: typography.weight.bold, color: colors.text.inverse },
  mainBtnSub: { fontSize: fp(9), color: 'rgba(255,255,255,0.7)', marginTop: wp(2) },
  ghostBtn: { backgroundColor: colors.bg.secondary, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: wp(13), alignItems: 'center' },
  ghostBtnText: { fontSize: fp(11), fontWeight: typography.weight.semibold, color: colors.text.tertiary },

  bottomSpacer: { height: wp(30) },
});
