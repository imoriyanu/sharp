import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, layout, getScoreColor, wp, fp } from '../../src/constants/theme';
import { ScoreReveal, FadeIn } from '../../src/components/Animations';
import { playQuestionAudio, stopAudio } from '../../src/services/tts';
import { getStreak, getBestScoreThisWeek } from '../../src/services/storage';
import type { StreakBadge } from '../../src/types';

export default function DailyResultScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    score: string; insight: string; question: string;
    communicationTip: string; suggestedAngles: string; summary: string; newBadge: string;
  }>();
  const score = parseFloat(params.score || '0');
  const insight = params.insight || '';
  const summary = params.summary || '';
  const communicationTip = params.communicationTip || '';
  const suggestedAngles: string[] = params.suggestedAngles ? JSON.parse(params.suggestedAngles) : [];
  const newBadge: StreakBadge | null = params.newBadge ? JSON.parse(params.newBadge) : null;

  const [streak, setStreak] = useState(0);
  const [bestWeek, setBestWeek] = useState(0);
  const [speakingInsight, setSpeakingInsight] = useState(false);

  useEffect(() => {
    getStreak().then(s => setStreak(s.currentStreak));
    getBestScoreThisWeek().then(setBestWeek);
    if (insight) {
      setSpeakingInsight(true);
      playQuestionAudio(insight).then(() => setSpeakingInsight(false));
    }
    return () => { stopAudio(); };
  }, []);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.badgeRow}>
          <View style={s.badge}><Text style={s.badgeText}>Day {streak}</Text></View>
        </View>

        {newBadge && (
          <FadeIn delay={0}>
            <View style={s.newBadgeCard}>
              <Text style={s.newBadgeEmoji}>{newBadge.emoji}</Text>
              <Text style={s.newBadgeTitle}>Badge Unlocked!</Text>
              <Text style={s.newBadgeName}>{newBadge.name}</Text>
              <Text style={s.newBadgeDesc}>{newBadge.description}</Text>
            </View>
          </FadeIn>
        )}

        <FadeIn delay={100}>
          <View style={s.ring}>
            <ScoreReveal score={score} color={getScoreColor(score)} />
          </View>
          <Text style={s.scoreLbl}>Today's Score</Text>
        </FadeIn>

        {summary ? (
          <FadeIn delay={200}>
            <View style={s.summaryCard}><Text style={s.summaryText}>{summary}</Text></View>
          </FadeIn>
        ) : null}

        {insight ? (
          <FadeIn delay={300}>
            <TouchableOpacity style={s.insightCard} onPress={() => {
              if (speakingInsight) { stopAudio(); setSpeakingInsight(false); }
              else { setSpeakingInsight(true); playQuestionAudio(insight).then(() => setSpeakingInsight(false)); }
            }} activeOpacity={0.7}>
              <View style={s.insightHeader}>
                <Text style={s.insightEmoji}>💡</Text>
                <Text style={s.insightListen}>{speakingInsight ? '⏸ Pause' : '🔊 Listen'}</Text>
              </View>
              <Text style={s.insightText}>{insight}</Text>
            </TouchableOpacity>
          </FadeIn>
        ) : null}

        {communicationTip ? (
          <FadeIn delay={400}>
            <View style={s.tipCard}>
              <Text style={s.tipLabel}>Communication tip</Text>
              <Text style={s.tipText}>{communicationTip}</Text>
            </View>
          </FadeIn>
        ) : null}

        {suggestedAngles.length > 0 && (
          <FadeIn delay={500}>
            <View style={s.anglesCard}>
              <Text style={s.anglesLabel}>Other ways to approach this</Text>
              {suggestedAngles.map((angle, i) => (
                <View key={i} style={s.angleRow}>
                  <Text style={s.angleBullet}>→</Text>
                  <Text style={s.angleText}>{angle}</Text>
                </View>
              ))}
            </View>
          </FadeIn>
        )}

        <FadeIn delay={600}>
          <View style={s.streakCard}>
            <Text style={s.streakNum}>{streak} 🔥</Text>
            <Text style={s.streakLabel}>Day streak</Text>
            {bestWeek > 0 && <Text style={s.streakBest}>Best this week: {bestWeek.toFixed(1)}</Text>}
          </View>
        </FadeIn>

        <TouchableOpacity style={s.streakBtn} onPress={() => router.push('/streak')} activeOpacity={0.7}>
          <Text style={s.streakBtnText}>View badges & journey</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.doneBtn} onPress={() => { stopAudio(); router.replace('/(tabs)'); }} activeOpacity={0.8}>
          <Text style={s.doneBtnText}>Done</Text>
        </TouchableOpacity>

        <View style={s.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  content: { padding: layout.screenPadding },
  badgeRow: { alignItems: 'center', marginBottom: spacing.xl },
  badge: { backgroundColor: colors.daily.bg, borderRadius: radius.pill, paddingHorizontal: wp(14), paddingVertical: wp(5) },
  badgeText: { fontSize: typography.size.sm, fontWeight: typography.weight.bold, color: colors.daily.text },

  newBadgeCard: { backgroundColor: colors.streak.bg, borderWidth: 1.5, borderColor: colors.streak.border, borderRadius: radius.xl, padding: spacing.xl, alignItems: 'center', marginBottom: spacing.xl, ...shadows.md },
  newBadgeEmoji: { fontSize: fp(36), marginBottom: spacing.sm },
  newBadgeTitle: { fontSize: typography.size.md, fontWeight: typography.weight.black, color: colors.accent.primary },
  newBadgeName: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.streak.gold, marginTop: spacing.xs },
  newBadgeDesc: { fontSize: typography.size.xs, color: colors.text.tertiary, marginTop: spacing.xs },

  ring: { width: wp(100), height: wp(100), borderRadius: wp(50), borderWidth: wp(4), borderColor: colors.borderLight, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: spacing.xs },
  scoreNum: { fontSize: fp(36), fontWeight: typography.weight.black, letterSpacing: -1.5 },
  scoreLbl: { fontSize: fp(9), fontWeight: typography.weight.bold, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.5, textAlign: 'center', marginBottom: spacing.xl },

  summaryCard: { backgroundColor: colors.bg.tertiary, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  summaryText: { fontSize: typography.size.sm, color: colors.text.secondary, lineHeight: fp(20) },

  insightCard: { backgroundColor: colors.daily.bg, borderWidth: 1.5, borderColor: colors.daily.border, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md },
  insightHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  insightEmoji: { fontSize: fp(14) },
  insightListen: { fontSize: fp(9), fontWeight: typography.weight.bold, color: colors.accent.primary },
  insightText: { fontSize: typography.size.base, color: colors.text.primary, lineHeight: fp(22), fontWeight: typography.weight.bold },

  tipCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, ...shadows.sm },
  tipLabel: { fontSize: fp(9), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.5, marginBottom: spacing.sm },
  tipText: { fontSize: typography.size.sm, color: colors.text.secondary, lineHeight: fp(20) },

  anglesCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.xl, ...shadows.sm },
  anglesLabel: { fontSize: fp(9), fontWeight: typography.weight.black, color: colors.text.muted, textTransform: 'uppercase' as const, letterSpacing: 1.5, marginBottom: spacing.md },
  angleRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  angleBullet: { fontSize: typography.size.sm, color: colors.accent.primary, fontWeight: typography.weight.bold },
  angleText: { fontSize: typography.size.sm, color: colors.text.secondary, lineHeight: fp(20), flex: 1 },

  streakCard: { backgroundColor: colors.bg.secondary, borderRadius: radius.lg, padding: spacing.lg, alignItems: 'center', marginBottom: spacing.md, ...shadows.sm },
  streakNum: { fontSize: fp(28), fontWeight: typography.weight.black, color: colors.accent.primary },
  streakLabel: { fontSize: typography.size.xs, fontWeight: typography.weight.bold, color: colors.text.muted, marginTop: 2 },
  streakBest: { fontSize: typography.size.xs, color: colors.text.muted, marginTop: spacing.xs },

  streakBtn: { backgroundColor: colors.streak.bg, borderWidth: 1.5, borderColor: colors.streak.border, borderRadius: radius.lg, paddingVertical: wp(13), alignItems: 'center', marginBottom: spacing.sm },
  streakBtnText: { fontSize: typography.size.sm, fontWeight: typography.weight.bold, color: colors.accent.primary },

  doneBtn: { backgroundColor: colors.bg.secondary, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: wp(13), alignItems: 'center' },
  doneBtnText: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.text.tertiary },

  bottomSpacer: { height: wp(20) },
});
