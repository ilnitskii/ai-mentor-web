import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { App } from "../../app/App";
import { createFakeBackendServices } from "../../data/fakeBackendClient";

describe("daily learning vertical slice", () => {
  beforeEach(() => {
    window.location.hash = "#/session";
  });

  it("completes lesson, five cards, one task and summary without duplicate events", async () => {
    const services = createFakeBackendServices({
      id: "local-demo-user",
      username: "learner",
      displayName: "Learner",
    });
    const user = userEvent.setup();
    const view = render(<App services={services} />);

    await user.type(await screen.findByLabelText("Ваш ответ"), "Одну продажу");
    await user.click(
      screen.getByRole("button", { name: "Проверить и продолжить" }),
    );

    await revealAndRate(user);
    await revealAndRate(user);
    await revealAndRate(user);
    await revealAndRate(user);
    await revealAndRate(user);

    await user.click(
      screen.getByRole("button", {
        name: /choice.*выберите зерно таблицы/i,
      }),
    );
    await user.click(screen.getByLabelText("Одна продажа"));
    await user.click(screen.getByRole("button", { name: "Ответить" }));

    expect(
      await screen.findByRole("heading", { name: "Отличная работа" }),
    ).toBeInTheDocument();
    expect(
      await services.database.listProgressEvents("local-demo-user"),
    ).toHaveLength(7);

    view.unmount();
    render(<App services={services} />);
    expect(
      await screen.findByRole("heading", { name: "Отличная работа" }),
    ).toBeInTheDocument();
    expect(
      await services.database.listProgressEvents("local-demo-user"),
    ).toHaveLength(7);
  });

  it("finishes a local action offline and syncs it after connectivity returns", async () => {
    const services = createFakeBackendServices({
      id: "offline-user",
      username: "offline",
      displayName: "Offline learner",
    });
    const originalOnline = navigator.onLine;
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    window.dispatchEvent(new Event("offline"));
    const user = userEvent.setup();
    render(<App services={services} />);

    await user.type(await screen.findByLabelText("Ваш ответ"), "Одну продажу");
    await user.click(
      screen.getByRole("button", { name: "Проверить и продолжить" }),
    );

    expect(await screen.findByText("Показать ответ")).toBeInTheDocument();
    await expect(
      services.database.listProgressEvents("offline-user"),
    ).resolves.toHaveLength(0);
    await expect(services.offline.pendingCount("offline-user")).resolves.toBe(
      1,
    );

    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    window.dispatchEvent(new Event("online"));

    await expect
      .poll(() => services.offline.pendingCount("offline-user"))
      .toBe(0);
    await expect(
      services.database.listProgressEvents("offline-user"),
    ).resolves.toHaveLength(1);

    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: originalOnline,
    });
  });

  it("opens a selected lesson instead of always falling back to the demo", async () => {
    window.location.hash = "#/session/2/1";
    const services = createFakeBackendServices({
      id: "course-user",
      username: "course-user",
      displayName: "Course user",
    });

    render(<App services={services} />);

    expect(
      await screen.findByRole("heading", {
        name: "Формулы и порядок вычислений",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Неделя 2 · день 1")).toBeInTheDocument();
  });
});

async function revealAndRate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: "Показать ответ" }),
  );
  await user.click(await screen.findByRole("button", { name: "Хорошо" }));
}
