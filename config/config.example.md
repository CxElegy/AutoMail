# 設定値の置き場所（例）

このリポジトリは public なので、実際の値はここに書きません。
以下の項目は Scheduled task の prompt、または Drive 上の `01_記録台帳` に記録して管理します。
ローカルで値を控えたい場合は `config/config.local.md` を作成してください（`.gitignore` 済み）。

| キー | 内容 | 例 |
|---|---|---|
| `GMAIL_ACCOUNT` | 監視対象の Gmail アドレス | `you@gmail.com` |
| `ARTIFACT_URL` | ボード（Artifact）の URL | `https://claude.ai/code/artifact/xxxxxxxx-...` |
| `ROOT_FOLDER_ID` | Drive フォルダ「期限と受け取りボード」の ID | `1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `LEDGER_FOLDER_ID` | `01_記録台帳` を置くフォルダの ID（通常は ROOT と同じ） | 同上 |
| `MANUAL_FOLDER_ID` | 手順書（`00_更新手順`・`00a_省トークン運転ルール`）を置くフォルダの ID（現状は MAILDB と同じ） | 同上 |
| `MAILDB_FOLDER_ID` | `02_メールDB（1件1ブリーフィング）` フォルダの ID | 同上 |
| `TRIGGER_ID` | Scheduled task（Routine）の ID | `trig_xxxxxxxxxxxxxxxxxxxxxxxx` |
| `CALENDAR_ID` | 書き込み先カレンダー | `primary` |
| `FORWARDING_SOURCE` | 自分宛メモ・転送元のアドレス（Outlook 等） | `you@outlook.com` |
