// Gmail の新着を取得し、ルールで分類して Supabase の mails に記録する（段階1）。
// 広告には automail-skip ラベルを付け、Routine が読まずに済むようにする（段階2・Label.js）。
//
// スクリプトプロパティ（プロジェクトの設定 → スクリプト プロパティ）：
//   SUPABASE_URL         … https://<ref>.supabase.co
//   SUPABASE_SECRET_KEY  … sb_secret_…（ファイルには書かない）
//   SELF_ADDRESSES       … 自分のアドレス（カンマ区切り。例：Outlook のアドレス）。
//                          Outlook から「FW:」で転送されてきたものは中の元の差出人で分類し、
//                          自分のアドレスから転送でなく届いたもの（自分で書いたメモ）だけを自分宛メモにする
//   CURSOR_MS            … 「前回の続き」。setup() が今の時刻で初期化し、run() が進める

const MAX_PER_RUN = 200;           // 1回に記録する上限（古い順）
const OVERLAP_SEC = 3600;          // 取りこぼし防止に1時間重ねて検索する（重複は主キーで無視される）
const TIME_BUDGET_MS = 4 * 60 * 1000;  // Apps Script の1回の上限（6分）より手前で止める
const EXCERPT_CHARS = 1500;

function setup() {
  const props = PropertiesService.getScriptProperties();
  for (const k of ['SUPABASE_URL', 'SUPABASE_SECRET_KEY']) {
    if (!props.getProperty(k)) throw new Error('スクリプトプロパティ ' + k + ' が未設定です');
  }
  if (!props.getProperty('CURSOR_MS')) props.setProperty('CURSOR_MS', String(Date.now()));
  for (const t of ScriptApp.getProjectTriggers()) {
    if (t.getHandlerFunction() === 'run') ScriptApp.deleteTrigger(t);
  }
  ScriptApp.newTrigger('run').timeBased().everyHours(1).create();
  supabase_('GET', 'mails?select=id&limit=1');  // 接続とテーブルの確認（失敗すればここで止まる）
  Logger.log('準備完了。毎時 run() が動きます。前回の続き = ' + new Date(Number(props.getProperty('CURSOR_MS'))).toISOString());
}

function run() {
  const started = Date.now();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;  // 前回の実行がまだ終わっていない
  const props = PropertiesService.getScriptProperties();
  const cursorBefore = Number(props.getProperty('CURSOR_MS') || Date.now());
  const record = { started_at: new Date(started).toISOString(), cursor_before: new Date(cursorBefore).toISOString() };
  try {
    const selfAddresses = (props.getProperty('SELF_ADDRESSES') || '').split(',').map((s) => s.trim()).filter(Boolean);
    const rules = supabase_('GET', 'rules?select=*&enabled=eq.true&order=id.asc') || [];
    const found = fetchNew_(cursorBefore, started);
    // 重ねて検索した1時間分には記録済みのものが混じるので、DB にあるものを除いてから上限をかける
    const known = knownIds_(found.messages.map((msg) => msg.getId()));
    const fresh = found.messages.filter((msg) => !known.has(msg.getId()));
    fresh.sort((a, b) => a.getDate().getTime() - b.getDate().getTime());
    const batch = fresh.slice(0, MAX_PER_RUN);
    const rows = batch.map((msg) => toRow_(msg, rules, selfAddresses));
    labelSkippable_(batch, rows);  // 広告に automail-skip ラベル（DB に書く前に付けて、skip_label も記録する）
    for (let i = 0; i < rows.length; i += 100) {
      supabase_('POST', 'mails?on_conflict=id', rows.slice(i, i + 100), 'resolution=ignore-duplicates,return=minimal');
    }
    const remaining = found.truncated || fresh.length > batch.length;
    // 書けた最後の1通の時刻まで進める（0通なら、時間切れでない限り今の時刻まで進めてよい）
    const cursorAfter = batch.length ? batch[batch.length - 1].getDate().getTime()
      : (remaining ? cursorBefore : Math.max(cursorBefore, started - OVERLAP_SEC * 1000));
    props.setProperty('CURSOR_MS', String(cursorAfter));
    supabase_('POST', 'state?on_conflict=key',
      [{ key: 'cursor', value: { ms: cursorAfter, jst: jst_(cursorAfter), remaining }, updated_at: new Date().toISOString() }],
      'resolution=merge-duplicates,return=minimal');
    // 残り時間で Supabase の指示（state 'command'）を実行する（Command.js）
    const budget = TIME_BUDGET_MS - (Date.now() - started);
    if (budget > 60 * 1000) record.command = runCommand_(budget);
    Object.assign(record, { fetched: fresh.length, written: rows.length, remaining, cursor_after: new Date(cursorAfter).toISOString() });
  } catch (e) {
    record.error = String(e && e.message || e).slice(0, 1000);
    throw e;
  } finally {
    try { supabase_('POST', 'runs', [record], 'return=minimal'); } catch (e2) { Logger.log('runs への記録に失敗: ' + e2); }
    lock.releaseLock();
  }
}
