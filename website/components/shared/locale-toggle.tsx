"use client";

import * as React from "react";
import { useLocale } from "@/lib/intl/provider";
import { Button } from "@/components/ui/button";
import { Globe } from "lucide-react";

export function LocaleToggle() {
  const { locale, setLocale } = useLocale();

  const toggle = () => {
    setLocale(locale === "en" ? "ru" : "en");
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      aria-label={`Current language: ${locale.toUpperCase()}. Click to switch language.`}
      className="h-9 px-2.5 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5 hover:bg-secondary transition-colors"
    >
      <Globe className="w-3.5 h-3.5 text-muted-foreground" />
      <span className="uppercase text-foreground">{locale}</span>
    </Button>
  );
}
