import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TagFilterBar } from "./tag-filter-bar";

const options = [
  { key: "глаголы", display: "глаголы" },
  { key: "спорт", display: "спорт" },
];

describe("TagFilterBar", () => {
  it("renders nothing when there are no options", () => {
    const { container } = render(
      <TagFilterBar options={[]} selectedKeys={[]} onToggle={vi.fn()} onReset={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("toggles a tag on click", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <TagFilterBar options={options} selectedKeys={[]} onToggle={onToggle} onReset={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: "спорт" }));

    expect(onToggle).toHaveBeenCalledWith("спорт");
  });

  it("marks selected tags as pressed and offers reset", async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    render(
      <TagFilterBar
        options={options}
        selectedKeys={["спорт"]}
        onToggle={vi.fn()}
        onReset={onReset}
      />,
    );

    expect(screen.getByRole("button", { name: "спорт" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Сбросить" }));

    expect(onReset).toHaveBeenCalled();
  });
});
