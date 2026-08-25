"use client";

import React, { useEffect, useRef, useState } from "react";
import { useLocale } from "@/lib/intl/provider";
import { Layers, ScanSearch, Package } from "lucide-react";

/* ── Terminal animation ─────────────────────────────── */

const LINES = [
  { type: "cmd",     text: "$ node .agents/ctx.js resolve" },
  { type: "arg",     text: '"Build an accessible modal with React and Tailwind"' },
  { type: "blank",   text: "" },
  { type: "dim",     text: "Scanning 28 skills..." },
  { type: "blank",   text: "" },
  { type: "blue",    text: "[DOMAIN: Frontend]" },
  { type: "green",   text: "[PHASE: Build]" },
  { type: "violet",  text: "[ROLE: Senior Developer]" },
  { type: "blank",   text: "" },
  { type: "dim",     text: "Skills loaded:" },
  { type: "skill",   text: "  ✓ ponytail-mindset" },
  { type: "skill",   text: "  ✓ engineering-workflow" },
  { type: "skill",   text: "  ✓ react" },
  { type: "skill",   text: "  ✓ ui-ux-pro" },
  { type: "skill",   text: "  ✓ web-accessibility" },
  { type: "blank",   text: "" },
  { type: "success", text: "Context: 4,180 tokens  (saved −95.6%)" },
];

const lineColor: Record<string, string> = {
  cmd:     "#888",
  arg:     "#ededed",
  dim:     "rgba(255,255,255,0.35)",
  blue:    "#60a5fa",
  green:   "#34d399",
  violet:  "#a78bfa",
  skill:   "#34d399",
  success: "#ffffff",
  blank:   "transparent",
};

function Terminal() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting && !started) setStarted(true); },
      { threshold: 0.3 }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [started]);

  useEffect(() => {
    if (!started) return;
    setVisible(0);
    const timers = LINES.map((_, i) =>
      setTimeout(() => setVisible((v) => Math.max(v, i + 1)), i * 85 + (i > 1 ? 180 : 0))
    );
    return () => timers.forEach(clearTimeout);
  }, [started]);

  return (
    <div
      ref={ref}
      className="vwindow w-full"
    >
      {/* Chrome bar */}
      <div className="vwindow-bar">
        <span className="vwindow-dot bg-red-500/70" />
        <span className="vwindow-dot bg-amber-500/70" />
        <span className="vwindow-dot bg-emerald-500/70" />
        <span className="ml-4 text-[11px] font-mono text-muted-foreground/40">
          ctx.js — context engine
        </span>
      </div>

      {/* Terminal content */}
      <div className="p-5 sm:p-6 font-mono text-[12px] sm:text-[13px] leading-loose min-h-[340px]">
        {LINES.slice(0, visible).map((line, i) => (
          <div
            key={i}
            style={{ color: lineColor[line.type] }}
            className="whitespace-pre"
          >
            {line.text || "\u00a0"}
          </div>
        ))}
        {visible < LINES.length && (
          <span
            className="inline-block w-[7px] h-[14px] align-middle ml-px cursor-blink"
            style={{ background: "rgba(255,255,255,0.75)" }}
          />
        )}
      </div>
    </div>
  );
}

/* ── Features ───────────────────────────────────────── */
const FEATURES = [
  { icon: ScanSearch, tk: "resolve.feature1.title", dk: "resolve.feature1.desc" },
  { icon: Layers,     tk: "resolve.feature2.title", dk: "resolve.feature2.desc" },
  { icon: Package,    tk: "resolve.feature3.title", dk: "resolve.feature3.desc" },
];

const CLI_CMDS = [
  { label: "Resolve by task:", cmd: 'node .agents/ctx.js resolve "Build modal"' },
  { label: "Resolve by file:", cmd: 'node .agents/ctx.js resolve --files "app/api/auth/route.ts"' },
  { label: "Build skills index:", cmd: "node .agents/ctx.js index" },
];

export function SkillResolutionSection() {
  const { t } = useLocale();

  return (
    <section
      id="skill-resolution"
      className="relative py-28 bg-background text-foreground overflow-hidden"
    >
      {/* Bottom glow */}
      <div className="vercel-glow-bottom" />

      <div className="max-w-[1200px] mx-auto px-6 w-full relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 lg:gap-20 items-center">

          {/* Left column */}
          <div className="space-y-10">
            <div className="space-y-5">
              <p className="vpill">{t("resolve.badge")}</p>
              <h2 className="v-section-title">{t("resolve.title")}</h2>
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-md">
                {t("resolve.subtitle")}
              </p>
            </div>

            {/* CLI commands — minimal monospace blocks */}
            <div className="space-y-2">
              {CLI_CMDS.map((item, i) => (
                <div key={i} className="vcard px-4 py-3 space-y-1">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/40">
                    {item.label}
                  </span>
                  <code className="block text-xs text-foreground/80 font-mono leading-relaxed truncate">
                    {item.cmd}
                  </code>
                </div>
              ))}
            </div>

            {/* Feature chips */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {FEATURES.map((f) => {
                const Icon = f.icon;
                return (
                  <div key={f.tk} className="vcard p-4 space-y-2">
                    <Icon className="w-4 h-4 text-muted-foreground" />
                    <p className="text-xs font-semibold text-foreground tracking-tight leading-tight">
                      {t(f.tk)}
                    </p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {t(f.dk)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: terminal */}
          <div className="w-full">
            <Terminal />
          </div>
        </div>
      </div>
    </section>
  );
}
