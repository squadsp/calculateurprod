import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  changeUserPassword,
  createUser,
  deleteUser,
  listUsers,
  saveSettings,
  verifyAdmin,
} from "@/lib/settings.functions";
import {
  ALL_FIELDS,
  DEFAULT_SETTINGS,
  DEFAULT_THRESHOLDS,
  DEFAULT_THRESHOLD_LABELS,
  DEFAULT_DELAY_SETTINGS,
  FIELD_LABELS,
  type Component,
  type DelaySettings,
  type FieldKey,
  type Settings,
  type Thresholds,
  type ThresholdLabels,
} from "@/lib/columns";
import { ArrowLeft, GripVertical, KeyRound, Loader2, LogOut, Save, Trash2, UserPlus } from "lucide-react";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

const ADMIN_KEY = "trappemab_admin";
const ADMIN_USER_KEY = "trappemab_admin_user";
const ADMIN_PASS_KEY = "trappemab_admin_pass";
const ADMIN_ROLE_KEY = "trappemab_admin_role";

type Role = "super_admin" | "admin";

function getCreds(): { username: string; password: string; role: Role } | null {
  if (typeof window === "undefined") return null;
  const username = sessionStorage.getItem(ADMIN_USER_KEY);
  const password = sessionStorage.getItem(ADMIN_PASS_KEY);
  const role = sessionStorage.getItem(ADMIN_ROLE_KEY) as Role | null;
  if (!username || !password || !role) return null;
  return { username, password, role };
}

function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem(ADMIN_KEY) === "1") {
      setAuthed(true);
      const r = sessionStorage.getItem(ADMIN_ROLE_KEY) as Role | null;
      if (r) setRole(r);
    }
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Retour
          </Link>
          <h1 className="text-lg font-semibold">Paramètres administrateur</h1>
          {authed ? (
            <button
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              onClick={() => {
                sessionStorage.removeItem(ADMIN_KEY);
                sessionStorage.removeItem(ADMIN_USER_KEY);
                sessionStorage.removeItem(ADMIN_PASS_KEY);
                sessionStorage.removeItem(ADMIN_ROLE_KEY);
                setAuthed(false);
                setRole(null);
              }}
            >
              <LogOut className="h-4 w-4" /> Déconnexion
            </button>
          ) : (
            <span className="w-16" />
          )}
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-10">
        {authed ? (
          <div className="space-y-12">
            <SettingsEditor />
            {role === "super_admin" && <UsersManager />}
          </div>
        ) : (
          <LoginForm
            onSuccess={(r) => {
              setAuthed(true);
              setRole(r);
            }}
          />
        )}
      </main>
    </div>
  );
}

