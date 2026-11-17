import { useId } from "react";

interface StarFractionProps {
  /** How much of the star is filled, 0 (empty) to 1 (full). Values outside are clamped. */
  fraction?: number;
  /** Width and height in pixels (CSS classes in `className` can override it, e.g. per breakpoint). */
  size?: number;
  className?: string;
  /**
   * false (default): read-only look, a brick fill over a tan empty star.
   * true: input look, brick fill with a brick outline and a see-through empty star.
   */
  outlined?: boolean;
}

/**
 * Draws one star filled from the left by `fraction` (0.5 = half star), using a hard-stop gradient.
 * Decorative only (aria-hidden); the surrounding component supplies the accessible text.
 */
function StarFraction({ fraction = 0, size = 28, className = "", outlined = false }: StarFractionProps) {
  const uid = useId().replace(/:/g, ""); // safe unique id for gradient
  const pct = Math.max(0, Math.min(1, fraction)) * 100;

  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`grad-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
          {/* Left (filled) */}
          <stop offset={`${pct}%`} stopColor="#9B2822" />
          {/* Right (unfilled) */}
          <stop offset={`${pct}%`} stopColor={outlined ? "#9B2822" : "#D9CDB6"} stopOpacity={outlined ? 0 : 1} />
        </linearGradient>
      </defs>
      <path
        d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"
        fill={`url(#grad-${uid})`}
        stroke={outlined ? "#9B2822" : "none"}
        strokeWidth={1.2}
      />
    </svg>
  );
}

export default StarFraction;
