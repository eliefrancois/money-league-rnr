// Edge function: eligibility-fail-cleanup
//
// Deletes the caller's auth.users row when they fail Checkpoint 1 (signup
// eligibility) so a "burned" email is freed up for retries. The auth row
// cascades to public.profiles via FK.
//
// Why an Edge Function:
//   - We need service_role to call auth.admin.deleteUser. The anon key can't.
//   - We must validate the JWT first so a user can only delete *their own*
//     account, not another user's.
//
// Request:
//   POST /functions/v1/eligibility-fail-cleanup
//   Authorization: Bearer <user JWT>
//   Body: { reason: 'underage' | 'restricted_state' }
//
// Response:
//   200 { success: true, deleted_user_id: string }
//   4xx { error: string }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Reason = "underage" | "restricted_state";

interface RequestBody {
  reason: Reason;
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonError(405, "Method not allowed");
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonError(401, "Missing or invalid Authorization header");
  }
  const jwt = authHeader.slice("Bearer ".length);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonError(500, "Edge function not configured (missing env vars)");
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: userData, error: userError } = await adminClient.auth.getUser(
    jwt,
  );
  if (userError || !userData.user) {
    return jsonError(401, `Invalid auth token: ${userError?.message ?? "unknown"}`);
  }
  const userId = userData.user.id;

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonError(400, "Body must be valid JSON");
  }
  if (body.reason !== "underage" && body.reason !== "restricted_state") {
    return jsonError(400, "reason must be 'underage' or 'restricted_state'");
  }

  // The actual delete. Cascades to public.profiles via the
  // `references auth.users(id) on delete cascade` FK in
  // 20260501000001_init_auth_profiles.sql.
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(
    userId,
  );
  if (deleteError) {
    return jsonError(500, `Failed to delete user: ${deleteError.message}`);
  }

  return new Response(
    JSON.stringify({ success: true, deleted_user_id: userId }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
