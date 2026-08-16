import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/auth/me`, { withCredentials: true });
      setUser(res.data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // CRITICAL: If returning from OAuth callback, skip the /me check.
    if (window.location.hash?.includes("session_id=")) {
      setLoading(false);
      return;
    }
    checkAuth();
  }, [checkAuth]);

  const login = useCallback(() => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  }, []);

  const loginPhone = useCallback(async (phone, password) => {
    const res = await axios.post(`${API}/auth/login`, { phone, password }, { withCredentials: true });
    setUser(res.data);
    return res.data;
  }, []);

  const register = useCallback(async (payload) => {
    const res = await axios.post(`${API}/auth/register`, payload, { withCredentials: true });
    setUser(res.data);
    return res.data;
  }, []);

  const logout = useCallback(async () => {
    await axios.post(`${API}/auth/logout`, {}, { withCredentials: true });
    setUser(null);
  }, []);

  const value = useMemo(() => ({
    user, setUser, loading, login, loginPhone, register, logout, checkAuth,
  }), [user, loading, login, loginPhone, register, logout, checkAuth]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
export { API };
