ALTER TABLE public.formula_settings
ADD COLUMN IF NOT EXISTS thresholds jsonb NOT NULL DEFAULT '{"trappe":150,"mab":100,"coulissant_pvc":100,"vf":0,"peinture":50}'::jsonb;