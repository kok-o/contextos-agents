"use client";

import React from "react";
import { AnimatedCounter } from "@/components/shared/animated-counter";
import { Lock, Layout, Boxes, FileCode, Workflow } from "lucide-react";
import { useLocale } from "@/lib/intl/provider";

export function BenchmarksSection() {
  const { t } = useLocale();

  const scenarios = [
    {
      icon: Lock,
      name: t("benchmarks.s1.name"),
      vanilla: 67,
      contextos: 77,
      delta: "+10 pts",
      note: t("benchmarks.s1.note"),
    },
    {
      icon: Layout,
      name: t("benchmarks.s2.name"),
      vanilla: 77,
      contextos: 94,
      delta: "+17 pts",
      note: t("benchmarks.s2.note"),
    },
    {
      icon: Boxes,
      name: t("benchmarks.s3.name"),
      vanilla: 69,
      contextos: 73,
      delta: "+4 pts",
      note: t("benchmarks.s3.note"),
    },
    {
      icon: FileCode,
      name: t("benchmarks.s4.name"),
      vanilla: 67,
      contextos: 69,
      delta: "+2 pts",
      note: t("benchmarks.s4.note"),
    },
    {
      icon: Workflow,
      name: t("benchmarks.s5.name"),
      vanilla: "Evaluated",
      contextos: "Verified",
      delta: "Pass ✓",
      note: t("benchmarks.s5.note"),
    },
  ];

  return (
    <section id="benchmarks" className="relative min-h-screen flex flex-col justify-center py-20 bg-background text-foreground">
      <div className="max-w-[1300px] mx-auto px-6 space-y-14 w-full">
        {/* Section Header */}
        <div className="space-y-3">
          <span className="text-xs font-mono font-medium tracking-widest text-muted-foreground uppercase">
            {t("benchmarks.badge")}
          </span>
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-foreground max-w-3xl leading-[1.05]">
            {t("benchmarks.title")}
          </h2>
          <p className="text-base text-muted-foreground max-w-2xl font-normal">
            {t("benchmarks.subtitle")}
          </p>
        </div>

        {/* Top 3 KPI Metric Cards — All on ONE Level */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="vercel-card-flat p-6 space-y-2">
            <div className="text-3xl sm:text-4xl font-extrabold text-foreground font-mono tabular-nums tracking-tight">
              <AnimatedCounter to={17} prefix="+" suffix=" pts" />
            </div>
            <p className="text-xs text-muted-foreground font-medium">
              {t("benchmarks.kpi.a11y")}
            </p>
          </div>

          <div className="vercel-card-flat p-6 space-y-2">
            <div className="text-3xl sm:text-4xl font-extrabold text-foreground font-mono tabular-nums tracking-tight">
              <AnimatedCounter to={10} prefix="+" suffix=" pts" />
            </div>
            <p className="text-xs text-muted-foreground font-medium">
              {t("benchmarks.kpi.security")}
            </p>
          </div>

          <div className="vercel-card-flat p-6 space-y-2">
            <div className="text-3xl sm:text-4xl font-extrabold text-foreground font-mono tabular-nums tracking-tight">
              <AnimatedCounter to={54} suffix="%" />
            </div>
            <p className="text-xs text-muted-foreground font-medium">
              {t("benchmarks.kpi.reduction")}
            </p>
          </div>
        </div>

        {/* High-Contrast Table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/60 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="p-4 pl-6">{t("benchmarks.col.scenario")}</th>
                  <th className="p-4 text-center">{t("benchmarks.col.vanilla")}</th>
                  <th className="p-4 text-center">{t("benchmarks.col.contextos")}</th>
                  <th className="p-4 pr-6 text-right">{t("benchmarks.col.delta")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {scenarios.map((s, idx) => (
                  <tr key={idx} className="hover:bg-muted/40 transition-colors">
                    <td className="p-4 pl-6">
                      <div>
                        <div className="font-semibold text-foreground text-sm tracking-tight">{s.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 leading-normal max-w-lg">
                          {s.note}
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-center font-mono text-xs text-muted-foreground">
                      {typeof s.vanilla === "number" ? `${s.vanilla} / 100` : s.vanilla}
                    </td>
                    <td className="p-4 text-center font-mono text-xs font-bold text-foreground">
                      {typeof s.contextos === "number" ? `${s.contextos} / 100` : s.contextos}
                    </td>
                    <td className="p-4 pr-6 text-right">
                      <span className="inline-flex items-center font-mono text-xs font-semibold px-2.5 py-0.5 rounded border border-border bg-secondary text-foreground">
                        {s.delta}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
