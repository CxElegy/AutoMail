# Apps Script（段階1：取得 → ルール分類 → Supabase に記録）

計画の全体は [`docs/automation-plan.md`](../docs/automation-plan.md)。この段階では次の制約を守る：

- Gmail は**読むだけ**で、ラベルも付けない。
- カレンダー・Discord・ボードには何もしない。
- 今の Routine はそのまま動かし、結果を突き合わせる。

| ファイル | 中身 |
|---|---|
| `Main.js` | `setup()`（初回だけ）と `run()`（毎時）。取得・記録・前回の続きの管理 |
| `Classify.js` | 分類ルールと金額の抽出。外部 API を使わないので Node でテストできる（`node --test tests/*.test.js`） |
| `appsscript.json` | マニフェスト。権限は Gmail 読み取り・外部への通信・トリガーの3つだけ |
| [`../db/automail.sql`](../db/automail.sql) | Supabase のテーブル（`mails` / `rules` / `state` / `runs`）。AutoMail プロジェクトに作成済み |

## 設定（最初に1回）

1. **Supabase の secret key を控える**：AutoMail プロジェクト → Project Settings → API Keys → Secret keys（`sb_secret_` で始まるもの）。Wishlist のプロジェクトとは別。
2. **Apps Script のプロジェクトを作る**：[script.google.com](https://script.google.com) → 新しいプロジェクト（名前は AutoMail など）。
   - 左の歯車（プロジェクトの設定）→「`appsscript.json` マニフェスト ファイルをエディタで表示する」にチェック。
   - エディタで `appsscript.json` をこのフォルダのものに置き換える。
   - ファイルを2つ追加（＋ → スクリプト）：`Classify`・`Main`。それぞれにこのフォルダの `Classify.js`・`Main.js` を貼る。最初からある `コード.gs` は消す。
   - （clasp を使う場合は `clasp clone <スクリプトID>` → このフォルダで `clasp push`。`.clasp.json` はスクリプト ID を含むので `.gitignore` 済み）
3. **スクリプトプロパティ**（歯車 → スクリプト プロパティ → 追加）：

   | プロパティ | 値 |
   |---|---|
   | `SUPABASE_URL` | AutoMail プロジェクトの URL（`https://….supabase.co`） |
   | `SUPABASE_SECRET_KEY` | 1 で控えた secret key |
   | `SELF_ADDRESSES` | 自分の Outlook のアドレス（複数ならカンマ区切り） |

   Outlook の転送ルールで届いたメール（件名が `FW:`）は Gmail 上の差出人が全部この自分のアドレスになる。そのためスクリプトは本文の先頭に残った元の差出人・件名（`From:` / `Subject:`）を取り出して分類する。自分のアドレスから**転送でなく**届いたもの（自分で書いたメモ）だけが「自分宛メモ」になる。

4. **`setup` を実行**：エディタ上部で関数 `setup` を選んで ▶ 実行。
   - 初回は権限の確認が出る。自分で作ったスクリプトなので「詳細」→「（安全ではないページ）に移動」で許可してよい。
   - 求められる権限は Gmail の閲覧・外部サービスへの接続・トリガーの管理だけ。
   - 「準備完了」と出れば、以後は毎時 `run` が動く。前回の続きは `setup` を実行した時刻から始まり、過去のメールは取りに行かない。

## 動いているかの確認

Supabase → SQL Editor で：

```sql
-- 直近の実行（error が空なら正常。remaining=true は件数か時間の上限で次回に持ち越し）
select started_at, fetched, written, remaining, error from runs order by id desc limit 10;

-- 今日（JST）の分類の内訳。Routine のメールDB と件数・分類を突き合わせる
select category, route, count(*) from mails
where received_at >= date_trunc('day', now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo'
group by 1, 2 order by 3 desc;

-- AI 行きになったもの（ルールを足せば減らせる候補）
select received_at at time zone 'Asia/Tokyo' as jst, from_address, subject, category, rule
from mails where route = 'ai' order by received_at desc limit 50;
```

分類を直したい送信元があれば `rules` に1行足す（例：`kind = 'from_domain'`, `pattern = 'example.co.jp'`, `category = 'カード利用'`, `route = 'rule'`）。組み込みルールより先に、`id` の小さい順に照合する。送信元ドメインは利用中の金融機関などが分かるので、このリポジトリではなく DB だけに置く。

## 止めるとき

Apps Script の左メニュー「トリガー」で `run` のトリガーを削除する。Supabase のデータは残る。
