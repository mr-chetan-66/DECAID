import React, { createContext, useContext, useState, useEffect } from 'react';
import { getApiBaseUrl } from './api.js';

const AuthContext = createContext();

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('DECAID_TOKEN'));
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (token) {
      fetchUser();
    } else {
      setLoading(false);
    }
  }, [token]);

  const fetchUser = async () => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        
        // Check if user needs onboarding
        if (data.user.role === 'pending') {
          setShowOnboarding(true);
        }
      } else {
        // Token invalid, clear it
        logout();
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      logout();
    } finally {
      setLoading(false);
    }
  };

  const googleLogin = async (googleToken) => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/auth/google`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ token: googleToken })
      });

      const data = await response.json();
      
      if (response.ok) {
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem('DECAID_TOKEN', data.token);
        
        // Show onboarding if needed
        if (data.user.needsOnboarding) {
          setShowOnboarding(true);
          return { success: true, needsOnboarding: true };
        }
        
        return { success: true };
      } else {
        return { success: false, error: data.error };
      }
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  };

  const completeOnboarding = async (roleData) => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/auth/onboarding`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(roleData)
      });

      const data = await response.json();
      
      if (response.ok) {
        // Update token and user data
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem('DECAID_TOKEN', data.token);
        setShowOnboarding(false);
        return { success: true };
      } else {
        return { success: false, error: data.error };
      }
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setShowOnboarding(false);
    localStorage.removeItem('DECAID_TOKEN');
  };

  const getAuthHeaders = () => {
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  };

  // Legacy login for backward compatibility
  const login = async (email, password) => {
    console.warn('Legacy email/password login is deprecated');
    return { success: false, error: 'Please use Google sign-in instead' };
  };

  const value = {
    user,
    token,
    loading,
    login,
    googleLogin,
    logout,
    completeOnboarding,
    getAuthHeaders,
    isAuthenticated: !!user,
    showOnboarding,
    setShowOnboarding
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
