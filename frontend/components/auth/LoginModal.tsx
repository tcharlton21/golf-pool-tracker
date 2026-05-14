"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "./AuthProvider";
import { ApiError } from "@/lib/api";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function LoginModal({ open, onOpenChange }: Props) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signupCode, setSignupCode] = useState("");
  const [showSignupCode, setShowSignupCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setEmail("");
    setPassword("");
    setSignupCode("");
    setShowSignupCode(false);
    setError(null);
    setSubmitting(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password, showSignupCode ? signupCode : undefined);
      reset();
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setShowSignupCode(true);
        setError("New account — enter the signup code to create it.");
      } else if (err instanceof ApiError && err.status === 401) {
        // 401 only fires when the email matches an existing user — so this is
        // unambiguously a wrong-password case. If the user came in via the
        // signup flow, hide that field and pivot them to the login flow.
        setShowSignupCode(false);
        setSignupCode("");
        setError("This email already has an account — that password didn't match. Try again, or use a different email.");
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log in or create account</DialogTitle>
          <DialogDescription>
            Star your favorite golfers and link to a pool entry.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Password (6+ chars)</span>
            <input
              type="password"
              required
              minLength={6}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          </label>
          {showSignupCode && (
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Signup code</span>
              <input
                type="text"
                required
                value={signupCode}
                onChange={(e) => setSignupCode(e.target.value)}
                className="rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              />
            </label>
          )}
          {error && (
            <p
              className={
                showSignupCode && error?.startsWith("New account")
                  ? "text-xs text-amber-400/90"
                  : "text-xs text-destructive"
              }
            >
              {error}
            </p>
          )}
          <Button type="submit" disabled={submitting} className="mt-1">
            {submitting ? "..." : showSignupCode ? "Create account" : "Continue"}
          </Button>
          {!showSignupCode && (
            <button
              type="button"
              onClick={() => {
                setShowSignupCode(true);
                setError(null);
              }}
              className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline self-center"
            >
              First time? Sign up
            </button>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
