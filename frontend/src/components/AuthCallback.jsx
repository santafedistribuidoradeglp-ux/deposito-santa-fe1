import { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { API, useAuth } from "../context/AuthContext";

export const AuthCallback = () => {
  const hasProcessed = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser } = useAuth();

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;
    const sessionId = location.hash.split("session_id=")[1]?.split("&")[0];
    const run = async () => {
      try {
        const res = await axios.post(
          `${API}/auth/session`,
          { session_id: sessionId },
          { withCredentials: true }
        );
        setUser(res.data);
        window.history.replaceState(null, "", "/");
        navigate("/", { replace: true, state: { user: res.data } });
      } catch {
        navigate("/", { replace: true });
      }
    };
    run();
  }, [location.hash, navigate, setUser]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" data-testid="auth-loading-spinner" />
    </div>
  );
};
