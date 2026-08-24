export type BoardCommandIntent =
  | { type: "create_board"; boardName: string; companyName: string }
  | { type: "rename_board"; boardName: string; newName: string }
  | { type: "add_column"; boardName: string; columnName: string }
  | { type: "rename_column"; boardName: string; columnName: string; newName: string }
  | { type: "add_task"; boardName: string; taskTitle: string }
  | { type: "move_task"; boardName: string; taskTitle: string; columnName: string };

function clean(value: string): string {
  return value
    .trim()
    .replace(/^[\"'“”’]+|[\"'“”’]+$/g, "")
    .replace(/[.!?]+$/g, "")
    .trim();
}

export function parseBoardCommand(command: string): BoardCommandIntent | null {
  const value = command.trim();

  let match = value.match(
    /^create\s+(?:a\s+)?board\s+(?:(?:called|named)\s+)?(.+?)\s+for\s+(.+?)\s*[.!?]*$/i
  );
  if (match) {
    return { type: "create_board", boardName: clean(match[1]), companyName: clean(match[2]) };
  }

  match = value.match(
    /^rename\s+(?:the\s+)?board\s+(.+?)\s+to\s+(.+?)\s*[.!?]*$/i
  );
  if (match) {
    return { type: "rename_board", boardName: clean(match[1]), newName: clean(match[2]) };
  }

  match = value.match(
    /^add\s+(?:a\s+)?column\s+(.+?)\s+to\s+(?:the\s+)?board\s+(.+?)\s*[.!?]*$/i
  );
  if (match) {
    return { type: "add_column", columnName: clean(match[1]), boardName: clean(match[2]) };
  }

  match = value.match(
    /^rename\s+(?:the\s+)?column\s+(.+?)\s+to\s+(.+?)\s+(?:on|in)\s+(?:the\s+)?board\s+(.+?)\s*[.!?]*$/i
  );
  if (match) {
    return {
      type: "rename_column",
      columnName: clean(match[1]),
      newName: clean(match[2]),
      boardName: clean(match[3]),
    };
  }

  match = value.match(
    /^add\s+(?:a\s+)?task\s+(?:(?:called|named)\s+)?(.+?)\s+to\s+(?:the\s+)?board\s+(.+?)\s*[.!?]*$/i
  );
  if (match) {
    return { type: "add_task", taskTitle: clean(match[1]), boardName: clean(match[2]) };
  }

  match = value.match(
    /^move\s+(?:the\s+)?task\s+(.+?)\s+to\s+(?:the\s+)?column\s+(.+?)\s+(?:on|in)\s+(?:the\s+)?board\s+(.+?)\s*[.!?]*$/i
  );
  if (match) {
    return {
      type: "move_task",
      taskTitle: clean(match[1]),
      columnName: clean(match[2]),
      boardName: clean(match[3]),
    };
  }

  return null;
}
