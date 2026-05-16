// Sharp AI. Generic agent runner.
// Wraps Claude tool-use with tracing and a tool-execution context.
// Every agent (threaded interrogator, persistent coach, prep agent) calls this.

const { TOOL_DEFINITIONS, executeTool } = require('./tools');
const { createTrace } = require('./traces');

const DEFAULT_TOTAL_BUDGET_MS = 25_000;  // < Railway's 30s edge timeout
const PER_TOOL_TIMEOUT_MS    = 3_000;    // any tool call slower than this is aborted
const MIN_ITERATION_BUDGET   = 8_000;    // need this much budget left to start another Claude turn

// ===== Public: runAgent =====
//
// opts:
//   anthropic      . Anthropic SDK client (required)
//   supabase       . Supabase admin client for tools (required for retrieval tools)
//   userId         . Uuid (required for retrieval tools to scope queries)
//   sessionId      . Optional, attached to traces
//   agentName      . String, used for tracing
//   systemPrompt   . String
//   userMessage    . String (the goal/task for this run)
//   tools          . Array of tool definitions; defaults to TOOL_DEFINITIONS
//   maxIterations  . Default 5
//   maxTokens      . Claude max_tokens per turn, default 1500
//   model          . Claude model, default claude-sonnet-4-20250514
//   totalBudgetMs  . Hard upper bound on the whole run; default 25000
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
      // Bail before starting another Claude turn if budget is too tight to
      // finish it. Otherwise we'd be paying for a generation that the edge
      // timeout will cut off mid-response.
      const remaining = deadline - Date.now();
      if (remaining < MIN_ITERATION_BUDGET) {
        throw new Error(`Agent budget exhausted (${remaining}ms left, need ${MIN_ITERATION_BUDGET}ms for another turn)`);
      }

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

      // Execute requested tool calls in parallel. Each has its own deadline
      // so one slow Supabase query can't eat the whole iteration budget.
      const toolResults = await Promise.all(toolUseBlocks.map(async (block) => {
        const toolStart = Date.now();
        let output;
        try {
          output = await Promise.race([
            executeTool(block.name, block.input, ctx),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error(`Tool ${block.name} timed out after ${PER_TOOL_TIMEOUT_MS}ms`)), PER_TOOL_TIMEOUT_MS)
            ),
          ]);
        } catch (e) {
          // Surface tool failure as a tool_result so the model can recover
          // (e.g. try a different tool or bail out and produce a final).
          output = { error: e?.message || String(e) };
        }
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
