import { useEffect, useMemo, useState, Fragment } from "react";
import { supabase, withRetry } from "../lib/supabaseClient";
import { SubTabs, IconButton, Panel } from "./ui";
import { useAccess } from "../lib/access";

const MONTHS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

function formatMonthYear(iso) {
  if (!iso) return "Sans date";
  const [y, m] = iso.split("-");
  const idx = parseInt(m, 10) - 1;
  return `${MONTHS_FR[idx] || m} ${y}`;
}

function formatDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// Palette dédiée, en teintes vives et bien distinctes (indépendante des
// couleurs de statut utilisées ailleurs, plus douces et donc moins lisibles
// comme repères de couleur ici) : rouge = correctif (réactif à une panne),
// bleu = contrôle qualité, vert = préventif planifié, violet = paramétrage
// machine.
const EVENT_STYLES = {
  corrective: { color: "#e0292a", bg: "#fdeaea", label: "Maintenance corrective" },
  controle_qualite: { color: "#1565e0", bg: "#e8f0fe", label: "Contrôle de qualité" },
  maintenance_preventive: { color: "#1a9c4b", bg: "#e7f7ed", label: "Maintenance préventive" },
  parametrage_machine: { color: "#8b3fd1", bg: "#f3e8fc", label: "Paramétrage machine" },
  autre: { color: "#6b7280", bg: "#eef0f2", label: "Autre" },
};

const emptyForm = {
  event_type: "controle_qualite",
  date_debut: "",
  heure_debut: "",
  date_fin: "",
  heure_fin: "",
  commentaire: "",
};

