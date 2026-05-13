import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ADMIN_USER = "samuelp";
const ADMIN_PASS = "samuelp";

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
  username: z.string().max(100),
  password: z.string().max(200),
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
});

export const saveSettings = createServerFn({ method: "POST" })
  .inputValidator((d) => SaveSchema.parse(d))
  .handler(async ({ data }) => {
    if (data.username !== ADMIN_USER || data.password !== ADMIN_PASS) {
      throw new Error("Identifiants invalides");
    }
    const { error } = await supabaseAdmin
      .from("formula_settings")
      .update({
        trappe_components: data.trappe_components,
        mab_components: data.mab_components,
        vf_components: data.vf_components,
        thresholds: data.thresholds,
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
    if (data.username !== ADMIN_USER || data.password !== ADMIN_PASS) {
      throw new Error("Identifiants invalides");
    }
    return { ok: true };
  });