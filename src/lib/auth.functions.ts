import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const LoginSchema = z.object({
  username: z.string().max(100),
  password: z.string().max(200),
});

export const login = createServerFn({ method: "POST" })
  .inputValidator((d) => LoginSchema.parse(d))
  .handler(async ({ data }) => {
    const { authenticate, createSession } = await import("@/lib/auth.server");
    const role = await authenticate(data.username, data.password);
    await createSession(data.username, role);
    return { ok: true, role };
  });

export const logout = createServerFn({ method: "POST" })
  .handler(async () => {
    const { destroySession } = await import("@/lib/auth.server");
    await destroySession();
    return { ok: true };
  });

export const getSession = createServerFn({ method: "GET" })
  .handler(async () => {
    const { getSessionFromCookie } = await import("@/lib/auth.server");
    const session = await getSessionFromCookie();
    return { session };
  });
