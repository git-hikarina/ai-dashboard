"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  onIdTokenChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { createClient } from "@/lib/supabase/client";
import type { DbUser } from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuthContextType {
  user: User | null;
  userData: DbUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Persist the Firebase ID token as a cookie so the proxy can read it. */
async function setSessionCookie(user: User | null) {
  if (user) {
    const token = await user.getIdToken();
    document.cookie = `__session=${token}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
  } else {
    // Clear the cookie
    document.cookie = "__session=; path=/; max-age=0";
  }
}

/** Upsert the Firebase user into the Supabase `users` table and return the row. */
async function syncUserToSupabase(user: User): Promise<DbUser | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("users")
    .upsert(
      {
        firebase_uid: user.uid,
        email: user.email!,
        display_name: user.displayName || user.email!.split("@")[0],
      },
      { onConflict: "firebase_uid" }
    )
    .select()
    .single();

  if (error) {
    console.error("[AuthContext] Failed to sync user to Supabase:", error);
    return null;
  }
  return data as DbUser;
}

/** Load the user row from Supabase by Firebase UID. */
async function loadUserData(firebaseUid: string): Promise<DbUser | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("firebase_uid", firebaseUid)
    .single();

  if (error) {
    console.error("[AuthContext] Failed to load user data:", error);
    return null;
  }
  return data as DbUser;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<DbUser | null>(null);
  const [loading, setLoading] = useState(true);

  // -- Auth state listener ---------------------------------------------------

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        await setSessionCookie(firebaseUser);
        const synced = await syncUserToSupabase(firebaseUser);
        setUserData(synced);
      } else {
        await setSessionCookie(null);
        setUserData(null);
      }

      setLoading(false);
    });

    return () => unsubAuth();
  }, []);

  // -- Token refresh listener (keep cookie in sync) -------------------------

  useEffect(() => {
    const unsubToken = onIdTokenChanged(auth, async (firebaseUser) => {
      await setSessionCookie(firebaseUser);
    });

    return () => unsubToken();
  }, []);

  // -- Login / Logout -------------------------------------------------------

  const login = useCallback(async (email: string, password: string) => {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const firebaseUser = credential.user;
    await setSessionCookie(firebaseUser);
    const synced = await syncUserToSupabase(firebaseUser);
    setUser(firebaseUser);
    setUserData(synced);
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
    await setSessionCookie(null);
    setUser(null);
    setUserData(null);
  }, []);

  // -- Render ---------------------------------------------------------------

  return (
    <AuthContext value={{ user, userData, loading, login, logout }}>
      {children}
    </AuthContext>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
