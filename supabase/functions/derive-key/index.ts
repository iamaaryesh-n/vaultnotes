import "@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export const config = {
  verify_jwt: false,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { userId } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "userId required" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const APP_SECRET = Deno.env.get("APP_SECRET");

    if (!APP_SECRET) {
      return new Response(
        JSON.stringify({ error: "Server secret missing" }),
        { status: 500, headers: corsHeaders }
      );
    }

    const encoder = new TextEncoder();
    const data = encoder.encode(APP_SECRET + userId);

    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));

    const derivedKey = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return new Response(
      JSON.stringify({ derivedKey }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Invalid request" }),
      { status: 400, headers: corsHeaders }
    );
  }
});