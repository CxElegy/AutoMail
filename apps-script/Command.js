// Supabase の state 'command' に書かれた指示を、毎時の run() のついでに実行する（Claude が Apps Script を開かずに動かすため）。
// 書き方（SQL）：insert into state(key, value) values ('command', '{"name":"backfill","from":"2026-10-01","to":"2026-10-15","status":"pending"}')
//               on conflict (key) do update set value = excluded.value;
// 実行できるのは下の一覧の関数だけ。backfill は時間切れで続きがあれば pending のまま残し、次の回に続ける。

const COMMANDS = { backfill: (budget, cmd) => backfill(budget, cmd.from, cmd.to) };

function runCommand_(budgetMs) {
  const got = supabase_('GET', 'state?select=value&key=eq.command') || [];
  const cmd = got.length ? got[0].value : null;
  if (!cmd || cmd.status !== 'pending' || !Object.prototype.hasOwnProperty.call(COMMANDS, cmd.name)) return null;
  let result, status;
  try {
    result = COMMANDS[cmd.name](budgetMs, cmd) || {};
    status = result.done === false ? 'pending' : 'done';
  } catch (e) {
    result = { error: String(e && e.message || e).slice(0, 500) };
    status = 'error';
  }
  supabase_('POST', 'state?on_conflict=key',
    [{ key: 'command', value: Object.assign({}, cmd, { status, result, at: new Date().toISOString() }), updated_at: new Date().toISOString() }],
    'resolution=merge-duplicates,return=minimal');
  return status;
}
