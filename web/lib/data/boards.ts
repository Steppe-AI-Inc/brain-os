"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export type BoardPriority = "low" | "medium" | "high" | "urgent";
export type BoardStatus =
  | "draft"
  | "queued"
  | "in_progress"
  | "blocked"
  | "needs_approval"
  | "qa_review"
  | "done"
  | "rejected"
  | "archived";

export type BoardPerson = {
  id: string;
  fullName: string;
  roleTitle: string | null;
};

export type BoardItem = {
  id: string;
  taskId: string;
  columnId: string;
  position: number;
  title: string;
  description: string | null;
  status: BoardStatus;
  priority: BoardPriority;
  riskLevel: string;
  approvalRequired: boolean;
  deadline: string | null;
  ownerPersonId: string | null;
  ownerName: string | null;
};

export type BoardColumn = {
  id: string;
  name: string;
  canonicalStatus: BoardStatus;
  color: string;
  position: number;
  wipLimit: number | null;
  items: BoardItem[];
};

export type BoardDetail = {
  id: string;
  companyId: string;
  companyName: string;
  name: string;
  description: string | null;
  color: string;
  updatedAt: string;
  canManageStructure: boolean;
  currentPersonId: string | null;
  people: BoardPerson[];
  columns: BoardColumn[];
};

export type BoardSummary = {
  id: string;
  companyId: string;
  companyName: string;
  name: string;
  description: string | null;
  color: string;
  updatedAt: string;
  columnCount: number;
  itemCount: number;
};

export type BoardActionResult = {
  error: string | null;
  id?: string;
};

type BoardRow = {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  color: string;
  updated_at: string;
  companies: { name: string } | Array<{ name: string }> | null;
  board_columns?: Array<{ id: string }> | null;
  board_items?: Array<{ id: string }> | null;
};

type ColumnRow = {
  id: string;
  board_id: string;
  name: string;
  canonical_status: BoardStatus;
  color: string;
  position: number;
  wip_limit: number | null;
};

type ItemRow = {
  id: string;
  board_id: string;
  column_id: string;
  task_id: string;
  position: number | string;
};

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: BoardStatus | null;
  priority: BoardPriority | null;
  risk_level: string | null;
  approval_required: boolean | null;
  deadline: string | null;
  owner_person_id: string | null;
};

type PersonRow = {
  id: string;
  profile_id: string | null;
  full_name: string;
  role_title: string | null;
};

type ProfileRow = {
  id: string;
  role: string;
};

type MembershipRow = {
  role_in_company: string | null;
};

const STRUCTURE_ROLES = new Set(["founder", "holding_admin"]);
const COMPANY_MANAGER_ROLES = new Set(["owner", "manager", "team_lead"]);
const STATUS_COLORS: Record<BoardStatus, string> = {
  draft: "#8e8e93",
  queued: "#8e8e93",
  in_progress: "#007aff",
  blocked: "#ff9500",
  needs_approval: "#af52de",
  qa_review: "#5ac8fa",
  done: "#34c759",
  rejected: "#ff3b30",
  archived: "#636366",
};

function untyped(client: Awaited<ReturnType<typeof createClient>>): SupabaseClient {
  // Temporary compatibility bridge until the additive migration is applied and
  // database types are regenerated from Supabase. Queries remain server-only and RLS-scoped.
  return client as unknown as SupabaseClient;
}

function relatedCompanyName(value: BoardRow["companies"]): string {
  if (Array.isArray(value)) return value[0]?.name ?? "Company";
  return value?.name ?? "Company";
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "The operation could not be completed.";
}

function refreshBoard(boardId?: string) {
  revalidatePath("/board");
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  if (boardId) revalidatePath(`/board/${boardId}`);
}

export async function getBoards(): Promise<BoardSummary[]> {
  const db = untyped(await createClient());
  const { data, error } = await db
    .from("boards")
    .select(
      "id, company_id, name, description, color, updated_at, companies(name), board_columns(id), board_items(id)"
    )
    .is("archived_at", null)
    .order("updated_at", { ascending: false });
  if (error) throw error;

  return ((data ?? []) as BoardRow[]).map((row) => ({
    id: row.id,
    companyId: row.company_id,
    companyName: relatedCompanyName(row.companies),
    name: row.name,
    description: row.description,
    color: row.color,
    updatedAt: row.updated_at,
    columnCount: row.board_columns?.length ?? 0,
    itemCount: row.board_items?.length ?? 0,
  }));
}

