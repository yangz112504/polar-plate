'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image'; 
import './globals.css'; 

function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("authToken");
    if (token) {
      router.replace("/dashboard");
    }
  }, [router]);

  return (
    <div className="min-h-screen flex flex-col 
                    bg-gradient-to-br from-[#addae2] to-[#dceeff] 
                    animate-[dreamyFlow_15s_ease_infinite]">
      <header className="flex flex-col md:flex-row flex-1 w-full">
        
        {/* Left: Hero Text */}
        <div className="flex flex-col justify-center items-center md:items-start 
                        px-6 md:px-12 py-12 w-full md:w-1/2">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold mb-6 leading-tight 
                         text-[var(--bowdoin-black)] text-center md:text-left">
            Welcome to <span className="text-[#006D77]">The Polar Plate!</span>
          </h1>

          <p className="text-lg sm:text-xl lg:text-2xl font-semibold mb-4 
                        text-[var(--bowdoin-black)] text-center md:text-left">
            The newest campus food review platform designed for Bowdoin students
          </p>

          <p className="text-base sm:text-lg lg:text-xl mb-8 leading-relaxed 
                        text-gray-700 text-center md:text-left">
            Discover, rate, and share your dining experiences at Bowdoin's dining halls
          </p>

          {/* Register and Login Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto justify-center md:justify-start">
            <Link
              href="/register"
              className="px-8 py-4 rounded-lg text-lg font-semibold bg-[#006D77] text-white hover:bg-[#00525c] transition text-center w-full sm:w-auto"
            >
              Register
            </Link>
            <Link
              href="/login"
              className="px-8 py-4 rounded-lg text-lg font-semibold border border-[#006D77] text-[#006D77] hover:bg-[#e6f4f4] transition text-center w-full sm:w-auto"
            >
              Login
            </Link>
          </div>
        </div>

        {/* Right: Hero Image - Only visible on desktop */}
        <div className="hidden md:flex w-1/2">
          <Image
            src="/polarbearphotowide.webp"
            alt="Polar bear walking eating pizza"
            width={900}
            height={600}
            className="w-full h-full object-cover"
            priority
          />
        </div>
      </header>
    </div>
  );
}

export default Home;
