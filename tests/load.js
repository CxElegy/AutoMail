// apps-script/ の全ファイルを Apps Script と同じく1つの共有スコープに読み込む（テスト用）。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DIR = path.join(__dirname, '..', 'apps-script');

module.exports = function load(env) {
  const ctx = vm.createContext(Object.assign({ console, Set, Date, JSON, Math, String, Number, Object, encodeURIComponent }, env));
  for (const f of fs.readdirSync(DIR).filter((n) => n.endsWith('.js')).sort()) {
    vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), ctx, { filename: f });
  }
  return ctx;
};
