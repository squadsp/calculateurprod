import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/integrations/supabase/client.server";


type Role = "super_admin" | "admin";

const ComponentSchema = z.object({
  field: z.enum([
    "battant_pvc",
    "battant_lamine",
    "battant_hyb",
    "battant_alpvcal",
    "coulissant_hyb",
    "coulissant_pvc",
  ]),
  multiplier: z.number().min(-1000).max(1000),
});

const SaveSchema = z.object({
  username: z.string().max(100).optional(),
  password: z.string().max(200).optional(),
  trappe_components: z.array(ComponentSchema).max(20),
  mab_components: z.array(ComponentSchema).max(20),
  vf_components: z.array(ComponentSchema).max(20),
  thresholds: z.object({
    trappe: z.number().min(0).max(100000),
    mab: z.number().min(0).max(100000),
    coulissant_pvc: z.number().min(0).max(100000),
    vf: z.number().min(0).max(100000),
    peinture: z.number().min(0).max(100000),
  }),
  threshold_labels: z.object({
    trappe: z.string().min(1).max(80),
    mab: z.string().min(1).max(80),
    coulissant_pvc: z.string().min(1).max(80),
    vf: z.string().min(1).max(80),
    peinture: z.string().min(1).max(80),
  }),
  delay_settings: z.object({
    full_ratio: z.number().min(0).max(1),
    min_weeks: z.number().int().min(0).max(52),
    range_span: z.number().int().min(0).max(52),
    week_offset: z.number().int().min(-12).max(52),
  }).optional(),
});

export const saveSettings = createServerFn({ method: "POST" })
  .inputValidator((d) => SaveSchema.parse(d))
  .handler(async ({ data }) => {
    const { resolveAdmin } = await import("@/lib/auth.server");
    await resolveAdmin(data);
    const update: Record<string, unknown> = {
      trappe_components: data.trappe_components,
      mab_components: data.mab_components,
      vf_components: data.vf_components,
      thresholds: data.thresholds,
      threshold_labels: data.threshold_labels,
      updated_at: new Date().toISOString(),
    };
    if (data.delay_settings !== undefined) {
      update.delay_settings = data.delay_settings;
    }
    const { error } = await supabaseAdmin
      .from("formula_settings")
      .update(update)
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const SaveDelaySchema = z.object({
  username: z.string().max(100).optional(),
  password: z.string().max(200).optional(),
  delay_settings: z.object({
    full_ratio: z.number().min(0).max(1),
    min_weeks: z.number().int().min(0).max(52),
    range_span: z.number().int().min(0).max(52),
    week_offset: z.number().int().min(-12).max(52),
  }),
});

export const saveDelaySettings = createServerFn({ method: "POST" })
  .inputValidator((d) => SaveDelaySchema.parse(d))
  .handler(async ({ data }) => {
    const { resolveAdmin } = await import("@/lib/auth.server");
    await resolveAdmin(data);
    const { error } = await supabaseAdmin
      .from("formula_settings")
      .update({
        delay_settings: data.delay_settings,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const LoginSchema = z.object({
  username: z.string().max(100),
  password: z.string().max(200),
});

export const verifyAdmin = createServerFn({ method: "POST" })
  .inputValidator((d) => LoginSchema.parse(d))
  .handler(async ({ data }) => {
    const { authenticate } = await import("@/lib/auth.server");
    const role = await authenticate(data.username, data.password);
    return { ok: true, role };
  });

const AdminAuthSchema = z.object({
  username: z.string().max(100).optional(),
  password: z.string().max(200).optional(),
});

export const listUsers = createServerFn({ method: "POST" })
  .inputValidator((d) => AdminAuthSchema.parse(d))
  .handler(async ({ data }) => {
    const { resolveSuperAdmin } = await import("@/lib/auth.server");
    await resolveSuperAdmin(data);
    const { data: rows, error } = await supabaseAdmin
      .from("app_users")
      .select("username, role, created_at")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { users: rows ?? [] };
  });

const CreateUserSchema = AdminAuthSchema.extend({
  newUsername: z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9_.-]+$/, "Nom d'utilisateur invalide"),
  newPassword: z.string().min(4).max(200),
  newRole: z.enum(["super_admin", "admin"]),
});

export const createUser = createServerFn({ method: "POST" })
  .inputValidator((d) => CreateUserSchema.parse(d))
  .handler(async ({ data }) => {
    const { resolveSuperAdmin } = await import("@/lib/auth.server");
    await resolveSuperAdmin(data);
    const hash = await bcrypt.hash(data.newPassword, 10);
    const { error } = await supabaseAdmin.from("app_users").insert({
      username: data.newUsername,
      password_hash: hash,
      role: data.newRole,
    });
    if (error) {
      if (error.code === "23505") throw new Error("Ce nom d'utilisateur existe déjà");
      throw new Error(error.message);
    }
    return { ok: true };
  });

const DeleteUserSchema = AdminAuthSchema.extend({
  targetUsername: z.string().min(1).max(100),
});

export const deleteUser = createServerFn({ method: "POST" })
  .inputValidator((d) => DeleteUserSchema.parse(d))
  .handler(async ({ data }) => {
    const { resolveSuperAdmin } = await import("@/lib/auth.server");
    const admin = await resolveSuperAdmin(data);
    if (data.targetUsername === admin.username) {
      throw new Error("Vous ne pouvez pas vous supprimer vous-même");
    }
    const { error } = await supabaseAdmin
      .from("app_users")
      .delete()
      .eq("username", data.targetUsername);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const ChangePasswordSchema = AdminAuthSchema.extend({
  targetUsername: z.string().min(1).max(100),
  newPassword: z.string().min(4).max(200),
});

export const changeUserPassword = createServerFn({ method: "POST" })
  .inputValidator((d) => ChangePasswordSchema.parse(d))
  .handler(async ({ data }) => {
    const { resolveSuperAdmin } = await import("@/lib/auth.server");
    await resolveSuperAdmin(data);
    const hash = await bcrypt.hash(data.newPassword, 10);
    const { error } = await supabaseAdmin
      .from("app_users")
      .update({ password_hash: hash, updated_at: new Date().toISOString() })
      .eq("username", data.targetUsername);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
