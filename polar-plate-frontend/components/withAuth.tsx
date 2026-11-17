'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type ComponentType } from 'react';
import { jwtDecode } from 'jwt-decode';

/**
 * Wraps a page so it only renders for a logged-in user. Reads the JWT from localStorage; a missing,
 * malformed or expired token is removed and the user is sent to /login. Shows a short message
 * while the check runs.
 * @param WrappedComponent The page to protect.
 * @returns A component that renders `WrappedComponent` once the token is accepted.
 */
export default function withAuth<P extends object>(WrappedComponent: ComponentType<P>) {
  return function ProtectedRoute(props: P) {
    const router = useRouter();
    const [authorized, setAuthorized] = useState(false);

    useEffect(() => {
      const token = localStorage.getItem('authToken');
      if (!token) {
        router.push('/login');
        return;
      }

      try {
        const decoded = jwtDecode(token);
        const now = Date.now() / 1000;

        if (decoded.exp && decoded.exp < now) {
          localStorage.removeItem('authToken');
          router.push('/login');
        } else {
          setAuthorized(true);
        }
      } catch (err) {
        localStorage.removeItem('authToken');
        router.push('/login');
      }
    }, [router]);
    

    if (!authorized) {
      return <p className="p-4">Checking authentication...</p>;
    }

    return <WrappedComponent {...props} />;
  };
}
