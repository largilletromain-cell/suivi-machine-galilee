-- Migration à exécuter dans le SQL Editor Supabase (une seule fois).
-- Ajoute un commentaire optionnel à chaque période d'immobilisation, affiché
-- ensuite comme sous-puce sous l'intitulé de la panne/erreur dans l'onglet
-- Work Order.

alter table downtime_periods
  add column if not exists commentaire text;
