"use client";

import { useState } from "react";

type RegisterRequest = { email: string; password: string };
type LoginRequest = { email: string; password: string };

export default function AuthPage() {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const payload: RegisterRequest | LoginRequest = { email: email.trim(), password };
    if (!payload.email || payload.password.length < 6) {
      setError("Enter a valid email and a password (min 6 chars).");
      return;
    }

    setLoading(true);
    try {
      const path = mode === "register" ? "/auth/register" : "/auth/login";
      const resp = await fetch(`${apiBase}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await resp.json().catch(() => null);
      if (!resp.ok) {
        throw new Error(data?.detail ?? data?.message ?? `Request failed: ${resp.status}`);
      }

      if (mode === "register") {
        setMode("login");
        setError("Account created. Please log in.");
        return;
      }

      // Login returns { token }
      const token = data?.token;
      if (!token) throw new Error("Missing token in login response");
      localStorage.setItem("token", token);
      window.location.href = "/dashboard";
    } catch (e: any) {
      setError(e?.message ?? "Auth failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-white p-6">
      <h1 className="text-2xl font-semibold">{mode === "login" ? "Log in" : "Create account"}</h1>
      {error ? <div className="mt-3 rounded bg-red-50 p-3 text-red-700">{error}</div> : null}

      <div className="mt-6 max-w-md space-y-4 rounded border p-4">
        <div className="space-y-1">
          <label className="text-sm text-gray-600">Email</label>
          <input
            className="w-full rounded border p-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-gray-600">Password</label>
          <input
            className="w-full rounded border p-2"
            value={password}
            type="password"
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••"
          />
        </div>

        <button
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-60"
          disabled={loading}
          onClick={submit}
        >
          {loading ? "Please wait..." : mode === "login" ? "Log in" : "Register"}
        </button>

        <div className="text-sm text-gray-600">
          {mode === "login" ? "New here?" : "Already have an account?"}{" "}
          <button className="underline" onClick={() => setMode(mode === "login" ? "register" : "login")}>
            {mode === "login" ? "Create one" : "Log in"}
          </button>
        </div>
      </div>
    </main>
  );
}

