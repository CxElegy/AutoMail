// 段階2b（試作）：買い物の日次合計（[買] 合計）に入れる明細を取り出す。実際のメールの形式に合わせてある：
//   カード利用通知：「ご利用日時：2026/09/30 19:13」＋「店名（買物） 1,640.00 JPY」（1通に複数行あり得る。USD など外貨もある）
//   注文メール：「合計 ￥2,480」「ご請求額」「お支払い総額」「領収額は、合計　11,150円」など（ポイント払いで ￥0 なら数えない）
// 取れなければ空の配列（AI に回す）。

const CARD_DATE_RE = /(?:ご利用日時|ご利用日|利用日)\s*[:：]\s*(\d{4})[\/年](\d{1,2})[\/月](\d{1,2})日?(?:\s*(\d{1,2}):(\d{2}))?/;
const CARD_LINE_RE = /^\s*(.+?)（(買物|返品|取消|[^）]{1,8})）\s+(-?[0-9,]+(?:\.\d+)?)\s*([A-Z]{3}|円)\s*$/mg;
const CARD_OLD_RE = { shop: /(?:ご利用先|利用先|ご利用店名?)\s*[:：]\s*(.+)/, amount: /(?:ご利用金額|利用金額)\s*[:：]\s*[¥￥]?\s*(-?[0-9,]+)\s*円?/ };
const ORDER_AMOUNT_RE = /(?:ご請求額|注文合計|お支払い総額[＞>]?|お支払い金額|合計金額|領収額は、合計|^\s*合計)\s*[:：]?\s*[¥￥]?\s*([0-9,]+)\s*円?/m;
const ITEM_RE = /(?:商品名|ご注文商品)\s*[:：]\s*(.+)|^\s*\[([^\]\n]{4,80})\]\s*$/m;

const pad_ = (n) => String(n).padStart(2, '0');
const num_ = (s) => Math.round(parseFloat(String(s).replace(/,/g, '')));

function purchaseLines_(row) {
  const t = row.excerpt || '';
  if (row.category === 'カード利用') {
    const d = t.match(CARD_DATE_RE);
    if (!d) return [];
    const date = d[1] + '-' + pad_(d[2]) + '-' + pad_(d[3]), time = d[4] ? pad_(d[4]) + ':' + d[5] : '';
    const out = [];
    for (const m of t.matchAll(CARD_LINE_RE)) {
      const sign = /返品|取消/.test(m[2]) ? -1 : 1, val = Math.abs(parseFloat(m[3].replace(/,/g, ''))) * sign;  // 返品の行は「-13,870円」と負号つきで来る
      out.push(m[4] === 'JPY' || m[4] === '円' ? { date, time, shop: m[1].trim(), amount: Math.round(val), via: 'card' }
        : { date, time, shop: m[1].trim(), amount: 0, fx: { cur: m[4], val }, via: 'card' });
    }
    if (!out.length) {   // 古い形式（ご利用先：／ご利用金額：）
      const a = t.match(CARD_OLD_RE.amount), s = t.match(CARD_OLD_RE.shop);
      if (a) out.push({ date, time, shop: s ? s[1].trim() : '（利用先未確認）', amount: num_(a[1]) * (/返品|取消|取り消し/.test(t) ? -1 : 1), via: 'card' });
    }
    return out;
  }
  if (row.category === '買い物') {
    const a = t.match(ORDER_AMOUNT_RE);
    if (!a) return [];
    if (num_(a[1]) === 0) return [{ skip: true }];   // ポイント払いなど：支払い 0 円は数えない
    const j = jstParts_(row.received_at), it = t.match(ITEM_RE);
    return [{ date: j.date, time: j.time, shop: row.from_name || row.from_address, amount: num_(a[1]), via: 'order', item: it ? (it[1] || it[2]).trim() : undefined }];
  }
  return [];
}
