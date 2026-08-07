import { useEffect, useMemo, useRef, useState } from "react";
import { supabase, withRetry } from "./lib/supabaseClient";
import { AccessContext } from "./lib/access";
import PasswordGate from "./components/PasswordGate";
import ChangeMyPasswordModal from "./components/ChangeMyPasswordModal";
import GuideModal from "./components/GuideModal";
import RegistrePannes from "./components/RegistrePannes";
import WorkOrders from "./components/WorkOrders";
import PanneTypesManager from "./components/PanneTypesManager";
import RegistreMateriel from "./components/RegistreMateriel";
import RegistreInterventions from "./components/RegistreInterventions";
import Statistiques from "./components/Statistiques";
import Utilisateurs from "./components/Utilisateurs";
import Logs from "./components/Logs";

const ALL_TABS = [
  { key: "pannes", label: "Registre Pannes" },
  { key: "wo", label: "Work Order" },
  { key: "interventions", label: "Registre des Interventions" },
  { key: "stats", label: "Statistiques" },
  { key: "types", label: "Liste des pannes" },
  { key: "parametrage", label: "Registre du matériel" },
  { key: "utilisateurs", label: "Utilisateurs et centres" },
  { key: "logs", label: "Logs" },
];

// Onglets visibles par rôle. "manipulateur" est l'accès rapide sans mot de
// passe (un bouton par centre sur l'écran d'accès) ; les 3 autres sont des
// rôles de comptes nominatifs.
const TABS_BY_ROLE = {
  manipulateur: ["pannes", "types"],
  visualisation: ["pannes", "wo", "interventions", "stats", "types", "parametrage"],
  physicien: ["pannes", "wo", "interventions", "stats", "types", "parametrage"],
  aide_physicien: ["pannes", "wo", "interventions", "stats", "types", "parametrage"],
  admin: ["pannes", "wo", "interventions", "stats", "types", "parametrage", "utilisateurs", "logs"],
};

// Lien direct type https://votre-site.vercel.app/?vue=registre : accès
// manipulateur sans préciser de centre (on prend le premier disponible).
function urlAsksRestricted() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("vue") === "registre";
}

