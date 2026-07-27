import { useEffect, useState } from "react";
import { supabase, withRetry } from "../lib/supabaseClient";
import { SubTabs, IconButton, Panel } from "./ui";
import DowntimeModal from "./DowntimeModal";

const emptyForm = {
  panne_erreur: "",
  date_decouverte: "",
  statut: "non_resolu",
  statut_wo: "ouvert",
  wo_number: "",
  date_intervention: "",
  rapport_recu: false,
  commentaires: "",
};

export default function WorkOrders({ centerId }) {
  const [equipments, setEquipments] = useState([]);
  const [activeEquipmentId, setActiveEquipmentId] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [modalWorkOrder, setModalWorkOrder] = useState(null);
  const [downtimeCounts, setDowntimeCounts] = useState({});

  useEffect(() => {
    async function load() {
      const res = await withRetry(() =>
        supabase.from("wo_equipments").select("*").eq("center_id", centerId).order("sort_order")
      );
      setEquipments(res.data ?? []);
      if (res.data?.length) setActiveEquipmentId(res.data[0].id);
    }
    load();
  }, [centerId]);

  useEffect(() => {
    if (!activeEquipmentId) return;
    loadRows(activeEquipmentId);
  }, [activeEquipmentId]);

  async function loadRows(equipmentId) {
    setLoading(true);
    setError("");
    try {
      const res = await withRetry(() =>
        supabase
          .from("work_orders")
          .select("*, downtime_periods(id)")
          .eq("equipment_id", equipmentId)
          .order("created_at", { ascending: false })
      );
      setRows(res.data ?? []);
      const counts = {};
      (res.data ?? []).forEach((r) => {
        counts[r.id] = r.downtime_periods?.length ?? 0;
      });
      setDowntimeCounts(counts);
    } catch (e) {
      setError("Erreur de chargement des Work Orders.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.panne_erreur.trim()) {
      setError("Le champ « Panne / erreur » est obligatoire.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await withRetry(() =>
        supabase.from("work_orders").insert({
          equipment_id: activeEquipmentId,
          panne_erreur: form.panne_erreur,
          date_decouverte: form.date_decouverte || null,
          statut: form.statut,
          statut_wo: form.statut_wo,
          wo_number: form.wo_number || null,
          date_intervention: form.date_intervention || null,
          rapport_recu: form.rapport_recu,
          commentaires: form.commentaires || null,
        })
      );
      setForm(emptyForm);
      await loadRows(activeEquipmentId);
    } catch (e) {
      setError("Impossible d'enregistrer ce Work Order. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  async function updateField(row, field, value) {
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, [field]: value } : r)));
    await withRetry(() => supabase.from("work_orders").update({ [field]: value }).eq("id", row.id));
  }

  async function handleDelete(id) {
    if (!window.confirm("Supprimer ce Work Order et ses immobilisations associées ?")) return;
    await withRetry(() => supabase.from("work_orders").delete().eq("id", id));
    setRows((r) => r.filter((row) => row.id !== id));
  }

  return (
    <div>
      <SubTabs
        items={equipments.map((e) => ({ key: e.id, label: e.label || e.code }))}
        activeKey={activeEquipmentId}
        onChange={setActiveEquipmentId}
      />

      <Panel>
        <form
          onSubmit={handleAdd}
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 120px 140px 120px 100px 130px 90px auto",
            gap: 8,
            alignItems: "end",
            marginBottom: 18,
            paddingBottom: 18,
            borderBottom: "1px solid var(--border)",
          }}
        >
          <Field label="Panne / erreur">
            <input
              type="text"
              value={form.panne_erreur}
              onChange={(e) => setForm({ ...form, panne_erreur: e.target.value })}
              required
              style={{ width: "100%" }}
            />
          </Field>
          <Field label="Découverte">
            <input
              type="date"
              value={form.date_decouverte}
              onChange={(e) => setForm({ ...form, date_decouverte: e.target.value })}
            />
          </Field>
          <Field label="#WO">
            <input
              type="text"
              className="mono"
              value={form.wo_number}
              onChange={(e) => setForm({ ...form, wo_number: e.target.value })}
              style={{ width: "100%" }}
            />
          </Field>
          <Field label="Statut">
            <select value={form.statut} onChange={(e) => setForm({ ...form, statut: e.target.value })} style={{ width: "100%" }}>
              <option value="non_resolu">Non résolu</option>
              <option value="en_surveillance">En surveillance</option>
              <option value="resolu">Résolu</option>
            </select>
          </Field>
          <Field label="Statut WO">
            <select value={form.statut_wo} onChange={(e) => setForm({ ...form, statut_wo: e.target.value })} style={{ width: "100%" }}>
              <option value="ouvert">Ouvert</option>
              <option value="ferme">Fermé</option>
            </select>
          </Field>
          <Field label="Intervention">
            <input
              type="date"
              value={form.date_intervention}
              onChange={(e) => setForm({ ...form, date_intervention: e.target.value })}
            />
          </Field>
          <Field label="Rapport">
            <select
              value={form.rapport_recu ? "oui" : "non"}
              onChange={(e) => setForm({ ...form, rapport_recu: e.target.value === "oui" })}
              style={{ width: "100%" }}
            >
              <option value="non">Non</option>
              <option value="oui">Oui</option>
            </select>
          </Field>
          <button
            type="submit"
            disabled={saving || !activeEquipmentId}
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
            {saving ? "…" : "Ajouter"}
          </button>
        </form>

        {error && <p style={{ color: "var(--status-bad-ink)", fontSize: "0.85rem" }}>{error}</p>}

        {loading ? (
          <p style={{ color: "var(--ink-soft)" }}>Chargement…</p>
        ) : rows.length === 0 ? (
          <p style={{ color: "var(--ink-soft)" }}>Aucun Work Order pour cet équipement.</p>
        ) : (
          <table>
            <thead>
              <tr style={{ textAlign: "left", fontSize: "0.72rem", color: "var(--ink-soft)" }}>
                <th style={th}>Panne / erreur</th>
                <th style={th}>Découverte</th>
                <th style={th}>Statut</th>
                <th style={th}>Statut WO</th>
                <th style={th}>#WO</th>
                <th style={th}>Intervention</th>
                <th style={th}>Rapport</th>
                <th style={th}>Commentaires</th>
                <th style={th}>Immo.</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={td}>{r.panne_erreur}</td>
                  <td style={td} className="mono">
                    {formatDate(r.date_decouverte)}
                  </td>
                  <td style={td}>
                    <select
                      value={r.statut}
                      onChange={(e) => updateField(r, "statut", e.target.value)}
                      style={{ fontSize: "0.78rem" }}
                    >
                      <option value="non_resolu">Non résolu</option>
                      <option value="en_surveillance">En surveillance</option>
                      <option value="resolu">Résolu</option>
                    </select>
                  </td>
                  <td style={td}>
                    <select
                      value={r.statut_wo}
                      onChange={(e) => updateField(r, "statut_wo", e.target.value)}
                      style={{ fontSize: "0.78rem" }}
                    >
                      <option value="ouvert">Ouvert</option>
                      <option value="ferme">Fermé</option>
                    </select>
                  </td>
                  <td style={td}>
                    <input
                      type="text"
                      className="mono wo-number"
                      defaultValue={r.wo_number || ""}
                      onBlur={(e) => updateField(r, "wo_number", e.target.value)}
                      style={{ width: 90 }}
                    />
                  </td>
                  <td style={td}>
                    <input
                      type="date"
                      defaultValue={r.date_intervention || ""}
                      onBlur={(e) => updateField(r, "date_intervention", e.target.value || null)}
                      style={{ width: 130 }}
                    />
                  </td>
                  <td style={td}>
                    <select
                      value={r.rapport_recu ? "oui" : "non"}
                      onChange={(e) => updateField(r, "rapport_recu", e.target.value === "oui")}
                      style={{ fontSize: "0.78rem" }}
                    >
                      <option value="non">Non</option>
                      <option value="oui">Oui</option>
                    </select>
                  </td>
                  <td style={td}>
                    <input
                      type="text"
                      defaultValue={r.commentaires || ""}
                      onBlur={(e) => updateField(r, "commentaires", e.target.value)}
                      style={{ width: 180 }}
                    />
                  </td>
                  <td style={td}>
                    <button
                      onClick={() => setModalWorkOrder(r)}
                      title="Immobilisations / maintenance préventive"
                      style={{
                        border: "1px solid var(--border)",
                        background: r.resolved_via_maintenance ? "var(--status-ok-bg)" : "var(--surface)",
                        borderRadius: 6,
                        padding: "4px 8px",
                        fontSize: "0.78rem",
                      }}
                    >
                      + {downtimeCounts[r.id] > 0 ? `(${downtimeCounts[r.id]})` : ""}
                    </button>
                  </td>
                  <td style={td}>
                    <IconButton title="Supprimer" danger onClick={() => handleDelete(r.id)}>
                      ✕
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {modalWorkOrder && (
        <DowntimeModal
          workOrder={modalWorkOrder}
          onClose={() => setModalWorkOrder(null)}
          onWorkOrderUpdated={(updated) => {
            setRows((rs) => rs.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
          }}
        />
      )}
    </div>
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

function formatDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const th = { padding: "6px 8px" };
const td = { padding: "6px 8px", fontSize: "0.82rem", verticalAlign: "top" };
