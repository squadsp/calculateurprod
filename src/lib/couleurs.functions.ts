import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const AuthSchema = z.object({
  username: z.string().max(100).optional(),
  password: z.string().max(200).optional(),
});

const CouleurSchema = AuthSchema.extend({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().max(40).nullable().optional(),
});

async function requireCouleurAccess(data: { username?: string; password?: string }) {
  const { resolveAdmin } = await import("@/lib/auth.server");
  const admin = await resolveAdmin(data);
  const allowed = ["super_admin", "admin", "couleur_admin"];
  if (!allowed.includes(admin.role)) throw new Error("Accès refusé");
  return admin;
}

export const getCouleurs = createServerFn({ method: "GET" }).handler(async () => {
  const { listCouleurs } = await import("@/lib/couleurs.server");
  return { couleurs: await listCouleurs() };
});

export const createCouleur = createServerFn({ method: "POST" })
  .inputValidator((d) => CouleurSchema.parse(d))
  .handler(async ({ data }) => {
    await requireCouleurAccess(data);
    const { addCouleur } = await import("@/lib/couleurs.server");
    await addCouleur(data.name, data.code ?? null);
    return { ok: true };
  });

export const editCouleur = createServerFn({ method: "POST" })
  .inputValidator((d) => CouleurSchema.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await requireCouleurAccess(data);
    const { updateCouleur } = await import("@/lib/couleurs.server");
    await updateCouleur(data.id, data.name, data.code ?? null);
    return { ok: true };
  });

export const removeCouleur = createServerFn({ method: "POST" })
  .inputValidator((d) => AuthSchema.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await requireCouleurAccess(data);
    const { deleteCouleur } = await import("@/lib/couleurs.server");
    await deleteCouleur(data.id);
    return { ok: true };
  });
