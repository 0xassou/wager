/**
 * Catégories de marché — stockées ON-CHAIN dans la question elle-même,
 * via un préfixe conventionnel invisible à l'affichage :
 *
 *    "[crypto] Le BTC dépassera-t-il 150k$ ?"
 *
 * Avantages : aucun changement de schéma du contrat, compatible avec les
 * marchés existants (sans préfixe → catégorie "other"), et n'importe quel
 * client peut relire la catégorie depuis la chaîne.
 */

/** Catégories disponibles (slugs canoniques, traduits via i18n). */
export const MARKET_CATEGORIES = [
  "crypto",
  "sport",
  "politics",
  "tech",
  "other",
] as const;

export type MarketCategory = (typeof MARKET_CATEGORIES)[number];

/** Préfixe reconnu en tête de question : [crypto], [sport], [politics], [tech] */
const PREFIX_RE = /^\[(crypto|sport|politics|tech)\]\s*/i;

/**
 * Décompose une question brute on-chain en { catégorie, texte affichable }.
 * Sans préfixe reconnu → catégorie "other", texte inchangé.
 */
export function parseQuestion(raw: string): {
  category: MarketCategory;
  text: string;
} {
  const match = raw.match(PREFIX_RE);
  if (match) {
    return {
      category: match[1].toLowerCase() as MarketCategory,
      text: raw.slice(match[0].length),
    };
  }
  return { category: "other", text: raw };
}

/** Encode la question à stocker on-chain ("other" = pas de préfixe). */
export function encodeQuestion(category: MarketCategory, text: string): string {
  return category === "other" ? text : `[${category}] ${text}`;
}
