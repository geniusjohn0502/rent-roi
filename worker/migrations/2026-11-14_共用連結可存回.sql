-- 2026-11-14：舊的 codes 表格加上「最後修改人、時間、第幾版」，另開舊版本表格
-- 只對線上已經存在的資料庫跑一次：npx wrangler d1 execute rent-roi-db --remote --file=migrations/2026-11-14_共用連結可存回.sql
ALTER TABLE codes ADD COLUMN updated INTEGER;
ALTER TABLE codes ADD COLUMN editor TEXT;
ALTER TABLE codes ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS history (
  id TEXT NOT NULL,
  version INTEGER NOT NULL,
  code TEXT NOT NULL,
  editor TEXT,
  saved INTEGER NOT NULL,
  PRIMARY KEY (id, version)
);
