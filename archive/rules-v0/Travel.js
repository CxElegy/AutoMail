// 段階2b（試作）：航空券・新幹線のメールから「乗る日の予定」と「買った日の支払い」を取り出す。実際の形式に合わせてある：
//   ANA（決済完了）：「[1]09月24日(木) NH671」「東京(羽田) - 広島」「07:05発08:25着」「＜お支払い総額＞ 22,920円」
//   スマートEX（新幹線予約内容）：「乗車日　2026年9月18日」「広島(18:12)→のぞみ194号→新大阪(19:37)」「領収額は、合計　11,150円」
// 往復など複数の便はそれぞれ1件の予定にする。代金は購入の確認メールのときだけ数える（当日の案内・変更のお知らせは数えない）。

const AIRLINES = { NH: 'ANA', JL: 'JAL', MM: 'Peach', BC: 'スカイマーク', GK: 'ジェットスター', '6J': 'ソラシドエア', '7G': 'スターフライヤー' };
const ANA_LEG_RE = /\[\d+\]\s*(\d{1,2})月(\d{1,2})日\([^)]*\)\s*([A-Z0-9]{2})\s*(\d{1,4})\s*\n\s*(.+?)\s+-\s+(.+?)\s*\n[\s\S]{0,120}?(\d{1,2}):(\d{2})発\s*(\d{1,2}):(\d{2})着/g;
const EX_LEG_RE = /乗車日\s*(\d{4})年(\d{1,2})月(\d{1,2})日\s*\n\s*([^\s(]+)\((\d{1,2}):(\d{2})\)→(\S+?)→([^\s(]+)\((\d{1,2}):(\d{2})\)/g;
const SIMPLE_LEG_RE = /(?:搭乗日|乗車日)\s*[:：]\s*(\d{4})[\/年](\d{1,2})[\/月](\d{1,2})日?[\s\S]*?(?:便名\s*[:：]\s*([A-Z0-9]{2})\s*(\d{1,4})|列車名?\s*[:：]\s*(\S+?)\s*(\d+)\s*号)[\s\S]*?出発\s*[:：]\s*(\S+)\s+(\d{1,2}):(\d{2})[\s\S]*?到着\s*[:：]\s*(\S+)\s+(\d{1,2}):(\d{2})/g;
const TRIP_PAID_RE = /(?:お支払い総額[＞>]?|領収額は、合計|お支払い金額|合計金額|ご請求額|運賃合計)\s*[:：]?\s*[¥￥]?\s*([0-9,]+)\s*円?/;
const NOT_PURCHASE_RE = /本日|乗車分|搭乗案内|搭乗口|変更|リマインド|前日/;

const station_ = (s) => { const m = String(s).trim().match(/\(([^)]+)\)$/); return m ? m[1] : String(s).trim(); };
const hm_ = (h, m) => pad_(h) + ':' + m;
function flightLeg_(date, code, no, from, dep, to, arr) {
  return { kind: 'trip', date, start: dep, end: arr, colorId: 9, transparency: 'opaque',
    summary: '[' + (AIRLINES[code] || code) + '] ' + code + no + ' ' + station_(from) + ' ' + dep + ' → ' + station_(to) + ' ' + arr };
}
function trainLeg_(date, brand, from, dep, train, to, arr) {
  return { kind: 'trip', date, start: dep, end: arr, colorId: 9, transparency: 'opaque',
    summary: '[' + brand + '] 新幹線 ' + from + '→' + to + '（' + train + '） ' + dep };
}

function parseTrip_(row) {
  const t = row.excerpt || '', legs = [];
  const y0 = (t.match(/(\d{4})年\d{1,2}月\d{1,2}日\s*\d{1,2}時\d{2}分現在/) || [])[1] || jstParts_(row.received_at).date.slice(0, 4);
  for (const m of t.matchAll(ANA_LEG_RE)) legs.push(flightLeg_(y0 + '-' + pad_(m[1]) + '-' + pad_(m[2]), m[3], m[4], m[5], hm_(m[7], m[8]), m[6], hm_(m[9], m[10])));
  const brand = /スマートEX|expy/i.test(row.from_name + row.from_address + row.subject) ? 'スマートEX' : (row.from_name || '新幹線');
  for (const m of t.matchAll(EX_LEG_RE)) legs.push(trainLeg_(m[1] + '-' + pad_(m[2]) + '-' + pad_(m[3]), brand, m[4], hm_(m[5], m[6]), m[7], m[8], hm_(m[9], m[10])));
  for (const m of t.matchAll(SIMPLE_LEG_RE)) {
    const date = m[1] + '-' + pad_(m[2]) + '-' + pad_(m[3]), dep = hm_(m[9], m[10]), arr = hm_(m[12], m[13]);
    legs.push(m[4] ? flightLeg_(date, m[4], m[5], m[8], dep, m[11], arr) : trainLeg_(date, brand, m[8], dep, m[6] + m[7] + '号', m[11], arr));
  }
  if (!legs.length) return null;
  const paid = !NOT_PURCHASE_RE.test(row.subject || '') && t.match(TRIP_PAID_RE);
  return { legs, amount: paid ? parseInt(paid[1].replace(/,/g, ''), 10) : null, shop: legs[0].summary.match(/^\[([^\]]+)\]/)[1] };
}
