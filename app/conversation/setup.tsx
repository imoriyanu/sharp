import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, layout, wp, fp } from '../../src/constants/theme';
import { FadeIn } from '../../src/components/Animations';
import { getContext, generateId, saveConversationState, getActiveUpcomingEvents } from '../../src/services/storage';
import { apiPost } from '../../src/services/api';
import { isPremium, canDoConversation, trackConversationUsage } from '../../src/services/premium';
import type { ConversationScenario, ConversationState, UserContext } from '../../src/types';

const SCENARIOS: { id: ConversationScenario; title: string; subtitle: string; icon: string }[] = [
  { id: 'job_interview', title: 'Job Interview', subtitle: 'Practice answering tough interview questions', icon: '💼' },
  { id: 'salary_negotiation', title: 'Salary Negotiation', subtitle: 'Negotiate your raise or promotion', icon: '💰' },
  { id: 'difficult_feedback', title: 'Difficult Feedback', subtitle: 'Deliver tough but fair feedback', icon: '🎯' },
  { id: 'stakeholder_pushback', title: 'Stakeholder Pushback', subtitle: 'Defend your decision under pressure', icon: '🛡' },
  { id: 'elevator_pitch', title: 'Elevator Pitch', subtitle: 'Hook someone in 60 seconds', icon: '🚀' },
];

