import { createClient } from "npm:@supabase/supabase-js@2"
import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
}

type PushRequest = {
  recipientId: string
  actorId?: string | null
  title: string
  body: string
  route?: string | null
  data?: Record<string, string>
}

function toUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i += 1) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}

async function importServicePrivateKey(privateKeyRaw: string): Promise<CryptoKey> {
  const normalized = privateKeyRaw.replace(/\\n/g, "\n").trim()
  const pem = normalized.includes("BEGIN PRIVATE KEY")
    ? normalized
    : `-----BEGIN PRIVATE KEY-----\n${normalized}\n-----END PRIVATE KEY-----`

  const b64 = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\n/g, "")
    .trim()

  const keyBytes = toUint8Array(b64)

  return crypto.subtle.importKey(
    "pkcs8",
    keyBytes.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  )
}

async function getGoogleAccessToken(): Promise<string> {
  // FIREBASE_SERVICE_ACCOUNT JSON se values nikalenge
  const serviceAccountRaw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT")
  if (!serviceAccountRaw) {
    throw new Error("Missing FIREBASE_SERVICE_ACCOUNT secret")
  }

  const serviceAccount = JSON.parse(serviceAccountRaw)
  const clientEmail = serviceAccount.client_email
  const privateKey = serviceAccount.private_key
  const projectId = serviceAccount.project_id

  if (!clientEmail || !privateKey || !projectId) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT JSON is missing required fields")
  }

  const signingKey = await importServicePrivateKey(privateKey)

  const jwt = await create(
    { alg: "RS256", typ: "JWT" },
    {
      iss: clientEmail,
      sub: clientEmail,
      aud: "https://oauth2.googleapis.com/token",
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      iat: getNumericDate(0),
      exp: getNumericDate(3600),
    },
    signingKey
  )

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  })

  const tokenJson = await tokenRes.json()

  if (!tokenRes.ok || !tokenJson?.access_token) {
    throw new Error(`Google OAuth token request failed: ${JSON.stringify(tokenJson)}`)
  }

  return tokenJson.access_token as string
}

function normalizeDataPayload(data: Record<string, string> = {}): Record<string, string> {
  const normalized: Record<string, string> = {}
  Object.entries(data || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return
    normalized[key] = typeof value === "string" ? value : String(value)
  })
  return normalized
}

Deno.serve(async (req) => {
  console.log("send-push invoked")

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get("Authorization")
    const jwt = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null

    if (!jwt) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: jsonHeaders,
      })
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

    // Project ID service account se nikalenge
    const serviceAccount = JSON.parse(Deno.env.get("FIREBASE_SERVICE_ACCOUNT")!)
    const firebaseProjectId = serviceAccount.project_id

    if (!supabaseUrl || !serviceRoleKey || !firebaseProjectId) {
      return new Response(JSON.stringify({ error: "Missing required server secrets" }), {
        status: 500,
        headers: jsonHeaders,
      })
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(jwt)

    if (userError || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: jsonHeaders,
      })
    }

    const payload = (await req.json()) as PushRequest
    const { recipientId, actorId = null, title, body, route = null, data } = payload

    const normalizedData = normalizeDataPayload({
      ...(data || {}),
      ...(route ? { route } : {}),
    })

    if (!recipientId || !title || !body) {
      return new Response(JSON.stringify({ error: "recipientId, title and body are required" }), {
        status: 400,
        headers: jsonHeaders,
      })
    }

    if (actorId && actorId !== userData.user.id) {
      return new Response(JSON.stringify({ error: "actorId does not match authenticated user" }), {
        status: 403,
        headers: jsonHeaders,
      })
    }

    // Recipient ke FCM tokens fetch karo
    const { data: tokensData, error: tokensError } = await supabaseAdmin
      .from("device_tokens")
      .select("token")
      .eq("user_id", recipientId)

    if (tokensError) {
      return new Response(JSON.stringify({ error: "Failed to fetch device tokens", details: tokensError.message }), {
        status: 500,
        headers: jsonHeaders,
      })
    }

    const tokens = [...new Set((tokensData || []).map((row) => row.token).filter(Boolean))]

    console.log("[send-push] Tokens fetched", { recipientId, tokenCount: tokens.length })

    if (tokens.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, skipped: "no_tokens" }), {
        headers: jsonHeaders,
      })
    }

    const accessToken = await getGoogleAccessToken()
    const staleTokens: string[] = []
    let sentCount = 0

    for (const token of tokens) {
      const fcmRes = await fetch(
        `https://fcm.googleapis.com/v1/projects/${firebaseProjectId}/messages:send`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            message: {
              token,
              notification: { title, body },
              data: normalizedData,
            },
          }),
        }
      )

      if (fcmRes.ok) {
        sentCount += 1
        console.log("[send-push] FCM send success", { recipientId, token })
        continue
      }

      const errorJson = await fcmRes.json().catch(() => null)
      const status = errorJson?.error?.status || ""

      if (status === "UNREGISTERED" || status === "INVALID_ARGUMENT") {
        staleTokens.push(token)
      }

      console.error("[send-push] FCM send failed", { token, status, errorJson })
    }

    if (staleTokens.length > 0) {
      await supabaseAdmin.from("device_tokens").delete().in("token", staleTokens)
    }

    return new Response(
      JSON.stringify({ ok: true, sent: sentCount, totalTokens: tokens.length, removedStaleTokens: staleTokens.length }),
      { headers: jsonHeaders }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ error: "send-push failed", details: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: jsonHeaders }
    )
  }
})