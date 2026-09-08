import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { COULEURS_REF } from "@/lib/couleursRef";

export type CouleurRow = { id: string; name: string; code: string | null };

/** Codes officiels ajoutés à la liste de base (en plus du fichier source). */
const EXTRA_COULEURS: Array<{ name: string; code: string }> = [
  { name: "Noir", code: "P-525" },
  { name: "Brun Commercial", code: "P-562" },
];

function seedList(): Array<{ name: string; code: string | null }> {
  const seen = new Set<string>();
  const out: Array<{ name: string; code: string | null }> = [];
  const push = (name: string, code: string | null) => {
    const n = (name || "").trim();
    if (!n) return;
    const c = (code || "").trim() || null;
    const key = `${n.toLowerCase()}|${(c ?? "").toUpperCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name: n, code: c });
  };
  for (const ref of COULEURS_REF) push(ref.name, ref.code ?? null);
  for (const extra of EXTRA_COULEURS) push(extra.name, extra.code);
  return out;
}

/** Remplit la liste avec les couleurs du fichier source si elle est vide. */
export async function ensureCouleursSeeded(): Promise<void> {
  const { count, error } = await supabaseAdmin
    .from("couleurs")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  if ((count ?? 0) > 0) return;

  const rows = seedList();
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error: insErr } = await supabaseAdmin.from("couleurs").insert(chunk);
    if (insErr && insErr.code !== "23505") throw new Error(insErr.message);
  }
}

export async function listCouleurs(): Promise<CouleurRow[]> {
  await ensureCouleursSeeded();
  const { data, error } = await supabaseAdmin
    .from("couleurs")
    .select("id, name, code")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CouleurRow[];
}

export async function addCouleur(name: string, code: string | null): Promise<void> {
  const { error } = await supabaseAdmin
    .from("couleurs")
    .insert({ name: name.trim(), code: code?.trim() || null });
  if (error) {
    if (error.code === "23505") throw new Error("Cette couleur existe déjà");
    throw new Error(error.message);
  }
}

export async function updateCouleur(id: string, name: string, code: string | null): Promise<void> {
  const { error } = await supabaseAdmin
    .from("couleurs")
    .update({ name: name.trim(), code: code?.trim() || null })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") throw new Error("Cette couleur existe déjà");
    throw new Error(error.message);
  }
}

export async function deleteCouleur(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("couleurs").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
