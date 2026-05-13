import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const DelaysSchema = z.object({
  trappe: z.string().max(120),
  mab: z.string().max(120),
  coulissant_pvc: z.string().max(120),
  vf: z.string().max(120).optional(),
  peinture: z.string().max(120),
});

export const saveDelays = createServerFn({ method: "POST" })
  .inputValidator((d) => DelaysSchema.parse(d))
  .handler(async ({ data }) => {
    const payload = { ...data, updated_at: new Date().toISOString() };
    const { error } = await supabaseAdmin
      .from("formula_settings")
      .update({ delays: payload, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });