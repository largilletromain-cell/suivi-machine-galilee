import { useState } from "react";
import { authenticateUser } from "../lib/supabaseClient";

export default function PasswordGate({ centers, onUnlock }) {
  const [username, setUsername] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [userError, setUserError] = useState("");
  const [checkingUser, setCheckingUser] = useState(false);

  async function handleUserSubmit(e) {
    e.preventDefault();
    setCheckingUser(true);
    setUserError("");
    try {
      const user = await authenticateUser(username, userPassword);
      if (!user) {
        setUserError("Identifiant ou mot de passe incorrect.");
        return;
      }
      onUnlock({
        mode: "user",
        role: user.role,
        centerId: user.center_id || null,
        username: user.username,
      });
    } catch (err) {
      setUserError("Impossible de vérifier ces identifiants pour le moment. Réessayez.");
    } finally {
      setCheckingUser(false);
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
        padding: 16,
      }}
    >
      <div
        style={{
          background: "var(--surface)",
          borderRadius: 10,
          padding: "32px 28px",
          width: 340,
          maxWidth: "100%",
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
        <h2 style={{ margin: "0 0 18px", fontSize: "1.1rem" }}>Groupe PSV</h2>

        {centers?.length > 0 && (
          <>
            <div style={{ fontSize: "0.78rem", color: "var(--ink-soft)", marginBottom: 8, fontWeight: 600 }}>
              Accès rapide Manipulateur
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {centers.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onUnlock({ mode: "manipulateur", centerId: c.id })}
                  style={{
                    width: "100%",
                    background: "var(--accent-soft)",
                    color: "var(--accent-strong)",
                    border: "1px solid var(--accent)",
                    borderRadius: 6,
                    padding: "9px 0",
                    fontWeight: 600,
                    fontSize: "0.85rem",
                  }}
                >
                  Manipulateur — {c.name}
                </button>
              ))}
            </div>
            <p style={{ fontSize: "0.7rem", color: "var(--ink-soft)", margin: "0 0 16px", textAlign: "center" }}>
              Accès direct au Registre Pannes de ce centre, sans mot de passe
            </p>
            <Divider />
          </>
        )}

        <div style={{ fontSize: "0.78rem", color: "var(--ink-soft)", margin: "16px 0 8px", fontWeight: 600 }}>
          Compte personnel
        </div>
        <form onSubmit={handleUserSubmit}>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Identifiant"
            autoComplete="username"
            style={{ width: "100%", marginBottom: 8 }}
          />
          <input
            type="password"
            value={userPassword}
            onChange={(e) => setUserPassword(e.target.value)}
            placeholder="Mot de passe"
            autoComplete="current-password"
            style={{ width: "100%", marginBottom: 8 }}
          />
          {userError && (
            <p style={{ color: "var(--status-bad-ink)", fontSize: "0.8rem", margin: "0 0 8px" }}>{userError}</p>
          )}
          <button
            type="submit"
            disabled={checkingUser}
            style={{
              width: "100%",
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "9px 0",
              fontWeight: 600,
              fontSize: "0.85rem",
            }}
          >
            {checkingUser ? "…" : "Se connecter"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Divider() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        margin: "14px 0",
        color: "var(--ink-soft)",
        fontSize: "0.72rem",
      }}
    >
      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
      ou
      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
    </div>
  );
}