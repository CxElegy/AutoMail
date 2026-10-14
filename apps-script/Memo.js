// 段階2b（試作）：自分宛メモの日付を読んで予定にする（重要イベント：colorId 11・終日・タグなし）。
// はっきりした日付（10/20・10月20日・明日・明後日・10/22〜10/24）だけをスクリプトで扱い、
// 「23日か24日」「来週」「金曜」のような曖昧なもの、返信（RE: / 過去メモの引用）、日付がないものは AI に回す。

const MEMO_AMBIGUOUS_RE = /か\s*\d{1,2}\s*日|来週|再来週|今週|月末|週末|[月火水木金土日]曜|頃|ごろ|くらい|未定|延長|完了|失敗/;
const MEMO_RANGE_RE = /(\d{1,2})[\/月](\d{1,2})日?\s*[〜~～ー-]\s*(?:(\d{1,2})[\/月])?(\d{1,2})日?/;
const MEMO_DATE_RE = /(?:(\d{4})[\/年])?(\d{1,2})[\/月](\d{1,2})日?/;

function memoEvent_(row) {
  const subject = String(row.subject || '').trim();
  const text = subject + '\n' + String(row.excerpt || '');
  if (/^\s*(RE|Re|返信)\s*[:：]/.test(subject) || /^>/m.test(row.excerpt || '')) return null;  // 返信は既存の予定の更新なので AI
  if (MEMO_AMBIGUOUS_RE.test(text)) return null;
  const base = jstParts_(row.received_at).date;   // 受信日（JST）
  const [by, bm, bd] = base.split('-').map(Number);
  const ymd = (y, m, d) => { const t = new Date(Date.UTC(y, m - 1, d)); return t.toISOString().slice(0, 10); };
  const fix = (m, d, y) => {   // 年がなければ受信日から決める（1か月以上前の日付なら来年とみなす）
    let s = ymd(y || by, m, d);
    if (!y && s < ymd(by, bm, bd - 30)) s = ymd(by + 1, m, d);
    return s;
  };
  let start, end;
  const r = text.match(MEMO_RANGE_RE), d = text.match(MEMO_DATE_RE);
  if (r) { start = fix(+r[1], +r[2]); end = fix(+(r[3] || r[1]), +r[4]); }
  else if (/明後日|あさって/.test(text)) start = end = ymd(by, bm, bd + 2);
  else if (/明日|あした/.test(text)) start = end = ymd(by, bm, bd + 1);
  else if (/今日|本日/.test(text)) start = end = base;
  else if (d) start = end = fix(+d[2], +d[3], d[1] && +d[1]);
  else return null;   // 日付がない
  const title = subject.replace(/^\s*(FW|Fwd?|転送)\s*[:：]\s*/i, '') || String(row.excerpt || '').split('\n')[0];
  return { kind: 'memo', date: start, endDate: end, summary: title.slice(0, 60), colorId: 11, transparency: 'transparent' };
}
