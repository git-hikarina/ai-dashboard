interface HighCostAlertParams {
  userName: string;
  modelName: string;
  estimatedCost: number;
  sessionTitle: string | null;
}

interface BudgetAlertParams {
  orgName: string;
  usedAmount: number;
  budgetAmount: number;
  percentage: number;
}

function formatJpy(amount: number): string {
  return `¥${amount.toLocaleString('ja-JP')}`;
}

export function formatHighCostAlert(params: HighCostAlertParams): string {
  return [
    ':bell: *高額リクエスト承認依頼*',
    '━━━━━━━━━━━━━━━━━',
    `ユーザー: ${params.userName}`,
    `モデル: ${params.modelName}`,
    `推定コスト: ${formatJpy(Math.round(params.estimatedCost))}`,
    `セッション: 「${params.sessionTitle ?? '無題'}」`,
    '━━━━━━━━━━━━━━━━━',
    '管理者ダッシュボードで承認/却下してください',
  ].join('\n');
}

export function formatBudgetAlert(params: BudgetAlertParams): string {
  const isOver = params.percentage >= 100;
  const emoji = isOver ? ':rotating_light:' : ':warning:';
  const title = isOver ? '月間予算超過' : `月間予算アラート（${Math.round(params.percentage)}%到達）`;

  const lines = [
    `${emoji} *${title}*`,
    '━━━━━━━━━━━━━━━━━',
    `組織: ${params.orgName}`,
    `利用額: ${formatJpy(Math.round(params.usedAmount))} / ${formatJpy(Math.round(params.budgetAmount))}（${Math.round(params.percentage)}%）`,
  ];

  if (isOver) {
    lines.push(`超過: ${formatJpy(Math.round(params.usedAmount - params.budgetAmount))}`);
  } else {
    lines.push(`残り: ${formatJpy(Math.round(params.budgetAmount - params.usedAmount))}`);
  }

  lines.push('━━━━━━━━━━━━━━━━━');
  return lines.join('\n');
}

export function shouldSendBudgetAlert(
  usedAmount: number,
  budgetAmount: number,
  alertSent80: boolean,
  alertSent100: boolean,
): 80 | 100 | null {
  if (budgetAmount <= 0) return null;
  const percentage = (usedAmount / budgetAmount) * 100;
  if (percentage >= 100 && !alertSent100) return 100;
  if (percentage >= 80 && !alertSent80) return 80;
  return null;
}

export async function sendSlackNotification(text: string): Promise<boolean> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn('[Slack] SLACK_WEBHOOK_URL not configured, skipping notification');
    return false;
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    return res.ok;
  } catch (err) {
    console.error('[Slack] Failed to send notification:', err);
    return false;
  }
}
