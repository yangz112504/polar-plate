import { useEffect, useState } from "react";
import StarFraction from "@/components/StarFraction";

/** One row of GET /api/ratings/:hall/:meal/all. */
interface RatingRow {
  _id: string;
  rating: number;
  user?: { username?: string };
}

interface AllRatingsProps {
  hall: string;
  meal: string;
  /** Changing this value makes the list reload (bumped after a rating is saved). */
  refreshKey: number;
}

/** Lists everyone's score for today's meal, highest first. Loads on mount and whenever its props change. */
function AllRatings({ hall, meal, refreshKey }: AllRatingsProps) {
  const [ratings, setRatings] = useState<RatingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const frontEndUrl = process.env.NEXT_PUBLIC_FRONTEND_URL;

  useEffect(() => {
    // Ignore a response for a hall/meal the user has already left.
    let cancelled = false;
    const fetchRatings = async () => {
      try {
        const token = localStorage.getItem("authToken");
        const res = await fetch(`${frontEndUrl}/api/ratings/${encodeURIComponent(hall)}/${encodeURIComponent(meal)}/all`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!cancelled) {
          if (res.ok) setRatings(data.ratings || []);
          else console.error(data.message);
        }
      } catch (err) {
        console.error("Error fetching all ratings:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    if (hall && meal) {
      // Clear first so a failed request can't leave the previous hall's ratings on screen.
      setRatings([]);
      setLoading(true);
      fetchRatings();
    }
    return () => {
      cancelled = true;
    };
  }, [hall, meal, refreshKey, frontEndUrl]);

  return (
    <section className="mt-4 rounded-md border border-line bg-cream-light p-3">
      <h2 className="mb-2 border-b border-line pb-1 text-xl font-semibold text-brick">All ratings</h2>
      {loading ? (
        <p className="py-2 text-center text-ink-soft">Loading ratings...</p>
      ) : ratings.length === 0 ? (
        <p className="py-2 text-center text-ink-soft">No ratings yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {[...ratings] // copy first: sort() would otherwise mutate state
            .sort((a, b) => b.rating - a.rating)
            .map((r) => (
              <li key={r._id} className="flex items-center justify-between py-2">
                <span className="font-medium text-ink">{r.user?.username || "Anonymous"}</span>
                <span className="flex items-center gap-1.5 font-semibold text-brick">
                  <StarFraction fraction={1} size={18} className="h-[18px] w-[18px]" />
                  {r.rating} / 5
                </span>
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}

export default AllRatings;
