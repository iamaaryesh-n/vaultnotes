import { initializeApp, getApp, getApps } from "firebase/app"
import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging"
import { supabase } from "./supabase"

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

const rawVapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || ""
const vapidKey = rawVapidKey.replace(/\s+/g, "")

let foregroundListenerBound = false

function hasFirebaseConfig() {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.messagingSenderId &&
      firebaseConfig.appId &&
      vapidKey
  )
}

function decodeBase64UrlToBytes(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }

  return bytes
}

function isLikelyValidVapidKey(key) {
  if (typeof key !== "string" || key.length < 80 || !/^[A-Za-z0-9_-]+$/.test(key)) {
    return false
  }

  try {
    const decoded = decodeBase64UrlToBytes(key)
    // Uncompressed P-256 public keys used for Web Push are 65 bytes.
    return decoded.length === 65
  } catch (_error) {
    return false
  }
}

function getFirebaseApp() {
  if (!hasFirebaseConfig()) {
    return null
  }

  if (getApps().length > 0) {
    return getApp()
  }

  return initializeApp(firebaseConfig)
}

async function saveDeviceToken(userId, token) {
  const payload = {
    user_id: userId,
    token,
    device_info: JSON.stringify({
      userAgent: navigator.userAgent,
    }),
  }

  const { error } = await supabase
    .from("device_tokens")
    .upsert(payload, { onConflict: "user_id,token" })

  if (error) {
    console.error("[Push] Failed to store device token:", error)
    return
  }

  const { count, error: verifyError } = await supabase
    .from("device_tokens")
    .select("token", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("token", token)

  if (verifyError) {
    console.warn("[Push] Token verification query failed:", verifyError)
    return
  }

  console.log("[Push] Token stored for current user. Matching rows:", count || 0)
}

function bindForegroundMessageListener(messaging) {
  if (foregroundListenerBound) {
    return
  }

  onMessage(messaging, (payload) => {
    console.log("[Push] Foreground message received", payload)

    if (Notification.permission === "granted") {
      new Notification(
        payload.notification?.title || "New notification",
        {
          body: payload.notification?.body || "",
          icon: "/icons/icon-192.png",
          tag: payload.data?.conversationId || payload.data?.conversation_id || "vaultnotes-message",
          renotify: true,
        }
      )
    }

    window.dispatchEvent(new CustomEvent("fcmForegroundMessage", { detail: payload }))
  })

  foregroundListenerBound = true
}

export async function initializeWebPush(userId) {
  try {
    if (!userId || typeof window === "undefined") {
      return
    }

    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      console.warn("[Push] Browser does not support notifications or service workers")
      return
    }

    const supported = await isSupported().catch(() => false)
    if (!supported) {
      console.warn("[Push] Firebase messaging is not supported in this browser context")
      return
    }

    const app = getFirebaseApp()
    if (!app) {
      console.warn("[Push] Firebase configuration missing or invalid")
      return
    }

    if (!isLikelyValidVapidKey(vapidKey)) {
      console.error("[Push] Invalid VAPID public key format. Copy it exactly from Firebase Cloud Messaging Web Push certificates.")
      window.dispatchEvent(new CustomEvent("fcmInitError", { detail: { message: "Invalid VAPID key format" } }))
      return
    }

    let permission = Notification.permission
    if (permission === "default") {
      permission = await Notification.requestPermission()
    }

    if (permission !== "granted") {
      if (permission === "denied") {
        console.warn("[Push] Notification permission denied by user")
        window.dispatchEvent(new CustomEvent("fcmPermissionDenied"))
      }
      return
    }

    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
      scope: "/",
    })

    const messaging = getMessaging(app)
    bindForegroundMessageListener(messaging)

    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    })

    if (!token) {
      console.warn("[Push] FCM token was not generated")
      return
    }

    await saveDeviceToken(userId, token)
  } catch (error) {
    console.error("[Push] Web push initialization failed:", error)
    window.dispatchEvent(new CustomEvent("fcmInitError", { detail: { message: error?.message || "Unknown error" } }))
  }
}
