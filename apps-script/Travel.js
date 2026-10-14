// 段階2b（試作）：航空券・新幹線のメールから「乗る日の予定」と「買った日の支払い」を取り出す。
// 往復など1通に複数の便があれば、搭乗日／乗車日ごとに分けて1件ずつ予定にする。読めなければ null（AI に回す）。

const AIRLINES = { NH: 'ANA', JL: 'JAL', MM: 'Peach', BC: 'スカイマーク', GK: 'ジェットスター' };
const TRIP_SPLIT_RE = /(?=(?:搭乗日|乗車日)\s*[:：])/;
const TRIP_RE = {
  date: /(?:搭乗日|乗車日)\s*[:：]\s*(\d{4})[\/年](\d{1,2})[\/月](\d{1,2})/,
  flight: /便名\s*[:：]\s*([A-Z]{2})\s*(\d{1,4})/,
  train: /列車名?\s*[:：]\s*(\S+?)\s*(\d+)\s*号/,
  dep: /出発\s*[:：]\s*(\S+)\s+(\d{1,2}):(\d{2})/,
  arr: /到着\s*[:：]\s*(\S+)\s+(\d{1,2}):(\d{2})/,
  paid: /(?:お支払い金額|合計金額|ご請求額|運賃合計)\s*[:：]\s*[¥￥]?\s*([0-9,]+)/,
};

function parseTrip_(row) {
  const text = row.excerpt || '';
  const legs = [];
  for (const seg of text.split(TRIP_SPLIT_RE)) {
    const d = seg.match(TRIP_RE.date), dep = seg.match(TRIP_RE.dep), arr = seg.match(TRIP_RE.arr);
    if (!d || !dep || !arr) continue;
    const p = (n) => String(n).padStart(2, '0');
    const date = d[1] + '-' + p(d[2]) + '-' + p(d[3]);
    const f = seg.match(TRIP_RE.flight), t = seg.match(TRIP_RE.train);
    const route = dep[1] + ' ' + p(dep[2]) + ':' + dep[3] + ' → ' + arr[1] + ' ' + p(arr[2]) + ':' + arr[3];
    const summary = f ? '[' + (AIRLINES[f[1]] || f[1]) + '] ' + f[1] + f[2] + ' ' + route
      : '[' + (row.from_name || '新幹線') + '] 新幹線 ' + dep[1] + '→' + arr[1] + (t ? '（' + t[1] + t[2] + '号）' : '') + ' ' + p(dep[2]) + ':' + dep[3];
    legs.push({ kind: 'trip', date, start: p(dep[2]) + ':' + dep[3], end: p(arr[2]) + ':' + arr[3], summary, colorId: 9, transparency: 'opaque' });
  }
  if (!legs.length) return null;
  const paid = text.match(TRIP_RE.paid);
  return { legs, amount: paid ? parseInt(paid[1].replace(/,/g, ''), 10) : null, shop: legs[0].summary.match(/^\[([^\]]+)\]/)[1] };
}
