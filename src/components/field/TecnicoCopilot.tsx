"use client";

/**
 * TecnicoCopilot — Chatbot móvil para técnicos en terreno
 *
 * UX inspirada en Claude/ChatGPT:
 * - Dark theme completo
 * - Burbujas de chat con markdown renderizado
 * - Input fijo al pie + botón cámara
 * - Preview de imagen antes de enviar
 * - Indicador de typing animado
 * - 100% responsive / mobile-first
 */

import {
  ArrowLeft,
  Camera,
  ChevronDown,
  Loader2,
  Send,
  X,
  Wrench,
  ImagePlus,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// ─── Types ─────────────────────────────────────────────────────────────────────

type MessageRole = "user" | "assistant" | "system";

type Message = {
  id: string;
  role: MessageRole;
  content: string;
  imagePreview?: string; // data URL para mostrar la foto
  createdAt: string;
};

// ─── Markdown renderer simple (sin dependencias externas) ──────────────────────

function renderMarkdown(text: string): string {
  return text
    // Bold
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    // Code inline
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // Numbered lists
    .replace(/^\s*(\d+)\.\s(.+)$/gm, "<li data-n='$1'>$2</li>")
    // Bullet lists
    .replace(/^\s*[-•]\s(.+)$/gm, "<li>$1</li>")
    // Wrap consecutive li in ol/ul
    .replace(/(<li data-n[^>]*>[\s\S]*?<\/li>(\s*<li data-n[^>]*>[\s\S]*?<\/li>)*)/g, "<ol>$1</ol>")
    .replace(/(<li>[\s\S]*?<\/li>(\s*<li>[\s\S]*?<\/li>)*)/g, "<ul>$1</ul>")
    // Headers
    .replace(/^### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^## (.+)$/gm, "<h3>$1</h3>")
    .replace(/^# (.+)$/gm, "<h2>$1</h2>")
    // Line breaks (double newline → paragraph separator)
    .replace(/\n\n/g, "<br/><br/>")
    .replace(/\n/g, "<br/>");
}

// ─── Compresor de imagen (canvas) ─────────────────────────────────────────────
// Escala a máx 1024px y comprime a JPEG 0.75 para no superar el body limit

async function compressImage(dataUrl: string, maxPx = 1024, quality = 0.75): Promise<{ base64: string; mime: string; preview: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let { width, height } = img;

      if (width > maxPx || height > maxPx) {
        if (width >= height) {
          height = Math.round((height * maxPx) / width);
          width = maxPx;
        } else {
          width = Math.round((width * maxPx) / height);
          height = maxPx;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("No canvas context"));
      ctx.drawImage(img, 0, 0, width, height);

      const compressedDataUrl = canvas.toDataURL("image/jpeg", quality);
      const [header, base64] = compressedDataUrl.split(",");
      const mime = header.match(/data:(.*);base64/)?.[1] ?? "image/jpeg";
      resolve({ base64, mime, preview: compressedDataUrl });
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// ─── Colores y constantes ──────────────────────────────────────────────────────

const C = {
  bg: "#0D0D0D",
  surface: "#161616",
  surfaceAlt: "#1C1C1C",
  border: "#262626",
  borderAlt: "#2E2E2E",
  accent: "#22C55E",
  accentDim: "rgba(34,197,94,0.12)",
  accentBorder: "rgba(34,197,94,0.25)",
  textPrimary: "#F0F0F0",
  textSecondary: "#8A8A8A",
  textMuted: "#555",
  userBubble: "#1A2E1A",
  userBubbleBorder: "#1F4024",
  aiBubble: "#161616",
  aiBubbleBorder: "#262626",
  red: "#EF4444",
  redDim: "rgba(239,68,68,0.12)",
};

// ─── Componente principal ──────────────────────────────────────────────────────

function createWelcomeMessage(): Message {
  return {
    id: "welcome",
    role: "assistant",
    content: `**Copiloto Técnico SONDA** listo para asistirte.\n\nPuedes:\n- Describir una falla con texto\n- 📷 Fotografiar el equipo o error y lo analizo\n- Preguntar sobre procedimientos SONDA\n\n¿Qué falla estás enfrentando hoy?`,
    createdAt: new Date().toISOString(),
  };
}

export function TecnicoCopilot() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(() => [createWelcomeMessage()]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [imageData, setImageData] = useState<{ base64: string; mime: string; preview: string } | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [zone] = useState("Sitio Técnico");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll al último mensaje
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Detectar si el usuario scrolleó arriba
  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBtn(distFromBottom > 200);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  };

  // Procesar imagen seleccionada — comprime antes de guardar
  const handleImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      try {
        const compressed = await compressImage(dataUrl, 1024, 0.75);
        setImageData(compressed);
      } catch {
        // Fallback sin compresión
        const [header, base64] = dataUrl.split(",");
        const mime = header.match(/data:(.*);base64/)?.[1] ?? "image/jpeg";
        setImageData({ base64, mime, preview: dataUrl });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImageFile(file);
    e.target.value = "";
  };

  const clearImage = () => setImageData(null);

  // Enviar mensaje
  const handleSend = async () => {
    const text = input.trim();
    if (!text && !imageData) return;
    if (loading) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text || "(foto adjunta)",
      imagePreview: imageData?.preview,
      createdAt: new Date().toISOString(),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setImageData(null);
    setLoading(true);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    // Historial para la API (excluir mensaje de bienvenida)
    const history = newMessages
      .filter((m) => m.id !== "welcome")
      .slice(-20)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    try {
      const res = await fetch("/api/field-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          imageBase64: imageData?.base64,
          imageMime: imageData?.mime,
          history: history.slice(0, -1),
          zone,
          techRole: "tecnico terreno",
        }),
      });

      let content: string;
      if (res.ok) {
        const data = await res.json();
        content = data.assistantMessage ?? "Sin respuesta del servidor.";
      } else {
        const errData = await res.json().catch(() => ({}));
        content = `⚠️ Error ${res.status}: ${errData.error ?? res.statusText}`;
      }

      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content, createdAt: new Date().toISOString() },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `⚠️ No se pudo conectar con el servidor: ${msg}`,
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = (input.trim().length > 0 || imageData !== null) && !loading;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100dvh",
        background: C.bg,
        color: C.textPrimary,
        fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
        maxWidth: 760,
        margin: "0 auto",
        position: "relative",
      }}
    >
      {/* ── Header ── */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 16px",
          borderBottom: `1px solid ${C.border}`,
          background: C.surface,
          flexShrink: 0,
          zIndex: 10,
        }}
      >
        <button
          onClick={() => router.push("/")}
          style={{
            background: "none",
            border: "none",
            color: C.textSecondary,
            cursor: "pointer",
            padding: "6px",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
          }}
          aria-label="Volver"
        >
          <ArrowLeft size={20} />
        </button>

        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: C.accentDim,
            border: `1px solid ${C.accentBorder}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Wrench size={18} color={C.accent} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: C.textPrimary, lineHeight: 1 }}>
            Copiloto Técnico
          </p>
          <p style={{ margin: "3px 0 0", fontSize: 11, color: C.accent, lineHeight: 1 }}>
            ● En línea · Base de Conocimiento SONDA activa
          </p>
        </div>

        <div
          style={{
            fontSize: 11,
            color: C.textMuted,
            background: C.surfaceAlt,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: "4px 8px",
            flexShrink: 0,
          }}
        >
          RAG
        </div>
      </header>

      {/* ── Messages area ── */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          scrollbarWidth: "thin",
          scrollbarColor: `${C.border} transparent`,
        }}
      >
        {messages.map((msg) => (
          <ChatBubble key={msg.id} message={msg} />
        ))}

        {loading && <TypingIndicator />}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Scroll to bottom button ── */}
      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          style={{
            position: "absolute",
            bottom: 90,
            right: 16,
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: C.surface,
            border: `1px solid ${C.borderAlt}`,
            color: C.textSecondary,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
            zIndex: 20,
          }}
        >
          <ChevronDown size={18} />
        </button>
      )}

      {/* ── Image preview ── */}
      {imageData && (
        <div
          style={{
            padding: "8px 12px",
            borderTop: `1px solid ${C.border}`,
            background: C.surface,
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexShrink: 0,
          }}
        >
          <div style={{ position: "relative", display: "inline-flex" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageData.preview}
              alt="Foto adjunta"
              style={{
                width: 60,
                height: 60,
                objectFit: "cover",
                borderRadius: 8,
                border: `1px solid ${C.accentBorder}`,
              }}
            />
            <button
              onClick={clearImage}
              style={{
                position: "absolute",
                top: -6,
                right: -6,
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: C.red,
                border: "none",
                color: "#fff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
              }}
            >
              <X size={11} />
            </button>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: C.textSecondary }}>
            📷 Foto lista — agrega una descripción (opcional) y envía
          </p>
        </div>
      )}

      {/* ── Input bar ── */}
      <div
        style={{
          padding: "10px 12px",
          borderTop: `1px solid ${C.border}`,
          background: C.surface,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 8,
            background: C.surfaceAlt,
            border: `1px solid ${C.borderAlt}`,
            borderRadius: 14,
            padding: "8px 8px 8px 12px",
          }}
        >
          {/* Camera / image buttons */}
          <div style={{ display: "flex", gap: 4, paddingBottom: 2 }}>
            <button
              onClick={() => cameraInputRef.current?.click()}
              title="Tomar foto"
              style={{
                background: "none",
                border: "none",
                color: C.textSecondary,
                cursor: "pointer",
                padding: 6,
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
              }}
            >
              <Camera size={20} />
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Adjuntar imagen"
              style={{
                background: "none",
                border: "none",
                color: C.textSecondary,
                cursor: "pointer",
                padding: 6,
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
              }}
            >
              <ImagePlus size={19} />
            </button>
          </div>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Describe la falla o adjunta una foto…"
            rows={1}
            style={{
              flex: 1,
              background: "none",
              border: "none",
              outline: "none",
              color: C.textPrimary,
              fontSize: 15,
              lineHeight: 1.5,
              resize: "none",
              fontFamily: "inherit",
              minHeight: 24,
              maxHeight: 120,
              paddingTop: 2,
            }}
          />

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!canSend}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: canSend ? C.accent : C.surfaceAlt,
              border: canSend ? "none" : `1px solid ${C.border}`,
              color: canSend ? "#000" : C.textMuted,
              cursor: canSend ? "pointer" : "default",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              transition: "all 0.15s ease",
            }}
            aria-label="Enviar"
          >
            {loading ? (
              <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
            ) : (
              <Send size={17} />
            )}
          </button>
        </div>

        <p style={{ margin: "6px 0 0", fontSize: 11, color: C.textMuted, textAlign: "center" }}>
          Shift+Enter para nueva línea · El copiloto usa la base de conocimiento SONDA
        </p>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      {/* Spin animation */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 4px; }
        ul, ol { margin: 6px 0; padding-left: 20px; }
        li { margin: 3px 0; }
        strong { color: #f0f0f0; }
        code { background: #1e1e1e; padding: 1px 5px; border-radius: 4px; font-size: 13px; color: #a8d8a8; }
        h2,h3,h4 { margin: 10px 0 4px; color: #e0e0e0; font-weight: 600; }
        h2 { font-size: 16px; }
        h3 { font-size: 15px; }
        h4 { font-size: 14px; }
      `}</style>
    </div>
  );
}

