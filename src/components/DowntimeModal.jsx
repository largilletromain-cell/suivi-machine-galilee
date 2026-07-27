import { useEffect, useState } from "react";
import { supabase, withRetry } from "../lib/supabaseClient";
import { IconButton } from "./ui";

const emptyPeriod = { date_debut: "", heure_debut: "", date_fin: "", heure_fin: "", commentaire: "" };

export default function DowntimeModal({ workOrder, onClose, onWorkOrderUpdated, onPeriodsChanged }) {
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyPeriod);
  const [resolvedViaMaintenance, setResolvedViaMaintenance] = useState(
    workOrder.resolved_via_maintenance
  );
  const [maintenanceDate, setMaintenanceDate] = useState(workOrder.maintenance_date || "");
  const [error, setError] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const res = await withRetry(() =>
      supabase
        .from("downtime_periods")
        .select("*")
        .eq("work_order_id", workOrder.id)
        .order("date_debut", { ascending: false })
    );
    setPeriods(res.data ?? []);
    setLoading(false);
  }

  async function handleAddPeriod(e) {
    e.preventDefault();
    if (!form.date_debut || !form.heure_debut) {
      setError("Date et heure de début d'immobilisation obligatoires.");
      return;
    }
    setError("");
    await withRetry(() =>
      supabase.from("downtime_periods").insert({
        work_order_id: workOrder.id,
        date_debut: form.date_debut,
        heure_debut: form.heure_debut,
        date_fin: form.date_fin || null,
        heure_fin: form.heure_fin || null,
        commentaire: form.commentaire || null,
      })
    );
    setForm(emptyPeriod);
    load();
    onPeriodsChanged?.();
  }

  async function handleDeletePeriod(id) {
    await withRetry(() => supabase.from("downtime_periods").delete().eq("id", id));
    setPeriods((p) => p.filter((x) => x.id !== id));
    onPeriodsChanged?.();
  }

  async function handleSaveMaintenance() {
    const res = await withRetry(() =>
      supabase
        .from("work_orders")
        .update({
          resolved_via_maintenance: resolvedViaMaintenance,
          maintenance_date: resolvedViaMaintenance ? maintenanceDate || null : null,
          statut: resolvedViaMaintenance ? "resolu" : workOrder.statut,
        })
        .eq("id", workOrder.id)
        .select()
        .single()
    );
    if (res.data) onWorkOrderUpdated(res.data);
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
        zIndex: 50,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)",
          borderRadius: 12,
          padding: 22,
          width: 560,
          maxWidth: "100%",
          maxHeight: "85vh",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
          <div>
            <div style={{ fontSize: "0.72rem", color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Détail de l'immobilisation
            </div>
            <h3 style={{ margin: "2px 0 0", fontSize: "1rem" }}>{workOrder.panne_erreur}</h3>
          </div>
          <button
            onClick={onClose}
            style={{ border: "none", background: "transparent", fontSize: "1.1rem", color: "var(--ink-soft)" }}
          >
            ✕
          </button>
        </div>

        <div
          style={{
            marginTop: 16,
            padding: 14,
            background: "var(--paper)",
            borderRadius: 8,
            border: "1px solid var(--border)",
          }}
        >
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.85rem", fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={resolvedViaMaintenance}
              onChange={(e) => setResolvedViaMaintenance(e.target.checked)}
            />
            Résolu lors d'une maintenance préventive
          </label>
          {resolvedViaMaintenance && (
            <div style={{ marginTop: 8 }}>
              <input
                type="date"
                value={maintenanceDate}
                onChange={(e) => setMaintenanceDate(e.target.value)}
              />
            </div>
          )}
          <button
            onClick={handleSaveMaintenance}
            style={{
              marginTop: 10,
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "6px 14px",
              fontSize: "0.82rem",
              fontWeight: 600,
            }}
          >
            Enregistrer
          </button>
        </div>

        <h4 style={{ margin: "20px 0 8px", fontSize: "0.85rem", color: "var(--ink-soft)" }}>
          Périodes d'immobilisation machine
        </h4>

        <form onSubmit={handleAddPeriod} style={{ marginBottom: 12 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr 1fr auto",
              gap: 6,
              marginBottom: 6,
            }}
          >
            <MiniField label="Début">
              <input type="date" value={form.date_debut} onChange={(e) => setForm({ ...form, date_debut: e.target.value })} />
            </MiniField>
            <MiniField label="Heure">
              <input type="time" value={form.heure_debut} onChange={(e) => setForm({ ...form, heure_debut: e.target.value })} />
            </MiniField>
            <MiniField label="Fin">
              <input type="date" value={form.date_fin} onChange={(e) => setForm({ ...form, date_fin: e.target.value })} />
            </MiniField>
            <MiniField label="Heure">
              <input type="time" value={form.heure_fin} onChange={(e) => setForm({ ...form, heure_fin: e.target.value })} />
            </MiniField>
            <button
              type="submit"
              style={{
                alignSelf: "end",
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                padding: "6px 12px",
                fontSize: "0.8rem",
                height: 32,
              }}
            >
              +
            </button>
          </div>
          <MiniField label="Commentaire sur cette immobilisation (optionnel)">
            <input
              type="text"
              value={form.commentaire}
              onChange={(e) => setForm({ ...form, commentaire: e.target.value })}
              placeholder="ex : remplacement carte contrôleur, attente pièce…"
              style={{ width: "100%" }}
            />
          </MiniField>
        </form>
        {error && <p style={{ color: "var(--status-bad-ink)", fontSize: "0.8rem" }}>{error}</p>}

        {loading ? (
          <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem" }}>Chargement…</p>
        ) : periods.length === 0 ? (
          <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem" }}>
            Aucune période d'immobilisation enregistrée.
          </p>
        ) : (
          <table>
            <tbody>
              {periods.map((p) => (
                <tr key={p.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={td}>
                    <div className="mono">
                      {formatDate(p.date_debut)} {p.heure_debut?.slice(0, 5)}
                      {" → "}
                      {p.date_fin ? `${formatDate(p.date_fin)} ${p.heure_fin?.slice(0, 5) || ""}` : "en cours"}
                    </div>
                    {p.commentaire && (
                      <div style={{ color: "var(--ink-soft)", fontSize: "0.78rem", marginTop: 2 }}>
                        {p.commentaire}
                      </div>
                    )}
                  </td>
                  <td style={td}>
                    <IconButton title="Supprimer" danger onClick={() => handleDeletePeriod(p.id)}>
                      ✕
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function MiniField({ label, children }) {
  return (
    <label style={{ fontSize: "0.7rem", color: "var(--ink-soft)" }}>
      {label}
      <div style={{ marginTop: 3 }}>{children}</div>
    </label>
  );
}

function formatDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const td = { padding: "5px 8px", fontSize: "0.82rem" };