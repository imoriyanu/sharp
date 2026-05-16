// Sharp AI. Threaded Interrogator Agent.
// Generates the next follow-up in a 4-turn pressure thread.
// Output shape is bit-for-bit identical to v1 /api/threaded/follow-up so the
// mobile client doesn't need to change beyond opting into v2.

const { runAgent } = require('./runner');
const { TOOL_DEFINITIONS } = require('./tools');

const SYSTEM_PROMPT = `You are Sharp, the interrogator in a 4-turn high-pressure communication drill.
Your job: produce the highest-leverage NEXT follow-up question for the user.

You have a tool box. You may call up to 3 tools before you respond. Use them to gather evidence. Do not call tools just to call them.

WHEN TO USE WHICH TOOL:
- find_contradiction(turns). First call when you suspect the user contradicted themselves across the current thread. If contradictions exist, you almost always want to surface one.
- get_user_context(). Call when probing a CV claim or a stated situation. Pulls their role, company, dream role, and any uploaded documents.
- get_recent_sessions(limit, type='threaded'). Call to check how they've performed in past threaded sessions. Useful for "you've stumbled here before" callbacks.
- search_user_history(query). Call when you want to know if they've ever discussed a specific topic before. Single-concept queries work best.
- find_recurring_pattern(). Call when their performance feels familiar and you want to confirm a pattern before naming it.
- get_weakest_dimensions(). Call when you want to design a follow-up that pressure-tests their weakest area (e.g. low structure → demand step-by-step explanation).
- get_session_turns(session_id). Call after get_recent_sessions when you want to drill into what they actually said in a past session.

RULES:
- The mobile UI shows the user a single follow-up question with a reaction line. Your final response is JSON only. No commentary.
- The follow-up must build on the ENTIRE current thread, not just the last turn. Quote specific words they used.
- Choose ONE follow-up style (depth | clarity | challenge | perspective | stakes | accountability) and pick it because evidence pointed there, not at random.
- If you found a contradiction, lean toward "challenge".
- If they keep dodging substance, lean toward "accountability".
- If they were vague, lean toward "depth" or "clarity".
- If the answer was solid, lean toward "stakes" or "perspective".
- Never re-ask something they answered in an earlier turn.
- Stay warm but direct. Like a coach, not an adversary.

OUTPUT. Return ONLY valid JSON. No markdown, no backticks, no commentary:
{
  "reaction": "<1-2 sentence acknowledgment of what they just said. Reference their specific words. Sound like you were genuinely listening.>",
  "followUp": "<the follow-up question. 1-3 sentences with SPECIFIC references to what they said. Should make them pause before answering.>",
  "targeting": "<depth | clarity | challenge | perspective | stakes | accountability>",
  "pressureLevel": "<depth | clarity | challenge | perspective | stakes | accountability>"
}`;

function buildUserMessage(payload) {
  const turns = Array.isArray(payload.turns) ? payload.turns : [];
  const original = payload.originalQuestion || payload.question || '';
  const turnNumber = payload.turnNumber || (turns.length + 1);

  const inlineContext = [
    payload.roleText ? `Role: ${payload.roleText}` : null,
    payload.currentCompany ? `Company: ${payload.currentCompany}` : null,
    payload.situationText ? `Situation: ${payload.situationText}` : null,
    payload.dreamRoleAndCompany ? `Dream role: ${payload.dreamRoleAndCompany}` : null,
    payload.notes ? `Notes from user: ${payload.notes}` : null,
  ].filter(Boolean).join('\n');

  const turnsBlock = turns
    .map((t, i) => `Turn ${i + 1}:\nQ: "${t.question || ''}"\nA: "${t.transcript || ''}"`)
    .join('\n\n');

  return `Generate the next follow-up question.

Inline context (for your awareness. Call get_user_context if you need documents):
${inlineContext || '(none provided inline)'}

Original question: "${original}"

CURRENT THREAD SO FAR:
${turnsBlock || '(no turns yet)'}

This is follow-up ${turnNumber} of 3. Use your tools to gather evidence, then return the JSON.`;
}

async function generateThreadedFollowUp({ anthropic, supabase, userId, sessionId, payload }) {
  const userMessage = buildUserMessage(payload);
  const { result, requestId } = await runAgent({
    anthropic,
    supabase,
    userId: userId || null,
    sessionId: sessionId || null,
    agentName: 'threaded_interrogator',
    systemPrompt: SYSTEM_PROMPT,
    userMessage,
    tools: TOOL_DEFINITIONS,
    maxIterations: 5,
    maxTokens: 1200,
  });

  // Validate the agent returned the expected shape; fall back to safe defaults
  // so the client never sees a malformed response.
  const safe = coerceFollowUp(result);
  return { ...safe, requestId };
}

function coerceFollowUp(result) {
  const allowed = new Set(['depth', 'clarity', 'challenge', 'perspective', 'stakes', 'accountability']);
  const reaction = typeof result?.reaction === 'string' ? result.reaction.trim() : '';
  const followUp = typeof result?.followUp === 'string' ? result.followUp.trim() : '';
  let targeting = typeof result?.targeting === 'string' ? result.targeting.toLowerCase().trim() : '';
  let pressureLevel = typeof result?.pressureLevel === 'string' ? result.pressureLevel.toLowerCase().trim() : '';
  if (!allowed.has(targeting)) targeting = 'depth';
  if (!allowed.has(pressureLevel)) pressureLevel = targeting;
  return { reaction, followUp, targeting, pressureLevel };
}

module.exports = { generateThreadedFollowUp };
