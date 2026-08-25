"use client";

import React, { useState } from "react";
import { useLocale } from "@/lib/intl/provider";
import {
  FileText,
  GitBranch,
  Code2,
  FlaskConical,
  Minimize2,
  Eye,
  Rocket,
} from "lucide-react";

const COMMANDS = [
  {
    cmd: "/spec",
    roleKey: "slash.spec.role",
    descKey: "slash.spec.desc",
    icon: FileText,
    accent: "#a78bfa", // violet
  },
  {
    cmd: "/plan",
    roleKey: "slash.plan.role",
    descKey: "slash.plan.desc",
    icon: GitBranch,
    accent: "#60a5fa", // blue
  },
  {
    cmd: "/build",
    roleKey: "slash.build.role",
    descKey: "slash.build.desc",
    icon: Code2,
    accent: "#34d399", // emerald
  },
  {
    cmd: "/test",
    roleKey: "slash.test.role",
    descKey: "slash.test.desc",
    icon: FlaskConical,
    accent: "#fbbf24", // amber
  },
  {
    cmd: "/simplify",
    roleKey: "slash.simplify.role",
    descKey: "slash.simplify.desc",
    icon: Minimize2,
    accent: "#f87171", // rose
  },
  {
    cmd: "/review",
    roleKey: "slash.review.role",
    descKey: "slash.review.desc",
    icon: Eye,
    accent: "#22d3ee", // cyan
  },
  {
    cmd: "/ship",
    roleKey: "slash.ship.role",
    descKey: "slash.ship.desc",
    icon: Rocket,
    accent: "#e879f9", // fuchsia
  },
];

export function SlashCommandsSection() {
  const { t } = useLocale();
  const [active, setActive] = useState<string | null>(null);

  return (
    <section
      id="slash-commands"
      className="relative py-28 bg-background text-foreground overflow-hidden"
    >
      <div className="max-w-[1200px] mx-auto px-6 w-full">

        {/* Section header — Vercel editorial style */}
        <div className="mb-16">
          <p className="vpill mb-5">{t("slash.badge")}</p>
          <h2 className="v-section-title max-w-2xl">
            {t("slash.title")}
            <span className="text-muted-foreground"> {t("slash.tagline")}</span>
          </h2>
          <p className="mt-4 text-sm text-muted-foreground max-w-lg leading-relaxed">
            {t("slash.subtitle")}
          </p>
        </div>

        {/* Desktop: full-width table, Vercel-style with hover highlight row */}
        <div className="hidden md:block">
          {/* Column headers */}
          <div className="grid grid-cols-[200px_220px_1fr] border-b border-border pb-3 mb-1">
            <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/50">{t("slash.col.command")}</span>
            <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/50">{t("slash.col.role")}</span>
            <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/50">{t("slash.col.desc")}</span>
          </div>

          {COMMANDS.map((c, i) => {
            const Icon = c.icon;
            const isActive = active === c.cmd;
            return (
              <div
                key={c.cmd}
                className="group grid grid-cols-[200px_220px_1fr] items-center py-4 border-b border-border/50 last:border-0 cursor-default transition-all duration-150 rounded-lg px-2 -mx-2"
                style={{
                  background: isActive
                    ? `linear-gradient(90deg, ${c.accent}0d 0%, transparent 60%)`
                    : "transparent",
                }}
                onMouseEnter={() => setActive(c.cmd)}
                onMouseLeave={() => setActive(null)}
              >
                {/* Command */}
                <div className="flex items-center gap-3">
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0 transition-all duration-200"
                    style={{
                      background: c.accent,
                      opacity: isActive ? 1 : 0.4,
                      boxShadow: isActive ? `0 0 8px ${c.accent}` : "none",
                    }}
                  />
                  <code
                    className="text-sm font-mono font-semibold transition-colors duration-150"
                    style={{ color: isActive ? c.accent : "var(--muted-foreground)" }}
                  >
                    {c.cmd}
                  </code>
                </div>

                {/* Role */}
                <div className="flex items-center gap-2">
                  <Icon
                    className="w-3.5 h-3.5 flex-shrink-0 transition-colors duration-150"
                    style={{ color: isActive ? c.accent : "var(--muted-foreground)" }}
                  />
                  <span
                    className="text-xs font-medium transition-colors duration-150"
                    style={{ color: isActive ? "var(--foreground)" : "var(--muted-foreground)" }}
                  >
                    {t(c.roleKey)}
                  </span>
                </div>

                {/* Desc */}
                <p
                  className="text-xs leading-relaxed transition-colors duration-150 pr-4"
                  style={{ color: isActive ? "rgba(237,237,237,0.8)" : "var(--muted-foreground)" }}
                >
                  {t(c.descKey)}
                </p>
              </div>
            );
          })}
        </div>

        {/* Mobile: bento-style cards */}
        <div className="md:hidden grid grid-cols-1 gap-2">
          {COMMANDS.map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.cmd} className="vcard p-4 flex gap-4 items-start">
                <div className="flex items-center gap-2.5 flex-shrink-0 pt-0.5">
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: c.accent }}
                  />
                  <code className="text-sm font-mono font-semibold" style={{ color: c.accent }}>
                    {c.cmd}
                  </code>
                </div>
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                    <Icon className="w-3 h-3 flex-shrink-0 text-muted-foreground" />
                    <span>{t(c.roleKey)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {t(c.descKey)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
