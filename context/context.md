# AI Dashboard — システム仕様書

社内向けマルチモデルAIチャットダッシュボード。複数のAIプロバイダー（Claude, GPT, Gemini, DeepSeek, Grok）をAPI経由で統合し、組織・チーム単位でコスト管理しながら利用できるプラットフォーム。

---

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| フレームワーク | Next.js 16 (App Router) |
| 言語 | TypeScript |
| ホスティング | Vercel (Pro) |
| データベース | Supabase (PostgreSQL + pgvector) |
| リアルタイム | Supabase Realtime（Phase 4） |
| 認証 | Firebase Auth（独立プロジェクト） |
| AI SDK | Vercel AI SDK v6 |
| 状態管理 | Zustand（クライアント）+ React Context（認証） |
| UI | Tailwind CSS v4 + shadcn/ui (v4, base-ui) |
| 通知 | Slack Webhook（Phase 2〜） |
| テスト | Vitest + Testing Library |

---

## プロジェクト構造

```
ai-dashboard/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # ルートレイアウト（Providers wrapper）
│   │   ├── page.tsx                # / → /chat にリダイレクト
│   │   ├── login/
│   │   │   └── page.tsx            # ログインページ（日本語UI）
│   │   ├── chat/
│   │   │   ├── layout.tsx          # チャットレイアウト（Header + サイドバー + メイン）
│   │   │   ├── page.tsx            # チャットトップ（空状態 + サイドバー）
│   │   │   ├── [id]/
│   │   │   │   └── page.tsx        # 個別チャットセッション（ストリーミング + コスト表示）
│   │   │   └── presets/
│   │   │       └── page.tsx        # プリセット管理ページ（CRUD + トグル）
│   │   ├── admin/
│   │   │   ├── layout.tsx          # 管理者レイアウト（権限ガード + サイドナビ）
│   │   │   ├── page.tsx            # → /admin/usage にリダイレクト
│   │   │   ├── usage/
│   │   │   │   └── page.tsx        # 利用状況ダッシュボード（recharts）
│   │   │   └── pricing/
│   │   │       └── page.tsx        # モデル単価管理ページ
│   │   └── api/
│   │       ├── chat/
│   │       │   └── route.ts        # AI ストリーミング（プリセット・自動ルーティング・予算監視統合）
│   │       ├── sessions/
│   │       │   ├── route.ts        # セッション一覧 / 作成
│   │       │   └── [id]/
│   │       │       └── route.ts    # セッション詳細 / 更新 / 削除
│   │       ├── messages/
│   │       │   └── route.ts        # ユーザーメッセージ保存
│   │       ├── presets/
│   │       │   ├── route.ts        # プリセット一覧 / 作成
│   │       │   └── [id]/
│   │       │       ├── route.ts    # プリセット詳細 / 更新 / 削除
│   │       │       └── toggle/
│   │       │           └── route.ts # プリセットトグル
│   │       ├── estimate/
│   │       │   └── route.ts        # コスト推定API
│   │       └── admin/
│   │           ├── pricing/
│   │           │   ├── route.ts    # モデル単価一覧
│   │           │   └── [id]/
│   │           │       └── route.ts # モデル単価更新（system_admin限定）
│   │           ├── usage/
│   │           │   ├── route.ts    # 利用状況サマリー
│   │           │   └── daily/
│   │           │       └── route.ts # 日別利用状況
│   │           └── approval/
│   │               └── [id]/
│   │                   └── route.ts # 承認/却下API
│   ├── components/
│   │   ├── chat/
│   │   │   ├── chat-input.tsx      # メッセージ入力（コスト表示付き）
│   │   │   ├── chat-messages.tsx   # メッセージ一覧（自動スクロール）
│   │   │   ├── message-bubble.tsx  # 個別メッセージ表示
│   │   │   ├── model-selector.tsx  # モデル選択（自動モード対応）
│   │   │   ├── session-sidebar.tsx # セッション一覧サイドバー
│   │   │   ├── preset-selector.tsx # プリセット選択ドロップダウン
│   │   │   ├── cost-display.tsx    # インラインコスト表示
│   │   │   └── cost-confirm-dialog.tsx # コスト確認ダイアログ（¥500+）
│   │   ├── admin/
│   │   │   ├── pricing-table.tsx   # モデル単価編集テーブル
│   │   │   ├── usage-summary-cards.tsx  # 利用サマリーカード
│   │   │   ├── usage-daily-chart.tsx    # 日別コストチャート
│   │   │   ├── usage-by-user-table.tsx  # ユーザー別集計テーブル
│   │   │   └── usage-by-model-table.tsx # モデル別集計テーブル
│   │   ├── layout/
│   │   │   └── header.tsx          # アプリヘッダー
│   │   ├── providers.tsx           # クライアントProviders
│   │   └── ui/                     # shadcn/ui コンポーネント
│   ├── contexts/
│   │   └── AuthContext.tsx          # Firebase Auth + Supabase ユーザー同期
│   ├── lib/
│   │   ├── ai/
│   │   │   ├── models.ts           # モデルメタデータ（11モデル, 5プロバイダー）
│   │   │   ├── providers.ts        # AI SDK プロバイダーインスタンス
│   │   │   ├── router.ts           # 自動ルーティング（ティア検出 + モデル選択）
│   │   │   ├── token-estimator.ts  # トークン数推定（CJK/英語ヒューリスティック）
│   │   │   └── cost-estimator.ts   # コスト推定エンジン
│   │   ├── auth/
│   │   │   └── resolve-user.ts     # Firebase UID → Supabase ユーザー + 所属解決
│   │   ├── slack/
│   │   │   └── notify.ts           # Slack通知（高コスト警告 + 予算アラート）
│   │   ├── firebase/
│   │   │   ├── admin.ts            # Firebase Admin SDK（トークン検証）
│   │   │   └── client.ts           # Firebase Client SDK
│   │   ├── supabase/
│   │   │   ├── client.ts           # ブラウザ用 Supabase クライアント
│   │   │   ├── server.ts           # サーバー用 + サービスロールクライアント
│   │   │   └── types.ts            # DB型定義（全テーブル）
│   │   └── utils.ts                # cn() ユーティリティ
│   ├── stores/
│   │   └── chat-store.ts           # Zustand マルチタブ状態管理
│   └── proxy.ts                    # ルート保護（__session cookie チェック）
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql  # 全テーブル定義 + シードデータ
│       └── 002_phase2_schema.sql   # Phase 2: presets, user_preset_preferences, budget列
├── __tests__/                      # Vitest テスト（198テスト）
└── context/
    └── context.md                  # この仕様書
```

