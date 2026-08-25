"use client";

import React from "react";
import { ArrowRight } from "lucide-react";
import { CopyButton } from "@/components/shared/copy-button";
import { useLocale } from "@/lib/intl/provider";

export function HeroSection() {
  const { t } = useLocale();
  const installCmd = "npx koko-contextos-agents";

  return (
    <section
      id="hero"
      className="relative overflow-hidden flex flex-col justify-center min-h-screen pt-20 pb-16 bg-background text-foreground"
    >
      {/* Vercel-style top spotlight cone */}
      <div className="vercel-glow-top" />

      {/* Subtle grid */}
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          maskImage:
            "radial-gradient(ellipse 80% 70% at 50% 0%, black 40%, transparent 100%)",
        }}
      />

      <div className="max-w-[1200px] mx-auto px-6 relative z-10 w-full">
        {/* Badge */}
        <div className="mb-8 flex justify-center">
          <span className="vpill">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
            {t("hero.badge")}
          </span>
        </div>

        {/* Editorial title */}
        <div className="text-center space-y-4 mb-10">
          <h1 className="v-hero-title">
            {t("hero.title")}
          </h1>
          <p
            className="font-bold tracking-tight text-muted-foreground leading-tight"
            style={{
              fontSize: "clamp(28px, 4.5vw, 64px)",
              letterSpacing: "-0.03em",
              lineHeight: "1.05",
            }}
          >
            {t("hero.tagline")}
          </p>
        </div>

        {/* Tags line */}
        <p className="text-center text-[11px] font-mono tracking-widest text-muted-foreground/60 uppercase mb-6">
          {t("hero.tags")}
        </p>

        {/* Subtitle */}
        <p className="text-center text-sm sm:text-base text-muted-foreground max-w-lg mx-auto leading-relaxed mb-10">
          {t("hero.subtitle")}
        </p>

        {/* Install command — Vercel style pill */}
        <div className="flex justify-center mb-6">
          <div className="flex items-center gap-3 px-4 py-2 rounded-full border border-border bg-[#0a0a0a] font-mono text-xs sm:text-sm shadow-lg shadow-black/40 max-w-md w-full">
            <span className="text-muted-foreground/60 select-none">$</span>
            <span className="text-foreground font-medium flex-1 select-all">{installCmd}</span>
            <CopyButton textToCopy={installCmd} showConfetti={true} />
          </div>
        </div>

        {/* CTA buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <a href="#how-it-works">
            <button className="h-9 px-6 rounded-full bg-white text-black font-semibold text-xs hover:opacity-90 transition-all flex items-center gap-2 active:scale-95 shadow-sm cursor-pointer">
              <span>{t("hero.getStarted")}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </a>
          <a href="#slash-commands">
            <button className="h-9 px-6 rounded-full border border-border text-muted-foreground font-medium text-xs transition-all hover:border-border-hover hover:text-foreground flex items-center gap-2 cursor-pointer">
              <span>{t("hero.viewSlashCommands")}</span>
            </button>
          </a>
        </div>
      </div>

      {/* Bottom fade */}
      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-32 z-10"
        style={{
          background:
            "linear-gradient(to bottom, transparent, var(--background))",
        }}
      />
    </section>
  );
}
