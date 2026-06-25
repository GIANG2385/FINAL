-- src/scripts/supabase_schema.sql
-- Run once in Supabase SQL editor to create all tables.

-- tables
create table if not exists tables (
  table_id  text primary key,
  capacity  int  not null,
  status    text not null default 'open',  -- open | dining | reserved | cleanup
  seated_at timestamptz
);

-- menu_items
create table if not exists menu_items (
  sku         text primary key,
  name_en     text not null,
  name_vi     text not null,
  unit_price  int  not null,
  category    text
);

-- inventory
create table if not exists inventory (
  sku                   text primary key,
  name_en               text not null,
  name_vi               text not null,
  unit                  text not null,
  current_stock         numeric not null default 0,
  par_level             numeric not null default 0,
  avg_daily_consumption numeric not null default 0,
  cost_per_unit         numeric not null default 0,
  last_restocked_at     timestamptz
);

-- staff_shifts
create table if not exists staff_shifts (
  staff_id         text primary key,
  name             text not null,
  role             text not null,
  shift            text,
  shift_start      timestamptz not null,
  shift_end        timestamptz not null,
  station          text,
  tasks_completed  int not null default 0
);

-- orders (already exists — safe to re-run with IF NOT EXISTS)
create table if not exists orders (
  id             text primary key,
  table_id       text,
  channel        text not null default 'dine_in',
  status         text not null default 'open',
  items          jsonb not null default '[]',
  total_amount   numeric not null default 0,
  payment_method text,
  created_at     timestamptz not null default now(),
  served_at      timestamptz
);
create index if not exists orders_status_idx      on orders (status);
create index if not exists orders_served_at_idx   on orders (served_at);
create index if not exists orders_created_at_idx  on orders (created_at);

-- kitchen_queue
create table if not exists kitchen_queue (
  queue_id             text primary key default gen_random_uuid(),
  order_id             text not null,
  table_id             text,
  item_sku             text,
  item_name            text,
  qty                  int  not null default 1,
  station              text not null default 'kitchen',
  status               text not null default 'queued',
  queued_at            timestamptz not null default now(),
  started_at           timestamptz,
  completed_at         timestamptz,
  prep_time_target_min int  not null default 15
);
create index if not exists kitchen_queue_status_idx on kitchen_queue (status);

-- insights
create table if not exists insights (
  id               text primary key default gen_random_uuid(),
  type             text not null,
  severity         text not null,
  summary_en       text not null,
  summary_vi       text not null,
  related_entities jsonb not null default '{}',
  status           text not null default 'new',
  created_at       timestamptz not null default now()
);
create index if not exists insights_type_idx   on insights (type);
create index if not exists insights_status_idx on insights (status);

-- reservations
create table if not exists reservations (
  reservation_id   text primary key,
  guest_name       text not null,
  party_size       int  not null,
  table_id         text,
  reservation_time timestamptz not null,
  status           text not null default 'confirmed',
  phone            text
);
create index if not exists reservations_time_idx on reservations (reservation_time);

-- consultant_messages (flattened from Firestore subcollection)
create table if not exists consultant_messages (
  id         text primary key default gen_random_uuid(),
  user_id    text not null,
  role       text not null,  -- user | assistant
  content    text not null,
  created_at timestamptz not null default now()
);
create index if not exists consultant_messages_user_idx on consultant_messages (user_id, created_at);

-- analytics_baseline (single-row table)
create table if not exists analytics_baseline (
  id               text primary key,  -- always 'historical_baseline'
  distinct_days    int     not null default 0,
  avg_daily_revenue numeric not null default 0,
  by_weekday       jsonb   not null default '{}',
  by_hour          jsonb   not null default '{}',
  computed_at      timestamptz not null default now()
);

-- users
create table if not exists users (
  uid    text primary key,
  email  text,
  role   text not null default 'staff'
);
