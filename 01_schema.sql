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

export const CENTER_CODE = "galilee";

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
