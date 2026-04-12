import { supabase } from "./supabase"

function normalizeFcmData(data = {}) {
  const normalized = {}

  Object.entries(data || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return
    }

    normalized[key] = typeof value === "string" ? value : String(value)
  })

  return normalized
}

export async function dispatchPushNotification({ recipientId, actorId = null, title, body, route = null, data = {} }) {
  if (!recipientId || !title || !body) {
    return { success: false, error: "Missing push payload fields" }
  }

  try {
    const payload = {
      recipientId,
      actorId,
      title,
      body,
      route,
      data: normalizeFcmData({
        ...data,
        ...(route ? { route } : {}),
      }),
    }

    const { data: responseData, error } = await supabase.functions.invoke("send-push", {
      body: payload,
    })

    if (error) {
      console.error("[PushDispatch] send-push invoke error:", error)
      return { success: false, error: error.message || "Invoke failed" }
    }

    return { success: true, data: responseData || null }
  } catch (err) {
    console.error("[PushDispatch] send-push exception:", err)
    return { success: false, error: err?.message || "Unknown error" }
  }
}
