import React, { useState, useEffect } from 'react';
import { useAuth } from './auth.jsx';

export default function Login({ onClose }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { googleLogin } = useAuth();

  useEffect(() => {
    // Initialize Google Sign-In when script is loaded
    const initializeGoogleSignIn = () => {
      if (window.google && window.google.accounts) {
        window.google.accounts.id.initialize({
          client_id: process.env.VITE_GOOGLE_CLIENT_ID || 'dummy-client-id.apps.googleusercontent.com',
          callback: handleGoogleSignIn,
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        window.google.accounts.id.renderButton(
          document.getElementById('google-signin-button'),
          {
            theme: 'filled_blue',
            size: 'large',
            text: 'signin_with',
            shape: 'rectangular',
            logo_alignment: 'left',
            width: '100%'
          }
        );
      }
    };

    // Check if Google script is already loaded
    if (window.google) {
      initializeGoogleSignIn();
    } else {
      // Wait for script to load
      const checkGoogleLoaded = setInterval(() => {
        if (window.google && window.google.accounts) {
          clearInterval(checkGoogleLoaded);
          initializeGoogleSignIn();
        }
      }, 100);

      // Timeout after 5 seconds
      setTimeout(() => {
        clearInterval(checkGoogleLoaded);
        if (!window.google) {
          setError('Google Sign-In script failed to load. Please refresh the page.');
        }
      }, 5000);
    }
  }, []);

  const handleGoogleSignIn = async (response) => {
    setLoading(true);
    setError('');

    try {
      const result = await googleLogin(response.credential);
      
      if (result.success) {
        // If user needs onboarding, we'll handle it in the auth context
        if (result.user?.needsOnboarding) {
          // Let the auth context handle onboarding
          return;
        }
        onClose();
      } else {
        setError(result.error || 'Google sign-in failed');
      }
    } catch (err) {
      setError(err.message || 'An error occurred during sign-in');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async (role) => {
    setLoading(true);
    setError('');

    try {
      // Create a mock Google token for demo purposes
      const mockGoogleToken = `demo-token-${role}-${Date.now()}`;
      const result = await googleLogin(mockGoogleToken);
      
      if (result.success) {
        // If user needs onboarding, we'll handle it in the auth context
        if (result.user?.needsOnboarding) {
          // Let the auth context handle onboarding
          return;
        }
        onClose();
      } else {
        setError(result.error || 'Demo login failed');
      }
    } catch (err) {
      setError(err.message || 'An error occurred during demo login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-slate-800 p-6 rounded-lg w-full max-w-md">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-white mb-2">Welcome to DECAID</h2>
          <p className="text-slate-300 text-sm">Sign in with your Google account to continue</p>
        </div>
        
        <div className="space-y-4">
          <div id="google-signin-button" className="w-full flex justify-center">
            {/* Google Sign-In button will be rendered here */}
          </div>

          {loading && (
            <div className="text-center text-slate-300">
              <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
              <p className="mt-2 text-sm">Signing in...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-900/20 border border-red-500/50 rounded-md p-3">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <div className="text-center">
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-300 text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-700">
          <div className="text-xs text-slate-400 space-y-1">
            <p className="font-semibold text-slate-300">Testing Options:</p>
            <p>• Use Google Sign-In above</p>
            <p>• Or use demo accounts below</p>
            <div className="mt-2 space-y-1">
              <button
                onClick={() => handleDemoLogin('institution')}
                className="w-full text-left px-2 py-1 bg-slate-700 rounded hover:bg-slate-600 transition-colors"
              >
                • institution@decaid.com (Institution)
              </button>
              <button
                onClick={() => handleDemoLogin('employer')}
                className="w-full text-left px-2 py-1 bg-slate-700 rounded hover:bg-slate-600 transition-colors"
              >
                • employer@decaid.com (Employer)
              </button>
              <button
                onClick={() => handleDemoLogin('student')}
                className="w-full text-left px-2 py-1 bg-slate-700 rounded hover:bg-slate-600 transition-colors"
              >
                • student@decaid.com (Student)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
