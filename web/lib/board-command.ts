import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { parseBoardCommand } from "@/lib/board-command-parser";

export type ChatActionLink = {
  kind: "board" | "column" | "task";
  label: string;
  href: string;
};

export type BoardCommandOutcome = {
  summary: string;
  actions: ChatActionLink[];
};

type NamedRow = { id: string; name: string };
type BoardRow = NamedRow & { company_id: string };
type ColumnRow = NamedRow & { board_id: string; position: number };
type BoardItemRow = { id: string; task_id: string };
type TaskRow = { id: string; title: string };

function untyped(client: Awaited<ReturnType<typeof createClient>>): SupabaseClient {
  return client as unknown as SupabaseClient;
}

function safePattern(value: string): string {
  return value.replace(/[%_*]/g, " ").replace(/\s+/g, " ").trim();
}

function failure(message: string): BoardCommandOutcome {
  return { summary: message, actions: [] };
}

function databaseMessage(error: unknown): string {
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "The board action could not be completed.";
}

async function findCompanies(db: SupabaseClient, name: string): Promise<NamedRow[]> {
  const exact = await db.from("companies").select("id, name").ilike("name", safePattern(name)).limit(5);
  if (exact.error) throw exact.error;
  if ((exact.data ?? []).length > 0) return exact.data as NamedRow[];

  const partial = await db
    .from("companies")
    .select("id, name")
    .ilike("name", `%${safePattern(name)}%`)
    .limit(5);
  if (partial.error) throw partial.error;
  return (partial.data ?? []) as NamedRow[];
}

async function findBoards(db: SupabaseClient, name: string): Promise<BoardRow[]> {
  const exact = await db
    .from("boards")
    .select("id, name, company_id")
    .is("archived_at", null)
    .ilike("name", safePattern(name))
    .limit(5);
  if (exact.error) throw exact.error;
  if ((exact.data ?? []).length > 0) return exact.data as BoardRow[];

  const partial = await db
    .from("boards")
    .select("id, name, company_id")
    .is("archived_at", null)
    .ilike("name", `%${safePattern(name)}%`)
    .limit(5);
  if (partial.error) throw partial.error;
  return (partial.data ?? []) as BoardRow[];
}

async function uniqueBoard(
  db: SupabaseClient,
  name: string
): Promise<{ board: BoardRow | null; outcome: BoardCommandOutcome | null }> {
  const boards = await findBoards(db, name);
  if (boards.length === 0) {
    return { board: null, outcome: failure(`I could not find a board matching “${name}”.`) };
  }
  if (boards.length > 1) {
    return {
      board: null,
      outcome: failure(
        `I found multiple boards matching “${name}”. Rename one to be unique, or open the board and make the change there.`
      ),
    };
  }
  return { board: boards[0], outcome: null };
}

async function findColumns(
  db: SupabaseClient,
  boardId: string,
  name: string
): Promise<ColumnRow[]> {
  const exact = await db
    .from("board_columns")
    .select("id, name, board_id, position")
    .eq("board_id", boardId)
    .ilike("name", safePattern(name))
    .limit(5);
  if (exact.error) throw exact.error;
  if ((exact.data ?? []).length > 0) return exact.data as ColumnRow[];

  const partial = await db
    .from("board_columns")
    .select("id, name, board_id, position")
    .eq("board_id", boardId)
    .ilike("name", `%${safePattern(name)}%`)
    .limit(5);
  if (partial.error) throw partial.error;
  return (partial.data ?? []) as ColumnRow[];
}

