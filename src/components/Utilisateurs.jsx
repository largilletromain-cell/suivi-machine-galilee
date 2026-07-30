import { useEffect, useState } from "react";
import { supabase, withRetry, logActivity } from "../lib/supabaseClient";
import { IconButton, Panel } from "./ui";
import { useAccess } from "../lib/access";

const emptyForm = (centerId) => ({
  full_name: "",
  username: "",
  password: "",
  role: "physicien",
  center_id: centerId || "",
});

export default function Utilisateurs({ centers }) {
  const { username: currentUsername } = useAccess();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(() => emptyForm(centers[0]?.id));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await withRetry(() =>
        supabase.from("app_users").select("*, centers(name)").order("username")
      );
      setUsers(res.data ?? []);
    } catch (e) {
      setError("Erreur de chargement des comptes utilisateurs.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!form.full_name.trim() || !form.username.trim() || !form.password.trim()) {
      setError("Le nom, l'identifiant et le mot de passe sont obligatoires.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { error: iError } = await supabase.from("app_users").insert({
        full_name: form.full_name.trim(),
        username: form.username.trim(),
        password: form.password,
        role: form.role,
        center_id: form.center_id || null,
      });
      if (iError) throw iError;
      logActivity(currentUsername, `a créé le compte « ${form.username.trim()} » (${form.role})`);
      setForm(emptyForm(centers[0]?.id));
      setShowAdd(false);
      await load();
    } catch (e) {
      setError("Impossible de créer ce compte (identifiant peut-être déjà utilisé).");
    } finally {
      setSaving(false);
    }
  }

  async function updateField(user, field, value) {
    setUsers((u) => u.map((x) => (x.id === user.id ? { ...x, [field]: value } : x)));
    await withRetry(() => supabase.from("app_users").update({ [field]: value }).eq("id", user.id));
    logActivity(currentUsername, `a modifié le compte « ${user.username} » (champ « ${field} »)`);
    load();
  }

  async function handleDelete(user) {
    if (!window.confirm(`Supprimer le compte « ${user.full_name || user.username} » ?`)) return;
    await withRetry(() => supabase.from("app_users").delete().eq("id", user.id));
    logActivity(currentUsername, `a supprimé le compte « ${user.username} »`);
    setUsers((u) => u.filter((x) => x.id !== user.id));
  }

  return (
    <Panel>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem", marginTop: 0, flex: 1 }}>
          <strong>Admin</strong> a accès à tout, y compris cet onglet.{" "}
          <strong>Physicien</strong> a accès à tout sauf cet onglet.{" "}
          <strong>Visualisation</strong> voit les mêmes informations que Physicien mais sans pouvoir rien
          modifier. Pour n'importe quel rôle, choisissez « Tous les centres » si la personne doit pouvoir
          basculer entre les centres, ou un centre précis si elle doit y rester cantonnée.
        </p>
        <button
          onClick={() => setShowAdd((s) => !s)}
          style={{
            background: showAdd ? "var(--accent-soft)" : "var(--accent)",
            color: showAdd ? "var(--accent-strong)" : "#fff",
            border: "1px solid var(--accent)",
            borderRadius: 999,
            padding: "8px 16px",
            fontSize: "0.82rem",
            fontWeight: 600,
            whiteSpace: "nowrap",
          }}
        >
          + Ajouter un utilisateur
        </button>
      </div>

      {showAdd && (
        <form
          onSubmit={handleCreate}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr 150px 170px auto",
            gap: 8,
            alignItems: "end",
            margin: "16px 0 18px",
            padding: 14,
            background: "var(--paper)",
            borderRadius: 8,
            border: "1px solid var(--border)",
          }}
        >
          <Field label="Nom et prénom">
            <input
              type="text"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              placeholder="ex : Romain Léry"
              style={{ width: "100%" }}
              required
            />
          </Field>
          <Field label="Identifiant">
            <input
              type="text"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              style={{ width: "100%" }}
              required
            />
          </Field>
          <Field label="Mot de passe">
            <input
              type="text"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              style={{ width: "100%" }}
              required
            />
          </Field>
          <Field label="Type de compte">
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              style={{ width: "100%" }}
            >
              <option value="physicien">Physicien</option>
              <option value="visualisation">Visualisation</option>
              <option value="admin">Admin</option>
            </select>
          </Field>
          <Field label="Centre principal">
            <select
              value={form.center_id}
              onChange={(e) => setForm({ ...form, center_id: e.target.value })}
              style={{ width: "100%" }}
            >
              <option value="">Tous les centres</option>
              {centers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <button
            type="submit"
            disabled={saving}
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
            {saving ? "…" : "Créer"}
          </button>
        </form>
      )}
      {error && <p style={{ color: "var(--status-bad-ink)", fontSize: "0.85rem" }}>{error}</p>}

      {loading ? (
        <p style={{ color: "var(--ink-soft)" }}>Chargement…</p>
      ) : users.length === 0 ? (
        <p style={{ color: "var(--ink-soft)" }}>Aucun compte créé pour le moment.</p>
      ) : (
        <table>
          <thead>
            <tr style={{ textAlign: "left", fontSize: "0.75rem", color: "var(--ink-soft)" }}>
              <th style={th}>Nom</th>
              <th style={th}>Identifiant</th>
              <th style={th}>Mot de passe</th>
              <th style={th}>Type de compte</th>
              <th style={th}>Centre principal</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={td}>{u.full_name || "—"}</td>
                <td style={td} className="mono">
                  {u.username}
                </td>
                <td style={td}>
                  <input
                    type="text"
                    defaultValue={u.password}
                    onBlur={(e) => e.target.value && updateField(u, "password", e.target.value)}
                    className="mono"
                    style={{ width: 130 }}
                  />
                </td>
                <td style={td}>
                  <select
                    value={u.role}
                    onChange={(e) => updateField(u, "role", e.target.value)}
                    style={{ fontSize: "0.82rem" }}
                  >
                    <option value="physicien">Physicien</option>
                    <option value="visualisation">Visualisation</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td style={td}>
                  <select
                    value={u.center_id || ""}
                    onChange={(e) => updateField(u, "center_id", e.target.value || null)}
                    style={{ fontSize: "0.82rem" }}
                  >
                    <option value="">Tous les centres</option>
                    {centers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={td}>
                  <IconButton title="Supprimer" danger onClick={() => handleDelete(u)}>
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