import { createHmac, timingSafeEqual, scryptSync, randomBytes } from "crypto";
import { cookies } from "next/headers";

const OWNER_COOKIE = "owner_session";
const ADMIN_COOKIE = "admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

function getSecret(): string {
  return process.env.SESSION_SECRET || "default_dev_session_secret_change_in_production_32bytes";
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

function encode(data: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

function decode<T>(token: string | undefined): T | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof data.exp === "number" && Date.now() > data.exp) return null;
    return data as T;
  } catch {
    return null;
  }
}

export interface OwnerSession {
  flat_no: string;
  owner_name: string;
  exp: number;
}

export function setOwnerSession(flat_no: string, owner_name: string) {
  const exp = Date.now() + SESSION_TTL_SECONDS * 1000;
  const token = encode({ flat_no, owner_name, exp });
  cookies().set(OWNER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function getOwnerSession(): OwnerSession | null {
  return decode<OwnerSession>(cookies().get(OWNER_COOKIE)?.value);
}

export function clearOwnerSession() {
  cookies().delete(OWNER_COOKIE);
}

export interface AdminSession {
  role: "admin";
  exp: number;
}

export function setAdminSession() {
  const exp = Date.now() + SESSION_TTL_SECONDS * 1000;
  const token = encode({ role: "admin", exp });
  cookies().set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function getAdminSession(): AdminSession | null {
  return decode<AdminSession>(cookies().get(ADMIN_COOKIE)?.value);
}

export function clearAdminSession() {
  cookies().delete(ADMIN_COOKIE);
}

/** Hashes a 4-digit PIN with a per-flat salt using scrypt. Stored as "salt:hash", both hex. */
export function hashPin(pin: string, flatNo: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pin, `${salt}:${flatNo.toLowerCase()}`, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPin(pin: string, flatNo: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(pin, `${salt}:${flatNo.toLowerCase()}`, 64).toString("hex");
  const a = Buffer.from(candidate);
  const b = Buffer.from(hash);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isValidAdminPassword(password: string): boolean {
  const expected = process.env.ADMIN_PASSWORD || "admin123";
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

