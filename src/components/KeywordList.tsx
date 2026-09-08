import { useState } from "react";
import { Plus, X } from "lucide-react";

export function KeywordList({
  title,
  description,
  tone,
  items,
  onChange,
}: {
  title: string;
  description: string;
  tone: "primary" | "destructive" | "success";
  items: string[];
  onChange: (v: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const chipClass =
    tone === "destructive"
      ? "bg-destructive/10 text-destructive border-destructive/30"
      : tone === "success"
        ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400"
        : "bg-primary/10 text-primary border-primary/30";

  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (items.includes(v)) {
      setDraft("");
      return;
    }
    onChange([...items, v]);
    setDraft("");
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3">
        <div className="text-base font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
      </div>
      <div className="flex flex-wrap gap-2 mb-3 min-h-[2rem]">
        {items.length === 0 ? (
          <span className="text-xs text-muted-foreground italic">Aucun mot-clé</span>
        ) : (
          items.map((w, i) => (
            <span
              key={`${w}-${i}`}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${chipClass}`}
            >
              <span className="font-mono">{w}</span>
              <button
                onClick={() => onChange(items.filter((_, j) => j !== i))}
                className="hover:opacity-70"
                aria-label={`Retirer ${w}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Ajouter un mot-clé…"
          className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono"
        />
        <button
          onClick={add}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted"
        >
          <Plus className="h-4 w-4" /> Ajouter
        </button>
      </div>
    </div>
  );
}
