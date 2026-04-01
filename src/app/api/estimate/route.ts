import { NextRequest, NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { createServiceClient } from '@/lib/supabase/server';
import { getModelById, getAvailableModels } from '@/lib/ai/models';
import { estimateConversationTokens } from '@/lib/ai/token-estimator';
import { estimateCost, DEFAULT_OUTPUT_TOKENS } from '@/lib/ai/cost-estimator';
import { autoRoute } from '@/lib/ai/router';

// POST /api/estimate — Estimate cost before sending
export async function POST(request: NextRequest) {
  try {
    await resolveUser(request.headers.get('authorization'));

    const body = await request.json() as {
      messages: Array<{ content: string }>;
      modelId: string;
      mode?: 'auto' | 'fixed';
      presetRecommendedModel?: string | null;
    };

    // Resolve model (auto-route if mode=auto)
    let model = getModelById(body.modelId);
    if (body.mode === 'auto') {
      const lastMessage = body.messages[body.messages.length - 1];
      const available = getAvailableModels();
      const routed = autoRoute(lastMessage?.content ?? '', available, body.presetRecommendedModel);
      if (routed) model = routed;
    }

    if (!model) {
      return NextResponse.json({ error: 'Unknown model' }, { status: 400 });
    }

    // Estimate input tokens from conversation
    const inputTokens = estimateConversationTokens(body.messages);

    // Get average output tokens from historical data
    const supabase = createServiceClient();
    const { data: avgData } = await supabase
      .from('usage_logs')
      .select('output_tokens')
      .eq('model_id', model.id)
      .order('created_at', { ascending: false })
      .limit(50);

    let outputTokens: number;
    if (avgData && avgData.length >= 5) {
      outputTokens = Math.ceil(avgData.reduce((sum, row) => sum + row.output_tokens, 0) / avgData.length);
    } else {
      outputTokens = DEFAULT_OUTPUT_TOKENS[model.tier] ?? 1000;
    }

    // Get pricing from DB (more accurate than hardcoded)
    const { data: pricing } = await supabase
      .from('model_pricing')
      .select('input_price_per_1k, output_price_per_1k')
      .eq('model_id', model.id)
      .single();

    const pricingInfo = pricing
      ? { inputPricePer1k: Number(pricing.input_price_per_1k), outputPricePer1k: Number(pricing.output_price_per_1k), maxTokens: model.maxTokens }
      : { inputPricePer1k: model.inputPricePer1k, outputPricePer1k: model.outputPricePer1k, maxTokens: model.maxTokens };

    const estimate = estimateCost(inputTokens, outputTokens, pricingInfo);

    return NextResponse.json({
      ...estimate,
      model: model.id,
      modelDisplayName: model.displayName,
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
