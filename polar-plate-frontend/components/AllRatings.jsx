import { useEffect, useState } from "react";
import { User } from "lucide-react";

function AllRatings({ hall, meal, refreshKey }) {
  const [ratings, setRatings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRatings = async () => {
      try {
        const token = localStorage.getItem("authToken");
        const today = new Date().toISOString().slice(0, 10);
        const res = await fetch(
          `http://localhost:5001/api/ratings/${hall}/${meal}/${today}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        const data = await res.json();
        if (res.ok) {
          setRatings(data.ratings || []);
        } else {
          console.error(data.message);
        }
      } catch (err) {
        console.error("Error fetching all ratings:", err);
      } finally {
        setLoading(false);
      }
    };

    if (hall && meal) {
      setLoading(true);
      fetchRatings();
    }
  }, [hall, meal, refreshKey]);

  if (loading) return <p className="text-center py-4">Loading ratings...</p>;

  return (
    <div className="mt-6 w-full max-w-lg bg-gray-50 rounded-2xl shadow-lg p-6 mx-auto">
      <h2 className="text-2xl font-bold text-[#006D77] mb-4 border-b border-gray-300 pb-2">
        All Ratings
      </h2>

      {ratings.length === 0 ? (
        <p className="text-gray-500 text-center py-4">No ratings yet.</p>
      ) : (
        <ul className="divide-y divide-gray-200">
          {ratings
            .sort((a, b) => b.rating - a.rating) // Sort highest rating first
            .map((r) => (
              <li
                key={r._id}
                className="flex justify-between items-center py-3 px-2 hover:bg-gray-100 rounded-md transition cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 flex items-center justify-center bg-gray-200 rounded-full">
                    <User className="w-5 h-5 text-gray-500" />
                  </div>
                  <span className="font-medium text-gray-700">Anonymous User</span>
                </div>
                <span className="bg-yellow-100 text-yellow-800 font-bold px-3 py-1 rounded-full">
                  {r.rating} ⭐
                </span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

export default AllRatings;
