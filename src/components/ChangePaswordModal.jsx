import { useState } from "react";
import { getAppPassword, setAppPassword } from "../lib/supabaseClient";

export default function ChangePasswordModal({ onClose }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!next || next.length < 4) {
      setError("Le nouveau mot de passe doit faire au moins 4 caractères.");
      return;
    }
    if (next !== confirm) {
      setError("Les deux saisies du nouveau mot de passe ne correspondent pas.");
      return;
    }
    setSaving(true);
    try {
      const expected = await getAppPassword();
      if (expected && current !== expected) {
        setError("Mot de passe actuel incorrect.");
        setSaving(false);
        return;
      }
      await setAppPassword(next);
      setSuccess(true);
    } catch (err) {
      setError("Impossible d'enregistrer le nouveau mot de passe. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(14,22,28,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 60,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)",
          borderRadius: 12,
          padding: 22,
          width: 380,
          maxWidth: "100%",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
          <h3 style={{ margin: 0, fontSize: "1rem" }}>Changer le mot de passe d'accès</h3>
          <button
            onClick={onClose}
            style={{ border: "none", background: "transparent", fontSize: "1.1rem", color: "var(--ink-soft)" }}
          >
            ✕
          </button>
        </div>

        {success ? (
          <div style={{ marginTop: 16 }}>
            <p style={{ color: "var(--status-ok-ink)", fontSize: "0.88rem" }}>
              Nouveau mot de passe enregistré. Il prend effet immédiatement pour toute
              nouvelle connexion (les personnes déjà connectées ne sont pas déconnectées).
            </p>
            <button
              onClick={onClose}
              style={{
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                padding: "8px 16px",
                fontWeight: 600,
                fontSize: "0.85rem",
              }}
            >
              Fermer
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ marginTop: 14 }}>
            <FieldLabel>Mot de passe actuel</FieldLabel>
            <input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              style={{ width: "100%", marginBottom: 10 }}
              autoFocus
            />
            <FieldLabel>Nouveau mot de passe</FieldLabel>
            <input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              style={{ width: "100%", marginBottom: 10 }}
            />
            <FieldLabel>Confirmer le nouveau mot de passe</FieldLabel>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              style={{ width: "100%", marginBottom: 10 }}
            />
            {error && (
              <p style={{ color: "var(--status-bad-ink)", fontSize: "0.8rem", margin: "0 0 10px" }}>{error}</p>
            )}
            <button
              type="submit"
              disabled={saving}
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
              {saving ? "…" : "Enregistrer le nouveau mot de passe"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function FieldLabel({ children }) {
  return (
    <label style={{ display: "block", fontSize: "0.78rem", color: "var(--ink-soft)", marginBottom: 4 }}>
      {children}
    </label>
  );
}