import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { defaultLocale, locales, type Locale } from "./config";

/**
 * Configuration i18n côté serveur (next-intl, mode "sans routing").
 *
 * La langue n'apparaît pas dans l'URL : elle est lue depuis le cookie
 * NEXT_LOCALE (posé par le sélecteur de langue de la navbar). À défaut,
 * l'anglais est utilisé.
 */
export default getRequestConfig(async () => {
  const cookieLocale = cookies().get("NEXT_LOCALE")?.value;
  const locale = (locales as readonly string[]).includes(cookieLocale ?? "")
    ? (cookieLocale as Locale)
    : defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
