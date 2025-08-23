'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { jwtDecode } from 'jwt-decode';

export default function withAuth(WrappedComponent) {
  return function ProtectedRoute(props) {
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
