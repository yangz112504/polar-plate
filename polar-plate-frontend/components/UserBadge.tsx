import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { avatarColors, avatarLetter } from "@/lib/avatar";

interface UserBadgeProps {
  /** Called when "Log out" is pressed; the parent decides what logging out does. */
  onLogout: () => void;
}

/**
 * The account button in the header: a colored circle with the user's first letter that opens a small
 * menu (full username, Settings, Log out). This is the "disclosure" pattern: a button with
 * `aria-expanded` that shows or hides a panel, simpler and more robust than a full ARIA menu.
 * The menu closes on Escape (focus goes back to the button), on a click outside, when keyboard focus
 * moves out of it, and when the route changes. Loads the user from GET /api/users/me with the saved
 * token; if that fails the circle stays empty but Log out still works, so nobody gets stranded.
 * Side effects: one network request on mount (errors go to the console); document listeners while open.
 */
function UserBadge({ onLogout }: UserBadgeProps) {
  const [user, setUser] = useState<{ id: string; username: string } | null>(null);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const pathname = usePathname();
  const frontEndUrl = process.env.NEXT_PUBLIC_FRONTEND_URL;

  useEffect(() => {
    const token = localStorage.getItem("authToken");
    if (!token) return;
    // Set on unmount so a late response doesn't update a component that is gone.
    let cancelled = false;
    async function fetchUser() {
      try {
        const res = await fetch(`${frontEndUrl}/api/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || `HTTP error! status ${res.status}`);
        if (!cancelled) setUser({ id: data.user.id, username: data.user.username });
      } catch (err) {
        console.error("Error fetching user:", err instanceof Error ? err.message : err);
      }
    }
    fetchUser();
    return () => {
      cancelled = true;
    };
  }, [frontEndUrl]);

  // A page change (e.g. after following the Settings link) should not leave the menu hanging open.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // While open: close on Escape and on a press anywhere outside the badge.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const { bg, fg } = avatarColors(user?.id ?? "");
  const itemClass =
    "flex min-h-11 w-full cursor-pointer items-center rounded-md px-3 text-left text-[15px] font-medium text-ink " +
    "transition-colors hover:bg-panel focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brick";

  return (
    <span
      ref={wrapperRef}
      className="relative"
      // Close when Tab moves focus to something outside. A null relatedTarget (clicking plain text inside
      // the panel) is ignored on purpose, or clicking the username would close the menu.
      onBlur={(e) => {
        if (e.relatedTarget && !wrapperRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label="Account menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full
                   focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream"
      >
        {/* aria-hidden: the letter alone says nothing useful; the button's label says what it is. */}
        <span
          data-testid="user-badge-circle"
          title={user?.username}
          aria-hidden="true"
          style={{ backgroundColor: bg, color: fg }}
          className="flex h-9 w-9 items-center justify-center rounded-full font-heading text-lg font-semibold lg:h-10 lg:w-10"
        >
          {avatarLetter(user?.username)}
        </span>
      </button>

      {open && (
        <div
          id={menuId}
          data-testid="user-menu"
          className="absolute right-0 top-full z-50 mt-2 w-56 rounded-lg border border-line bg-cream-light p-1.5 text-ink shadow-lg"
        >
          {user && (
            <div className="border-b border-line px-3 pb-2 pt-1.5">
              <p className="text-xs text-ink-soft">Signed in as</p>
              <p className="break-all font-heading text-base font-semibold">{user.username}</p>
            </div>
          )}
          <Link href="/profile/settings" className={`${itemClass} mt-1`}>
            Settings
          </Link>
          <button type="button" onClick={onLogout} className={itemClass}>
            Log out
          </button>
        </div>
      )}
    </span>
  );
}

export default UserBadge;
