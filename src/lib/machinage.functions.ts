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
    const { extractMachinageRows, buildMachinagePdf } = await import("@/lib/machinage.server");

    const target = new Date(`${data.date}T00:00:00`);

    const results = await Promise.all(data.sources.map(async (source) => {
      const bin = Buffer.from(source.base64, "base64");
      const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer;
      const rows = extractMachinageRows(ab, target);
      const pdf = await buildMachinagePdf(rows, target);

      return {
        id: source.id,
        name: source.name,
        count: rows.length,
        rows,
        pdfBase64: Buffer.from(pdf).toString("base64"),
      };
    }));

    return { results };
  });
