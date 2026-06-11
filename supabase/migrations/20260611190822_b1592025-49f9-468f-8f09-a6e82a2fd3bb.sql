CREATE TABLE public.admin_sessions (
  token text PRIMARY KEY,
  username text NOT NULL,
  role text NOT NULL CHECK (role IN ('super_admin', 'admin')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.admin_sessions TO service_role;