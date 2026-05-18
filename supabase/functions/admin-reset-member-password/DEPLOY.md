# admin-reset-member-password デプロイ手順

## 目的
管理者が会員のパスワードを一時パスワードに置き換える Edge Function。

**修正されるバグ**: クライアント側の `resetPasswordForEmail` を管理者が使うと、リカバリーリンクで管理者自身のセッションが上書きされてしまう問題。

## デプロイ手順（5分）

### 1. Supabase CLI インストール
```bash
npm install -g supabase
# または brew install supabase/tap/supabase
```

### 2. Supabase にログイン
```bash
supabase login
```
ブラウザが開いて Supabase アカウントで認証。

### 3. プロジェクトをリンク
```bash
cd /Users/mr.pepper/Desktop/合同会社SOL/projects/seikukai/dx-platform/app
supabase link --project-ref mticyfvtouvulvsbfgda
```
※ Database password を聞かれる場合がある（Supabase ダッシュボード → Settings → Database で確認）

### 4. Edge Function をデプロイ
```bash
supabase functions deploy admin-reset-member-password
```

これで完了。デフォルトで `--verify-jwt` が有効なので、認証済みユーザーのみ呼び出せる。

### 5. 動作確認
1. 管理画面で会員を選んで「データ修正」を開く
2. 「🔑 一時パスワードを生成して画面に表示」をクリック
3. モーダルに英数字12桁の一時パスワードが表示される
4. その会員のメールでログインを試す → 表示された一時パスワードで入れることを確認

## トラブルシューティング

### `Error: Cannot deploy ... in read-only mode`
Supabase ダッシュボードで Branching を使っている場合、Production への直接デプロイがブロックされる。Supabase ダッシュボードから手動で deploy するか、Branching を一時的に切り替える。

### `401 Unauthorized` がフロントから返る
Edge Function に `--verify-jwt=true` が設定されており、ログインしていない呼び出しは弾かれる。フロントが `supabase.functions.invoke` で呼ぶ際は自動的に JWT が付与されるので、ログイン状態を確認する。

### `403 管理者権限がありません`
呼び出し側のメールアドレスが `profiles` テーブルで `is_admin = true` のレコードと一致しない。`profiles.login_email` を確認。

## 関連ファイル
- 関数本体: `index.ts`
- フロント呼び出し: `app/src/pages/AdminDashboard.tsx` の `handlePasswordReset`
- 防御層: `app/src/App.tsx` の `PASSWORD_RECOVERY` 検出
