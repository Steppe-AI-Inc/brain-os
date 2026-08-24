import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function normalize(value: string) {
  return String(value || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9\u0400-\u04ff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function localCompanyMatch(document: any, companies: any[]) {
  const haystack = normalize([
    document.title,
    document.original_filename,
    document.summary,
    document.extracted_text,
  ].filter(Boolean).join(" "));
  const ranked = companies.map((company) => {
    const terms = [
      { value: company.name, weight: 7 },
      { value: company.legal_entity_name, weight: 7 },
      ...(Array.isArray(company.aliases)
        ? company.aliases.map((value: string) => ({ value, weight: 10 }))
        : []),
      { value: company.country, weight: 2 },
    ];
    let score = 0;
    const matches: string[] = [];
    for (const term of terms) {
      const candidate = normalize(term.value);
      if (candidate && haystack.includes(candidate)) {
        score += term.weight;
        matches.push(term.value);
      }
    }
    return { company, score, matches };
  }).sort((a, b) => b.score - a.score);
  const top = ranked[0];
  if (!top || top.score < 3 || top.score === ranked[1]?.score) return null;
  return {
    companyId: top.company.id,
    confidence: Math.min(0.94, 0.55 + top.score * 0.04),
    reason: `Matched ${top.matches.slice(0, 3).join(", ")} in stored artifact data.`,
  };
}

function parseModelJson(raw: string) {
  const clean = raw.trim().replace(/^\`\`\`(?:json)?\s*/i, "").replace(/\s*\`\`\`$/, "");
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  return JSON.parse(start >= 0 && end > start ? clean.slice(start, end + 1) : clean);
}

function getOutputText(body: any) {
  if (typeof body?.output_text === "string") return body.output_text;
  return (body?.output || [])
    .flatMap((item: any) => item?.content || [])
    .filter((part: any) => part?.type === "output_text")
    .map((part: any) => part?.text || "")
    .join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "POST only" }, 405);

  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return reply({ error: "Missing bearer token" }, 401);

  try {
    const body = await req.json();
    const documentId = typeof body.documentId === "string" ? body.documentId.trim() : "";
    const externalConsent = body.confirmExternalProcessing === true;
    if (!documentId) return reply({ error: "documentId is required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } }
    );
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return reply({ error: "Invalid session" }, 401);

    const { data: profile } = await supabase
      .from("profiles")
      .select("id,role")
      .eq("auth_user_id", user.id)
      .single();
    if (!profile) return reply({ error: "Profile not found" }, 403);

    const { data: document, error: documentError } = await supabase
      .from("documents")
      .select("id,company_id,title,category,sensitivity,summary,extracted_text,storage_path,mime_type,original_filename,file_size_bytes")
      .eq("id", documentId)
      .maybeSingle();
    if (documentError) return reply({ error: documentError.message }, 400);
    if (!document) return reply({ error: "Artifact not found or access denied" }, 404);

    const { data: companies, error: companyError } = await supabase
      .from("companies")
      .select("id,name,legal_entity_name,country,description,aliases")
      .limit(100);
    if (companyError) return reply({ error: companyError.message }, 400);

    await supabase.from("documents").update({
      analysis_status: "processing",
      analysis_error: null,
    }).eq("id", document.id);

    const match = localCompanyMatch(document, companies || []);
    let analysis: any = {
      artifactType: document.category || "general",
      summary: document.extracted_text
        ? String(document.extracted_text).replace(/\s+/g, " ").slice(0, 1200)
        : document.summary || `Stored artifact: ${document.original_filename || document.title}`,
      keyFacts: [],
      dates: [],
      people: [],
      clients: [],
      financialSignals: [],
      risks: [],
      recommendedActions: [],
      companyId: match?.companyId || document.company_id || null,
      companyConfidence: match?.confidence || (document.company_id ? 1 : 0),
      companyReason: match?.reason || (document.company_id ? "Company selected during upload." : "No reliable company match."),
      externalAiAuthorized: externalConsent,
    };
    let model = "local-deterministic";
    let warning: string | null = null;

    if (externalConsent) {
      await supabase.from("audit_logs").insert({
        actor_profile_id: profile.id,
        actor_role: profile.role,
        event_type: "artifact_external_ai_authorized",
        entity_type: "document",
        entity_id: document.id,
        company_id: document.company_id,
        message: "User explicitly authorized external AI processing for this artifact",
        metadata: { provider: "openai" },
      });

      const openaiKey = Deno.env.get("OPENAI_API_KEY");
      if (!openaiKey) {
        warning = "OPENAI_API_KEY is not configured; local analysis was retained.";
      } else {
        try {
          const parts: any[] = [{
            type: "input_text",
            text: `Analyze this business artifact. Return strict JSON only.
Allowed companies: ${JSON.stringify(companies || [])}
Schema: {"artifactType":string,"summary":string,"keyFacts":[string],"dates":[{"date":string,"meaning":string}],"people":[string],"clients":[string],"financialSignals":[string],"risks":[string],"recommendedActions":[string],"companyId":string|null,"companyConfidence":number,"companyReason":string}
Do not invent facts or take external, employment, payment, legal, publishing or deletion actions.`,
          }];

          if (document.extracted_text) {
            parts.push({
              type: "input_text",
              text: `TITLE: ${document.title}\nCONTENT:\n${String(document.extracted_text).slice(0, 120000)}`,
            });
          } else if (document.storage_path) {
            const { data: signed, error: signError } = await supabase.storage
              .from("company-artifacts")
              .createSignedUrl(document.storage_path, 600);
            if (signError || !signed?.signedUrl) throw new Error(signError?.message || "Could not authorize temporary artifact access");
            if (String(document.mime_type || "").startsWith("image/")) {
              parts.push({ type: "input_image", image_url: signed.signedUrl, detail: "auto" });
            } else {
              parts.push({
                type: "input_file",
                file_url: signed.signedUrl,
                filename: document.original_filename || document.title,
              });
            }
          }

          const modelName = Deno.env.get("OPENAI_ARTIFACT_MODEL") || Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini";
          const aiResponse = await fetch("https://api.openai.com/v1/responses", {
            method: "POST",
            headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: modelName,
              input: [{ role: "user", content: parts }],
              max_output_tokens: 2500,
              temperature: 0.1,
            }),
          });
          if (!aiResponse.ok) throw new Error(`OpenAI returned ${aiResponse.status}: ${(await aiResponse.text()).slice(0, 400)}`);

          const parsed = parseModelJson(getOutputText(await aiResponse.json()));
          const allowedIds = new Set((companies || []).map((company: any) => company.id));
          analysis = {
            ...analysis,
            artifactType: typeof parsed.artifactType === "string" ? parsed.artifactType : analysis.artifactType,
            summary: typeof parsed.summary === "string" ? parsed.summary.slice(0, 4000) : analysis.summary,
            keyFacts: Array.isArray(parsed.keyFacts) ? parsed.keyFacts.filter((v: unknown) => typeof v === "string").slice(0, 30) : [],
            dates: Array.isArray(parsed.dates) ? parsed.dates.slice(0, 20) : [],
            people: Array.isArray(parsed.people) ? parsed.people.filter((v: unknown) => typeof v === "string").slice(0, 30) : [],
            clients: Array.isArray(parsed.clients) ? parsed.clients.filter((v: unknown) => typeof v === "string").slice(0, 30) : [],
            financialSignals: Array.isArray(parsed.financialSignals) ? parsed.financialSignals.filter((v: unknown) => typeof v === "string").slice(0, 30) : [],
            risks: Array.isArray(parsed.risks) ? parsed.risks.filter((v: unknown) => typeof v === "string").slice(0, 30) : [],
            recommendedActions: Array.isArray(parsed.recommendedActions) ? parsed.recommendedActions.filter((v: unknown) => typeof v === "string").slice(0, 20) : [],
            companyId: typeof parsed.companyId === "string" && allowedIds.has(parsed.companyId) ? parsed.companyId : analysis.companyId,
            companyConfidence: typeof parsed.companyConfidence === "number" ? Math.max(0, Math.min(1, parsed.companyConfidence)) : analysis.companyConfidence,
            companyReason: typeof parsed.companyReason === "string" ? parsed.companyReason.slice(0, 1000) : analysis.companyReason,
            externalAiAuthorized: true,
          };
          model = modelName;
        } catch (error) {
          warning = error instanceof Error ? error.message : String(error);
        }
      }
    }

    const suggestion = analysis.companyId || match?.companyId || null;
    const confidence = Number(analysis.companyConfidence || 0);
    const resolvedCompany = document.company_id || (!document.company_id && suggestion && confidence >= 0.8 ? suggestion : null);
    const binaryNeedsAi = !document.extracted_text && !!document.storage_path;
    const status = warning || (binaryNeedsAi && !externalConsent) || !resolvedCompany || confidence < 0.65
      ? "needs_review"
      : "ready";

    const { error: updateError } = await supabase.from("documents").update({
      company_id: resolvedCompany,
      suggested_company_id: suggestion,
      company_match_confidence: confidence,
      company_match_reason: analysis.companyReason || null,
      company_match_status: resolvedCompany
        ? (document.company_id ? "confirmed" : "automatic")
        : "review_needed",
      analysis_status: status,
      analysis_summary: analysis.summary || null,
      analysis_json: { ...analysis, analyzerModel: model },
      analysis_error: warning || (binaryNeedsAi && !externalConsent ? "Deep binary analysis requires explicit external-AI authorization." : null),
      analyzed_at: new Date().toISOString(),
    }).eq("id", document.id);
    if (updateError) return reply({ error: updateError.message }, 400);

    await supabase.from("audit_logs").insert({
      actor_profile_id: profile.id,
      actor_role: profile.role,
      event_type: "artifact_analyzed",
      entity_type: "document",
      entity_id: document.id,
      company_id: resolvedCompany,
      message: `Artifact analysis completed with status ${status}`,
      metadata: { model, status, suggestion, confidence, externalAiAuthorized: externalConsent },
    });

    return reply({
      documentId: document.id,
      status,
      model,
      summary: analysis.summary,
      suggestedCompanyId: suggestion,
      companyConfidence: confidence,
      warning,
    });
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
