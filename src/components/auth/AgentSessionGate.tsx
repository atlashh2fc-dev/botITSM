"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { LockKeyhole, RefreshCw } from "lucide-react";
import { exchangeITSMAssertion, getBotITSMSession, type AuthenticatedITSMUser } from "@/lib/auth/client";
import { getClientTenant } from "@/lib/tenant/client";

function requireAgent(user: AuthenticatedITSMUser) {
  if (!user.roles.some(role => role === "admin" || role === "agent")) {
    throw new Error("Esta vista requiere una cuenta de agente ITSM.");
  }
  return user;
}

export function AgentSessionGate({ children }: { children: ReactNode }) {
  const tenant = getClientTenant();
  const [status, setStatus] = useState<"checking" | "required" | "ready">("checking");
  const [error, setError] = useState("");
  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current === null) return;
    window.clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  const acceptAssertion = useCallback(async (assertion: unknown) => {
    const user = requireAgent(await exchangeITSMAssertion(assertion));
    stopPolling();
    setError("");
    setStatus("ready");
    return user;
  }, [stopPolling]);

  useEffect(() => {
    let active = true;
    const trustedOrigin = new URL(tenant.itsmBaseUrl).origin;

    function onIdentity(event: MessageEvent) {
      if (event.origin !== trustedOrigin) return;
      if (!event.data || event.data.type !== "geimser:itsm-identity") return;
      void acceptAssertion(event.data.assertion).catch(requestError => {
        if (!active) return;
        setError(requestError instanceof Error ? requestError.message : "No fue posible validar la sesión ITSM.");
        setStatus("required");
      });
    }

    window.addEventListener("message", onIdentity);
    void getBotITSMSession()
      .then(user => {
        if (!active) return;
        if (!user) {
          setStatus("required");
          return;
        }
        requireAgent(user);
        setStatus("ready");
      })
      .catch(requestError => {
        if (!active) return;
        setError(requestError instanceof Error ? requestError.message : "Inicia sesión como agente ITSM.");
        setStatus("required");
      });

    return () => {
      active = false;
      window.removeEventListener("message", onIdentity);
      stopPolling();
    };
  }, [acceptAssertion, stopPolling, tenant.itsmBaseUrl]);

  function openLogin() {
    const url = new URL(tenant.botLoginUrl);
    url.searchParams.set("return_origin", window.location.origin);
    url.searchParams.set("switch_account", "1");
    popupRef.current = window.open(url.toString(), `${tenant.id}-agent-login`, "popup=yes,width=520,height=640");
    if (!popupRef.current) {
      setError("El navegador bloqueó la ventana de login. Habilita pop-ups e inténtalo nuevamente.");
      return;
    }

    setError("");
    setStatus("checking");
    let attempts = 0;
    stopPolling();
    const poll = async () => {
      attempts += 1;
      try {
        const response = await fetch(`${tenant.itsmBaseUrl}/geimser/bot/session`, { credentials: "include", cache: "no-store" });
        const payload = await response.json() as { authenticated?: boolean; assertion?: string };
        if (response.ok && payload.authenticated && payload.assertion) {
          await acceptAssertion(payload.assertion);
          popupRef.current?.close();
          return;
        }
      } catch {
        // postMessage is primary; polling only recovers browsers that drop it.
      }
      if (attempts >= 80) {
        stopPolling();
        setError("El login ITSM no se confirmó. Revisa la ventana de acceso e inténtalo nuevamente.");
        setStatus("required");
      }
    };
    void poll();
    pollRef.current = window.setInterval(() => { void poll(); }, 1500);
  }

  if (status === "ready") return children;

  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, background: "#07101d", fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", color: "#e5eefb" }}>
      <section style={{ width: "min(420px, 100%)", padding: 28, border: "1px solid rgba(85,244,255,.22)", borderRadius: 12, background: "rgba(15,30,51,.92)", textAlign: "center" }}>
        {status === "checking" ? <RefreshCw size={30} color="#55f4ff" aria-hidden /> : <LockKeyhole size={30} color="#55f4ff" aria-hidden />}
        <h1 style={{ margin: "14px 0 8px", fontSize: 18 }}>Sesión de agente ITSM</h1>
        <p style={{ margin: 0, color: "#9fb1c8", fontSize: 13, lineHeight: 1.5 }}>
          {status === "checking" ? "Validando tu acceso operativo…" : error || "Inicia sesión con una cuenta de agente para continuar."}
        </p>
        {status === "required" ? <button type="button" onClick={openLogin} style={{ marginTop: 18, border: 0, borderRadius: 7, background: "#55f4ff", color: "#07101d", padding: "9px 14px", fontWeight: 800, cursor: "pointer" }}>Iniciar sesión ITSM</button> : null}
      </section>
    </main>
  );
}

