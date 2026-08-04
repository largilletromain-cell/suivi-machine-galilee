import { useEffect, useState } from "react";
import { supabase, withRetry, logActivity } from "../lib/supabaseClient";
import { SubTabs, IconButton, Panel } from "./ui";
import { useAccess } from "../lib/access";

const MONTHS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function nowHHMM() {
  const d = new Date();
  return d.toTimeString().slice(0, 5);
}

function currentMonthKey() {
  return todayISO().slice(0, 7);
}

function formatMonthKey(key) {
  const [y, m] = key.split("-");
  return `${MONTHS_FR[parseInt(m, 10) - 1] || m} ${y}`;
}

function defaultForm() {
  return {
    date_panne: todayISO(),
    heure_debut: nowHHMM(),
    heure_fin: "",
    panne_type_id: "",
    commentaire: "",
    redemarrage: false,
  };
}

export default function RegistrePannes({ centerId }) {
  const { readOnly, username } = useAccess();
  const [machines, setMachines] = useState([]);
  const [activeMachineId, setActiveMachineId] = useState(null);
  const [panneTypes, setPanneTypes] = useState([]);
  const [monthCounts, setMonthCounts] = useState([]); // [{key, count}] tri desc
  const [rowsByMonth, setRowsByMonth] = useState({});
  const [loadingMonths, setLoadingMonths] = useState(() => new Set());
  const [expandedMonths, setExpandedMonths] = useState(() => new Set([currentMonthKey()]));
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadMachines();
  }, [centerId]);

  useEffect(() => {
    if (!activeMachineId) return;
    const machine = machines.find((m) => m.id === activeMachineId);
    loadPanneTypes(machine?.machine_type);
    initMonths(activeMachineId);
  }, [activeMachineId, machines]);

  async function loadMachines() {
    const res = await withRetry(() =>
      supabase.from("machines").select("*").eq("center_id", centerId).order("sort_order")
    );
    setMachines(res.data ?? []);
    if (res.data?.length && !activeMachineId) {
      setActiveMachineId(res.data[0].id);
    }
  }

  async function loadPanneTypes(machineType) {
    let query = supabase.from("panne_types").select("*").eq("active", true).order("code");
    if (machineType) query = query.eq("machine_type", machineType);
    const res = await withRetry(() => query);
    setPanneTypes(res.data ?? []);
  }

  // Ne récupère qu'une seule colonne (date_panne) pour construire la liste des
  // mois disponibles, sans charger tout le détail des pannes — c'est ce qui
  // évite la latence au chargement de la page.
  async function loadMonthCounts(machineId) {
    const res = await withRetry(() =>
      supabase.from("pannes").select("date_panne").eq("machine_id", machineId)
    );
    const counts = {};
    (res.data ?? []).forEach((r) => {
      const key = r.date_panne?.slice(0, 7);
      if (key) counts[key] = (counts[key] || 0) + 1;
    });
    const list = Object.entries(counts)
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.key.localeCompare(a.key));
    setMonthCounts(list);
    return list;
  }

  async function loadMonthRows(machineId, monthKey) {
    setLoadingMonths((s) => new Set(s).add(monthKey));
    try {
      const start = `${monthKey}-01`;
      const [y, m] = monthKey.split("-").map(Number);
      const endDate = new Date(y, m, 0).getDate(); // dernier jour du mois
      const end = `${monthKey}-${String(endDate).padStart(2, "0")}`;
      const res = await withRetry(() =>
        supabase
          .from("pannes")
          .select("*, panne_types(code, description), work_order_pannes(work_orders(id, wo_number))")
          .eq("machine_id", machineId)
          .gte("date_panne", start)
          .lte("date_panne", end)
          .order("date_panne", { ascending: false })
          .order("heure_debut", { ascending: false })
      );
      setRowsByMonth((prev) => ({ ...prev, [monthKey]: res.data ?? [] }));
    } finally {
      setLoadingMonths((s) => {
        const next = new Set(s);
        next.delete(monthKey);
        return next;
      });
    }
  }

  async function initMonths(machineId) {
    setLoading(true);
    setError("");
    try {
      const list = await loadMonthCounts(machineId);
      const cKey = currentMonthKey();
      setExpandedMonths(new Set([cKey]));
      setRowsByMonth({});
      // Charge le mois en cours par défaut, qu'il ait déjà des pannes ou non.
      if (list.some((m) => m.key === cKey)) {
        await loadMonthRows(machineId, cKey);
      } else {
        setRowsByMonth({ [cKey]: [] });
      }
    } catch (e) {
      setError("Erreur de chargement du registre de pannes.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshAfterChange(monthKey) {
    const list = await loadMonthCounts(activeMachineId);
    // recharge tous les mois actuellement dépliés + celui concerné par le changement
    const toReload = new Set(expandedMonths);
    if (monthKey) toReload.add(monthKey);
    for (const key of toReload) {
      if (list.some((m) => m.key === key) || key === currentMonthKey()) {
        await loadMonthRows(activeMachineId, key);
      }
    }
  }

  function toggleMonth(monthKey) {
    setExpandedMonths((s) => {
      const next = new Set(s);
      if (next.has(monthKey)) {
        next.delete(monthKey);
      } else {
        next.add(monthKey);
        if (!rowsByMonth[monthKey]) loadMonthRows(activeMachineId, monthKey);
      }
      return next;
    });
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.date_panne || !form.heure_debut || !form.heure_fin) {
      setError("La date, l'heure de début et l'heure de fin sont obligatoires.");
      return;
    }
    if (!form.panne_type_id) {
      setError("L'erreur rencontrée est obligatoire.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await withRetry(() =>
        supabase.from("pannes").insert({
          machine_id: activeMachineId,
          date_panne: form.date_panne,
          heure_debut: form.heure_debut,
          heure_fin: form.heure_fin,
          panne_type_id: form.panne_type_id,
          commentaire: form.commentaire || null,
          redemarrage: form.redemarrage,
        })
      );
      const monthKey = form.date_panne.slice(0, 7);
      const machineName = machines.find((m) => m.id === activeMachineId)?.label || "";
      logActivity(username, `a ajouté une panne (${machineName}, ${form.date_panne})`);
      setForm(defaultForm());
      setExpandedMonths((s) => new Set(s).add(monthKey));
      await refreshAfterChange(monthKey);
    } catch (e) {
      setError("Impossible d'enregistrer cette panne. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  async function updateField(row, field, value) {
    await withRetry(() => supabase.from("pannes").update({ [field]: value }).eq("id", row.id));
    const machineName = machines.find((m) => m.id === activeMachineId)?.label || "";
    logActivity(username, `a modifié une panne (${machineName}, champ « ${field} »)`);
    await refreshAfterChange(value && field === "date_panne" ? value.slice(0, 7) : null);
  }

  async function handleDelete(id, monthKey) {
    if (!window.confirm("Supprimer cette ligne du registre de pannes ?")) return;
    await withRetry(() => supabase.from("pannes").delete().eq("id", id));
    const machineName = machines.find((m) => m.id === activeMachineId)?.label || "";
    logActivity(username, `a supprimé une panne (${machineName})`);
    await refreshAfterChange(monthKey);
  }

  return (
    <div>
      <SubTabs
        items={machines.map((m) => ({ key: m.id, label: m.label || m.code }))}
        activeKey={activeMachineId}
        onChange={setActiveMachineId}
      />

      {machines.length === 0 && (
        <p style={{ color: "var(--ink-soft)", fontSize: "0.88rem" }}>
          Aucune machine Radixact/Varian enregistrée pour l'instant — créez-en une dans l'onglet{" "}
          <strong>Paramétrage</strong>.
        </p>
      )}

      <Panel>
        {!readOnly && (
        <form
          onSubmit={handleAdd}
          style={{
            display: "grid",
            gridTemplateColumns: "130px 110px 110px 1fr 150px 1fr auto",
            gap: 8,
            alignItems: "end",
            marginBottom: 18,
            paddingBottom: 18,
            borderBottom: "1px solid var(--border)",
          }}
        >
          <Field label="Date">
            <input
              type="date"
              value={form.date_panne}
              onChange={(e) => setForm({ ...form, date_panne: e.target.value })}
              required
            />
          </Field>
          <Field label="Heure début">
            <input
              type="time"
              value={form.heure_debut}
              onChange={(e) => setForm({ ...form, heure_debut: e.target.value })}
              required
            />
          </Field>
          <Field label="Heure fin">
            <input
              type="time"
              value={form.heure_fin}
              onChange={(e) => setForm({ ...form, heure_fin: e.target.value })}
              required
            />
          </Field>
          <Field label="Erreur rencontrée">
            <select
              value={form.panne_type_id}
              onChange={(e) => setForm({ ...form, panne_type_id: e.target.value })}
              style={{ width: "100%" }}
              required
            >
              <option value="">— Sélectionner —</option>
              {panneTypes.map((pt) => (
                <option key={pt.id} value={pt.id}>
                  {pt.code ? `[${pt.code}] ` : ""}
                  {pt.description}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Redémarrage machine">
            <button
              type="button"
              onClick={() => setForm({ ...form, redemarrage: !form.redemarrage })}
              style={{
                width: "100%",
                border: "1px solid " + (form.redemarrage ? "var(--accent)" : "var(--border)"),
                background: form.redemarrage ? "var(--accent-soft)" : "var(--surface)",
                color: form.redemarrage ? "var(--accent-strong)" : "var(--ink)",
                borderRadius: 6,
                padding: "7px 0",
                fontSize: "0.8rem",
                fontWeight: 600,
                height: 34,
              }}
            >
              {form.redemarrage ? "🔄 Redémarrée" : "Pas redémarrée"}
            </button>
          </Field>
          <Field label="Commentaire">
            <input
              type="text"
              value={form.commentaire}
              onChange={(e) => setForm({ ...form, commentaire: e.target.value })}
              placeholder="Optionnel"
              style={{ width: "100%" }}
            />
          </Field>
          <button
            type="submit"
            disabled={saving || !activeMachineId}
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
        ) : (
          <MonthsList
            monthCounts={monthCounts}
            expandedMonths={expandedMonths}
            rowsByMonth={rowsByMonth}
            loadingMonths={loadingMonths}
            onToggle={toggleMonth}
            panneTypes={panneTypes}
            onUpdateField={updateField}
            onDelete={handleDelete}
            readOnly={readOnly}
          />
        )}
      </Panel>
    </div>
  );
}

function MonthsList({
  monthCounts,
  expandedMonths,
  rowsByMonth,
  loadingMonths,
  onToggle,
  panneTypes,
  onUpdateField,
  onDelete,
  readOnly,
}) {
  const cKey = currentMonthKey();
  // Le mois en cours apparaît toujours en premier, même sans pannes.
  const keys = monthCounts.map((m) => m.key);
  const allKeys = keys.includes(cKey) ? keys : [cKey, ...keys];
  const countByKey = Object.fromEntries(monthCounts.map((m) => [m.key, m.count]));

  if (allKeys.length === 0) {
    return <p style={{ color: "var(--ink-soft)" }}>Aucune panne enregistrée pour cette machine.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {allKeys.map((monthKey) => {
        const expanded = expandedMonths.has(monthKey);
        const count = countByKey[monthKey] || 0;
        const rows = rowsByMonth[monthKey];
        const isLoading = loadingMonths.has(monthKey);
        return (
          <div key={monthKey} style={{ border: "1px solid var(--border)", borderRadius: 8 }}>
            <button
              onClick={() => onToggle(monthKey)}
              style={{
                width: "100%",
                textAlign: "left",
                border: "none",
                background: monthKey === cKey ? "var(--accent-soft)" : "var(--paper)",
                padding: "8px 12px",
                fontSize: "0.82rem",
                fontWeight: 700,
                color: "var(--accent-strong)",
                borderRadius: expanded ? "8px 8px 0 0" : 8,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>
                {expanded ? "▾" : "▸"} {formatMonthKey(monthKey)}
                {monthKey === cKey ? " (mois en cours)" : ""}
              </span>
              <span className="mono">{count} panne{count !== 1 ? "s" : ""}</span>
            </button>
            {expanded && (
              <div style={{ padding: "10px 12px" }}>
                {isLoading || !rows ? (
                  <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem", margin: 0 }}>Chargement…</p>
                ) : rows.length === 0 ? (
                  <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem", margin: 0 }}>
                    Aucune panne ce mois-ci.
                  </p>
                ) : (
                  <PannesTable
                    rows={rows}
                    panneTypes={panneTypes}
                    onUpdateField={onUpdateField}
                    onDelete={(id) => onDelete(id, monthKey)}
                    readOnly={readOnly}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PannesTable({ rows, panneTypes, onUpdateField, onDelete, readOnly }) {
  return (
    <table>
      <thead>
        <tr style={{ textAlign: "left", fontSize: "0.75rem", color: "var(--ink-soft)" }}>
          <th style={th}>WO</th>
          <th style={th}>Date</th>
          <th style={th}>Début</th>
          <th style={th}>Fin</th>
          <th style={th}>Erreur</th>
          <th style={th}>Redémarrage</th>
          <th style={th}>Commentaire</th>
          <th style={th}></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const linkedWos = (r.work_order_pannes ?? []).map((wp) => wp.work_orders).filter(Boolean);
          return (
            <tr key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
              <td style={td}>
                {linkedWos.length > 0 ? (
                  linkedWos.map((wo) => (
                    <span
                      key={wo.id}
                      title="Panne prise en compte par ce Work Order"
                      className="mono"
                      style={{
                        display: "inline-block",
                        background: "var(--status-ok-bg)",
                        color: "var(--status-ok-ink)",
                        borderRadius: 4,
                        padding: "2px 6px",
                        fontSize: "0.72rem",
                        fontWeight: 600,
                        marginRight: 4,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {wo.wo_number ? `#${wo.wo_number}` : "WO lié"}
                    </span>
                  ))
                ) : (
                  <span style={{ color: "var(--ink-soft)" }}>—</span>
                )}
              </td>
              <td style={td}>
                <input
                  type="date"
                  defaultValue={r.date_panne}
                  disabled={readOnly}
                  onBlur={(e) => e.target.value && onUpdateField(r, "date_panne", e.target.value)}
                  style={{ width: 130 }}
                />
              </td>
              <td style={{ ...td }}>
                <input
                  type="time"
                  className="mono"
                  defaultValue={r.heure_debut?.slice(0, 5)}
                  disabled={readOnly}
                  onBlur={(e) => e.target.value && onUpdateField(r, "heure_debut", e.target.value)}
                  style={{ width: 100 }}
                />
              </td>
              <td style={{ ...td }}>
                <input
                  type="time"
                  className="mono"
                  defaultValue={r.heure_fin?.slice(0, 5) || ""}
                  disabled={readOnly}
                  onBlur={(e) => onUpdateField(r, "heure_fin", e.target.value || null)}
                  style={{ width: 100 }}
                />
              </td>
              <td style={td}>
                <select
                  value={r.panne_type_id || ""}
                  disabled={readOnly}
                  onChange={(e) => onUpdateField(r, "panne_type_id", e.target.value || null)}
                  style={{ width: "100%", fontSize: "0.82rem" }}
                >
                  <option value="">— Aucune —</option>
                  {!panneTypes.some((pt) => pt.id === r.panne_type_id) && r.panne_types && (
                    <option value={r.panne_type_id}>
                      {r.panne_types.code ? `[${r.panne_types.code}] ` : ""}
                      {r.panne_types.description}
                    </option>
                  )}
                  {panneTypes.map((pt) => (
                    <option key={pt.id} value={pt.id}>
                      {pt.code ? `[${pt.code}] ` : ""}
                      {pt.description}
                    </option>
                  ))}
                </select>
              </td>
              <td style={td}>
                <button
                  disabled={readOnly}
                  onClick={() => onUpdateField(r, "redemarrage", !r.redemarrage)}
                  title={readOnly ? "" : "Cliquer pour basculer"}
                  style={{
                    border: "1px solid " + (r.redemarrage ? "var(--accent)" : "var(--border)"),
                    background: r.redemarrage ? "var(--accent-soft)" : "var(--surface)",
                    color: r.redemarrage ? "var(--accent-strong)" : "var(--ink-soft)",
                    borderRadius: 6,
                    padding: "4px 8px",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    cursor: readOnly ? "default" : "pointer",
                  }}
                >
                  {r.redemarrage ? "🔄 Oui" : "Non"}
                </button>
              </td>
              <td style={td}>
                <input
                  type="text"
                  defaultValue={r.commentaire || ""}
                  disabled={readOnly}
                  onBlur={(e) => onUpdateField(r, "commentaire", e.target.value || null)}
                  placeholder="Optionnel"
                  style={{ width: "100%" }}
                />
              </td>
              <td style={td}>
                {!readOnly && (
                  <IconButton title="Supprimer" danger onClick={() => onDelete(r.id)}>
                    ✕
                  </IconButton>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "block", fontSize: "0.75rem", color: "var(--ink-soft)" }}>
      {label}
      <div style={{ marginTop: 4 }}>{children}</div>
    </label>
  );
}

const th = { padding: "6px 10px" };
const td = { padding: "8px 10px", fontSize: "0.85rem", verticalAlign: "top" };