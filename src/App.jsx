import { useEffect, useMemo, useState } from "react";
import { supabase, withRetry, CENTER_CODE } from "./lib/supabaseClient";
import PasswordGate from "./components/PasswordGate";
import RegistrePannes from "./components/RegistrePannes";
import WorkOrders from "./components/WorkOrders";
import PanneTypesManager from "./components/PanneTypesManager";

const TOP_TABS = [
  { key: "pannes", label: "Registre Pannes" },
  { key: "wo", label: "Work Order" },
  { key: "types", label: "Liste des pannes" },
];

// Accès restreint : une URL du type https://votre-site.vercel.app/?vue=registre
// saute l'écran de mot de passe et n'affiche que l'onglet Registre Pannes, sans
// possibilité de naviguer ailleurs. Pratique pour partager un lien à des
// personnes qui n'ont besoin que de déclarer des pannes.
function isRestrictedView() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("vue") === "registre";
}

export default function App() {
  const restricted = useMemo(() => isRestrictedView(), []);
  const [unlocked, setUnlocked] = useState(
    () => restricted || sessionStorage.getItem("md_unlocked") === "1"
  );
  const [activeTab, setActiveTab] = useState(restricted ? "pannes" : "pannes");
  const [center, setCenter] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;

    async function loadCenter() {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await withRetry(() =>
          supabase.from("centers").select("*").eq("code", CENTER_CODE).single()
        );
        if (!cancelled) setCenter(res.data);
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            "Impossible de joindre la base (Supabase se réveille peut-être encore). " +
              "Réessayez dans quelques secondes."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadCenter();
    return () => {
      cancelled = true;
    };
  }, [unlocked]);

  const centerLabel = useMemo(() => center?.name ?? "Centre Galilée", [center]);

  if (!unlocked) {
    return (
      <PasswordGate
        onUnlock={() => {
          sessionStorage.setItem("md_unlocked", "1");
          setUnlocked(true);
        }}
      />
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          background: "var(--rail)",
          color: "var(--rail-ink)",
          padding: "18px 28px 0",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 16,
          }}
        >
          <div>
            <div
              style={{
                fontSize: "0.7rem",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "#7f9298",
                fontWeight: 600,
              }}
            >
              Suivi machines{restricted ? " — Registre Pannes" : ""}
            </div>
            <h1
              style={{
                margin: "2px 0 0",
                fontSize: "1.3rem",
                fontWeight: 700,
                color: "#f2f5f4",
              }}
            >
              {centerLabel}
            </h1>
          </div>
        </div>
        {!restricted && (
          <nav style={{ display: "flex", gap: 4 }}>
            {TOP_TABS.map((t) => {
              const active = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  style={{
                    border: "none",
                    background: active ? "var(--paper)" : "transparent",
                    color: active ? "var(--ink)" : "var(--rail-ink)",
                    padding: "10px 18px",
                    fontSize: "0.88rem",
                    fontWeight: 600,
                    borderRadius: "8px 8px 0 0",
                    transition: "background 0.15s ease",
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </nav>
        )}
        {restricted && <div style={{ height: 18 }} />}
      </header>

      <main
        style={{
          flex: 1,
          background: "var(--paper)",
          padding: "24px 28px 48px",
        }}
      >
        {loading && <p style={{ color: "var(--ink-soft)" }}>Chargement…</p>}
        {loadError && (
          <div
            style={{
              background: "var(--status-bad-bg)",
              color: "var(--status-bad-ink)",
              border: "1px solid var(--status-bad-ink)",
              borderRadius: 8,
              padding: "12px 16px",
              marginBottom: 16,
              fontSize: "0.88rem",
            }}
          >
            {loadError}
          </div>
        )}
        {!loading && center && (
          <>
            {restricted && <RegistrePannes centerId={center.id} />}
            {!restricted && activeTab === "pannes" && <RegistrePannes centerId={center.id} />}
            {!restricted && activeTab === "wo" && <WorkOrders centerId={center.id} />}
            {!restricted && activeTab === "types" && <PanneTypesManager />}
          </>
        )}
      </main>
    </div>
  );
}