export default function RegistreInterventions({ centerId }) {
  const { readOnly } = useAccess();
  const [equipments, setEquipments] = useState([]);
  const [activeEquipmentId, setActiveEquipmentId] = useState(null);
  const [workOrders, setWorkOrders] = useState([]);
  const [interventions, setInterventions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);

  useEffect(() => {
    loadEquipments();
  }, [centerId]);

  useEffect(() => {
    if (!activeEquipmentId) return;
    loadData(activeEquipmentId);
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

  async function loadData(equipmentId) {
    setLoading(true);
    setError("");
    try {
      const [woRes, intRes] = await Promise.all([
        withRetry(() =>
          supabase
            .from("work_orders")
            .select("*, downtime_periods(id, date_debut, heure_debut, date_fin, heure_fin, commentaire)")
            .eq("equipment_id", equipmentId)
            .not("date_intervention", "is", null)
        ),
        withRetry(() =>
          supabase.from("interventions").select("*").eq("equipment_id", equipmentId)
        ),
      ]);
      setWorkOrders(woRes.data ?? []);
      setInterventions(intRes.data ?? []);
    } catch (e) {
      setError("Erreur de chargement du registre des interventions.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.date_debut) {
      setError("La date de début est obligatoire.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await withRetry(() =>
        supabase.from("interventions").insert({
          equipment_id: activeEquipmentId,
          event_type: form.event_type,
          date_debut: form.date_debut,
          heure_debut: form.heure_debut || null,
          date_fin: form.date_fin || null,
          heure_fin: form.heure_fin || null,
          commentaire: form.commentaire || null,
        })
      );
      setForm(emptyForm);
      await loadData(activeEquipmentId);
    } catch (e) {
      setError("Impossible d'enregistrer cet événement. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(it) {
    setEditingId(it.id);
    setEditForm({
      event_type: it.event_type,
      date_debut: it.date_debut || "",
      heure_debut: it.heure_debut?.slice(0, 5) || "",
      date_fin: it.date_fin || "",
      heure_fin: it.heure_fin?.slice(0, 5) || "",
      commentaire: it.commentaire || "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(emptyForm);
  }

  async function saveEdit(id) {
    await withRetry(() =>
      supabase
        .from("interventions")
        .update({
          date_debut: editForm.date_debut,
          heure_debut: editForm.heure_debut || null,
          date_fin: editForm.date_fin || null,
          heure_fin: editForm.heure_fin || null,
          commentaire: editForm.commentaire || null,
        })
        .eq("id", id)
    );
    cancelEdit();
    await loadData(activeEquipmentId);
  }

  async function handleDelete(id) {
    if (!window.confirm("Supprimer cet événement ?")) return;
    await withRetry(() => supabase.from("interventions").delete().eq("id", id));
    setInterventions((s) => s.filter((x) => x.id !== id));
  }

  // Fusionne Work Orders (lecture seule) et interventions saisies ici en une
  // liste unique, triée du plus récent au plus ancien.
  const unifiedRows = useMemo(() => {
    const fromWo = workOrders.map((wo) => {
      const periods = (wo.downtime_periods ?? []).slice().sort((a, b) =>
        (a.date_debut || "").localeCompare(b.date_debut || "")
      );
      return {
        id: `wo-${wo.id}`,
        kind: "wo",
        eventType: "corrective",
        eventDate: wo.date_intervention,
        title: wo.wo_number ? `${wo.panne_erreur} (WO #${wo.wo_number})` : wo.panne_erreur,
        commentaire: wo.commentaires,
        periods,
        raw: wo,
      };
    });
    const fromInterventions = interventions.map((it) => ({
      id: `it-${it.id}`,
      kind: "intervention",
      eventType: it.event_type,
      eventDate: it.date_debut,
      title: EVENT_STYLES[it.event_type]?.label ?? it.event_type,
      commentaire: it.commentaire,
      periods: [
        {
          id: it.id,
          date_debut: it.date_debut,
          heure_debut: it.heure_debut,
          date_fin: it.date_fin,
          heure_fin: it.heure_fin,
        },
      ],
      raw: it,
    }));
    return [...fromWo, ...fromInterventions].sort((a, b) =>
      (b.eventDate || "").localeCompare(a.eventDate || "")
    );
  }, [workOrders, interventions]);

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
        <div style={{ display: "flex", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
          {Object.entries(EVENT_STYLES).map(([key, s]) => (
            <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.78rem" }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, display: "inline-block" }} />
              {s.label}
            </span>
          ))}
        </div>

        {!readOnly && (
        <form
          onSubmit={handleAdd}
          style={{
            display: "grid",
            gridTemplateColumns: "170px 120px 100px 120px 100px 1.3fr auto",
            gap: 8,
            alignItems: "end",
            marginBottom: 18,
            paddingBottom: 18,
            borderBottom: "1px solid var(--border)",
          }}
        >
          <Field label="Type d'événement">
            <select
              value={form.event_type}
              onChange={(e) => setForm({ ...form, event_type: e.target.value })}
              style={{ width: "100%" }}
            >
              <option value="controle_qualite">Contrôle de qualité</option>
              <option value="maintenance_preventive">Maintenance préventive</option>
              <option value="parametrage_machine">Paramétrage machine</option>
              <option value="autre">Autre</option>
            </select>
          </Field>
          <Field label="Date début">
            <input
              type="date"
              value={form.date_debut}
              onChange={(e) => setForm({ ...form, date_debut: e.target.value })}
              required
            />
          </Field>
          <Field label="Heure">
            <input
              type="time"
              value={form.heure_debut}
              onChange={(e) => setForm({ ...form, heure_debut: e.target.value })}
            />
          </Field>
          <Field label="Date fin">
            <input
              type="date"
              value={form.date_fin}
              onChange={(e) => setForm({ ...form, date_fin: e.target.value })}
            />
          </Field>
          <Field label="Heure">
            <input
              type="time"
              value={form.heure_fin}
              onChange={(e) => setForm({ ...form, heure_fin: e.target.value })}
            />
          </Field>
          <Field label="Commentaire (ce qui a été fait / prévu)">
            <input
              type="text"
              value={form.commentaire}
              onChange={(e) => setForm({ ...form, commentaire: e.target.value })}
              style={{ width: "100%" }}
            />
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
        ) : unifiedRows.length === 0 ? (
          <p style={{ color: "var(--ink-soft)" }}>Aucun événement pour cet équipement.</p>
        ) : (
          <table>
            <thead>
              <tr style={{ textAlign: "left", fontSize: "0.72rem", color: "var(--ink-soft)" }}>
                <th style={th}>Date</th>
                <th style={th}>Intitulé</th>
                <th style={th}>Ce qui a été fait</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                let lastMonthKey;
                return unifiedRows.map((row) => {
                  const monthKey = (row.eventDate || "").slice(0, 7) || "none";
                  let monthSeparator = null;
                  if (monthKey !== lastMonthKey) {
                    lastMonthKey = monthKey;
                    monthSeparator = (
                      <tr key={`month-${monthKey}`}>
                        <td colSpan={4} style={monthSeparatorStyle}>
                          {formatMonthYear(row.eventDate)}
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <Fragment key={row.id}>
                      {monthSeparator}
                      {editingId === row.raw?.id && row.kind === "intervention" ? (
                        <EditRow
                          editForm={editForm}
                          setEditForm={setEditForm}
                          onSave={() => saveEdit(row.raw.id)}
                          onCancel={cancelEdit}
                        />
                      ) : (
                        <EventRow row={row} onEdit={startEdit} onDelete={handleDelete} readOnly={readOnly} />
                      )}
                    </Fragment>
                  );
                });
              })()}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

function EventRow({ row, onEdit, onDelete, readOnly }) {
  const style = EVENT_STYLES[row.eventType] ?? EVENT_STYLES.corrective;
  return (
    <tr style={{ borderTop: "1px solid var(--border)" }}>
      <td
        style={{
          ...td,
          borderLeft: `3px solid ${style.color}`,
          color: style.color,
          fontWeight: 700,
        }}
        className="mono"
      >
        {formatDate(row.eventDate)}
      </td>
      <td style={td}>
        <span
          style={{
            display: "inline-block",
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: style.color,
            marginRight: 7,
          }}
        />
        <span style={{ fontWeight: row.kind === "wo" ? 400 : 600 }}>{row.title}</span>
      </td>
      <td style={td}>
        {row.commentaire && <div>{row.commentaire}</div>}
        {row.periods.length > 0 && (
          <ul style={bulletListStyle}>
            {row.periods.map((p) => (
              <li key={p.id} style={subBulletStyle} className="mono">
                {formatDate(p.date_debut)} {p.heure_debut?.slice(0, 5) || ""}
                {" → "}
                {p.date_fin ? `${formatDate(p.date_fin)} ${p.heure_fin?.slice(0, 5) || ""}` : "en cours"}
                {p.commentaire && <span className="" style={{ fontFamily: "inherit" }}> — {p.commentaire}</span>}
              </li>
            ))}
          </ul>
        )}
      </td>
      <td style={td}>
        {row.kind === "intervention" && !readOnly ? (
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => onEdit(row.raw)}
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
            <IconButton title="Supprimer" danger onClick={() => onDelete(row.raw.id)}>
              ✕
            </IconButton>
          </div>
        ) : row.kind === "wo" ? (
          <span title="Modifiable uniquement dans l'onglet Work Order" style={{ color: "var(--ink-soft)", fontSize: "0.9rem" }}>
            🔒
          </span>
        ) : null}
      </td>
    </tr>
  );
}

function EditRow({ editForm, setEditForm, onSave, onCancel }) {
  return (
    <tr style={{ borderTop: "1px solid var(--border)", background: "var(--accent-soft)" }}>
      <td colSpan={4} style={{ padding: 10 }}>
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
            onClick={onSave}
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
            onClick={onCancel}
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
      </td>
    </tr>
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

function MiniField({ label, children }) {
  return (
    <label style={{ fontSize: "0.7rem", color: "var(--ink-soft)" }}>
      {label}
      <div style={{ marginTop: 3 }}>{children}</div>
    </label>
  );
}

const th = { padding: "6px 8px" };
const td = { padding: "8px 8px", fontSize: "0.85rem", verticalAlign: "top" };
const bulletListStyle = { margin: "4px 0 0", paddingLeft: 16, listStyle: "circle" };
const subBulletStyle = { fontSize: "0.78rem", marginBottom: 2 };
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