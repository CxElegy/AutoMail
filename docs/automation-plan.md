# 省トークン自動化の計画（案）

構成図：[`docs/design/automation.png`](design/automation.png)（源ファイル [`design/Automation.dc.html`](../design/Automation.dc.html)）
進み具合の図：[`docs/design/progress.png`](design/progress.png)（源ファイル [`design/Progress.dc.html`](../design/Progress.dc.html)。段階が進んだら作り直す）
※ 2つの図は「スクリプトがルールで分類する」前の案のままで、下の分担（2026-10-14 改定）には未対応。

**まだ提案の段階で、現在の運用は [`prompts/scheduled-task.md`](../prompts/scheduled-task.md) のまま。** 移行が済んだ部分から、そちらと [`update-procedure.md`](update-procedure.md) を書き換える。

## 考え方（2026-10-14 改定）

- **スクリプトはデータを集めて流れを回すだけ。メールの中身の判断はすべて AI がする。**
  - 正規表現で分類・金額・日付を読むやり方はやめた。9月の実データで試したところ、返品の符号・仮承認（PENDING）・円表記の違いで、エラーを出さずに合計を間違えた。
  - そのコードは [`archive/rules-v0/`](../archive/rules-v0/) に残してあり、使わない。
- トークンを減らすのはモデルの使い分けとデータの整形で行う。
  - 簡単な読み取りは安いモデル（Haiku）、判断が要るものだけ上位モデル（Sonnet）。
  - AI が読むのは Gmail の生の HTML ではなく、スクリプトが整えた短い本文（URL・見えない文字・転送の見出しを除いた先頭 3,000 字）。
  - 足し算は AI にさせず DB の view でする。

## 分担

| どこで | 何をする | 何をしない |
|---|---|---|
| Google Apps Script（毎時） | Gmail の新着を取得。Outlook の転送を開いて元の差出人・件名に戻す。本文の整形（URL・見えない文字を除く）。自分で書いたメール（`self_sent`）の印。`mails` への記録、前回の続き、過去分の取り込み（backfill）、実行記録 | 分類・金額・日付の読み取り・ラベル付け・カレンダー書き込み |
| Supabase（非公開） | 保存（`mails` / `state` / `runs`）。未処理のキュー（`ai_at is null`）。日次合計の足し算（view `daily_totals`） | 判断 |
| AI 1段目：Haiku（Routine から呼ぶサブエージェント） | 未処理の全メールを読み、分類・要点・金額の明細・予定の候補を JSON で `mails` に書く。判断が要るものに `escalate` を付ける | カレンダー・ボードへの書き込み |
| AI 2段目：Sonnet（Routine 本体） | `escalate` の付いたメールと日次合計だけを読む。期限・予定日・緊急度・同じ取引の重複を判断。Haiku の結果を数件抜き取って本文と照合する。カレンダー・台帳／ボード・通知に書く | 全メールの読み直し |
| GitHub（このリポジトリ・公開） | コード・文書・ダミーデータのテスト。個人データは置かない | — |

## AI の手順

### 1段目（Haiku）

- 未処理（`ai_at is null`）を古い順に 50 通ずつ処理する。
- 読むのは `subject` / `from_name` / `from_address` / `self_sent` / `excerpt` だけ。
- 書くのは `category` / `urgent` / `ai` / `ai_model = 'haiku'` / `ai_at`。
- メイン（Sonnet）に返すのは件数と escalate の数だけで、本文は返さない（メインの文脈を小さく保つ）。

`ai` の形：

```json
{
  "summary": "要点1行",
  "purchases": [{ "date": "2026-09-30", "time": "19:13", "shop": "店名", "amount_jpy": 1640, "fx": null, "kind": "buy" }],
  "events": [{ "kind": "trip", "date": "2026-09-24", "start": "07:05", "end": "08:25", "title": "[ANA] NH000 羽田 07:05 → 広島 08:25" }],
  "escalate": false,
  "why": ""
}
```

- `purchases[].kind`：`buy` / `refund`（返品・取消。`amount_jpy` は負）/ `pending`（「PENDING」などの仮承認。合計に数えない）。外貨は `amount_jpy: 0` と `fx: { "cur": "USD", "val": 22 }`。
- `events[].kind`：`trip`（乗る日）/ `stay`（宿泊）/ `arrival`（到着予定）/ `deadline`（期限）/ `memo`（自分宛メモ）。件名の書き方と色は [`update-procedure.md`](update-procedure.md) に従う。
- `escalate: true` にするもの：
  - 行政・税・保険・年金
  - 金融機関の新しい種類の操作・セキュリティ
  - 宿泊、取消・返金・変更
  - 日付が曖昧な自分宛メモ・返信
  - 初めて見る形式、読み取りに自信がないもの

### 2段目（Sonnet）

1. `escalated` のメールを読み、判断して `ai` を直す（`ai_model` に `sonnet` を足す）。
2. その日の `purchase_lines` を見て、同じ取引の重複（カード通知と注文メールなど）に `skip: true` を付ける。
3. Haiku が処理した中から 5 通を抜き取り、本文と照合する。間違いがあれば直して台帳に記録する。
4. `daily_totals` と `ai->'events'` から、カレンダー・台帳／ボード・通知に書く。

## 移行の順番（各段階で今の Routine と並走させて結果を比べる）

1. **取得と記録**（動いている。設定手順は [`apps-script/README.md`](../apps-script/README.md)）：
   - Apps Script を集めるだけの版に入れ替える。権限は Gmail の読み取りだけになる。
2. **9月分で試す**：
   - backfill で9月のメールを `mails` に入れる。
   - 上の2段で処理し、9月のカレンダー（64件）と照合する。
3. **Routine を切り替える**：
   - Routine に Supabase のコネクタを付ける（Routine の設定画面でユーザーが行う）。
   - prompt を「Gmail を読む」から「`mails` の未処理を2段で処理する」に書き換える。
4. **緊急通知と週まとめ**：Discord（Wishlist と同じ Webhook 方式）に切り替える。
5. **ボードを Web アプリへ**：Artifact の週次 publish をやめる。

## 決まったこと

- 2026-10-14：
  - DB は Supabase。Wishlist とは**別のプロジェクト**（AutoMail）にする。Wishlist の publishable key は公開ページに載っているため。
  - 通知は Discord（Wishlist と同じ Webhook 方式）。
  - `.ics` の再送はやめ、スマホで Google カレンダーを直接同期する。
  - 「前回の続き」は Gmail のラベルではなく受信時刻で管理する。ラベルはスレッド単位なので、ラベル済みのスレッドへの返信（自分宛メモへの返信など）を取りこぼすため。
- 2026-10-14（改定）：
  - **スクリプトはルールで判断しない。** 分類・読み取り・広告ラベルをやめ、判断はすべて AI（Haiku → Sonnet の2段）にする。
  - Gmail ラベル `automail-skip` は使わない。

## 注意

- Apps Script には実行時間の上限がある（1回の実行・1日のトリガー合計）。毎時の取得は上限を見ながら件数を区切る。
