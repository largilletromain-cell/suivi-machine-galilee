import { useEffect, useState } from "react";
import { supabase, withRetry } from "../lib/supabaseClient";
import { SubTabs, IconButton, Panel, statusSelectStyle } from "./ui";
import DowntimeModal from "./DowntimeModal";

const emptyForm = {
  panne_erreur: "",
  date_decouverte: "",
  statut: "non_resolu",
  statut_wo: "ouvert",
  wo_number: "",
  date_intervention: "",
  rapport_recu: false,
};

const emptyEquipmentForm = { code: "", label: "" };

export default function WorkOrders({ centerId }) {
  const [equipments, setEquipments] = useState([]);
  const [activeEquipmentId, setActiveEquipmentId] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [modalWorkOrder, setModalWorkOrder] = useState(null);

  const [showAddEquipment, setShowAddEquipment] = useState(false);
  const [equipmentForm, setEquipmentForm] = useState(emptyEquipmentForm);
  const [equipmentError, setEquipmentError] = useState("");
  const [savingEquipment, setSavingEquipment] = useState(false);

  useEffect(() => {
    loadEquipments();
  }, [centerId]);

  useEffect(() => {
    if (!activeEquipmentId) return;
    loadRows(activeEquipmentId);
  }, [activeEquipmentId]);

  async function loadEquipments(selectId) {
    const res = await withRetry(() =>
      supabase.from("wo_equipments").select("*").eq("center_id", centerId).order("sort_order")
    );
    setEquipments(res.data ?? []);
    if (selectId) {
      setActiveEquipmentId(selectId);
    } else if (res.data?.length && !activeEquipmentId) {
      setActiveEquipmentId(res.data[0].id);
    }
  }

  async function loadRows(equipmentId) {
    setLoading(true);
    setError("");
    try {
      const res = await withRetry(() =>
        supabase
          .from("work_orders")
          .select("*, downtime_periods(id, date_debut, heure_debut, date_fin, heure_fin, commentaire)")
          .eq("equipment_id", equipmentId)
          .order("created_at", { ascending: false })
      );
      setRows(res.data ?? []);
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

  async function handleAddEquipment(e) {
    e.preventDefault();
    if (!equipmentForm.code.trim()) {
      setEquipmentError("Le nom de la machine / de l'équipement est obligatoire.");
      return;
    }
    setSavingEquipment(true);
    setEquipmentError("");
    try {
      const res = await withRetry(() =>
        supabase
          .from("wo_equipments")
          .insert({
            center_id: centerId,
            code: equipmentForm.code.trim(),
            label: equipmentForm.label.trim() || equipmentForm.code.trim(),
            sort_order: equipments.length,
          })
          .select()
          .single()
      );
      setEquipmentForm(emptyEquipmentForm);
      setShowAddEquipment(false);
      await loadEquipments(res.data?.id);
    } catch (e) {
      setEquipmentError("Impossible d'ajouter cet équipement (nom peut-être déjà utilisé).");
    } finally {
      setSavingEquipment(false);
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
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <SubTabs
          items={equipments.map((e) => ({ key: e.id, label: e.label || e.code }))}
          activeKey={activeEquipmentId}
          onChange={setActiveEquipmentId}
        />
        <button
          onClick={() => setShowAddEquipment((s) => !s)}
          style={{
            border: "1px dashed var(--accent)",
            background: showAddEquipment ? "var(--accent-soft)" : "var(--surface)",
            color: "var(--accent-strong)",
            borderRadius: 999,
            padding: "6px 14px",
            fontSize: "0.8rem",
            fontWeight: 600,
            whiteSpace: "nowrap",
            marginTop: 0,
          }}
        >
          + Ajouter une machine / un équipement
        </button>
      </div>

      {showAddEquipment && (
        <Panel>
          <form onSubmit={handleAddEquipment} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
            <Field label="Nom (identifiant court)">
              <input
                type="text"
                className="mono"
                value={equipmentForm.code}
                onChange={(e) => setEquipmentForm({ ...equipmentForm, code: e.target.value })}
                placeholder="ex : RX4010600"
                style={{ width: 200 }}
                required
              />
            </Field>
            <Field label="Libellé affiché (optionnel)">
              <input
                type="text"
                value={equipmentForm.label}
                onChange={(e) => setEquipmentForm({ ...equipmentForm, label: e.target.value })}
                placeholder="ex : RX4010600"
                style={{ width: 220 }}
              />
            </Field>
            <button
              type="submit"
              disabled={savingEquipment}
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
              {savingEquipment ? "…" : "Créer l'onglet"}
            </button>
          </form>
          {equipmentError && (
            <p style={{ color: "var(--status-bad-ink)", fontSize: "0.85rem", marginBottom: 0 }}>{equipmentError}</p>
          )}
        </Panel>
      )}

      <div style={{ height: 18 }} />

      <Panel>
        <form
          onSubmit={handleAdd}
          style={{
            display: "grid",
            gridTemplateColumns: "1.6fr 120px 140px 120px 100px 130px 90px auto",
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
            <select
              value={form.statut}
              onChange={(e) => setForm({ ...form, statut: e.target.value })}
              style={{ width: "100%", ...statusSelectStyle("statut", form.statut) }}
            >
              <option value="non_resolu">Non résolu</option>
              <option value="en_surveillance">En surveillance</option>
              <option value="resolu">Résolu</option>
            </select>
          </Field>
          <Field label="Statut WO">
            <select
              value={form.statut_wo}
              onChange={(e) => setForm({ ...form, statut_wo: e.target.value })}
              style={{ width: "100%", ...statusSelectStyle("statut_wo", form.statut_wo) }}
            >
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
              style={{ width: "100%", ...statusSelectStyle("rapport_recu", form.rapport_recu ? "oui" : "non") }}
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
                <th style={th}>Immo.</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const periods = (r.downtime_periods ?? []).slice().sort((a, b) =>
                  (a.date_debut || "").localeCompare(b.date_debut || "")
                );
                return (
                  <RowGroup
                    key={r.id}
                    row={r}
                    periods={periods}
                    onUpdateField={updateField}
                    onDelete={handleDelete}
                    onOpenModal={() => setModalWorkOrder(r)}
                  />
                );
              })}
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
          onPeriodsChanged={() => loadRows(activeEquipmentId)}
        />
      )}
    </div>
  );
}

