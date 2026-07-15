import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type MachinageRow = {
  id: string;
  sequence: string;
  date: string;
  machinage: string;
};

const SourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(255),
  base64: z.string().min(1),
});

const RequestSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sources: z.array(SourceSchema).min(1),
});

export const processMachinageSources = createServerFn({ method: "POST" })
  .inputValidator((data) => RequestSchema.parse(data))
  .handler(async ({ data }) => {
    const { extractMachinageRows, buildMachinagePdf, bytesToBase64 } = await import("@/lib/machinage.server");

    const results = await Promise.all(data.sources.map(async (source) => {
      const rows = extractMachinageRows(source.base64, data.date);
      const pdf = await buildMachinagePdf(rows, data.date);

      return {
        id: source.id,
        name: source.name,
        count: rows.length,
        rows,
        pdfBase64: bytesToBase64(pdf),
      };
    }));

    return { results };
  });
