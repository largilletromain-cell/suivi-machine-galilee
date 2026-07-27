export function SubTabs({ items, activeKey, onChange }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        flexWrap: "wrap",
        marginBottom: 18,
        borderBottom: "1px solid var(--border)",
        paddingBottom: 10,
      }}
    >
      {items.map((it) => {
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