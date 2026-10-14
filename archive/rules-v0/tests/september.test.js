// 2026年9月の実メールとカレンダーを突き合わせて見つかった問題の再発防止（ダミーデータのみ）。
const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load.js');
const ctx = load({});

const card = (id, at, line) => ({ id, received_at: at, category: 'カード利用', route: 'rule', subject: 'ご利用のお知らせ【サンプルカード】',
  from_name: 'サンプルカード', excerpt: 'ご利用内容\n\nご利用日時：' + at.slice(0, 10).replace(/-/g, '/') + ' 17:00\n' + line + '\n\n本メールは…' });

test('返品の行（「-13,870円」と負号つき）は合計から引く', () => {
  const plan = ctx.planCalendar([
    card('a', '2026-11-18T08:00:00Z', 'サンプル鉄道（買物） 13,870円'),
    card('b', '2026-11-18T08:30:00Z', 'サンプル鉄道（返品） -13,870円'),
    card('c', '2026-11-18T09:00:00Z', 'サンプル鉄道（買物） 11,150円'),
  ]);
  assert.equal(plan.totals[0].summary, '[買] 11,150円');
});

test('「店名（買物） 1,830円」の円表記も読む', () => {
  assert.equal(ctx.planCalendar([card('a', '2026-11-03T12:00:00Z', 'サンプルホテル（買物） 1,830円')]).totals[0].summary, '[買] 1,830円');
});

test('PENDING の仮承認は、同じ日に同じ店の確定分があれば数えない', () => {
  const plan = ctx.planCalendar([
    card('a', '2026-11-27T09:00:00Z', 'ＳＡＭＰＬＥ ＊ＦＯＯＤ ＨＥＬＰ（買物） 797円'),
    card('b', '2026-11-27T09:40:00Z', 'SAMPLE * FOOD PENDING（買物） 4,151.00 JPY'),
    card('c', '2026-11-28T09:40:00Z', 'SAMPLE * FOOD PENDING（買物） 1,000.00 JPY'),
  ]);
  assert.deepEqual(plan.totals.map((t) => t.summary), ['[買] 797円', '[買] 1,000円']);
});

test('Amazon の「注文済み」「配達済み」「配達中」、キャンセルの件名を分類する', () => {
  const c = (subject) => ctx.classify({ subject, fromAddress: 'shop@example.com', excerpt: '' }, [], []).category;
  assert.equal(c('注文済み: 「サンプル商品...」'), '買い物');
  assert.equal(c('配達済み: 「サンプル商品...」'), '到着');
  assert.equal(c('配達中:「サンプル商品...」'), '到着');
  assert.equal(c('キャンセルされた商品: 1「サンプル商品...」'), '要確認');
});
