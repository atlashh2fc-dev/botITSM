"use client";

import { useRouter } from "next/navigation";
import { Monitor, Wrench, LayoutDashboard, RadioTower } from "lucide-react";
import { SondaLogo } from "@/components/shared/BrandMark";

export default function LandingPage() {
  const router = useRouter();

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#000",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 48,
        padding: "24px 16px",
        fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
      }}
    >
      {/* Logo */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <SondaLogo width={140} />
        <p style={{ color: "#4B6A9B", margin: 0, fontSize: 13, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Plataforma IA de Soporte
        </p>
      </div>

      {/* Cards */}
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 20,
          justifyContent: "center",
          width: "100%",
          maxWidth: 720,
        }}
      >
        {/* Demo Usuario */}
        <button
          onClick={() => router.push("/usuario")}
          style={{
            flex: "1 1 280px",
            background: "linear-gradient(135deg, #0D1B2A 0%, #12213F 100%)",
            border: "1px solid #1E3A5F",
            borderRadius: 16,
            padding: "36px 28px",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 16,
            textAlign: "left",
            transition: "all 0.2s ease",
            outline: "none",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "#2D6EE8";
            (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-3px)";
            (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 12px 40px rgba(45,110,232,0.2)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "#1E3A5F";
            (e.currentTarget as HTMLButtonElement).style.transform = "none";
            (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 12,
              background: "rgba(45,110,232,0.15)",
              border: "1px solid rgba(45,110,232,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Monitor size={26} color="#2D6EE8" />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 11, color: "#4B6A9B", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
              Demo
            </p>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#FFFFFF", lineHeight: 1.2 }}>
              Portal Usuario
            </h2>
            <p style={{ margin: "10px 0 0", fontSize: 14, color: "#7A9CC8", lineHeight: 1.5 }}>
              Mesa de ayuda ITSM con asistente IA. Vista escritorio para usuarios finales y operadores.
            </p>
          </div>
          <span style={{ marginTop: 4, fontSize: 13, color: "#2D6EE8", fontWeight: 600 }}>
            Abrir demo →
          </span>
        </button>

        {/* Demo Técnico */}
        <button
          onClick={() => router.push("/tecnico")}
          style={{
            flex: "1 1 280px",
            background: "linear-gradient(135deg, #0A1A0D 0%, #0F2512 100%)",
            border: "1px solid #1A3D1E",
            borderRadius: 16,
            padding: "36px 28px",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 16,
            textAlign: "left",
            transition: "all 0.2s ease",
            outline: "none",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "#22C55E";
            (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-3px)";
            (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 12px 40px rgba(34,197,94,0.15)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "#1A3D1E";
            (e.currentTarget as HTMLButtonElement).style.transform = "none";
            (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 12,
              background: "rgba(34,197,94,0.12)",
              border: "1px solid rgba(34,197,94,0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Wrench size={26} color="#22C55E" />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 11, color: "#2D6B38", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
              Demo
            </p>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#FFFFFF", lineHeight: 1.2 }}>
              Copiloto Técnico
            </h2>
            <p style={{ margin: "10px 0 0", fontSize: 14, color: "#5A9668", lineHeight: 1.5 }}>
              IA para técnicos en terreno. Fotografía una falla y obtén diagnóstico con procedimientos SONDA.
            </p>
          </div>
          <span style={{ marginTop: 4, fontSize: 13, color: "#22C55E", fontWeight: 600 }}>
            Abrir copiloto →
          </span>
        </button>
      </div>

      {/* Dashboard links */}
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 10 }}>
        <button
          onClick={() => router.push("/dashboard")}
          style={{
            background: "none",
            border: "1px solid #1E2E3D",
            borderRadius: 8,
            padding: "8px 18px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "#4B6A9B",
            fontSize: 13,
            transition: "all 0.15s ease",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#F59E0B"; (e.currentTarget as HTMLButtonElement).style.color = "#F59E0B"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#1E2E3D"; (e.currentTarget as HTMLButtonElement).style.color = "#4B6A9B"; }}
        >
          <LayoutDashboard size={14} />
          Dashboard Admin
        </button>
        <button
          onClick={() => router.push("/dashboard/tiempo-real")}
          style={{
            background: "rgba(245, 158, 11, 0.08)",
            border: "1px solid rgba(245, 158, 11, 0.35)",
            borderRadius: 8,
            padding: "8px 18px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "#F59E0B",
            fontSize: 13,
            fontWeight: 600,
            transition: "all 0.15s ease",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(245, 158, 11, 0.16)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(245, 158, 11, 0.08)"; }}
        >
          <RadioTower size={14} />
          Tiempo real
        </button>
      </div>

      <p style={{ color: "#1E2E3D", fontSize: 12, margin: 0, textAlign: "center" }}>
        SONDA IA Platform · Demo Interna
      </p>
    </main>
  );
}
