// run() の流れのテスト：Gmail・スクリプトプロパティ・Supabase を偽物に差し替えて動かす（ダミーデータのみ）。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(env) {
  const ctx = vm.createContext(Object.assign({ console, Set, Date, JSON, Math, String, Number, Object, encodeURIComponent }, env));
  for (const f of ['Classify.js', 'Main.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', f), 'utf8'), ctx, { filename: f });
  }
  return ctx;
}

const H = 3600 * 1000;
function fakeMsg(id, ms, subject, from) {
  return {
    getId: () => id, getDate: () => new Date(ms), getSubject: () => subject, getFrom: () => from || 'Shop <shop@example.com>',
    getTo: () => 'me@example.com, other@example.com', getPlainBody: () => '合計 1,200円', getHeader: () => '',
    getThread: () => ({ getId: () => 't-' + id }),
  };
}

function env({ now, cursor, messages, db = new Set() }) {
  const props = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_dummy', CURSOR_MS: String(cursor) };
  const calls = [];
  const RealDate = Date;
  class FakeDate extends RealDate { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } }
  return {
    calls, props, db,
    Date: FakeDate,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Logger: { log: () => {} },
    Utilities: { formatDate: (d) => d.toISOString() },
    GmailApp: {
      search: (q, start, max) => {
        const after = Number(q.replace('after:', '')) * 1000;
        const hit = messages.filter((m) => m.getDate().getTime() > after);
        return start === 0 ? hit.map((m) => ({ getMessages: () => [m] })) : [];
      },
    },
    UrlFetchApp: {
      fetch: (url, opt) => {
        const p = url.replace('https://x.supabase.co/rest/v1/', '');
        const body = opt.payload ? JSON.parse(opt.payload) : undefined;
        calls.push({ method: opt.method, path: p, body, headers: opt.headers });
        let out = '';
        if (opt.method === 'get' && p.startsWith('mails?select=id&id=in.')) {
          const ids = decodeURIComponent(p.match(/in\.\((.*)\)$/)[1]).split(',');
          out = JSON.stringify(ids.filter((i) => db.has(i)).map((id) => ({ id })));
        } else if (opt.method === 'get') out = '[]';
        if (opt.method === 'post' && p.startsWith('mails')) body.forEach((r) => db.add(r.id));
        return { getResponseCode: () => (opt.method === 'post' ? 201 : 200), getContentText: () => out };
      },
    },
  };
}

test('新着を古い順に記録し、前回の続きを最後の1通まで進める', () => {
  const now = Date.UTC(2026, 9, 13, 12);
  const e = env({ now, cursor: now - 5 * H, messages: [fakeMsg('b', now - 1 * H, 'ご注文の確認'), fakeMsg('a', now - 2 * H, 'セール')] });
  load(e).run();
  const post = e.calls.find((c) => c.method === 'post' && c.path.startsWith('mails'));
  assert.deepEqual(post.body.map((r) => r.id), ['a', 'b']);
  assert.deepEqual(post.body.map((r) => r.category), ['広告', '買い物']);
  assert.deepEqual(post.body[0].amounts, [1200]);
  assert.equal(post.body[0].to_address, 'me@example.com');
  assert.equal(post.headers.Authorization, undefined);  // sb_secret_ は apikey だけ
  assert.equal(e.props.CURSOR_MS, String(now - 1 * H));
  const run = e.calls.find((c) => c.path === 'runs').body[0];
  assert.equal(run.written, 2);
  assert.equal(run.remaining, false);
});

test('重ねて検索した分のうち DB にあるものは書かない', () => {
  const now = Date.UTC(2026, 9, 13, 12);
  const e = env({ now, cursor: now - 1 * H, messages: [fakeMsg('old', now - 1.5 * H, 'x'), fakeMsg('new', now - 0.5 * H, 'y')], db: new Set(['old']) });
  load(e).run();
  const post = e.calls.find((c) => c.method === 'post' && c.path.startsWith('mails'));
  assert.deepEqual(post.body.map((r) => r.id), ['new']);
});

test('上限を超えたら古い順に200通で止め、残りありと記録する', () => {
  const now = Date.UTC(2026, 9, 13, 12);
  const messages = Array.from({ length: 205 }, (_, i) => fakeMsg('m' + i, now - 3 * H + i * 1000, '件名'));
  const e = env({ now, cursor: now - 4 * H, messages });
  load(e).run();
  const written = e.calls.filter((c) => c.method === 'post' && c.path.startsWith('mails')).flatMap((c) => c.body);
  assert.equal(written.length, 200);
  assert.equal(written[199].id, 'm199');
  assert.equal(e.props.CURSOR_MS, String(now - 3 * H + 199 * 1000));
  assert.equal(e.calls.find((c) => c.path === 'runs').body[0].remaining, true);
});

test('Supabase のエラーは runs に残し、前回の続きは進めない', () => {
  const now = Date.UTC(2026, 9, 13, 12);
  const e = env({ now, cursor: now - 2 * H, messages: [fakeMsg('a', now - 1 * H, 'x')] });
  const realFetch = e.UrlFetchApp.fetch;
  e.UrlFetchApp.fetch = (url, opt) => (opt.method === 'post' && url.includes('/mails')
    ? { getResponseCode: () => 500, getContentText: () => 'boom' } : realFetch(url, opt));
  assert.throws(() => load(e).run(), /500/);
  assert.equal(e.props.CURSOR_MS, String(now - 2 * H));
  assert.match(e.calls.find((c) => c.path === 'runs').body[0].error, /500/);
});
