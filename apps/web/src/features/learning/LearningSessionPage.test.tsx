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
    await user.click(screen.getByRole("button", { name: "Один признак" }));
    await revealAndRate(user);
    await user.click(screen.getByRole("button", { name: "Ложь" }));
    await revealAndRate(user);
    await revealAndRate(user);
    await user.click(
      screen.getByRole("button", { name: "Пропущенное значение" }),
    );
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
});

async function revealAndRate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: "Показать ответ" }),
  );
  await user.click(await screen.findByRole("button", { name: "Хорошо" }));
}
