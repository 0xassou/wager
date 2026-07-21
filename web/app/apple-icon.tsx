import { ImageResponse } from "next/og";

/**
 * Icône iOS (Ajouter à l'écran d'accueil) — générée en PNG au build via
 * next/og, sur le badge seul du logo (voir components/logo.tsx pour la
 * version SVG utilisée dans la navbar).
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
        }}
      >
        <svg width="180" height="180" viewBox="0 0 100 100">
          <rect width="100" height="100" rx="20" fill="#663A73" />
          <polyline
            points="20,34 35,72 50,48 65,72 80,26"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    ),
    { ...size }
  );
}
