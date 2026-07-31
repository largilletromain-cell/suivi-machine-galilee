import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Ne bloque pas le build, mais avertit clairement en dev/console.
  console.warn(
    "Variables VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquantes. " +
      "Copiez .env.example vers .env.local et renseignez vos valeurs Supabase."
  );
}

export const supabase = createClient(supabaseUrl ?? "", supabaseAnonKey ?? "");

// Petit utilitaire pour retenter un appel Supabase après un cold-start
// (le projet gratuit Supabase peut mettre quelques secondes à se réveiller).
export async function withRetry(fn, attempts = 3, delayMs = 1200) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      const result = await fn();
      if (result?.error) throw result.error;
      return result;
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastError;
}

// Mot de passe d'accès : stocké dans Supabase (table app_settings) pour
// pouvoir être changé depuis l'application. Tant qu'aucune valeur n'a été
// définie, on retombe sur VITE_APP_PASSWORD (celui configuré dans Vercel).
export async function getAppPassword() {
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "app_password")
      .maybeSingle();
    if (data?.value) return data.value;
  } catch (e) {
    // table pas encore migrée, ou hors ligne : on retombe sur l'env var ci-dessous
  }
  return import.meta.env.VITE_APP_PASSWORD || "";
}

export async function setAppPassword(newPassword) {
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: "app_password", value: newPassword });
  if (error) throw error;
}

// Échappe les caractères spéciaux d'ILIKE (% et _) pour un match exact,
// insensible à la casse.
function escapeForIlike(s) {
  return s.replace(/[%_\\]/g, (c) => `\\${c}`);
}

// Authentifie un compte nominatif (identifiant + mot de passe) et renvoie sa
// fiche (role, center_id...) si les identifiants correspondent, sinon null.
// L'identifiant est insensible à la casse (ILIKE) — le mot de passe reste
// sensible à la casse.
export async function authenticateUser(username, password) {
  const { data, error } = await supabase
    .from("app_users")
    .select("*")
    .ilike("username", escapeForIlike(username.trim()))
    .eq("password", password)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Journal d'activité : enregistre une ligne décrivant une action de
// modification, et purge en même temps les entrées de plus de 3 mois pour
// que la table ne grossisse pas indéfiniment.
export async function logActivity(username, action) {
  try {
    await supabase.from("activity_logs").insert({ username: username || "inconnu", action });
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    await supabase.from("activity_logs").delete().lt("created_at", threeMonthsAgo.toISOString());
  } catch (e) {
    // La journalisation ne doit jamais bloquer l'action métier elle-même.
    console.warn("Impossible d'enregistrer le log d'activité :", e);
  }
}