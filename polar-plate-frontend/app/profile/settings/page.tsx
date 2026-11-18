'use client';

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import BrickPattern from "@/components/BrickPattern";
import PolarBearMark from "@/components/PolarBearMark";
import PasswordForm from "@/components/profile/PasswordForm";
import UsernameForm from "@/components/profile/UsernameForm";
import UserBadge from "@/components/UserBadge";
import withAuth from "@/components/withAuth";

/** A titled card, styled like the login card (cream-light panel, thin line border). */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-cream-light p-6 md:p-8">
      <h2 className="mb-5 text-2xl font-semibold text-brick">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Account settings: change username and password. Same brick header as the dashboard (with the account
 * menu), then one card per form on the cream background. Later steps add History and My stats next to this.
 * Loads the current username from GET /api/users/me.
 */
function SettingsPage() {
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const frontEndUrl = process.env.NEXT_PUBLIC_FRONTEND_URL;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`${frontEndUrl}/api/users/me`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("authToken")}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || `HTTP error! status ${res.status}`);
        if (!cancelled) setUsername(data.user.username);
      } catch (err) {
        console.error("Error loading account:", err instanceof Error ? err.message : err);
        if (!cancelled) setLoadFailed(true);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [frontEndUrl]);

  const handleLogout = () => {
    localStorage.removeItem("authToken");
    router.replace("/login");
  };

  return (
    <div className="min-h-dvh bg-cream text-ink">
      <header className="relative bg-brick px-5 py-4 text-cream lg:px-12 lg:py-[18px]">
        <BrickPattern />
        <div className="relative mx-auto flex max-w-[1120px] items-center justify-between">
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream lg:gap-3"
          >
            <PolarBearMark className="h-9 w-9 lg:h-11 lg:w-11" />
            <span className="font-heading text-xl font-extrabold lg:text-[26px]">The Polar Plate</span>
          </Link>
          {/* key: remounting after a rename makes the badge load the new name (it only loads on mount). */}
          <UserBadge key={username ?? ""} onLogout={handleLogout} />
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-6 px-4 py-8 md:py-12">
        <div>
          <Link href="/dashboard" className="text-sm font-medium text-brick underline-offset-2 hover:underline">
            &larr; Back to the menu
          </Link>
          <h1 className="mt-3 text-4xl font-semibold text-brick">Settings</h1>
        </div>

        {loadFailed && (
          <p role="alert" className="rounded-md border border-red-200 bg-red-100 p-2 text-sm text-red-700">
            Couldn&apos;t load your account. Please refresh the page.
          </p>
        )}

        {username !== null && (
          <>
            <Section title="Username">
              <UsernameForm currentUsername={username} onChanged={setUsername} />
            </Section>
            <Section title="Password">
              <PasswordForm />
            </Section>
          </>
        )}
      </main>
    </div>
  );
}

export default withAuth(SettingsPage);
