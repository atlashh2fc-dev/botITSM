"use client";

import { useState } from "react";
import Link from "next/link";
import { SondaAssistant } from "@/components/chat/AtlasAssistant";

export function SupportPortal() {
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <>
      {/* ── Keyframes ── */}
      <style>{`
        @keyframes sonda-float {
          0%,100% { transform: translateY(0px) scale(1); }
          50%      { transform: translateY(-18px) scale(1.015); }
        }
        @keyframes sonda-pulse-ring {
          0%   { transform: scale(0.88); opacity: 0.55; }
          100% { transform: scale(1.65); opacity: 0; }
        }
        @keyframes sonda-glow-breathe {
          0%,100% { opacity: 0.18; }
          50%     { opacity: 0.42; }
        }
        @keyframes sonda-fade-up {
          from { opacity: 0; transform: translateY(22px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes sonda-chat-in {
          from { opacity: 0; transform: scale(0.93) translateY(30px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }
        @keyframes sonda-dot-blink {
          0%,80%,100% { transform: scale(0); }
          40%         { transform: scale(1); }
        }
        .s-float   { animation: sonda-float 4.8s ease-in-out infinite; }
        .s-ring-1  { animation: sonda-pulse-ring 3.2s cubic-bezier(0.2,0,0.8,1) infinite; }
        .s-ring-2  { animation: sonda-pulse-ring 3.2s cubic-bezier(0.2,0,0.8,1) infinite 1.6s; }
        .s-ring-3  { animation: sonda-pulse-ring 3.2s cubic-bezier(0.2,0,0.8,1) infinite 0.8s; }
        .s-glow    { animation: sonda-glow-breathe 3.8s ease-in-out infinite; }
        .s-fade-1  { animation: sonda-fade-up 0.9s ease-out 0.4s both; }
        .s-fade-2  { animation: sonda-fade-up 0.9s ease-out 0.85s both; }
        .s-fade-3  { animation: sonda-fade-up 0.9s ease-out 1.1s both; }
        .s-chat    { animation: sonda-chat-in 0.45s cubic-bezier(0.34,1.42,0.64,1) both; }
        .s-btn:hover { background: rgba(255,255,255,0.07) !important; border-color: rgba(255,255,255,0.45) !important; letter-spacing: 0.14em !important; }
      `}</style>

      <main style={{
        minHeight: "100dvh",
        background: "#000000",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
        fontFamily: "'Kumbh Sans','Segoe UI',sans-serif",
      }}>

        {/* ── Glow ambiental de fondo ── */}
        <div className="s-glow" style={{
          position: "absolute",
          width: 700,
          height: 420,
          borderRadius: "50%",
          background: "radial-gradient(ellipse at center, rgba(255,255,255,0.055) 0%, transparent 68%)",
          pointerEvents: "none",
          zIndex: 0,
        }} />

        {/* ── Anillos de pulso ── */}
        {["s-ring-1","s-ring-2","s-ring-3"].map((cls) => (
          <div key={cls} className={cls} style={{
            position: "absolute",
            width: 360,
            height: 200,
            borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.1)",
            pointerEvents: "none",
            zIndex: 0,
          }} />
        ))}

        {/* ── Contenido central ── */}
        <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>

          {/* Logo flotando */}
          <div className="s-float s-fade-1" style={{ position: "relative" }}>
            {/* Halo suave debajo del logo */}
            <div style={{
              position: "absolute",
              inset: "-24px -40px",
              borderRadius: "50%",
              background: "radial-gradient(ellipse at center, rgba(255,255,255,0.07) 0%, transparent 70%)",
              pointerEvents: "none",
            }} />

            {/* Logo SONDA — SVG wordmark fiel al original */}
            <SondaWordmark width={260} />
          </div>

          {/* Separador sutil */}
          <div className="s-fade-2" style={{
            marginTop: 36,
            width: 1,
            height: 52,
            background: "linear-gradient(to bottom, rgba(255,255,255,0.25), transparent)",
          }} />

          {/* Tagline */}
          <p className="s-fade-2" style={{
            marginTop: 20,
            fontSize: 12,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.3)",
            fontWeight: 500,
            margin: "0 0 0 0",
          }}>
            Mesa de Ayuda · ITSM
          </p>

          {/* ── CTA o chat ── */}
          {!chatOpen ? (
            <button
              className="s-btn s-fade-3"
              onClick={() => setChatOpen(true)}
              style={{
                marginTop: 44,
                padding: "15px 52px",
                border: "1px solid rgba(255,255,255,0.18)",
                borderRadius: 2,
                background: "transparent",
                color: "rgba(255,255,255,0.88)",
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all 0.25s ease",
              }}
            >
              Iniciar soporte
            </button>
          ) : (
            <div className="s-chat" style={{ marginTop: 36 }}>
              <SondaAssistant />
            </div>
          )}

          {/* Indicador de estado */}
          <div className="s-fade-3" style={{
            marginTop: chatOpen ? 14 : 32,
            display: "flex",
            alignItems: "center",
            gap: 7,
          }}>
            <span style={{
              display: "inline-flex",
              gap: 4,
              alignItems: "center",
            }}>
              {[0,1,2].map(i => (
                <span key={i} style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.35)",
                  animation: `sonda-dot-blink 1.4s ease-in-out ${i * 0.16}s infinite`,
                  display: "inline-block",
                }} />
              ))}
            </span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.22)", letterSpacing: "0.1em" }}>
              sistema disponible
            </span>
          </div>
        </div>

        {/* ── Link admin — casi invisible ── */}
        <Link
          href="/admin"
          style={{
            position: "absolute",
            bottom: 20,
            right: 24,
            fontSize: 11,
            color: "rgba(255,255,255,0.18)",
            textDecoration: "none",
            letterSpacing: "0.08em",
            transition: "color 0.2s",
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.5)"}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.18)"}
        >
          Panel Admin →
        </Link>
      </main>
    </>
  );
}

/* ── Wordmark SONDA — fiel al logo oficial ─────────────────────────
   Letras blancas bold sobre fondo negro, con ® en superíndice        */
function SondaWordmark({ width = 260 }: { width?: number }) {
  const h = Math.round(width * 0.32);
  return (
    <svg
      width={width}
      height={h}
      viewBox="0 0 520 168"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="SONDA"
      role="img"
    >
      {/* Fondo negro del logo */}
      <rect width="520" height="168" fill="#000000" rx="3" />

      {/* Wordmark SONDA — tipografía pesada */}
      <text
        x="22"
        y="132"
        fontFamily="'Arial Black','Arial','Helvetica Neue','Impact',sans-serif"
        fontWeight="900"
        fontSize="126"
        letterSpacing="-3"
        fill="#FFFFFF"
      >
        SONDA
      </text>

      {/* Punto que aparece en el logo original */}
      <text
        x="493"
        y="132"
        fontFamily="'Arial Black','Arial',sans-serif"
        fontWeight="900"
        fontSize="126"
        fill="#FFFFFF"
      >
        .
      </text>

      {/* ® superscript */}
      <text
        x="487"
        y="48"
        fontFamily="'Arial','Helvetica Neue',sans-serif"
        fontWeight="400"
        fontSize="32"
        fill="rgba(255,255,255,0.75)"
      >
        ®
      </text>
    </svg>
  );
}
