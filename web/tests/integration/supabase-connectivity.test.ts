import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

const url = process.env.TEST_SUPABASE_URL;
const anonKey = process.env.TEST_SUPABASE_ANON_KEY;
const configured = Boolean(url && anonKey);

describe.skipIf(!configured)("isolated Supabase connectivity", () => {
  it("reaches Auth without disclosing company data anonymously", async () => {
    const health = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: anonKey! },
    });
    expect(health.ok).toBe(true);

    const supabase = createClient(url!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase
      .from("companies")
      .select("id")
      .limit(1);

    if (error) {
      expect(error.code).toBe("42501");
      expect(data).toBeNull();
      return;
    }

    expect(data).toEqual([]);
  });
});
