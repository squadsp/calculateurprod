ALTER TABLE public.formula_settings
ADD COLUMN IF NOT EXISTS delays jsonb NOT NULL DEFAULT '{"trappe":"","mab":"","coulissant_pvc":"","peinture":"","updated_at":""}'::jsonb;