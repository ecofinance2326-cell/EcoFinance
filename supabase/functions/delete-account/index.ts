
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req: Request) => {
  // Handle browser CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      { error: "Method not allowed" },
      405,
    );
  }

  const authHeader = req.headers.get("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return jsonResponse(
      { error: "Authorization token is missing" },
      401,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    console.error("Required Supabase environment variables are missing");

    return jsonResponse(
      { error: "Server configuration is incomplete" },
      500,
    );
  }

  // Client used to verify the currently logged-in user
  const userClient = createClient(
    supabaseUrl,
    anonKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    },
  );

  // Admin client used only on the server
  const adminClient = createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  try {
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return jsonResponse(
        { error: "Invalid or expired login session" },
        401,
      );
    }

    // Delete only the authenticated user's account
    const { error: deleteError } =
      await adminClient.auth.admin.deleteUser(user.id);

    if (deleteError) {
      console.error("Account deletion failed:", deleteError.message);

      return jsonResponse(
        { error: deleteError.message },
        500,
      );
    }

    return jsonResponse({ ok: true });
  } catch (error) {
    console.error("Unexpected delete-account error:", error);

    return jsonResponse(
      { error: "Unexpected server error" },
      500,
    );
  }
});
