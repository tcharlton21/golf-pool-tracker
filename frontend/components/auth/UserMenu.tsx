"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "./AuthProvider";
import { LoginModal } from "./LoginModal";

export function UserMenu() {
  const { user, isLoading, logout } = useAuth();
  const [open, setOpen] = useState(false);

  if (isLoading) {
    return <div className="h-7 w-16 rounded bg-muted/40 animate-pulse" />;
  }

  if (!user) {
    return (
      <>
        <Button size="xs" variant="outline" onClick={() => setOpen(true)}>
          Log in
        </Button>
        <LoginModal open={open} onOpenChange={setOpen} />
      </>
    );
  }

  const handle = user.email.split("@")[0];
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{handle}</span>
      <Button size="xs" variant="ghost" onClick={logout}>
        Log out
      </Button>
    </div>
  );
}
