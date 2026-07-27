// Parse le fichier liste_panne_source.txt en (code, description) et génère un fichier SQL
// d'insertion dans panne_types. Ce script est jetable : il sert uniquement à produire
// supabase/03_seed_panne_types.sql une fois. Vous pouvez le relancer si vous mettez à jour
// la liste source.
import { readFileSync, writeFileSync } from "fs";

const raw = readFileSync(new URL("./liste_panne_source.txt", import.meta.url), "utf-8");
const lines = raw
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l.length > 0);

function escape(s) {
  return s.replace(/'/g, "''");
}

// Un code de panne ressemble à "108-", "26 - ", "1- ", "49.- " en tête de ligne.
const codeRegex = /^(\d{1,4})\s*[.\-–]*\s*[-–]\s*(.*)$/;

const rows = lines.map((line) => {
  const m = line.match(codeRegex);
  if (m) {
    const code = m[1];
    const description = m[2].trim();
    return { code, description: description || line };
  }
  return { code: "", description: line };
});

const values = rows
  .map(
    (r) =>
      `('${escape(r.code)}', '${escape(r.description)}', true)`
  )
  .join(",\n");

const sql = `-- Généré automatiquement à partir de liste_panne_source.txt par parse_pannes.mjs
-- Ne pas éditer directement ce fichier de seed initial : utilisez l'interface
-- "Gérer la liste des pannes" de l'application pour les mises à jour futures,
-- ou relancez ce script après avoir modifié liste_panne_source.txt.

insert into panne_types (code, description, active)
values
${values}
on conflict do nothing;
`;

writeFileSync(new URL("./03_seed_panne_types.sql", import.meta.url), sql, "utf-8");
console.log(`Généré ${rows.length} lignes.`);
