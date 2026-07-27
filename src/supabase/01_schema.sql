-- ============================================================================
-- Tableau de bord de suivi machines — schéma Supabase
-- Centre Galilée (extensible à d'autres centres)
-- ============================================================================
-- À exécuter dans Supabase : SQL Editor > New query > coller > Run
-- Ordre : 01_schema.sql, puis 02_seed_centres_machines.sql, puis 03_seed_panne_types.sql

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Centres (pour permettre l'ajout d'autres centres plus tard)
-- ----------------------------------------------------------------------------
create table if not exists centers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,          -- ex: 'galilee'
  name text not null,                 -- ex: 'Centre Galilée'
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Machines de radiothérapie (onglet "Registre Pannes")
-- ----------------------------------------------------------------------------
create table if not exists machines (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references centers(id) on delete cascade,
  code text not null,                 -- ex: 'RX4010518'
  label text,                         -- libellé optionnel affiché
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (center_id, code)
);

-- ----------------------------------------------------------------------------
-- Liste des types de panne, éditable manuellement depuis l'appli
-- ----------------------------------------------------------------------------
create table if not exists panne_types (
  id uuid primary key default gen_random_uuid(),
  code text,                          -- code numérique de la panne (ex: '108'), peut être vide
  description text not null,          -- libellé complet affiché dans la liste déroulante
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Registre des pannes machine (une ligne = un événement de panne)
-- ----------------------------------------------------------------------------
create table if not exists pannes (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references machines(id) on delete cascade,
  date_panne date not null,
  heure_debut time not null,
  heure_fin time,
  panne_type_id uuid references panne_types(id),
  commentaire text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Équipements suivis dans l'onglet "Work Order" (machines + logiciels)
-- ----------------------------------------------------------------------------
create table if not exists wo_equipments (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references centers(id) on delete cascade,
  code text not null,                 -- ex: 'RX4010518', 'RayStation', 'Mosaiq'
  label text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (center_id, code)
);

-- ----------------------------------------------------------------------------
-- Work Orders
-- ----------------------------------------------------------------------------
create table if not exists work_orders (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references wo_equipments(id) on delete cascade,
  panne_erreur text not null,
  date_decouverte date,
  statut text not null default 'non_resolu'
    check (statut in ('resolu', 'non_resolu', 'en_surveillance')),
  statut_wo text not null default 'ouvert'
    check (statut_wo in ('ouvert', 'ferme')),
  wo_number text,
  date_intervention date,
  rapport_recu boolean not null default false,
  commentaires text,
  resolved_via_maintenance boolean not null default false,
  maintenance_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Périodes d'immobilisation machine liées à un Work Order (0..n par WO)
-- ----------------------------------------------------------------------------
create table if not exists downtime_periods (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references work_orders(id) on delete cascade,
  date_debut date not null,
  heure_debut time not null,
  date_fin date,
  heure_fin time,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- updated_at automatique
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_pannes_updated_at on pannes;
create trigger trg_pannes_updated_at before update on pannes
for each row execute function set_updated_at();

drop trigger if exists trg_work_orders_updated_at on work_orders;
create trigger trg_work_orders_updated_at before update on work_orders
for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- Row Level Security
-- L'application utilise un mot de passe applicatif simple (cf. README) plutôt
-- que l'auth Supabase complète. On ouvre donc l'accès via la clé "anon" à ce
-- stade ; ce n'est pas destiné à contenir de données patient nominatives.
-- Si vous voulez restreindre davantage plus tard, remplacez ces policies par
-- des règles basées sur l'authentification Supabase (auth.uid()).
-- ----------------------------------------------------------------------------
alter table centers enable row level security;
alter table machines enable row level security;
alter table panne_types enable row level security;
alter table pannes enable row level security;
alter table wo_equipments enable row level security;
alter table work_orders enable row level security;
alter table downtime_periods enable row level security;

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'centers','machines','panne_types','pannes',
    'wo_equipments','work_orders','downtime_periods'
  ])
  loop
    execute format('drop policy if exists "anon_all_%s" on %I;', t, t);
    execute format(
      'create policy "anon_all_%s" on %I for all using (true) with check (true);',
      t, t
    );
  end loop;
end $$;
