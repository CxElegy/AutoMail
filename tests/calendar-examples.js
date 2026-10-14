// カレンダー統合（段階2b 試作）の例。ダミーのメールだけ。node tests/calendar-examples.js で計画を表示する。
const row = (o) => Object.assign({ id: o.n, route: 'rule', from_name: '', from_address: 'x@example.com', received_at: '2026-10-13T09:00:00Z', excerpt: '' }, o);
module.exports = [
  row({ n: 'A', category: 'カード利用', subject: 'ご利用のお知らせ【サンプルカード】',
        excerpt: 'ご利用日時：2026/10/13 18:40\nご利用先：サンプルカフェ\nご利用金額：1,200円' }),
  row({ n: 'B', category: 'カード利用', subject: 'ご利用明細のお知らせ【サンプルカード】',
        excerpt: 'ご利用日：2026/10/13\nご利用先：サンプルカフェ\nご利用金額：1,200円' }),
  row({ n: 'C', category: 'カード利用', subject: 'ご利用のお知らせ【サンプルカード】',
        excerpt: 'ご利用日時：2026/10/13 12:05\nご利用先：サンプル書店\nご利用金額：3,300円' }),
  row({ n: 'D', category: '買い物', subject: 'ご注文の確認', from_name: 'サンプル書店オンライン', received_at: '2026-10-13T03:04:00Z',
        excerpt: 'ご注文ありがとうございます。\n商品名：技術書 入門編\nご請求額：￥3,300' }),
  row({ n: 'E', category: '買い物', subject: 'ご注文の確認', from_name: 'Amazon.co.jp', received_at: '2026-10-13T13:30:00Z',
        excerpt: '商品名：猫用フード 2kg\n注文合計：￥2,480' }),
  row({ n: 'F', category: 'カード利用', subject: 'ご利用取消のお知らせ',
        excerpt: 'ご利用日時：2026/10/14 09:10\nご利用先：サンプル交通\nご利用金額：5,000円\n返品・取消' }),
  row({ n: 'G', category: '到着', subject: '発送のお知らせ', from_name: 'Amazon',
        excerpt: '商品名：猫用フード 2kg\nお届け予定日：10月16日' }),
  row({ n: 'H', category: '広告', subject: '秋のセール開催中' }),
  row({ n: 'J', category: 'カード利用', subject: 'ご利用のお知らせ', excerpt: '詳細は会員サイトでご確認ください' }),
  // ---- 飛行機・新幹線（received_at = 買った日） ----
  row({ n: 'K', category: '移動・宿泊', route: 'ai', subject: 'ご予約ありがとうございます（航空券）', from_name: 'サンプル航空', received_at: '2026-10-14T02:00:00Z',
        excerpt: '【往路】\n搭乗日：2026年10月20日\n便名：NH 123\n出発：羽田 07:05\n到着：伊丹 08:10\n' +
                 '【復路】\n搭乗日：2026年10月22日\n便名：NH 456\n出発：伊丹 19:30\n到着：羽田 20:40\nお支払い金額：28,600円' }),
  row({ n: 'L', category: '移動・宿泊', route: 'ai', subject: 'ご購入内容のお知らせ（新幹線）', from_name: 'スマートEX', received_at: '2026-10-14T05:00:00Z',
        excerpt: '乗車日：2026年10月25日\n列車名：のぞみ 201号\n出発：東京 09:00\n到着：新大阪 11:27\n合計金額：14,720円' }),
  row({ n: 'M', category: '移動・宿泊', route: 'ai', subject: 'ご宿泊予約の確認', excerpt: 'チェックイン：10月20日\nサンプルホテル 1泊' }),
  // ---- 自分宛メモ（received_at = 2026-10-14 JST） ----
  row({ n: 'N', category: '自分宛メモ', route: 'ai', subject: '10/20までに区役所で手続き', received_at: '2026-10-14T01:00:00Z' }),
  row({ n: 'O', category: '自分宛メモ', route: 'ai', subject: '明日 歯医者 15時', received_at: '2026-10-14T01:00:00Z' }),
  row({ n: 'P', category: '自分宛メモ', route: 'ai', subject: '出張 10/27〜10/29', received_at: '2026-10-14T01:00:00Z' }),
  row({ n: 'Q', category: '自分宛メモ', route: 'ai', subject: '月餅を買う（23日か24日）', received_at: '2026-10-14T01:00:00Z' }),
  row({ n: 'R', category: '自分宛メモ', route: 'ai', subject: 'RE: 10/20までに区役所で手続き', excerpt: 'もう終わった', received_at: '2026-10-14T01:00:00Z' }),
  row({ n: 'S', category: '自分宛メモ', route: 'ai', subject: '牛乳を買う', received_at: '2026-10-14T01:00:00Z' }),
  row({ n: 'T', category: '自分宛メモ', route: 'ai', subject: '1/10 確定申告の書類をそろえる', received_at: '2026-10-14T01:00:00Z' }),
  // ---- 実際のメールと同じ形式（値はすべて架空） ----
  row({ n: 'U', category: 'カード利用', subject: 'ご利用のお知らせ【サンプルカード】', received_at: '2026-09-30T10:14:00Z',
        excerpt: 'カードの利用内容をお知らせします。\n\nご利用内容\n\nご利用日時：2026/09/30 19:13\nSAMPLE STORE JPN（買物） 1,640.00 JPY\n\n本メールは…' }),
  row({ n: 'V', category: 'カード利用', subject: 'ご利用のお知らせ【サンプルカード】', received_at: '2026-09-27T03:33:00Z',
        excerpt: 'ご利用日時：2026/09/27 12:30\nSAMPLE AI SERVICE（買物） 22.00 USD' }),
  row({ n: 'W', category: '買い物', subject: '【ANA】決済完了のお知らせ', from_name: 'ANA (ALL NIPPON AIRWAYS)', received_at: '2026-09-23T00:40:00Z',
        excerpt: '■ご予約内容\n 2026年09月23日 09時39分現在 (日本時間)\n\n■フライト詳細\n[1]09月24日(木) NH000\n 東京(羽田) - 広島\n 出発ターミナル：2\n 07:05発08:25着\n エコノミークラス：Q / 確定\n\n■お支払い/適用規則\n＜お支払い総額＞\n 22,920円' }),
  row({ n: 'X', category: '移動・宿泊', subject: '【スマートEX】 新幹線予約内容', from_address: 'yoyaku@expy.jp', received_at: '2026-09-18T08:57:00Z',
        excerpt: '予約結果は以下のとおりです。\n\n領収額は、合計　11,150円です。\n\n■予約内容\n乗車日　2026年9月18日\n広島(18:12)→のぞみ000号→新大阪(19:37)\nおとな1名\n発売額　11,150円' }),
  row({ n: 'Y', category: '移動・宿泊', subject: '【スマートEX】 本日(2026年9月18日)乗車分の予約について', from_address: 'yoyaku@expy.jp', received_at: '2026-09-18T00:00:00Z',
        excerpt: '乗車日　2026年9月18日\n広島(18:12)→のぞみ000号→新大阪(19:37)\n領収額は、合計　11,150円' }),
  row({ n: 'Z', category: '買い物', subject: '注文済み: 「サンプル試験紙...」', from_name: 'Amazon.co.jp', received_at: '2026-09-30T14:15:00Z',
        excerpt: 'ご注文ありがとうございます。\n\n明日到着予定\n注文番号 000-0000000-0000000\n\n[サンプル試験紙 160枚入]\n数量: 1\n\n￥449\n\n合計 ￥0\n\nもう一度買う' }),
];
if (require.main === module) {
  const load = require('./load.js');
  const G = load({});
  const plan = JSON.parse(JSON.stringify(G.planCalendar(module.exports)));
  console.log(JSON.stringify(plan, null, 2));
}
