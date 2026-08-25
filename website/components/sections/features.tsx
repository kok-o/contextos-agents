"use client";

import React, { useState } from "react";
import { useLocale } from "@/lib/intl/provider";
import { cn } from "@/lib/utils";

export function FeaturesSection() {
  const { t } = useLocale();

  const samplePrompts = [
    {
      id: "modal",
      labelKey: "features.scenario.modal",
      skills: ["web-accessibility", "react", "ui-ux-pro", "ponytail-mindset"],
      tokensBefore: "94,200",
      tokensAfter: "4,180",
      saved: "-95.6%",
    },
    {
      id: "auth",
      labelKey: "features.scenario.auth",
      skills: ["security", "system-design", "node", "database"],
      tokensBefore: "94,200",
      tokensAfter: "3,850",
      saved: "-95.9%",
    },
    {
      id: "ddd",
      labelKey: "features.scenario.ddd",
      skills: ["ddd", "system-design", "decisions", "testing"],
      tokensBefore: "94,200",
      tokensAfter: "4,420",
      saved: "-95.3%",
    },
  ];

  const [selectedPrompt, setSelectedPrompt] = useState(samplePrompts[0]);

  return (
    <div id="features" className="bg-background text-foreground">
      {/* ============================================================
          SHOWCASE 1: Mintlify Style (Headline Top Left, Large Window + Right Features)
          ============================================================ */}
      <div className="min-h-screen flex flex-col justify-center py-20 w-full">
        <div className="max-w-[1300px] mx-auto px-6 space-y-10 w-full">
          {/* Top Headline */}
          <h2 className="text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight text-foreground max-w-2xl leading-[1.05]">
            {t("features.showcase1.title")}
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            {/* Main Large Showcase Window (Span 8) */}
            <div className="lg:col-span-8 relative">
              <div className="vercel-ambient-shadow" />

              <div className="vercel-window">
                {/* Window Bar */}
                <div className="flex items-center justify-between border-b border-border bg-muted/60 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-semibold text-foreground">
                      contextos-resolver
                    </span>
                    <span className="text-[11px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded border border-border">
                      {t("features.showcase1.active")}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30" />
                    <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30" />
                    <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30" />
                  </div>
                </div>

                {/* Showcase Body */}
                <div className="p-6 space-y-6 bg-card text-card-foreground">
                  <div className="space-y-2">
                    <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                      {t("features.showcase1.selectScenario")}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {samplePrompts.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setSelectedPrompt(p)}
                          className={cn(
                            "px-3 py-1.5 rounded text-xs font-mono transition-all border",
                            selectedPrompt.id === p.id
                              ? "bg-primary text-primary-foreground font-semibold border-primary"
                              : "bg-secondary text-muted-foreground border-border hover:text-foreground hover:bg-muted"
                          )}
                        >
                          {t(p.labelKey)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Live Console Output */}
                  <div className="rounded-lg border border-border bg-muted/40 p-4 font-mono text-xs space-y-3">
                    <div className="flex items-center justify-between text-muted-foreground border-b border-border/40 pb-2">
                      <span>{t("features.showcase1.resolvedSkills")}</span>
                      <span className="text-foreground font-medium">
                        {t("features.showcase1.skillsActive", { count: selectedPrompt.skills.length })}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {selectedPrompt.skills.map((s) => (
                        <span
                          key={s}
                          className="px-2 py-1 rounded bg-secondary text-foreground text-[11px] border border-border"
                        >
                          `{s}`
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center justify-between text-muted-foreground pt-1 text-[11px]">
                      <span>{t("features.showcase1.tokens")} <del className="opacity-60">{selectedPrompt.tokensBefore}</del> → <b className="text-foreground">{selectedPrompt.tokensAfter}</b></span>
                      <span className="text-foreground font-semibold">{selectedPrompt.saved} {t("features.showcase1.reduction")}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Side Annotation & Features List (Span 4) */}
            <div className="lg:col-span-4 space-y-8">
              <div className="space-y-3">
                <p className="text-lg sm:text-xl font-medium text-foreground leading-relaxed">
                  {t("features.showcase1.desc")}
                </p>
              </div>

              <div className="space-y-3 text-xs">
                <div className="font-mono text-muted-foreground uppercase tracking-widest">
                  {t("features.showcase1.label")}
                </div>
                <ul className="space-y-2 text-muted-foreground font-normal">
                  <li className="hover:text-foreground transition-colors">{t("features.showcase1.item1")}</li>
                  <li className="hover:text-foreground transition-colors">{t("features.showcase1.item2")}</li>
                  <li className="hover:text-foreground transition-colors">{t("features.showcase1.item3")}</li>
                  <li className="hover:text-foreground transition-colors">{t("features.showcase1.item4")}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================
          SHOWCASE 2: Zapier Style (Headline Top Right, Features Left + Large Window Right)
          ============================================================ */}
      <div className="min-h-screen flex flex-col justify-center py-20 w-full">
        <div className="max-w-[1300px] mx-auto px-6 space-y-10 w-full">
          {/* Top Headline */}
          <div className="flex justify-end">
            <h2 className="text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight text-foreground max-w-2xl text-right leading-[1.05]">
              {t("features.showcase2.title")}
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            {/* Left Side Annotation & Features List (Span 4) */}
            <div className="lg:col-span-4 space-y-8 order-2 lg:order-1">
              <div className="space-y-3">
                <p className="text-lg sm:text-xl font-medium text-foreground leading-relaxed">
                  {t("features.showcase2.desc")}
                </p>
              </div>

              <div className="space-y-3 text-xs">
                <div className="font-mono text-muted-foreground uppercase tracking-widest">
                  {t("features.showcase1.label")}
                </div>
                <ul className="space-y-2 text-muted-foreground font-normal">
                  <li className="hover:text-foreground transition-colors">{t("features.showcase2.item1")}</li>
                  <li className="hover:text-foreground transition-colors">{t("features.showcase2.item2")}</li>
                  <li className="hover:text-foreground transition-colors">{t("features.showcase2.item3")}</li>
                  <li className="hover:text-foreground transition-colors">{t("features.showcase2.item4")}</li>
                </ul>
              </div>
            </div>

            {/* Main Large Showcase Window (Span 8) */}
            <div className="lg:col-span-8 relative order-1 lg:order-2">
              <div className="vercel-ambient-shadow" />

              <div className="vercel-window">
                {/* Window Bar */}
                <div className="flex items-center justify-between border-b border-border bg-muted/60 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-semibold text-foreground">
                      invariants-auditor
                    </span>
                    <span className="text-[11px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded border border-border">
                      {t("features.showcase2.rulesChecked")}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30" />
                    <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30" />
                    <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30" />
                  </div>
                </div>

                {/* Showcase Body */}
                <div className="p-6 space-y-4 bg-card text-card-foreground font-mono text-xs">
                  <div className="text-muted-foreground border-b border-border/40 pb-2 text-[11px]">
                    {t("features.showcase2.invariantsTitle")}
                  </div>

                  <div className="space-y-2.5 text-xs text-foreground">
                    <div className="flex items-center justify-between p-2.5 rounded border border-border bg-muted/40">
                      <span className="text-muted-foreground">{t("features.showcase2.inv1")}</span>
                      <span className="text-foreground font-semibold">[PASS]</span>
                    </div>
                    <div className="flex items-center justify-between p-2.5 rounded border border-border bg-muted/40">
                      <span className="text-muted-foreground">{t("features.showcase2.inv2")}</span>
                      <span className="text-foreground font-semibold">[PASS]</span>
                    </div>
                    <div className="flex items-center justify-between p-2.5 rounded border border-border bg-muted/40">
                      <span className="text-muted-foreground">{t("features.showcase2.inv3")}</span>
                      <span className="text-foreground font-semibold">[PASS]</span>
                    </div>
                    <div className="flex items-center justify-between p-2.5 rounded border border-border bg-muted/40">
                      <span className="text-muted-foreground">{t("features.showcase2.inv4")}</span>
                      <span className="text-foreground font-semibold">[PASS]</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
