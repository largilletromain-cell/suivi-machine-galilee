-- Migration à exécuter dans le SQL Editor Supabase (une seule fois).
-- Crée une table centrale "systems" qui pilote à la fois les sous-onglets du
-- Registre Pannes (uniquement pour les machines Radixact/Varian) et les
-- sous-onglets du Work Order (pour tous les systèmes, machines comme
-- logiciels).

create table if not exists systems (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references centers(id) on delete cascade,
  name text not null,
  system_type text not null check (system_type in ('Radixact', 'Varian', 'Autre')),
  serial_number text,
  commissioning_date date,
  -- lien vers la ligne Registre Pannes créée automatiquement (uniquement si
  -- Radixact ou Varian) ; null pour un système "Autre" (ex : logiciel).
  machine_id uuid references machines(id) on delete set null,
  -- lien vers la ligne Work Order créée automatiquement (toujours renseigné).
  wo_equipment_id uuid references wo_equipments(id) on delete set null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table systems enable row level security;
drop policy if exists "anon_all_systems" on systems;
create policy "anon_all_systems" on systems for all using (true) with check (true);

-- Rétro-remplissage : fait apparaître dans Paramétrage tout ce qui existe déjà
-- (RX4010518, RX4010562, RayStation, Mosaiq, IMDS, Siemens Go.Sim, et toute
-- machine/équipement ajouté depuis les anciens boutons "+").

-- 1) Machines déjà existantes, reliées à leur équipement Work Order homonyme
--    s'il existe.
insert into systems (center_id, name, system_type, machine_id, wo_equipment_id, sort_order)
select m.center_id, m.code, coalesce(m.machine_type, 'Autre'), m.id, we.id, m.sort_order
from machines m
left join wo_equipments we on we.center_id = m.center_id and we.code = m.code
where not exists (select 1 from systems s where s.machine_id = m.id);

-- 2) Équipements Work Order qui ne sont reliés à aucune machine (logiciels,
--    ou machines ajoutées uniquement côté Work Order).
insert into systems (center_id, name, system_type, wo_equipment_id, sort_order)
select we.center_id, we.code, 'Autre', we.id, we.sort_order
from wo_equipments we
where not exists (select 1 from systems s where s.wo_equipment_id = we.id);