import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';
import AIAssistant from './pages/AIAssistant';
import PredictionsV2 from './pages/PredictionsV2';
import RemindersV2 from './pages/RemindersV2';
import CalendarRoutines from './pages/CalendarRoutines';
import Settings from './pages/Settings';
import Onboarding from './pages/Onboarding';
import Login from './pages/Login';
import MyTasksV2 from './pages/MyTasksV2';
import Landing from './pages/Landing';
import CreateTask from './pages/CreateTask';
import ProtectedRoute from './components/ProtectedRoute';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/landing" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/onboarding" element={<Onboarding />} />
        {/* Auth callback for OAuth (Google) */}
        <Route path="/auth/callback" element={<Navigate to="/dashboard" replace />} />

        {/* Protected routes — require login */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="tasks" element={<MyTasksV2 />} />
          <Route path="create-task" element={<CreateTask />} />
          <Route path="ai-assistant" element={<AIAssistant />} />
          <Route path="predictions" element={<PredictionsV2 />} />
          <Route path="reminders" element={<RemindersV2 />} />
          <Route path="calendar" element={<CalendarRoutines />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

