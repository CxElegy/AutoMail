// 段階2b（試作・まだ実行しない）：mails の行から Google カレンダーへの書き込み計画を作る。
// 外部の API は使わない純粋な関数。毎回その日の全メールから計算し直すので、何回動かしても同じ結果になる
// （前回の予定に足し算しないので二重計上しない）。カードの通知は「日付・利用先・金額」が同じなら1回だけ数える。

const ARRIVAL_DATE_RE = /お届け予定日?\s*[:：]?\s*(?:(\d{4})[\/年])?(\d{1,2})[\/月](\d{1,2})日?|(\d{1,2})月(\d{1,2})日[^\n]{0,6}到着予定|(本日|明日|明後日)到着予定/;
const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

function jstParts_(iso) {  // 受信時刻（UTC）→ JST の日付と時刻
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return { date: d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()), time: p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) };
}
const yen_ = (n) => n.toLocaleString('en-US') + '円';

function planCalendar(rows) {
  const days = {}, events = [], aiQueue = [], seen = new Set();
  const arrival = (row) => {   // 到着予定：日付（M月D日・お届け予定日・本日／明日／明後日）が読めたときだけ予定にする
    const t = row.excerpt || '', d = t.match(ARRIVAL_DATE_RE);
    if (!d) return false;
    const j = jstParts_(row.received_at), [y0, m0, d0] = j.date.split('-').map(Number);
    const rel = { '本日': 0, '明日': 1, '明後日': 2 }[d[6]];
    const date = rel !== undefined ? new Date(Date.UTC(y0, m0 - 1, d0 + rel)).toISOString().slice(0, 10)
      : (d[1] || y0) + '-' + pad_(d[2] || d[4]) + '-' + pad_(d[3] || d[5]);
    const it = t.match(ITEM_RE), item = (it ? (it[1] || it[2]) : row.subject).trim().slice(0, 40);
    const summary = '[' + (row.from_name || '配送').replace(/\.co\.jp$/, '') + '] ' + item + ' 到着予定';
    if (!seen.has(date + summary)) { seen.add(date + summary); events.push({ kind: 'arrival', date, summary, colorId: 7 }); }
    return true;
  };
  const addLine = (line) => {
    const list = days[line.date] = days[line.date] || [];
    // 同じ取引の重複を外す：カード通知どうし（都度と明細）、カード通知と注文メール（同じ日・同じ金額）
    const dup = list.some((x) => (x.fx || line.fx) ? JSON.stringify(x.fx) === JSON.stringify(line.fx) && x.shop === line.shop
      : x.amount === line.amount && (x.shop === line.shop || x.via !== line.via));
    if (!dup) list.push(line);
  };
  for (const row of rows) {
    if (row.category === '広告') continue;
    const trip = (row.category === '移動・宿泊' || row.category === '買い物') ? parseTrip_(row) : null;
    if (trip) {
      for (const l of trip.legs) if (!seen.has(l.date + l.summary)) { seen.add(l.date + l.summary); events.push(l); }
      const j = jstParts_(row.received_at);   // 代金は買った日（メールを受け取った日）の日次合計へ。乗車当日の案内メールは数えない
      if (trip.amount) addLine({ date: j.date, time: j.time, shop: trip.shop, amount: trip.amount, via: 'order', item: trip.legs.map((l) => l.summary.replace(/^\[[^\]]+\]\s*/, '')).join(' / ') });
    } else if (row.category === 'カード利用' || row.category === '買い物') {
      const lines = purchaseLines_(row);
      if (!lines.length) { aiQueue.push({ id: row.id, why: '金額や日付が本文から取れない', subject: row.subject }); continue; }
      lines.filter((l) => !l.skip).forEach(addLine);
      if (row.category === '買い物') arrival(row);
    } else if (row.category === '到着') {
      if (!arrival(row)) aiQueue.push({ id: row.id, why: '到着日が本文から取れない', subject: row.subject });
    } else if (row.category === '移動・宿泊') {
      aiQueue.push({ id: row.id, why: '便・列車・時刻が本文から取れない（宿泊を含む）', subject: row.subject });
    } else if (row.category === '自分宛メモ') {
      const ev = memoEvent_(row);
      if (ev) events.push(ev); else aiQueue.push({ id: row.id, why: '自分宛メモ（日付が曖昧・返信・日付なし）', subject: row.subject });
    } else if (row.route === 'ai') {
      aiQueue.push({ id: row.id, why: row.category, subject: row.subject });
    }
  }
  const totals = Object.keys(days).sort().map((date) => {
    // 「UBER * EATS PENDING」のような仮の承認は、同じ日に同じ店の確定分があれば数えない
    const shopKey = (l) => l.shop.normalize('NFKC').toUpperCase().split(/[\s*＊／]+/)[0];
    const lines = days[date].filter((l) => !/PENDING/i.test(l.shop) || !days[date].some((o) => o !== l && !/PENDING/i.test(o.shop) && shopKey(o) === shopKey(l)))
      .sort((a, b) => a.time.localeCompare(b.time));
    const total = lines.reduce((s, l) => s + l.amount, 0), fx = {};
    lines.filter((l) => l.fx).forEach((l) => { fx[l.fx.cur] = (fx[l.fx.cur] || 0) + l.fx.val; });
    const fxText = Object.keys(fx).map((c) => '+' + (c === 'USD' ? '$' : c + ' ') + fx[c].toFixed(2).replace(/\.00$/, '')).join('');
    const [y, m, d] = date.split('-').map(Number);
    const w = WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    const body = lines.map((l) => '・' + (l.time ? l.time + ' ' : '') + l.shop + ' ' + (l.fx ? l.fx.val + ' ' + l.fx.cur : yen_(l.amount)) + (l.item ? ' — ' + l.item : '')).join('\n');
    const head = total || !fxText ? yen_(total) + fxText : fxText.replace(/^\+/, '');
    return { date, summary: '[買] ' + head, colorId: 7, transparency: 'transparent',
      description: m + '/' + d + '（' + w + '）の買い物 合計 ' + (total || !fxText ? yen_(total) : '0円') + fxText + '（' + lines.length + '件）\n\n■ 内訳\n' + body };
  });
  return { totals, events, aiQueue };
}
