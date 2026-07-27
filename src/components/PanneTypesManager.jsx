import { useEffect, useState } from "react";
import { supabase, withRetry } from "../lib/supabaseClient";
import { IconButton, Panel } from "./ui";

export default function PanneTypesManager() {
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newCode, setNewCode] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await withRetry(() =>
        supabase.from("panne_types").select("*").order("active", { ascending: false }).order("code")
      );
      setTypes(res.data ?? []);
    } finally {
      setLoading(false);
    }
  }

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
        active: true,
      })
    );
    setNewCode("");
    setNewDesc("");
    load();
  }

  async function toggleActive(t) {
    await withRetry(() =>
      supabase.from("panne_types").update({ active: !t.active }).eq("id", t.id)
    );
    load();
  }

  async function handleDelete(id) {
    if (!window.confirm("Supprimer définitivement ce type de panne de la liste ?")) return;
    await withRetry(() => supabase.from("panne_types").delete().eq("id", id));
    load();
  }

  return (
    <Panel>
      <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem", marginTop: 0 }}>
        Cette liste alimente le menu déroulant « Erreur rencontrée » du Registre Pannes.
        Désactivez une entrée pour la masquer sans perdre l'historique déjà saisi, ou
        ajoutez-en de nouvelles au fil de l'eau.
      </p>

      <form
        onSubmit={handleAdd}
        style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}
      >
        <input
          type="text"
          placeholder="Code (optionnel)"
          value={newCode}
          onChange={(e) => setNewCode(e.target.value)}
          style={{ width: 140 }}
        />
        <input
          type="text"
          placeholder="Description de l'erreur"
          value={newDesc}
          onChange={(e) => setNewDesc(e.target.value)}
          style={{ flex: 1, minWidth: 260 }}
        />
        <button
          type="submit"
          style={{
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "8px 16px",
            fontWeight: 600,
          }}
        >
          Ajouter
        </button>
      </form>
      {error && <p style={{ color: "var(--status-bad-ink)", fontSize: "0.85rem" }}>{error}</p>}

      {loading ? (
        <p style={{ color: "var(--ink-soft)" }}>Chargement…</p>
      ) : (
        <table>
          <thead>
            <tr style={{ textAlign: "left", fontSize: "0.75rem", color: "var(--ink-soft)" }}>
              <th style={th}>Code</th>
              <th style={th}>Description</th>
              <th style={th}>Actif</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {types.map((t) => (
              <tr
                key={t.id}
                style={{
                  borderTop: "1px solid var(--border)",
                  opacity: t.active ? 1 : 0.5,
                }}
              >
                <td style={td} className="mono">
                  {t.code || "—"}
                </td>
                <td style={td}>{t.description}</td>
                <td style={td}>
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
                </td>
                <td style={td}>
                  <IconButton title="Supprimer" danger onClick={() => handleDelete(t.id)}>
                    ✕
                  </IconButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

const th = { padding: "6px 10px" };
const td = { padding: "8px 10px", fontSize: "0.85rem", verticalAlign: "top" };