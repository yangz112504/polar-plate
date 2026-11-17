'use client';

import { useRouter } from "next/navigation";
import withAuth from "@/components/withAuth";
import DiningHallMenu from "@/components/DiningHallMenu";

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
          <button
            onClick={handleLogout}
            className="cursor-pointer min-h-11 rounded-full border border-cream px-3.5 text-sm font-medium text-cream lg:px-[18px] lg:text-[15px]
                       transition-colors hover:bg-cream hover:text-brick
                       focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream"
          >
            Log out
          </button>
        }
      />
    </main>
  );
}

export default withAuth(DashboardPage);
