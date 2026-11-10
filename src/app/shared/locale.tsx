import { createContext, useContext, type ReactNode } from "react";
import { pageCopy, type UiLocale } from "./copy";

const LocaleContext = createContext<UiLocale>("en");

/** Page language. Knot pages in this build are Simplified Chinese. */
export function LocaleProvider({ locale, children }: { locale: UiLocale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export const useLocale = () => useContext(LocaleContext);

export const useCopy = () => pageCopy(useLocale());

export const localeForKnot = (_id: string): UiLocale => "zh-CN";
