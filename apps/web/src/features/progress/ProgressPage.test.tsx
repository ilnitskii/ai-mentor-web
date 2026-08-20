import { render, screen } from "@testing-library/react";

import { App } from "../../app/App";
import { createFakeBackendServices } from "../../data/fakeBackendClient";

describe("ProgressPage", () => {
  it("renders an event-derived projection instead of static progress", async () => {
    window.location.hash = "#/progress";
    const services = createFakeBackendServices({
      id: "local-demo-user",
      username: "learner",
      displayName: "Learner",
    });
    await services.database.appendProgressEvent("local-demo-user", {
      event_id: "61000000-0000-4000-8000-000000000001",
      schema_version: 1,
      profile_id: "default",
      device_id: "synthetic-device",
      item_id: "foundations.data-tables.intro",
      event_type: "lesson_completed",
      occurred_at: new Date().toISOString(),
      timezone: "UTC",
      payload: { correct: true },
    });

    render(<App services={services} />);

    expect(
      await screen.findByLabelText("40 процентов mastery"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Evidence: 1/)).toBeInTheDocument();
  });
});
