// 段階1：Gmail の新着を取得し、ルールで分類して Supabase の mails に記録する。
// Gmail は読むだけ（ラベルも付けない）。今の Routine と並走させて、結果を突き合わせるための段階。
//
// スクリプトプロパティ（プロジェクトの設定 → スクリプト プロパティ）：
//   SUPABASE_URL         … https://<ref>.supabase.co
//   SUPABASE_SECRET_KEY  … sb_secret_…（ファイルには書かない）
//   SELF_ADDRESSES       … 自分宛メモの送信元（カンマ区切り。例：Outlook のアドレス）
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
    Object.assign(record, { fetched: fresh.length, written: rows.length, remaining, cursor_after: new Date(cursorAfter).toISOString() });
  } catch (e) {
    record.error = String(e && e.message || e).slice(0, 1000);
    throw e;
  } finally {
    try { supabase_('POST', 'runs', [record], 'return=minimal'); } catch (e2) { Logger.log('runs への記録に失敗: ' + e2); }
    lock.releaseLock();
  }
}

// cursor より後に届いたメッセージを集める。時間切れなら truncated=true で返す。
function fetchNew_(cursorMs, started) {
  const query = 'after:' + Math.floor(cursorMs / 1000 - OVERLAP_SEC);
  const messages = [];
  let truncated = false;
  for (let start = 0; ; start += 100) {
    const threads = GmailApp.search(query, start, 100);
    for (const th of threads) {
      for (const msg of th.getMessages()) {
        if (msg.getDate().getTime() > cursorMs - OVERLAP_SEC * 1000) messages.push(msg);
      }
    }
    if (threads.length < 100) break;
    if (Date.now() - started > TIME_BUDGET_MS / 2) { truncated = true; break; }
  }
  return { messages, truncated };
}

// すでに mails にある ID の集合
function knownIds_(ids) {
  const known = new Set();
  for (let i = 0; i < ids.length; i += 50) {
    const part = ids.slice(i, i + 50);
    const got = supabase_('GET', 'mails?select=id&id=in.(' + part.map(encodeURIComponent).join(',') + ')') || [];
    for (const r of got) known.add(r.id);
  }
  return known;
}

function toRow_(msg, rules, selfAddresses) {
  const from = parseAddress(msg.getFrom());
  const body = (msg.getPlainBody() || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  const m = {
    subject: msg.getSubject() || '',
    fromName: from.name,
    fromAddress: from.address,
    excerpt: body.slice(0, EXCERPT_CHARS),
    listUnsubscribe: !!msg.getHeader('List-Unsubscribe'),
  };
  const c = classify(m, rules, selfAddresses);
  const amounts = extractYen(m.subject + '\n' + m.excerpt);
  return {
    id: msg.getId(),
    thread_id: msg.getThread().getId(),
    received_at: msg.getDate().toISOString(),
    from_name: from.name,
    from_address: from.address,
    to_address: parseAddress(String(msg.getTo() || '').split(',')[0]).address,
    subject: m.subject,
    excerpt: m.excerpt,
    list_unsubscribe: m.listUnsubscribe,
    category: c.category,
    route: c.route,
    urgent: c.urgent,
    rule: c.rule,
    amounts: amounts.length ? amounts : null,
  };
}

function supabase_(method, path, body, prefer) {
  const props = PropertiesService.getScriptProperties();
  const base = String(props.getProperty('SUPABASE_URL') || '').replace(/\/$/, '');
  const key = props.getProperty('SUPABASE_SECRET_KEY');
  const headers = { apikey: key, Accept: 'application/json' };
  if (String(key).indexOf('eyJ') === 0) headers.Authorization = 'Bearer ' + key;  // 旧形式の JWT キーだけ
  if (prefer) headers.Prefer = prefer;
  const options = { method: method.toLowerCase(), headers, muteHttpExceptions: true };
  if (body !== undefined) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(body);
  }
  const res = UrlFetchApp.fetch(base + '/rest/v1/' + path, options);
  const code = res.getResponseCode();
  if (code >= 300) throw new Error('Supabase ' + method + ' ' + path.split('?')[0] + ' → ' + code + ' ' + res.getContentText().slice(0, 300));
  const text = res.getContentText();
  return text ? JSON.parse(text) : null;
}

function jst_(ms) {
  return Utilities.formatDate(new Date(ms), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
}
