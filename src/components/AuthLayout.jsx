import React from 'react';

export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-5 py-12">
      <div className="mb-8 flex flex-col items-center">
        <img src="/logo-dark.svg" alt="SpinalInfo" width="1012" height="552" className="h-20 w-auto" />
        <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">Admin</p>
      </div>
      <div className="w-full max-w-sm rounded-sm border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 text-center">
          {Icon && (
            <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-accent/10 text-accent">
              <Icon className="h-5 w-5" />
            </div>
          )}
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {children}
      </div>
      {footer && <p className="mt-6 text-sm text-muted-foreground">{footer}</p>}
    </div>
  );
}