export async function tryExecuteBoardCommand(
  command: string
): Promise<BoardCommandOutcome | null> {
  const intent = parseBoardCommand(command);
  if (!intent) return null;

  const db = untyped(await createClient());

  try {
    if (intent.type === "create_board") {
      const companies = await findCompanies(db, intent.companyName);
      if (companies.length === 0) {
        return failure(`I could not find a company matching “${intent.companyName}”.`);
      }
      if (companies.length > 1) {
        return failure(`I found multiple companies matching “${intent.companyName}”. Please use the full company name.`);
      }

      const { data, error } = await db.rpc("create_board_with_defaults", {
        p_company_id: companies[0].id,
        p_name: intent.boardName,
        p_description: `Created from AI Native Chat for ${companies[0].name}.`,
      });
      if (error) throw error;
      const id = String(data);
      return {
        summary: `Created “${intent.boardName}” for ${companies[0].name} with four default workflow columns.`,
        actions: [{ kind: "board", label: `Open ${intent.boardName}`, href: `/board/${id}` }],
      };
    }

    const resolved = await uniqueBoard(db, intent.boardName);
    if (!resolved.board) return resolved.outcome;
    const board = resolved.board;

    if (intent.type === "rename_board") {
      const { error } = await db
        .from("boards")
        .update({ name: intent.newName, updated_at: new Date().toISOString() })
        .eq("id", board.id);
      if (error) throw error;
      return {
        summary: `Renamed the board “${board.name}” to “${intent.newName}”.`,
        actions: [{ kind: "board", label: `Open ${intent.newName}`, href: `/board/${board.id}` }],
      };
    }

    if (intent.type === "add_column") {
      const { data: last, error: readError } = await db
        .from("board_columns")
        .select("position")
        .eq("board_id", board.id)
        .order("position", { ascending: false })
        .limit(1);
      if (readError) throw readError;
      const position = Number((last as Array<{ position: number }> | null)?.[0]?.position ?? 0) + 1000;
      const { error } = await db.from("board_columns").insert({
        board_id: board.id,
        name: intent.columnName,
        canonical_status: "queued",
        position,
      });
      if (error) throw error;
      return {
        summary: `Added the column “${intent.columnName}” to “${board.name}”.`,
        actions: [{ kind: "column", label: `Open ${board.name}`, href: `/board/${board.id}` }],
      };
    }

    if (intent.type === "rename_column") {
      const columns = await findColumns(db, board.id, intent.columnName);
      if (columns.length !== 1) {
        return failure(
          columns.length === 0
            ? `I could not find a column matching “${intent.columnName}” on “${board.name}”.`
            : `I found multiple columns matching “${intent.columnName}”. Please use the exact name.`
        );
      }
      const { error } = await db
        .from("board_columns")
        .update({ name: intent.newName, updated_at: new Date().toISOString() })
        .eq("id", columns[0].id);
      if (error) throw error;
      return {
        summary: `Renamed “${columns[0].name}” to “${intent.newName}” on “${board.name}”.`,
        actions: [{ kind: "column", label: `Open ${board.name}`, href: `/board/${board.id}` }],
      };
    }

    if (intent.type === "add_task") {
      const { data: columns, error: columnsError } = await db
        .from("board_columns")
        .select("id, name, board_id, position")
        .eq("board_id", board.id)
        .order("position")
        .limit(1);
      if (columnsError) throw columnsError;
      const firstColumn = (columns as ColumnRow[] | null)?.[0];
      if (!firstColumn) return failure(`“${board.name}” has no columns yet.`);

      const { data, error } = await db.rpc("create_board_task", {
        p_board_id: board.id,
        p_column_id: firstColumn.id,
        p_title: intent.taskTitle,
        p_description: "Created from AI Native Chat.",
        p_priority: "medium",
        p_owner_person_id: null,
        p_deadline: null,
      });
      if (error) throw error;
      return {
        summary: `Added “${intent.taskTitle}” to ${firstColumn.name} on “${board.name}”.`,
        actions: [
          { kind: "task", label: `Open task on ${board.name}`, href: `/board/${board.id}?task=${String(data)}` },
        ],
      };
    }

    const columns = await findColumns(db, board.id, intent.columnName);
    if (columns.length !== 1) {
      return failure(
        columns.length === 0
          ? `I could not find a column matching “${intent.columnName}” on “${board.name}”.`
          : `I found multiple columns matching “${intent.columnName}”. Please use the exact name.`
      );
    }

    const { data: itemData, error: itemError } = await db
      .from("board_items")
      .select("id, task_id")
      .eq("board_id", board.id);
    if (itemError) throw itemError;
    const boardItems = (itemData ?? []) as BoardItemRow[];
    if (boardItems.length === 0) return failure(`“${board.name}” has no cards to move.`);

    const { data: tasksData, error: tasksError } = await db
      .from("tasks")
      .select("id, title")
      .in("id", boardItems.map((item) => item.task_id))
      .ilike("title", `%${safePattern(intent.taskTitle)}%`)
      .limit(5);
    if (tasksError) throw tasksError;
    const tasks = (tasksData ?? []) as TaskRow[];
    if (tasks.length !== 1) {
      return failure(
        tasks.length === 0
          ? `I could not find a visible task matching “${intent.taskTitle}” on “${board.name}”.`
          : `I found multiple tasks matching “${intent.taskTitle}”. Please use the full task title.`
      );
    }
    const item = boardItems.find((candidate) => candidate.task_id === tasks[0].id);
    if (!item) return failure("The task card could not be resolved.");

    const { error } = await db.rpc("move_board_item", {
      p_item_id: item.id,
      p_target_column_id: columns[0].id,
    });
    if (error) throw error;
    return {
      summary: `Moved “${tasks[0].title}” to “${columns[0].name}” on “${board.name}”.`,
      actions: [{ kind: "task", label: `Open ${board.name}`, href: `/board/${board.id}` }],
    };
  } catch (error) {
    return failure(databaseMessage(error));
  }
}
