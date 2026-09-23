# CLAUDE.md

このリポジトリは「期限と受け取りボード」（Gmail → ボード＋Google カレンダーの自動整理）の仕様・運用ルールの正本です。コードではなく、Claude が Scheduled task で実行する手順書が中心です。

## 作業前に読むもの

1. [`README.md`](README.md) — システム全体像
2. [`docs/update-procedure.md`](docs/update-procedure.md) — 色分け・命名規則・時刻の落とし穴・カレンダー書き漏れ防止などの詳細ルール
3. [`prompts/scheduled-task.md`](prompts/scheduled-task.md) — 定期実行の prompt 雛形

## ルール

- **このリポジトリは public。** メールアドレス、注文番号・予約番号、人名、Drive のファイル ID、Artifact URL、Routine の trigger ID などの具体値をコミットしない。必要なら `{{PLACEHOLDER}}` で書き、実値は `config/config.local.md`（gitignore 済み）や Routine の prompt 側に置く。
- メール本文・メールDB・台帳の中身（個人のやり取り）はリポジトリに入れない。
- 運用ルールを変えたら、`docs/update-procedure.md` と `prompts/scheduled-task.md` の両方を同時に更新し、食い違わないようにする。Routine 側の prompt も更新が必要な場合はユーザーに伝える。
- 大きな節目（新カテゴリ追加・運用ルール変更）では `README.md` の変更履歴にも1行追記する。
- ドキュメントは日本語で書く。
