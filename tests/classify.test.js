// 分類ルールのテスト（ダミーのメールだけを使う。実際のメールは入れない）。実行：node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { classify, extractYen, parseAddress } = require('../apps-script/Classify.js');

const mail = (o) => Object.assign({ subject: '', fromName: '', fromAddress: 'noreply@example.com', excerpt: '', listUnsubscribe: false }, o);
const SELF = ['me@example.org'];

test('自分宛メモは最優先で AI 行き、行政の言葉があっても緊急にしない', () => {
  const c = classify(mail({ fromAddress: 'ME@example.org', subject: 'マイナポータルで手続きする' }), [], SELF);
  assert.deepEqual(c, { category: '自分宛メモ', route: 'ai', urgent: false, rule: '自分宛メモ' });
});

test('行政は緊急・AI 行き', () => {
  const c = classify(mail({ subject: '【マイナポータル】ログインのお知らせ' }), [], SELF);
  assert.equal(c.category, '行政');
  assert.equal(c.urgent, true);
  assert.equal(c.route, 'ai');
});

test('金融機関のログイン通知は 金融・セキュリティ で緊急', () => {
  const c = classify(mail({ subject: 'ログインのお知らせ', fromName: 'サンプル銀行' }), [], SELF);
  assert.equal(c.category, '金融・セキュリティ');
  assert.equal(c.urgent, true);
});

test('金融以外のログイン通知は アカウント・認証（緊急ではない）', () => {
  const c = classify(mail({ subject: '新しいデバイスからのサインイン', fromName: 'Example Game' }), [], SELF);
  assert.equal(c.category, 'アカウント・認証');
  assert.equal(c.urgent, false);
});

test('カード利用通知・注文・配送はスクリプトで処理できる', () => {
  assert.equal(classify(mail({ subject: 'カードご利用のお知らせ' }), [], SELF).category, 'カード利用');
  assert.equal(classify(mail({ subject: 'ご注文の確認', listUnsubscribe: true }), [], SELF).category, '買い物');
  assert.equal(classify(mail({ subject: 'お荷物のお届け予定' }), [], SELF).category, '到着');
  for (const s of ['カードご利用のお知らせ', 'ご注文の確認', 'お荷物のお届け予定']) {
    assert.equal(classify(mail({ subject: s }), [], SELF).route, 'rule');
  }
});

test('移動・宿泊は日付の判断が要るので AI 行き', () => {
  const c = classify(mail({ subject: '航空券ご予約の確認' }), [], SELF);
  assert.equal(c.category, '移動・宿泊');
  assert.equal(c.route, 'ai');
});

test('広告：件名か List-Unsubscribe で判定', () => {
  assert.equal(classify(mail({ subject: '秋のセール開催中' }), [], SELF).category, '広告');
  assert.equal(classify(mail({ subject: '今週のおすすめ', listUnsubscribe: true }), [], SELF).category, '広告');
});

test('どれにも当たらなければ 不明 で AI 行き', () => {
  assert.deepEqual(classify(mail({ subject: 'ご連絡' }), [], SELF), { category: '不明', route: 'ai', urgent: false, rule: null });
});

test('DB のルールは組み込みより先に、id の順で照合する', () => {
  const rules = [
    { id: 1, kind: 'from_domain', pattern: 'shop.example', category: '買い物', route: 'rule', urgent: false, enabled: true },
    { id: 2, kind: 'subject_regex', pattern: 'セール', category: '自分で決めた分類', route: 'rule', urgent: false, enabled: true },
  ];
  assert.equal(classify(mail({ fromAddress: 'info@mail.shop.example', subject: 'セール' }), rules, SELF).rule, 'db#1');
  assert.equal(classify(mail({ subject: '秋のセール' }), rules, SELF).rule, 'db#2');
  // ドメインの部分一致はしない（notshop.example は shop.example ではない）
  assert.equal(classify(mail({ fromAddress: 'x@notshop.example', subject: 'ご連絡' }), rules.slice(0, 1), SELF).rule, null);
});

test('無効なルールと壊れた正規表現は無視する', () => {
  const rules = [
    { id: 1, kind: 'subject_regex', pattern: '(', category: 'x', enabled: true },
    { id: 2, kind: 'subject_regex', pattern: 'ご連絡', category: 'y', enabled: false },
  ];
  assert.equal(classify(mail({ subject: 'ご連絡' }), rules, SELF).category, '不明');
});

test('円の金額を拾う（全角数字・¥・カンマ）', () => {
  assert.deepEqual(extractYen('ご利用金額：１，２３４円 / 合計 ¥5,600 / ￥78'), [1234, 5600, 78]);
  assert.deepEqual(extractYen('金額の記載なし'), []);
});

test('差出人の分解', () => {
  assert.deepEqual(parseAddress('"Example Shop" <Info@Example.com>'), { name: 'Example Shop', address: 'info@example.com' });
  assert.deepEqual(parseAddress('plain@example.com'), { name: '', address: 'plain@example.com' });
});

const { unwrapForward, compactBody, hasUnsubscribeText } = require('../apps-script/Classify.js');
const FW_BODY = [
  '________________________________',
  'From: サンプル商店 <news@shop.example>',
  'Sent: Tuesday, October 13, 2026 4:09:06 PM (UTC+08:00) Beijing, Chongqing, Hong Kong, Urumqi',
  'To: me@example.org <me@example.org>',
  'Subject: 秋の抽選販売を開催！',
  '',
  '会員様限定の抽選販売です。[https://img.example/logo.png]<https://click.example/a?b=c>',
  '配信停止はこちら<https://click.example/stop>',
].join('\n');

test('Outlook の転送（FW:）は本文の元の差出人・件名を取り出す', () => {
  const fw = unwrapForward('FW: 秋の抽選販売を開催！', FW_BODY);
  assert.equal(fw.fromAddress, 'news@shop.example');
  assert.equal(fw.fromName, 'サンプル商店');
  assert.equal(fw.subject, '秋の抽選販売を開催！');
  assert.ok(fw.body.startsWith('会員様限定'));
  assert.equal(unwrapForward('秋の抽選販売', FW_BODY), null);       // 件名に FW: がなければ転送扱いしない
  assert.equal(unwrapForward('FW: メモ', '本文だけ'), null);          // 見出しがなければ転送扱いしない
});

test('日本語の転送見出し（差出人・件名）も読める', () => {
  const fw = unwrapForward('転送: ご注文の確認', '差出人: Shop <a@shop.example>\n送信日時: 2026年10月13日\n件名: ご注文の確認\n\n本文');
  assert.equal(fw.fromAddress, 'a@shop.example');
  assert.equal(fw.subject, 'ご注文の確認');
  assert.equal(fw.body, '本文');
});

test('転送されたメールは元の差出人で分類し、自分のアドレスでも自分宛メモにしない', () => {
  const fw = unwrapForward('FW: 秋の抽選販売を開催！', FW_BODY);
  const body = compactBody(fw.body);
  const c = classify(mail({ subject: fw.subject, fromAddress: fw.fromAddress, excerpt: body, listUnsubscribe: hasUnsubscribeText(body) }), [], SELF);
  assert.equal(c.category, '広告');
  // 転送でなく自分のアドレスから届いたもの（自分で書いたメモ）は自分宛メモ
  assert.equal(classify(mail({ fromAddress: 'me@example.org', subject: '明日までに申請' }), [], SELF).category, '自分宛メモ');
});

test('本文からリンク先・画像の URL を除く', () => {
  assert.equal(compactBody('文字[https://img.example/a.png]<https://x.example/b>\n\n\n\n次'), '文字\n\n次');
});
