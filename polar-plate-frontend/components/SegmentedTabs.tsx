import { useRef, type KeyboardEvent } from "react";

interface SegmentedTabsProps {
  /** Accessible name of the tab group, e.g. "Dining hall". */
  label: string;
  /** Tab names, left to right. */
  options: string[];
  /** The currently selected option. */
  value: string;
  /** Called with the option the user picked (by click or arrow key). */
  onChange: (option: string) => void;
  /**
   * "pill" (default): separate rounded pills, the selected one dark. "folder": folder-style tabs
   * for use inside the brick header, the selected one is cream and joins the page below.
   */
  variant?: "pill" | "folder";
}

/**
 * A row of mutually exclusive tabs. Follows the keyboard part of the WAI-ARIA tabs pattern: only
 * the selected tab is a Tab stop; left/right arrows move the selection (wrapping at the ends) and
 * Home/End jump to the first/last. It does not link tabs to a tabpanel (aria-controls): the content
 * they switch is a whole page region, not a panel owned by this component.
 */
function SegmentedTabs({ label, options, value, onChange, variant = "pill" }: SegmentedTabsProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  /** Moves the selection with the arrow / Home / End keys and keeps keyboard focus on the new tab. */
  const handleKeyDown = (e: KeyboardEvent, index: number) => {
    if (options.length === 0) return;
    let next: number;
    if (e.key === "ArrowRight") next = (index + 1) % options.length; // wraps around
    else if (e.key === "ArrowLeft") next = (index - 1 + options.length) % options.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = options.length - 1;
    else return;
    e.preventDefault();
    onChange(options[next]);
    refs.current[next]?.focus();
  };

  const folder = variant === "folder";
  return (
    <div role="tablist" aria-label={label} className={folder ? "flex" : "flex flex-wrap gap-2 lg:gap-2.5"}>
      {options.map((option, i) => {
        const selected = option === value;
        const look = folder
          ? `min-h-12 flex-1 rounded-t-[14px] text-base lg:min-h-[50px] lg:text-[17px] focus-visible:outline-cream
             ${selected ? "bg-cream font-semibold text-brick" : "font-medium text-cream"}`
          : `min-h-11 rounded-full px-[18px] text-[15px] lg:px-[22px] focus-visible:outline-brick
             ${selected ? "bg-ink font-semibold text-cream" : "border border-ink font-medium text-ink"}`;
        return (
          <button
            key={option}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            className={`cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 ${look}`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

export default SegmentedTabs;
