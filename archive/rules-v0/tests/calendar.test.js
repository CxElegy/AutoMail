// カレンダー統合（段階2b 試作）のテスト。例は tests/calendar-examples.js（ダミーのみ）。
const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load.js');
const examples = require('./calendar-examples.js');
const plan = JSON.parse(JSON.stringify(load({}).planCalendar(examples)));

test('10/13 の日次合計：カフェの都度・明細は1回、書店はカードと注文で1回、Amazon は注文だけ', () => {
  const d = plan.totals.find((t) => t.date === '2026-10-13');
  assert.equal(d.summary, '[買] 6,980円');            // 1,200 + 3,300 + 2,480
  assert.match(d.description, /合計 6,980円（3件）/);
  assert.equal(d.colorId, 7);
});

test('取消は同じ日の合計からマイナスする', () => {
  assert.match(plan.totals.find((t) => t.date === '2026-10-14').description, /サンプル交通 -5,000円/);
});

const ev = (kind) => plan.events.filter((e) => e.kind === kind);

test('到着は到着日に別の予定（金額なし）', () => {
  assert.deepEqual(ev('arrival').filter((e) => e.date === '2026-10-16'), [{ kind: 'arrival', date: '2026-10-16', summary: '[Amazon] 猫用フード 2kg 到着予定', colorId: 7 }]);
});

test('飛行機の往復は便ごとに2件、新幹線は1件。乗る日に時刻つき・移動の色（9）', () => {
  assert.deepEqual(ev('trip').filter((e) => e.date >= '2026-10-01').map((e) => [e.date, e.start, e.end, e.summary, e.colorId]), [
    ['2026-10-20', '07:05', '08:10', '[ANA] NH123 羽田 07:05 → 伊丹 08:10', 9],
    ['2026-10-22', '19:30', '20:40', '[ANA] NH456 伊丹 19:30 → 羽田 20:40', 9],
    ['2026-10-25', '09:00', '11:27', '[スマートEX] 新幹線 東京→新大阪（のぞみ201号） 09:00', 9],
  ]);
});

test('航空券・新幹線の代金は買った日（10/14）の日次合計に入る', () => {
  const d = plan.totals.find((t) => t.date === '2026-10-14');
  assert.equal(d.summary, '[買] 38,320円');   // 取消 -5,000 + 航空券 28,600 + 新幹線 14,720
  assert.match(d.description, /ANA 28,600円/);
  assert.match(d.description, /スマートEX 14,720円/);
});

test('自分宛メモ：はっきりした日付は重要イベント（11）、範囲は帯、年をまたぐ日付は来年', () => {
  assert.deepEqual(ev('memo').map((e) => [e.date, e.endDate, e.summary, e.colorId]), [
    ['2026-10-20', '2026-10-20', '10/20までに区役所で手続き', 11],
    ['2026-10-15', '2026-10-15', '明日 歯医者 15時', 11],
    ['2026-10-27', '2026-10-29', '出張 10/27〜10/29', 11],
    ['2027-01-10', '2027-01-10', '1/10 確定申告の書類をそろえる', 11],
  ]);
});

test('AI に回す：金額が読めないカード通知・宿泊・曖昧なメモ・返信・日付のないメモ', () => {
  assert.deepEqual(plan.aiQueue.map((q) => q.id), ['J', 'M', 'Q', 'R', 'S']);
});

test('同じ入力なら何回計算しても同じ（二重計上しない）', () => {
  const again = JSON.parse(JSON.stringify(load({}).planCalendar(examples.concat(examples))));
  assert.deepEqual(again.totals, plan.totals);
});

test('実際の形式：カード通知の「店名（買物） 金額 JPY」を読み、USD は外貨として別に付ける', () => {
  assert.equal(plan.totals.find((t) => t.date === '2026-09-30').summary, '[買] 1,640円');   // Amazon は合計 ￥0（ポイント）なので数えない
  assert.equal(plan.totals.find((t) => t.date === '2026-09-27').summary, '[買] $22');
});

test('実際の形式：ANA の決済完了は乗る日の予定＋買った日の支払い', () => {
  assert.ok(ev('trip').some((e) => e.date === '2026-09-24' && e.summary === '[ANA] NH000 羽田 07:05 → 広島 08:25'));
  assert.match(plan.totals.find((t) => t.date === '2026-09-23').description, /ANA \(ALL NIPPON AIRWAYS\)|ANA 22,920円/);
  assert.match(plan.totals.find((t) => t.date === '2026-09-23').summary, /22,920円/);
});

test('実際の形式：スマートEX は予定1件、当日の案内メールは予定も代金も重ねない', () => {
  assert.deepEqual(ev('trip').filter((e) => e.date === '2026-09-18').map((e) => e.summary), ['[スマートEX] 新幹線 広島→新大阪（のぞみ000号） 18:12']);
  assert.equal(plan.totals.find((t) => t.date === '2026-09-18').summary, '[買] 11,150円');
});

test('実際の形式：Amazon の「明日到着予定」は受信日の翌日に到着予定を作る', () => {
  assert.ok(ev('arrival').some((e) => e.date === '2026-10-01' && e.summary === '[Amazon] サンプル試験紙 160枚入 到着予定'));
});

test('本文の見えない文字を消す（Amazon の先頭に大量にあり、本文の先頭 1,500 字を埋めてしまう）', () => {
  assert.equal(load({}).compactBody('注文済み͏ ­͏ ­͏ ­\nご注文'), '注文済み\nご注文');
});
