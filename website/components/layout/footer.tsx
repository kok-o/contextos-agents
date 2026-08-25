"use client";

import React from "react";
import Image from "next/image";
import { useLocale } from "@/lib/intl/provider";

export function Footer() {
  const { t } = useLocale();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-background text-muted-foreground py-10 text-xs">
      <div className="max-w-[1200px] mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-5">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <Image
            src="/logo.png"
            alt="ContextOS"
            width={18}
            height={18}
            className="rounded shrink-0 object-contain opacity-80"
          />
          <span className="text-foreground font-semibold text-sm">ContextOS</span>
          <span className="text-muted-foreground/40">·</span>
          <span className="text-muted-foreground/60">
            {t("footer.copyright").replace("{year}", String(year))}
          </span>
        </div>

        {/* Links */}
        <div className="flex items-center gap-5">
          <a
            href="https://github.com/kok-o/koko-contextos-agents"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            GitHub
          </a>
          <a
            href="https://www.npmjs.com/package/koko-contextos-agents"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            npm
          </a>
          <a href="#hero" className="hover:text-foreground transition-colors">
            {t("footer.backToTop")}
          </a>
        </div>
      </div>
    </footer>
  );
}
