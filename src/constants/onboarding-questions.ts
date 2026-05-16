import type { UpcomingEventType } from '../types';

// Pre-authored opening question per event type. Used by onboarding's
// challenge-intro + recording screens to personalise the first 30s of the
// product experience. The user has just told us what they're preparing for
// in upcoming.tsx. The recording challenge uses that signal instead of
// the generic "Tell me about yourself" demo prompt.
//
// If the user skipped upcoming.tsx (no event saved), challenge-intro falls
// back to ONBOARDING_QUESTION_FALLBACK. The original generic question, so
// the onboarding flow still works without an event.
export const ONBOARDING_QUESTION_BY_TYPE: Record<UpcomingEventType, string> = {
  interview:       'Why are you the right person for this role?',
  pitch:           'Why now? Why you?',
  raise:           'Walk me through why you have earned this.',
  review:          'Walk me through your biggest win this year.',
  feedback:        "What's the hardest thing you need to say?",
  sales:           'Why should they buy from you?',
  presentation:    'Open it. Hook me in 30 seconds.',
  difficult_convo: 'What do you need to say to them?',
  other:           'Tell me about yourself, who you are and what you do.',
};

export const ONBOARDING_QUESTION_FALLBACK =
  'Tell me about yourself, who you are and what you do.';

// One-line framing shown above the question on challenge-intro. Gives the
// user context for WHY this specific question (it's tied to their event).
// Falls back to the generic line when no event is set.
export const ONBOARDING_QUESTION_FRAMING_BY_TYPE: Record<UpcomingEventType, string> = {
  interview:       "This is the question every interview hinges on. Let's see your answer.",
  pitch:           "Two questions investors decide on in 30 seconds. Take both.",
  raise:           "The case you're going to have to make. Make it now.",
  review:          "What landed this year? Make it specific.",
  feedback:        "The hardest part of the conversation you're prepping for.",
  sales:           "The line that closes them. Find it in 30 seconds.",
  presentation:    "First 30 seconds of any talk. The audience decides if they're listening.",
  difficult_convo: "What you actually need to say. Not the warm-up.",
  other:           "The most common question in interviews, meetings, and networking. Most people fumble it.",
};

export const ONBOARDING_QUESTION_FRAMING_FALLBACK =
  'The most common question in interviews, meetings, and networking. Most people fumble it.';
