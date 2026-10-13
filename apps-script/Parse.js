// メール本文・差出人の読み取り（金額・Outlook の転送・本文の整理・アドレス）。外部の API は使わない。

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
