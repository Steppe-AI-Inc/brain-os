"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  CalendarClock,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  archiveBoard,
  createBoardColumn,
  createBoardTask,
  deleteBoardColumn,
  moveBoardItem,
  removeBoardItem,
  renameBoardColumn,
  updateBoard,
  updateBoardTask,
  type BoardColumn,
  type BoardDetail,
  type BoardItem,
  type BoardPriority,
  type BoardStatus,
} from "@/lib/data/boards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

const COLUMN_STATUS_OPTIONS: Array<{ value: BoardStatus; label: string }> = [
  { value: "queued", label: "Backlog / queued" },
  { value: "in_progress", label: "In progress" },
  { value: "blocked", label: "Blocked" },
  { value: "needs_approval", label: "Needs approval" },
  { value: "qa_review", label: "QA review" },
  { value: "done", label: "Done" },
];

const PRIORITY_OPTIONS: BoardPriority[] = ["low", "medium", "high", "urgent"];

function deadlineLabel(deadline: string | null): string | null {
  if (!deadline) return null;
  const value = new Date(deadline);
  const days = Math.ceil((value.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days}d`;
}

function localDateTime(deadline: string | null): string {
  if (!deadline) return "";
  const date = new Date(deadline);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function TaskEditor({
  board,
  item,
  onClose,
  onError,
}: {
  board: BoardDetail;
  item: BoardItem;
  onClose: () => void;
  onError: (message: string | null) => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? "");
  const [priority, setPriority] = useState<BoardPriority>(item.priority);
  const [ownerPersonId, setOwnerPersonId] = useState(item.ownerPersonId ?? "");
  const [deadline, setDeadline] = useState(localDateTime(item.deadline));
  const [pending, startTransition] = useTransition();
  const assignablePeople = board.canManageStructure
    ? board.people
    : board.people.filter((person) => person.id === board.currentPersonId);

  function save() {
    onError(null);
    startTransition(async () => {
      const result = await updateBoardTask(board.id, item.taskId, {
        title,
        description,
        priority,
        ownerPersonId: ownerPersonId || null,
        deadline: deadline ? new Date(deadline).toISOString() : null,
      });
      if (result.error) {
        onError(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  function remove() {
    onError(null);
    startTransition(async () => {
      const result = await removeBoardItem(board.id, item.id);
      if (result.error) {
        onError(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <>
      <SheetHeader className="border-b">
        <SheetTitle>Edit task</SheetTitle>
        <SheetDescription>
          This card is the canonical task. Changes also appear in Tasks, dashboards, and chat context.
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="task-title">Title</Label>
          <Input id="task-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={240} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="task-description">Description</Label>
          <Textarea
            id="task-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="min-h-28"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-priority">Priority</Label>
            <select
              id="task-priority"
              value={priority}
              onChange={(event) => setPriority(event.target.value as BoardPriority)}
              className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
            >
              {PRIORITY_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value[0].toUpperCase() + value.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-owner">Assignee</Label>
            <select
              id="task-owner"
              value={ownerPersonId}
              onChange={(event) => setOwnerPersonId(event.target.value)}
              className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
            >
              {board.canManageStructure && <option value="">Unassigned</option>}
              {assignablePeople.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.fullName}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="task-deadline">Deadline</Label>
          <Input
            id="task-deadline"
            type="datetime-local"
            value={deadline}
            onChange={(event) => setDeadline(event.target.value)}
          />
        </div>
      </div>
      <SheetFooter className="border-t sm:flex-row sm:justify-between">
        <Button type="button" variant="destructive" onClick={remove} disabled={pending}>
          <Trash2 className="size-4" />
          Remove from board
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={pending || !title.trim()}>
            {pending ? "Saving…" : "Save task"}
          </Button>
        </div>
      </SheetFooter>
    </>
  );
}

export function WorkBoard({ board }: { board: BoardDetail }) {
  const router = useRouter();
  const [columns, setColumns] = useState<BoardColumn[]>(board.columns);
  const [dragItemId, setDragItemId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<BoardItem | null>(null);
  const [quickTitles, setQuickTitles] = useState<Record<string, string>>({});
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [columnName, setColumnName] = useState("");
  const [showBoardSettings, setShowBoardSettings] = useState(false);
  const [boardName, setBoardName] = useState(board.name);
  const [boardDescription, setBoardDescription] = useState(board.description ?? "");
  const [newColumnName, setNewColumnName] = useState("");
  const [newColumnStatus, setNewColumnStatus] = useState<BoardStatus>("queued");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const itemById = useMemo(
    () =>
      new Map(
        columns.flatMap((column) => column.items.map((item) => [item.id, item] as const))
      ),
    [columns]
  );

  function drop(targetColumnId: string) {
    if (!dragItemId) return;
    const item = itemById.get(dragItemId);
    setDragItemId(null);
    if (!item || item.columnId === targetColumnId) return;

    const previous = columns;
    setColumns((current) =>
      current.map((column) => ({
        ...column,
        items:
          column.id === targetColumnId
            ? [...column.items, { ...item, columnId: targetColumnId }]
            : column.items.filter((candidate) => candidate.id !== item.id),
      }))
    );
    setError(null);
    startTransition(async () => {
      const result = await moveBoardItem(board.id, item.id, targetColumnId);
      if (result.error) {
        setColumns(previous);
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function addTask(columnId: string) {
    const title = (quickTitles[columnId] ?? "").trim();
    if (!title) return;
    setError(null);
    startTransition(async () => {
      const result = await createBoardTask(board.id, columnId, {
        title,
        ownerPersonId: board.currentPersonId,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setQuickTitles((current) => ({ ...current, [columnId]: "" }));
      router.refresh();
    });
  }

  function saveColumn(columnId: string) {
    setError(null);
    startTransition(async () => {
      const result = await renameBoardColumn(board.id, columnId, columnName);
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditingColumnId(null);
      router.refresh();
    });
  }

  function removeColumn(columnId: string) {
    if (!window.confirm("Delete this empty column?")) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteBoardColumn(board.id, columnId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function addColumn() {
    setError(null);
    startTransition(async () => {
      const result = await createBoardColumn(board.id, {
        name: newColumnName,
        status: newColumnStatus,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setNewColumnName("");
      setNewColumnStatus("queued");
      router.refresh();
    });
  }

  function saveBoard() {
    setError(null);
    startTransition(async () => {
      const result = await updateBoard(board.id, {
        name: boardName,
        description: boardDescription,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setShowBoardSettings(false);
      router.refresh();
    });
  }

  function archive() {
    if (!window.confirm("Archive this board? Its tasks will remain available.")) return;
    setError(null);
    startTransition(async () => {
      const result = await archiveBoard(board.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push("/board");
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-3 py-2 shadow-sm">
        <div className="flex items-center gap-2 text-sm">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: board.color }} />
          <span className="font-medium">{board.companyName}</span>
          <span className="text-muted-foreground">· {columns.reduce((sum, column) => sum + column.items.length, 0)} cards</span>
          {pending && <span className="text-muted-foreground">Saving…</span>}
        </div>
        {board.canManageStructure && (
          <Button variant="outline" size="sm" onClick={() => setShowBoardSettings((value) => !value)}>
            <MoreHorizontal className="size-4" />
            Board settings
          </Button>
        )}
      </div>

      {showBoardSettings && board.canManageStructure && (
        <Card className="p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-[1fr_1.5fr_auto] md:items-end">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-board-name">Board name</Label>
              <Input id="edit-board-name" value={boardName} onChange={(event) => setBoardName(event.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-board-description">Purpose</Label>
              <Input
                id="edit-board-description"
                value={boardDescription}
                onChange={(event) => setBoardDescription(event.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={saveBoard} disabled={pending || !boardName.trim()}>
                Save
              </Button>
              <Button variant="destructive" onClick={archive} disabled={pending}>
                <Archive className="size-4" />
                Archive
              </Button>
            </div>
          </div>
        </Card>
      )}

      {error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="-mx-2 flex min-h-[60vh] snap-x gap-4 overflow-x-auto px-2 pb-5">
        {columns.map((column) => {
          const atLimit = column.wipLimit != null && column.items.length >= column.wipLimit;
          return (
            <section
              key={column.id}
              className="flex w-[min(84vw,19rem)] shrink-0 snap-start flex-col rounded-2xl bg-muted/55 p-3 sm:w-76"
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => drop(column.id)}
            >
              <div className="mb-3 flex items-start justify-between gap-2 px-1">
                <div className="min-w-0 flex-1">
                  {editingColumnId === column.id ? (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        saveColumn(column.id);
                      }}
                      className="flex gap-1"
                    >
                      <Input
                        value={columnName}
                        onChange={(event) => setColumnName(event.target.value)}
                        autoFocus
                        className="h-7"
                      />
                      <Button type="submit" size="sm" disabled={pending || !columnName.trim()}>
                        Save
                      </Button>
                    </form>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="size-2 rounded-full" style={{ backgroundColor: column.color }} />
                        <h2 className="truncate text-sm font-semibold">{column.name}</h2>
                      </div>
                      <p className="mt-0.5 text-xs capitalize text-muted-foreground">
                        {column.canonicalStatus.replaceAll("_", " ")}
                      </p>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Badge variant={atLimit ? "destructive" : "outline"}>{column.items.length}</Badge>
                  {board.canManageStructure && editingColumnId !== column.id && (
                    <>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label={`Rename ${column.name}`}
                        onClick={() => {
                          setEditingColumnId(column.id);
                          setColumnName(column.name);
                        }}
                      >
                        <Pencil className="size-3" />
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label={`Delete ${column.name}`}
                        onClick={() => removeColumn(column.id)}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-1 flex-col gap-2">
                {column.items.map((item) => (
                  <Card
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    draggable
                    onDragStart={() => setDragItemId(item.id)}
                    onClick={() => setSelectedItem(item)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") setSelectedItem(item);
                    }}
                    className={`cursor-grab gap-2 border-l-[3px] p-3 py-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing ${
                      dragItemId === item.id ? "opacity-40" : ""
                    }`}
                    style={{ borderLeftColor: column.color }}
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                      <span className="text-sm font-medium leading-snug">{item.title}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 pl-5">
                      <Badge variant="outline" className="capitalize">{item.priority}</Badge>
                      {item.approvalRequired && <Badge variant="destructive">approval</Badge>}
                      {item.ownerName && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <UserRound className="size-3" />
                          {item.ownerName}
                        </span>
                      )}
                      {deadlineLabel(item.deadline) && (
                        <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                          <CalendarClock className="size-3" />
                          {deadlineLabel(item.deadline)}
                        </span>
                      )}
                    </div>
                  </Card>
                ))}

                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    addTask(column.id);
                  }}
                  className="mt-1 flex gap-1"
                >
                  <Input
                    value={quickTitles[column.id] ?? ""}
                    onChange={(event) =>
                      setQuickTitles((current) => ({ ...current, [column.id]: event.target.value }))
                    }
                    placeholder="Add a task…"
                    aria-label={`Add task to ${column.name}`}
                    className="bg-card"
                  />
                  <Button
                    type="submit"
                    size="icon"
                    variant="ghost"
                    disabled={pending || !(quickTitles[column.id] ?? "").trim()}
                    aria-label="Add task"
                  >
                    <Plus className="size-4" />
                  </Button>
                </form>
              </div>
            </section>
          );
        })}

        {board.canManageStructure && (
          <section className="flex w-[min(84vw,19rem)] shrink-0 snap-start flex-col gap-3 rounded-2xl border border-dashed bg-card/50 p-4 sm:w-76">
            <div>
              <h2 className="text-sm font-semibold">Add workflow column</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Columns can match your real sales, engineering, or field process.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-column-name">Column name</Label>
              <Input
                id="new-column-name"
                value={newColumnName}
                onChange={(event) => setNewColumnName(event.target.value)}
                placeholder="Client review"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-column-status">Task status</Label>
              <select
                id="new-column-status"
                value={newColumnStatus}
                onChange={(event) => setNewColumnStatus(event.target.value as BoardStatus)}
                className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
              >
                {COLUMN_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <Button onClick={addColumn} disabled={pending || !newColumnName.trim()}>
              <Plus className="size-4" />
              Add column
            </Button>
          </section>
        )}
      </div>

      <Sheet open={Boolean(selectedItem)} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <SheetContent className="w-full sm:max-w-lg">
          {selectedItem && (
            <TaskEditor
              key={selectedItem.id}
              board={board}
              item={selectedItem}
              onClose={() => setSelectedItem(null)}
              onError={setError}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
