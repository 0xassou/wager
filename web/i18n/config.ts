/**
 * Configuration i18n partagée client/serveur (aucun import serveur ici).
 *
 * Pour ajouter une langue :
 *  1. Créer messages/<code>.json (copier en.json et traduire)
 *  2. Ajouter le code dans `locales` ci-dessous
 *  3. Ajouter son nom/drapeau dans `localeInfo`
 */
export const locales = [
  "en",
  "fr",
  "es",
  "ar",
  "pt",
  "de",
  "zh",
  "ja",
  "hi",
  "ru",
] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

/** Langues écrites de droite à gauche (le layout s'inverse en dir="rtl"). */
export const rtlLocales: readonly Locale[] = ["ar"];

/** Nom natif + drapeau de chaque langue (affichés dans le sélecteur). */
export const localeInfo: Record<Locale, { name: string; flag: string }> = {
  en: { name: "English", flag: "🇬🇧" },
  fr: { name: "Français", flag: "🇫🇷" },
  es: { name: "Español", flag: "🇪🇸" },
  ar: { name: "العربية", flag: "🇸🇦" },
  pt: { name: "Português", flag: "🇧🇷" },
  de: { name: "Deutsch", flag: "🇩🇪" },
  zh: { name: "中文", flag: "🇨🇳" },
  ja: { name: "日本語", flag: "🇯🇵" },
  hi: { name: "हिन्दी", flag: "🇮🇳" },
  ru: { name: "Русский", flag: "🇷🇺" },
};
