// run() の流れのテスト：Gmail・スクリプトプロパティ・Supabase を偽物に差し替えて動かす（ダミーデータのみ）。
const test = require('node:test');
const assert = require('node:assert/strict');
const loadAll = require('./load.js');
const load = (env) => loadAll(env);

const H = 3600 * 1000;
function fakeMsg(id, ms, subject, from) {
  return {
    getId: () => id, getDate: () => new Date(ms), getSubject: () => subject, getFrom: () => from || 'Shop <shop@example.com>',
    getTo: () => 'me@example.com, other@example.com', getPlainBody: () => '合計 1,200円', getHeader: () => '',
    getThread: () => ({ getId: () => 't-' + id, getMessageCount: () => 1 }),
  };
}

function env({ now, cursor, messages, db = new Set() }) {
  const props = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_dummy', CURSOR_MS: String(cursor) };
  const calls = [];
  const labelCalls = [];
  const RealDate = Date;
  class FakeDate extends RealDate { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } }
  return {
    calls, props, db, labelCalls,
    Date: FakeDate,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Logger: { log: () => {} },
    Utilities: { formatDate: (d) => d.toISOString() },
    labeled: [],
    GmailApp: {
      getUserLabelByName: () => null,
      createLabel: (name) => ({ addToThreads: (ths) => { labelCalls.push({ name, n: ths.length }); } }),
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
  assert.equal(post.body[0].to_address, 'me@example.com');
  assert.equal(post.body[0].excerpt, '合計 1,200円');
  // 判断はしない：分類・金額・ラベルはスクリプトでは付けない（AI が後で書く）
  assert.equal(post.body[0].category, undefined);
  assert.equal(post.body[0].amounts, undefined);
  assert.deepEqual(e.labelCalls, []);
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

test('Outlook から転送されたメールは中の元の差出人・件名で記録する', () => {
  const now = Date.UTC(2026, 9, 13, 12);
  const m = fakeMsg('fw', now - 1 * H, 'FW: カードご利用のお知らせ', 'me@example.org');
  m.getPlainBody = () => '____\nFrom: サンプルカード <info@card.example>\nSent: x\nTo: me@example.org\nSubject: カードご利用のお知らせ\n\nご利用金額 3,000円';
  const e = env({ now, cursor: now - 2 * H, messages: [m] });
  e.props.SELF_ADDRESSES = 'me@example.org';
  load(e).run();
  const row = e.calls.find((c) => c.method === 'post' && c.path.startsWith('mails')).body[0];
  assert.equal(row.from_address, 'info@card.example');
  assert.equal(row.subject, 'カードご利用のお知らせ');
  assert.equal(row.forwarded, true);
  assert.equal(row.self_sent, false);
  assert.equal(row.excerpt, 'ご利用金額 3,000円');
});

test('自分のアドレスから転送でなく届いたもの（自分で書いたメモ）には self_sent を付ける', () => {
  const now = Date.UTC(2026, 9, 13, 12);
  const m = fakeMsg('memo', now - 1 * H, '10/20 病院', 'Me <me@example.org>');
  const e = env({ now, cursor: now - 2 * H, messages: [m] });
  e.props.SELF_ADDRESSES = 'me@example.org';
  load(e).run();
  const row = e.calls.find((c) => c.method === 'post' && c.path.startsWith('mails')).body[0];
  assert.equal(row.self_sent, true);
  assert.equal(row.forwarded, false);
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

test('state の command（backfill）を run() のついでに実行し、結果を done で書き戻す', () => {
  const now = Date.UTC(2026, 9, 13, 12);
  const e = env({ now, cursor: now - 1 * H, messages: [] });
  const realFetch = e.UrlFetchApp.fetch;
  e.UrlFetchApp.fetch = (url, opt) => (opt.method === 'get' && url.includes('state?select=value&key=eq.command')
    ? { getResponseCode: () => 200, getContentText: () => JSON.stringify([{ value: { name: 'backfill', status: 'pending' } }]) }
    : realFetch(url, opt));
  load(e).run();
  const cmd = e.calls.filter((c) => c.method === 'post' && c.path.startsWith('state')).map((c) => c.body[0]).find((b) => b.key === 'command');
  assert.equal(cmd.value.status, 'done');
  assert.equal(e.calls.find((c) => c.path === 'runs').body[0].command, 'done');
});

test('一覧にない command は実行しない', () => {
  const now = Date.UTC(2026, 9, 13, 12);
  const e = env({ now, cursor: now - 1 * H, messages: [] });
  const realFetch = e.UrlFetchApp.fetch;
  e.UrlFetchApp.fetch = (url, opt) => (opt.method === 'get' && url.includes('key=eq.command')
    ? { getResponseCode: () => 200, getContentText: () => JSON.stringify([{ value: { name: 'setup', status: 'pending' } }]) }
    : realFetch(url, opt));
  load(e).run();
  assert.equal(e.calls.find((c) => c.path === 'runs').body[0].command, null);
});
