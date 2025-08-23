'use client'; 

import React, { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form'; 
import { zodResolver } from '@hookform/resolvers/zod'; 
import * as z from 'zod'; 
import { useRouter } from 'next/navigation'; 

// Validation Schema
const registerSchema = z.object({
  username: z.string()
    .min(3, 'Username must be at least 3 characters.')
    .max(30, 'Username must be at most 30 characters.')
    .regex(/^(?!.*\.\.)(?!.*\.$)[a-zA-Z0-9._]{3,30}$/, 'Invalid username format.'),
  email: z.string()
    .email('Invalid email format.'),
  password: z.string()
    .min(6, 'Password must be at least 6 characters.'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match.',
  path: ['confirmPassword'], 
});

function RegisterPage() {
  const router = useRouter();
  const { register, handleSubmit, formState: { errors }, setError, clearErrors } = useForm({
    resolver: zodResolver(registerSchema),
  });

  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const frontEndUrl = process.env.NEXT_PUBLIC_FRONTEND_URL;

  const onSubmit = async (data) => {
    setLoading(true);
    setSuccessMessage('');
    clearErrors('general'); 

    try {
      const response = await fetch(`${frontEndUrl}/api/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: data.username,
          email: data.email,
          password: data.password,
        }),
      });

      const responseData = await response.json();

      if (response.ok) {
        setSuccessMessage(responseData.message || 'Registration successful! You can now login.');
        setTimeout(() => {
          router.push('/login');
        }, 1000);
      } else {
        // Handle backend validation errors or general error messages
        setError('general', { type: 'server', message: responseData.message || 'Registration failed.' });
      }
    } catch (error) {
      console.error('Registration error:', error);
      setError('general', { type: 'network', message: 'Network error or server unavailable. Please try again later.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 md:p-8
                     bg-gradient-to-br from-[#addae2] to-[#dceeff]
                     text-[var(--bowdoin-black)]">
        
      <Link href="/" className="absolute top-4 left-4 inline-flex items-center
                                 bg-white text-[#006D77] px-4 py-2 rounded-lg font-semibold shadow-sm
                                 border border-gray-200 hover:bg-gray-50 transition-colors duration-200
                                 z-50"> {/* Add z-50 to ensure it's on top */}
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Back to Home
      </Link>

      {/* Inner container */}
      <div className="bg-white p-8 md:p-10 rounded-xl shadow-xl w-full max-w-md
                      border border-[rgba(0,0,0,0.1)] backdrop-filter backdrop-blur-sm">

        <h1 className="text-3xl font-extrabold text-center mb-6 text-[var(--bowdoin-black)]">
          Join The Polar Plate
        </h1>
        <p className="text-gray-700 text-center mb-6 text-lg">
          Create your account to start rating meals!
        </p>

        {/* Display general form errors or success message */}
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

        {/* handleSubmit takes care of validation before onSubmit */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div>
            <label htmlFor="username" className="block text-gray-700 text-sm font-semibold mb-2">
              Username:
            </label>
            <input
              type="text"
              id="username"
              placeholder="e.g., foodie_bear (3-30 char)"
              {...register('username')} 
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#006D77] focus:border-transparent transition-all duration-200
                          ${errors.username ? 'border-red-500' : 'border-gray-300'}`}
              aria-invalid={errors.username ? "true" : "false"}
              aria-describedby="username-error"
            />
            {errors.username && (
              <p id="username-error" className="text-red-500 text-xs mt-1">
                {errors.username.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="email" className="block text-gray-700 text-sm font-semibold mb-2">
              Email:
            </label>
            <input
              type="email"
              id="email"
              placeholder="example@domain.com"
              {...register('email')} 
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#006D77] focus:border-transparent transition-all duration-200
                          ${errors.email ? 'border-red-500' : 'border-gray-300'}`}
              aria-invalid={errors.email ? "true" : "false"}
              aria-describedby="email-error"
            />
            {errors.email && (
              <p id="email-error" className="text-red-500 text-xs mt-1">
                {errors.email.message}
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
              placeholder="Minimum 6 characters"
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

          <div>
            <label htmlFor="confirmPassword" className="block text-gray-700 text-sm font-semibold mb-2">
              Confirm Password:
            </label>
            <input
              type="password"
              id="confirmPassword"
              placeholder="Re-enter your password"
              {...register('confirmPassword')} 
              className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#006D77] focus:border-transparent transition-all duration-200
                          ${errors.confirmPassword ? 'border-red-500' : 'border-gray-300'}`}
              aria-invalid={errors.confirmPassword ? "true" : "false"}
              aria-describedby="confirm-password-error"
            />
            {errors.confirmPassword && (
              <p id="confirm-password-error" className="text-red-500 text-xs mt-1">
                {errors.confirmPassword.message}
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
              'Register'
            )}
          </button>
        </form>

        <p className="text-center text-sm text-gray-600 mt-6">
          Already have an account?{' '}
          <Link href="/login" className="text-[#006D77] hover:underline font-medium">
            Login here
          </Link>
        </p>
      </div>
    </main>
  );
}

export default RegisterPage;