function buildSystemPrompt(scenario: ConversationScenario, agentPersona: string, scenarioDescription: string, ctx: UserContext | null): string {
  const docs = ctx?.documents?.map(d => d.structuredExtraction).filter(Boolean) || [];

  const scenarioRules: Record<string, string> = {
    job_interview: 'Ask tough behavioral and technical questions relevant to their target role. Probe for specifics. If they give vague answers, push deeper.',
    salary_negotiation: "Push back on their ask at least once. Reference market rates. Don't make it easy. They need to justify their value.",
    difficult_feedback: 'React emotionally but professionally. Push back, ask for examples, get slightly defensive. Make them earn the conversation.',
    stakeholder_pushback: 'Be skeptical. Ask for evidence, data, and timelines. Challenge assumptions. Represent budget and risk concerns.',
    elevator_pitch: "If they're vague, look bored. If they hook you, lean in with sharp follow-ups. You're a busy investor with 10 pitches today.",
  };

  return `You are ${agentPersona} in a live conversational practice session. Stay FULLY in character. You are NOT a coach. You ARE the person in the scenario. React naturally and realistically.

SCENARIO: ${scenarioDescription}

${scenarioRules[scenario] || ''}

${ctx?.roleText ? `WHO THE USER IS (use this to make the conversation realistic. Reference their actual background, but don't break character):
Role: ${ctx.roleText}` : ''}
${ctx?.currentCompany ? `Company: ${ctx.currentCompany}` : ''}
${ctx?.situationText ? `Their situation: ${ctx.situationText}` : ''}
${ctx?.dreamRoleAndCompany ? `Their goal: ${ctx.dreamRoleAndCompany}` : ''}
${docs.length > 0 ? `Their background: ${docs.map((d: any) => d?.summary || '').join('; ')}` : ''}

TIME CONSTRAINT:
- This is a 5-minute practice session. You should be aware of this and pace the conversation accordingly.
- Early on (first 1-2 minutes), mention the time naturally in character. E.g. "We've only got a few minutes, so let's dive right in" or "I know we're short on time, so let's make this count."
- As the conversation progresses, keep exchanges tight. Don't waste time with pleasantries or filler.
- If the conversation is nearing the end, wrap up naturally in character. Don't just stop mid-flow.

RESPONSE RULES:
- Stay in character as ${agentPersona}. React to what they ACTUALLY said.
- Keep responses to 2-4 sentences. This is a conversation, not a monologue.
- End with something that requires a response. A question, pushback, or new angle.
- Reference SPECIFIC things they said. Quote their words back when pushing back.
- Escalate naturally. Each exchange should feel slightly higher stakes.
- Sound like a real person talking, not an AI. No bullet points or lists.`;
}

export default function ConversationSetup() {
  const router = useRouter();
  const [selected, setSelected] = useState<ConversationScenario>('job_interview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [context, setContext] = useState<UserContext | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    getContext().then(setContext);
    return () => { mountedRef.current = false; };
  }, []);

  // Make subtitles context-aware
  function getSubtitle(scenario: typeof SCENARIOS[number]): string {
    if (!context?.roleText) return scenario.subtitle;
    const role = context.roleText.substring(0, 40);
    const company = context.currentCompany || '';
    const dream = context.dreamRoleAndCompany || '';

    switch (scenario.id) {
      case 'job_interview':
        return dream ? `Interview for ${dream.substring(0, 50)}` : `Interview practice as ${role}`;
      case 'salary_negotiation':
        return company ? `Negotiate at ${company}` : 'Negotiate your raise or promotion';
      case 'difficult_feedback':
        return company ? `Give feedback at ${company}` : 'Deliver tough but fair feedback';
      case 'stakeholder_pushback':
        return 'Defend your decision under pressure';
      case 'elevator_pitch':
        return dream ? `Pitch for ${dream.substring(0, 50)}` : 'Hook someone in 60 seconds';
      default:
        return scenario.subtitle;
    }
  }

  async function handleStart() {
    if (!isPremium()) { router.push('/premium'); return; }
    const check = await canDoConversation();
    if (!check.allowed) { setError('You\'ve used your conversation for today. Come back tomorrow!'); return; }

    setLoading(true);
    setError('');

    try {
      // Load the user's active upcoming events so the conversation agent
      // can frame the scenario around what they're actually preparing for.
      const upcomingEvents = await getActiveUpcomingEvents().catch(() => []);
      const setup = await apiPost<{
        agentPersona: string;
        scenarioDescription: string;
        openingLine: string;
        voiceTone: string;
      }>('/conversation/setup', {
        scenario: selected,
        roleText: context?.roleText || '',
        currentCompany: context?.currentCompany || '',
        situationText: context?.situationText || '',
        dreamRoleAndCompany: context?.dreamRoleAndCompany || '',
        notes: context?.notes || '',
        documentExtractions: context?.documents?.map(d => d.structuredExtraction) || [],
        upcomingEvents,
      });

      const systemPrompt = buildSystemPrompt(selected, setup.agentPersona, setup.scenarioDescription, context);

      const state: ConversationState = {
        id: generateId(),
        config: { scenario: selected, maxTurns: 4 },
        turns: [{
          turnNumber: 0,
          agentMessage: setup.openingLine,
          userTranscript: '',
          timestamp: new Date().toISOString(),
        }],
        agentPersona: setup.agentPersona,
        scenarioDescription: setup.scenarioDescription,
        startedAt: new Date().toISOString(),
      };

      await saveConversationState(state);
      await trackConversationUsage();

      if (mountedRef.current) {
        router.push({
          pathname: '/conversation/live',
          params: {
            agentPersona: setup.agentPersona,
            scenarioDescription: setup.scenarioDescription,
            openingLine: setup.openingLine,
            systemPrompt,
          },
        });
      }
    } catch (e: any) {
      if (mountedRef.current) {
        const msg = e?.message || (typeof e === 'string' ? e : JSON.stringify(e)) || 'Failed to set up conversation.';
        setError(msg);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} activeOpacity={0.7}>
            <Text style={s.backBtn}>{'←'} Back</Text>
          </TouchableOpacity>
        </View>

        <FadeIn>
          <Text style={s.title}>Conversation</Text>
          <Text style={s.subtitle}>
            {context?.roleText
              ? 'Scenarios tailored to your profile. Pick one and start talking.'
              : 'Practice a real conversation with an AI agent. 4 turns, just like the real thing.'}
          </Text>
        </FadeIn>

        {context?.roleText ? (
          <View style={s.contextBadge}>
            <Text style={s.contextBadgeText}>Using your context</Text>
          </View>
        ) : null}

        <View style={s.scenarioList}>
          {SCENARIOS.map((scenario, i) => (
            <FadeIn key={scenario.id} delay={i * 60}>
              <TouchableOpacity
                style={[s.scenarioCard, selected === scenario.id && s.scenarioSelected]}
                onPress={() => setSelected(scenario.id)}
                activeOpacity={0.7}
                disabled={loading}
              >
                <Text style={s.scenarioIcon}>{scenario.icon}</Text>
                <View style={s.scenarioTextWrap}>
                  <Text style={[s.scenarioTitle, selected === scenario.id && s.scenarioTitleSelected]}>{scenario.title}</Text>
                  <Text style={s.scenarioSubtitle}>{getSubtitle(scenario)}</Text>
                </View>
                {selected === scenario.id && <View style={s.selectedDot} />}
              </TouchableOpacity>
            </FadeIn>
          ))}
        </View>

        {error ? (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{error}</Text>
          </View>
        ) : null}

        <FadeIn delay={300}>
          <TouchableOpacity
            style={[s.startBtn, loading && s.btnDisabled]}
            onPress={handleStart}
            activeOpacity={0.8}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.text.inverse} />
            ) : (
              <Text style={s.startBtnText}>Start Conversation</Text>
            )}
          </TouchableOpacity>
        </FadeIn>

        {!context?.roleText && (
          <FadeIn delay={400}>
            <TouchableOpacity style={s.contextHint} onPress={() => router.push('/context/setup')} activeOpacity={0.7}>
              <Text style={s.contextHintText}>Add your context for personalized scenarios {'→'}</Text>
            </TouchableOpacity>
          </FadeIn>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  scrollContent: { padding: layout.screenPadding, paddingBottom: wp(40) },

  header: { marginBottom: spacing.lg },
  backBtn: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.text.tertiary },

  title: { fontSize: fp(28), fontWeight: typography.weight.black, color: colors.text.primary, letterSpacing: -0.5 },
  subtitle: { fontSize: typography.size.sm, color: colors.text.tertiary, marginTop: spacing.xs, lineHeight: fp(20), marginBottom: spacing.lg },

  contextBadge: {
    backgroundColor: colors.accent.light,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    alignSelf: 'flex-start',
    marginBottom: spacing.md,
  },
  contextBadgeText: { fontSize: typography.size.xs, fontWeight: typography.weight.bold, color: colors.accent.primary },

  scenarioList: { gap: spacing.sm },
  scenarioCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.lg,
    padding: wp(14),
    borderWidth: 2,
    borderColor: 'transparent',
  },
  scenarioSelected: {
    borderColor: colors.accent.primary,
    backgroundColor: colors.accent.light,
  },
  scenarioIcon: { fontSize: fp(22), marginRight: spacing.md, width: wp(32), textAlign: 'center' },
  scenarioTextWrap: { flex: 1 },
  scenarioTitle: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.text.primary },
  scenarioTitleSelected: { color: colors.accent.primary },
  scenarioSubtitle: { fontSize: typography.size.xs, color: colors.text.tertiary, marginTop: 2, lineHeight: fp(15) },
  selectedDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent.primary },

  errorBox: { backgroundColor: colors.feedback.negativeBg, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, marginTop: spacing.md },
  errorText: { fontSize: typography.size.xs, color: colors.error, textAlign: 'center', fontWeight: typography.weight.semibold },

  startBtn: {
    backgroundColor: colors.accent.primary,
    borderRadius: radius.lg,
    paddingVertical: wp(16),
    alignItems: 'center',
    marginTop: spacing.xl,
    ...shadows.accent,
  },
  startBtnText: { fontSize: typography.size.base, fontWeight: typography.weight.bold, color: colors.text.inverse },
  btnDisabled: { opacity: 0.6 },

  contextHint: { alignItems: 'center', paddingTop: spacing.lg },
  contextHintText: { fontSize: typography.size.xs, color: colors.accent.primary, fontWeight: typography.weight.semibold },
});
