import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildZip, type ZipEntry } from "@/lib/zip/simple-zip";

export const maxDuration = 60;

// Batch download: bundles the selected documents into one ZIP, streamed through this
// request's own Supabase session so RLS decides what's actually fetchable — a document
// id the caller can't read (wrong company, above their sensitivity tier) is silently
// skipped rather than leaking its bytes.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { ids?: string[] } | null;
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id) => typeof id === "string") : [];
  if (ids.length === 0) return NextResponse.json({ error: "No documents selected." }, { status: 400 });

  const { data: docs, error } = await supabase
    .from("documents")
    .select("id, title, original_filename, storage_path")
    .in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const entries: ZipEntry[] = [];
  const usedNames = new Set<string>();
  for (const doc of docs ?? []) {
    if (!doc.storage_path) continue;
    const { data: fileBlob } = await supabase.storage.from("documents").download(doc.storage_path);
    if (!fileBlob) continue;
    const bytes = new Uint8Array(await fileBlob.arrayBuffer());
    let name = doc.original_filename || doc.title || doc.id;
    while (usedNames.has(name)) name = `${doc.id.slice(0, 8)}-${name}`;
    usedNames.add(name);
    entries.push({ name, data: bytes });
  }

  if (entries.length === 0) {
    return NextResponse.json({ error: "None of the selected documents have a downloadable file." }, { status: 400 });
  }

  const zipBytes = buildZip(entries);
  return new NextResponse(new Blob([new Uint8Array(zipBytes)]), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="brain-os-documents-${Date.now()}.zip"`,
    },
  });
}
