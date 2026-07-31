import { useEffect, useState } from "react";
import { getOpeningHours, setOpeningHours, logActivity } from "../lib/supabaseClient";
import { Panel } from "./ui";
import { useAccess } from "../lib/access";

export default function Parametres() {
  const { readOnly, username } = useAccess();
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("18:00");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const hours = await getOpeningHours();
    setStart(hours.start);
    setEnd(hours.end);
    setLoading(false);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (start >= end) {
      setError("L'heure de fin doit être après l'heure de début.");
      return;
    }
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await setOpeningHours(start, end);
      logActivity(username, `a modifié les horaires d'ouverture des machines (${start} - ${end})`);
      setSaved(true);
    } catch (e) {
      setError("Impossible d'enregistrer ces horaires. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  const dailyHours =
    start < end
      ? (() => {
          const [sh, sm] = start.split(":").map(Number);
          const [eh, em] = end.split(":").map(Number);
          return (eh + em / 60 - (sh + sm / 60)).toFixed(1);
        })()
      : null;

  return (
    <Panel>
      <h3 style={{ margin: "0 0 8px", fontSize: "0.95rem" }}>Horaires d'ouverture des machines</h3>
      <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem", marginTop: 0 }}>
        Ces horaires servent à calculer <strong>automatiquement</strong> la disponibilité théorique de
        chaque machine dans l'onglet Statistiques : nombre de jours ouvrés du mois (jours de semaine,
        hors jours fériés français) × amplitude horaire ci-dessous. Il n'y a plus besoin de saisir la
        disponibilité théorique mois par mois dans chaque machine.
      </p>

      {loading ? (
        <p style={{ color: "var(--ink-soft)" }}>Chargement…</p>
      ) : (
        <form onSubmit={handleSave} style={{ display: "flex", gap: 16, alignItems: "end", flexWrap: "wrap" }}>
          <Field label="Heure de début de journée">
            <input
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              disabled={readOnly}
              style={{ width: 130 }}
            />
          </Field>
          <Field label="Heure de fin de journée">
            <input
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              disabled={readOnly}
              style={{ width: 130 }}
            />
          </Field>
          {dailyHours && (
            <p style={{ fontSize: "0.82rem", color: "var(--ink-soft)", margin: 0 }}>
              Soit <strong>{dailyHours} h</strong> par jour ouvré.
            </p>
          )}
          {!readOnly && (
            <button
              type="submit"
              disabled={saving}
              style={{
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                padding: "8px 16px",
                fontWeight: 600,
                height: 34,
              }}
            >
              {saving ? "…" : "Enregistrer"}
            </button>
          )}
        </form>
      )}
      {error && <p style={{ color: "var(--status-bad-ink)", fontSize: "0.85rem" }}>{error}</p>}
      {saved && !error && <p style={{ color: "var(--status-ok-ink)", fontSize: "0.85rem" }}>Enregistré ✓</p>}
    </Panel>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "block", fontSize: "0.72rem", color: "var(--ink-soft)" }}>
      {label}
      <div style={{ marginTop: 4 }}>{children}</div>
    </label>
  );
}