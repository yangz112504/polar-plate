'use client';

import { useRouter } from "next/navigation";
import withAuth from "@/components/withAuth";
import DiningHallMenu from "@/components/DiningHallMenu";
import UserBadge from "@/components/UserBadge";

/** The signed-in home: the menu view, with a logout button in the brick header. */
function DashboardPage() {
  const router = useRouter();

  const handleLogout = () => {
    localStorage.removeItem("authToken");
    router.replace("/login");
  };

  return (
    <main className="min-h-dvh bg-cream">
      <DiningHallMenu
        headerRight={
          <div className="flex items-center gap-2.5 lg:gap-4">
            <UserBadge />
            <button
              onClick={handleLogout}
              className="min-h-11 cursor-pointer rounded-full border border-cream px-3.5 text-sm font-medium text-cream
                         transition-colors hover:bg-cream hover:text-brick lg:px-[18px] lg:text-[15px]
                         focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream"
            >
              Log out
            </button>
          </div>
        }
      />
    </main>
  );
}

export default withAuth(DashboardPage);
