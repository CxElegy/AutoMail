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
];
if (require.main === module) {
  const load = require('./load.js');
  const G = load({});
  const plan = JSON.parse(JSON.stringify(G.planCalendar(module.exports)));
  console.log(JSON.stringify(plan, null, 2));
}
