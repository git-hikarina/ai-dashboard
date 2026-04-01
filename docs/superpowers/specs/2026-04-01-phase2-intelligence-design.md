# Phase 2: Intelligence — コスト制御とカスタマイズ 設計書

## 概要

Phase 1（基盤チャット機能）の上に、プリセット・自動ルーティング・コスト制御・管理者機能を構築する。ユーザーがAIモデルを意識せず最適なコストで利用でき、管理者が組織のAI利用状況を把握・制御できるプラットフォームを目指す。

## 決定事項

| 項目 | 決定 |
|------|------|
| プリセットスコープ | 個人 + チーム + 組織（ユーザーが有効化を選択） |
| 管理者ダッシュボード | system_admin（全体）+ org_admin（組織）+ team admin/owner（チーム） |
| コスト推定 | 入力+出力推定 + 最大コスト補足テキスト |
| Slack承認 | Phase 2: 通知のみ → 将来: ボタン承認(B) |
| 自動ルーティング | トークン数 + ヒューリスティクス（ルールベース、AI不使用） |
| 月間予算 | 組織単位 |
| 実装アプローチ | 垂直スライス（機能ごとに DB→API→UI 一気通貫） |

---

## 1. DBマイグレーション（002_phase2_schema.sql）

全機能分を1ファイルで一括追加。

### 新規テーブル

#### presets（カスタム指示セット）

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | uuid | PK, DEFAULT gen_random_uuid() | |
| name | text | NOT NULL | 「計画君」「翻訳くん」等 |
| description | text | | 用途の説明 |
| system_prompt | text | NOT NULL | AIに渡すシステムプロンプト |
| recommended_model | text | | 推奨モデルID（null = 自動選択） |
| icon | text | | 絵文字 or アイコン名 |
| scope | text | NOT NULL, CHECK IN ('personal','team','organization') | スコープ |
| owner_id | uuid | FK → users(id) | 作成者 |
| team_id | uuid | FK → teams(id) | team scope の場合 |
| organization_id | uuid | FK → organizations(id) | organization scope の場合 |
| is_active | boolean | DEFAULT true | 作成者による有効/無効 |
| created_at | timestamptz | DEFAULT now() | |
| updated_at | timestamptz | DEFAULT now() | |

#### user_preset_preferences（ユーザーのプリセット有効化状態）

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | uuid | PK, DEFAULT gen_random_uuid() | |
| user_id | uuid | FK → users(id), NOT NULL | |
| preset_id | uuid | FK → presets(id) ON DELETE CASCADE, NOT NULL | |
| is_enabled | boolean | DEFAULT true | |
| created_at | timestamptz | DEFAULT now() | |
| | | UNIQUE(user_id, preset_id) | |

### 既存テーブルへの変更

#### organizations に追加

| カラム | 型 | デフォルト | 説明 |
|--------|-----|-----------|------|
| monthly_budget_jpy | numeric(12,2) | 0 | 月間予算（円） |
| budget_alert_sent_80 | boolean | false | 80%警告送信済み |
| budget_alert_sent_100 | boolean | false | 100%警告送信済み |
| budget_alert_month | text | | 警告対象月（'2026-04' 形式、月初リセット判定用） |

#### sessions

- `preset_id` カラムは既存。FK 制約を追加: `REFERENCES presets(id) ON DELETE SET NULL`

---

## 2. プリセット CRUD

### API エンドポイント

| メソッド | パス | 権限 | 用途 |
|---------|------|------|------|
| GET | /api/presets | 認証済み | 利用可能なプリセット一覧（個人+所属チーム+所属組織） |
| POST | /api/presets | 認証済み | プリセット作成（scope に応じた権限チェック） |
| GET | /api/presets/[id] | 認証済み | プリセット詳細 |
| PATCH | /api/presets/[id] | 作成者 or scope管理者 | プリセット更新 |
| DELETE | /api/presets/[id] | 作成者 or scope管理者 | プリセット削除 |
| POST | /api/presets/[id]/toggle | 認証済み | 自分の有効/無効切替（user_preset_preferences） |

### 権限ルール

| scope | 作成 | 編集/削除 |
|-------|------|-----------|
| personal | 誰でも | 作成者のみ |
| team | team の admin/owner | team の admin/owner |
| organization | org_admin / system_admin | org_admin / system_admin |

### GET /api/presets クエリロジック

```sql
SELECT p.*, upp.is_enabled
FROM presets p
LEFT JOIN user_preset_preferences upp
  ON upp.preset_id = p.id AND upp.user_id = :userId
WHERE p.is_active = true
  AND (
    (p.scope = 'personal' AND p.owner_id = :userId)
    OR (p.scope = 'team' AND p.team_id IN (:userTeamIds))
    OR (p.scope = 'organization' AND p.organization_id IN (:userOrgIds))
  )
ORDER BY p.scope, p.name
```

### UI コンポーネント

#### preset-selector.tsx（チャットヘッダー）
- ドロップダウン形式、ModelSelector と同じ行に配置
- 有効化されたプリセットのみ表示
- 選択すると recommended_model があればモデルも自動切替
- 「なし」オプションで解除可能

