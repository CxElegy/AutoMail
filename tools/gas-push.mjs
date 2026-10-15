// apps-script/ のファイルを、ユーザーの Apps Script プロジェクトへ Apps Script API で上書きする（コピペの代わり）。
// 必要な環境変数（クラウド環境のシークレットに置く。ファイルやチャットには書かない）：
//   GAS_CLIENT_ID, GAS_CLIENT_SECRET, GAS_REFRESH_TOKEN（スコープ script.projects だけ）, GAS_SCRIPT_ID
// 使い方：node tools/gas-push.mjs            … 送る内容の一覧だけ表示（送らない）
//         node tools/gas-push.mjs --push     … 実際に上書きする（プロジェクトにある他のファイルは消える）
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'apps-script');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort().map((f) => ({
  name: f.replace(/\.js$/, ''), type: 'SERVER_JS', source: fs.readFileSync(path.join(dir, f), 'utf8'),
}));
files.push({ name: 'appsscript', type: 'JSON', source: fs.readFileSync(path.join(dir, 'appsscript.json'), 'utf8') });
console.log(files.map((f) => `${f.name} (${f.source.split('\n').length} 行)`).join('\n'));
if (!process.argv.includes('--push')) process.exit(0);

const env = (k) => { const v = process.env[k]; if (!v) throw new Error(`環境変数 ${k} がありません`); return v; };
const tok = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: env('GAS_CLIENT_ID'), client_secret: env('GAS_CLIENT_SECRET'),
    refresh_token: env('GAS_REFRESH_TOKEN'), grant_type: 'refresh_token' }),
}).then((r) => r.json());
if (!tok.access_token) throw new Error('トークンの更新に失敗: ' + (tok.error_description || tok.error));
const res = await fetch(`https://script.googleapis.com/v1/projects/${env('GAS_SCRIPT_ID')}/content`, {
  method: 'PUT', headers: { Authorization: 'Bearer ' + tok.access_token, 'Content-Type': 'application/json' },
  body: JSON.stringify({ files }),
});
const out = await res.json();
if (!res.ok) throw new Error(`Apps Script API ${res.status}: ${out.error && out.error.message}`);
console.log('上書きしました：' + out.files.map((f) => f.name).join(', '));
