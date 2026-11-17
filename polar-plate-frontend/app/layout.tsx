import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Fraunces, Public_Sans } from "next/font/google";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./globals.css";

// Headings use Fraunces; everything you read uses Public Sans (copied from the "1 Hubbard" canvas boards).
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["600", "800"],
});

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "The Polar Plate",
  description: "Rate Bowdoin Dining Hall meals",
};

/** Root layout: fonts, global styles and the toast container shared by every page. */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${fraunces.variable} ${publicSans.variable} antialiased`}>
        {children}
        <ToastContainer
          position="top-center"
          autoClose={1000}
          hideProgressBar={false}
          newestOnTop={true}
          closeOnClick
          pauseOnHover
          draggable
        />
      </body>
    </html>
  );
}
