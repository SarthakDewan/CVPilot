import { Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AuthPage } from "./pages/AuthPages";
import Builder from "./pages/Builder";
import Dashboard from "./pages/Dashboard";
import PublicResume from "./pages/PublicResume";
import { NewResumePage, ResumesPage } from "./pages/Resumes";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route path="/r/:token" element={<PublicResume />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/resumes" element={<ResumesPage />} />
          <Route path="/resumes/new" element={<NewResumePage />} />
          <Route path="/resumes/:id" element={<Builder />} />
        </Route>
      </Route>
      <Route path="*" element={<p className="p-8">Page not found.</p>} />
    </Routes>
  );
}
