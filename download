-- Centre initial : Centre Galilée
insert into centers (code, name)
values ('galilee', 'Centre Galilée')
on conflict (code) do nothing;

-- Machines de l'onglet "Registre Pannes"
insert into machines (center_id, code, label, sort_order)
select c.id, m.code, m.label, m.sort_order
from centers c
cross join (values
  ('RX4010518', 'RX4010518', 1),
  ('RX4010562', 'RX4010562', 2)
) as m(code, label, sort_order)
where c.code = 'galilee'
on conflict (center_id, code) do nothing;

-- Équipements de l'onglet "Work Order" (machines + logiciels)
insert into wo_equipments (center_id, code, label, sort_order)
select c.id, e.code, e.label, e.sort_order
from centers c
cross join (values
  ('RX4010518', 'RX4010518', 1),
  ('RX4010562', 'RX4010562', 2),
  ('RayStation', 'RayStation', 3),
  ('SiemensGoSim', 'Siemens Go.Sim', 4),
  ('IMDS', 'IMDS', 5),
  ('Mosaiq', 'Mosaiq', 6)
) as e(code, label, sort_order)
where c.code = 'galilee'
on conflict (center_id, code) do nothing;
