import { Route, Routes } from "react-router-dom";
import { AuthForm } from "./components/AuthForm";
import { ProtectedRoute } from "./components/ProtectedRoute";
import Dashboard from "./pages/Dashboard";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthForm mode="login" />} />
      <Route path="/register" element={<AuthForm mode="register" />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<Dashboard />} />
      </Route>
      <Route path="*" element={<p className="p-8">Page not found.</p>} />
    </Routes>
  );
}
