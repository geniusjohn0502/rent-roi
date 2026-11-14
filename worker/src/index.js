// 包租投報率試算的「共用連結小倉庫」
// POST /s            內文 = 長代碼（BZ-…），或 JSON {code, editor} → 回 {id, version}，開一條新的共用連結
// GET  /s/:id        → 回 {code, version, editor, updated, expires}（最新版），過期或找不到回 404
// PUT  /s/:id        JSON {code, editor, base} → 存回這條連結（2026-11-14 加入，拿到連結的人都能改）
//                    base = 存檔的人打開時是第幾版；中間有別人先存過，回 409 和對方是誰、幾點存的
// GET  /s/:id/history → 回最近 20 次存檔的舊版本 [{version, code, editor, saved}]
// 60 天沒人存檔就清掉（從最後一次存檔起算）；每天排程刪除

const ALPHA = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // 拿掉 0 O 1 I L，避免看錯
const DAYS = 60;
const TTL_MS = DAYS * 86400 * 1000;
const KEEP_VERSIONS = 20;
const ORIGINS = ['https://geniusjohn0502.github.io', 'http://localhost:8881'];
const CODE_RE = /^BZ-[zj][A-Za-z0-9_-]+$/;

function randomId(n = 6) {
  let out = '';
  while (out.length < n) {
    const b = crypto.getRandomValues(new Uint8Array(16));
    for (const x of b) { if (x < 248 && out.length < n) out += ALPHA[x % 31]; } // 248 = 31×8，避免偏差
  }
  return out;
}

function headers(req) {
  const o = req.headers.get('Origin');
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  };
}

const cleanEditor = s => String(s ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 20);
const lastTime = row => row.updated || row.created;
const iso = ms => new Date(ms).toISOString();

async function readBody(req) {
  const text = (await req.text()).trim();
  if (text.length > 22000) return null;
  if (text.startsWith('{')) {
    try { const o = JSON.parse(text); return { code: String(o.code || ''), editor: cleanEditor(o.editor), base: o.base }; }
    catch (e) { return null; }
  }
  return { code: text, editor: '' };
}

async function getRow(env, id) {
  const row = await env.DB.prepare('SELECT code, created, updated, editor, version FROM codes WHERE id = ?').bind(id).first();
  if (!row || Date.now() - lastTime(row) > TTL_MS) return null;
  return row;
}

export default {
  async fetch(req, env) {
    const h = headers(req);
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: h });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    const url = new URL(req.url);

    // 開一條新的共用連結
    if (req.method === 'POST' && url.pathname === '/s') {
      const b = await readBody(req);
      if (!b || b.code.length > 20000 || !CODE_RE.test(b.code)) return json({ error: 'format' }, 400);
      const now = Date.now();
      for (let i = 0; i < 5; i++) {
        const id = randomId();
        try {
          await env.DB.prepare('INSERT INTO codes (id, code, created, updated, editor, version) VALUES (?, ?, ?, ?, ?, 1)')
            .bind(id, b.code, now, now, b.editor).run();
          return json({ id, version: 1, editor: b.editor, updated: iso(now), expires: iso(now + TTL_MS) });
        } catch (e) { /* 撞號就再抽一次 */ }
      }
      return json({ error: 'busy' }, 503);
    }

    const m = url.pathname.match(/^\/s\/([A-Za-z0-9]{6})(\/history)?$/);
    if (!m) return json({ error: 'notfound' }, 404);
    const id = m[1].toUpperCase();

    // 讀最新版
    if (req.method === 'GET' && !m[2]) {
      const row = await getRow(env, id);
      if (!row) return json({ error: 'notfound' }, 404);
      return json({ code: row.code, version: row.version, editor: row.editor || '', updated: iso(lastTime(row)), expires: iso(lastTime(row) + TTL_MS) });
    }

    // 舊版本清單
    if (req.method === 'GET' && m[2]) {
      if (!(await getRow(env, id))) return json({ error: 'notfound' }, 404);
      const { results } = await env.DB.prepare('SELECT version, code, editor, saved FROM history WHERE id = ? ORDER BY version DESC LIMIT ?')
        .bind(id, KEEP_VERSIONS).all();
      return json({ items: results.map(r => ({ version: r.version, code: r.code, editor: r.editor || '', saved: iso(r.saved) })) });
    }

    // 存回這條連結
    if (req.method === 'PUT' && !m[2]) {
      const b = await readBody(req);
      if (!b || b.code.length > 20000 || !CODE_RE.test(b.code) || !Number.isInteger(b.base)) return json({ error: 'format' }, 400);
      const row = await getRow(env, id);
      if (!row) return json({ error: 'notfound' }, 404);
      const conflict = () => json({ error: 'conflict', version: row.version, editor: row.editor || '', updated: iso(lastTime(row)) }, 409);
      if (row.version !== b.base) return conflict();
      const now = Date.now(), next = row.version + 1;
      // 只在版本號沒被別人改過時才寫入（兩個人幾乎同時按存檔，只有一個會成功）
      const r = await env.DB.prepare('UPDATE codes SET code = ?, editor = ?, updated = ?, version = ? WHERE id = ? AND version = ?')
        .bind(b.code, b.editor, now, next, id, b.base).run();
      if (!r.meta || r.meta.changes !== 1) {
        const latest = await getRow(env, id);
        return json({ error: 'conflict', version: latest ? latest.version : 0, editor: latest ? latest.editor || '' : '', updated: latest ? iso(lastTime(latest)) : '' }, 409);
      }
      await env.DB.batch([
        env.DB.prepare('INSERT OR IGNORE INTO history (id, version, code, editor, saved) VALUES (?, ?, ?, ?, ?)')
          .bind(id, row.version, row.code, row.editor || '', lastTime(row)),
        env.DB.prepare('DELETE FROM history WHERE id = ? AND version <= ?').bind(id, next - 1 - KEEP_VERSIONS),
      ]);
      return json({ ok: true, version: next, editor: b.editor, updated: iso(now), expires: iso(now + TTL_MS) });
    }

    return json({ error: 'notfound' }, 404);
  },

  async scheduled(event, env) {
    const cut = Date.now() - TTL_MS;
    await env.DB.batch([
      env.DB.prepare('DELETE FROM history WHERE id IN (SELECT id FROM codes WHERE COALESCE(updated, created) < ?)').bind(cut),
      env.DB.prepare('DELETE FROM codes WHERE COALESCE(updated, created) < ?').bind(cut),
    ]);
  },
};