function LoginForm({ onSuccess }: { onSuccess: (role: Role) => void }) {
  const verify = useServerFn(verifyAdmin);
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="max-w-sm mx-auto space-y-4 mt-12 rounded-xl border border-border bg-card p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        setBusy(true);
        try {
          const res = await verify({ data: { username: u, password: p } });
          sessionStorage.setItem(ADMIN_KEY, "1");
          sessionStorage.setItem(ADMIN_USER_KEY, u);
          sessionStorage.setItem(ADMIN_PASS_KEY, p);
          sessionStorage.setItem(ADMIN_ROLE_KEY, res.role);
          onSuccess(res.role);
        } catch (e2) {
          setErr(e2 instanceof Error ? e2.message : "Erreur");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="text-lg font-semibold">Connexion administrateur</h2>
      <div>
        <label className="text-sm text-muted-foreground">Utilisateur</label>
        <input
          autoFocus
          value={u}
          onChange={(e) => setU(e.target.value)}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="text-sm text-muted-foreground">Mot de passe</label>
        <input
          type="password"
          value={p}
          onChange={(e) => setP(e.target.value)}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      {err && <p className="text-sm text-destructive">{err}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-primary text-primary-foreground py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-2"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        Se connecter
      </button>
    </form>
  );
}

function SettingsEditor() {
  const save = useServerFn(saveSettings);
  const [loaded, setLoaded] = useState(false);
  const [trappe, setTrappe] = useState<Component[]>(DEFAULT_SETTINGS.trappe_components);
  const [mab, setMab] = useState<Component[]>(DEFAULT_SETTINGS.mab_components);
  const [vf, setVf] = useState<Component[]>(DEFAULT_SETTINGS.vf_components);
  const [thresholds, setThresholds] = useState<Thresholds>(DEFAULT_THRESHOLDS);
  const [labels, setLabels] = useState<ThresholdLabels>(DEFAULT_THRESHOLD_LABELS);
  const [delaySettings, setDelaySettings] = useState<DelaySettings>(DEFAULT_DELAY_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("formula_settings").select("*").eq("id", 1).maybeSingle();
      if (data) {
        setTrappe((data.trappe_components as Component[]) ?? DEFAULT_SETTINGS.trappe_components);
        setMab((data.mab_components as Component[]) ?? DEFAULT_SETTINGS.mab_components);
        setVf((data.vf_components as unknown as Component[]) ?? DEFAULT_SETTINGS.vf_components);
        setThresholds({
          ...DEFAULT_THRESHOLDS,
          ...((data as { thresholds?: Partial<Thresholds> }).thresholds ?? {}),
        });
        setLabels({
          ...DEFAULT_THRESHOLD_LABELS,
          ...((data as { threshold_labels?: Partial<ThresholdLabels> }).threshold_labels ?? {}),
        });
        setDelaySettings({
          ...DEFAULT_DELAY_SETTINGS,
          ...((data as { delay_settings?: Partial<DelaySettings> }).delay_settings ?? {}),
        });
      }
      setLoaded(true);
    })();
  }, []);

  const onDropTo = (target: "trappe" | "mab" | "vf") => (e: React.DragEvent) => {
    e.preventDefault();
    const field = e.dataTransfer.getData("text/field") as FieldKey;
    if (!field) return;
    const setter = target === "trappe" ? setTrappe : target === "mab" ? setMab : setVf;
    setter((prev) => {
      if (prev.some((c) => c.field === field)) return prev;
      return [...prev, { field, multiplier: 1 }];
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const creds = getCreds();
      if (!creds) throw new Error("Session expirée, reconnectez-vous");
      await save({
        data: {
          username: creds.username,
          password: creds.password,
          trappe_components: trappe,
          mab_components: mab,
          vf_components: vf,
          thresholds,
          threshold_labels: labels,
          delay_settings: delaySettings,
        },
      });
      setMsg("Paramètres enregistrés");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold">Constructeur de formules</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Glissez les colonnes sources dans la boîte Trappe, MAB ou VF, puis ajustez le multiplicateur.
        </p>
      </div>

      <div>
        <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground mb-3">
          Colonnes sources
        </h3>
        <div className="flex flex-wrap gap-2">
          {ALL_FIELDS.map((f) => (
            <div
              key={f}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("text/field", f)}
              className="cursor-grab active:cursor-grabbing select-none inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm hover:border-primary"
            >
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
              {FIELD_LABELS[f]}
            </div>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <FormulaBox
          title="Trappe"
          description="Valeur calculée pour la colonne Trappe (Battant)"
          components={trappe}
          onChange={setTrappe}
          onDrop={onDropTo("trappe")}
        />
        <FormulaBox
          title="MAB"
          description="Valeur calculée pour la colonne MAB (Battant)"
          components={mab}
          onChange={setMab}
          onDrop={onDropTo("mab")}
        />
        <FormulaBox
          title="VF"
          description="Optionnel — laissez vide pour ne pas recalculer la colonne VF"
          components={vf}
          onChange={setVf}
          onDrop={onDropTo("vf")}
        />
      </div>

      <div>
        <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground mb-3">
          Seuils de surlignage (max par jour)
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          Au-dessus du max +10 → rouge. Entre max −9 et max +9 → jaune. Sinon, pas de
          surlignage. Mettre 0 pour désactiver. Si VF est configuré ci-dessus, le seuil VF
          remplace celui de Coulissant PVC pour cette colonne.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          {(["trappe", "mab", "coulissant_pvc", "vf", "peinture"] as const).map((key) => (
            <div key={key} className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
              <input
                type="text"
                value={labels[key]}
                onChange={(e) => setLabels((l) => ({ ...l, [key]: e.target.value }))}
                placeholder={DEFAULT_THRESHOLD_LABELS[key]}
                className="flex-1 rounded border border-input bg-background px-2 py-1 text-sm"
              />
              <input
                type="number"
                min={0}
                step="1"
                value={thresholds[key]}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setThresholds((t) => ({ ...t, [key]: isNaN(v) ? 0 : v }));
                }}
                className="w-24 rounded border border-input bg-background px-2 py-1 text-sm text-right"
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground mb-3">
          Paramètres du calculateur de délais
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          Une semaine est considérée pleine (ignorée) lorsque la production atteint le pourcentage
          ci-dessous de la capacité (max × nombre de jours présents dans la semaine). Le délai
          minimum, l'écart de l'intervalle affiché et le décalage de semaines sont aussi configurables.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2">
            <span className="text-sm">Seuil « semaine pleine » (%)</span>
            <input
              type="number"
              min={0}
              max={100}
              step="1"
              value={Math.round(delaySettings.full_ratio * 100)}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                const pct = isNaN(v) ? 0 : Math.max(0, Math.min(100, v));
                setDelaySettings((s) => ({ ...s, full_ratio: pct / 100 }));
              }}
              className="w-24 rounded border border-input bg-background px-2 py-1 text-sm text-right"
            />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2">
            <span className="text-sm">Délai minimum (semaines)</span>
            <input
              type="number"
              min={0}
              step="1"
              value={delaySettings.min_weeks}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                setDelaySettings((s) => ({ ...s, min_weeks: isNaN(v) ? 0 : v }));
              }}
              className="w-24 rounded border border-input bg-background px-2 py-1 text-sm text-right"
            />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2">
            <span className="text-sm">Écart de l'intervalle (semaines)</span>
            <input
              type="number"
              min={0}
              step="1"
              value={delaySettings.range_span}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                setDelaySettings((s) => ({ ...s, range_span: isNaN(v) ? 0 : v }));
              }}
              className="w-24 rounded border border-input bg-background px-2 py-1 text-sm text-right"
            />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2">
            <span className="text-sm">Décalage de semaines</span>
            <input
              type="number"
              step="1"
              value={delaySettings.week_offset}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                setDelaySettings((s) => ({ ...s, week_offset: isNaN(v) ? 0 : v }));
              }}
              className="w-24 rounded border border-input bg-background px-2 py-1 text-sm text-right"
            />
          </label>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Enregistrer
        </button>
        {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
      </div>
    </div>
  );
}