export default function App() {
  const [centers, setCenters] = useState([]);
  const [centersLoaded, setCentersLoaded] = useState(false);
  const [session, setSession] = useState(null); // { role, lockedCenterId, username }
  const [centerId, setCenterId] = useState(null); // centre actuellement affiché
  const [selectedSystemId, setSelectedSystemId] = useState(null); // machine/équipement sélectionné, partagé entre les onglets
  const [activeTab, setActiveTab] = useState("pannes");
  const [loadError, setLoadError] = useState(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const menuRef = useRef(null);

  // Les centres sont publics à lister (aucune donnée sensible), on les
  // charge avant même la connexion pour afficher les boutons Manipulateur
  // par centre sur l'écran d'accès.
  useEffect(() => {
    let cancelled = false;
    async function loadCenters() {
      try {
        const res = await withRetry(() => supabase.from("centers").select("*").order("name"));
        if (!cancelled) setCenters(res.data ?? []);
      } catch (err) {
        if (!cancelled) setLoadError("Impossible de joindre la base pour le moment. Réessayez.");
      } finally {
        if (!cancelled) setCentersLoaded(true);
      }
    }
    loadCenters();
    return () => {
      cancelled = true;
    };
  }, []);

  // Ferme le menu utilisateur si on clique en dehors.
  useEffect(() => {
    if (!showUserMenu) return;
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showUserMenu]);

  // La machine/équipement sélectionné n'a de sens que pour un centre donné :
  // on la réinitialise dès qu'on change de centre.
  useEffect(() => {
    setSelectedSystemId(null);
  }, [centerId]);

  function handleUnlock({ mode, role, centerId: fixedCenterId, username }) {
    let finalRole = role;
    if (mode === "manipulateur") finalRole = "manipulateur";

    const resolvedCenterId =
      fixedCenterId || (urlAsksRestricted() ? centers[0]?.id : null) || centers[0]?.id || null;

    setSession({
      role: finalRole,
      lockedCenterId: fixedCenterId || null,
      username: username || null,
    });
    setCenterId(resolvedCenterId);
    setActiveTab("pannes");
  }

  function handleLogout() {
    setSession(null);
    setCenterId(null);
    setActiveTab("pannes");
    setShowUserMenu(false);
  }

  const visibleTabs = useMemo(() => {
    if (!session) return [];
    const keys = TABS_BY_ROLE[session.role] || [];
    return ALL_TABS.filter((t) => keys.includes(t.key));
  }, [session]);

  const centerLabel = useMemo(
    () => centers.find((c) => c.id === centerId)?.name ?? "Centre",
    [centers, centerId]
  );

  const readOnly = session?.role === "visualisation";
  const canSwitchCenter = session && !session.lockedCenterId && centers.length > 1;

  if (!centersLoaded) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--ink-soft)" }}>Chargement…</p>
      </div>
    );
  }

  if (!session) {
    return <PasswordGate centers={centers} onUnlock={handleUnlock} />;
  }

  return (
    <AccessContext.Provider value={{ role: session.role, readOnly, username: session.username }}>
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
                Suivi machines
                {session.role === "manipulateur" && " — Manipulateur"}
                {session.role === "visualisation" && " — Visualisation (lecture seule)"}
                {session.username ? ` — ${session.username}` : ""}
              </div>
              {canSwitchCenter ? (
                <select
                  value={centerId || ""}
                  onChange={(e) => setCenterId(e.target.value)}
                  style={{
                    marginTop: 2,
                    background: "transparent",
                    color: "#f2f5f4",
                    border: "none",
                    fontSize: "1.3rem",
                    fontWeight: 700,
                    padding: 0,
                  }}
                >
                  {centers.map((c) => (
                    <option key={c.id} value={c.id} style={{ color: "#111" }}>
                      {c.name}
                    </option>
                  ))}
                </select>
              ) : (
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
              )}
            </div>

            <div ref={menuRef} style={{ position: "relative" }}>
              <button
                onClick={() => setShowUserMenu((s) => !s)}
                style={{
                  border: "1px solid #33424a",
                  background: showUserMenu ? "#1a242b" : "transparent",
                  color: "var(--rail-ink)",
                  borderRadius: 999,
                  padding: "6px 14px",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                👤 {session.username || "Compte"} <span style={{ fontSize: "0.65rem" }}>▾</span>
              </button>
              {showUserMenu && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 6px)",
                    right: 0,
                    background: "var(--surface)",
                    borderRadius: 8,
                    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
                    minWidth: 200,
                    overflow: "hidden",
                    zIndex: 40,
                  }}
                >
                  {session.username && (
                    <button
                      onClick={() => {
                        setShowChangePassword(true);
                        setShowUserMenu(false);
                      }}
                      style={menuItemStyle}
                    >
                      🔒 Changer mon mot de passe
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setShowGuide(true);
                      setShowUserMenu(false);
                    }}
                    style={menuItemStyle}
                  >
                    📖 Mode d'emploi
                  </button>
                  <button onClick={handleLogout} style={{ ...menuItemStyle, color: "var(--status-bad-ink)" }}>
                    🚪 Se déconnecter
                  </button>
                </div>
              )}
            </div>
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
          {centerId && (
            <>
              {activeTab === "pannes" && (
                <RegistrePannes
                  centerId={centerId}
                  selectedSystemId={selectedSystemId}
                  onSelectSystem={setSelectedSystemId}
                />
              )}
              {activeTab === "wo" && (
                <WorkOrders
                  centerId={centerId}
                  selectedSystemId={selectedSystemId}
                  onSelectSystem={setSelectedSystemId}
                />
              )}
              {activeTab === "interventions" && (
                <RegistreInterventions
                  centerId={centerId}
                  selectedSystemId={selectedSystemId}
                  onSelectSystem={setSelectedSystemId}
                />
              )}
              {activeTab === "stats" && (
                <Statistiques
                  centerId={centerId}
                  selectedSystemId={selectedSystemId}
                  onSelectSystem={setSelectedSystemId}
                />
              )}
              {activeTab === "types" && <PanneTypesManager />}
              {activeTab === "parametrage" && (
                <RegistreMateriel centerId={centerId} centers={centers} onCentersChanged={setCenters} />
              )}
              {activeTab === "utilisateurs" && (
                <Utilisateurs centers={centers} onCentersChanged={setCenters} />
              )}
              {activeTab === "logs" && <Logs />}
            </>
          )}
        </main>
      </div>

      {showChangePassword && session.username && (
        <ChangeMyPasswordModal username={session.username} onClose={() => setShowChangePassword(false)} />
      )}
      {showGuide && <GuideModal onClose={() => setShowGuide(false)} />}
    </AccessContext.Provider>
  );
}

const menuItemStyle = {
  display: "block",
  width: "100%",
  textAlign: "left",
  border: "none",
  background: "transparent",
  padding: "10px 14px",
  fontSize: "0.82rem",
  fontWeight: 600,
  color: "var(--ink)",
  cursor: "pointer",
};