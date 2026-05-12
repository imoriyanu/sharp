// Sharp AI — Generic agent runner.
// Wraps Claude tool-use with tracing and a tool-execution context.
// Every agent (threaded interrogator, persistent coach, prep agent) calls this.

const { TOOL_DEFINITIONS, executeTool } = require('./tools');
const { createTrace } = require('./traces');

const DEFAULT_TOTAL_BUDGET_MS = 25_000; // < Railway's 30s edge timeout

// ===== Public: runAgent =====
//
// opts:
//   anthropic       — Anthropic SDK client (required)
//   supabase        — Supabase admin client for tools (required for retrieval tools)
//   userId          — uuid (required for retrieval tools to scope queries)
//   sessionId       — optional, attached to traces
//   agentName       — string, used for tracing
//   systemPrompt    — string
//   userMessage     — string (the goal/task for this run)
//   tools           — array of tool definitions; defaults to TOOL_DEFINITIONS
//   maxIterations   — default 5
//   maxTokens       — Claude max_tokens per turn, default 1500
//   model           — Claude model, default claude-sonnet-4-20250514
//   totalBudgetMs   — hard upper bound on the whole run; default 25000
//
// returns: { result, requestId }
// throws on hard failure (incl. budget exhaustion). The v2 endpoint catches
// and falls back to the v1 prompt so users never see a broken thread.

async function runAgent(opts) {
  const {
    anthropic, supabase, userId, sessionId, agentName,
    systemPrompt, userMessage,
    tools = TOOL_DEFINITIONS,
    maxIterations = 5,
    maxTokens = 1500,
    model = 'claude-sonnet-4-20250514',
    totalBudgetMs = DEFAULT_TOTAL_BUDGET_MS,
  } = opts;

  if (!anthropic) throw new Error('runAgent: anthropic client required');
  if (!agentName) throw new Error('runAgent: agentName required');

  const trace = createTrace({ supabase, userId: userId || null, agentName, sessionId: sessionId || null });
  trace.start();

  const deadline = Date.now() + totalBudgetMs;
  const abortController = new AbortController();
  const budgetTimer = setTimeout(() => abortController.abort(), totalBudgetMs);

  const messages = [{ role: 'user', content: userMessage }];
  const ctx = { supabase, userId };

  try {
    for (let i = 0; i < maxIterations; i++) {
      if (Date.now() >= deadline) throw new Error('Agent budget exhausted');

      const response = await anthropic.messages.create(
        { model, max_tokens: maxTokens, system: systemPrompt, messages, tools },
        { signal: abortController.signal }
      );
      trace.recordTokens(response.usage);

      const toolUseBlocks = (response.content || []).filter(b => b.type === 'tool_use');
      const textBlocks = (response.content || []).filter(b => b.type === 'text');

      // No tools requested OR Claude says it's done -> extract final text
      if (toolUseBlocks.length === 0 || response.stop_reason === 'end_turn') {
        const text = textBlocks.map(b => b.text).join('').trim();
        const final = parseFinal(text);
        trace.complete(true, typeof final === 'string' ? final : JSON.stringify(final).slice(0, 200));
        return { result: final, requestId: trace.requestId };
      }

      // Execute requested tool calls in parallel — record each
      const toolResults = await Promise.all(toolUseBlocks.map(async (block) => {
        const toolStart = Date.now();
        const output = await executeTool(block.name, block.input, ctx);
        const latencyMs = Date.now() - toolStart;
        trace.recordToolCall({
          toolName: block.name,
          toolInput: block.input,
          toolOutput: output,
          latencyMs,
        });
        return {
          type: 'tool_result',
          tool_use_id: block.id,
          content: typeof output === 'string' ? output : JSON.stringify(output),
        };
      }));

      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });
    }
    throw new Error('Max tool iterations reached');
  } catch (e) {
    trace.complete(false, e?.message || String(e));
    throw e;
  } finally {
    clearTimeout(budgetTimer);
  }
}

function parseFinal(text) {
  if (!text) return { text: '' };
  // Strip code fences first
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  // Try first {...} block
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0]); } catch {}
  }
  return { text: cleaned };
}

module.exports = { runAgent };
