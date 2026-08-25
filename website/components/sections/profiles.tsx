"use client";

import React from "react";
import { useLocale } from "@/lib/intl/provider";

const PROFILES = [
  { id: "mvp",        titleKey: "profiles.mvp.title",        descKey: "profiles.mvp.desc",        idealKey: "profiles.mvp.idealFor",        cmd: "--profile mvp" },
  { id: "startup",    titleKey: "profiles.startup.title",    descKey: "profiles.startup.desc",    idealKey: "profiles.startup.idealFor",    cmd: "--profile startup" },
  { id: "enterprise", titleKey: "profiles.enterprise.title", descKey: "profiles.enterprise.desc", idealKey: "profiles.enterprise.idealFor", cmd: "--profile enterprise" },
  { id: "frontend",   titleKey: "profiles.frontend.title",   descKey: "profiles.frontend.desc",   idealKey: "profiles.frontend.idealFor",   cmd: "--profile frontend" },
  { id: "backend",    titleKey: "profiles.backend.title",    descKey: "profiles.backend.desc",    idealKey: "profiles.backend.idealFor",    cmd: "--profile backend" },
];

export function ProfilesSection() {
  const { t } = useLocale();

  return (
    <section
      id="profiles"
      className="relative py-28 bg-background text-foreground overflow-hidden"
    >
      <div className="max-w-[1200px] mx-auto px-6 w-full">

        {/* Header */}
        <div className="mb-16">
          <p className="vpill mb-5">{t("profiles.badge")}</p>
          <h2 className="v-section-title max-w-2xl">
            {t("profiles.title")}
          </h2>
          <p className="mt-4 text-sm text-muted-foreground max-w-lg leading-relaxed">
            {t("profiles.subtitle")}
          </p>
        </div>

        {/* Bento grid — Vercel "recently shipped" style */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-px bg-border rounded-xl overflow-hidden border border-border">
          {PROFILES.map((p, i) => (
            <div
              key={p.id}
              className="group bg-background hover:bg-[#0a0a0a] transition-colors duration-200 p-6 flex flex-col justify-between min-h-[220px]"
            >
              <div className="space-y-3">
                {/* Profile ID badge */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/50 font-medium">
                    {p.id}
                  </span>
                  <span className="text-[9px] font-mono text-muted-foreground/30 uppercase tracking-wider">
                    {t("profiles.badgeTag")}
                  </span>
                </div>

                {/* Title */}
                <h3 className="text-sm font-bold text-foreground tracking-tight leading-tight group-hover:text-white transition-colors">
                  {t(p.titleKey)}
                </h3>

                {/* Description */}
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t(p.descKey)}
                </p>
              </div>

              {/* Bottom */}
              <div className="pt-4 space-y-2 mt-4 border-t border-border/40">
                <div className="text-[11px] text-muted-foreground/60">
                  <span className="text-muted-foreground font-medium">{t("profiles.target")} </span>
                  {t(p.idealKey)}
                </div>
                <code className="block text-[11px] font-mono text-foreground/60 bg-white/[0.03] rounded px-2 py-1 border border-border/50">
                  {p.cmd}
                </code>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