---

## データベース設計（Supabase / PostgreSQL）

### テーブル一覧（13テーブル）

| テーブル | 用途 |
|---------|------|
| `users` | ユーザー（Firebase Auth から同期） |
| `organizations` | 組織（月間予算・アラートフラグ付き） |
| `org_members` | 組織メンバー（junction） |
| `teams` | チーム |
| `team_members` | チームメンバー（junction） |
| `credit_logs` | 個人クレジット履歴 |
| `team_credit_logs` | チームクレジット履歴 |
| `sessions` | チャットセッション（preset_id FK付き） |
| `messages` | チャットメッセージ |
| `usage_logs` | AI使用量ログ（コスト記録、approval_status付き） |
| `model_pricing` | モデル単価テーブル（管理者編集可） |
| `presets` | カスタム指示プリセット（personal/team/organization スコープ） |
| `user_preset_preferences` | ユーザーごとのプリセット有効/無効設定 |

### ユーザーロール

| ロール | 権限 |
|--------|------|
| `system_admin` | 全システム管理 |
| `org_admin` | 組織管理 |
| `member` | 一般ユーザー |

### 組織・チーム構造

```
組織 (organizations)
 ├── 組織メンバー (org_members) → role: org_admin / member
 └── チーム (teams)
      └── チームメンバー (team_members) → role: owner / admin / member
```

### クレジット管理

