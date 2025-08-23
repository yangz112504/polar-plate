import React from "react";
import { useState, useEffect, useRef } from "react";
import StarRating from "@/components/StarRating";
import AverageRating from "@/components/AverageRating";
import AllRatings from "./AllRatings";

function DiningHallMenu({ meal, activeTab, setActiveTab }) {
  const [menuMap, setMenuMap] = useState({ Thorne: {}, Moulton: {} });
  const [loading, setLoading] = useState(true);
  const [avgMap, setAvgMap] = useState({ Thorne: 0, Moulton: 0 });
  const [votesMap, setVotesMap] = useState({ Thorne: 0, Moulton: 0 });
  const [refreshKey, setRefreshKey] = useState(0);
  const hasFetched = useRef(false);

  const handleSubmitSuccess = () => {
    fetchRatings();
    setRefreshKey((prev) => prev + 1);
  };

  useEffect(() => {
    async function fetchMenus() {
      if (hasFetched.current) return; // Prevent multiple fetches
      hasFetched.current = true;
      try {
        const res = await fetch("http://localhost:5001/api/menus"); 
        if (!res.ok) throw new Error(`HTTP error! status ${res.status}`);
        const data = await res.json();
        console.log(data)
        setMenuMap(data); // { Thorne: {...}, Moulton: {...} }
      } catch (err) {
        console.error("Error fetching menus:", err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchMenus();
  }, []);

  useEffect(() => {
    if (!meal || !activeTab) return;

    // reset avg & votes in UI
    setAvgMap({ Thorne: 0, Moulton: 0 });
    setVotesMap({ Thorne: 0, Moulton: 0 });

    fetchRatings(); // fetch new meal's ratings
  }, [meal, activeTab]);

  const fetchRatings = async () => {
    if (!meal || !activeTab) return;

    try {
      const token = localStorage.getItem("authToken");

      const currentDate = new Date().toISOString().slice(0, 10); // '2025-08-20'

      const res = await fetch(
        `http://localhost:5001/api/ratings/${activeTab}/${meal}?date=${currentDate}`,
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

  if (loading) {
    return (
      <div className="text-center py-10 text-gray-600">
        Fetching today’s menus...
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
      <p className="mb-6 text-gray-700">{new Date().toDateString()}</p>

      <AverageRating average={avgMap[activeTab]} totalVotes={votesMap[activeTab]} />

      {/* Menu grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 w-full max-w-7xl border border-black mx-auto">
        {menuMap[activeTab].map(({ category, items }) => (
          <div key={category} className="p-4 text-left flex flex-col">
            <h2 className="text-xl font-bold mb-2 border-b border-gray-300">{category}</h2>
            <ul className="list-disc pl-5 space-y-1 text-gray-700">
              {items.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </div>
        ))}
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