export async function getBoard(boardId: string): Promise<BoardDetail | null> {
  const typedClient = await createClient();
  const db = untyped(typedClient);
  const {
    data: { user },
  } = await typedClient.auth.getUser();
  if (!user) return null;

  const { data: boardData, error: boardError } = await db
    .from("boards")
    .select("id, company_id, name, description, color, updated_at, companies(name)")
    .eq("id", boardId)
    .is("archived_at", null)
    .maybeSingle();
  if (boardError) throw boardError;
  if (!boardData) return null;
  const board = boardData as BoardRow;

  const [{ data: columnsData, error: columnsError }, { data: itemsData, error: itemsError }] =
    await Promise.all([
      db
        .from("board_columns")
        .select("id, board_id, name, canonical_status, color, position, wip_limit")
        .eq("board_id", boardId)
        .order("position"),
      db
        .from("board_items")
        .select("id, board_id, column_id, task_id, position")
        .eq("board_id", boardId)
        .order("position"),
    ]);
  if (columnsError) throw columnsError;
  if (itemsError) throw itemsError;

  const itemRows = (itemsData ?? []) as ItemRow[];
  const taskIds = itemRows.map((item) => item.task_id);
  const { data: tasksData, error: tasksError } = taskIds.length
    ? await db
        .from("tasks")
        .select(
          "id, title, description, status, priority, risk_level, approval_required, deadline, owner_person_id"
        )
        .in("id", taskIds)
    : { data: [], error: null };
  if (tasksError) throw tasksError;

  const { data: peopleData, error: peopleError } = await db
    .from("people")
    .select("id, profile_id, full_name, role_title")
    .eq("company_id", board.company_id)
    .eq("active", true)
    .order("full_name");
  if (peopleError) throw peopleError;

  const { data: profileData, error: profileError } = await db
    .from("profiles")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .single();
  if (profileError) throw profileError;
  const profile = profileData as ProfileRow;

  const { data: membershipData } = await db
    .from("company_memberships")
    .select("role_in_company")
    .eq("company_id", board.company_id)
    .eq("profile_id", profile.id)
    .eq("active", true)
    .maybeSingle();

  const people = (peopleData ?? []) as PersonRow[];
  const tasksById = new Map(((tasksData ?? []) as TaskRow[]).map((task) => [task.id, task]));
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const itemsByColumn = new Map<string, BoardItem[]>();

  for (const row of itemRows) {
    const task = tasksById.get(row.task_id);
    if (!task) continue;
    const owner = task.owner_person_id ? peopleById.get(task.owner_person_id) : null;
    const item: BoardItem = {
      id: row.id,
      taskId: row.task_id,
      columnId: row.column_id,
      position: Number(row.position),
      title: task.title,
      description: task.description,
      status: task.status ?? "queued",
      priority: task.priority ?? "medium",
      riskLevel: task.risk_level ?? "low",
      approvalRequired: task.approval_required ?? false,
      deadline: task.deadline,
      ownerPersonId: task.owner_person_id,
      ownerName: owner?.full_name ?? null,
    };
    itemsByColumn.set(row.column_id, [...(itemsByColumn.get(row.column_id) ?? []), item]);
  }

  const membership = membershipData as MembershipRow | null;
  const canManageStructure =
    STRUCTURE_ROLES.has(profile.role) ||
    COMPANY_MANAGER_ROLES.has(membership?.role_in_company ?? "");

  return {
    id: board.id,
    companyId: board.company_id,
    companyName: relatedCompanyName(board.companies),
    name: board.name,
    description: board.description,
    color: board.color,
    updatedAt: board.updated_at,
    canManageStructure,
    currentPersonId: people.find((person) => person.profile_id === profile.id)?.id ?? null,
    people: people.map((person) => ({
      id: person.id,
      fullName: person.full_name,
      roleTitle: person.role_title,
    })),
    columns: ((columnsData ?? []) as ColumnRow[]).map((column) => ({
      id: column.id,
      name: column.name,
      canonicalStatus: column.canonical_status,
      color: column.color,
      position: column.position,
      wipLimit: column.wip_limit,
      items: itemsByColumn.get(column.id) ?? [],
    })),
  };
}

