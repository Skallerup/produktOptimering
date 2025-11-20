-- Tilføj nye kolonner til products tabellen
alter table public.products
  add column if not exists date_created timestamptz,
  add column if not exists brand text,
  add column if not exists tags text[],
  add column if not exists stock_status text,
  add column if not exists on_sale boolean default false,
  add column if not exists featured boolean default false,
  add column if not exists category_ids integer[],
  add column if not exists category_names text[];

-- Opret index for hurtigere filtrering
create index if not exists idx_products_brand on public.products(brand);
create index if not exists idx_products_date_created on public.products(date_created);
create index if not exists idx_products_on_sale on public.products(on_sale);
create index if not exists idx_products_featured on public.products(featured);
create index if not exists idx_products_stock_status on public.products(stock_status);

