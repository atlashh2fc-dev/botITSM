"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Activity, MonitorCog, Network, ServerCog } from "lucide-react";
import { AtlasAssistant } from "@/components/chat/AtlasAssistant";

export function SupportPortal() {
  return (
    <main className="relative h-dvh overflow-hidden bg-[radial-gradient(circle_at_24%_12%,rgba(14,165,233,0.18),transparent_28%),radial-gradient(circle_at_82%_24%,rgba(15,23,42,0.11),transparent_30%),radial-gradient(circle_at_50%_92%,rgba(20,184,166,0.14),transparent_30%),linear-gradient(145deg,#f7fbff_0%,#eef5f8_52%,#fbfdff_100%)] px-4 py-4">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.035)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:radial-gradient(circle_at_center,black,transparent_82%)]" />
      <div className="pointer-events-none absolute left-1/2 top-[52%] h-[560px] w-[760px] -translate-x-1/2 -translate-y-1/2 rounded-[48px] border border-white/60 bg-white/[0.22] shadow-[0_40px_120px_rgba(15,23,42,0.08)]" />
      <div className="pointer-events-none absolute inset-x-0 top-28 mx-auto hidden max-w-5xl justify-between px-8 text-slate-400/55 lg:flex">
        <div className="grid gap-3">
          <StatusPill icon={<ServerCog size={15} aria-hidden />} label="Core services" />
          <StatusPill icon={<Network size={15} aria-hidden />} label="Network" />
        </div>
        <div className="grid gap-3 pt-14">
          <StatusPill icon={<Activity size={15} aria-hidden />} label="Operations" />
          <StatusPill icon={<MonitorCog size={15} aria-hidden />} label="Workplace" />
        </div>
      </div>

      <div className="relative mx-auto flex h-full max-w-6xl flex-col">
        <header className="flex h-10 shrink-0 items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="size-2.5 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,0.18)]" />
            <span className="text-sm font-medium text-slate-600">Disponible</span>
          </div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/64 px-2.5 py-1 text-[11px] font-medium text-slate-500 shadow-sm backdrop-blur-xl transition hover:border-cyan-200 hover:text-slate-950"
          >
            <MonitorCog size={13} aria-hidden />
            Admin
          </Link>
        </header>

        <section className="flex min-h-0 flex-1 items-center justify-center pb-3 pt-1">
          <AtlasAssistant />
        </section>
      </div>
    </main>
  );
}

function StatusPill({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="inline-flex h-9 items-center gap-2 rounded-full border border-white/70 bg-white/48 px-3 text-xs font-medium shadow-sm backdrop-blur-xl">
      {icon}
      {label}
    </div>
  );
}
