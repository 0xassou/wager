"use client";

/**
 * Identicon déterministe généré à partir d'une adresse Ethereum —
 * aucun service externe : un SVG 5×5 symétrique, à la GitHub.
 *
 * Même adresse → même motif et mêmes couleurs, partout, pour toujours.
 */

interface IdenticonProps {
  address: string;
  /** Taille en pixels (carré). */
  size?: number;
  className?: string;
}

export function Identicon({ address, size = 64, className }: IdenticonProps) {
  const hex = address.toLowerCase().replace(/^0x/, "").padEnd(40, "0");

  // Teinte dérivée des 6 premiers octets → couleur stable par adresse.
  const hue = parseInt(hex.slice(0, 6), 16) % 360;
  const fg = `hsl(${hue} 65% 55%)`;
  const bg = `hsl(${hue} 45% 20%)`;

  // Grille 5×5 symétrique : 3 colonnes générées (15 cellules), les
  // colonnes 4-5 sont le miroir des colonnes 1-2.
  const cells: boolean[] = [];
  for (let i = 0; i < 15; i++) {
    cells.push(parseInt(hex[i % hex.length], 16) % 2 === 0);
  }

  const rects = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const sourceCol = col < 3 ? col : 4 - col; // miroir
      if (cells[row * 3 + sourceCol]) {
        rects.push(
          <rect key={`${row}-${col}`} x={col} y={row} width={1} height={1} fill={fg} />
        );
      }
    }
  }

  return (
    <svg
      viewBox="0 0 5 5"
      width={size}
      height={size}
      className={className}
      style={{ borderRadius: "20%", backgroundColor: bg }}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {rects}
    </svg>
  );
}
