import { render, screen } from "@testing-library/react";

import { LessonRenderer } from "./LessonRenderer";

describe("LessonRenderer", () => {
  it("renders GFM while refusing raw HTML and dangerous links", () => {
    const { container } = render(
      <LessonRenderer
        body={
          "# Урок\n\n| A |\n| - |\n| 1 |\n\n<script>window.pwned=true</script>\n\n[опасная ссылка](javascript:alert(1))"
        }
      />,
    );

    expect(screen.getByRole("heading", { name: "Урок" })).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("a")).toHaveAttribute("href", "");
  });
});
