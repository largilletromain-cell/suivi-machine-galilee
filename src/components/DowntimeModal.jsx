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
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyPeriod);

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
    if (!window.confirm("Supprimer cette période d'immobilisation ?")) return;
    await withRetry(() => supabase.from("downtime_periods").delete().eq("id", id));
    setPeriods((p) => p.filter((x) => x.id !== id));
    onPeriodsChanged?.();
  }

  function startEdit(p) {
    setEditingId(p.id);
    setEditForm({
      date_debut: p.date_debut || "",
      heure_debut: p.heure_debut?.slice(0, 5) || "",
      date_fin: p.date_fin || "",
      heure_fin: p.heure_fin?.slice(0, 5) || "",
      commentaire: p.commentaire || "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(emptyPeriod);
  }

  async function saveEdit(id) {
    const res = await withRetry(() =>
      supabase
        .from("downtime_periods")
        .update({
          date_debut: editForm.date_debut,
          heure_debut: editForm.heure_debut,
          date_fin: editForm.date_fin || null,
          heure_fin: editForm.heure_fin || null,
          commentaire: editForm.commentaire || null,
        })
        .eq("id", id)
        .select()
        .single()
    );
    if (res.data) {
      setPeriods((ps) => ps.map((p) => (p.id === id ? res.data : p)));
      onPeriodsChanged?.();
    }
    cancelEdit();
  }

  async function clearComment(p) {
    const res = await withRetry(() =>
      supabase.from("downtime_periods").update({ commentaire: null }).eq("id", p.id).select().single()
    );
    if (res.data) {
      setPeriods((ps) => ps.map((x) => (x.id === p.id ? res.data : x)));
      onPeriodsChanged?.();
    }
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
          width: 620,
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
          Ajouter une période d'immobilisation
        </h4>

        <form onSubmit={handleAddPeriod} style={{ marginBottom: 18, paddingBottom: 18, borderBottom: "1px solid var(--border)" }}>
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

        <h4 style={{ margin: "0 0 8px", fontSize: "0.85rem", color: "var(--ink-soft)" }}>
          Périodes déjà enregistrées
        </h4>

        {loading ? (
          <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem" }}>Chargement…</p>
        ) : periods.length === 0 ? (
          <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem" }}>
            Aucune période d'immobilisation enregistrée.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {periods.map((p) =>
              editingId === p.id ? (
                <div
                  key={p.id}
                  style={{
                    border: "1px solid var(--accent)",
                    borderRadius: 8,
                    padding: 10,
                    background: "var(--accent-soft)",
                  }}
                >
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, marginBottom: 6 }}>
                    <MiniField label="Début">
                      <input
                        type="date"
                        value={editForm.date_debut}
                        onChange={(e) => setEditForm({ ...editForm, date_debut: e.target.value })}
                      />
                    </MiniField>
                    <MiniField label="Heure">
                      <input
                        type="time"
                        value={editForm.heure_debut}
                        onChange={(e) => setEditForm({ ...editForm, heure_debut: e.target.value })}
                      />
                    </MiniField>
                    <MiniField label="Fin">
                      <input
                        type="date"
                        value={editForm.date_fin}
                        onChange={(e) => setEditForm({ ...editForm, date_fin: e.target.value })}
                      />
                    </MiniField>
                    <MiniField label="Heure">
                      <input
                        type="time"
                        value={editForm.heure_fin}
                        onChange={(e) => setEditForm({ ...editForm, heure_fin: e.target.value })}
                      />
                    </MiniField>
                  </div>
                  <MiniField label="Commentaire">
                    <input
                      type="text"
                      value={editForm.commentaire}
                      onChange={(e) => setEditForm({ ...editForm, commentaire: e.target.value })}
                      style={{ width: "100%" }}
                    />
                  </MiniField>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button
                      onClick={() => saveEdit(p.id)}
                      style={{
                        background: "var(--accent)",
                        color: "#fff",
                        border: "none",
                        borderRadius: 6,
                        padding: "5px 12px",
                        fontSize: "0.78rem",
                        fontWeight: 600,
                      }}
                    >
                      Enregistrer
                    </button>
                    <button
                      onClick={cancelEdit}
                      style={{
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        padding: "5px 12px",
                        fontSize: "0.78rem",
                      }}
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "start",
                    gap: 8,
                    borderTop: "1px solid var(--border)",
                    paddingTop: 8,
                  }}
                >
                  <div>
                    <div className="mono" style={{ fontSize: "0.82rem" }}>
                      {formatDate(p.date_debut)} {p.heure_debut?.slice(0, 5)}
                      {" → "}
                      {p.date_fin ? `${formatDate(p.date_fin)} ${p.heure_fin?.slice(0, 5) || ""}` : "en cours"}
                    </div>
                    {p.commentaire && (
                      <div style={{ display: "flex", alignItems: "start", gap: 6, marginTop: 2 }}>
                        <div style={{ color: "var(--ink-soft)", fontSize: "0.78rem" }}>{p.commentaire}</div>
                        <button
                          onClick={() => clearComment(p)}
                          title="Supprimer uniquement le commentaire"
                          style={{
                            border: "none",
                            background: "transparent",
                            color: "var(--status-bad-ink)",
                            fontSize: "0.7rem",
                            padding: 0,
                            whiteSpace: "nowrap",
                          }}
                        >
                          ✕ commentaire
                        </button>
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => startEdit(p)}
                      title="Modifier"
                      style={{
                        border: "1px solid var(--border)",
                        background: "var(--surface)",
                        borderRadius: 6,
                        width: 28,
                        height: 28,
                        fontSize: "0.85rem",
                      }}
                    >
                      ✎
                    </button>
                    <IconButton title="Supprimer" danger onClick={() => handleDeletePeriod(p.id)}>
                      ✕
                    </IconButton>
                  </div>
                </div>
              )
            )}
          </div>
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