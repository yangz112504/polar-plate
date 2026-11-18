'use client';

import { useRouter } from "next/navigation";
import withAuth from "@/components/withAuth";
import DiningHallMenu from "@/components/DiningHallMenu";
import UserBadge from "@/components/UserBadge";

/** The signed-in home: the menu view, with the account menu (Settings, Log out) in the brick header. */
function DashboardPage() {
  const router = useRouter();

  const handleLogout = () => {
    localStorage.removeItem("authToken");
    router.replace("/login");
  };

  return (
    <main className="min-h-dvh bg-cream">
      <DiningHallMenu headerRight={<UserBadge onLogout={handleLogout} />} />
    </main>
  );
}

export default withAuth(DashboardPage);
