"use client";

import React from "react";
import { CopyButton } from "@/components/shared/copy-button";
import { Terminal, ArrowRight } from "lucide-react";
import { useLocale } from "@/lib/intl/provider";

export function CTASection() {
  const { t } = useLocale();
  const installCmd = "npx koko-contextos-agents";

  return (
    <section id="cta" className="relative min-h-screen flex flex-col justify-center py-20 bg-background text-foreground overflow-hidden">
      {/* Ambient Spotlight Cone */}
      <div className="vercel-top-spotlight" />

      <div className="max-w-4xl mx-auto px-6 text-center space-y-8 relative z-10 w-full">
        <div className="space-y-3">
          <span className="text-xs font-mono font-medium tracking-widest text-muted-foreground uppercase">
            {t("cta.badge")}
          </span>
          <h2 className="text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight text-foreground leading-[1.02]">
            {t("cta.title")}
          </h2>
          <p className="text-base text-muted-foreground max-w-xl mx-auto font-normal">
            {t("cta.subtitle")}
          </p>
        </div>

        {/* CLI command box */}
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-card border border-border font-mono text-xs sm:text-sm shadow-xs">
            <div className="flex items-center gap-2 overflow-x-auto select-all text-left">
              <span className="text-muted-foreground select-none font-bold">$</span>
              <span className="text-foreground font-semibold">{installCmd}</span>
            </div>
            <CopyButton textToCopy={installCmd} showConfetti={true} />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <a
            href="https://github.com/kok-o/koko-contextos-agents"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto inline-flex h-10 items-center justify-center gap-2 rounded-full bg-primary text-primary-foreground font-semibold text-xs px-6 hover:opacity-90 transition-all shadow-sm active:scale-95"
          >
            <Terminal className="h-3.5 w-3.5" />
            <span>{t("cta.primary")}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </a>

          <a
            href="https://github.com/kok-o/koko-contextos-agents"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto inline-flex h-10 items-center justify-center gap-2 rounded-full border border-border bg-secondary px-6 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            <span>{t("cta.github")}</span>
          </a>
        </div>
      </div>
    </section>
  );
}
