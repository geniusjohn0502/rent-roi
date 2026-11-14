-- 共用連結：6 個字 → 最新版的長代碼（BZ- 開頭，整份試算壓縮後的字串）
CREATE TABLE IF NOT EXISTS codes (
  id TEXT PRIMARY KEY,        -- 6 個字，例如 K7Q3MP
  code TEXT NOT NULL,         -- 最新版的長代碼
  created INTEGER NOT NULL,   -- 建立時間（毫秒）
  updated INTEGER,            -- 最後一次存檔時間（毫秒），60 天倒數從這裡算
  editor TEXT,                -- 最後存檔的人填的名字（可以空白）
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_codes_created ON codes(created);

-- 舊版本：每次存回連結前，把上一版放進來，每條連結留最近 20 版（2026-11-14 加入）
CREATE TABLE IF NOT EXISTS history (
  id TEXT NOT NULL,
  version INTEGER NOT NULL,
  code TEXT NOT NULL,
  editor TEXT,
  saved INTEGER NOT NULL,     -- 這一版當初存檔的時間（毫秒）
  PRIMARY KEY (id, version)
);
