import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <p className="p-8 text-slate-600" role="status">Loading…</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
