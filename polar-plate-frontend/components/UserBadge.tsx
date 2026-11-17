import { useEffect, useState } from "react";

/**
 * Shows who is logged in: a cream circle with the first letter of the username, plus the full name
 * from desktop width (1024px) up. On phones the name is visually hidden but still read aloud by
 * screen readers. Loads the name itself from GET /api/users/me using the saved login token.
 * If there is no token or the request fails, it shows an empty circle (the page still works).
 * Side effects: one network request on mount; errors are logged to the console.
 */
function UserBadge() {
  const [username, setUsername] = useState<string | null>(null);
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
        if (!cancelled) setUsername(data.user.username);
      } catch (err) {
        console.error("Error fetching user:", err instanceof Error ? err.message : err);
      }
    }
    fetchUser();
    return () => {
      cancelled = true;
    };
  }, [frontEndUrl]);

  return (
    <span className="flex items-center gap-2">
      {/* aria-hidden: the letter alone says nothing useful; the name text below is the accessible label. */}
      <span
        data-testid="user-badge-circle"
        aria-hidden="true"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-cream font-heading text-lg font-semibold text-brick lg:h-10 lg:w-10"
      >
        {username ? username.charAt(0).toUpperCase() : ""}
      </span>
      {username && <span className="max-lg:sr-only lg:text-[15px] lg:font-medium">{username}</span>}
    </span>
  );
}

export default UserBadge;