- **個人クレジット**: users.credits
- **チームクレジット**: teams.credits
- **消費優先順位**: チームクレジット（閾値20以上）→ 個人クレジットにフォールバック
- **履歴**: credit_logs（個人）/ team_credit_logs（チーム）

### プラン

ユーザープラン: `free` / `personal` / `team` / `trial` / `outage`
組織プラン: `organization` / `trial` / `outage`

---

## 認証フロー

```
ブラウザ                     サーバー
  │                            │
  ├─ Firebase Auth ログイン ──→│
  ├─ ID Token 取得            │
  ├─ __session cookie 設定    │
  │                            │
  ├─ API リクエスト ──────────→│
  │   Authorization: Bearer    │
  │                            ├─ verifyToken() で検証
  │                            ├─ firebase_uid → Supabase users 検索
  │                            ├─ 初回ログイン時: users テーブルに upsert
  │                            │
  ├─ proxy.ts ────────────────→│ __session cookie チェック
  │   cookie なし → /login      │
  │   cookie あり → 通過        │
```

---

## AI ゲートウェイ

### 対応モデル（11モデル, 5プロバイダー）

| プロバイダー | モデル | ティア | 入力単価(¥/1K) | 出力単価(¥/1K) |
|-------------|--------|--------|---------------|---------------|
| Anthropic | Claude Opus | heavy | 2.250 | 11.250 |
| Anthropic | Claude Sonnet | standard | 0.450 | 2.250 |
| Anthropic | Claude Haiku | light | 0.038 | 0.188 |
| OpenAI | GPT-4o | standard | 0.375 | 1.500 |
| OpenAI | GPT-4o mini | light | 0.011 | 0.045 |
| OpenAI | o1 | heavy | 2.250 | 9.000 |
| Google | Gemini Pro | standard | 0.188 | 0.750 |
| Google | Gemini Flash | light | 0.011 | 0.045 |
| DeepSeek | DeepSeek V3 | standard | 0.041 | 0.165 |
| DeepSeek | DeepSeek R1 | heavy | 0.083 | 0.330 |
| xAI | Grok 3 | standard | 0.450 | 2.250 |

### 3つのチャットモード（Phase 2〜で自動/比較モード実装）

- **固定モード**: ユーザーがモデルを手動選択（Phase 1で実装済み）
- **自動モード**: プリセットの推奨モデル or 入力特徴量で自動選択
- **比較モード**: 複数モデルに同時リクエスト、横並び表示

### コスト制御（Phase 2）

| 推定コスト | アクション |
|-----------|----------|
| < ¥500 | 即実行。入力欄に推定コスト表示 |
| ¥500〜¥1,000 | ユーザー確認ダイアログ |
| > ¥1,000 | Slack で管理者承認リクエスト |

---

## API エンドポイント

| メソッド | パス | 認証 | 用途 |
|---------|------|------|------|
| POST | `/api/chat` | Bearer | AIストリーミング応答（プリセット・自動ルーティング・予算監視統合） |
| GET | `/api/sessions` | Bearer | セッション一覧 |
| POST | `/api/sessions` | Bearer | セッション作成 |
| GET | `/api/sessions/[id]` | Bearer | セッション + メッセージ取得 |
| PATCH | `/api/sessions/[id]` | Bearer | セッション更新 |
| DELETE | `/api/sessions/[id]` | Bearer | セッション削除 |
| POST | `/api/messages` | Bearer | ユーザーメッセージ保存 |
| POST | `/api/auth/sync` | Bearer | Firebase→Supabaseユーザー同期 |
| GET | `/api/presets` | Bearer | プリセット一覧（スコープベース） |
| POST | `/api/presets` | Bearer | プリセット作成 |
| GET | `/api/presets/[id]` | Bearer | プリセット詳細 |
| PATCH | `/api/presets/[id]` | Bearer | プリセット更新 |
| DELETE | `/api/presets/[id]` | Bearer | プリセット削除 |
| POST | `/api/presets/[id]/toggle` | Bearer | プリセット有効/無効トグル |
| POST | `/api/estimate` | Bearer | コスト推定（自動ルーティング対応） |
| GET | `/api/admin/pricing` | Bearer(admin) | モデル単価一覧 |
| PATCH | `/api/admin/pricing/[id]` | Bearer(system_admin) | モデル単価更新 |
| GET | `/api/admin/usage` | Bearer(admin) | 利用状況サマリー（月次） |
| GET | `/api/admin/usage/daily` | Bearer(admin) | 日別利用状況 |
| PATCH | `/api/admin/approval/[id]` | Bearer(admin) | 承認/却下 |

