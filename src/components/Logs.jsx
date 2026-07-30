import { useEffect, useState } from "react";
import { supabase, withRetry } from "../lib/supabaseClient";
import { Panel } from "./ui";

function formatDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterUser, setFilterUser] = useState("Tous");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const res = await withRetry(() =>
      supabase
        .from("activity_logs")
        .select("*")
        .gte("created_at", threeMonthsAgo.toISOString())
        .order("created_at", { ascending: false })
    );
    setLogs(res.data ?? []);
    setLoading(false);
  }

  const users = Array.from(new Set(logs.map((l) => l.username))).sort();
  const filteredLogs = filterUser === "Tous" ? logs : logs.filter((l) => l.username === filterUser);

  return (
    <Panel>
      <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem", marginTop: 0 }}>
        Journal de toutes les modifications effectuées dans l'application sur les 3 derniers mois
        glissants (au-delà, les entrées sont automatiquement purgées).
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: "0.78rem", color: "var(--ink-soft)" }}>Filtrer par utilisateur :</span>
        <select value={filterUser} onChange={(e) => setFilterUser(e.target.value)} style={{ fontSize: "0.82rem" }}>
          <option value="Tous">Tous</option>
          {users.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p style={{ color: "var(--ink-soft)" }}>Chargement…</p>
      ) : filteredLogs.length === 0 ? (
        <p style={{ color: "var(--ink-soft)" }}>Aucune activité enregistrée pour le moment.</p>
      ) : (
        <table>
          <thead>
            <tr style={{ textAlign: "left", fontSize: "0.75rem", color: "var(--ink-soft)" }}>
              <th style={th}>Date / heure</th>
              <th style={th}>Utilisateur</th>
              <th style={th}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.map((l) => (
              <tr key={l.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={td} className="mono">
                  {formatDateTime(l.created_at)}
                </td>
                <td style={td} className="mono">
                  {l.username}
                </td>
                <td style={td}>{l.action}</td>
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