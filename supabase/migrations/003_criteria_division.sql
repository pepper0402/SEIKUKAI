-- ============================================================
-- SEIKUKAI 審査基準 少年部/一般部 分岐対応マイグレーション
-- 実行方法: Supabase ダッシュボード → SQL Editor で全文貼り付けて実行
-- ============================================================
--
-- 目的:
--   criteria テーブルに division カラムを追加し、
--   同じ級でも「少年部」「一般部」「共通」で項目を切り分けられるようにする。
--
-- 採点ロジック:
--   アプリ側で生徒の isIppan 判定（= 高校進学以降 or 社会人）に応じて
--   .in('division', ['both', isIppan ? 'general' : 'junior']) で絞り込む。
--
-- 互換性:
--   既存データは division='both' に初期化されるため、
--   再インポートするまで従来通り全員に同じ項目が表示される。
--   新CSVを取り込む時点で少年部/一般部に分岐する。
--
-- ============================================================

BEGIN;

-- 1. カラム追加（既存レコードは'both'にフォールバック）
ALTER TABLE criteria
  ADD COLUMN IF NOT EXISTS division TEXT NOT NULL DEFAULT 'both';

ALTER TABLE criteria DROP CONSTRAINT IF EXISTS criteria_division_check;
ALTER TABLE criteria
  ADD CONSTRAINT criteria_division_check
  CHECK (division IN ('junior', 'general', 'both'));

-- 2. UNIQUE制約を(dan, examination_type, examination_content)から
--    (dan, examination_type, examination_content, division)へ張り直し
DROP INDEX IF EXISTS criteria_dan_type_content_unique;
CREATE UNIQUE INDEX IF NOT EXISTS criteria_dan_type_content_division_unique
  ON criteria(dan, examination_type, examination_content, division);

-- 3. 参照用インデックス
CREATE INDEX IF NOT EXISTS criteria_division_dan_idx
  ON criteria(division, dan);

COMMIT;

-- ------------------------------------------------------------
-- 確認:
-- SELECT division, COUNT(*) FROM criteria GROUP BY division;
-- → 既存データは全て 'both' になっているはず。
-- 新CSVインポート後は junior / general / both が分布する想定。
-- ------------------------------------------------------------
