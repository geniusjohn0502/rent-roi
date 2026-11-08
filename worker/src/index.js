// 包租投報率試算的「短代碼小倉庫」
// POST /s       內文 = 長代碼（BZ-…）→ 回 {id}，存 60 天
// GET  /s/:id   → 回 {code}（長代碼），過期或找不到回 404
// 每天排程清掉超過 60 天的資料

const ALPHA = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // 拿掉 0 O 1 I L，避免看錯
const DAYS = 60;
const TTL_MS = DAYS * 86400 * 1000;
const ORIGINS = ['https://geniusjohn0502.github.io', 'http://localhost:8881'];

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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  };
}

export default {
  async fetch(req, env) {
    const h = headers(req);
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: h });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    const url = new URL(req.url);

    if (req.method === 'POST' && url.pathname === '/s') {
      const body = (await req.text()).trim();
      if (body.length > 20000 || !/^BZ-[zj][A-Za-z0-9_-]+$/.test(body)) return json({ error: 'format' }, 400);
      const now = Date.now();
      for (let i = 0; i < 5; i++) {
        const id = randomId();
        try {
          await env.DB.prepare('INSERT INTO codes (id, code, created) VALUES (?, ?, ?)').bind(id, body, now).run();
          return json({ id, expires: new Date(now + TTL_MS).toISOString() });
        } catch (e) { /* 撞號就再抽一次 */ }
      }
      return json({ error: 'busy' }, 503);
    }

    const m = url.pathname.match(/^\/s\/([A-Za-z0-9]{6})$/);
    if (req.method === 'GET' && m) {
      const row = await env.DB.prepare('SELECT code, created FROM codes WHERE id = ?').bind(m[1].toUpperCase()).first();
      if (!row || Date.now() - row.created > TTL_MS) return json({ error: 'notfound' }, 404);
      return json({ code: row.code, expires: new Date(row.created + TTL_MS).toISOString() });
    }

    return json({ error: 'notfound' }, 404);
  },

  async scheduled(event, env) {
    await env.DB.prepare('DELETE FROM codes WHERE created < ?').bind(Date.now() - TTL_MS).run();
  },
};
