// 過去の期間をまとめて読む（試験用・手で実行する）。
// backfill()：BACKFILL_FROM〜BACKFILL_TO（JST）のメールを1日ずつ mails に記録する。広告ラベルは付けず、前回の続きも動かさない。
//   6分の上限があるので途中で止まったら、ログに「完了」が出るまで backfill を繰り返し実行する（続きは BACKFILL_NEXT に記録）。
// planBackfill()：記録した期間のメールにカレンダー統合の計画（Calendar.js）をかけ、結果を state の 'plan' に保存する。
//   カレンダーにはまだ何も書かない。

const BACKFILL_FROM = '2026-09-01';
const BACKFILL_TO = '2026-10-01';   // この日は含まない

function jstMidnightMs_(day) {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d) - 9 * 3600 * 1000;
}
function nextDay_(day) {
  return new Date(jstMidnightMs_(day) + 33 * 3600 * 1000).toISOString().slice(0, 10);
}

function backfill() {
  const started = Date.now();
  const props = PropertiesService.getScriptProperties();
  const selfAddresses = (props.getProperty('SELF_ADDRESSES') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const rules = supabase_('GET', 'rules?select=*&enabled=eq.true&order=id.asc') || [];
  let day = props.getProperty('BACKFILL_NEXT') || BACKFILL_FROM, written = 0;
  while (day < BACKFILL_TO && Date.now() - started < TIME_BUDGET_MS) {
    const from = jstMidnightMs_(day), to = jstMidnightMs_(nextDay_(day));
    const msgs = [];
    for (let start = 0; ; start += 100) {
      const threads = GmailApp.search('after:' + Math.floor(from / 1000) + ' before:' + Math.floor(to / 1000), start, 100);
      for (const th of threads) for (const m of th.getMessages()) {
        const t = m.getDate().getTime();
        if (t >= from && t < to) msgs.push(m);
      }
      if (threads.length < 100) break;
    }
    const known = knownIds_(msgs.map((m) => m.getId()));
    const rows = msgs.filter((m) => !known.has(m.getId())).map((m) => toRow_(m, rules, selfAddresses));
    for (let i = 0; i < rows.length; i += 100) {
      supabase_('POST', 'mails?on_conflict=id', rows.slice(i, i + 100), 'resolution=ignore-duplicates,return=minimal');
    }
    written += rows.length;
    day = nextDay_(day);
    props.setProperty('BACKFILL_NEXT', day);
  }
  Logger.log((day >= BACKFILL_TO ? '完了' : '続きあり（もう一度 backfill を実行）次は ' + day) + '。今回 ' + written + ' 通を記録');
}

function planBackfill() {
  const range = 'received_at=gte.' + new Date(jstMidnightMs_(BACKFILL_FROM)).toISOString() +
    '&received_at=lt.' + new Date(jstMidnightMs_(BACKFILL_TO)).toISOString();
  const rows = [];
  for (let off = 0; ; off += 1000) {
    const got = supabase_('GET', 'mails?select=id,received_at,category,route,subject,from_name,from_address,excerpt&' +
      range + '&order=received_at.asc&limit=1000&offset=' + off) || [];
    rows.push(...got);
    if (got.length < 1000) break;
  }
  const plan = planCalendar(rows);
  const summary = { from: BACKFILL_FROM, to: BACKFILL_TO, mails: rows.length, totals: plan.totals.length, events: plan.events.length, ai: plan.aiQueue.length };
  supabase_('POST', 'state?on_conflict=key', [{ key: 'plan', value: Object.assign({ summary }, plan), updated_at: new Date().toISOString() }],
    'resolution=merge-duplicates,return=minimal');
  Logger.log('計画を保存しました：' + JSON.stringify(summary));
}
