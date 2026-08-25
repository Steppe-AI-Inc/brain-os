"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RowActionsMenu } from "@/components/row-actions-menu";
import { EditSheet } from "@/components/edit-sheet";
import { updateProductLine, deleteProductLine, type ProductLineInput } from "@/lib/data/products";

type ProductRow = {
  id: string;
  name: string;
  currency: string | null;
  unit_price: number | null;
  unit_cost: number | null;
  active: boolean | null;
  company_id: string | null;
  companies: { name: string } | null;
};

export function ProductsTable({
  products,
  companies,
}: {
  products: ProductRow[];
  companies: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [values, setValues] = useState<ProductLineInput>({ name: "", companyId: "", unitPrice: 0, unitCost: 0, active: true });

  function openEdit(p: ProductRow) {
    setValues({
      name: p.name,
      companyId: p.company_id ?? "",
      unitPrice: p.unit_price ?? 0,
      unitCost: p.unit_cost ?? 0,
      active: p.active ?? true,
    });
    setEditing(p);
  }

  return (
    <>
      <Card className="overflow-hidden bg-card/80 backdrop-blur">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Unit price</TableHead>
              <TableHead>Unit cost</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((p) => (
              <TableRow key={p.id} className="group/row">
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>{p.companies?.name ?? "—"}</TableCell>
                <TableCell>
                  {p.currency} {p.unit_price}
                </TableCell>
                <TableCell>{p.unit_cost != null ? `${p.currency} ${p.unit_cost}` : "—"}</TableCell>
                <TableCell>
                  <Badge variant={p.active ? "default" : "secondary"}>{p.active ? "active" : "inactive"}</Badge>
                </TableCell>
                <TableCell>
                  <RowActionsMenu
                    itemLabel="product line"
                    className="opacity-70 hover:opacity-100 group-hover/row:opacity-100"
                    onEdit={() => openEdit(p)}
                    onDelete={() => deleteProductLine(p.id)}
                  />
                </TableCell>
              </TableRow>
            ))}
            {products.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No product lines visible yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <EditSheet
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        title="Edit product line"
        saveDisabled={!values.name.trim() || !values.companyId}
        onSave={async () => {
          if (!editing) return null;
          const result = await updateProductLine(editing.id, values);
          if (!result) router.refresh();
          return result;
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-product-name">Name</Label>
          <Input id="edit-product-name" value={values.name} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-product-company">Company</Label>
          <Select value={values.companyId} onValueChange={(v: unknown) => typeof v === "string" && setValues((prev) => ({ ...prev, companyId: v }))}>
            <SelectTrigger id="edit-product-company" className="w-full">
              <SelectValue>{() => companies.find((c) => c.id === values.companyId)?.name}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-product-price">Unit price</Label>
            <Input
              id="edit-product-price"
              type="number"
              value={values.unitPrice}
              onChange={(e) => setValues((v) => ({ ...v, unitPrice: Number(e.target.value) }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-product-cost">Unit cost</Label>
            <Input
              id="edit-product-cost"
              type="number"
              value={values.unitCost}
              onChange={(e) => setValues((v) => ({ ...v, unitCost: Number(e.target.value) }))}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.active}
            onChange={(e) => setValues((v) => ({ ...v, active: e.target.checked }))}
            className="h-4 w-4 rounded border-input"
          />
          Active
        </label>
      </EditSheet>
    </>
  );
}
