-- 省トークン自動化のテーブル。Supabase の AutoMail プロジェクトで SQL Editor に貼って1回実行する。
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
  excerpt          text,                         -- 本文（転送の見出し・URL・見えない文字を除いたプレーンテキスト）の先頭 3,000 字
  list_unsubscribe boolean not null default false, -- List-Unsubscribe ヘッダーがあった（転送では消えるので参考程度）
  forwarded        boolean not null default false, -- Outlook から「FW:」で転送されたもの（差出人・件名は中の元のもの）
  self_sent        boolean not null default false, -- 自分のアドレスから転送でなく届いた（自分で書いたメモの候補）
  -- ここから下は AI が書く（スクリプトは判断しない。分担は docs/automation-plan.md）
  category         text,                         -- 分類（広告 / カード利用 / 買い物 / 到着 / 移動・宿泊 / 自分宛メモ / 行政 / …）
  urgent           boolean not null default false,
  ai               jsonb,                        -- 読み取り結果（summary / purchases / events / escalate / why）
  ai_model         text,                         -- 読んだモデル（haiku / sonnet …）
  ai_at            timestamptz,                  -- AI が処理した時刻。null = 未処理
  escalated        boolean not null default false, -- 安いモデルが「判断が要る」として上位モデルに回した
  -- 旧（ルールで分類していた頃の列。新しいコードは書かない。Apps Script を入れ替えたあとで消す）
  route            text check (route in ('rule', 'ai')),
  rule             text,
  amounts          integer[],
  skip_label       boolean not null default false,
  collected_at     timestamptz not null default now()
);
create index if not exists mails_received_at on public.mails (received_at desc);
create index if not exists mails_unprocessed on public.mails (received_at) where ai_at is null;

-- 旧：送信元・件名ごとの分類ルール（ルールで分類していた頃のもの。今は使わない）。
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
  error         text,
  command       text                            -- このとき実行した state 'command' の結果（pending / done / error）
);

-- AI が ai->'purchases' に書いた明細を1行ずつ並べたもの。重複（カード通知と注文メールなど）は AI が skip=true にする。
create or replace view public.purchase_lines with (security_invoker = true) as
select m.id as mail_id, (p.ord - 1)::int as idx,
       (p.v->>'date')::date as date, p.v->>'time' as time, p.v->>'shop' as shop,
       (p.v->>'amount_jpy')::int as amount_jpy, p.v->'fx' as fx,
       coalesce(p.v->>'kind', 'buy') as kind, coalesce((p.v->>'skip')::boolean, false) as skip
from public.mails m, jsonb_array_elements(coalesce(m.ai->'purchases', '[]'::jsonb)) with ordinality as p(v, ord);

-- 日次合計（[買] N円）。足し算は AI にさせずにここでする。仮の承認（pending）と skip は数えない。
create or replace view public.daily_totals with (security_invoker = true) as
select date,
       sum(amount_jpy) filter (where not skip and kind <> 'pending') as total_jpy,
       count(*) filter (where not skip and kind <> 'pending') as lines,
       jsonb_agg(fx) filter (where fx is not null and fx <> 'null'::jsonb and not skip and kind <> 'pending') as fx
from public.purchase_lines group by date;

alter table public.mails enable row level security;
alter table public.rules enable row level security;
alter table public.state enable row level security;
alter table public.runs  enable row level security;
revoke all on public.mails, public.rules, public.state, public.runs from anon, authenticated;
revoke all on sequence public.rules_id_seq, public.runs_id_seq from anon, authenticated;
revoke all on public.purchase_lines, public.daily_totals from anon, authenticated;
