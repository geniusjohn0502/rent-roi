-- 短代碼 → 長代碼（BZ- 開頭，整份試算壓縮後的字串）
CREATE TABLE IF NOT EXISTS codes (
  id TEXT PRIMARY KEY,        -- 6 個字，例如 K7Q3MP
  code TEXT NOT NULL,         -- 長代碼
  created INTEGER NOT NULL    -- 建立時間（毫秒）
);
CREATE INDEX IF NOT EXISTS idx_codes_created ON codes(created);
