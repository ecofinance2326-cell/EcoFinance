-- EcoFinance: skema database Supabase. Jalankan sekali di SQL Editor.

create table if not exists public.businesses (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  name       text not null default 'Usaha Saya',
  sector     text not null default 'Usaha kecil',
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date       date not null,
  type       text not null check (type in ('in','out')),
  category   text not null,
  note       text not null default '',
  amount     bigint not null check (amount > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.emissions (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date       date not null,
  source     text not null,
  note       text not null default '',
  qty        numeric not null check (qty > 0),
  factor     numeric not null check (factor >= 0),  -- faktor saat dicatat, kg CO2e per satuan
  created_at timestamptz not null default now()
);

create index if not exists transactions_user_date on public.transactions (user_id, date);
create index if not exists emissions_user_date    on public.emissions (user_id, date);

alter table public.businesses   enable row level security;
alter table public.transactions enable row level security;
alter table public.emissions    enable row level security;

-- Setiap pengguna hanya melihat dan mengubah barisnya sendiri.
create policy "businesses_own" on public.businesses
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "transactions_own" on public.transactions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "emissions_own" on public.emissions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Buat profil usaha otomatis saat pengguna baru mendaftar.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.businesses (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
