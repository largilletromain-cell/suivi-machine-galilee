import { useEffect, useMemo, useState } from "react";
import { supabase, withRetry, logActivity } from "../lib/supabaseClient";
import { IconButton, Panel } from "./ui";
import { useAccess } from "../lib/access";

const PRESET_MACHINE_TYPES = ["Radixact", "Varian"];

export default function PanneTypesManager() {
  const { readOnly, username } = useAccess();
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newCode, setNewCode] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newMachineType, setNewMachineType] = useState("Radixact");
  const [filterType, setFilterType] = useState("Tous");
  const [error, setError] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await withRetry(() =>
        supabase.from("panne_types").select("*").order("active", { ascending: false }).order("machine_type").order("code")
      );
      setTypes(res.data ?? []);
    } finally {
      setLoading(false);
    }
  }

  const machineTypes = useMemo(() => {
    const set = new Set([...PRESET_MACHINE_TYPES, ...types.map((t) => t.machine_type).filter(Boolean)]);
    return Array.from(set).sort();
  }, [types]);

  const filteredTypes = useMemo(() => {
    if (filterType === "Tous") return types;
    return types.filter((t) => (t.machine_type || "Non classé") === filterType);
  }, [types, filterType]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!newDesc.trim()) {
      setError("La description ne peut pas être vide.");
      return;
    }
    setError("");
    await withRetry(() =>
      supabase.from("panne_types").insert({
        code: newCode.trim() || null,
        description: newDesc.trim(),
        machine_type: newMachineType.trim() || null,
        active: true,
      })
    );
    logActivity(username, `a ajouté un type de panne (${newMachineType.trim()}, ${newDesc.trim()})`);
    setNewCode("");
    setNewDesc("");
    load();
  }

  async function toggleActive(t) {
    await withRetry(() =>
      supabase.from("panne_types").update({ active: !t.active }).eq("id", t.id)
    );
    logActivity(username, `a ${t.active ? "désactivé" : "réactivé"} un type de panne (${t.description})`);
    load();
  }

  async function handleDelete(id) {
    if (!window.confirm("Supprimer définitivement ce type de panne de la liste ?")) return;
    await withRetry(() => supabase.from("panne_types").delete().eq("id", id));
    logActivity(username, "a supprimé un type de panne");
    load();
  }

  return (
    <Panel>
      <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem", marginTop: 0 }}>
        Cette liste alimente le menu déroulant « Erreur rencontrée » du Registre Pannes —
        chaque erreur est rattachée à un type de machine (ex : Radixact) et n'apparaît que
        pour les machines de ce type. Désactivez une entrée pour la masquer sans perdre
        l'historique déjà saisi, ou ajoutez-en de nouvelles au fil de l'eau.
      </p>

      {!readOnly && (
      <form
        onSubmit={handleAdd}
        style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "end" }}
      >
        <Field label="Type de machine">
          <input
            type="text"
            list="machine-type-options"
            value={newMachineType}
            onChange={(e) => setNewMachineType(e.target.value)}
            placeholder="ex : Radixact"
            style={{ width: 150 }}
          />
          <datalist id="machine-type-options">
            {machineTypes.map((mt) => (
              <option key={mt} value={mt} />
            ))}
          </datalist>
        </Field>
        <Field label="Code (optionnel)">
          <input
            type="text"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            style={{ width: 120 }}
          />
        </Field>
        <Field label="Description de l'erreur">
          <input
            type="text"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            style={{ width: 320 }}
          />
        </Field>
        <button
          type="submit"
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
          Ajouter
        </button>
      </form>
      )}
      {error && <p style={{ color: "var(--status-bad-ink)", fontSize: "0.85rem" }}>{error}</p>}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: "0.78rem", color: "var(--ink-soft)" }}>Filtrer :</span>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ fontSize: "0.82rem" }}>
          <option value="Tous">Tous les types de machine</option>
          {machineTypes.map((mt) => (
            <option key={mt} value={mt}>
              {mt}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p style={{ color: "var(--ink-soft)" }}>Chargement…</p>
      ) : (
        <table>
          <thead>
            <tr style={{ textAlign: "left", fontSize: "0.75rem", color: "var(--ink-soft)" }}>
              <th style={th}>Machine</th>
              <th style={th}>Code</th>
              <th style={th}>Description</th>
              <th style={th}>Actif</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {filteredTypes.map((t) => (
              <tr
                key={t.id}
                style={{
                  borderTop: "1px solid var(--border)",
                  opacity: t.active ? 1 : 0.5,
                }}
              >
                <td style={td}>
                  <span className="code-chip" style={chip}>
                    {t.machine_type || "Non classé"}
                  </span>
                </td>
                <td style={td} className="mono">
                  {t.code || "—"}
                </td>
                <td style={td}>{t.description}</td>
                <td style={td}>
                  {!readOnly && (
                    <button
                      onClick={() => toggleActive(t)}
                      style={{
                        border: "1px solid var(--border)",
                        background: "var(--surface)",
                        borderRadius: 6,
                        padding: "4px 10px",
                        fontSize: "0.78rem",
                      }}
                    >
                      {t.active ? "Désactiver" : "Réactiver"}
                    </button>
                  )}
                </td>
                <td style={td}>
                  {!readOnly && (
                    <IconButton title="Supprimer" danger onClick={() => handleDelete(t.id)}>
                      ✕
                    </IconButton>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
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

const th = { padding: "6px 10px" };
const td = { padding: "8px 10px", fontSize: "0.85rem", verticalAlign: "top" };
const chip = {
  background: "var(--accent-soft)",
  color: "var(--accent-strong)",
  borderRadius: 4,
  padding: "2px 8px",
  fontSize: "0.72rem",
  fontWeight: 600,
  whiteSpace: "nowrap",
};