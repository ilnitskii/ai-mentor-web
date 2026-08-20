import { type FormEvent, useState } from "react";

import { useAuth } from "../../app/useAuth";

type AuthMode = "signin" | "signup";

const errorMessages: Record<string, string> = {
  AUTH_INVALID_CREDENTIALS: "Не удалось войти. Проверьте имя и пароль.",
  AUTH_USERNAME_INVALID:
    "Имя должно содержать 2–40 букв, цифр, пробелов или символов . _ -",
  AUTH_USERNAME_TAKEN: "Это имя уже занято. Войдите или выберите другое.",
  AUTH_WEAK_PASSWORD: "Пароль слишком простой. Используйте минимум 8 символов.",
  AUTH_SIGNUP_DISABLED: "Регистрация сейчас закрыта владельцем проекта.",
  AUTH_SIGNUP_CONFIRMATION_REQUIRED:
    "В Supabase включено подтверждение email. Отключите Confirm email для регистрации по имени.",
  AUTH_SIGNUP_FAILED: "Не удалось зарегистрироваться. Повторите попытку.",
};

export function LoginPage() {
  const { signIn, signUp, pending, errorCode } = useAuth();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await (mode === "signin"
        ? signIn(username, password)
        : signUp(username, password));
    } catch {
      // The context exposes only a stable, user-safe error code below.
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="auth-title">
        <a className="brand auth-brand" href="#/" aria-label="AI Mentor">
          <span className="brand-mark">A</span>
          <span>
            <strong>AI Mentor</strong>
            <small>аналитика данных</small>
          </span>
        </a>
        <p className="eyebrow">Личное пространство обучения</p>
        <h1 id="auth-title">{mode === "signin" ? "Войти" : "Регистрация"}</h1>
        <p className="lede">
          {mode === "signin"
            ? "Введите имя и пароль. История синхронизируется между устройствами."
            : "Придумайте уникальное имя и пароль. Email не требуется."}
        </p>
        <div className="auth-mode" aria-label="Режим авторизации" role="group">
          <button
            aria-pressed={mode === "signin"}
            onClick={() => setMode("signin")}
            type="button"
          >
            Вход
          </button>
          <button
            aria-pressed={mode === "signup"}
            onClick={() => setMode("signup")}
            type="button"
          >
            Новый пользователь
          </button>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <label>
            Имя
            <input
              autoCapitalize="none"
              autoComplete="username"
              maxLength={40}
              minLength={2}
              name="username"
              onChange={(event) => setUsername(event.target.value)}
              required
              type="text"
              value={username}
            />
          </label>
          <label>
            Пароль
            <input
              autoComplete={
                mode === "signin" ? "current-password" : "new-password"
              }
              minLength={8}
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          {errorCode && errorMessages[errorCode] && (
            <p className="form-error" role="alert">
              {errorMessages[errorCode]}
            </p>
          )}
          <button className="primary-button" disabled={pending} type="submit">
            {pending
              ? mode === "signin"
                ? "Входим…"
                : "Создаём…"
              : mode === "signin"
                ? "Войти"
                : "Создать пользователя"}
          </button>
        </form>
        {mode === "signup" && (
          <p className="auth-note">
            Не используйте важный пароль: восстановление без email в MVP не
            предусмотрено.
          </p>
        )}
      </section>
    </main>
  );
}
