import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import StarFraction from "@/components/StarFraction";
import { formatScore, nextScore, type LastPress } from "@/lib/starScore";

interface StarRatingProps {
  /** Dining hall name, e.g. "Thorne". */
  activeTab: string;
  /** Meal name, e.g. "Lunch". */
  meal: string;
  /** Called after a rating is saved so the parent can refresh averages. */
  onSubmitSuccess?: () => void;
}

/**
 * Rating input for one hall's meal. Click a star once for a full star; click the same star again
 * quickly (see DOUBLE_CLICK_MS) for a half star. Loads the user's saved rating, and sends the
 * chosen score only when "Submit Rating" is pressed.
 */
function StarRating({ activeTab, meal, onSubmitSuccess }: StarRatingProps) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  // Remembers the last press for double-click timing; not set by a rating loaded from the server.
  const [lastPress, setLastPress] = useState<LastPress | null>(null);
  const frontEndUrl = process.env.NEXT_PUBLIC_FRONTEND_URL;

  useEffect(() => {
    setRating(0);
    setHover(null);
    setLastPress(null);
    if (!meal || !activeTab) return;

    // Set when the user switches tab before the response arrives, so a stale rating isn't shown.
    let cancelled = false;
    const fetchUserRating = async () => {
      try {
        const token = localStorage.getItem("authToken");
        const res = await fetch(`${frontEndUrl}/api/ratings/user?hall=${activeTab}&meal=${meal}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);
        // Show the stars if the user already rated this meal.
        if (!cancelled) setRating(data.userRating || 0);
      } catch (err) {
        console.error("Error fetching user rating:", err instanceof Error ? err.message : err);
      }
    };

    fetchUserRating();
    return () => {
      cancelled = true;
    };
  }, [meal, activeTab, frontEndUrl]);

  /** Applies the single/double-click rule for a press on `star`. */
  const handlePress = (star: number) => {
    const next = nextScore({ score: rating, star, last: lastPress, now: Date.now() });
    setRating(next.score);
    setLastPress(next.last);
    // Stop the hover preview (a whole star) from hiding a half star while the pointer is still on it.
    setHover(null);
  };

  /** Sends the chosen score to the server; toasts the outcome. */
  const handleSubmit = async () => {
    if (rating <= 0) {
      toast.error("Please select a rating before submitting.");
      return;
    }
    try {
      const token = localStorage.getItem("authToken");
      const res = await fetch(`${frontEndUrl}/api/ratings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ hall: activeTab, meal, rating }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to submit rating.");

      toast.success(data.updated ? "Rating updated!" : "Successfully rated!");
      if (onSubmitSuccess) onSubmitSuccess();
    } catch (err) {
      toast.error("Error submitting rating: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Hover previews a whole star; otherwise show the chosen (possibly half) score.
  const shown = hover ?? rating;

  return (
    <div className="flex flex-col items-center justify-center mt-6">
      {/* Label + Stars. Stacks on narrow phones (the one-line row was ~410px wide, wider than an iPhone SE), sits in one row from 640px up. */}
      <div className="flex flex-col items-center gap-1 mb-2 sm:flex-row sm:gap-4">
        <span className="text-lg font-medium text-gray-700">Your Rating:</span>

        <div className="flex">
          {[1, 2, 3, 4, 5].map((star) => {
            const fill = Math.max(0, Math.min(1, shown - (star - 1)));
            const kind = fill === 1 ? "full" : fill === 0 ? "empty" : "half";
            return (
              // A real button: reachable by keyboard and announced by screen readers.
              // touch-manipulation stops a double-tap from zooming the page on phones.
              <button
                key={star}
                type="button"
                aria-label={`Rate ${star} stars`}
                className="cursor-pointer p-1 touch-manipulation select-none"
                onClick={() => handlePress(star)}
                onMouseEnter={() => setHover(star)}
                onMouseLeave={() => setHover(null)}
              >
                <span data-testid={`star-${kind}`} className="block">
                  <StarFraction fraction={fill} size={32} />
                </span>
              </button>
            );
          })}
        </div>

        {/* Numeric value */}
        <div className="text-lg text-gray-800 whitespace-nowrap">{formatScore(rating)}</div>
      </div>

      <p className="text-sm text-gray-500 mb-4 text-center px-2">Click once for a full star, double-click for a half star.</p>

      {/* Submit button */}
      <button
        onClick={handleSubmit}
        className="bg-green-500 hover:bg-green-600 text-white px-6 py-2 rounded-md cursor-pointer"
      >
        Submit Rating
      </button>
    </div>
  );
}

export default StarRating;
