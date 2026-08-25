"use client";

import React from "react";
import { useLocale } from "@/lib/intl/provider";

export function ProblemSection() {
  const { t } = useLocale();

  const withoutPoints = [
    t("problem.without.p1"),
    t("problem.without.p2"),
    t("problem.without.p3"),
    t("problem.without.p4"),
  ];

  const withPoints = [
    t("problem.with.p1"),
    t("problem.with.p2"),
    t("problem.with.p3"),
    t("problem.with.p4"),
  ];

  return (
    <section id="problem" className="relative min-h-screen flex flex-col justify-center py-20 bg-background text-foreground">
      <div className="max-w-[1300px] mx-auto px-6 space-y-14 w-full">
        {/* Section Header */}
        <div className="space-y-3">
          <span className="text-xs font-mono font-medium tracking-widest text-muted-foreground uppercase">
            {t("problem.badge")}
          </span>
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-foreground max-w-3xl leading-[1.05]">
            {t("problem.title")}
          </h2>
          <p className="text-base text-muted-foreground max-w-2xl font-normal">
            {t("problem.subtitle")}
          </p>
        </div>

        {/* 2 Even Column Cards (Monochrome Minimalism) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Column 1: Without ContextOS */}
          <div className="vercel-card-flat p-8 space-y-6 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-border/40 pb-4">
                <h3 className="text-lg font-bold text-foreground tracking-tight">
                  {t("problem.without.title")}
                </h3>
                <span className="text-xs font-mono text-muted-foreground uppercase">
                  {t("problem.without.badge")}
                </span>
              </div>

              <ul className="space-y-3.5">
                {withoutPoints.map((point, index) => (
                  <li key={index} className="flex items-start gap-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    <span className="text-muted-foreground/60 font-mono select-none">—</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="pt-4 border-t border-border/30 font-mono text-xs text-muted-foreground">
              {t("problem.without.result")}
            </div>
          </div>

          {/* Column 2: With ContextOS */}
          <div className="vercel-card-flat p-8 space-y-6 flex flex-col justify-between border-border bg-card">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-border/40 pb-4">
                <h3 className="text-lg font-bold text-foreground tracking-tight">
                  {t("problem.with.title")}
                </h3>
                <span className="text-xs font-mono text-foreground uppercase font-semibold">
                  {t("problem.with.badge")}
                </span>
              </div>

              <ul className="space-y-3.5">
                {withPoints.map((point, index) => (
                  <li key={index} className="flex items-start gap-3 text-xs sm:text-sm text-foreground leading-relaxed font-medium">
                    <span className="text-primary font-mono select-none font-bold">✓</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="pt-4 border-t border-border/30 font-mono text-xs text-muted-foreground font-medium">
              {t("problem.with.result")}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
