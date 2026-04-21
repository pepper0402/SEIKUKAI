-- ============================================================
-- SEIKUKAI 運用改善マイグレーション
-- 実行方法: Supabase ダッシュボード → SQL Editor で全文貼り付けて実行
-- ============================================================

-- ------------------------------------------------------------
-- 1. ユニーク制約（CSV再インポート時の重複防止）
-- ------------------------------------------------------------
-- profiles: login_email で一意（null は許容）
CREATE UNIQUE INDEX IF NOT EXISTS profiles_login_email_unique
  ON profiles(login_email) WHERE login_email IS NOT NULL;

-- criteria: (dan, examination_type, examination_content) の組で一意
-- 同じ項目名でも examination_type（基本/組手/ミット等）が違えば別物として扱う
CREATE UNIQUE INDEX IF NOT EXISTS criteria_dan_type_content_unique
  ON criteria(dan, examination_type, examination_content);

-- ------------------------------------------------------------
-- 2. 昇級履歴テーブル
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS promotion_history (
  id            BIGSERIAL PRIMARY KEY,
  student_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  from_kyu      TEXT NOT NULL,
  to_kyu        TEXT NOT NULL,
  promoted_by   UUID REFERENCES profiles(id),
  promoted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  score         INTEGER,
  note          TEXT
);

CREATE INDEX IF NOT EXISTS promotion_history_student_idx
  ON promotion_history(student_id, promoted_at DESC);

-- ------------------------------------------------------------
-- 3. 通知キューテーブル（Edge Function で処理）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id              BIGSERIAL PRIMARY KEY,
  recipient_email TEXT NOT NULL,
  subject         TEXT NOT NULL,
  body            TEXT NOT NULL,
  type            TEXT NOT NULL DEFAULT 'generic',    -- 'promotion' | 'evaluation' | 'generic'
  status          TEXT NOT NULL DEFAULT 'pending',    -- 'pending' | 'sent' | 'failed'
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS notifications_status_idx
  ON notifications(status, created_at);

-- ------------------------------------------------------------
-- 4. RLS（Row Level Security）は今回は未導入
-- ------------------------------------------------------------
-- 初回実装では関数の再帰呼び出しによりログイン不能となった。
-- 将来的には JWT の app_metadata に role を格納する方式で再設計する。
-- 当面はクライアント側の is_admin チェックで権限制御する。
-- ------------------------------------------------------------
-- 完了
