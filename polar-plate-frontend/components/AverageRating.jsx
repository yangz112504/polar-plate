'use client';

import React from "react";
import StarFraction from "./StarFraction";

/* Read-only average rating display with partial stars */
function AverageRating({ average = 0, totalVotes = 0, size = 28 }) {
  const fills = [0, 1, 2, 3, 4].map((i) =>
    Math.max(0, Math.min(1, average - i))
  );

  return (
    <div className="flex flex-col items-center mb-6 select-none">
      {/* Label + stars on one row */}
      <div className="flex items-center gap-3">
        <span className="text-2xl font-semibold text-gray-800">Average Rating:</span>
        <div className="flex items-center gap-1">
          {fills.map((f, i) => (
            <StarFraction key={i} fraction={f} size={size} />
          ))}
        </div>
        <div className="whitespace-nowrap">{average.toFixed(1)}</div>
      </div>

      <div className="mt-2 text-center text-sm text-gray-700">
        <div>Total Votes: {totalVotes}</div>
      </div>
    </div>
  );
}

export default AverageRating;
