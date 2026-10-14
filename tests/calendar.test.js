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
  assert.equal(plan.totals.find((t) => t.date === '2026-10-14').summary, '[買] -5,000円');
});

test('到着は到着日に別の予定（金額なし）', () => {
  assert.deepEqual(plan.arrivals, [{ date: '2026-10-16', summary: '[Amazon] 猫用フード 2kg 到着予定', colorId: 7 }]);
});

test('広告は何もしない。自分宛メモと、金額が読めないカード通知は AI に回す', () => {
  assert.deepEqual(plan.aiQueue.map((q) => q.id), ['I', 'J']);
});

test('同じ入力なら何回計算しても同じ（二重計上しない）', () => {
  const again = JSON.parse(JSON.stringify(load({}).planCalendar(examples.concat(examples))));
  assert.deepEqual(again.totals, plan.totals);
});
