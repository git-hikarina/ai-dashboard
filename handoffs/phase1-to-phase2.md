# AI Dashboard — Phase 2 引き継ぎ書

## Phase 1 完了状態

- **コード**: 全14タスク完了、105テスト全パス、TypeScriptエラーなし
- **GitHub**: https://github.com/git-hikarina/ai-dashboard (private)
- **ローカル確認済み**: Gemini Flash でチャット動作確認OK
- **Vercelデプロイ**: 未実施（後で実施予定）
- **コミット**: 10コミット on `main`

## プロジェクト構成

```
/Users/ryusei/Documents/PROJECT/_MEGAPHONE/_ai-dashboard/dev/master/ai-dashboard/
```

- Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 + shadcn/ui (v4, base-ui)
- Firebase Auth（独立プロジェクト） + Supabase (PostgreSQL)
- Vercel AI SDK v6
- Zustand（クライアント状態）
- 詳細は `context/context.md` を参照

## 環境変数

`.env.local` に設定済み:
- Supabase (URL + anon key + service role key)
- Firebase Auth (client + admin)
- Google Generative AI API key（Gemini のみ設定済み）
- 他のAIプロバイダーはコメントアウト

## DBスキーマ

Supabase に `001_initial_schema.sql` 実行済み。11テーブル:
- users, organizations, org_members, teams, team_members
- credit_logs, team_credit_logs
- sessions, messages, usage_logs, model_pricing

RLS有効だがポリシー未設定（service role keyで操作）。

## Phase 1 で修正したバグ

1. **RLS問題**: ブラウザ側Supabaseクライアントではupsertできない → `/api/auth/sync` をサーバー側API経由に変更
2. **AI SDK v6メッセージ形式**: `convertToModelMessages()` でUIMessage→ModelMessage変換が必要
3. **button nesting**: session-sidebarで `<button>` 内に `<Button>` → 外側を `<div role="button">` に変更
4. **デフォルトモデル**: Gemini Flashに変更（APIキー設定状況に合わせて）
5. **モデルフィルタ**: `getAvailableModels()` — APIキー未設定のプロバイダーは非表示

## 既存システム参照

`sample/illust-system/_next/` — HIKARINA GenieGraph（Geminiイラスト生成システム）
- パターンの参考のみ（インフラ共有なし、ユーザー基盤も完全に別）
- 参考にしている: 認証フロー、クレジット管理、組織/チーム構造、UIパターン
- UIはイラストシステムをベースにする

## Slack通知

チャンネル: `C0AR2BCAN4Q` (https://megaphoneai.slack.com/archives/C0AR2BCAN4Q)
- MCP plugin `slack@claude-plugins-official` で認証済み
- ユーザーのアクションが必要なとき、確認事項があるときに通知

## Phase 2 実装内容

### Phase 2: Intelligence — 「コスト制御とカスタマイズ」

1. **カスタム指示セット（プリセット）**
   - CRUD API + UI（作成/編集/削除/一覧）
   - プリセット切替UI（チャットヘッダーで選択）
   - データ: presets テーブル（スキーマは設計書に定義済み、Phase 1でDB未作成→マイグレーション追加）
   - 例: 「計画君」→ Opus推奨、「翻訳くん」→ GPT-4o-mini推奨

2. **自動ルーティング**
   - プリセット選択あり → プリセットの推奨モデルを使用
   - プリセットなし → 入力トークン数等で自動選択（light/standard/heavy）
   - mode='auto' の実装

3. **コスト推定エンジン**
   - 送信前にコスト概算を表示
   - 閾値: <¥500 即実行、¥500〜¥1000 ユーザー確認、>¥1000 Slack管理者承認
   - tiktoken等でトークン数推定

4. **モデル単価テーブル（管理者編集）**
   - model_pricing テーブルはPhase 1で作成済み（シードデータあり）
   - 管理画面から単価を更新するUI

5. **管理者ダッシュボード**
   - /admin/usage — ユーザー別/モデル別コスト集計
   - 月間利用状況 + 予算進捗バー
   - 日別推移グラフ（recharts等）

6. **Slack連携**
   - ¥1,000超の承認リクエスト
   - 月間予算80%/100%警告

### Phase 3: Knowledge — 「RAG と比較」

- ドキュメントRAG（アップロード→ベクトル化→pgvector検索）
- FAQ登録・優先回答
- ナレッジスコープ（全社/プリセット/個人）
- 同時比較モード（横並びマルチモデル）
- 過去履歴の全文検索・ベクトル検索

### Phase 4: Collaboration — 「チームで使う」

- 共同チャット（Supabase Realtime）
- セッション共有・招待
- クレジット管理統合
- UI/UX磨き込み
- **社長プレゼン**

## ユーザーの好み

- スキーマ等の技術判断はこちらに任せてOK
- UIは日本語
- context/context.md を作業の区切りで更新する
- Slack通知: ユーザーアクションが必要なときに送る
- コミットメッセージは英語
- 実行形式: Subagent-Driven Development

## メモリ

メモリファイルは `/Users/ryusei/.claude/projects/-Users-ryusei-Documents-PROJECT--MEGAPHONE--ai-dashboard-dev-master/memory/` に保存済み:
- user_role.md
- project_existing_system.md
- feedback_ui_base.md
- feedback_context_md.md
- reference_slack.md