---

## フェーズ計画

### Phase 1: 基盤 —「チャットが動く」 ✅ 実装済み
- Next.js プロジェクト + Vercel デプロイ
- Firebase Auth 連携
- Supabase セットアップ（DB + 全スキーマ）
- 固定モード（モデル手動選択でチャット）
- ストリーミング応答（AI SDK v6）
- セッション保存・履歴一覧
- マルチタブ（複数会話を同時に開ける）
- 基本的なコスト記録（usage_logs）

### Phase 2: 知能化 —「コスト制御とカスタマイズ」 ✅ 実装済み
- カスタム指示セット（プリセット）CRUD + 切替UI + スコープ別管理
- 自動ルーティング（ティア検出 + プリセット推奨モデル連動）
- コスト推定エンジン + 閾値アラート（¥500確認、¥1,000承認）
- モデル単価テーブル（管理者編集可能、system_admin限定）
- 管理者ダッシュボード（利用サマリー + 日別チャート + ユーザー別/モデル別集計）
- Slack連携（¥1,000超の高コスト警告 + 月間予算80%/100%アラート）
- 認証ヘルパー（resolveUser: Firebase UID → ユーザー + 所属解決）

### Phase 3: ナレッジ —「RAG と比較」
- ドキュメントRAG（アップロード→ベクトル化→検索）
- FAQ登録・優先回答
- ナレッジの適用範囲（全社/プリセット/個人）
- 同時比較モード（横並びマルチモデル）
- 過去履歴の全文検索・ベクトル検索

### Phase 4: コラボレーション —「チームで使う」
- 共同チャット（Supabase Realtime）
- セッション共有・招待
- 既存クレジット管理システムとの統合
- 各種サービス連携（拡張）
- UI/UX磨き込み
- **社長プレゼン（完成品として）**

---

## コスト

| 項目 | コスト |
|------|--------|
| Vercel Pro | 契約済み（$0追加） |
| Supabase | Free ($0) ※50人超で$25/月 |
| AI API利用料 | 従量課金 |
| RAG Embedding | 初回 ¥100〜300（Phase 3） |
| Slack | 無料 |
| **インフラ追加費用** | **実質 $0/月** |

---

## 既存システムとの関係

`sample/illust-system/` にある HIKARINA GenieGraph（Geminiイラスト生成システム）のパターンを参考にしている:
- 認証フロー（Firebase Auth + cookie）
- クレジット管理ロジック（チーム優先→個人フォールバック）
- 組織/チーム構造
- UIパターン（shadcn/ui, 日本語UI）

**ただしインフラは完全に独立**:
- 別の Firebase プロジェクト
- 別のデータベース（Supabase）
- ユーザー基盤は共有しない

---

## 環境変数

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Firebase
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=

# AI Providers
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=
DEEPSEEK_API_KEY=
XAI_API_KEY=

# Slack (Phase 2)
SLACK_WEBHOOK_URL=              # Incoming Webhook URL（高コスト・予算通知用）
```

---

## コマンド

```bash
npm run dev        # 開発サーバー起動
npm run build      # プロダクションビルド
npm run lint       # ESLint
npm run test       # テスト（watch mode）
npm run test:run   # テスト（単発実行）
```

---

## Zustand Store（chat-store.ts）

```typescript
interface ChatTab {
  sessionId: string;
  title: string;
  modelId: string;           // 'auto' で自動モード
  mode: 'auto' | 'fixed' | 'compare';
  presetId: string | null;   // Phase 2で追加
}
```

---

最終更新: 2026-04-01（Phase 2 完了）