#### プリセット管理画面（/chat/presets or モーダル）
- 一覧表示（スコープ別にグループ化: 個人 / チーム / 組織）
- 各プリセットに有効/無効トグルスイッチ
- 作成/編集フォーム: name, description, system_prompt(textarea), recommended_model(ドロップダウン), icon, scope
- scope が team/organization の場合、対象チーム/組織を選択

---

## 3. 自動ルーティング

### ロジック配置

`src/lib/ai/router.ts` に純粋関数として実装。`POST /api/chat` 内で mode === 'auto' の時に呼び出す。

### 判定フロー

```
入力メッセージ
  │
  ├─ プリセット選択あり？
  │   └─ YES → preset.recommended_model を使用（終了）
  │
  ├─ ヒューリスティクス判定
  │   ├─ コードブロック(```) 検出 → tier = 'standard' 以上
  │   ├─ 「翻訳」「translate」「要約」「summary」 → tier = 'light'
  │   ├─ 「分析」「比較」「レビュー」「設計」 → tier = 'standard'
  │   ├─ 「論文」「研究」「戦略」 → tier = 'heavy'
  │   └─ マッチなし → トークン数で判定
  │
  └─ トークン数による tier 判定
      ├─ 〜500 tokens → 'light'
      ├─ 〜2000 tokens → 'standard'
      └─ 2000+ tokens → 'heavy'
```

### tier → モデル解決

1. ユーザーが利用可能なプロバイダー（APIキー設定済み）のモデルに絞る
2. 該当 tier のモデルからコスト最安を選択
3. 該当 tier にモデルがなければ隣接 tier にフォールバック

### UI の変更

- ModelSelector に「自動」オプション追加
- 自動選択時、メッセージバブルのバッジに実際のモデル名を表示
- mode 切替: 「手動選択」⇔「自動」のトグル
- ChatTab.mode は既に 'auto' | 'fixed' | 'compare' に対応済み

---

## 4. コスト推定エンジン

### API

POST /api/estimate（認証済み）

### トークン数推定

- 入力トークン: 会話履歴全体のテキスト長から推定。日本語: 1文字 ≈ 1.5トークン、英語: 1単語 ≈ 1.3トークン
- 出力トークン: usage_logs からそのモデルの平均出力トークン数。データ不足時のデフォルト値: light=500, standard=1000, heavy=2000
- 最大コスト: モデルの max_tokens 上限を使用

### コスト計算

```
estimatedCostJpy = (estimatedInputTokens / 1000) * model.inputPricePer1k
                 + (estimatedOutputTokens / 1000) * model.outputPricePer1k
```

model_pricing テーブルから該当モデルの単価を取得して計算。

### レスポンス

```typescript
{
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostJpy: number;
  maxCostJpy: number;
  model: string;
  message: string; // "推定 ¥12.5（最大 ¥85 程度になる可能性があります）"
}
```

### 閾値アクション

| 推定コスト | アクション | UI表現 |
|-----------|----------|--------|
| < ¥500 | 即実行 | 入力欄下に小さくコスト表示（グレーテキスト） |
| ¥500〜¥1,000 | ユーザー確認 | 確認ダイアログ |
| > ¥1,000 | Slack管理者通知 | 「管理者に承認リクエストを送信しました」+ 待機 |

### UI 統合

- chat-input.tsx: 入力中 debounce 500ms で /api/estimate 呼び出し
- インラインコスト表示: 「推定 ¥12.5（最大 ¥85 程度）」
- ¥500超: 送信ボタン色変更（黄=警告、赤=要承認）
- cost-confirm-dialog.tsx: shadcn/ui Dialog、推定コスト・モデル名・推定トークン数を表示

### ¥1,000超の承認フロー（Phase 2: 通知のみ）

1. ユーザーが送信 → コスト推定 > ¥1,000
2. usage_logs に approval_status = 'pending' で記録
3. Slack に通知メッセージ送信
4. UI に「管理者に通知しました。承認後に実行されます」と表示
5. 管理者が /admin 画面で承認 → approval_status = 'approved'
6. ユーザーが再度送信時、approved であれば実行

---

## 5. 管理者ダッシュボード

### ルーティング

```
src/app/admin/
├── layout.tsx            # 管理者レイアウト（権限チェック + サイドナビ）
├── usage/
│   └── page.tsx          # コスト集計ダッシュボード
└── pricing/
    └── page.tsx          # モデル単価編集
