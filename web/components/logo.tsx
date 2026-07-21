/**
 * Logo Wager : un monogramme "W" en zigzag anguleux (5 points, comme une
 * ligne de cotes/tendance montante) dans un badge carré aux coins arrondis.
 *
 * Couleurs pilotées en pur CSS (classes Tailwind `dark:`), pas de hook
 * useTheme : aucun risque de mismatch d'hydratation SSR/client.
 *  - Fond du badge : navy Arc (#143453) en light, violet Arc (#663A73) en dark.
 *  - Trait du W     : blanc dans les deux thèmes.
 */
interface LogoProps {
  /** Taille du badge en pixels (carré). */
  size?: number;
  className?: string;
}

export function Logo({ size = 36, className }: LogoProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      {/* Badge : coins arrondis à ~20% de la taille */}
      <rect width="100" height="100" rx="20" className="fill-navy dark:fill-primary" />
      {/* Monogramme W : 5 points anguleux, dernier sommet plus haut pour
          évoquer une tendance ascendante (cotes qui montent). */}
      <polyline
        points="20,34 35,72 50,48 65,72 80,26"
        fill="none"
        stroke="white"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
