'use client';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import withAuth from "../../components/withAuth";
import DiningHallMenu from "@/components/DiningHallMenu";

function DashboardPage() {
  const router = useRouter();
  const [meal, setMeal] = useState("");
  const [activeTab, setActiveTab] = useState("Thorne");
  const [username, setUsername] = useState(""); 

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 11) setMeal("Breakfast");
    else if (hour < 17) setMeal("Lunch");
    else setMeal("Dinner");
  }, []);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const token = localStorage.getItem("authToken");
        if (!token) return;

        const res = await fetch("http://localhost:5001/api/users/me", {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = await res.json();
        if (res.ok) {
          setUsername(data.user.username);
        } else {
          console.error(data.message);
        }
      } catch (err) {
        console.error("Error fetching user:", err);
      }
    };

    fetchUser();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("authToken");
    router.replace("/login");
  };

 return (
    <main
      className="min-h-screen flex flex-col items-center justify-start p-6
                bg-gradient-to-br from-[#addae2] to-[#dceeff] animate-[dreamyFlow_15s_ease_infinite]"
    >
      {/* Top bar */}
      <div className="w-full flex flex-col md:flex-row items-center justify-between mb-6 gap-3 md:gap-0">
        {/* Left: The Polar Plate */}
        <div className="text-[#006D77] text-2xl md:text-3xl font-extrabold cursor-pointer">
          The Polar Plate
        </div>

        {/* Center: Welcome */}
        {username && (
          <div className="text-[#006D77] text-3xl md:text-4xl font-bold text-center">
            Welcome, {username} 😊
          </div>
        )}

        {/* Right: Logout */}
        <button
          onClick={handleLogout}
          className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 md:px-4 md:py-2 rounded-md cursor-pointer text-sm md:text-base"
        >
          Logout
        </button>
      </div>

      {/* Dining hall menu */}
      <DiningHallMenu
        meal={meal}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />
    </main>
  );
}


export default withAuth(DashboardPage);
