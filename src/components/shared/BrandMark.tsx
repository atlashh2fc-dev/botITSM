/**
 * BrandMark — Logo oficial SONDA
 * Wordmark SONDA® — tipografía bold, fondo negro
 */

/* ─── Logo SONDA® — Wordmark SVG ─────────────────────────────────── */
export function SondaLogo({
  width = 120,
  inverted = false,
}: {
  width?: number;
  /** inverted=true → letras negras sobre fondo transparente (para fondos claros) */
  inverted?: boolean;
}) {
  const h = Math.round(width * 0.38);
  const textColor = inverted ? "#000000" : "#FFFFFF";
  const bgColor   = inverted ? "transparent" : "#000000";

  return (
    <svg
      width={width}
      height={h}
      viewBox="0 0 320 100"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="SONDA"
      role="img"
    >
      {bgColor !== "transparent" && (
        <rect width="320" height="100" fill={bgColor} rx="4" />
      )}

      {/* Wordmark SONDA — sans-serif bold condensado */}
      <text
        x="14"
        y="76"
        fontFamily="'Arial Black', 'Arial', 'Helvetica Neue', 'Impact', sans-serif"
        fontWeight="900"
        fontSize="72"
        letterSpacing="-1"
        fill={textColor}
        dominantBaseline="auto"
      >
        SONDA
      </text>

      {/* Punto registrado ® pequeño */}
      <text
        x="302"
        y="36"
        fontFamily="'Arial', 'Helvetica Neue', sans-serif"
        fontWeight="400"
        fontSize="22"
        fill={textColor}
        opacity="0.85"
      >
        ®
      </text>
    </svg>
  );
}

/* ─── Isotipo cuadrado pequeño para favicons / avatares ─────────────
   Cuadrado negro con "S" blanca — versión compacta del logo          */
export function SondaIcon({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="SONDA"
      role="img"
    >
      <rect width="40" height="40" rx="4" fill="#000000" />
      <text
        x="20"
        y="30"
        textAnchor="middle"
        fontFamily="'Arial Black', 'Arial', 'Helvetica Neue', sans-serif"
        fontWeight="900"
        fontSize="26"
        fill="#FFFFFF"
        letterSpacing="-0.5"
      >
        S
      </text>
    </svg>
  );
}

/* ─── BrandMark compuesto: logo + tagline ────────────────────────── */
export function BrandMark({
  variant = "dark",
  showTagline = true,
}: {
  variant?: "light" | "dark";
  showTagline?: boolean;
}) {
  const isDark = variant === "dark";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <SondaLogo width={110} inverted={!isDark} />
      {showTagline && (
        <p style={{
          margin: 0,
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: isDark ? "#8DA0C4" : "#605E5C",
          fontFamily: "'Kumbh Sans', 'Segoe UI', sans-serif",
        }}>
          Mesa de Ayuda ITSM
        </p>
      )}
    </div>
  );
}

/* ─── Alias para compatibilidad hacia atrás ─────────────────────── */
/** @deprecated Usa SondaLogo o SondaIcon en su lugar */
export function AtlasHexLogo({ size = 36 }: { size?: number }) {
  return <SondaIcon size={size} />;
}