function RowGroup({ row: r, periods, onUpdateField, onDelete, onOpenModal }) {
  return (
    <>
      <tr style={{ borderTop: "1px solid var(--border)" }}>
        <td style={{ ...td, minWidth: 220 }}>
          <div>{r.panne_erreur}</div>
          {periods.length > 0 && (
            <ul style={bulletListStyle}>
              {periods.map((p) => (
                <li key={p.id} style={subBulletStyle}>
                  <span className="mono" style={{ color: "var(--ink-soft)" }}>
                    {formatDate(p.date_debut)} {p.heure_debut?.slice(0, 5)}
                    {" → "}
                    {p.date_fin ? `${formatDate(p.date_fin)} ${p.heure_fin?.slice(0, 5) || ""}` : "en cours"}
                  </span>
                  {p.commentaire && <span> — {p.commentaire}</span>}
                </li>
              ))}
            </ul>
          )}
        </td>
        <td style={td} className="mono">
          {formatDate(r.date_decouverte)}
        </td>
        <td style={td}>
          <select
            value={r.statut}
            onChange={(e) => onUpdateField(r, "statut", e.target.value)}
            style={{ fontSize: "0.78rem", ...statusSelectStyle("statut", r.statut) }}
          >
            <option value="non_resolu">Non résolu</option>
            <option value="en_surveillance">En surveillance</option>
            <option value="resolu">Résolu</option>
          </select>
        </td>
        <td style={td}>
          <select
            value={r.statut_wo}
            onChange={(e) => onUpdateField(r, "statut_wo", e.target.value)}
            style={{ fontSize: "0.78rem", ...statusSelectStyle("statut_wo", r.statut_wo) }}
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
            onBlur={(e) => onUpdateField(r, "wo_number", e.target.value)}
            style={{ width: 90 }}
          />
        </td>
        <td style={td}>
          <input
            type="date"
            defaultValue={r.date_intervention || ""}
            onBlur={(e) => onUpdateField(r, "date_intervention", e.target.value || null)}
            style={{ width: 130 }}
          />
        </td>
        <td style={td}>
          <select
            value={r.rapport_recu ? "oui" : "non"}
            onChange={(e) => onUpdateField(r, "rapport_recu", e.target.value === "oui")}
            style={{ fontSize: "0.78rem", ...statusSelectStyle("rapport_recu", r.rapport_recu ? "oui" : "non") }}
          >
            <option value="non">Non</option>
            <option value="oui">Oui</option>
          </select>
        </td>
        <td style={td}>
          <button
            onClick={onOpenModal}
            title="Immobilisations / maintenance préventive"
            style={{
              border: "1px solid var(--border)",
              background: r.resolved_via_maintenance ? "var(--status-ok-bg)" : "var(--surface)",
              borderRadius: 6,
              padding: "4px 8px",
              fontSize: "0.78rem",
            }}
          >
            + {periods.length > 0 ? `(${periods.length})` : ""}
          </button>
        </td>
        <td style={td}>
          <IconButton title="Supprimer" danger onClick={() => onDelete(r.id)}>
            ✕
          </IconButton>
        </td>
      </tr>
      <tr style={{ background: "var(--paper)" }}>
        <td colSpan={9} style={{ padding: "4px 8px 14px" }}>
          <label style={{ display: "block", fontSize: "0.7rem", color: "var(--ink-soft)", marginBottom: 4 }}>
            Commentaires
          </label>
          <textarea
            defaultValue={r.commentaires || ""}
            onBlur={(e) => onUpdateField(r, "commentaires", e.target.value)}
            rows={3}
            style={{ width: "100%", resize: "vertical", fontSize: "0.85rem" }}
            placeholder="Détail de ce qui a été fait, échanges avec le prestataire, etc."
          />
        </td>
      </tr>
    </>
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
const bulletListStyle = { margin: "4px 0 0", paddingLeft: 16, listStyle: "circle" };
const subBulletStyle = { fontSize: "0.76rem", marginBottom: 2 };