export async function createBoard(formData: FormData): Promise<BoardActionResult> {
  const companyId = String(formData.get("company_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!companyId) return { error: "Choose a company." };
  if (!name) return { error: "Board name is required." };
  if (name.length > 120) return { error: "Board name must be 120 characters or fewer." };

  try {
    const db = untyped(await createClient());
    const { data, error } = await db.rpc("create_board_with_defaults", {
      p_company_id: companyId,
      p_name: name,
      p_description: description || null,
    });
    if (error) throw error;
    const id = String(data);
    refreshBoard(id);
    return { error: null, id };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function updateBoard(
  boardId: string,
  values: { name: string; description: string }
): Promise<BoardActionResult> {
  const name = values.name.trim();
  if (!name) return { error: "Board name is required." };
  if (name.length > 120) return { error: "Board name must be 120 characters or fewer." };

  try {
    const db = untyped(await createClient());
    const { error } = await db
      .from("boards")
      .update({
        name,
        description: values.description.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", boardId);
    if (error) throw error;
    refreshBoard(boardId);
    return { error: null };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function archiveBoard(boardId: string): Promise<BoardActionResult> {
  try {
    const db = untyped(await createClient());
    const { error } = await db
      .from("boards")
      .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", boardId);
    if (error) throw error;
    refreshBoard(boardId);
    return { error: null };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function createBoardColumn(
  boardId: string,
  values: { name: string; status: BoardStatus }
): Promise<BoardActionResult> {
  const name = values.name.trim();
  if (!name) return { error: "Column name is required." };

  try {
    const db = untyped(await createClient());
    const { data: existing, error: readError } = await db
      .from("board_columns")
      .select("position")
      .eq("board_id", boardId)
      .order("position", { ascending: false })
      .limit(1);
    if (readError) throw readError;
    const lastPosition = Number((existing as Array<{ position: number }> | null)?.[0]?.position ?? 0);
    const { data, error } = await db
      .from("board_columns")
      .insert({
        board_id: boardId,
        name,
        canonical_status: values.status,
        color: STATUS_COLORS[values.status],
        position: lastPosition + 1000,
      })
      .select("id")
      .single();
    if (error) throw error;
    refreshBoard(boardId);
    return { error: null, id: String((data as { id: string }).id) };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function renameBoardColumn(
  boardId: string,
  columnId: string,
  name: string
): Promise<BoardActionResult> {
  const cleanName = name.trim();
  if (!cleanName) return { error: "Column name is required." };

  try {
    const db = untyped(await createClient());
    const { error } = await db
      .from("board_columns")
      .update({ name: cleanName, updated_at: new Date().toISOString() })
      .eq("id", columnId)
      .eq("board_id", boardId);
    if (error) throw error;
    refreshBoard(boardId);
    return { error: null };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function deleteBoardColumn(
  boardId: string,
  columnId: string
): Promise<BoardActionResult> {
  try {
    const db = untyped(await createClient());
    const { error } = await db
      .from("board_columns")
      .delete()
      .eq("id", columnId)
      .eq("board_id", boardId);
    if (error) throw error;
    refreshBoard(boardId);
    return { error: null };
  } catch (error) {
    return {
      error:
        errorMessage(error).includes("foreign key")
          ? "Move or remove every card before deleting this column."
          : errorMessage(error),
    };
  }
}

export async function createBoardTask(
  boardId: string,
  columnId: string,
  values: {
    title: string;
    description?: string;
    priority?: BoardPriority;
    ownerPersonId?: string | null;
    deadline?: string | null;
  }
): Promise<BoardActionResult> {
  const title = values.title.trim();
  if (!title) return { error: "Task title is required." };

  try {
    const db = untyped(await createClient());
    const { data, error } = await db.rpc("create_board_task", {
      p_board_id: boardId,
      p_column_id: columnId,
      p_title: title,
      p_description: values.description?.trim() || null,
      p_priority: values.priority ?? "medium",
      p_owner_person_id: values.ownerPersonId || null,
      p_deadline: values.deadline || null,
    });
    if (error) throw error;
    refreshBoard(boardId);
    return { error: null, id: String(data) };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function updateBoardTask(
  boardId: string,
  taskId: string,
  values: {
    title: string;
    description: string;
    priority: BoardPriority;
    ownerPersonId: string | null;
    deadline: string | null;
  }
): Promise<BoardActionResult> {
  const title = values.title.trim();
  if (!title) return { error: "Task title is required." };

  try {
    const db = untyped(await createClient());
    const { error } = await db
      .from("tasks")
      .update({
        title,
        description: values.description.trim() || null,
        priority: values.priority,
        owner_person_id: values.ownerPersonId || null,
        deadline: values.deadline || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId);
    if (error) throw error;
    refreshBoard(boardId);
    return { error: null };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function moveBoardItem(
  boardId: string,
  itemId: string,
  targetColumnId: string
): Promise<BoardActionResult> {
  try {
    const db = untyped(await createClient());
    const { error } = await db.rpc("move_board_item", {
      p_item_id: itemId,
      p_target_column_id: targetColumnId,
    });
    if (error) throw error;
    refreshBoard(boardId);
    return { error: null };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function removeBoardItem(
  boardId: string,
  itemId: string
): Promise<BoardActionResult> {
  try {
    const db = untyped(await createClient());
    const { error } = await db.from("board_items").delete().eq("id", itemId);
    if (error) throw error;
    refreshBoard(boardId);
    return { error: null };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}
