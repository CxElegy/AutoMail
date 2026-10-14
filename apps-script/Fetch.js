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

function toRow_(msg, rules, selfAddresses) {
  const outer = parseAddress(msg.getFrom());
  const rawBody = msg.getPlainBody() || '';
  const fw = unwrapForward(msg.getSubject(), rawBody);
  const body = compactBody(fw ? fw.body : rawBody);
  const m = {
    subject: fw ? fw.subject : (msg.getSubject() || ''),
    fromName: fw ? fw.fromName : outer.name,
    fromAddress: fw ? fw.fromAddress : outer.address,
    excerpt: body.slice(0, EXCERPT_CHARS),
    listUnsubscribe: !!msg.getHeader('List-Unsubscribe') || hasUnsubscribeText(body),
  };
  const c = classify(m, rules, selfAddresses);
  const amounts = extractYen(m.subject + '\n' + m.excerpt);
  return {
    id: msg.getId(),
    thread_id: msg.getThread().getId(),
    received_at: msg.getDate().toISOString(),
    from_name: m.fromName,
    from_address: m.fromAddress,
    to_address: parseAddress(String(msg.getTo() || '').split(',')[0]).address,
    subject: m.subject,
    excerpt: m.excerpt,
    list_unsubscribe: m.listUnsubscribe,
    forwarded: !!fw,
    category: c.category,
    route: c.route,
    urgent: c.urgent,
    rule: c.rule,
    amounts: amounts.length ? amounts : null,
  };
}
