-- 省トークン自動化（段階1）のテーブル。Supabase の AutoMail プロジェクトで SQL Editor に貼って1回実行する。
-- Wishlist とは別プロジェクトにしている（Wishlist の publishable key は公開ページに載っているため、混ぜない）。
-- 読み書きできるのは secret key（Apps Script のスクリプトプロパティに置く）だけ。RLS を有効にして規則は作らない。

-- 1通1行。Gmail のメッセージ ID が主キーなので、同じメールを2回書いても増えない。
create table if not exists public.mails (
  id               text primary key,             -- Gmail のメッセージ ID
  thread_id        text not null,
  received_at      timestamptz not null,         -- Gmail の受信時刻（表示は JST に直す）
  from_name        text,
  from_address     text,
  to_address       text,
  subject          text,
  excerpt          text,                         -- 本文（プレーンテキスト）の先頭 1,500 字
  list_unsubscribe boolean not null default false, -- List-Unsubscribe ヘッダーか本文の配信停止の案内（広告の手がかり）
  forwarded        boolean not null default false, -- Outlook から「FW:」で転送されたもの（差出人・件名は中の元のもの）
  skip_label       boolean not null default false, -- automail-skip ラベルを付けた（Routine が読まない）
  category         text not null,                -- ルールで決めた分類（自分宛メモ / 行政 / 金融・セキュリティ / …）
  route            text not null check (route in ('rule', 'ai')),  -- rule = スクリプトで処理できる、ai = AI の判断が要る
  urgent           boolean not null default false,
  rule             text,                         -- 当たったルールの名前
  amounts          integer[],                    -- 本文・件名から拾った円の金額
  collected_at     timestamptz not null default now()
);
create index if not exists mails_received_at on public.mails (received_at desc);
create index if not exists mails_route on public.mails (route, received_at desc);

-- 送信元・件名ごとの分類ルール（利用中の金融機関などが分かるので、公開リポジトリではなくここに置く）。
-- 組み込みルールより先に、id の小さい順に照合する。
create table if not exists public.rules (
  id        bigserial primary key,
  kind      text not null check (kind in ('from_address', 'from_domain', 'subject_regex', 'body_regex')),
  pattern   text not null,
  category  text not null,
  route     text not null default 'rule' check (route in ('rule', 'ai')),
  urgent    boolean not null default false,
  note      text,
  enabled   boolean not null default true,
  created_at timestamptz not null default now()
);

-- 「前回の続き」などの状態（旧 台帳の一部）。正本は Apps Script のスクリプトプロパティで、ここは確認用の写し。
create table if not exists public.state (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- 実行ごとの記録（取りこぼし・エラーの確認用）。
create table if not exists public.runs (
  id            bigserial primary key,
  started_at    timestamptz not null,
  finished_at   timestamptz not null default now(),
  fetched       integer not null default 0,     -- 新しく見つけた通数
  written       integer not null default 0,     -- DB に送った通数
  remaining     boolean not null default false, -- 上限・時間切れで次回に持ち越したか
  cursor_before timestamptz,
  cursor_after  timestamptz,
  error         text
);

alter table public.mails enable row level security;
alter table public.rules enable row level security;
alter table public.state enable row level security;
alter table public.runs  enable row level security;
revoke all on public.mails, public.rules, public.state, public.runs from anon, authenticated;
revoke all on sequence public.rules_id_seq, public.runs_id_seq from anon, authenticated;
