import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type CadreAluRow = {
  sequence: string;
  id: string;
  sens: string;
  tete: string;
  jambageLargeur: string;
  jambageEpaisseur: string;
  jambageHauteur: string;
  astragale: string;
  couleur: string;
};

const SourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(255),
  base64: z.string().min(1),
});

const RequestSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  sources: z.array(SourceSchema).min(1),
});

export const processCadreAluSources = createServerFn({ method: "POST" })
  .inputValidator((data) => RequestSchema.parse(data))
  .handler(async ({ data }) => {
    const { extractCadreAluRows, buildCadreAluPdf } = await import("@/lib/cadresAlu.server");

    const target = data.date ? new Date(`${data.date}T00:00:00`) : null;

    const results = await Promise.all(
      data.sources.map(async (source) => {
        const bin = Buffer.from(source.base64, "base64");
        const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer;
        const rows = extractCadreAluRows(ab, target);
        const pdf = await buildCadreAluPdf(rows, target);

        return {
          id: source.id,
          name: source.name,
          count: rows.length,
          rows,
          pdfBase64: Buffer.from(pdf).toString("base64"),
        };
      }),
    );

    return { results };
  });
