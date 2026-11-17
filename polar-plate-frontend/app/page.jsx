'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import BrickPattern from '@/components/BrickPattern';
import PolarBearMark from '@/components/PolarBearMark';

function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("authToken");
    if (token) {
      router.replace("/dashboard");
    }
  }, [router]);

  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      {/* Brick banner with the app name */}
      <div className="relative bg-brick px-6 py-4 text-cream">
        <BrickPattern />
        <div className="relative flex items-center gap-3">
          <PolarBearMark className="h-11 w-11" />
          <span className="font-heading text-3xl font-extrabold">The Polar Plate</span>
        </div>
      </div>

      <main className="flex w-full flex-1 flex-col md:flex-row">
        {/* Left: text and buttons */}
        <div className="flex w-full flex-col justify-center px-6 py-10 md:w-1/2 md:px-12">
          <h1 className="mb-4 text-5xl font-semibold leading-tight text-ink lg:text-6xl">
            What&apos;s for dinner, <span className="text-brick">and is it any good?</span>
          </h1>
          <p className="mb-8 max-w-prose text-lg leading-relaxed text-ink-soft">
            See today&apos;s Thorne and Moulton menus and rate every meal, so the next Bowdoin student knows
            where to eat.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/register"
              className="rounded-md bg-brick px-8 py-3 text-center text-lg font-medium text-cream transition-colors
                         hover:bg-brick-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brick"
            >
              Register
            </Link>
            <Link
              href="/login"
              className="rounded-md border border-brick px-8 py-3 text-center text-lg font-medium text-brick transition-colors
                         hover:bg-brick/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brick"
            >
              Log in
            </Link>
          </div>
        </div>

        {/* Right: photo, desktop only */}
        <div className="hidden md:flex md:w-1/2">
          <Image
            src="/polarbearphotowide.webp"
            alt="Polar bear walking eating pizza"
            width={900}
            height={600}
            className="h-full w-full object-cover"
            priority
          />
        </div>
      </main>
    </div>
  );
}

export default Home;
