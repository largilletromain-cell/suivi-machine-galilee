import { useMemo, useState, useEffect, Fragment } from "react";
import { supabase, withRetry, logActivity } from "../lib/supabaseClient";
import { SubTabs, IconButton, Panel, statusSelectStyle } from "./ui";
import DowntimeModal from "./DowntimeModal";
import LinkPannesModal from "./LinkPannesModal";
import { useAccess } from "../lib/access";

const emptyForm = {
  panne_erreur: "",
  date_decouverte: "",
  statut: "non_resolu",
  statut_wo: "ouvert",
  wo_number: "",
  date_intervention: "",
  rapport_recu: false,
};

const STATUT_RANK = { non_resolu: 0, en_surveillance: 1, resolu: 2 };
const STATUT_WO_RANK = { ouvert: 0, ferme: 1 };

const MONTHS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

function formatMonthYear(iso) {
  if (!iso) return "Sans date de découverte";
  const [y, m] = iso.split("-");
  const idx = parseInt(m, 10) - 1;
  return `${MONTHS_FR[idx] || m} ${y}`;
}

function compareRows(a, b, field) {
  switch (field) {
    case "date_decouverte":
    case "date_intervention":
      return (a[field] || "").localeCompare(b[field] || "");
    case "statut":
      return STATUT_RANK[a.statut] - STATUT_RANK[b.statut];
    case "statut_wo":
      return STATUT_WO_RANK[a.statut_wo] - STATUT_WO_RANK[b.statut_wo];
    case "rapport_recu":
      return (a.rapport_recu ? 1 : 0) - (b.rapport_recu ? 1 : 0);
    default:
      return 0;
  }
}

