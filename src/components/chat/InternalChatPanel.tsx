"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, RefreshCw, Send, Users } from "lucide-react";

type Participant = { id: number; name: string; role: string };
type Message = {
  id: number;
  content: string;
  created_at: string;
  recipient_id: number;
  sender: { id: number; name: string };
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/intranet-chat/${path}`, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail || payload.error || "No fue posible conectar con la Intranet.");
  return payload as T;
}

export function InternalChatPanel({ onClose }: { onClose: () => void }) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [selectedId, setSelectedId] = useState<number>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadParticipants = async () => {
    try {
      const data = await api<Participant[]>("participants");
      setParticipants(data);
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No fue posible cargar integrantes.");
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (contactId: number) => {
    try {
      const data = await api<Message[]>(`messages?contact_id=${contactId}`);
      setMessages(data);
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No fue posible cargar la conversación.");
    }
  };

  useEffect(() => { void loadParticipants(); }, []);
  useEffect(() => {
    if (!selectedId) { setMessages([]); return; }
    void loadMessages(selectedId);
    const timer = window.setInterval(() => void loadMessages(selectedId), 3000);
    return () => window.clearInterval(timer);
  }, [selectedId]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const content = text.trim();
    if (!selectedId || !content) return;
    try {
      const message = await api<Message>("messages", { method: "POST", body: JSON.stringify({ recipient_id: selectedId, content }) });
      setMessages(current => current.some(item => item.id === message.id) ? current : [...current, message]);
      setText("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No fue posible enviar el mensaje.");
    }
  }

  const selected = participants.find(item => item.id === selectedId);
  return (
    <section className="absolute inset-0 z-20 flex flex-col" style={{ background: "#08111e" }} aria-label="Conversaciones internas">
      <header className="flex shrink-0 items-center gap-2 border-b px-3.5 py-3" style={{ borderColor: "rgba(148,163,184,.15)" }}>
        <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-lg text-slate-300 hover:bg-white/10" title="Volver al asistente"><ArrowLeft size={16} /></button>
        <span className="grid size-8 place-items-center rounded-lg" style={{ background: "rgba(85,244,255,.1)", color: "#55F4FF" }}><Users size={15} /></span>
        <div className="min-w-0 flex-1"><p className="text-xs font-bold text-white">Conversaciones internas</p><p className="truncate text-[10px] text-slate-400">{selected ? `Chat privado con ${selected.name}` : "Selecciona un integrante"}</p></div>
        <button type="button" onClick={() => void loadParticipants()} className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-white/10" title="Actualizar integrantes"><RefreshCw size={14} /></button>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[132px_minmax(0,1fr)]">
        <aside className="thin-scrollbar overflow-y-auto border-r p-2" style={{ borderColor: "rgba(148,163,184,.14)" }}>
          {loading ? <p className="p-2 text-[10px] text-slate-400">Cargando...</p> : participants.map(person => <button key={person.id} type="button" onClick={() => setSelectedId(person.id)} className="mb-1 w-full rounded-lg p-2 text-left transition-colors" style={{ background: person.id === selectedId ? "rgba(85,244,255,.12)" : "transparent", color: person.id === selectedId ? "#67F8FF" : "#dbe5f1" }}><span className="block truncate text-[10px] font-bold">{person.name}</span><span className="block truncate text-[9px] text-slate-500">{person.role}</span></button>)}
        </aside>
        <div className="flex min-h-0 flex-col">
          <div className="thin-scrollbar flex-1 space-y-2 overflow-y-auto p-3">
            {error ? <p className="rounded-lg bg-red-500/10 p-2 text-[10px] text-red-300">{error}</p> : null}
            {!selectedId ? <p className="py-14 text-center text-xs text-slate-500">Elige una persona para iniciar una conversación privada.</p> : messages.length === 0 ? <p className="py-14 text-center text-xs text-slate-500">Sin mensajes todavía.</p> : messages.map(message => <article key={message.id} className="max-w-[84%]" style={{ marginLeft: message.recipient_id === selectedId ? "auto" : undefined }}><p className="mb-1 text-[9px] text-slate-500">{message.sender.name}</p><p className="rounded-lg px-2.5 py-2 text-[11px] leading-relaxed" style={{ background: message.recipient_id === selectedId ? "#049DD9" : "rgba(255,255,255,.08)", color: "#fff" }}>{message.content}</p></article>)}
          </div>
          <form onSubmit={send} className="flex gap-2 border-t p-2.5" style={{ borderColor: "rgba(148,163,184,.14)" }}><input value={text} onChange={event => setText(event.target.value)} disabled={!selectedId} maxLength={2000} placeholder={selectedId ? "Escribe un mensaje..." : "Selecciona una persona"} className="min-w-0 flex-1 rounded-lg border bg-slate-900 px-2.5 py-2 text-xs text-white outline-none disabled:opacity-50" style={{ borderColor: "rgba(148,163,184,.2)" }} /><button type="submit" disabled={!selectedId || !text.trim()} className="grid size-9 place-items-center rounded-lg bg-cyan-300 text-slate-950 disabled:opacity-40" title="Enviar"><Send size={14} /></button></form>
        </div>
      </div>
    </section>
  );
}
