import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

export default function UserNotRegisteredError() {
  const { user, signOut } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5">
      <div className="w-full max-w-md rounded-sm border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h1 className="font-heading text-2xl font-semibold">Access restricted</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {user?.email ? <><span className="font-medium text-foreground">{user.email}</span> is</> : 'This account is'} not an administrator.
          Ask an existing admin to grant access.
        </p>
        <button onClick={signOut} className="mt-6 rounded-sm border border-border px-4 py-2 text-sm font-semibold hover:border-foreground transition-colors">
          Sign out
        </button>
      </div>
    </div>
  );
}
