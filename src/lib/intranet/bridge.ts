import { createHmac } from "node:crypto";
import type { ITSMIdentity } from "@/lib/auth/assertion";

const MAX_LIFETIME_SECONDS = 90;

function configuration() {
  const baseUrl = (process.env.INTRANET_BASE_URL ?? "https://intranet.geimser.cl").replace(/\/$/, "");
  const secret = (process.env.INTRANET_ASSISTANT_BRIDGE_SECRET ?? "").trim();
  if (secret.length < 32) throw new Error("La integración con Intranet no está configurada.");
  return { baseUrl, secret };
}

export function intranetBridgeRequest(identity: ITSMIdentity, path: string, init: RequestInit = {}) {
  const { baseUrl, secret } = configuration();
  const now = Math.floor(Date.now() / 1000);
  const encoded = Buffer.from(JSON.stringify({
    v: 1,
    aud: "intranet-chat",
    email: identity.email.toLowerCase(),
    name: identity.name,
    iat: now,
    exp: now + MAX_LIFETIME_SECONDS,
  }), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded, "ascii").digest("hex");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${encoded}.${signature}`);
  headers.set("Accept", "application/json");
  return fetch(new URL(`/api/assistant-bridge/${path.replace(/^\//, "")}`, `${baseUrl}/`), {
    ...init,
    headers,
    cache: "no-store",
  });
}
