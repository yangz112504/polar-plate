/**
 * Small polar-bear face for the brick header (copied from the "1 Hubbard" canvas boards).
 * @param className Tailwind size classes, e.g. "h-9 w-9 lg:h-11 lg:w-11".
 */
function PolarBearMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" role="img" aria-label="Polar bear" className={`shrink-0 ${className}`}>
      <circle cx="8" cy="9" r="4.5" fill="#F6F0E4" />
      <circle cx="24" cy="9" r="4.5" fill="#F6F0E4" />
      <circle cx="8" cy="9" r="2" fill="#9B2822" opacity=".55" />
      <circle cx="24" cy="9" r="2" fill="#9B2822" opacity=".55" />
      <ellipse cx="16" cy="17" rx="11" ry="10" fill="#F6F0E4" />
      <ellipse cx="16" cy="21" rx="5.5" ry="4" fill="#E7DBC3" />
      <ellipse cx="16" cy="19.5" rx="2.2" ry="1.5" fill="#231F20" />
      <circle cx="11.5" cy="15" r="1.2" fill="#231F20" />
      <circle cx="20.5" cy="15" r="1.2" fill="#231F20" />
    </svg>
  );
}

export default PolarBearMark;
