/** BrandMark — identidad visual del tenant Geimser. */

/* ─── Wordmark Geimser ────────────────────────────────────────────── */
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
  const accentColor = inverted ? "#000000" : "#55F4FF";
  const bgColor   = inverted ? "transparent" : "#12213F";

  return (
    <svg
      width={width}
      height={h}
      viewBox="0 0 320 100"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Geimser"
      role="img"
    >
      {bgColor !== "transparent" && (
        <rect width="320" height="100" fill={bgColor} rx="4" />
      )}

      <text
        x="14"
        y="71"
        fontFamily="'Arial Black', 'Arial', 'Helvetica Neue', 'Impact', sans-serif"
        fontWeight="900"
        fontSize="56"
        letterSpacing="0"
        fill={textColor}
        dominantBaseline="auto"
      >
        <tspan fill={accentColor}>G</tspan>
        <tspan>EIMSER</tspan>
      </text>

    </svg>
  );
}

/* ─── Logo usado como ícono flotante del bot ─────────────────────── */
export function SondaBotIcon({
  width = 120,
  height = 42,
}: {
  width?: number;
  height?: number;
}) {
  return (
    <img
      src="/sonda-chatbot-icon.svg"
      width={width}
      height={height}
      aria-label="Geimser"
      alt="Geimser"
      style={{ display: "block", objectFit: "contain" }}
    />
  );
}

/* ─── Isotipo cuadrado pequeño para favicons / avatares ───────────── */
export function SondaIcon({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Geimser"
      role="img"
    >
      <rect width="40" height="40" rx="4" fill="#12213F" />
      <text
        x="20"
        y="30"
        textAnchor="middle"
        fontFamily="'Arial Black', 'Arial', 'Helvetica Neue', sans-serif"
        fontWeight="900"
        fontSize="26"
        fill="#00A9E0"
        letterSpacing="0"
      >
        G
      </text>
    </svg>
  );
}

/** Marca compacta de Forum para el tenant Forum del asistente. */
export function ForumLogo({ width = 120, height }: { width?: number; height?: number }) {
  const resolvedHeight = height ?? Math.round(width * 0.38);

  return (
    <svg width={width} height={resolvedHeight} viewBox="0 0 320 100" xmlns="http://www.w3.org/2000/svg" aria-label="Forum" role="img">
      <rect width="320" height="100" rx="4" fill="#004481" />
      <rect x="4" y="4" width="312" height="92" rx="2" fill="none" stroke="#5BBEFF" strokeWidth="4" />
      <text x="160" y="70" textAnchor="middle" fontFamily="Arial Black, Arial, sans-serif" fontWeight="900" fontSize="58" letterSpacing="2" fill="#FFFFFF">
        FORUM
      </text>
    </svg>
  );
}

export function ForumIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" aria-label="Forum" role="img">
      <rect width="40" height="40" rx="4" fill="#004481" />
      <rect x="2" y="2" width="36" height="36" rx="2" fill="none" stroke="#5BBEFF" strokeWidth="2" />
      <text x="20" y="29" textAnchor="middle" fontFamily="Arial Black, Arial, sans-serif" fontWeight="900" fontSize="24" fill="#FFFFFF">F</text>
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
          fontFamily: "'Outfit', 'Plus Jakarta Sans', 'Segoe UI', sans-serif",
        }}>
          Mesa de Ayuda ITSM
        </p>
      )}
    </div>
  );
}

/* ─── Alias para compatibilidad hacia atrás ─────────────────────── */
export function AtlasHexLogo({ size = 36 }: { size?: number }) {
  return <SondaIcon size={size} />;
}
