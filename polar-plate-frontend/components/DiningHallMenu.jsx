import React from "react";
import { useState, useEffect } from "react";
import StarRating from "@/components/StarRating";
import AverageRating from "@/components/AverageRating";
import AllRatings from "./AllRatings";

/** Formats the server's 'YYYY-MM-DD' for display without letting the browser's timezone shift it. */
function formatDate(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d).toDateString();
}

function DiningHallMenu({ activeTab, setActiveTab }) {
  // The server decides the day, the meal tabs and which one opens first (GET /api/menus/schedule).
  const [schedule, setSchedule] = useState(null); // { date, meals, defaultMeal }
  const [scheduleFailed, setScheduleFailed] = useState(false);
  const [meal, setMeal] = useState(null);
  // Arrays (not objects) so rendering with .map still works when the menu request fails.
  const [menuMap, setMenuMap] = useState({ Thorne: [], Moulton: [] });
  const [menuLoading, setMenuLoading] = useState(true);
  const [avgMap, setAvgMap] = useState({ Thorne: 0, Moulton: 0 });
  const [votesMap, setVotesMap] = useState({ Thorne: 0, Moulton: 0 });
  const [refreshKey, setRefreshKey] = useState(0);

  const frontEndUrl = process.env.NEXT_PUBLIC_FRONTEND_URL;

  const handleSubmitSuccess = () => {
    fetchRatings();
    setRefreshKey((prev) => prev + 1);
  };

  // Load the schedule once; open on the server's default meal.
  useEffect(() => {
    async function fetchSchedule() {
      try {
        const res = await fetch(`${frontEndUrl}/api/menus/schedule`);
        const data = await res.json();
        if (!res.ok) throw new Error(`HTTP error! status ${res.status}`);
        setSchedule(data);
        setMeal(data.defaultMeal);
      } catch (err) {
        console.error("Error fetching meal schedule:", err.message);
        setScheduleFailed(true);
      }
    }
    fetchSchedule();
  }, []);

  // Reload the menu whenever the selected meal tab changes.
  useEffect(() => {
    if (!meal) return;
    // Ignore a response that arrives after the user already switched to another tab.
    let cancelled = false;
    async function fetchMenus() {
      setMenuLoading(true);
      setMenuMap({ Thorne: [], Moulton: [] });
      try {
        const res = await fetch(`${frontEndUrl}/api/menus/${meal}`);
        // Read the body even on errors: the backend says which hall failed and why (for developers).
        const data = await res.json();
        if (data.errors) console.error("Menu errors by hall:", data.errors);
        if (!res.ok) throw new Error(data.error || `HTTP error! status ${res.status}`);
        if (!cancelled) setMenuMap(data);
      } catch (err) {
        console.error("Error fetching menus:", err.message);
      } finally {
        if (!cancelled) setMenuLoading(false);
      }
    }
    fetchMenus();
    return () => {
      cancelled = true;
    };
  }, [meal]);

  useEffect(() => {
    if (!meal || !activeTab) return;

    // reset avg & votes in UI
    setAvgMap({ Thorne: 0, Moulton: 0 });
    setVotesMap({ Thorne: 0, Moulton: 0 });

    fetchRatings(); // fetch new meal's ratings
  }, [meal, activeTab]);

  // The server rates/reads "today" itself, so no date is sent.
  const fetchRatings = async () => {
    if (!meal || !activeTab) return;

    try {
      const token = localStorage.getItem("authToken");

      const res = await fetch(
        `${frontEndUrl}/api/ratings/${activeTab}/${meal}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

    setAvgMap(prev => ({
      ...prev,
      [activeTab]: parseFloat(data.avgRating) || 0
    }));

    setVotesMap(prev => ({
      ...prev,
      [activeTab]: data.totalRatings || 0
    }));

    } catch (err) {
      console.error("Error fetching ratings:", err.message);
    }
  };

  if (scheduleFailed) {
    return <div className="text-center py-10 text-gray-600">Couldn't load today's meals. Please refresh.</div>;
  }
  if (!schedule || !meal) {
    return (
      <div className="text-center py-10 text-gray-600">
        Fetching today's menus...
      </div>
    );
  }

  return (
    <div className="text-center bg-white rounded-lg shadow-md p-4 w-full mb-6 relative">

      {/* Tabs at top-left inside container */}
      <div className="absolute top-4 left-4 flex rounded-md border border-gray-300 overflow-hidden">
        {["Thorne", "Moulton"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 font-semibold transition-all duration-300 cursor-pointer ${
              activeTab === tab
                ? "bg-[#006D77] text-white"
                : "bg-white text-gray-700 hover:bg-gray-100"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <h1 className="text-4xl font-bold mb-2 mt-12">{meal}</h1>
      <p className="mb-4 text-gray-700">{formatDate(schedule.date)}</p>

      {/* Meal tabs, left to right in the server's order (placeholder styling until the redesign step). */}
      <div className="inline-flex rounded-md border border-gray-300 overflow-hidden mb-6">
        {schedule.meals.map((tab) => (
          <button
            key={tab}
            onClick={() => setMeal(tab)}
            className={`px-4 py-2 font-semibold transition-all duration-300 cursor-pointer ${
              meal === tab
                ? "bg-[#006D77] text-white"
                : "bg-white text-gray-700 hover:bg-gray-100"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <AverageRating average={avgMap[activeTab]} totalVotes={votesMap[activeTab]} />

      {/* Menu grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 w-full max-w-7xl border border-black mx-auto">
        {menuLoading ? (
          <p className="p-6 text-gray-600 col-span-full">Fetching menu...</p>
        ) : menuMap[activeTab].length === 0 ? (
          // Shown whether Bowdoin has no menu or the fetch failed (the console says which).
          <p className="p-6 text-gray-600 col-span-full">No menu found</p>
        ) : (
          menuMap[activeTab].map(({ category, items }) => (
            <div key={category} className="p-4 text-left flex flex-col">
              <h2 className="text-xl font-bold mb-2 border-b border-gray-300">{category}</h2>
              <ul className="list-disc pl-5 space-y-1 text-gray-700">
                {items.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </div>
          ))
        )}
      </div>

      {/* Ratings section */}
      <div className="mt-6">
        <StarRating activeTab={activeTab} meal={meal} onSubmitSuccess={handleSubmitSuccess}/>
      </div>
      <div className="mt-6">
        <AllRatings hall={activeTab} meal={meal} refreshKey={refreshKey} />
      </div>
    </div>
  );
}

export default DiningHallMenu;
