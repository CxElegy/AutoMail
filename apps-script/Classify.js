// メール1通を分類する（Apps Script でも Node のテストでも動くように、外部の API は使わない）。
// 返り値：{ category, route, urgent, rule }
//   route = 'rule' … スクリプトだけで処理できる（段階2以降で自動処理）
//   route = 'ai'   … AI の判断が要る（段階5以降で Routine のキューに入る）
// 照合の順番：自分宛メモ → DB の rules（利用者が追加したもの）→ 組み込みルール → 不明（ai）

const FINANCE_RE = /銀行|証券|カード|口座|振込|出金|入金|送金|bank|securities/i;

// 組み込みルール。具体的な会社名・アドレスは書かない（それは DB の rules に置く）。
const BUILTIN_RULES = [
  { name: '行政', category: '行政', route: 'ai', urgent: true,
    test: (m) => /マイナポータル|マイナンバー|e-Gov|電子申請|ぴったりサービス/i.test(m.subject + ' ' + m.fromName + ' ' + m.fromAddress) },
  { name: 'ログイン・認証', category: 'アカウント・認証', route: 'ai', urgent: false,
    test: (m) => /ログイン|サインイン|認証コード|確認コード|ワンタイムパスワード|パスワード.*(変更|再設定)|二段階|2段階|新しい(端末|デバイス)|sign[- ]?in|verification code|security alert/i.test(m.subject) },
  { name: 'カード利用通知', category: 'カード利用', route: 'rule', urgent: false,
    test: (m) => /ご利用のお知らせ|ご利用明細|カードご利用|ご利用代金|利用通知/.test(m.subject) },
  { name: '移動・宿泊', category: '移動・宿泊', route: 'ai', urgent: false,
    // 申込日と実施日（搭乗日・チェックイン日）が分かれるので、日付の判断は AI に任せる
    test: (m) => /航空券|搭乗|フライト|新幹線|乗車|宿泊|チェックイン|e-?ticket|boarding/i.test(m.subject) },
  { name: '到着', category: '到着', route: 'rule', urgent: false,
    test: (m) => /お届け|配達完了|配達予定|発送|出荷|お荷物|shipped|delivered|out for delivery/i.test(m.subject) },
  { name: '買い物', category: '買い物', route: 'rule', urgent: false,
    test: (m) => /ご注文|注文(確認|完了|内容)|ご購入|購入完了|決済完了|領収書|お支払い(完了|確認)|order confirm|receipt/i.test(m.subject) },
  { name: '広告（件名）', category: '広告', route: 'rule', urgent: false,
    test: (m) => /セール|キャンペーン|クーポン|ポイント.*(プレゼント|還元|進呈)|メルマガ|ニュースレター|newsletter|% ?off/i.test(m.subject) },
  { name: '広告（List-Unsubscribe）', category: '広告', route: 'rule', urgent: false,
    test: (m) => m.listUnsubscribe },
];

function domainOf(address) {
  const at = String(address || '').lastIndexOf('@');
  return at < 0 ? '' : address.slice(at + 1).toLowerCase();
}

function matchDbRule(rule, m) {
  const p = String(rule.pattern || '');
  switch (rule.kind) {
    case 'from_address': return String(m.fromAddress).toLowerCase() === p.toLowerCase();
    case 'from_domain': {
      const d = domainOf(m.fromAddress), q = p.toLowerCase();
      return d === q || d.endsWith('.' + q);
    }
    case 'subject_regex': return safeRegex(p).test(m.subject);
    case 'body_regex': return safeRegex(p).test(m.excerpt);
    default: return false;
  }
}

function safeRegex(pattern) {
  try { return new RegExp(pattern, 'i'); } catch (e) { return /(?!)/; }  // 壊れたパターンは何にも当たらない
}