function FormulaBox({
  title,
  description,
  components,
  onChange,
  onDrop,
}: {
  title: string;
  description: string;
  components: Component[];
  onChange: (c: Component[]) => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className="rounded-xl border-2 border-dashed border-border bg-card p-5 min-h-[260px]"
    >
      <div className="mb-3">
        <div className="text-base font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>

      {components.length === 0 ? (
        <div className="text-sm text-muted-foreground italic py-10 text-center">
          Glissez des colonnes ici…
        </div>
      ) : (
        <div className="space-y-2">
          {components.map((c, i) => (
            <div
              key={c.field}
              className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2"
            >
              <span className="flex-1 text-sm font-medium">{FIELD_LABELS[c.field]}</span>
              <span className="text-xs text-muted-foreground">×</span>
              <input
                type="number"
                step="0.01"
                value={c.multiplier}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  const next = [...components];
                  next[i] = { ...c, multiplier: isNaN(v) ? 0 : v };
                  onChange(next);
                }}
                className="w-20 rounded border border-input bg-background px-2 py-1 text-sm text-right"
              />
              <button
                onClick={() => onChange(components.filter((_, j) => j !== i))}
                className="text-muted-foreground hover:text-destructive p-1"
                aria-label="Retirer"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 text-xs text-muted-foreground">
        Formule:{" "}
        {components.length === 0
          ? "0"
          : components
              .map((c) => `${c.multiplier} × ${FIELD_LABELS[c.field]}`)
              .join(" + ")}
      </div>
    </div>
  );
}

type AppUserRow = { username: string; role: Role; created_at: string };

function UsersManager() {
  const list = useServerFn(listUsers);
  const create = useServerFn(createUser);
  const remove = useServerFn(deleteUser);
  const changePwd = useServerFn(changeUserPassword);

  const [users, setUsers] = useState<AppUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [newU, setNewU] = useState("");
  const [newP, setNewP] = useState("");
  const [newRole, setNewRole] = useState<Role>("admin");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setErr(null);
    const creds = getCreds();
    if (!creds) {
      setErr("Session expirée");
      setLoading(false);
      return;
    }
    try {
      const res = await list({ data: { username: creds.username, password: creds.password } });
      setUsers(res.users as AppUserRow[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    setBusy(true);
    try {
      const creds = getCreds();
      if (!creds) throw new Error("Session expirée");
      await create({
        data: {
          username: creds.username,
          password: creds.password,
          newUsername: newU.trim(),
          newPassword: newP,
          newRole,
        },
      });
      setNewU("");
      setNewP("");
      setNewRole("admin");
      setMsg("Utilisateur créé");
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (username: string) => {
    if (!confirm(`Supprimer l'utilisateur « ${username} » ?`)) return;
    setErr(null);
    setMsg(null);
    try {
      const creds = getCreds();
      if (!creds) throw new Error("Session expirée");
      await remove({
        data: { username: creds.username, password: creds.password, targetUsername: username },
      });
      setMsg("Utilisateur supprimé");
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    }
  };

  const handleResetPwd = async (username: string) => {
    const pwd = prompt(`Nouveau mot de passe pour « ${username} » :`);
    if (!pwd) return;
    if (pwd.length < 4) {
      setErr("Mot de passe trop court (min 4 caractères)");
      return;
    }
    setErr(null);
    setMsg(null);
    try {
      const creds = getCreds();
      if (!creds) throw new Error("Session expirée");
      await changePwd({
        data: {
          username: creds.username,
          password: creds.password,
          targetUsername: username,
          newPassword: pwd,
        },
      });
      setMsg("Mot de passe mis à jour");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    }
  };

  return (
    <section className="space-y-6 border-t border-border pt-10">
      <div>
        <h2 className="text-xl font-semibold">Gestion des utilisateurs</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Créez ou supprimez des comptes administrateurs. Réservé au super administrateur.
        </p>
      </div>

      <form
        onSubmit={handleCreate}
        className="rounded-xl border border-border bg-card p-5 space-y-3"
      >
        <div className="text-sm font-medium">Nouvel utilisateur</div>
        <div className="grid sm:grid-cols-4 gap-3">
          <input
            placeholder="Nom d'utilisateur"
            value={newU}
            onChange={(e) => setNewU(e.target.value)}
            required
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <input
            type="password"
            placeholder="Mot de passe"
            value={newP}
            onChange={(e) => setNewP(e.target.value)}
            required
            minLength={4}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as Role)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="admin">Admin</option>
            <option value="super_admin">Super admin</option>
          </select>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Ajouter
          </button>
        </div>
      </form>

      {(err || msg) && (
        <p className={`text-sm ${err ? "text-destructive" : "text-muted-foreground"}`}>
          {err ?? msg}
        </p>
      )}

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="px-4 py-2 font-medium">Utilisateur</th>
              <th className="px-4 py-2 font-medium">Rôle</th>
              <th className="px-4 py-2 font-medium">Créé le</th>
              <th className="px-4 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin inline" />
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  Aucun utilisateur
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.username} className="border-t border-border">
                  <td className="px-4 py-2 font-medium">{u.username}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${
                        u.role === "super_admin"
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {u.role === "super_admin" ? "Super admin" : "Admin"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString("fr-CA")}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="inline-flex gap-2">
                      <button
                        onClick={() => handleResetPwd(u.username)}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <KeyRound className="h-3.5 w-3.5" /> Mot de passe
                      </button>
                      <button
                        onClick={() => handleDelete(u.username)}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}