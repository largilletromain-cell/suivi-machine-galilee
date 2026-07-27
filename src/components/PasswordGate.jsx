import { useState } from "react";

export default function PasswordGate({ onUnlock }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    const expected = import.meta.env.VITE_APP_PASSWORD;
    if (!expected) {
      // Pas de mot de passe configuré : on laisse passer plutôt que de bloquer
      // définitivement l'accès (utile en développement local).
      onUnlock();
      return;
    }
    if (value === expected) {
      onUnlock();
    } else {
      setError("Mot de passe incorrect.");
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
      <form
        onSubmit={handleSubmit}
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
          Entrer
        </button>
      </form>
    </div>
  );
}
