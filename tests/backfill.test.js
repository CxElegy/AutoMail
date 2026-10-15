// backfill() のテスト（偽の Gmail・Supabase、ダミーデータのみ）。
const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load.js');

const msg = (id, iso, subject, body) => ({
  getId: () => id, getDate: () => new Date(iso), getSubject: () => subject, getFrom: () => 'Shop <s@example.com>',
  getTo: () => 'me@example.com', getPlainBody: () => body || '', getHeader: () => '', getThread: () => ({ getId: () => 't' + id }),
});

test('1日ずつ取得して記録し、続きの日付を覚える', () => {
  const props = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_x' };
  const mails = [msg('a', '2026-09-01T00:30:00Z', 'カードご利用のお知らせ', 'ご利用日時：2026/09/01 09:30\nご利用先：店\nご利用金額：500円'),
                 msg('b', '2026-09-30T14:00:00Z', 'セール')];   // 9/30 23:00 JST
  const db = [], posts = [];
  const G = load({
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
    Logger: { log: () => {} },
    GmailApp: { search: (q) => {
      const [a, b] = q.match(/\d+/g).map((n) => n * 1000);
      return mails.filter((m) => m.getDate().getTime() > a && m.getDate().getTime() < b).map((m) => ({ getMessages: () => [m] }));
    } },
    UrlFetchApp: { fetch: (url, opt) => {
      const p = url.split('/rest/v1/')[1], body = opt.payload ? JSON.parse(opt.payload) : null;
      if (opt.method === 'post') { posts.push({ p, body }); if (p.startsWith('mails')) db.push(...body); }
      const out = opt.method === 'get' && p.startsWith('mails?select=id,received_at') ? JSON.stringify(db) : opt.method === 'get' ? '[]' : '';
      return { getResponseCode: () => 200, getContentText: () => out };
    } },
  });
  assert.equal(G.nextDay_('2026-09-30'), '2026-10-01');
  G.backfill();
  assert.deepEqual(db.map((r) => r.id), ['a', 'b']);
  assert.equal(db[0].category, undefined);
  assert.equal(props.BACKFILL_NEXT, '2026-10-01');
});