```

### 権限チェック（admin layout.tsx）

- system_admin → 全ページアクセス可、全データ表示
- org_admin → アクセス可、自組織のデータのみ
- team admin/owner → アクセス可、自チームのデータのみ
- member → /chat へリダイレクト

### モデル単価管理（/admin/pricing）

API:
| メソッド | パス | 権限 | 用途 |
|---------|------|------|------|
| GET | /api/admin/pricing | admin系ロール | 全モデル単価一覧 |
| PATCH | /api/admin/pricing/[id] | system_admin | 単価更新 |

UI:
- テーブル形式で全モデルを表示
- 各行: プロバイダー、モデル名、入力単価、出力単価
- インライン編集（system_admin のみ）
- system_admin 以外は閲覧のみ

### コスト集計ダッシュボード（/admin/usage）

API:
| メソッド | パス | 権限 | 用途 |
|---------|------|------|------|
| GET | /api/admin/usage | admin系ロール | 集計データ |
| GET | /api/admin/usage/daily | admin系ロール | 日別推移 |

クエリパラメータ: ?period=2026-04（月指定）、権限に応じたスコープ自動絞り込み

UI 構成:

1. サマリーカード（上部）
   - 月間合計コスト（¥）
   - 予算進捗バー（使用額 / monthly_budget_jpy、80%超で黄色、100%超で赤）
   - リクエスト総数
   - アクティブユーザー数

2. 日別推移グラフ（中央）
   - recharts の AreaChart
   - X軸: 日付、Y軸: コスト（¥）
   - モデル別の積み上げ or 合計線

3. ユーザー別コスト表（下部）
   - ユーザー名、リクエスト数、合計コスト、最頻利用モデル
   - コスト順ソート（デフォルト）

4. モデル別コスト表
   - モデル名、リクエスト数、合計トークン、合計コスト
   - 円グラフでモデル別シェア

集計: usage_logs を GROUP BY user_id / model_id / DATE(created_at) で集約。権限に応じて WHERE 句でスコープ絞り込み。

---

## 6. Slack 通知

### 実装

`src/lib/slack/notify.ts` — Slack Incoming Webhook を使用。

### 環境変数

```
SLACK_WEBHOOK_URL=          # Incoming Webhook URL
SLACK_CHANNEL_ID=C0AR2BCAN4Q  # 通知先チャンネル
```

### 通知トリガー（3種類）

#### 高額リクエスト通知（¥1,000超）

トリガー: POST /api/chat でコスト推定 > ¥1,000

```
:bell: 高額リクエスト承認依頼
━━━━━━━━━━━━━━━━━
ユーザー: 田中太郎
モデル: Claude Opus
推定コスト: ¥2,350
セッション: 「新規プロジェクト企画」
━━━━━━━━━━━━━━━━━
管理者ダッシュボードで承認/却下してください
```

#### 月間予算 80% 到達警告

トリガー: POST /api/chat のコスト記録後、組織の月間累計を確認

```
:warning: 月間予算アラート（80%到達）
━━━━━━━━━━━━━━━━━
組織: MEGAPHONE
利用額: ¥40,000 / ¥50,000（80%）
残り: ¥10,000
━━━━━━━━━━━━━━━━━
```

#### 月間予算 100% 超過警告

```
:rotating_light: 月間予算超過
━━━━━━━━━━━━━━━━━
組織: MEGAPHONE
利用額: ¥52,300 / ¥50,000（105%）
超過: ¥2,300
━━━━━━━━━━━━━━━━━
```

### 予算チェックのタイミング

POST /api/chat の onFinish 内（コスト記録直後）:
1. 該当組織の当月累計コストを usage_logs から集計
2. organizations.monthly_budget_jpy と比較
3. 80% or 100% を初めて超えた場合のみ通知（重複防止）

重複防止: organizations に budget_alert_sent_80 / budget_alert_sent_100 + budget_alert_month カラム。budget_alert_month が当月でなければリセット。

### 予算超過時の動作

Phase 2 では警告のみ（ブロックしない）。将来的に「予算超過時ブロック」オプションを追加可能な設計。

---

## 新規ファイル一覧（概算）

| セクション | 新規/変更ファイル |
|-----------|-----------------|
| DBマイグレーション | supabase/migrations/002_phase2_schema.sql |
| プリセット | src/app/api/presets/route.ts, [id]/route.ts, [id]/toggle/route.ts |
| | src/components/chat/preset-selector.tsx |
| | src/app/chat/presets/ (管理画面) |
| | src/lib/supabase/types.ts (型追加) |
| 自動ルーティング | src/lib/ai/router.ts |
| | src/components/chat/model-selector.tsx (改修) |
| | src/app/api/chat/route.ts (改修) |
| コスト推定 | src/app/api/estimate/route.ts |
| | src/components/chat/cost-confirm-dialog.tsx |
| | src/components/chat/chat-input.tsx (改修) |
| 管理者ダッシュボード | src/app/admin/layout.tsx |
| | src/app/admin/usage/page.tsx |
| | src/app/admin/pricing/page.tsx |
| | src/app/api/admin/pricing/route.ts, [id]/route.ts |
| | src/app/api/admin/usage/route.ts, daily/route.ts |
| Slack通知 | src/lib/slack/notify.ts |
| | src/app/api/chat/route.ts (改修) |

---

## 技術スタック追加

| パッケージ | 用途 |
|-----------|------|
| recharts | 管理者ダッシュボードのグラフ |

tiktoken 等のトークナイザーは使用せず、文字数ベースのヒューリスティクスで推定。

---

最終更新: 2026-04-01
