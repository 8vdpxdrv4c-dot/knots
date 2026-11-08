import { createContext, useContext, type ReactNode } from "react";
import { isZhKnot, pageCopy, type UiLocale } from "./copy";

const LocaleContext = createContext<UiLocale>("en");

/** Page-scoped language. Defaults to English, so other knot pages stay as they are. */
export function LocaleProvider({ locale, children }: { locale: UiLocale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export const useLocale = () => useContext(LocaleContext);

export const useCopy = () => pageCopy(useLocale());

export const localeForKnot = (id: string): UiLocale => (isZhKnot(id) ? "zh-CN" : "en");
