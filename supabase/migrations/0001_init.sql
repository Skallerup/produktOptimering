-- Enable UUID generation
create extension if not exists "uuid-ossp";

create table if not exists public.stores (
  id uuid primary key default uuid_generate_v4(),
  base_url text not null unique,
  created_at timestamptz not null default timezone('utc', now()),
  last_synced_at timestamptz
);

create table if not exists public.products (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references public.stores(id) on delete cascade,
  remote_id text not null,
  name text not null,
  short_description text,
  description text,
  permalink text,
  price text,
  sku text,
  image text,
  meta_title text,
  meta_description text,
  word_count integer,
  raw jsonb,
  last_crawled_at timestamptz not null default timezone('utc', now()),
  unique (store_id, remote_id)
);

create table if not exists public.analyses (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references public.products(id) on delete cascade,
  model text not null,
  analysis jsonb not null,
  created_at timestamptz not null default timezone('utc', now())
);

