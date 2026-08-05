import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiFetch } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkSession();
  }, []);

  async function checkSession() {
    try {
      const data = await apiFetch('/api/auth/me');
      if (data.user) setUser(data.user);
    } catch (err) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  async function login(email, password) {
    const data = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    if (data.user) {
      setUser(data.user);
    }
    return data;
  }

  async function registerDriver(driverData) {
    const data = await apiFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(driverData)
    });

    if (data.user) {
      setUser(data.user);
    }
    return data;
  }

  async function updateDriverProfile(profileData) {
    const data = await apiFetch('/api/auth/driver-profile', {
      method: 'POST',
      body: JSON.stringify(profileData)
    });

    if (data.user) {
      setUser(prev => ({ ...prev, ...data.user }));
    }
    return data;
  }

  async function logout() {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {}
    setUser(null);
  }

  const value = {
    user,
    setUser,
    login,
    registerDriver,
    updateDriverProfile,
    logout,
    isOpsManager: user?.role === 'ops_manager',
    isVendorManager: user?.role === 'vendor_manager',
    isDriver: user?.role === 'driver'
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
