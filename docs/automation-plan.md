# 省トークン自動化の計画（案）

構成図：[`docs/design/automation.png`](design/automation.png)（源ファイル [`design/Automation.dc.html`](../design/Automation.dc.html)）
進み具合の図：[`docs/design/progress.png`](design/progress.png)（源ファイル [`design/Progress.dc.html`](../design/Progress.dc.html)。段階が進んだら作り直す）

**まだ提案の段階で、現在の運用は [`prompts/scheduled-task.md`](../prompts/scheduled-task.md) のまま。** 移行が済んだ部分から、そちらと [`update-procedure.md`](update-procedure.md) を書き換える。

## 考え方

Wishlist（関注清単通信）と同じく、**スクリプトが集めて計算し、AI は判断だけ**にする。今の Routine は、新着が0件の回でも手順書（約32KB）と台帳を読む。台帳・メールDBは毎回全文を書き直し、ボードも全文を読み込んで publish している。トークンのほとんどは、判断の要らないこうした作業に使われている。

## 分担

| どこで | 何をする | 費用 |
|---|---|---|
| Google Apps Script（自分の Google アカウント内、時間トリガーで毎時） | 取得、ルールで分類、DB に記録、カード通知の日次合計、到着・予約の予定登録、緊急の Discord 通知、週まとめ、AI 判定の反映、ボードの描画（Web アプリ） | 無料 |
| Claude Routine（キューがあるときだけ API で起動） | ルールで決まらないメールの判断（分類・予定の日付・要約・緊急度）。読むのは短い `RULES.md` とキューの JSON だけで、判定 JSON を DB に返す | サブスク枠 |
| Supabase（非公開） | `mails`（1通1行）、`state`（旧 台帳）、`ai_queue` / `ai_decisions`、`rules` | 無料 |
| GitHub（このリポジトリ・公開） | Apps Script のコード（clasp）、文書、ダミーデータのテスト。個人データは置かない | 無料 |

GitHub Actions ではなく Apps Script を選ぶ理由：

- 公開リポジトリの Actions はログも公開される。
- Gmail の OAuth トークンを外部に預けずに済む。
- メールの中身が Google と非公開 DB の外に出ない。

## 移行の順番（各段階で今の Routine と並走させて結果を比べる）

1. **取得と記録だけ**（コード・DB は用意済み。設定手順は [`apps-script/README.md`](../apps-script/README.md)）：Apps Script が新着を取得し、ルールで分類して `mails` に書く。Routine は今のまま動かし、分類結果を突き合わせる。
2. **機械処理を移す**：
   - 2a（コード用意済み）：広告に Gmail ラベル `automail-skip` を付け、Routine は `-label:automail-skip` で検索して読まない。Routine は Supabase を読めないので、受け渡しは Gmail ラベルで行う。
   - 2b：カード通知・注文・配送の日次合計と予定登録をスクリプトへ移す。今は Routine が日次合計を書いているので、同じ予定を両方が書かないよう、2b に切り替えるときに Routine の担当から外す。
3. **緊急通知と週まとめ**：Discord（Wishlist と同じ Webhook 方式）に切り替える。
4. **ボードを Web アプリへ**：Artifact の週次 publish をやめる。
5. **Routine をキュー起動に**：cron をやめ、`ai_queue` が1件以上のときだけ Apps Script から API で起動する。`RULES.md` を新設し、手順書の全文は読ませない。
6. **ルールを育てる**：AI が同じ送信元に3回同じ判定を出したら、ルール追加の案を `state` に残す（追加は本人が承認）。

## 決まったこと（2026-10-14）

- DB は Supabase。Wishlist とは**別のプロジェクト**（AutoMail）にする。Wishlist の publishable key は公開ページに載っているため。
- 通知は Discord（Wishlist と同じ Webhook 方式）。
- `.ics` の再送はやめ、スマホで Google カレンダーを直接同期する。
- 「前回の続き」は Gmail のラベルではなく受信時刻で管理する。ラベルはスレッド単位なので、ラベル済みのスレッドへの返信（自分宛メモへの返信など）を取りこぼすため。

## 守ること

- ルール表（送信元ドメインなど）は利用中の金融機関が分かってしまうので、公開リポジトリではなく非公開 DB に置く。

## 注意

- Apps Script には実行時間の上限がある（1回の実行・1日のトリガー合計）。毎時の取得は上限を見ながら件数を区切る。
- 構成図の「広告 7割／カード・注文 2割／AI 行き 1割」は仮定で、実測ではない。段階1のあとで `mails` から実際の割合を出す。
