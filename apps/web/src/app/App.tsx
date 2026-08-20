import { useEffect } from "react";
import { HashRouter, NavLink, Route, Routes } from "react-router-dom";

import { course } from "../content/course";
import type { BackendServices } from "../data/backendServices";
import type { Json } from "../data/database.types";
import { createConfiguredBackendServices } from "../data/configuredBackendClient";
import { LoginPage } from "../features/auth/LoginPage";
import { LearnPage } from "../features/learn/LearnPage";
import { LearningSessionPage } from "../features/learning/LearningSessionPage";
import { ProgressPage } from "../features/progress/ProgressPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { TodayPage } from "../features/today/TodayPage";
import { Icon } from "../ui/Icon";
import { AuthProvider } from "./AuthContext";
import { SyncProvider } from "./SyncProvider";
import { useAuth } from "./useAuth";

const configuredServices = createConfiguredBackendServices();

const navigation = [
  { to: "/", label: "Сегодня", icon: "today" as const, end: true },
  { to: "/learn", label: "Учиться", icon: "learn" as const },
  { to: "/progress", label: "Прогресс", icon: "progress" as const },
  { to: "/settings", label: "Настройки", icon: "settings" as const },
];

interface AppProps {
  services?: BackendServices;
}

export function App({ services = configuredServices }: AppProps) {
  useEffect(() => {
    void services.offline.putContent(
      `course-v${course.schema_version}`,
      course as unknown as Json,
    );
  }, [services.offline]);

  return (
    <AuthProvider authClient={services.auth} userCache={services.userCache}>
      <SyncProvider database={services.database} offline={services.offline}>
        <HashRouter>
          <AppRoutes services={services} />
        </HashRouter>
      </SyncProvider>
    </AuthProvider>
  );
}

function AppRoutes({ services }: { services: BackendServices }) {
  const { status } = useAuth();

  if (status === "loading")
    return (
      <main className="app-gate" aria-live="polite">
        Загружаем профиль…
      </main>
    );
  if (status === "anonymous") return <LoginPage />;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#/" aria-label="AI Mentor — на главную">
          <span className="brand-mark">A</span>
          <span>
            <strong>AI Mentor</strong>
            <small>аналитика данных</small>
          </span>
        </a>
        <Navigation />
        <div className="sidebar-note">
          <span className="status-dot" />
          <span>
            {services.auth.mode === "fake"
              ? "Демо-режим"
              : "Supabase подключён"}
          </span>
        </div>
      </aside>

      <main className="main-content" id="main-content">
        <Routes>
          <Route path="/" element={<TodayPage services={services} />} />
          <Route path="/learn" element={<LearnPage />} />
          <Route
            path="/session"
            element={<LearningSessionPage services={services} />}
          />
          <Route
            path="/progress"
            element={<ProgressPage services={services} />}
          />
          <Route
            path="/settings"
            element={<SettingsPage backendMode={services.auth.mode} />}
          />
          <Route path="*" element={<TodayPage services={services} />} />
        </Routes>
      </main>

      <nav className="bottom-nav" aria-label="Основная навигация">
        <Navigation />
      </nav>
    </div>
  );
}

function Navigation() {
  return (
    <div className="nav-links">
      {navigation.map((item) => (
        <NavLink
          className={({ isActive }) =>
            isActive ? "nav-link active" : "nav-link"
          }
          end={item.end}
          key={item.to}
          to={item.to}
        >
          <Icon name={item.icon} />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </div>
  );
}
