// 段階2b（試作・まだ実行しない）：mails の行から Google カレンダーへの書き込み計画を作る。
// 外部の API は使わない純粋な関数。毎回その日の全メールから計算し直すので、何回動かしても同じ結果になる
// （前回の予定に足し算しないので二重計上しない）。カードの通知は「日付・利用先・金額」が同じなら1回だけ数える。

const CARD_RE = {
  date: /(?:ご利用日時|ご利用日|利用日)\s*[:：]\s*(\d{4})[\/年](\d{1,2})[\/月](\d{1,2})日?(?:\s*(\d{1,2}):(\d{2}))?/,
  merchant: /(?:ご利用先|利用先|ご利用店名?)\s*[:：]\s*(.+)/,
  amount: /(?:ご利用金額|利用金額)\s*[:：]\s*[¥￥]?\s*(-?[0-9,]+)\s*円?/,
};
const ORDER_AMOUNT_RE = /(?:ご請求額|注文合計|お支払い金額|合計金額)\s*[:：]?\s*[¥￥]?\s*([0-9,]+)/;
const ARRIVAL_DATE_RE = /お届け予定日?\s*[:：]?\s*(?:(\d{4})[\/年])?(\d{1,2})[\/月](\d{1,2})日?/;
const ITEM_RE = /(?:商品名|ご注文商品)\s*[:：]\s*(.+)/;
const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

function jstParts_(iso) {  // 受信時刻（UTC）→ JST の日付と時刻
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return { date: d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()), time: p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) };
}
const yen_ = (n) => n.toLocaleString('en-US') + '円';
const num_ = (s) => parseInt(String(s).replace(/,/g, ''), 10);

// 買い物の日次合計（[買] 合計）に入れる明細を1件取り出す。取れなければ null（AI に回す）
function purchaseLine_(row) {
  const t = row.excerpt || '';
  if (row.category === 'カード利用') {
    const d = t.match(CARD_RE.date), m = t.match(CARD_RE.merchant), a = t.match(CARD_RE.amount);
    if (!d || !a) return null;
    const p = (n) => String(n).padStart(2, '0');
    return { date: d[1] + '-' + p(d[2]) + '-' + p(d[3]), time: d[4] ? p(d[4]) + ':' + d[5] : '', shop: m ? m[1].trim() : '（利用先未確認）',
      amount: num_(a[1]) * (/返品|取消|取り消し/.test(t) ? -1 : 1), via: 'card' };
  }
  if (row.category === '買い物') {
    const a = t.match(ORDER_AMOUNT_RE);
    if (!a) return null;
    const j = jstParts_(row.received_at);
    return { date: j.date, time: j.time, shop: row.from_name || row.from_address, amount: num_(a[1]), via: 'order', item: (t.match(ITEM_RE) || [])[1] };
  }
  return null;
}

function planCalendar(rows) {
  const days = {}, events = [], aiQueue = [];
  const addLine = (line) => {
    const list = days[line.date] = days[line.date] || [];
    // 同じ取引の重複を外す：カード通知どうし（都度と明細）、カード通知と注文メール（同じ日・同じ金額）
    const dup = list.some((x) => x.amount === line.amount && (x.shop === line.shop || x.via !== line.via));
    if (!dup) list.push(line);
  };
  for (const row of rows) {
    if (row.category === '広告') continue;
    if (row.category === 'カード利用' || row.category === '買い物') {
      const line = purchaseLine_(row);
      if (!line) { aiQueue.push({ id: row.id, why: '金額や日付が本文から取れない', subject: row.subject }); continue; }
      addLine(line);
    } else if (row.category === '到着') {
      const t = row.excerpt || '', d = t.match(ARRIVAL_DATE_RE);
      if (!d) { aiQueue.push({ id: row.id, why: '到着日が本文から取れない', subject: row.subject }); continue; }
      const y = d[1] || jstParts_(row.received_at).date.slice(0, 4), p = (n) => String(n).padStart(2, '0');
      const item = ((t.match(ITEM_RE) || [])[1] || row.subject).trim();
      events.push({ kind: 'arrival', date: y + '-' + p(d[2]) + '-' + p(d[3]), summary: '[' + (row.from_name || '配送') + '] ' + item + ' 到着予定', colorId: 7 });
    } else if (row.category === '移動・宿泊') {
      const trip = parseTrip_(row);
      if (!trip) { aiQueue.push({ id: row.id, why: '便・列車・時刻が本文から取れない（宿泊を含む）', subject: row.subject }); continue; }
      events.push(...trip.legs);
      const j = jstParts_(row.received_at);   // 買った日（メールを受け取った日）の支払いとして日次合計へ
      if (trip.amount) addLine({ date: j.date, time: j.time, shop: trip.shop, amount: trip.amount, via: 'order', item: trip.legs.map((l) => l.summary.replace(/^\[[^\]]+\]\s*/, '')).join(' / ') });
    } else if (row.category === '自分宛メモ') {
      const ev = memoEvent_(row);
      if (ev) events.push(ev); else aiQueue.push({ id: row.id, why: '自分宛メモ（日付が曖昧・返信・日付なし）', subject: row.subject });
    } else if (row.route === 'ai') {
      aiQueue.push({ id: row.id, why: row.category, subject: row.subject });
    }
  }
  const totals = Object.keys(days).sort().map((date) => {
    const lines = days[date].sort((a, b) => a.time.localeCompare(b.time));
    const total = lines.reduce((s, l) => s + l.amount, 0);
    const [y, m, d] = date.split('-').map(Number);
    const w = WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    const body = lines.map((l) => '・' + (l.time ? l.time + ' ' : '') + l.shop + ' ' + yen_(l.amount) + (l.item ? ' — ' + l.item : '')).join('\n');
    return { date, summary: '[買] ' + yen_(total), colorId: 7, transparency: 'transparent',
      description: m + '/' + d + '（' + w + '）の買い物 合計 ' + yen_(total) + '（' + lines.length + '件）\n\n■ 内訳\n' + body };
  });
  return { totals, events, aiQueue };
}
