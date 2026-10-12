import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, FilePlus, Newspaper, Inbox, PenLine, Users, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/articles/new', label: 'New article', icon: FilePlus },
  { to: '/news', label: 'News', icon: Newspaper },
  { to: '/authors', label: 'Authors', icon: Users },
  { to: '/contact', label: 'Inquiries', icon: Inbox },
  { to: '/guest-posts', label: 'Write for us', icon: PenLine },
];

export default function AdminLayout() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => { setOpen(false); }, [pathname]);

  // Lock page scroll and close on Escape while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const linkCls = ({ isActive }) =>
    `flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium transition-colors ${
      isActive ? 'bg-white/10 text-white' : 'text-stone-400 hover:bg-white/5 hover:text-white'
    }`;

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-5 py-5">
        <img src="/logo-light.svg" alt="SpinalInfo" width="1012" height="552" className="h-14 w-auto" />
        <p className="mt-1 text-xs uppercase tracking-widest text-stone-500">Admin</p>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={linkCls}>
            <Icon className="h-4 w-4" /> {label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/10 p-4">
        <p className="truncate text-xs text-stone-400">{user?.email}</p>
        <button onClick={signOut} className="mt-2 inline-flex items-center gap-2 text-sm text-stone-300 hover:text-white">
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background lg:flex">
      <aside className="hidden lg:block w-60 shrink-0 bg-[#121A26] lg:sticky lg:top-0 lg:h-screen">{sidebar}</aside>

      <div className="lg:hidden sticky top-0 z-40 flex h-14 items-center justify-between bg-[#121A26] px-4">
        <p className="flex items-center gap-2">
          <img src="/logo-light.svg" alt="SpinalInfo" width="1012" height="552" className="h-10 w-auto" />
          <span className="text-xs uppercase tracking-widest text-stone-400">Admin</span>
        </p>
        <button onClick={() => setOpen(true)} className="p-2 text-white" aria-label="Open menu" aria-expanded={open}>
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Mobile drawer slides in from the right; kept mounted so it can animate out. */}
      <div className={`lg:hidden fixed inset-0 z-50 transition-[visibility] duration-300 ${open ? 'visible' : 'invisible'}`} aria-hidden={!open}>
        <div
          onClick={() => setOpen(false)}
          className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ease-out ${open ? 'opacity-100' : 'opacity-0'}`}
        />
        <div
          className={`absolute inset-y-0 right-0 w-[80%] max-w-xs bg-[#121A26] shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${open ? 'translate-x-0' : 'translate-x-full'}`}
        >
          <button onClick={() => setOpen(false)} className="absolute right-3 top-4 p-2 text-stone-300 hover:text-white" aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
          {sidebar}
        </div>
      </div>

      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
