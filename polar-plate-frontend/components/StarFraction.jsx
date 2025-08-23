import { useId } from "react";

function StarFraction({ fraction = 0, size = 28, className = "" }) {
  const uid = useId().replace(/:/g, ""); // safe unique id for gradient
  const pct = Math.max(0, Math.min(1, fraction)) * 100;

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`grad-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
          {/* Left (filled) */}
          <stop offset={`${pct}%`} stopColor="#FACC15" />
          {/* Right (unfilled) */}
          <stop offset={`${pct}%`} stopColor="#E5E7EB" />
        </linearGradient>
      </defs>

      {/* Fill with gradient */}
      <path
        d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
        fill={`url(#grad-${uid})`}
      />
    </svg>
  );
}

export default StarFraction;  