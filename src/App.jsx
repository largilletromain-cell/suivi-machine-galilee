import { useEffect, useMemo, useState } from "react";
import { supabase, withRetry, CENTER_CODE } from "./lib/supabaseClient";
import PasswordGate from "./components/PasswordGate";
import ChangePasswordModal from "./components/ChangePasswordModal";
import RegistrePannes from "./components/RegistrePannes";
import WorkOrders from "./components/WorkOrders";
import PanneTypesManager from "./components/PanneTypesManager";
import Parametrage from "./components/Parametrage";
import RegistreInterventions from "./components/RegistreInterventions";

const TOP_TABS = [
  { key: "pannes", label: "Registre Pannes" },
  { key: "wo", label: "Work Order" },
  { key: "interventions", label: "Registre des Interventions" },
  { key: "types", label: "Liste des pannes" },
  { key: "parametrage", label: "Paramétrage" },
];

// L'accès "manipulateur" (sans mot de passe) donne accès au Registre Pannes et
// à la Liste des pannes, mais pas à Work Order, Registre des Interventions ni
// Paramétrage.
const MANIPULATEUR_TABS = TOP_TABS.filter(
  (t) => t.key !== "wo" && t.key !== "parametrage" && t.key !== "interventions"
);

// Deux façons d'obtenir un accès "manipulateur" : le bouton dédié sur l'écran
// d'accès, ou un lien direct du type https://votre-site.vercel.app/?vue=registre
function urlAsksRestricted() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("vue") === "registre";
}

export default function App() {
  const [accessMode, setAccessMode] = useState(() => {
    if (urlAsksRestricted()) return "manipulateur";
    return sessionStorage.getItem("md_access") || null;
  });
  const restricted = accessMode === "manipulateur";
  const [activeTab, setActiveTab] = useState("pannes");
  const [center, setCenter] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showChangePassword, setShowChangePassword] = useState(false);

  useEffect(() => {
    if (!accessMode) return;
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
  }, [accessMode]);

  const centerLabel = useMemo(() => center?.name ?? "Centre Galilée", [center]);
  const visibleTabs = restricted ? MANIPULATEUR_TABS : TOP_TABS;

  if (!accessMode) {
    return (
      <PasswordGate
        onUnlock={(mode) => {
          sessionStorage.setItem("md_access", mode);
          setAccessMode(mode);
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
              Suivi machines{restricted ? " — Manipulateur" : ""}
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
          {!restricted && (
            <button
              onClick={() => setShowChangePassword(true)}
              style={{
                border: "1px solid #33424a",
                background: "transparent",
                color: "var(--rail-ink)",
                borderRadius: 999,
                padding: "6px 14px",
                fontSize: "0.75rem",
                whiteSpace: "nowrap",
              }}
            >
              🔒 Changer le mot de passe
            </button>
          )}
        </div>
        <nav style={{ display: "flex", gap: 4 }}>
          {visibleTabs.map((t) => {
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
            {activeTab === "pannes" && <RegistrePannes centerId={center.id} />}
            {!restricted && activeTab === "wo" && <WorkOrders centerId={center.id} />}
            {!restricted && activeTab === "interventions" && (
              <RegistreInterventions centerId={center.id} />
            )}
            {activeTab === "types" && <PanneTypesManager />}
            {!restricted && activeTab === "parametrage" && <Parametrage centerId={center.id} />}
          </>
        )}
      </main>

      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
    </div>
  );
}