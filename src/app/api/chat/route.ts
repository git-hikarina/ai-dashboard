import { streamText } from 'ai';
import { getProvider } from '@/lib/ai/providers';
import { getModelById, type ModelInfo } from '@/lib/ai/models';
import { verifyToken } from '@/lib/firebase/admin';
import { createServiceClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// POST /api/chat — Streaming AI chat endpoint
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  try {
    // 1. Authenticate via Firebase token
    const { uid } = await verifyToken(request.headers.get('authorization'));

    // 2. Parse request body
    const { messages, modelId, sessionId } = (await request.json()) as {
      messages: Parameters<typeof streamText>[0]['messages'];
      modelId: string;
      sessionId: string;
    };

    if (!messages || !modelId || !sessionId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: messages, modelId, sessionId' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // 3. Look up model info from registry
    const model = getModelById(modelId);
    if (!model) {
      return new Response(
        JSON.stringify({ error: `Unknown model: ${modelId}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // 4. Get AI SDK provider instance
    const provider = getProvider(modelId);

    // 5. Resolve authenticated user from Supabase
    const supabase = createServiceClient();
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('firebase_uid', uid)
      .single();

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // 6. Stream the response
    const result = streamText({
      model: provider,
      messages,
      maxOutputTokens: model.maxTokens,
      onFinish: async ({ text, usage }) => {
        // 7. Save assistant message to DB
        const inputTokens = usage.inputTokens ?? 0;
        const outputTokens = usage.outputTokens ?? 0;
        const costJpy = calculateCost(model, inputTokens, outputTokens);

        const { data: msg } = await supabase
          .from('messages')
          .insert({
            session_id: sessionId,
            role: 'assistant' as const,
            content: text,
            model_used: modelId,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            cost_jpy: costJpy,
            sender_id: null,
          })
          .select('id')
          .single();

        // 8. Log usage
        if (msg) {
          await supabase.from('usage_logs').insert({
            user_id: user.id,
            session_id: sessionId,
            message_id: msg.id,
            provider: model.provider,
            model_id: modelId,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            cost_jpy: costJpy,
            approval_status: 'auto' as const,
          });
        }

        // Update session's updated_at timestamp
        await supabase
          .from('sessions')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', sessionId);
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error: unknown) {
    // Auth errors from verifyToken throw when header is missing/invalid
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message.includes('authorization') ? 401 : 500;
    return new Response(
      JSON.stringify({ error: message }),
      { status, headers: { 'Content-Type': 'application/json' } },
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Calculate cost in JPY based on model pricing and token usage.
 */
function calculateCost(
  model: ModelInfo,
  inputTokens: number,
  outputTokens: number,
): number {
  return (
    (inputTokens / 1000) * model.inputPricePer1k +
    (outputTokens / 1000) * model.outputPricePer1k
  );
}
