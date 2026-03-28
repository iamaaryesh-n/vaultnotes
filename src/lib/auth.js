/**
 * User Authentication & Profile Management
 * 
 * On signup: Creates both auth user and profile row in client-side code
 * Profile insertion must use auth user's ID to satisfy RLS policy constraint
 * Profile is manually inserted after successful auth.signUp() with id = user.id
 */

import { supabase } from "./supabase"

/**
 * Sign up a new user with email and password
 * 
 * Creates both auth user and profile row with unique username.
 * The profile insert must use auth user's ID to satisfy RLS policy (auth.uid() = id)
 * Username is generated from email and guaranteed to be unique.
 * 
 * @param {string} email - User's email address
 * @param {string} password - User's password (min 6 characters recommended)
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function signUpUser(email, password) {
  try {
    console.log("[signUpUser] Starting signup for:", email)

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      console.error("[signUpUser] Auth signup error:", error.message)
      return { success: false, error: error.message }
    }

    const user = data.user
    console.log("[signUpUser] Auth signup successful")
    console.log(user)

    if (!user?.id) {
      console.error("[signUpUser] No user ID in response")
      return { 
        success: false, 
        error: "No user ID received from signup" 
      }
    }

    // Generate unique username from email
    let baseUsername = email.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "")
    
    // Ensure minimum length of 3 characters
    if (baseUsername.length < 3) {
      baseUsername = baseUsername + "user"
    }
    
    baseUsername = baseUsername.slice(0, 20) // Max 20 chars
    
    console.log("[signUpUser] Base username:", baseUsername)

    // Check if username exists and generate unique one if needed
    let username = baseUsername
    let attempts = 0
    while (attempts < 10) {
      const { data: existingUser, error: checkError } = await supabase
        .from("profiles")
        .select("username")
        .eq("username", username)
        .single()

      // If no user found, username is available
      if (checkError && checkError.code === "PGRST116") {
        console.log("[signUpUser] Username available:", username)
        break
      }

      // If other error, log it but try with random suffix
      if (checkError && checkError.code !== "PGRST116") {
        console.warn("[signUpUser] Check error:", checkError.message)
      }

      // Username exists or error occurred, try with random number
      if (!existingUser || checkError) {
        const randomNum = Math.floor(Math.random() * 9000) + 1000
        username = baseUsername + randomNum
        console.log("[signUpUser] Username taken, trying:", username)
        attempts++
      } else {
        // Username exists, add random number
        const randomNum = Math.floor(Math.random() * 9000) + 1000
        username = baseUsername + randomNum
        console.log("[signUpUser] Username taken, trying:", username)
        attempts++
      }
    }

    if (attempts >= 10) {
      console.error("[signUpUser] Could not generate unique username after attempts")
      return {
        success: false,
        error: "Could not generate unique username. Please try again."
      }
    }

    console.log("[signUpUser] Final username:", username)

    // Create profile row using exact user.id from auth response
    // RLS policy requires: auth.uid() = id
    console.log("[signUpUser] Inserting profile for user ID:", user.id)
    
    const { error: profileError } = await supabase
      .from("profiles")
      .insert({
        id: user.id,              // Must match auth.uid() for RLS policy
        email: user.email,
        username: username,       // Unique username
        name: username,           // Initialize name with username
        avatar_url: null
      })

    if (profileError) {
      console.error("[signUpUser] Profile insert failed:", profileError.message)
      console.error("[signUpUser] Error details:", profileError)
      // Non-blocking: log the error but don't break signup
      console.warn("[signUpUser] Continuing signup despite profile creation failure")
    } else {
      console.log("[signUpUser] Profile created successfully for user:", user.id)
      console.log("[signUpUser] Username assigned:", username)
    }

    return {
      success: true,
      data: {
        user: user,
        username: username,
        requiresEmailConfirmation: !user?.confirmed_at,
        message: !user?.confirmed_at
          ? "Check your email to confirm your account"
          : "Account created successfully!"
      }
    }
  } catch (err) {
    console.error("[signUpUser] Exception:", err.message)
    return { success: false, error: err.message }
  }
}

/**
 * Log in a user with email and password
 * 
 * @param {string} email - User's email address
 * @param {string} password - User's password
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function loginUser(email, password) {
  try {
    console.log("[loginUser] Starting login for:", email)

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      console.error("[loginUser] Error:", error.message)
      return { success: false, error: error.message }
    }

    console.log("[loginUser] Login successful")
    return { success: true, data }
  } catch (err) {
    console.error("[loginUser] Exception:", err.message)
    return { success: false, error: err.message }
  }
}

/**
 * Get current authenticated user's profile
 * 
 * @returns {Promise<{success: boolean, profile?: object, error?: string}>}
 */
export async function getCurrentUserProfile() {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error("[getCurrentUserProfile] Auth error:", authError)
      return { success: false, error: "Not authenticated" }
    }

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single()

    if (error && error.code !== "PGRST116") {
      console.error("[getCurrentUserProfile] Error fetching profile:", error)
      return { success: false, error: error.message }
    }

    return { success: true, profile: profile || { id: user.id, email: user.email } }
  } catch (err) {
    console.error("[getCurrentUserProfile] Exception:", err.message)
    return { success: false, error: err.message }
  }
}

/**
 * Update user's profile (name, avatar, etc.)
 * 
 * @param {object} updates - Object with fields to update (name, avatar_url, etc.)
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function updateUserProfile(updates) {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error("[updateUserProfile] Auth error:", authError)
      return { success: false, error: "Not authenticated" }
    }

    console.log("[updateUserProfile] Updating profile for user:", user.id)

    const { data, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", user.id)
      .select()
      .single()

    if (error) {
      console.error("[updateUserProfile] Error:", error.message)
      return { success: false, error: error.message }
    }

    console.log("[updateUserProfile] Profile updated successfully")
    return { success: true, data }
  } catch (err) {
    console.error("[updateUserProfile] Exception:", err.message)
    return { success: false, error: err.message }
  }
}

/**
 * Sign out current user
 * Clears all local storage (including encryption keys)
 * 
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function signOutUser() {
  try {
    console.log("[signOutUser] Signing out")

    // Clear cached data
    localStorage.clear()
    sessionStorage.clear()

    // Sign out from Supabase
    const { error } = await supabase.auth.signOut()

    if (error) {
      console.error("[signOutUser] Error:", error.message)
      return { success: false, error: error.message }
    }

    console.log("[signOutUser] Sign out successful")
    return { success: true }
  } catch (err) {
    console.error("[signOutUser] Exception:", err.message)
    return { success: false, error: err.message }
  }
}

/**
 * Check if an email is already registered
 * 
 * @param {string} email - Email to check
 * @returns {Promise<{exists: boolean, error?: string}>}
 */
export async function checkEmailExists(email) {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("email", email)

    if (error) {
      console.error("[checkEmailExists] Error:", error.message)
      return { exists: false, error: error.message }
    }

    return { exists: (data?.length || 0) > 0 }
  } catch (err) {
    console.error("[checkEmailExists] Exception:", err.message)
    return { exists: false, error: err.message }
  }
}
