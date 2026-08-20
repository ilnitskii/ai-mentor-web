import type { BackendMode } from "../../data/backendClient";
import { useAuth } from "../../app/useAuth";
import { useSync } from "../../app/useSync";
import { Card } from "../../ui/Card";

interface SettingsPageProps {
  backendMode: BackendMode;
}

export function SettingsPage({ backendMode }: SettingsPageProps) {
  const { user, signOut, pending, errorCode } = useAuth();
  const { online, pendingCount, lastSuccessfulSync } = useSync();

  async function handleSignOut() {
    try {
      await signOut();
    } catch {
      // A stable error code is rendered without leaking backend details.
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Профиль и устройство</p>
          <h1>Настройки</h1>
          <p className="lede">
            Управление аккаунтом, offline-данными и синхронизацией.
          </p>
        </div>
      </header>
      <Card className="settings-list">
        <div className="settings-row">
          <div>
            <h2>Аккаунт</h2>
            <p>{user?.displayName}</p>
          </div>
          <button
            className="secondary-button"
            disabled={pending}
            onClick={handleSignOut}
            type="button"
          >
            {pending ? "Выходим…" : "Выйти"}
          </button>
        </div>
        <div className="settings-row">
          <div>
            <h2>Источник данных</h2>
            <p>
              {backendMode === "fake"
                ? "Безопасный fake adapter для разработки"
                : "Supabase Auth + Data API"}
            </p>
          </div>
          <span className="time-chip">
            {backendMode === "fake" ? "Демо" : "Online"}
          </span>
        </div>
        <div className="settings-row">
          <div>
            <h2>Учебный день</h2>
            <p>Europe/Moscow · 25 минут</p>
          </div>
        </div>
        <div className="settings-row">
          <div>
            <h2>Offline-данные</h2>
            <p>
              Активная сессия и outbox хранятся на устройстве. В очереди:{" "}
              {pendingCount}. Последняя sync:{" "}
              {lastSuccessfulSync
                ? new Date(lastSuccessfulSync).toLocaleString("ru-RU")
                : "ещё не выполнялась"}
              .
            </p>
          </div>
          <span className="time-chip">{online ? "Online" : "Offline"}</span>
        </div>
        {errorCode === "AUTH_SIGN_OUT_FAILED" && (
          <p className="form-error" role="alert">
            Не удалось завершить сеанс. Повторите попытку.
          </p>
        )}
      </Card>
    </div>
  );
}
