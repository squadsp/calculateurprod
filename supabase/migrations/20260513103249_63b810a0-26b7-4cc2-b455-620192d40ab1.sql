
CREATE TABLE public.formula_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  trappe_components JSONB NOT NULL DEFAULT '[]'::jsonb,
  mab_components JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT singleton CHECK (id = 1)
);

ALTER TABLE public.formula_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read settings"
  ON public.formula_settings FOR SELECT
  USING (true);

-- Writes go only through server function with service role; no public write policy.

INSERT INTO public.formula_settings (id, trappe_components, mab_components) VALUES (
  1,
  '[{"field":"battant_lamine","multiplier":1.2},{"field":"battant_pvc","multiplier":1}]'::jsonb,
  '[{"field":"battant_alpvcal","multiplier":1.5},{"field":"battant_hyb","multiplier":1},{"field":"coulissant_hyb","multiplier":1}]'::jsonb
);
