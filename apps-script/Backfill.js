// 過去の期間をまとめて mails に記録する（手で実行するか、Supabase の state 'command' で指示する）。
// backfill(budget, from, to)：from〜to（JST、to の日は含まない）のメールを1日ずつ記録する。前回の続き（CURSOR_MS）は動かさない。
//   期間を省くと下の既定値。6分の上限があるので途中で止まったら、ログに「完了」が出るまで繰り返す（続きは BACKFILL_NEXT に記録）。

const BACKFILL_FROM = '2026-09-01';
const BACKFILL_TO = '2026-10-01';   // この日は含まない

function jstMidnightMs_(day) {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d) - 9 * 3600 * 1000;
}
function nextDay_(day) {
  return new Date(jstMidnightMs_(day) + 33 * 3600 * 1000).toISOString().slice(0, 10);
}

function backfill(budgetMs, fromDay, toDay) {
  const started = Date.now(), budget = budgetMs || TIME_BUDGET_MS;
  const FROM = fromDay || BACKFILL_FROM, TO = toDay || BACKFILL_TO;
  const props = PropertiesService.getScriptProperties();
  const selfAddresses = (props.getProperty('SELF_ADDRESSES') || '').split(',').map((s) => s.trim()).filter(Boolean);
  // 続きは期間ごとに覚える（別の期間を指示されたら最初から）
  const saved = JSON.parse(props.getProperty('BACKFILL_NEXT_JSON') || '{}');
  let day = saved.from === FROM && saved.to === TO ? saved.next : FROM, written = 0;
  while (day < TO && Date.now() - started < budget) {
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
    const rows = msgs.filter((m) => !known.has(m.getId())).map((m) => toRow_(m, selfAddresses));
    for (let i = 0; i < rows.length; i += 100) {
      supabase_('POST', 'mails?on_conflict=id', rows.slice(i, i + 100), 'resolution=ignore-duplicates,return=minimal');
    }
    written += rows.length;
    day = nextDay_(day);
    props.setProperty('BACKFILL_NEXT_JSON', JSON.stringify({ from: FROM, to: TO, next: day }));
  }
  Logger.log((day >= TO ? '完了' : '続きあり（もう一度 backfill を実行）次は ' + day) + '。今回 ' + written + ' 通を記録');
  return { done: day >= TO, from: FROM, to: TO, next: day, written };
}
