'use client'; 

import React, { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';

// Validation Schema for login
const loginSchema = z.object({
  identifier: z.string().min(1, 'Username or Email is required.'), 
  password: z.string().min(1, 'Password is required.'),
});

function LoginPage() {
  const router = useRouter();
  const { register, handleSubmit, formState: { errors }, setError, clearErrors } = useForm({
    resolver: zodResolver(loginSchema),
  });

  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const frontEndUrl = process.env.NEXT_PUBLIC_FRONTEND_URL;

  const onSubmit = async (data) => {
    setLoading(true);
    setSuccessMessage('');
    clearErrors('general');

    try {
      // Determine if the identifier is an email or username based on format
      const isEmail = /\S+@\S+\.\S+/.test(data.identifier);

      const requestBody = isEmail
        ? { email: data.identifier, password: data.password }
        : { username: data.identifier, password: data.password };

      const response = await fetch(`${frontEndUrl}/api/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const responseData = await response.json();

      if (response.ok) {
        setSuccessMessage(responseData.message || 'Login successful!');
        localStorage.setItem('authToken', responseData.token); // save JWT

        router.push('/dashboard'); 
      } else {
        setError('general', { type: 'server', message: responseData.message || 'Login failed. Invalid credentials.' });
      }
    } catch (error) {
      console.error('Login error:', error);
      setError('general', { type: 'network', message: 'Network error or server unavailable. Please try again later.' });
    } finally {
      setLoading(false);
    }
  };

  return (

    <main className="min-h-screen flex items-center justify-center p-4 md:p-8 relative
                     bg-gradient-to-br from-[#addae2] to-[#dceeff]
                     text-[var(--bowdoin-black)]">

      <Link href="/" className="absolute top-4 left-4 inline-flex items-center
                                 bg-white text-[#006D77] px-4 py-2 rounded-lg font-semibold shadow-sm
                                 border border-gray-200 hover:bg-gray-50 transition-colors duration-200
                                 z-50"> 
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Back to Home
      </Link>


      <div className="bg-white p-8 md:p-10 rounded-xl shadow-xl w-full max-w-md
                      border border-[rgba(0,0,0,0.1)] backdrop-filter backdrop-blur-sm">

        <h1 className="text-3xl font-extrabold text-center mb-6 text-[var(--bowdoin-black)]"> {/* mb-6 as before, mt-10 removed */}
          Welcome Back!
        </h1>
        <p className="text-gray-700 text-center mb-6 text-lg">
          Login to continue rating meals.
        </p>

        {errors.general && (
          <p className="text-red-500 text-sm text-center mb-4 p-2 bg-red-100 border border-red-200 rounded-md">
            {errors.general.message}
          </p>
        )}
        {successMessage && (
          <p className="text-green-600 text-sm text-center mb-4 p-2 bg-green-100 border border-green-200 rounded-md">
            {successMessage}
          </p>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div>
            <label htmlFor="identifier" className="block text-gray-700 text-sm font-semibold mb-2">
              Username or Email:
            </label>
            <input
              type="text"
              id="identifier"
              placeholder="Username or Email"
              {...register('identifier')}
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#006D77] focus:border-transparent transition-all duration-200
                          ${errors.identifier ? 'border-red-500' : 'border-gray-300'}`}
              aria-invalid={errors.identifier ? "true" : "false"}
              aria-describedby="identifier-error"
            />
            {errors.identifier && (
              <p id="identifier-error" className="text-red-500 text-xs mt-1">
                {errors.identifier.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="block text-gray-700 text-sm font-semibold mb-2">
              Password:
            </label>
            <input
              type="password"
              id="password"
              placeholder="Your password"
              {...register('password')}
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#006D77] focus:border-transparent transition-all duration-200
                          ${errors.password ? 'border-red-500' : 'border-gray-300'}`}
              aria-invalid={errors.password ? "true" : "false"}
              aria-describedby="password-error"
            />
            {errors.password && (
              <p id="password-error" className="text-red-500 text-xs mt-1">
                {errors.password.message}
              </p>
            )}
          </div>

          <button
            type="submit"
            className="w-full bg-[#006D77] text-white py-3 px-4 rounded-lg font-semibold
                       hover:bg-[#005A63] transition-colors duration-300 ease-in-out
                       flex items-center justify-center cursor-pointer"
            disabled={loading}
          >
            {loading ? (
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              'Login'
            )}
          </button>
        </form>

        <p className="text-center text-sm text-gray-600 mt-6">
          Don't have an account?{' '}
          <Link href="/register" className="text-[#006D77] hover:underline font-medium">
            Register here
          </Link>
        </p>
      </div>
    </main>
  );
}

export default LoginPage;
