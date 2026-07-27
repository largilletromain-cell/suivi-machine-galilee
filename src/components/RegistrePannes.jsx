import { useEffect, useState } from "react";
import { supabase, withRetry } from "../lib/supabaseClient";
import { SubTabs, IconButton, Panel } from "./ui";

const emptyForm = {
  date_panne: "",
  heure_debut: "",
  heure_fin: "",
  panne_type_id: "",
  commentaire: "",
};

export default function RegistrePannes({ centerId }) {
  const [machines, setMachines] = useState([]);
  const [activeMachineId, setActiveMachineId] = useState(null);
  const [panneTypes, setPanneTypes] = useState([]);
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [machinesRes, typesRes] = await Promise.all([
        withRetry(() =>
          supabase
            .from("machines")
            .select("*")
            .eq("center_id", centerId)
            .order("sort_order")
        ),
        withRetry(() =>
          supabase
            .from("panne_types")
            .select("*")
            .eq("active", true)
            .order("code")
        ),
      ]);
      if (cancelled) return;
      setMachines(machinesRes.data ?? []);
      setPanneTypes(typesRes.data ?? []);
      if (machinesRes.data?.length) setActiveMachineId(machinesRes.data[0].id);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [centerId]);

  useEffect(() => {
    if (!activeMachineId) return;
    loadRows(activeMachineId);
  }, [activeMachineId]);

  async function loadRows(machineId) {
    setLoading(true);
    setError("");
    try {
      const res = await withRetry(() =>
        supabase
          .from("pannes")
          .select("*, panne_types(code, description)")
          .eq("machine_id", machineId)
          .order("date_panne", { ascending: false })
          .order("heure_debut", { ascending: false })
      );
      setRows(res.data ?? []);
    } catch (e) {
      setError("Erreur de chargement du registre de pannes.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.date_panne || !form.heure_debut) {
      setError("La date et l'heure de début sont obligatoires.");
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
          heure_fin: form.heure_fin || null,
          panne_type_id: form.panne_type_id || null,
          commentaire: form.commentaire || null,
        })
      );
      setForm(emptyForm);
      await loadRows(activeMachineId);
    } catch (e) {
      setError("Impossible d'enregistrer cette panne. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Supprimer cette ligne du registre de pannes ?")) return;
    await withRetry(() => supabase.from("pannes").delete().eq("id", id));
    setRows((r) => r.filter((row) => row.id !== id));
  }

  return (
    <div>
      <SubTabs
        items={machines.map((m) => ({ key: m.id, label: m.label || m.code }))}
        activeKey={activeMachineId}
        onChange={setActiveMachineId}
      />

      <Panel>
        <form
          onSubmit={handleAdd}
          style={{
            display: "grid",
            gridTemplateColumns: "130px 110px 110px 1fr 1fr auto",
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
            />
          </Field>
          <Field label="Erreur rencontrée">
            <select
              value={form.panne_type_id}
              onChange={(e) => setForm({ ...form, panne_type_id: e.target.value })}
              style={{ width: "100%" }}
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

        {error && (
          <p style={{ color: "var(--status-bad-ink)", fontSize: "0.85rem" }}>{error}</p>
        )}

        {loading ? (
          <p style={{ color: "var(--ink-soft)" }}>Chargement…</p>
        ) : rows.length === 0 ? (
          <p style={{ color: "var(--ink-soft)" }}>Aucune panne enregistrée pour cette machine.</p>
        ) : (
          <table>
            <thead>
              <tr style={{ textAlign: "left", fontSize: "0.75rem", color: "var(--ink-soft)" }}>
                <th style={th}>Date</th>
                <th style={th}>Début</th>
                <th style={th}>Fin</th>
                <th style={th}>Erreur</th>
                <th style={th}>Commentaire</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={td}>{formatDate(r.date_panne)}</td>
                  <td style={{ ...td }} className="mono">
                    {r.heure_debut?.slice(0, 5)}
                  </td>
                  <td style={{ ...td }} className="mono">
                    {r.heure_fin?.slice(0, 5) || "—"}
                  </td>
                  <td style={td}>
                    {r.panne_types ? (
                      <span>
                        {r.panne_types.code && (
                          <span className="code-chip" style={codeChip}>
                            {r.panne_types.code}
                          </span>
                        )}{" "}
                        {r.panne_types.description}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td style={td}>{r.commentaire || "—"}</td>
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
    </div>
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

function formatDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const th = { padding: "6px 10px" };
const td = { padding: "8px 10px", fontSize: "0.85rem", verticalAlign: "top" };
const codeChip = {
  background: "var(--accent-soft)",
  color: "var(--accent-strong)",
  borderRadius: 4,
  padding: "1px 6px",
  fontSize: "0.72rem",
  fontWeight: 600,
};