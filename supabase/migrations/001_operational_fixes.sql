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

-- criteria: (dan, examination_content) の組で一意
CREATE UNIQUE INDEX IF NOT EXISTS criteria_dan_content_unique
  ON criteria(dan, examination_content);

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
-- 4. RLS（Row Level Security）ポリシー
-- ------------------------------------------------------------
-- 現在ログインしているユーザーの profile を取得するヘルパー関数
CREATE OR REPLACE FUNCTION current_profile() RETURNS profiles
  LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT * FROM profiles WHERE login_email = auth.jwt() ->> 'email' LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION is_master() RETURNS BOOLEAN
  LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT COALESCE((SELECT role = 'master' OR is_admin FROM current_profile()), FALSE);
$$;

CREATE OR REPLACE FUNCTION is_branch_admin() RETURNS BOOLEAN
  LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT COALESCE((SELECT role IN ('master', 'branch') OR is_admin FROM current_profile()), FALSE);
$$;

CREATE OR REPLACE FUNCTION is_staff() RETURNS BOOLEAN
  LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT COALESCE((SELECT role IN ('master', 'branch', 'instructor') OR is_admin FROM current_profile()), FALSE);
$$;

-- profiles: 自分のレコード + スタッフは全件
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select ON profiles;
CREATE POLICY profiles_select ON profiles FOR SELECT
  USING (login_email = auth.jwt() ->> 'email' OR is_staff());

DROP POLICY IF EXISTS profiles_update ON profiles;
CREATE POLICY profiles_update ON profiles FOR UPDATE
  USING (is_branch_admin())  -- master/branch のみ編集可
  WITH CHECK (is_branch_admin());

DROP POLICY IF EXISTS profiles_insert ON profiles;
CREATE POLICY profiles_insert ON profiles FOR INSERT
  WITH CHECK (is_branch_admin());

DROP POLICY IF EXISTS profiles_delete ON profiles;
CREATE POLICY profiles_delete ON profiles FOR DELETE
  USING (is_master());

-- criteria: 全員閲覧可、master のみ編集
ALTER TABLE criteria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS criteria_select ON criteria;
CREATE POLICY criteria_select ON criteria FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS criteria_write ON criteria;
CREATE POLICY criteria_write ON criteria FOR ALL
  USING (is_master()) WITH CHECK (is_master());

-- evaluations: 自分の評価 + スタッフ全員閲覧 / 採点は staff のみ
ALTER TABLE evaluations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS evaluations_select ON evaluations;
CREATE POLICY evaluations_select ON evaluations FOR SELECT
  USING (
    student_id = (SELECT id FROM current_profile())
    OR is_staff()
  );

DROP POLICY IF EXISTS evaluations_write ON evaluations;
CREATE POLICY evaluations_write ON evaluations FOR ALL
  USING (is_staff()) WITH CHECK (is_staff());

-- promotion_history: 自分の履歴 + スタッフ閲覧、書き込みは branch 以上
ALTER TABLE promotion_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS promotion_history_select ON promotion_history;
CREATE POLICY promotion_history_select ON promotion_history FOR SELECT
  USING (
    student_id = (SELECT id FROM current_profile())
    OR is_staff()
  );

DROP POLICY IF EXISTS promotion_history_insert ON promotion_history;
CREATE POLICY promotion_history_insert ON promotion_history FOR INSERT
  WITH CHECK (is_branch_admin());

-- notifications: master のみ（キューは管理者専用）
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_admin ON notifications;
CREATE POLICY notifications_admin ON notifications FOR ALL
  USING (is_master()) WITH CHECK (is_master());

-- ------------------------------------------------------------
-- 完了
-- ------------------------------------------------------------
-- 確認: 下記で各テーブルの RLS が有効か見られます
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
