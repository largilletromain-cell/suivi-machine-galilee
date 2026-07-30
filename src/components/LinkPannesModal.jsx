import { useEffect, useMemo, useState } from "react";
import { supabase, withRetry, logActivity } from "../lib/supabaseClient";
import { useAccess } from "../lib/access";

function formatDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default function LinkPannesModal({ workOrder, machineId, machineName, onClose, onChanged }) {
  const { username } = useAccess();
  const [pannes, setPannes] = useState([]);
  const [linkedIds, setLinkedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [toggling, setToggling] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const [pannesRes, linkedRes] = await Promise.all([
      withRetry(() =>
        supabase
          .from("pannes")
          .select("*, panne_types(code, description)")
          .eq("machine_id", machineId)
          .order("date_panne", { ascending: false })
          .order("heure_debut", { ascending: false })
      ),
      withRetry(() =>
        supabase.from("work_order_pannes").select("panne_id").eq("work_order_id", workOrder.id)
      ),
    ]);
    setPannes(pannesRes.data ?? []);
    setLinkedIds(new Set((linkedRes.data ?? []).map((r) => r.panne_id)));
    setLoading(false);
  }

  const filteredPannes = useMemo(() => {
    if (!filter.trim()) return pannes;
    const f = filter.toLowerCase();
    return pannes.filter((p) => {
      const desc = p.panne_types?.description?.toLowerCase() || "";
      const code = p.panne_types?.code?.toLowerCase() || "";
      const comment = p.commentaire?.toLowerCase() || "";
      return desc.includes(f) || code.includes(f) || comment.includes(f) || p.date_panne?.includes(f);
    });
  }, [pannes, filter]);

  async function toggleLink(panne) {
    setToggling(panne.id);
    const isLinked = linkedIds.has(panne.id);
    try {
      if (isLinked) {
        await withRetry(() =>
          supabase.from("work_order_pannes").delete().eq("work_order_id", workOrder.id).eq("panne_id", panne.id)
        );
        setLinkedIds((s) => {
          const next = new Set(s);
          next.delete(panne.id);
          return next;
        });
        logActivity(username, `a délié une panne d'un Work Order (${workOrder.panne_erreur})`);
      } else {
        await withRetry(() =>
          supabase.from("work_order_pannes").insert({ work_order_id: workOrder.id, panne_id: panne.id })
        );
        setLinkedIds((s) => new Set(s).add(panne.id));
        logActivity(username, `a lié une panne à un Work Order (${workOrder.panne_erreur})`);
      }
      onChanged?.();
    } finally {
      setToggling(null);
    }
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
          width: 640,
          maxWidth: "100%",
          maxHeight: "85vh",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
          <div>
            <div style={{ fontSize: "0.72rem", color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Pannes résolues par ce Work Order
            </div>
            <h3 style={{ margin: "2px 0 0", fontSize: "1rem" }}>{workOrder.panne_erreur}</h3>
            <p style={{ margin: "2px 0 0", fontSize: "0.78rem", color: "var(--ink-soft)" }}>
              Registre Pannes — {machineName}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ border: "none", background: "transparent", fontSize: "1.1rem", color: "var(--ink-soft)" }}
          >
            ✕
          </button>
        </div>

        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filtrer par description, code ou date (AAAA-MM-JJ)…"
          style={{ width: "100%", margin: "14px 0" }}
        />

        {loading ? (
          <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem" }}>Chargement…</p>
        ) : filteredPannes.length === 0 ? (
          <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem" }}>Aucune panne trouvée pour cette machine.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {filteredPannes.map((p) => {
              const linked = linkedIds.has(p.id);
              return (
                <label
                  key={p.id}
                  style={{
                    display: "flex",
                    alignItems: "start",
                    gap: 10,
                    padding: "8px 6px",
                    borderRadius: 6,
                    background: linked ? "var(--accent-soft)" : "transparent",
                    cursor: toggling === p.id ? "wait" : "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={linked}
                    disabled={toggling === p.id}
                    onChange={() => toggleLink(p)}
                    style={{ marginTop: 3 }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "0.85rem" }}>
                      <span className="mono" style={{ color: "var(--ink-soft)", marginRight: 8 }}>
                        {formatDate(p.date_panne)} {p.heure_debut?.slice(0, 5)}
                      </span>
                      {p.panne_types?.code && (
                        <span className="code-chip" style={{ background: "var(--accent-soft)", color: "var(--accent-strong)", borderRadius: 4, padding: "1px 6px", fontSize: "0.72rem", fontWeight: 600, marginRight: 6 }}>
                          {p.panne_types.code}
                        </span>
                      )}
                      {p.panne_types?.description || "—"}
                    </div>
                    {p.commentaire && (
                      <div style={{ fontSize: "0.76rem", color: "var(--ink-soft)", marginTop: 2 }}>{p.commentaire}</div>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}