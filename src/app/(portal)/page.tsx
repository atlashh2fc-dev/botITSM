import type { Metadata } from "next";
import { headers } from "next/headers";
import LandingPage from "@/components/portal/LandingPage";
import { getTenantByHost } from "@/lib/tenant/server";

async function requestTenant() {
  const requestHeaders = await headers();
  return getTenantByHost(
    requestHeaders.get("x-forwarded-host")?.split(",", 1)[0]
      ?? requestHeaders.get("host"),
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await requestTenant();
  const brand = tenant?.id === "forum" ? "Forum" : "SONDA";
  return {
    title: `Portal de soporte inteligente | ${brand}`,
    description: `Plataforma ${brand} de soporte ITSM asistida por inteligencia operacional.`,
  };
}

export default async function TenantLandingPage() {
  const tenant = await requestTenant();
  // Unknown hosts are rejected by the server proxy. Keep a deterministic
  // placeholder for build-time prerendering without leaking Forum branding.
  return <LandingPage tenantId={tenant?.id ?? "geimser"} />;
}
