import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { getCouleurs, createCouleur, editCouleur, removeCouleur } from "@/lib/couleurs.functions";

type Couleur = { id: string; name: string; code: string | null };

export function CouleursSettings() {
  const fetchAll = useServerFn(getCouleurs);
  const add = useServerFn(createCouleur);
  const edit = useServerFn(editCouleur);
  const del = useServerFn(removeCouleur);

  const [rows, setRows] = useState<Couleur[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAll({ data: undefined });
      setRows(res.couleurs as Couleur[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [fetchAll]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const flash = (m: string) => {
    setMsg(m);
    setErr(null);
    setTimeout(() => setMsg(null), 2000);
  };

  const onAdd = async () => {
    if (!newName.trim()) return;
    try {
      await add({ data: { name: newName, code: newCode || null } });
      setNewName("");
      setNewCode("");
      await reload();
      flash("Couleur ajoutée");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    }
  };

  const onSave = async (row: Couleur) => {
    try {
      await edit({ data: { id: row.id, name: row.name, code: row.code || null } });
      flash("Couleur enregistrée");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    }
  };

  const onDelete = async (row: Couleur) => {
    try {
      await del({ data: { id: row.id } });
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      flash("Couleur supprimée");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    }
  };

  const filtered = rows.filter((r) => {
    const t = `${r.name} ${r.code ?? ""}`.toLowerCase();
    return t.includes(q.toLowerCase());
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Couleurs</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Liste officielle des couleurs et de leurs codes. C'est la seule source utilisée pour la
          colonne Couleur des Cadres Aluminium : une couleur absente de cette liste ne sera jamais
          inscrite.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h3 className="font-semibold">Ajouter une couleur</h3>
        <div className="flex flex-wrap gap-2">
          <input
            placeholder="Nom (ex. Brun Commercial)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1 min-w-[220px] rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <input
            placeholder="Code (ex. P-562)"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            className="w-40 rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <button
            onClick={onAdd}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Ajouter
          </button>
        </div>
      </div>

      {msg && <p className="text-sm text-primary">{msg}</p>}
      {err && <p className="text-sm text-destructive">{err}</p>}

      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">
            Liste ({filtered.length}
            {q ? ` / ${rows.length}` : ""})
          </h3>
          <input
            placeholder="Rechercher…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-56 rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        {loading ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto divide-y divide-border">
            {filtered.map((row) => (
              <div key={row.id} className="flex flex-wrap items-center gap-2 py-2">
                <input
                  value={row.name}
                  onChange={(e) =>
                    setRows((prev) =>
                      prev.map((r) => (r.id === row.id ? { ...r, name: e.target.value } : r)),
                    )
                  }
                  className="flex-1 min-w-[220px] rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                />
                <input
                  value={row.code ?? ""}
                  placeholder="—"
                  onChange={(e) =>
                    setRows((prev) =>
                      prev.map((r) => (r.id === row.id ? { ...r, code: e.target.value } : r)),
                    )
                  }
                  className="w-36 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                />
                <button
                  onClick={() => onSave(row)}
                  title="Enregistrer"
                  className="rounded-md border border-border p-2 hover:bg-accent"
                >
                  <Save className="h-4 w-4" />
                </button>
                <button
                  onClick={() => onDelete(row)}
                  title="Supprimer"
                  className="rounded-md border border-border p-2 text-destructive hover:bg-accent"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="py-6 text-sm text-muted-foreground text-center">Aucune couleur.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
