import { useEffect, useRef, type ReactNode } from "react";

interface ConfirmPromptProps {
  /** Accessible name of the prompt, e.g. "Confirm username change"; screen readers announce it on focus. */
  label: string;
  /** The question, e.g. `Change your username to "alicia"?`. */
  children: ReactNode;
  /** True while the request is in flight: both buttons are disabled so it can't be sent twice or cancelled midway. */
  busy: boolean;
  /** Called when the user presses Confirm. */
  onConfirm: () => void;
  /** Called when the user presses Cancel. */
  onCancel: () => void;
}

/**
 * An inline "are you sure?" step that replaces a form's submit button (not a popup, so there is no
 * focus trap to build). On appearing it takes keyboard focus itself, so screen readers read the question
 * and the user's next Tab lands on Confirm; no button is pre-selected, so a double Enter can't confirm
 * by accident. Used by the username and password forms.
 */
function ConfirmPrompt({ label, children, busy, onConfirm, onCancel }: ConfirmPromptProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      tabIndex={-1}
      className="rounded-md border border-line bg-panel p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-brick"
    >
      <p className="mb-3 text-[15px] font-medium text-ink">{children}</p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="min-h-11 cursor-pointer rounded-md bg-brick px-5 font-medium text-cream transition-colors duration-300
                     hover:bg-brick-dark disabled:cursor-not-allowed disabled:opacity-60
                     focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brick"
        >
          Confirm
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="min-h-11 cursor-pointer rounded-md border border-brick px-5 font-medium text-brick transition-colors
                     hover:bg-brick/10 disabled:cursor-not-allowed disabled:opacity-60
                     focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brick"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default ConfirmPrompt;