// ─── Burbuja de chat ───────────────────────────────────────────────────────────

function ChatBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const html = renderMarkdown(message.content);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isUser ? "flex-end" : "flex-start",
        marginBottom: 10,
      }}
    >
      {/* Avatar label */}
      <div
        style={{
          fontSize: 11,
          color: isUser ? C.accent : C.textMuted,
          marginBottom: 4,
          paddingLeft: isUser ? 0 : 4,
          paddingRight: isUser ? 4 : 0,
          fontWeight: 600,
          letterSpacing: "0.04em",
        }}
      >
        {isUser ? "Tú" : "Copiloto IA"}
      </div>

      {/* Image preview si hay */}
      {message.imagePreview && (
        <div style={{ marginBottom: 6, borderRadius: 12, overflow: "hidden", maxWidth: 200 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={message.imagePreview}
            alt="Evidencia"
            style={{ width: "100%", display: "block", borderRadius: 10, border: `1px solid ${C.accentBorder}` }}
          />
        </div>
      )}

      {/* Bubble */}
      <div
        style={{
          maxWidth: "88%",
          padding: "10px 14px",
          borderRadius: isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
          background: isUser ? C.userBubble : C.aiBubble,
          border: `1px solid ${isUser ? C.userBubbleBorder : C.aiBubbleBorder}`,
          fontSize: 14,
          lineHeight: 1.6,
          color: C.textPrimary,
          wordBreak: "break-word",
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

// ─── Indicador de typing ───────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", marginBottom: 10 }}>
      <div
        style={{
          padding: "12px 16px",
          borderRadius: "18px 18px 18px 4px",
          background: C.aiBubble,
          border: `1px solid ${C.aiBubbleBorder}`,
          display: "flex",
          gap: 6,
          alignItems: "center",
        }}
      >
        {[0, 0.2, 0.4].map((delay, i) => (
          <span
            key={i}
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: C.accent,
              display: "block",
              animation: `pulse 1.2s ease-in-out ${delay}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
