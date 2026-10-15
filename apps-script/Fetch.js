// Gmail からの取得と、DB に書く1行への変換。

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

// DB に書く1行。整えるだけで、分類や金額の読み取りはしない（category などは AI が後で書く）。
function toRow_(msg, selfAddresses) {
  const outer = parseAddress(msg.getFrom());
  const rawBody = msg.getPlainBody() || '';
  const fw = unwrapForward(msg.getSubject(), rawBody);
  const body = compactBody(fw ? fw.body : rawBody);
  return {
    id: msg.getId(),
    thread_id: msg.getThread().getId(),
    received_at: msg.getDate().toISOString(),
    from_name: fw ? fw.fromName : outer.name,
    from_address: fw ? fw.fromAddress : outer.address,
    to_address: parseAddress(String(msg.getTo() || '').split(',')[0]).address,
    subject: fw ? fw.subject : (msg.getSubject() || ''),
    excerpt: body.slice(0, EXCERPT_CHARS),
    list_unsubscribe: !!msg.getHeader('List-Unsubscribe'),
    forwarded: !!fw,
    // Outlook で自分宛に書いたメモは転送ルールで届くので、転送の中の元の差出人も見る
    self_sent: selfAddresses.indexOf(fw ? fw.fromAddress : outer.address) >= 0,
  };
}
