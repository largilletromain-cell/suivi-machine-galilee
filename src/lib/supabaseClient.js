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

// Authentifie un compte nominatif (identifiant + mot de passe) et renvoie sa
// fiche (role, center_id...) si les identifiants correspondent, sinon null.
export async function authenticateUser(username, password) {
  const { data, error } = await supabase
    .from("app_users")
    .select("*")
    .eq("username", username.trim())
    .eq("password", password)
    .maybeSingle();
  if (error) throw error;
  return data;
}