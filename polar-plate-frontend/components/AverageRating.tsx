import StarFraction from "@/components/StarFraction";

interface AverageRatingProps {
  /** Average score, 0 to 5 (0 when nobody has rated yet). */
  average?: number;
  /** Number of ratings behind the average. */
  totalVotes?: number;
  /** True when the ratings could not be loaded: shows an error instead of "No ratings yet". */
  failed?: boolean;
}

/** Read-only average on one line: partial stars, the number, and how many ratings it is based on. */
function AverageRating({ average = 0, totalVotes = 0, failed = false }: AverageRatingProps) {
  // One fill fraction per star: 4.2 -> [1, 1, 1, 1, 0.2]
  const fills = [0, 1, 2, 3, 4].map((i) => Math.max(0, Math.min(1, average - i)));

  return (
    <div className="mt-3 flex items-center gap-2.5 select-none lg:mt-3">
      <div className="flex gap-0.5">
        {fills.map((f, i) => (
          <StarFraction key={i} fraction={f} size={26} className="h-[26px] w-[26px] lg:h-7 lg:w-7" />
        ))}
      </div>
      {failed ? (
        <span className="text-base text-ink-soft">Couldn&apos;t load ratings</span>
      ) : totalVotes === 0 ? (
        <span className="text-base text-ink-soft">No ratings yet</span>
      ) : (
        <>
          <span className="text-lg font-semibold lg:text-xl">{average.toFixed(1)}</span>
          <span className="text-[15px] text-ink-soft lg:text-base">{totalVotes} {totalVotes === 1 ? "rating" : "ratings"}</span>
        </>
      )}
    </div>
  );
}

export default AverageRating;
