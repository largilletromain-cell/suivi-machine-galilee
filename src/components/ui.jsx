import { useState } from "react";

const GROUP_LABELS = {
  machine: "Machines",
  logiciel: "Logiciels",
  materiel_mesure: "Matériel de mesure",
  fantome: "Fantômes",
  equipement: "Équipements",
};

export function SubTabs({ items, activeKey, onChange }) {
  const [collapsed, setCollapsed] = useState(
    () => new Set(["logiciel", "materiel_mesure", "fantome", "equipement"])
  );

  // Regroupe les items en conservant l'ordre d'apparition (déjà trié par
  // l'appelant, machines en premier). Le groupe "machine" reste toujours
  // visible ; les autres groupes sont repliables, y compris quand l'onglet
  // actif s'y trouve (replier ne change pas l'onglet affiché, juste sa
  // visibilité dans la barre).
  const groups = [];
  for (const it of items) {
    const g = it.group || "machine";
    let group = groups.find((x) => x.key === g);
    if (!group) {
      group = { key: g, label: GROUP_LABELS[g] || g, items: [] };
      groups.push(group);
    }
    group.items.push(it);
  }

  function toggleGroup(g) {
    setCollapsed((s) => {
      const next = new Set(s);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  }

  return (
    <div style={{ marginBottom: 18, borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {groups.map((group, gi) => {
          const canCollapse = group.key !== "machine";
          const isCollapsed = canCollapse && collapsed.has(group.key);
          const hasActive = group.items.some((it) => it.key === activeKey);
          return (
            <div key={group.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {gi > 0 && <span style={{ width: 1, height: 20, background: "var(--border)" }} />}
              {canCollapse && (
                <button
                  onClick={() => toggleGroup(group.key)}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: hasActive ? "var(--accent-strong)" : "var(--ink-soft)",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    padding: "4px 2px",
                    whiteSpace: "nowrap",
                  }}
                  title={isCollapsed ? `Afficher ${group.label}` : `Réduire ${group.label}`}
                >
                  {isCollapsed ? "▸" : "▾"} {group.label}
                  {isCollapsed && hasActive ? " •" : ""}
                </button>
              )}
              {(!canCollapse || !isCollapsed) &&
                group.items.map((it) => {
                  const active = it.key === activeKey;
                  return (
                    <button
                      key={it.key}
                      onClick={() => onChange(it.key)}
                      className={active ? "mono" : ""}
                      style={{
                        border: "1px solid " + (active ? "var(--accent)" : "var(--border)"),
                        background: active ? "var(--accent)" : "var(--surface)",
                        color: active ? "#fff" : "var(--ink)",
                        borderRadius: 999,
                        padding: "6px 14px",
                        fontSize: "0.82rem",
                        fontWeight: 600,
                      }}
                    >
                      {it.label}
                    </button>
                  );
                })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const STATUS_STYLES = {
  resolu: { bg: "var(--status-ok-bg)", ink: "var(--status-ok-ink)", label: "Résolu" },
  non_resolu: { bg: "var(--status-bad-bg)", ink: "var(--status-bad-ink)", label: "Non résolu" },
  en_surveillance: { bg: "var(--status-warn-bg)", ink: "var(--status-warn-ink)", label: "En surveillance" },
  ouvert: { bg: "var(--status-bad-bg)", ink: "var(--status-bad-ink)", label: "Ouvert" },
  ferme: { bg: "var(--status-ok-bg)", ink: "var(--status-ok-ink)", label: "Fermé" },
};

export function StatusBadge({ value }) {
  const s = STATUS_STYLES[value] ?? { bg: "#eee", ink: "#555", label: value };
  return (
    <span
      style={{
        background: s.bg,
        color: s.ink,
        borderRadius: 999,
        padding: "3px 10px",
        fontSize: "0.75rem",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {s.label}
    </span>
  );
}

// Couleurs appliquées directement aux <select> de statut dans Work Order,
// pour un repérage visuel immédiat (rouge = à traiter, orange = à surveiller,
// vert = clos), sans dépendre d'un badge séparé.
const SELECT_COLOR_MAP = {
  statut: {
    non_resolu: { bg: "var(--status-bad-bg)", ink: "var(--status-bad-ink)" },
    en_surveillance: { bg: "var(--status-warn-bg)", ink: "var(--status-warn-ink)" },
    resolu: { bg: "var(--status-ok-bg)", ink: "var(--status-ok-ink)" },
  },
  statut_wo: {
    ouvert: { bg: "var(--status-bad-bg)", ink: "var(--status-bad-ink)" },
    ferme: { bg: "var(--status-ok-bg)", ink: "var(--status-ok-ink)" },
  },
  rapport_recu: {
    non: { bg: "var(--status-bad-bg)", ink: "var(--status-bad-ink)" },
    oui: { bg: "var(--status-ok-bg)", ink: "var(--status-ok-ink)" },
  },
};

export function statusSelectStyle(field, value) {
  const c = SELECT_COLOR_MAP[field]?.[value];
  if (!c) return {};
  return {
    backgroundColor: c.bg,
    color: c.ink,
    fontWeight: 600,
    borderColor: c.ink,
  };
}

export function IconButton({ title, onClick, children, danger }) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        border: "1px solid " + (danger ? "var(--status-bad-ink)" : "var(--border)"),
        background: "var(--surface)",
        color: danger ? "var(--status-bad-ink)" : "var(--ink-soft)",
        borderRadius: 6,
        width: 28,
        height: 28,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "0.9rem",
        lineHeight: 1,
      }}
    >
      {children}
    </button>
  );
}

export function Panel({ children }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: 18,
        overflowX: "auto",
      }}
    >
      {children}
    </div>
  );
}