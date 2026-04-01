import { streamText, convertToModelMessages, type UIMessage } from 'ai';
import { getProvider } from '@/lib/ai/providers';
import { getModelById, getAvailableModels, type ModelInfo } from '@/lib/ai/models';
import { autoRoute } from '@/lib/ai/router';
import { verifyToken } from '@/lib/firebase/admin';
import { createServiceClient } from '@/lib/supabase/server';
import { shouldSendBudgetAlert, formatBudgetAlert, sendSlackNotification } from '@/lib/slack/notify';

// ---------------------------------------------------------------------------
// POST /api/chat — Streaming AI chat endpoint
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  try {
    // 1. Authenticate via Firebase token
    const { uid } = await verifyToken(request.headers.get('authorization'));

    // 2. Parse request body
    const { messages, modelId, sessionId, mode, presetId } = (await request.json()) as {
      messages: UIMessage[];
      modelId: string;
      sessionId: string;
      mode?: 'auto' | 'fixed';
      presetId?: string | null;
    };

    // 3. Validate required fields
    if (!messages || !modelId || !sessionId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: messages, modelId, sessionId' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // 4. Create supabase client + resolve user
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

    // 5. Preset resolution + auto-routing
    let systemPrompt: string | undefined;
    let resolvedModelId = modelId;

    if (presetId) {
      const { data: preset } = await supabase
        .from('presets')
        .select('system_prompt, recommended_model')
        .eq('id', presetId)
        .single();

      if (preset) {
        systemPrompt = preset.system_prompt;
        if (mode === 'auto' && preset.recommended_model) {
          resolvedModelId = preset.recommended_model;
        }
      }
    }

    // Auto-route if mode=auto and no preset override
    if (mode === 'auto' && resolvedModelId === modelId) {
      const lastMsg = messages[messages.length - 1];
      const lastText = lastMsg?.parts
        ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join('') ?? '';
      const available = getAvailableModels();
      const routed = autoRoute(lastText, available);
      if (routed) resolvedModelId = routed.id;
    }

    // 6. Look up model info from registry
    const model = getModelById(resolvedModelId);
    if (!model) {
      return new Response(
        JSON.stringify({ error: `Unknown model: ${resolvedModelId}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // 7. Get AI SDK provider instance
    const provider = getProvider(resolvedModelId);

    // 8. Stream the response
    const result = streamText({
      model: provider,
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
      maxOutputTokens: model.maxTokens,
      onFinish: async ({ text, usage }) => {
        // Save assistant message to DB
        const inputTokens = usage.inputTokens ?? 0;
        const outputTokens = usage.outputTokens ?? 0;
        const costJpy = calculateCost(model, inputTokens, outputTokens);

        const { data: msg } = await supabase
          .from('messages')
          .insert({
            session_id: sessionId,
            role: 'assistant' as const,
            content: text,
            model_used: resolvedModelId,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            cost_jpy: costJpy,
            sender_id: null,
          })
          .select('id')
          .single();

        // Log usage
        if (msg) {
          await supabase.from('usage_logs').insert({
            user_id: user.id,
            session_id: sessionId,
            message_id: msg.id,
            provider: model.provider,
            model_id: resolvedModelId,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            cost_jpy: costJpy,
            approval_status: 'auto' as const,
          });
        }

        // Budget monitoring
        const { data: userFull } = await supabase
          .from('users')
          .select('active_organization_id, display_name')
          .eq('id', user.id)
          .single();

        if (userFull?.active_organization_id) {
          const { data: org } = await supabase
            .from('organizations')
            .select('name, monthly_budget_jpy, budget_alert_sent_80, budget_alert_sent_100, budget_alert_month')
            .eq('id', userFull.active_organization_id)
            .single();

          if (org && Number(org.monthly_budget_jpy) > 0) {
            const currentMonth = new Date().toISOString().slice(0, 7);
            let alertSent80 = org.budget_alert_sent_80;
            let alertSent100 = org.budget_alert_sent_100;

            // Reset if new month
            if (org.budget_alert_month !== currentMonth) {
              alertSent80 = false;
              alertSent100 = false;
              await supabase
                .from('organizations')
                .update({ budget_alert_sent_80: false, budget_alert_sent_100: false, budget_alert_month: currentMonth })
                .eq('id', userFull.active_organization_id);
            }

            // Get monthly total
            const startOfMonth = `${currentMonth}-01T00:00:00Z`;
            const { data: usageData } = await supabase
              .from('usage_logs')
              .select('cost_jpy')
              .gte('created_at', startOfMonth);

            const totalCost = (usageData ?? []).reduce((sum, row) => sum + Number(row.cost_jpy), 0);
            const alertLevel = shouldSendBudgetAlert(totalCost, Number(org.monthly_budget_jpy), alertSent80, alertSent100);

            if (alertLevel) {
              const percentage = (totalCost / Number(org.monthly_budget_jpy)) * 100;
              const alertText = formatBudgetAlert({
                orgName: org.name,
                usedAmount: totalCost,
                budgetAmount: Number(org.monthly_budget_jpy),
                percentage,
              });
              sendSlackNotification(alertText); // fire-and-forget

              await supabase
                .from('organizations')
                .update({
                  [`budget_alert_sent_${alertLevel}`]: true,
                  budget_alert_month: currentMonth,
                })
                .eq('id', userFull.active_organization_id);
            }
          }
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
