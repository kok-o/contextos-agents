"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { LocaleToggle } from "@/components/shared/locale-toggle";
import { useLocale } from "@/lib/intl/provider";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "#skills",           tk: "nav.skills" },
  { href: "#slash-commands",   tk: "nav.slashCommands" },
  { href: "#skill-resolution", tk: "nav.skillResolution" },
  { href: "#profiles",         tk: "nav.profiles" },
  { href: "#how-it-works",     tk: "nav.howItWorks" },
];

export function Header() {
  const { t } = useLocale();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 12);
    fn();
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <>
      <header
        className={cn(
          "fixed top-0 left-0 right-0 z-50 transition-all duration-200",
          scrolled
            ? "bg-black/80 backdrop-blur-xl border-b border-border"
            : "bg-transparent border-b border-transparent"
        )}
      >
        <div className="max-w-[1200px] mx-auto px-6 h-14 flex items-center justify-between">
          {/* Logo + Nav */}
          <div className="flex items-center gap-8">
            <Link
              href="/"
              className="flex items-center gap-2.5 group focus-visible:ring-1 focus-visible:ring-ring rounded"
            >
              <Image
                src="/logo.png"
                alt="ContextOS"
                width={22}
                height={22}
                className="rounded shrink-0 object-contain opacity-90 group-hover:opacity-100 transition-opacity"
                priority
              />
              <span className="text-sm font-semibold tracking-tight text-foreground">
                ContextOS
              </span>
            </Link>

            {/* Desktop nav */}
            <nav className="hidden lg:flex items-center gap-5 text-[13px] text-muted-foreground">
              {NAV_LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  className="hover:text-foreground transition-colors duration-150"
                >
                  {t(l.tk)}
                </a>
              ))}
            </nav>
          </div>

          {/* Right actions */}
          <div className="hidden lg:flex items-center gap-2">
            <LocaleToggle />
            <ThemeToggle />
            <a
              href="https://github.com/kok-o/koko-contextos-agents"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-md"
            >
              {t("nav.github")}
            </a>
            <a
              href="#how-it-works"
              className="inline-flex h-8 items-center justify-center rounded-full bg-white text-black text-xs font-semibold px-4 hover:opacity-90 transition-all active:scale-95"
            >
              {t("nav.install")}
            </a>
          </div>

          {/* Mobile */}
          <div className="flex items-center gap-2 lg:hidden">
            <LocaleToggle />
            <ThemeToggle />
            <button
              type="button"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              onClick={() => setMobileOpen(!mobileOpen)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors"
            >
              {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-x-0 top-14 z-40 border-b border-border bg-black/95 backdrop-blur-2xl p-6 lg:hidden">
          <nav className="flex flex-col gap-4 text-sm text-muted-foreground mb-6">
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setMobileOpen(false)}
                className="hover:text-foreground py-0.5 transition-colors"
              >
                {t(l.tk)}
              </a>
            ))}
          </nav>
          <a
            href="#how-it-works"
            onClick={() => setMobileOpen(false)}
            className="inline-flex h-9 w-full items-center justify-center rounded-full bg-white text-black text-xs font-semibold"
          >
            {t("nav.install")} ContextOS
          </a>
        </div>
      )}
    </>
  );
}
