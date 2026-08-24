import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ARTIFACT_BUCKET = "company-artifacts";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: document, error } = await supabase
    .from("documents")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();

  if (error || !document?.storage_path) {
    return NextResponse.json({ error: "Artifact not found or access denied." }, { status: 404 });
  }

  const { data: signed, error: signedError } = await supabase.storage
    .from(ARTIFACT_BUCKET)
    .createSignedUrl(document.storage_path, 60, { download: true });

  if (signedError || !signed?.signedUrl) {
    return NextResponse.json({ error: "Could not create a secure download link." }, { status: 403 });
  }

  return NextResponse.redirect(new URL(signed.signedUrl, request.url));
}
