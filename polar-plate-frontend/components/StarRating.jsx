import { useState, useEffect } from "react";
import { FaStar } from "react-icons/fa";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

function StarRating({ activeTab, meal, onSubmitSuccess }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    setRating(0);
    if (!meal || !activeTab) return;

    setRating(0);
    setHover(null);

    const fetchUserRating = async () => {
      try {
        const currentDate = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
        const token = localStorage.getItem("authToken");
        const res = await fetch(
          `http://localhost:5001/api/ratings/user?hall=${activeTab}&meal=${meal}&date=${currentDate}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);

        // Set stars if user already rated this meal
        setRating(data.userRating || 0);
      } catch (err) {
        console.error("Error fetching user rating:", err.message);
      }
    };

    fetchUserRating();
  }, [meal, activeTab]);

  const handleSubmit = async () => {
    if (rating <= 0) {
      toast.error("Please select a rating before submitting.");
      return;
    }
    try {
      const currentDate = new Date().toISOString().slice(0, 10);
      const token = localStorage.getItem("authToken");
      const res = await fetch("http://localhost:5001/api/ratings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ hall: activeTab, meal, rating, date: currentDate }),
      });

      const data = await res.json();
      console.log(data);
      if (!res.ok) throw new Error(data.message || "Failed to submit rating.");

      toast.success(data.updated ? "Rating updated!" : "Successfully rated!");
      if (onSubmitSuccess) onSubmitSuccess();
    } catch (err) {
      toast.error("Error submitting rating: " + err.message);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center mt-6">
      
      {/* Label + Stars */}
      <div className="flex items-center space-x-4 mb-4">
        <span className="text-lg font-medium text-gray-700">
          Your Rating:
        </span>

        <div className="flex space-x-3">
          {[1, 2, 3, 4, 5].map((star) => {
            const isFilled = star <= (hover || rating);
            return (
              <FaStar
                key={star}
                className={`cursor-pointer text-3xl transition-colors ${
                  isFilled ? "text-yellow-400" : "text-gray-300"
                }`}
                onClick={() => setRating(star)}
                onMouseEnter={() => setHover(star)}
                onMouseLeave={() => setHover(null)}
              />
            );
          })}
        </div>

        {/* Numeric value */}
        <div className="text-lg text-gray-800 ml-2">
          {rating > 0 ? `${rating} / 5` : "0 / 5"}
        </div>
      </div>

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
