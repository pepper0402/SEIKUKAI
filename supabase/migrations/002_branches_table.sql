-- ============================================================
-- SEIKUKAI 支部マスタテーブル追加マイグレーション
-- 実行方法: Supabase ダッシュボード → SQL Editor で全文貼り付けて実行
-- ============================================================
--
-- 目的:
--   支部名を独立したマスタとして管理。
--   従来は profiles.branch 文字列から逆引きしていたため、
--   「所属生徒ゼロだが予めドロップダウンに出したい支部」が扱えなかった。
--
-- 互換性:
--   既存の profiles.branch カラムはそのまま。アプリ側で
--   branches テーブル ∪ profiles.branch を union して表示する。
--   このため既存データのバックフィルは不要（seed のみ）。
--
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS branches (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT        NOT NULL UNIQUE,
  is_canonical  BOOLEAN     NOT NULL DEFAULT FALSE,  -- 正式3支部（池田/川西/宝塚）。削除UIで保護
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID        REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS branches_name_idx ON branches(name);

-- Seed: 正式3支部（冪等）
INSERT INTO branches (name, is_canonical) VALUES
  ('池田', TRUE),
  ('川西', TRUE),
  ('宝塚', TRUE)
ON CONFLICT (name) DO UPDATE SET is_canonical = EXCLUDED.is_canonical;

COMMIT;

-- ------------------------------------------------------------
-- RLS はプロジェクト全体で未導入のため、このテーブルも同方針。
-- 将来 RLS を入れる際は以下の想定:
--   SELECT: 全認証ユーザー可
--   INSERT/DELETE: role='master' のみ
-- ------------------------------------------------------------
