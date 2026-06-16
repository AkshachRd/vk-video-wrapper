import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { WordTagEditor } from "./word-tag-editor";

describe("WordTagEditor", () => {
  it("renders existing tags", () => {
    render(
      <WordTagEditor
        wordId="de:welt"
        tags={["глаголы"]}
        suggestions={[]}
        onAddTag={vi.fn()}
        onRemoveTag={vi.fn()}
      />,
    );

    expect(screen.getByText("глаголы")).toBeInTheDocument();
  });

  it("adds a typed tag on Enter", async () => {
    const user = userEvent.setup();
    const onAddTag = vi.fn();
    render(
      <WordTagEditor
        wordId="de:welt"
        tags={[]}
        suggestions={[]}
        onAddTag={onAddTag}
        onRemoveTag={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Добавить тег" }));
    await user.type(screen.getByLabelText("Новый тег"), "B1{Enter}");

    expect(onAddTag).toHaveBeenCalledWith("de:welt", "B1");
  });

  it("adds an existing tag from suggestions", async () => {
    const user = userEvent.setup();
    const onAddTag = vi.fn();
    render(
      <WordTagEditor
        wordId="de:welt"
        tags={[]}
        suggestions={["спорт"]}
        onAddTag={onAddTag}
        onRemoveTag={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Добавить тег" }));
    await user.click(screen.getByRole("button", { name: "спорт" }));

    expect(onAddTag).toHaveBeenCalledWith("de:welt", "спорт");
  });

  it("removes a tag", async () => {
    const user = userEvent.setup();
    const onRemoveTag = vi.fn();
    render(
      <WordTagEditor
        wordId="de:welt"
        tags={["спорт"]}
        suggestions={[]}
        onAddTag={vi.fn()}
        onRemoveTag={onRemoveTag}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Снять тег спорт" }));

    expect(onRemoveTag).toHaveBeenCalledWith("de:welt", "спорт");
  });

  it("dismisses the input on Escape without adding", async () => {
    const user = userEvent.setup();
    const onAddTag = vi.fn();
    render(
      <WordTagEditor
        wordId="de:welt"
        tags={[]}
        suggestions={[]}
        onAddTag={onAddTag}
        onRemoveTag={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Добавить тег" }));
    await user.type(screen.getByLabelText("Новый тег"), "B1{Escape}");

    expect(onAddTag).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Новый тег")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Добавить тег" })).toBeInTheDocument();
  });

  it("does not add a tag that is already present", async () => {
    const user = userEvent.setup();
    const onAddTag = vi.fn();
    render(
      <WordTagEditor
        wordId="de:welt"
        tags={["спорт"]}
        suggestions={[]}
        onAddTag={onAddTag}
        onRemoveTag={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Добавить тег" }));
    await user.type(screen.getByLabelText("Новый тег"), "Спорт{Enter}");

    expect(onAddTag).not.toHaveBeenCalled();
  });
});
