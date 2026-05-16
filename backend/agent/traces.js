// Sharp AI. Agent traces.
// Two sinks: PostHog (server-side, for funnels + dashboards) and Supabase
// agent_traces table (for offline drill-down). Both are best-effort , 
// trace failures must never block an agent run.

let _posthog = null;
function getPostHog() {
  if (_posthog !== null) return _posthog;
  const key = process.env.POSTHOG_API_KEY;
  if (!key) { _posthog = false; return null; }
  try {
    const { PostHog } = require('posthog-node');
    _posthog = new PostHog(key, {
      host: process.env.POSTHOG_HOST || 'https://eu.i.posthog.com',
      flushAt: 20,
      flushInterval: 10000,
    });
    return _posthog;
  } catch {
    _posthog = false;
    return null;
  }
}

function captureEvent(userId, event, properties) {
  const ph = getPostHog();
  if (!ph) return;
  try {
    ph.capture({ distinctId: userId || 'anonymous', event, properties: properties || {} });
  } catch {}
}

async function writeTraceRow(supabase, row) {
  if (!supabase) return;
  try {
    await supabase.from('agent_traces').insert(row);
  } catch {}
}

// ===== Trace recorder. One per agent run =====

function createTrace({ supabase, userId, agentName, sessionId }) {
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();
  let stepIndex = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let toolCallCount = 0;

  function nextStep() { return stepIndex++; }

  function start() {
    captureEvent(userId, 'agent_run_started', { agent_name: agentName, request_id: requestId, session_id: sessionId || null });
    writeTraceRow(supabase, {
      user_id: userId, session_id: sessionId || null, request_id: requestId,
      agent_name: agentName, step_index: nextStep(), step_kind: 'start',
    });
  }

  function recordToolCall({ toolName, toolInput, toolOutput, latencyMs }) {
    toolCallCount++;
    captureEvent(userId, 'agent_step', {
      agent_name: agentName, request_id: requestId, step: 'tool',
      tool_name: toolName, latency_ms: latencyMs,
    });
    // Two rows: the call (with input) and the result (with truncated output)
    writeTraceRow(supabase, {
      user_id: userId, session_id: sessionId || null, request_id: requestId,
      agent_name: agentName, step_index: nextStep(), step_kind: 'tool_call',
      tool_name: toolName, tool_input: truncate(toolInput),
    });
    writeTraceRow(supabase, {
      user_id: userId, session_id: sessionId || null, request_id: requestId,
      agent_name: agentName, step_index: nextStep(), step_kind: 'tool_result',
      tool_name: toolName, tool_output: truncate(toolOutput), latency_ms: latencyMs,
    });
  }

  function recordTokens(usage) {
    if (!usage) return;
    inputTokens += usage.input_tokens || 0;
    outputTokens += usage.output_tokens || 0;
  }

  function complete(success, finalDecision) {
    const totalLatencyMs = Date.now() - startedAt;
    captureEvent(userId, 'agent_run_completed', {
      agent_name: agentName, request_id: requestId, session_id: sessionId || null,
      total_steps: stepIndex, total_latency_ms: totalLatencyMs,
      tool_call_count: toolCallCount,
      input_tokens: inputTokens, output_tokens: outputTokens,
      success: !!success,
    });
    writeTraceRow(supabase, {
      user_id: userId, session_id: sessionId || null, request_id: requestId,
      agent_name: agentName, step_index: nextStep(),
      step_kind: success ? 'final' : 'error',
      message: typeof finalDecision === 'string' ? finalDecision.slice(0, 500) : null,
      latency_ms: totalLatencyMs,
      input_tokens: inputTokens, output_tokens: outputTokens,
    });
  }

  return { requestId, start, recordToolCall, recordTokens, complete };
}

function truncate(value) {
  if (value == null) return null;
  try {
    const s = JSON.stringify(value);
    if (s.length <= 4000) return value;
    return { __truncated: true, preview: s.slice(0, 4000) };
  } catch {
    return null;
  }
}

async function shutdown() {
  const ph = getPostHog();
  if (!ph) return;
  try { await ph.shutdown(); } catch {}
}

module.exports = { createTrace, captureEvent, shutdown };
