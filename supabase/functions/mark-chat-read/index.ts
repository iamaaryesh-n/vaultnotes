import { createClient } from "npm:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
}

type MarkReadRequest = {
  conversationId?: string
  conversation_id?: string
  recipientId?: string
  receiver_id?: string
  notificationId?: string
  notification_id?: string
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: jsonHeaders,
    })
  }

  try {
    const payload = (await req.json()) as MarkReadRequest
    const conversationId = payload?.conversationId || payload?.conversation_id
    const recipientId = payload?.recipientId || payload?.receiver_id

    console.log("[mark-chat-read] payload", payload)
    console.log("[mark-chat-read] resolved", { conversationId, recipientId })

    if (!conversationId || !recipientId) {
      return new Response(JSON.stringify({ error: "conversationId and recipientId are required" }), {
        status: 400,
        headers: jsonHeaders,
      })
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Missing server secrets" }), {
        status: 500,
        headers: jsonHeaders,
      })
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)
    const now = new Date().toISOString()

    // Mirrors Chat.jsx markConversationMessagesAsRead DB update.
    const { error, count } = await supabaseAdmin
      .from("messages")
      .update({
        is_read: true,
        seen_at: now,
        delivery_status: "seen",
      })
      .eq("conversation_id", conversationId)
      .eq("receiver_id", recipientId)
      .eq("is_read", false)
      .select("id", { count: "exact" })

    if (error) {
      return new Response(JSON.stringify({ error: "Failed to mark messages as read", details: error.message }), {
        status: 500,
        headers: jsonHeaders,
      })
    }

    return new Response(
      JSON.stringify({ ok: true, markedCount: count || 0, conversationId, recipientId }),
      { headers: jsonHeaders }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "mark-chat-read failed", details: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: jsonHeaders }
    )
  }
})
