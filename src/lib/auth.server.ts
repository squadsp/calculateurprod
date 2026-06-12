import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type Role = "super_admin" | "admin";

const COOKIE_NAME = "admin_session";
const SESSION_DAYS = 30;

export async function authenticate(username: string, password: string): Promise<Role> {
  const { data, error } = await supabaseAdmin
    .from("app_users")
    .select("password_hash, role")
    .eq("username", username)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Identifiants invalides");
  const ok = await bcrypt.compare(password, data.password_hash);
  if (!ok) throw new Error("Identifiants invalides");
  return data.role as Role;
}

export async function requireSuperAdmin(username: string, password: string): Promise<void> {
  const role = await authenticate(username, password);
  if (role !== "super_admin") throw new Error("Action réservée au super administrateur");
}

async function resolveAdminFromCookie(): Promise<{ username: string; role: Role } | null> {
  const token = getCookie(COOKIE_NAME);
  if (!token) return null;
  const { data, error } = await supabaseAdmin
    .from("admin_sessions")
    .select("username, role, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (error || !data) return null;
  if (new Date(data.expires_at) < new Date()) {
    await supabaseAdmin.from("admin_sessions").delete().eq("token", token);
    deleteCookie(COOKIE_NAME, { path: "/" });
    return null;
  }
  return { username: data.username, role: data.role as Role };
}

export async function resolveAdmin(data: { username?: string; password?: string }): Promise<{ username: string; role: Role }> {
  if (data.username && data.password) {
    const role = await authenticate(data.username, data.password);
    return { username: data.username, role };
  }
  const session = await resolveAdminFromCookie();
  if (!session) throw new Error("Session expirée, reconnectez-vous");
  return session;
}

export async function resolveSuperAdmin(data: { username?: string; password?: string }): Promise<{ username: string; role: Role }> {
  const admin = await resolveAdmin(data);
  if (admin.role !== "super_admin") throw new Error("Action réservée au super administrateur");
  return admin;
}

export async function createSession(username: string, role: Role): Promise<void> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DAYS);

  const { error } = await supabaseAdmin.from("admin_sessions").insert({
    token,
    username,
    role,
    expires_at: expiresAt.toISOString(),
  });
  if (error) throw new Error(error.message);

  setCookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 60 * 60 * 24 * SESSION_DAYS,
    path: "/",
  });
}

export async function destroySession(): Promise<void> {
  const token = getCookie(COOKIE_NAME);
  if (token) {
    await supabaseAdmin.from("admin_sessions").delete().eq("token", token);
  }
  deleteCookie(COOKIE_NAME, { path: "/", sameSite: "none", secure: true });
}

export async function getSessionFromCookie(): Promise<{ username: string; role: Role } | null> {
  return resolveAdminFromCookie();
}
