"use client";

import React from "react";
import { CopyButton } from "@/components/shared/copy-button";
import { useLocale } from "@/lib/intl/provider";

const STEPS = [
  { num: "01", titleKey: "how.step1.title", descKey: "how.step1.desc", cmd: "npx koko-contextos-agents", copyable: true },
  { num: "02", titleKey: "how.step2.title", descKey: "how.step2.desc", cmd: "node .agents/ctx.js detect", copyable: false },
  { num: "03", titleKey: "how.step3.title", descKey: "how.step3.desc", cmd: "/spec → /plan → /build", copyable: false },
];

export function HowItWorksSection() {
  const { t } = useLocale();

  return (
    <section
      id="how-it-works"
      className="relative py-28 bg-background text-foreground overflow-hidden"
    >
      {/* Top glow */}
      <div className="vercel-glow-top" />

      <div className="max-w-[1200px] mx-auto px-6 w-full relative z-10">
        {/* Header */}
        <div className="mb-16">
          <p className="vpill mb-5">{t("how.badge")}</p>
          <h2 className="v-section-title max-w-xl">
            {t("how.title")}
          </h2>
          <p className="mt-4 text-sm text-muted-foreground max-w-lg leading-relaxed">
            {t("how.subtitle")}
          </p>
        </div>

        {/* 3-column Vercel-style steps — connected with a thin line */}
        <div className="relative grid grid-cols-1 md:grid-cols-3 gap-0">
          {/* Connector line (desktop) */}
          <div className="hidden md:block absolute top-8 left-[16.67%] right-[16.67%] h-px bg-border z-0" />

          {STEPS.map((step, idx) => (
            <div key={step.num} className="relative p-6 sm:p-8 flex flex-col gap-5 group">
              {/* Step number bubble */}
              <div className="relative z-10 w-14 h-14 rounded-full border border-border bg-background flex items-center justify-center group-hover:border-border-hover transition-colors duration-200">
                <span className="font-mono text-sm font-bold text-muted-foreground group-hover:text-foreground transition-colors">
                  {step.num}
                </span>
              </div>

              {/* Content */}
              <div className="space-y-2">
                <h3 className="text-base font-bold text-foreground tracking-tight">
                  {t(step.titleKey)}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t(step.descKey)}
                </p>
              </div>

              {/* Command block */}
              <div className="mt-auto">
                <div className="flex items-center justify-between gap-2 rounded-lg bg-[#0a0a0a] border border-border px-3 py-2.5">
                  <code className="font-mono text-xs text-foreground/80 truncate">
                    {step.cmd}
                  </code>
                  {step.copyable && (
                    <CopyButton textToCopy={step.cmd} showConfetti={false} className="h-6 w-6 flex-shrink-0" />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Final install CTA */}
        <div className="mt-16 pt-16 border-t border-border text-center space-y-6">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground/50">
            {t("cta.badge")}
          </p>
          <h2
            className="font-bold tracking-tight text-foreground mx-auto"
            style={{ fontSize: "clamp(28px, 4vw, 56px)", letterSpacing: "-0.03em", lineHeight: "1.05", maxWidth: "700px" }}
          >
            {t("cta.title")}
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
            {t("cta.subtitle")}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <a
              href="https://github.com/kok-o/koko-contextos-agents"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-full bg-white text-black font-semibold text-xs px-6 hover:opacity-90 transition-all active:scale-95"
            >
              {t("cta.primary")}
            </a>
            <a
              href="https://github.com/kok-o/koko-contextos-agents"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-border text-muted-foreground text-xs px-6 hover:border-border-hover hover:text-foreground transition-all"
            >
              {t("cta.github")}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
