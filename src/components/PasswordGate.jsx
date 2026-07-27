import { useState } from "react";
import { getAppPassword } from "../lib/supabaseClient";

export default function PasswordGate({ onUnlock }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setChecking(true);
    setError("");
    try {
      const expected = await getAppPassword();
      if (!expected || value === expected) {
        onUnlock("full");
      } else {
        setError("Mot de passe incorrect.");
      }
    } catch (err) {
      setError("Impossible de vérifier le mot de passe pour le moment. Réessayez.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--rail)",
      }}
    >
      <div
        style={{
          background: "var(--surface)",
          borderRadius: 10,
          padding: "32px 28px",
          width: 320,
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
        }}
      >
        <div
          style={{
            fontSize: "0.7rem",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--ink-soft)",
            fontWeight: 600,
            marginBottom: 4,
          }}
        >
          Suivi machines
        </div>
        <h2 style={{ margin: "0 0 18px", fontSize: "1.1rem" }}>Centre Galilée</h2>

        <form onSubmit={handleSubmit}>
          <label
            htmlFor="pw"
            style={{ display: "block", fontSize: "0.85rem", marginBottom: 6 }}
          >
            Mot de passe d'accès
          </label>
          <input
            id="pw"
            type="password"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            style={{ width: "100%", marginBottom: 10 }}
          />
          {error && (
            <p style={{ color: "var(--status-bad-ink)", fontSize: "0.8rem", margin: "0 0 10px" }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={checking}
            style={{
              width: "100%",
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "10px 0",
              fontWeight: 600,
              fontSize: "0.9rem",
            }}
          >
            {checking ? "…" : "Entrer"}
          </button>
        </form>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            margin: "18px 0",
            color: "var(--ink-soft)",
            fontSize: "0.72rem",
          }}
        >
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          ou
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        </div>

        <button
          type="button"
          onClick={() => onUnlock("manipulateur")}
          style={{
            width: "100%",
            background: "var(--accent-soft)",
            color: "var(--accent-strong)",
            border: "1px solid var(--accent)",
            borderRadius: 6,
            padding: "10px 0",
            fontWeight: 600,
            fontSize: "0.9rem",
          }}
        >
          Manipulateur
        </button>
        <p style={{ fontSize: "0.72rem", color: "var(--ink-soft)", margin: "6px 0 0", textAlign: "center" }}>
          Accès direct au Registre Pannes, sans mot de passe
        </p>
      </div>
    </div>
  );
}