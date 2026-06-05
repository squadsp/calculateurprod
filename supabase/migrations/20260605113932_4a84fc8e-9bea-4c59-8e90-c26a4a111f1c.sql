CREATE TABLE public.app_users (
  username text PRIMARY KEY,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('super_admin','admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.app_users TO service_role;

ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

-- No public policies: all access goes through server functions using the service role.

INSERT INTO public.app_users (username, password_hash, role)
VALUES ('samuelp', '$2b$10$oD7rgYTuhv8IqQeMPHTmSOKuvbRgvI.vlCRN8.mvVif9cSmQ1DQ/q', 'super_admin')
ON CONFLICT (username) DO NOTHING;