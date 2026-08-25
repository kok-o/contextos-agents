"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { IntlProvider as ReactIntlProvider } from "react-intl";
import enMessages from "./en.json";
import ruMessages from "./ru.json";

type Locale = "en" | "ru";

const messagesMap: Record<Locale, Record<string, string>> = {
  en: enMessages,
  ru: ruMessages,
};

interface LocaleContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (id: string, values?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextType | undefined>(undefined);

function getStoredLocale(): Locale {
  if (typeof window === "undefined") return "en";
  try {
    const saved = localStorage.getItem("contextos_locale") as Locale;
    if (saved === "en" || saved === "ru") return saved;
    if (navigator.language.slice(0, 2) === "ru") return "ru";
  } catch {
    // ignore storage access errors
  }
  return "en";
}

export function IntlProviderWrapper({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    // Synchronize client-side locale if different from server default
    const clientLocale = getStoredLocale();
    if (clientLocale !== "en") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocaleState(clientLocale);
    }
  }, []);

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale);
    try {
      localStorage.setItem("contextos_locale", newLocale);
    } catch {
      // ignore
    }
  };

  const t = (id: string, values?: Record<string, string | number>): string => {
    let msg = messagesMap[locale]?.[id] || messagesMap.en[id] || id;
    if (values) {
      Object.entries(values).forEach(([key, val]) => {
        msg = msg.replace(new RegExp(`\\{${key}\\}`, "g"), String(val));
      });
    }
    return msg;
  };

  const currentMessages = messagesMap[locale] || messagesMap.en;

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
      <ReactIntlProvider
        locale={locale}
        messages={currentMessages}
        defaultLocale="en"
      >
        {children}
      </ReactIntlProvider>
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used within an IntlProviderWrapper");
  }
  return context;
}
