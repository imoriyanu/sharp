import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, getScoreColor, wp, fp, shadows, layout } from '../../src/constants/theme';
import { playQuestionAudio, stopAudio } from '../../src/services/tts';
import { getSessionById } from '../../src/services/storage';
import { isPremium, canDoOneShot, trackOneShotUsage } from '../../src/services/premium';
import type { Session, Turn } from '../../src/types';

const DIM_LABELS: Record<string, string> = { structure: 'Structure', concision: 'Concision', substance: 'Substance', fillerWords: 'Filler Words', awareness: 'Awareness' };

export default function SessionDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [oneShotStatus, setOneShotStatus] = useState<{ allowed: boolean; used: number; limit: number } | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    if (id) getSessionById(id).then(s => { if (mountedRef.current) setSession(s); });
    canDoOneShot().then(s => { if (mountedRef.current) setOneShotStatus(s); });
    return () => { mountedRef.current = false; stopAudio(); };
  }, [id]);

  async function play(key: string, text: string) {
    if (playing === key) { stopAudio(); setPlaying(null); return; }
    setPlaying(key);
    await stopAudio();
    await playQuestionAudio(text);
    if (mountedRef.current) setPlaying(null);
  }

  if (!session) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.centered}>
          <Text style={s.loadingText}>Loading session...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const typeLabel = session.type === 'daily_30' ? 'Daily Challenge' : session.type === 'threaded' ? 'Threaded' : session.type === 'duel' ? 'Duel' : 'One Shot';

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Text style={s.title}>Session</Text>
          <TouchableOpacity onPress={() => { stopAudio(); router.back(); }}><Text style={s.close}>×</Text></TouchableOpacity>
        </View>

        <View style={s.metaRow}>
          <View style={s.typeBadge}><Text style={s.typeText}>{typeLabel}</Text></View>
          <Text style={s.dateText}>{new Date(session.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
        </View>

        {session.turns.map((turn, i) => (
          <TurnCard key={turn.id} turn={turn} index={i} totalTurns={session.turns.length} playing={playing} play={play} />
        ))}

        {oneShotStatus?.allowed ? (
          <TouchableOpacity style={s.retryBtn} onPress={async () => {
            stopAudio();
            await trackOneShotUsage();
            router.replace('/one-shot/question');
          }} activeOpacity={0.8}>
            <Text style={s.retryBtnText}>Practice again</Text>
            {isPremium() && <Text style={s.retryBtnSub}>{oneShotStatus.limit - oneShotStatus.used} remaining today</Text>}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[s.retryBtn, s.retryBtnLocked]} onPress={() => router.push('/premium')} activeOpacity={0.7}>
            <Text style={s.retryBtnText}>{isPremium() ? 'Daily limit reached' : '🔒 Practice again'}</Text>
            <Text style={s.retryBtnSub}>{isPremium() ? 'Resets tomorrow' : 'Upgrade to Pro'}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={s.ghostBtn} onPress={() => { stopAudio(); router.back(); }} activeOpacity={0.7}>
          <Text style={s.ghostBtnText}>Back</Text>
        </TouchableOpacity>

        <View style={s.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

function TurnCard({ turn, index, totalTurns, playing, play }: {
  turn: Turn; index: number; totalTurns: number;
  playing: string | null;
  play: (key: string, text: string) => void;
}) {
  return (
    <View style={s.turnCard}>
      {totalTurns > 1 && <Text style={s.turnLabel}>Turn {turn.turnNumber}</Text>}

      {/* Question */}
      <View style={s.qBox}>
        <Text style={s.qLabel}>Question</Text>
        <Text style={s.qText}>{turn.question}</Text>
      </View>

      {/* Score */}
      <View style={s.scoreRow}>
        <Text style={[s.turnScore, { color: getScoreColor(turn.overall) }]}>{turn.overall.toFixed(1)}</Text>
        <View style={s.miniDims}>
          {(['structure', 'concision', 'substance', 'fillerWords'] as const).map(dim => (
            <View key={dim} style={s.miniDim}>
              <Text style={s.miniLabel}>{DIM_LABELS[dim].slice(0, 4)}</Text>
              <Text style={[s.miniVal, { color: getScoreColor(turn.scores[dim]) }]}>{turn.scores[dim]}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Your response — listenable */}
      <TouchableOpacity style={s.responseBox} onPress={() => play(`resp-${index}`, turn.transcript)} activeOpacity={0.7}>
        <View style={s.responseHeader}>
          <Text style={s.responseLabel}>Your response</Text>
          <Text style={s.playBtn}>{playing === `resp-${index}` ? '⏸' : '🔊'}</Text>
        </View>
        <Text style={s.responseText} numberOfLines={4}>"{turn.transcript}"</Text>
      </TouchableOpacity>

      {/* Model answer — listenable */}
      {turn.modelAnswer ? (
        <TouchableOpacity style={s.modelBox} onPress={() => play(`model-${index}`, turn.modelAnswer!)} activeOpacity={0.7}>
          <View style={s.responseHeader}>
            <Text style={s.modelLabel}>Model answer</Text>
            <Text style={s.playBtn}>{playing === `model-${index}` ? '⏸' : '🔊'}</Text>
          </View>
          <Text style={s.modelText} numberOfLines={4}>"{turn.modelAnswer}"</Text>
        </TouchableOpacity>
      ) : null}

      {/* Coaching insight */}
      <TouchableOpacity style={s.insightBox} onPress={() => play(`insight-${index}`, turn.coachingInsight)} activeOpacity={0.7}>
        <Text style={s.insightText}>💡 {turn.coachingInsight}</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  content: { padding: layout.screenPadding },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: typography.size.sm, color: colors.text.muted },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  title: { fontSize: typography.size.title, fontWeight: typography.weight.black, color: colors.text.primary },
  close: { fontSize: fp(22), color: colors.text.muted },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xl },
  typeBadge: { backgroundColor: colors.accent.light, borderRadius: radius.pill, paddingHorizontal: wp(10), paddingVertical: wp(4) },
  typeText: { fontSize: fp(10), fontWeight: typography.weight.bold, color: colors.accent.primary },
  dateText: { fontSize: typography.size.xs, color: colors.text.muted },

  // Turn card
  turnCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.lg, ...shadows.md },
  turnLabel: { fontSize: fp(9), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.5, marginBottom: spacing.md },

  qBox: { marginBottom: spacing.md },
  qLabel: { fontSize: fp(9), fontWeight: typography.weight.bold, color: colors.text.muted, marginBottom: wp(3) },
  qText: { fontSize: typography.size.sm, color: colors.text.primary, fontWeight: typography.weight.semibold, lineHeight: fp(20) },

  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginBottom: spacing.md, paddingVertical: spacing.sm, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.borderLight },
  turnScore: { fontSize: fp(28), fontWeight: typography.weight.black, letterSpacing: -1 },
  miniDims: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  miniDim: { alignItems: 'center' },
  miniLabel: { fontSize: fp(8), color: colors.text.muted, fontWeight: typography.weight.semibold },
  miniVal: { fontSize: fp(12), fontWeight: typography.weight.black },

  responseBox: { backgroundColor: colors.bg.tertiary, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  responseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: wp(4) },
  responseLabel: { fontSize: fp(9), fontWeight: typography.weight.bold, color: colors.text.muted },
  playBtn: { fontSize: fp(14) },
  responseText: { fontSize: typography.size.sm, color: colors.text.secondary, fontStyle: 'italic', lineHeight: fp(20) },

  modelBox: { backgroundColor: colors.feedback.positiveBg, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  modelLabel: { fontSize: fp(9), fontWeight: typography.weight.bold, color: colors.success },
  modelText: { fontSize: typography.size.sm, color: colors.text.primary, fontStyle: 'italic', lineHeight: fp(20) },

  insightBox: { backgroundColor: colors.daily.bg, borderRadius: radius.md, padding: spacing.md },
  insightText: { fontSize: typography.size.xs, color: colors.text.primary, fontWeight: typography.weight.bold, lineHeight: fp(18) },

  retryBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(15), alignItems: 'center', marginBottom: spacing.sm, ...shadows.accent },
  retryBtnLocked: { backgroundColor: colors.text.muted, shadowOpacity: 0 },
  retryBtnText: { fontSize: fp(13), fontWeight: typography.weight.bold, color: colors.text.inverse },
  retryBtnSub: { fontSize: fp(9), color: 'rgba(255,255,255,0.7)', marginTop: wp(2) },
  ghostBtn: { backgroundColor: colors.bg.secondary, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: wp(13), alignItems: 'center' },
  ghostBtnText: { fontSize: fp(11), fontWeight: typography.weight.semibold, color: colors.text.tertiary },

  bottomSpacer: { height: wp(30) },
});