export default function WorkOrders({ centerId }) {
  const { readOnly, username } = useAccess();
  const [equipments, setEquipments] = useState([]);
  const [activeEquipmentId, setActiveEquipmentId] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [modalWorkOrder, setModalWorkOrder] = useState(null);
  const [linkPannesWorkOrder, setLinkPannesWorkOrder] = useState(null);
  const [systems, setSystems] = useState([]);
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [sort, setSort] = useState({ field: "date_decouverte", dir: "desc" });

  useEffect(() => {
    loadEquipments();
    loadSystems();
  }, [centerId]);

  useEffect(() => {
    if (!activeEquipmentId) return;
    loadRows(activeEquipmentId);
  }, [activeEquipmentId]);

  async function loadEquipments() {
    const res = await withRetry(() =>
      supabase.from("wo_equipments").select("*").eq("center_id", centerId).order("sort_order")
    );
    setEquipments(res.data ?? []);
    if (res.data?.length && !activeEquipmentId) {
      setActiveEquipmentId(res.data[0].id);
    }
  }

  async function loadSystems() {
    const res = await withRetry(() =>
      supabase.from("systems").select("id, name, machine_id, wo_equipment_id").eq("center_id", centerId)
    );
    setSystems(res.data ?? []);
  }

  async function loadRows(equipmentId) {
    setLoading(true);
    setError("");
    try {
      const res = await withRetry(() =>
        supabase
          .from("work_orders")
          .select(
            "*, downtime_periods(id, date_debut, heure_debut, date_fin, heure_fin, commentaire), work_order_pannes(id, pannes(id, date_panne, heure_debut, panne_types(code, description)))"
          )
          .eq("equipment_id", equipmentId)
          .order("created_at", { ascending: false })
      );
      let data = res.data ?? [];

      // Récupéré séparément (plutôt que par jointure automatique, peu fiable
      // sur une table qui se référence elle-même) : les infos du Work Order
      // qui a résolu chacune de ces lignes, le cas échéant.
      const resolvedIds = [...new Set(data.filter((r) => r.resolved_via_wo_id).map((r) => r.resolved_via_wo_id))];
      if (resolvedIds.length > 0) {
        const resolvedRes = await withRetry(() =>
          supabase.from("work_orders").select("id, panne_erreur, wo_number, commentaires").in("id", resolvedIds)
        );
        const byId = Object.fromEntries((resolvedRes.data ?? []).map((wo) => [wo.id, wo]));
        data = data.map((r) =>
          r.resolved_via_wo_id ? { ...r, resolved_via_wo: byId[r.resolved_via_wo_id] || null } : r
        );
      }

      setRows(data);
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
      const equipmentName = equipments.find((e) => e.id === activeEquipmentId)?.label || "";
      logActivity(username, `a ajouté un Work Order (${equipmentName}, ${form.panne_erreur})`);
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
    logActivity(username, `a modifié un Work Order (${row.panne_erreur}, champ « ${field} »)`);
  }

  async function handleDelete(id) {
    if (!window.confirm("Supprimer ce Work Order et ses immobilisations associées ?")) return;
    await withRetry(() => supabase.from("work_orders").delete().eq("id", id));
    logActivity(username, "a supprimé un Work Order");
    setRows((r) => r.filter((row) => row.id !== id));
  }

  function toggleExpand(id) {
    setExpandedIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSort(field) {
    setSort((s) => {
      if (s.field !== field) return { field, dir: "asc" };
      if (s.dir === "asc") return { field, dir: "desc" };
      return { field: null, dir: "asc" }; // 3e clic : retour au tri par défaut
    });
  }

  const sortedRows = useMemo(() => {
    if (!sort.field) return rows;
    const copy = [...rows].sort((a, b) => compareRows(a, b, sort.field));
    if (sort.dir === "desc") copy.reverse();
    return copy;
  }, [rows, sort]);

  const currentSystem = systems.find((s) => s.wo_equipment_id === activeEquipmentId);
  const currentMachineId = currentSystem?.machine_id || null;
  const currentMachineName = currentSystem?.name || "";

  return (
    <div>
      <SubTabs
        items={equipments.map((e) => ({ key: e.id, label: e.label || e.code }))}
        activeKey={activeEquipmentId}
        onChange={setActiveEquipmentId}
      />

      {equipments.length === 0 && (
        <p style={{ color: "var(--ink-soft)", fontSize: "0.88rem" }}>
          Aucun système enregistré pour l'instant — créez-en un dans l'onglet <strong>Paramétrage</strong>.
        </p>
      )}

      <Panel>
        {!readOnly && (
        <form
          onSubmit={handleAdd}
          style={{
            display: "grid",
            gridTemplateColumns: "120px 1.6fr 140px 120px 100px 130px 90px auto",
            gap: 8,
            alignItems: "end",
            marginBottom: 18,
            paddingBottom: 18,
            borderBottom: "1px solid var(--border)",
          }}
        >
          <Field label="Découverte">
            <input
              type="date"
              value={form.date_decouverte}
              onChange={(e) => setForm({ ...form, date_decouverte: e.target.value })}
            />
          </Field>
          <Field label="Panne / erreur">
            <input
              type="text"
              value={form.panne_erreur}
              onChange={(e) => setForm({ ...form, panne_erreur: e.target.value })}
              required
              style={{ width: "100%", minWidth: 0, boxSizing: "border-box" }}
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
        )}

        {error && <p style={{ color: "var(--status-bad-ink)", fontSize: "0.85rem" }}>{error}</p>}

        {loading ? (
          <p style={{ color: "var(--ink-soft)" }}>Chargement…</p>
        ) : rows.length === 0 ? (
          <p style={{ color: "var(--ink-soft)" }}>Aucun Work Order pour cet équipement.</p>
        ) : (
          <table>
            <thead>
              <tr style={{ textAlign: "left", fontSize: "0.72rem", color: "var(--ink-soft)" }}>
                <SortHeader label="Découverte" field="date_decouverte" sort={sort} onSort={handleSort} />
                <th style={th}>Panne / erreur</th>
                <SortHeader label="Statut" field="statut" sort={sort} onSort={handleSort} />
                <SortHeader label="Statut WO" field="statut_wo" sort={sort} onSort={handleSort} />
                <th style={th}>#WO</th>
                <SortHeader label="Intervention" field="date_intervention" sort={sort} onSort={handleSort} />
                <SortHeader label="Rapport" field="rapport_recu" sort={sort} onSort={handleSort} />
                <th style={th}>Détails</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const groupByMonth = sort.field === "date_decouverte";
                let lastMonthKey;
                return sortedRows.map((r) => {
                  const periods = (r.downtime_periods ?? []).slice().sort((a, b) =>
                    (a.date_debut || "").localeCompare(b.date_debut || "")
                  );
                  let monthSeparator = null;
                  if (groupByMonth) {
                    const monthKey = (r.date_decouverte || "").slice(0, 7) || "none";
                    if (monthKey !== lastMonthKey) {
                      lastMonthKey = monthKey;
                      monthSeparator = (
                        <tr key={`month-${monthKey}`}>
                          <td colSpan={9} style={monthSeparatorStyle}>
                            {formatMonthYear(r.date_decouverte)}
                          </td>
                        </tr>
                      );
                    }
                  }
                  return (
                    <Fragment key={r.id}>
                      {monthSeparator}
                      <RowGroup
                        row={r}
                        periods={periods}
                        expanded={expandedIds.has(r.id)}
                        onToggleExpand={() => toggleExpand(r.id)}
                        onUpdateField={updateField}
                        onDelete={handleDelete}
                        onOpenModal={() => setModalWorkOrder(r)}
                        onOpenLinkPannes={() => setLinkPannesWorkOrder(r)}
                        hasMachine={!!currentMachineId}
                        readOnly={readOnly}
                      />
                    </Fragment>
                  );
                });
              })()}
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

      {linkPannesWorkOrder && currentMachineId && (
        <LinkPannesModal
          workOrder={linkPannesWorkOrder}
          machineId={currentMachineId}
          machineName={currentMachineName}
          onClose={() => setLinkPannesWorkOrder(null)}
          onChanged={() => loadRows(activeEquipmentId)}
        />
      )}
    </div>
  );
}

function SortHeader({ label, field, sort, onSort }) {
  const active = sort.field === field;
  const arrow = active ? (sort.dir === "asc" ? "▲" : "▼") : "⇅";
  return (
    <th
      onClick={() => onSort(field)}
      style={{
        ...th,
        cursor: "pointer",
        userSelect: "none",
        color: active ? "var(--accent-strong)" : "var(--ink-soft)",
        fontWeight: active ? 700 : 600,
        whiteSpace: "nowrap",
      }}
      title={`Trier par ${label}`}
    >
      {label} <span style={{ fontSize: "0.62rem", opacity: active ? 1 : 0.5 }}>{arrow}</span>
    </th>
  );
}

function RowGroup({ row: r, periods, expanded, onToggleExpand, onUpdateField, onDelete, onOpenModal, onOpenLinkPannes, hasMachine, readOnly }) {
  const linkedPannes = (r.work_order_pannes ?? []).map((wp) => wp.pannes).filter(Boolean);
  const resolvedWo = Array.isArray(r.resolved_via_wo) ? r.resolved_via_wo[0] : r.resolved_via_wo;
  const hasDetails = periods.length > 0 || !!r.commentaires || !!r.resolved_via_maintenance || !!r.resolved_via_other_wo || linkedPannes.length > 0;
  return (
    <>
      <tr style={{ borderTop: "1px solid var(--border)" }}>
        <td style={td}>
          <input
            type="date"
            className="mono"
            defaultValue={r.date_decouverte || ""}
            disabled={readOnly}
            onBlur={(e) => onUpdateField(r, "date_decouverte", e.target.value || null)}
            style={{ width: 130 }}
          />
        </td>
        <td style={{ ...td, minWidth: 220 }}>
          <textarea
            defaultValue={r.panne_erreur}
            disabled={readOnly}
            onBlur={(e) => {
              e.target.style.border = "1px solid transparent";
              if (e.target.value.trim()) onUpdateField(r, "panne_erreur", e.target.value.trim());
              else e.target.value = r.panne_erreur;
            }}
            onFocus={(e) => (e.target.style.border = "1px solid var(--border)")}
            rows={2}
            style={{
              width: "100%",
              minWidth: 220,
              border: "1px solid transparent",
              background: "transparent",
              padding: "4px 6px",
              resize: "vertical",
              fontFamily: "inherit",
              fontSize: "0.85rem",
              lineHeight: 1.35,
            }}
          />
        </td>
        <td style={td}>
          <select
            value={r.statut}
            disabled={readOnly}
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
            disabled={readOnly}
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
            disabled={readOnly}
            onBlur={(e) => onUpdateField(r, "wo_number", e.target.value)}
            style={{ width: 90 }}
          />
        </td>
        <td style={td}>
          <input
            type="date"
            defaultValue={r.date_intervention || ""}
            disabled={readOnly}
            onBlur={(e) => onUpdateField(r, "date_intervention", e.target.value || null)}
            style={{ width: 130 }}
          />
        </td>
        <td style={td}>
          <select
            value={r.rapport_recu ? "oui" : "non"}
            disabled={readOnly}
            onChange={(e) => onUpdateField(r, "rapport_recu", e.target.value === "oui")}
            style={{ fontSize: "0.78rem", ...statusSelectStyle("rapport_recu", r.rapport_recu ? "oui" : "non") }}
          >
            <option value="non">Non</option>
            <option value="oui">Oui</option>
          </select>
        </td>
        <td style={td}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              onClick={onToggleExpand}
              title={expanded ? "Réduire" : "Voir commentaires et immobilisations"}
              style={{
                border: "1px solid var(--border)",
                background: hasDetails ? "var(--accent-soft)" : "var(--surface)",
                color: "var(--accent-strong)",
                borderRadius: 6,
                padding: "4px 8px",
                fontSize: "0.75rem",
                fontWeight: 600,
              }}
            >
              {expanded ? "▾" : "▸"} {periods.length > 0 ? `${periods.length} immo.` : ""}
              {r.commentaires ? " 💬" : ""}
              {r.resolved_via_maintenance ? " 🔧" : ""}
              {r.resolved_via_other_wo ? " 🔁" : ""}
              {linkedPannes.length > 0 ? ` 🔗${linkedPannes.length}` : ""}
            </button>
            {!readOnly && (
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
                +
              </button>
            )}
            {!readOnly && (
              <button
                onClick={onOpenLinkPannes}
                disabled={!hasMachine}
                title={hasMachine ? "Sélectionner les pannes résolues par ce Work Order" : "Pas de Registre Pannes pour ce système"}
                style={{
                  border: "1px solid var(--border)",
                  background: linkedPannes.length > 0 ? "var(--accent-soft)" : "var(--surface)",
                  color: hasMachine ? "var(--accent-strong)" : "var(--ink-soft)",
                  borderRadius: 6,
                  padding: "4px 8px",
                  fontSize: "0.78rem",
                  opacity: hasMachine ? 1 : 0.5,
                  cursor: hasMachine ? "pointer" : "not-allowed",
                }}
              >
                🔗{linkedPannes.length > 0 ? ` ${linkedPannes.length}` : ""}
              </button>
            )}
          </div>
        </td>
        <td style={td}>
          {!readOnly && (
            <IconButton title="Supprimer" danger onClick={() => onDelete(r.id)}>
              ✕
            </IconButton>
          )}
        </td>
      </tr>
      {expanded && (
        <tr style={{ background: "var(--paper)" }}>
          <td colSpan={9} style={{ padding: "8px 8px 16px" }}>
            {r.resolved_via_maintenance && (
              <div
                style={{
                  background: "var(--status-ok-bg)",
                  color: "var(--status-ok-ink)",
                  borderRadius: 6,
                  padding: "6px 10px",
                  fontSize: "0.78rem",
                  marginBottom: 8,
                }}
              >
                <div style={{ fontWeight: 600 }}>
                  ✓ Résolu lors d'une maintenance préventive
                  {r.maintenance_date ? ` du ${formatDate(r.maintenance_date)}` : ""}
                </div>
                {r.maintenance_commentaire && (
                  <div style={{ marginTop: 2, fontWeight: 400 }}>{r.maintenance_commentaire}</div>
                )}
              </div>
            )}
            {r.resolved_via_other_wo && resolvedWo && (
              <div
                style={{
                  background: "var(--accent-soft)",
                  color: "var(--accent-strong)",
                  borderRadius: 6,
                  padding: "6px 10px",
                  fontSize: "0.78rem",
                  marginBottom: 8,
                }}
              >
                <div style={{ fontWeight: 600 }}>
                  🔁 Résolu avec le Work Order {resolvedWo.wo_number ? `#${resolvedWo.wo_number}` : ""}
                </div>
                {resolvedWo.commentaires && (
                  <div style={{ marginTop: 2, fontWeight: 400 }}>{resolvedWo.commentaires}</div>
                )}
              </div>
            )}
            {linkedPannes.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: "0.7rem", color: "var(--ink-soft)", marginBottom: 4 }}>
                  Pannes résolues par ce Work Order
                </div>
                <ul style={bulletListStyle}>
                  {linkedPannes.map((p) => (
                    <li key={p.id} style={subBulletStyle}>
                      <span className="mono" style={{ color: "var(--ink-soft)" }}>
                        {formatDate(p.date_panne)} {p.heure_debut?.slice(0, 5) || ""}
                      </span>
                      {" — "}
                      {p.panne_types?.code && (
                        <span className="code-chip" style={{ background: "var(--accent-soft)", color: "var(--accent-strong)", borderRadius: 4, padding: "1px 6px", fontSize: "0.7rem", fontWeight: 600, marginRight: 4 }}>
                          {p.panne_types.code}
                        </span>
                      )}
                      {p.panne_types?.description || "—"}
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
            <label style={{ display: "block", fontSize: "0.7rem", color: "var(--ink-soft)", margin: "8px 0 4px" }}>
              Commentaires
            </label>
            <textarea
              defaultValue={r.commentaires || ""}
              disabled={readOnly}
              onBlur={(e) => onUpdateField(r, "commentaires", e.target.value)}
              rows={3}
              style={{ width: "100%", resize: "vertical", fontSize: "0.85rem" }}
              placeholder="Détail de ce qui a été fait, échanges avec le prestataire, etc."
            />
          </td>
        </tr>
      )}
    </>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "block", fontSize: "0.72rem", color: "var(--ink-soft)", minWidth: 0 }}>
      {label}
      <div style={{ marginTop: 4, minWidth: 0 }}>{children}</div>
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
const bulletListStyle = { margin: "0 0 0", paddingLeft: 16, listStyle: "circle" };
const subBulletStyle = { fontSize: "0.78rem", marginBottom: 4 };
const monthSeparatorStyle = {
  padding: "10px 8px 6px",
  fontSize: "0.72rem",
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--accent-strong)",
  borderTop: "2px solid var(--accent)",
  borderBottom: "1px solid var(--border)",
  background: "var(--accent-soft)",
};