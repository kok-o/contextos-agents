"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import confetti from "canvas-confetti";

interface CopyButtonProps {
  textToCopy: string;
  className?: string;
  showConfetti?: boolean;
}

export function CopyButton({
  textToCopy,
  className,
  showConfetti = true,
}: CopyButtonProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);

      if (showConfetti) {
        try {
          confetti({
            particleCount: 35,
            spread: 55,
            origin: { y: 0.7 },
            colors: ["#f59e0b", "#fbbf24", "#d97706", "#ffffff"],
            disableForReducedMotion: true,
          });
        } catch {
          // ignore if canvas not supported
        }
      }

      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={handleCopy}
      aria-label={copied ? "Copied command to clipboard" : `Copy command ${textToCopy}`}
      className={className || "h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-secondary/60 rounded-md"}
    >
      {copied ? (
        <Check className="h-4 w-4 text-emerald-500 transition-transform scale-110" />
      ) : (
        <Copy className="h-4 w-4 transition-transform hover:scale-105" />
      )}
    </Button>
  );
}
