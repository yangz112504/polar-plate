'use client'; 

import React, { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form'; 
import { zodResolver } from '@hookform/resolvers/zod'; 
import * as z from 'zod'; 
import { useRouter } from 'next/navigation'; 
import InfoOutlineIcon from '@mui/icons-material/InfoOutline';
import { Tooltip } from '@mui/material'; 

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
    <main className="relative flex min-h-dvh items-center justify-center bg-cream p-4 pt-20 md:p-8 text-ink">
        
      <Link href="/" className="absolute left-4 top-4 z-50 inline-flex items-center rounded-md border border-line bg-cream-light px-4 py-2 font-medium text-brick transition-colors hover:bg-brick/10 focus-visible:outline-2 focus-visible:outline-brick"> {/* Add z-50 to ensure it's on top */}
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Back to Home
      </Link>

      {/* Inner container */}
      <div className="w-full max-w-md rounded-lg border border-line bg-cream-light p-6 md:p-10">

        <h1 className="mb-3 text-center text-4xl font-semibold text-brick">
          Join The Polar Plate
        </h1>
        <p className="text-ink-soft text-center mb-6">
          Create your account to start rating meals!
        </p>

        {/* Display general form errors or success message */}
        {errors.general && (
          <p className="text-red-700 text-sm text-center mb-4 p-2 bg-red-100 border border-red-200 rounded-md">
            {errors.general.message}
          </p>
        )}
        {successMessage && (
          <p className="text-green-800 text-sm text-center mb-4 p-2 bg-green-100 border border-green-200 rounded-md">
            {successMessage}
          </p>
        )}

        {/* handleSubmit takes care of validation before onSubmit */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div>
            <label htmlFor="username" className="block text-ink text-sm font-medium mb-2">
              Username:
            </label>
            <input
              type="text"
              id="username"
              placeholder="e.g., foodie_bear (3-30 char)"
              {...register('username')} 
              className={`w-full px-4 py-2 border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brick focus:border-transparent transition-all duration-200
                          ${errors.username ? 'border-red-500' : 'border-line'}`}
              aria-invalid={errors.username ? "true" : "false"}
              aria-describedby="username-error"
            />
            {errors.username && (
              <p id="username-error" className="text-red-700 text-xs mt-1">
                {errors.username.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="email" className="block text-ink text-sm font-medium mb-2">
              Email:
            </label>
            <input
              type="email"
              id="email"
              placeholder="example@domain.com"
              {...register('email')} 
              className={`w-full px-4 py-2 border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brick focus:border-transparent transition-all duration-200
                          ${errors.email ? 'border-red-500' : 'border-line'}`}
              aria-invalid={errors.email ? "true" : "false"}
              aria-describedby="email-error"
            />
            {errors.email && (
              <p id="email-error" className="text-red-700 text-xs mt-1">
                {errors.email.message}
              </p>
            )}
          </div>

         <div>
            <div className="flex items-center justify-between mb-2">
              <label 
                htmlFor="password" 
                className="text-ink text-sm font-medium"
              >
                Password:
              </label>
              <Tooltip title="Password is securely hashed with bcrypt" placement='left'>
                <InfoOutlineIcon fontSize="small" className="text-ink-soft cursor-pointer" />
              </Tooltip>
            </div>
            <input
              type="password"
              id="password"
              placeholder="Minimum 6 characters"
              {...register('password')}
              className={`w-full px-4 py-2 border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brick focus:border-transparent transition-all duration-200
                          ${errors.password ? 'border-red-500' : 'border-line'}`}
              aria-invalid={errors.password ? "true" : "false"}
              aria-describedby="password-error"
            />
            {errors.password && (
              <p id="password-error" className="text-red-700 text-xs mt-1">
                {errors.password.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-ink text-sm font-medium mb-2">
              Confirm Password:
            </label>
            <input
              type="password"
              id="confirmPassword"
              placeholder="Re-enter your password"
              {...register('confirmPassword')} 
              className={`w-full px-4 py-2 border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brick focus:border-transparent transition-all duration-200
                          ${errors.confirmPassword ? 'border-red-500' : 'border-line'}`}
              aria-invalid={errors.confirmPassword ? "true" : "false"}
              aria-describedby="confirm-password-error"
            />
            {errors.confirmPassword && (
              <p id="confirm-password-error" className="text-red-700 text-xs mt-1">
                {errors.confirmPassword.message}
              </p>
            )}
          </div>

          <button
            type="submit"
            className="w-full bg-brick text-cream py-3 px-4 rounded-md font-medium
                       hover:bg-brick-dark disabled:opacity-60 transition-colors duration-300 ease-in-out
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

        <p className="text-center text-sm text-ink-soft mt-6">
          Already have an account?{' '}
          <Link href="/login" className="text-brick underline-offset-2 hover:underline font-medium">
            Login here
          </Link>
        </p>
      </div>
    </main>
  );
}

export default RegisterPage;
