import type { Metadata } from "next";
import { fontSans, fontMono } from "@/lib/fonts";
import { ThemeProvider } from "@/components/theme-provider";
import { IntlProviderWrapper } from "@/lib/intl/provider";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import "./globals.css";

export const metadata: Metadata = {
  title: "ContextOS — Teach Your AI Assistant to Code Like a Senior",
  description:
    "Open-source skills and behavioral rules for AI coding assistants (Cursor, Claude, Gemini, Copilot, Zed). 28 modular skills. Zero context bloat.",
  keywords: [
    "AI agents",
    "ContextOS",
    "prompt engineering",
    "Cursor rules",
    "Claude Code skills",
    "Antigravity IDE",
    "copilot instructions",
    "software engineering",
    "coding assistant",
  ],
  authors: [{ name: "kok-o" }],
  creator: "kok-o",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://github.com/kok-o/koko-contextos-agents",
    title: "ContextOS — Teach Your AI Assistant to Code Like a Senior",
    description:
      "Open-source skills and behavioral rules for AI coding assistants. 28 modular skills. Zero context bloat.",
    siteName: "ContextOS",
  },
  twitter: {
    card: "summary_large_image",
    title: "ContextOS — Teach Your AI Assistant to Code Like a Senior",
    description:
      "Open-source skills and behavioral rules for AI coding assistants. 28 modular skills. Zero context bloat.",
  },
  icons: {
    icon: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fontSans.variable} ${fontMono.variable} scroll-smooth`}
    >
      <body className="min-h-screen bg-background text-foreground antialiased selection:bg-primary/20 selection:text-primary flex flex-col font-sans">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <IntlProviderWrapper>
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
          </IntlProviderWrapper>
        </ThemeProvider>
      </body>
    </html>
  );
}
