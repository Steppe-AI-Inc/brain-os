import { describe, expect, it } from "vitest";
import { parseBoardCommand } from "../../lib/board-command-parser";

describe("board command parser", () => {
  it("creates a company board from a founder command", () => {
    expect(parseBoardCommand("Create a board named Uzbekistan launch for Steppe AI, Inc.")).toEqual({
      type: "create_board",
      boardName: "Uzbekistan launch",
      companyName: "Steppe AI, Inc",
    });
  });

  it("adds tasks and columns through the same chat surface", () => {
    expect(parseBoardCommand("Add column Client review to the board Uzbekistan launch")).toEqual({
      type: "add_column",
      columnName: "Client review",
      boardName: "Uzbekistan launch",
    });
    expect(parseBoardCommand("Add task Prepare IQParking quotation to the board Uzbekistan launch")).toEqual({
      type: "add_task",
      taskTitle: "Prepare IQParking quotation",
      boardName: "Uzbekistan launch",
    });
  });

  it("moves an exact task to a named workflow column", () => {
    expect(
      parseBoardCommand(
        "Move task Prepare IQParking quotation to column Client review on board Uzbekistan launch"
      )
    ).toEqual({
      type: "move_task",
      taskTitle: "Prepare IQParking quotation",
      columnName: "Client review",
      boardName: "Uzbekistan launch",
    });
  });

  it("leaves general founder commands for the AI orchestrator", () => {
    expect(parseBoardCommand("Prepare a proposal for 50 OpenSpot devices")).toBeNull();
  });
});
