import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createFakeBackendServices } from "../data/fakeBackendClient";
import { MemoryUserCache } from "../data/userCache";
import { App } from "./App";

describe("App shell", () => {
  beforeEach(() => {
    window.location.hash = "#/";
  });

  async function signIn() {
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Имя"), "learner");
    await user.type(screen.getByLabelText("Пароль"), "synthetic-password");
    await user.click(screen.getByRole("button", { name: "Войти" }));
    return user;
  }

  it("requires login and then renders the mobile-first Today route", async () => {
    render(<App services={createFakeBackendServices()} />);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Войти" }),
    ).toBeInTheDocument();

    await signIn();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Добрый день" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /учиться/i })).not.toHaveLength(
      0,
    );
  });

  it("registers a new named user without asking for email", async () => {
    render(<App services={createFakeBackendServices()} />);
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", { name: "Новый пользователь" }),
    );
    await user.type(screen.getByLabelText("Имя"), "Алиса");
    await user.type(screen.getByLabelText("Пароль"), "synthetic-password");
    await user.click(
      screen.getByRole("button", { name: "Создать пользователя" }),
    );

    expect(
      await screen.findByRole("heading", { level: 1, name: "Добрый день" }),
    ).toBeInTheDocument();
  });

  it("navigates without a server-side route", async () => {
    render(<App services={createFakeBackendServices()} />);
    const user = await signIn();

    await user.click(screen.getAllByRole("link", { name: /прогресс/i })[0]);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Прогресс" }),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe("#/progress");
  });

  it("clears the current user cache on logout", async () => {
    const cache = new MemoryUserCache();
    render(<App services={createFakeBackendServices(null, cache)} />);
    const user = await signIn();

    await user.click(screen.getAllByRole("link", { name: /настройки/i })[0]);
    await user.click(await screen.findByRole("button", { name: "Выйти" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Войти" }),
    ).toBeInTheDocument();
    expect(cache.clearedUserIds).toEqual(["local-demo-learner"]);
  });
});
