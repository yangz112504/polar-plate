import { useId } from "react";

interface StarFractionProps {
  /** How much of the star is filled, 0 (empty) to 1 (full). Values outside are clamped. */
  fraction?: number;
  /** Width and height in pixels. */
  size?: number;
  className?: string;
}

/**
 * Draws one star filled from the left by `fraction` (0.5 = half star), using a hard-stop gradient.
 * Decorative only (aria-hidden); the surrounding component supplies the accessible text.
 */
function StarFraction({ fraction = 0, size = 28, className = "" }: StarFractionProps) {
  const uid = useId().replace(/:/g, ""); // safe unique id for gradient
  const pct = Math.max(0, Math.min(1, fraction)) * 100;

  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`grad-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
          {/* Left (filled) */}
          <stop offset={`${pct}%`} stopColor="#FACC15" />
          {/* Right (unfilled) */}
          <stop offset={`${pct}%`} stopColor="#E5E7EB" />
        </linearGradient>
      </defs>
      <path
        d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
        fill={`url(#grad-${uid})`}
      />
    </svg>
  );
}

export default StarFraction;
