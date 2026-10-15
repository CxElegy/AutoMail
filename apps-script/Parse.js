// メールを DB に入れる前の整形（Outlook の転送を開く・本文の整理・アドレスの分解）。中身の判断はしない。

// Outlook の転送ルールで届いたメール（件名が「FW:」、本文の先頭に From / Sent / To / Subject の見出し）を開く。
// Gmail 上の差出人は全部 Outlook の自分のアドレスになるので、本文に残った元の差出人・件名を取り出す。
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
    .replace(/[\u034F\u00AD\u200B-\u200F\u2060\uFEFF\u202A-\u202E]/g, '')   // 見えない文字（Amazon は先頭に大量にある）
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\[https?:\/\/[^\]\s]*\]/g, '')   // [https://…画像]
    .replace(/<https?:\/\/[^>\s]*>/g, '')       // 文字<https://…リンク先>
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// "名前 <addr@example.com>" を分解する
function parseAddress(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^(.*)<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim().replace(/^"|"$/g, ''), address: m[2].trim().toLowerCase() };
  return { name: '', address: s.toLowerCase() };
}
