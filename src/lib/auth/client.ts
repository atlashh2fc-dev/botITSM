"use client";

export type AuthenticatedITSMUser = {
  email: string;
  name: string;
  roles: Array<"admin" | "agent" | "customer">;
};

type SessionPayload = {
  authenticated?: boolean;
  user?: AuthenticatedITSMUser;
  error?: string;
};

export async function exchangeITSMAssertion(assertion: unknown): Promise<AuthenticatedITSMUser> {
  if (typeof assertion !== "string" || !assertion) throw new Error("El ITSM no entregó una prueba de sesión válida.");
  const response = await fetch("/api/auth/itsm/session", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assertion }),
  });
  const payload = await response.json().catch(() => ({})) as SessionPayload;
  if (!response.ok || !payload.authenticated || !payload.user?.email) {
    throw new Error(payload.error || "No fue posible confirmar la sesión ITSM.");
  }
  return payload.user;
}

export async function getBotITSMSession(): Promise<AuthenticatedITSMUser | null> {
  const response = await fetch("/api/auth/itsm/session", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => ({})) as SessionPayload;
  return payload.authenticated && payload.user?.email ? payload.user : null;
}

