"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type ListFilterOption = { value: string; label: string };

export function useListView<T>({ items, searchText, filterValue }: {
  items: readonly T[];
  searchText: (item: T) => string;
  filterValue?: (item: T) => string;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleItems = items.filter((item) => {
    const matchesQuery =
      !normalizedQuery || searchText(item).toLocaleLowerCase().includes(normalizedQuery);
    const matchesFilter = filter === "all" || filterValue?.(item) === filter;
    return matchesQuery && matchesFilter;
  });
  return {
    items: visibleItems,
    query,
    setQuery,
    filter,
    setFilter,
    clear: () => { setQuery(""); setFilter("all"); },
  };
}

export function ListControls({ query, onQueryChange, searchPlaceholder, filter, onFilterChange,
  filterLabel = "items", filterOptions = [], resultCount, totalCount, onClear }: {
  query: string;
  onQueryChange: (value: string) => void;
  searchPlaceholder: string;
  filter: string;
  onFilterChange: (value: string) => void;
  filterLabel?: string;
  filterOptions?: ListFilterOption[];
  resultCount: number;
  totalCount: number;
  onClear: () => void;
}) {
  const hasFilters = Boolean(query.trim()) || filter !== "all";
  const selectedLabel = filter === "all"
    ? `All ${filterLabel}`
    : filterOptions.find((option) => option.value === filter)?.label ?? filter;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-card/65 p-2.5 backdrop-blur sm:flex-row sm:items-center">
      <div className="relative min-w-0 flex-1">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" value={query} onChange={(event) => onQueryChange(event.target.value)}
          placeholder={searchPlaceholder} aria-label={searchPlaceholder} className="pl-9" />
      </div>
      {filterOptions.length > 0 ? (
        <Select value={filter} onValueChange={(value: unknown) => {
          if (typeof value === "string") onFilterChange(value);
        }}>
          <SelectTrigger className="w-full sm:w-48" aria-label={`Filter by ${filterLabel}`}>
            <SelectValue>{() => selectedLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{`All ${filterLabel}`}</SelectItem>
            {filterOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <span className="whitespace-nowrap px-1 text-xs tabular-nums text-muted-foreground" aria-live="polite">
          {resultCount === totalCount ? `${totalCount} total` : `${resultCount} of ${totalCount}`}
        </span>
        {hasFilters ? (
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            <X aria-hidden="true" className="size-3.5" /> Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}
