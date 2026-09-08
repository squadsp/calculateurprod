CREATE TABLE public.couleurs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.couleurs TO service_role;

ALTER TABLE public.couleurs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny all access" ON public.couleurs FOR ALL USING (false);

CREATE UNIQUE INDEX couleurs_name_code_key
  ON public.couleurs (lower(name), coalesce(upper(code), ''));

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER couleurs_set_updated_at
BEFORE UPDATE ON public.couleurs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();