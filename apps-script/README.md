# Apps Script（Gmail を集めて Supabase に記録する）

計画の全体は [`docs/automation-plan.md`](../docs/automation-plan.md)。このスクリプトは**集めるだけ**で、メールの中身の判断（分類・金額・日付・ラベル）はしない。判断は AI が `mails` を読んで行う。

| ファイル | 中身 |
|---|---|
| `Main.js` | `setup()`（初回だけ）と `run()`（毎時）。前回の続きの管理 |
| `Fetch.js` | Gmail からの取得と、DB に書く1行への変換 |
| `Parse.js` | Outlook の転送を開く・本文の整理（URL・見えない文字を除く）・アドレスの分解 |
| `Supabase.js` | Supabase の REST API |
| `Backfill.js` | 過去の期間をまとめて記録する `backfill()` |
| `Command.js` | Supabase の state 'command' に書かれた指示（`backfill`）を `run()` のついでに実行する |
| `appsscript.json` | マニフェスト。権限は Gmail の読み取り・外部への通信・トリガーの3つだけ |
| [`../db/automail.sql`](../db/automail.sql) | Supabase のテーブル（`mails` / `state` / `runs`）と view（`purchase_lines` / `daily_totals`）。AutoMail プロジェクトに作成済み |

## 設定（最初に1回）

1. **Supabase の secret key を控える**：AutoMail プロジェクト → Project Settings → API Keys → Secret keys（`sb_secret_` で始まるもの）。Wishlist のプロジェクトとは別。
2. **Apps Script のプロジェクトを作る**：[script.google.com](https://script.google.com) → 新しいプロジェクト（名前は AutoMail など）。
   - 左の歯車（プロジェクトの設定）→「`appsscript.json` マニフェスト ファイルをエディタで表示する」にチェック。
   - エディタで `appsscript.json` をこのフォルダのものに置き換える。
   - このフォルダの `.js` と同じ名前のファイルを作り（＋ → スクリプト）、それぞれ貼る。最初からある `コード.gs`（`Code.gs`）は消す。以前の版にあった `Classify`・`Label`・`Purchase`・`Travel`・`Memo`・`Calendar` が残っていたら消す。
   - どのファイルも100行未満にしてある（端末によってはコピーが100行で切れるため）。貼ったあと、エディタの最終行の番号が `wc -l` の行数と合うか確かめる。
   - （clasp を使う場合は `clasp clone <スクリプトID>` → このフォルダで `clasp push`。`.clasp.json` はスクリプト ID を含むので `.gitignore` 済み）
3. **スクリプトプロパティ**（歯車 → スクリプト プロパティ → 追加）：

   | プロパティ | 値 |
   |---|---|
   | `SUPABASE_URL` | AutoMail プロジェクトの URL（`https://….supabase.co`） |
   | `SUPABASE_SECRET_KEY` | 1 で控えた secret key |
   | `SELF_ADDRESSES` | 自分の Outlook のアドレス（複数ならカンマ区切り） |

   Outlook の転送ルールで届いたメール（件名が `FW:`）は Gmail 上の差出人が全部この自分のアドレスになる。そのためスクリプトは本文の先頭に残った元の差出人・件名（`From:` / `Subject:`）を取り出して記録する。自分のアドレスから**転送でなく**届いたもの（自分で書いたメモ）には `self_sent` を付ける。

4. **`setup` を実行**：エディタ上部で関数 `setup` を選んで ▶ 実行。
   - 初回は権限の確認が出る。自分で作ったスクリプトなので「詳細」→「（安全ではないページ）に移動」で許可してよい。
   - 求められる権限は Gmail の閲覧・外部サービスへの接続・トリガーの管理だけ（以前の版の「Gmail の変更」は不要になった）。
   - 「準備完了」と出れば、以後は毎時 `run` が動く。前回の続きは `setup` を実行した時刻から始まり、過去のメールは取りに行かない。

## 動いているかの確認

Supabase → SQL Editor で：

```sql
-- 直近の実行（error が空なら正常。remaining=true は件数か時間の上限で次回に持ち越し）
select started_at, fetched, written, remaining, error from runs order by id desc limit 10;

-- 今日（JST）に記録した通数と、AI がまだ処理していない通数
select count(*) as today, count(*) filter (where ai_at is null) as unprocessed from mails
where received_at >= date_trunc('day', now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo';
```

## 止めるとき

Apps Script の左メニュー「トリガー」で `run` のトリガーを削除する。Supabase のデータは残る。

## コピペせずに反映する（Apps Script API・任意）

一度だけ設定すれば、Claude がクラウドのセッションから `node tools/gas-push.mjs --push` でコードを上書きできる。

1. [script.google.com/home/usersettings](https://script.google.com/home/usersettings) で「Google Apps Script API」をオンにする（Gmail のアカウントで）。
2. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作る：
   - 「Apps Script API」を有効にする。
   - OAuth 同意画面は「外部」。作成後に「本番環境に公開」する（テストのままだと 7 日でトークンが切れる）。
   - 認証情報 →「OAuth クライアント ID」→「ウェブ アプリケーション」。承認済みのリダイレクト URI に `https://developers.google.com/oauthplayground` を入れる。
3. [OAuth 2.0 Playground](https://developers.google.com/oauthplayground) で：
   - 右上の歯車 →「Use your own OAuth credentials」に 2 のクライアント ID とシークレットを入れる。
   - 左の入力欄に `https://www.googleapis.com/auth/script.projects` だけを入れて Authorize → Gmail のアカウントで許可。
   - 「Exchange authorization code for tokens」で出る refresh token を控える。
4. Apps Script の歯車（プロジェクトの設定）で「スクリプト ID」を控える。
5. Claude のクラウド環境の設定（セッション上部の環境名 → 編集）のシークレット（環境変数）に入れる：
   `GAS_CLIENT_ID`・`GAS_CLIENT_SECRET`・`GAS_REFRESH_TOKEN`・`GAS_SCRIPT_ID`。チャットやファイルには書かない。
6. 新しいセッションを始める（シークレットは新しいセッションから読まれる）。

過去分の取り込み（`backfill`）は、Supabase の state 'command' に指示を書くと毎時の `run()` が実行する（[`Command.js`](Command.js)）。
