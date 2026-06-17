import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { GraphSearchField } from "./graph-search-field";

describe("GraphSearchField", () => {
  it("показывает кнопку очистки только при непустом значении и очищает", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<GraphSearchField value="" onChange={onChange} />);
    expect(screen.queryByRole("button", { name: "Очистить" })).toBeNull();

    rerender(<GraphSearchField value="nein" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Очистить" }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("вводит текст и сообщает наверх", async () => {
    const onChange = vi.fn();
    render(<GraphSearchField value="" onChange={onChange} />);
    await userEvent.type(screen.getByLabelText("Поиск по словам и тегам"), "n");
    expect(onChange).toHaveBeenCalledWith("n");
  });
});