function classify(m, dbRules, selfAddresses) {
  const self = (selfAddresses || []).map((a) => a.toLowerCase());
  if (self.indexOf(String(m.fromAddress).toLowerCase()) >= 0) {
    // 自分宛メモは常に最優先・AI 行き。行政の言葉が入っていても緊急扱いにはしない（本人が書いたもの）
    return { category: '自分宛メモ', route: 'ai', urgent: false, rule: '自分宛メモ' };
  }
  for (const r of dbRules || []) {
    if (r.enabled !== false && matchDbRule(r, m)) {
      return { category: r.category, route: r.route || 'rule', urgent: !!r.urgent, rule: 'db#' + r.id };
    }
  }
  for (const r of BUILTIN_RULES) {
    if (r.test(m)) {
      let category = r.category, urgent = r.urgent;
      if (category === 'アカウント・認証' && FINANCE_RE.test(m.subject + ' ' + m.fromName)) {
        category = '金融・セキュリティ';
        urgent = true;
      }
      return { category, route: r.route, urgent, rule: r.name };
    }
  }
  return { category: '不明', route: 'ai', urgent: false, rule: null };
}

// 件名と本文から円の金額を拾う（「1,234円」「¥1,234」「￥1234」）。最大10件。
function extractYen(text) {
  const s = String(text || '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/，/g, ',');
  const out = [];
  const re = /(?:[¥￥]\s*([0-9][0-9,]*))|(?:([0-9][0-9,]*)\s*円)/g;
  let hit;
  while ((hit = re.exec(s)) && out.length < 10) {
    const n = parseInt((hit[1] || hit[2]).replace(/,/g, ''), 10);
    if (!isNaN(n) && n > 0 && n < 100000000) out.push(n);
  }
  return out;
}

// Outlook の転送ルールで届いたメール（件名が「FW:」、本文の先頭に From / Sent / To / Subject の見出し）を開く。
// Gmail 上の差出人は全部 Outlook の自分のアドレスになるので、分類は本文に残った元の差出人・件名で行う。
// 転送でなければ null。
function unwrapForward(subject, body) {
  if (!/^\s*(FW|Fwd?|転送)\s*[:：]/i.test(String(subject || ''))) return null;
  const text = String(body || '').replace(/\r/g, '');
  const head = text.slice(0, 3000);
  const from = head.match(/^(?:From|差出人)\s*[:：]\s*(.+)$/m);
  if (!from) return null;
  const subj = head.match(/^(?:Subject|件名)\s*[:：]\s*(.*)$/m);
  // 見出しの最後の行（Subject）の次の行から先が元の本文
  const end = subj ? head.indexOf(subj[0]) + subj[0].length : head.indexOf(from[0]) + from[0].length;
  const addr = parseAddress(from[1]);
  return {
    fromName: addr.name,
    fromAddress: addr.address,
    subject: subj ? subj[1].trim() : String(subject).replace(/^\s*(FW|Fwd?|転送)\s*[:：]\s*/i, ''),
    body: text.slice(end).replace(/^\s+/, ''),
  };
}

// 本文からリンク先・画像の URL を除いて短くする（AI に渡す量と DB の容量を減らす）
function compactBody(body) {
  return String(body || '')
    .replace(/\r/g, '')
    .replace(/\[https?:\/\/[^\]\s]*\]/g, '')   // [https://…画像]
    .replace(/<https?:\/\/[^>\s]*>/g, '')       // 文字<https://…リンク先>
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// 配信停止の案内（転送で List-Unsubscribe ヘッダーが消えるので、本文の文言で代わりにする）
function hasUnsubscribeText(body) {
  return /配信停止|配信解除|配信の停止|メールマガジン|メルマガ|購読(の)?(解除|停止)|unsubscribe/i.test(String(body || ''));
}

// "名前 <addr@example.com>" を分解する
function parseAddress(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^(.*)<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim().replace(/^"|"$/g, ''), address: m[2].trim().toLowerCase() };
  return { name: '', address: s.toLowerCase() };
}

if (typeof module !== 'undefined') {
  module.exports = { classify, extractYen, parseAddress, domainOf, unwrapForward, compactBody, hasUnsubscribeText, BUILTIN_RULES };
}
