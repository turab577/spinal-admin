import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Mail, MailOpen, Reply, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatDate, gmailComposeUrl, unwrap } from '@/lib/helpers';

const FILTERS = [
  { value: 'read', label: 'Read' },
  { value: 'archived', label: 'Archived' },
  { value: 'all', label: 'All' },
];

const statusStyles = {
  new: 'bg-accent/10 text-accent border-accent/20',
  read: 'bg-muted text-muted-foreground border-border',
  archived: 'bg-muted text-muted-foreground border-border',
};

export default function AdminContact() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState(null);

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['admin-contact', filter],
    queryFn: async () => {
      let query = supabase.from('contact_submissions').select('*').order('created_at', { ascending: false }).limit(200);
      if (filter !== 'all') query = query.eq('status', filter);
      return unwrap(await query);
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin-contact'] });
    qc.invalidateQueries({ queryKey: ['admin-counts'] });
  };

  const setStatus = async (msg, status) => {
    const { error } = await supabase.from('contact_submissions').update({ status }).eq('id', msg.id);
    if (error) alert(error.message);
    refresh();
  };

  const open = (msg) => {
    setExpanded(expanded === msg.id ? null : msg.id);
    if (msg.status === 'new') setStatus(msg, 'read');
  };

  const remove = async (msg) => {
    if (!confirm(`Delete the message from ${msg.name}? This cannot be undone.`)) return;
    const { error } = await supabase.from('contact_submissions').delete().eq('id', msg.id);
    if (error) alert(error.message);
    refresh();
  };

  return (
    <div className="px-5 sm:px-8 py-8 max-w-[1100px]">
      <div className="mb-8">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Inquiries</h1>
        <p className="text-sm text-muted-foreground mt-1">Messages sent through the public contact form.</p>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`rounded-sm border px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === f.value ? 'border-foreground bg-foreground text-background' : 'border-border text-foreground/70 hover:border-foreground/40'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="rounded-sm border border-border bg-white overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>
        ) : messages.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">No messages here.</div>
        ) : (
          <ul className="divide-y divide-border">
            {messages.map((m) => (
              <li key={m.id}>
                <div className="flex items-center gap-4 px-4 sm:px-5 py-3.5">
                  <button onClick={() => open(m)} className="min-w-0 flex-1 text-left">
                    <p className={`truncate ${m.status === 'new' ? 'font-semibold' : 'font-medium'} text-foreground`}>
                      {m.subject || m.message.slice(0, 80)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{m.name} · {m.email} · {formatDate(m.created_at)}</p>
                  </button>
                  <span className={`hidden sm:inline-block shrink-0 rounded-sm border px-2 py-0.5 text-xs font-medium ${statusStyles[m.status]}`}>{m.status}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <a
                      href={gmailComposeUrl({ to: m.email, subject: `Re: ${m.subject || 'Your message'}` })}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Reply by email"
                      className="p-2 rounded-sm hover:bg-muted text-muted-foreground"
                    >
                      <Reply className="h-4 w-4" />
                    </a>
                    {m.status === 'new' ? (
                      <button onClick={() => setStatus(m, 'read')} title="Mark as read" className="p-2 rounded-sm hover:bg-muted text-muted-foreground">
                        <MailOpen className="h-4 w-4" />
                      </button>
                    ) : (
                      <button onClick={() => setStatus(m, 'new')} title="Mark as unread" className="p-2 rounded-sm hover:bg-muted text-muted-foreground">
                        <Mail className="h-4 w-4" />
                      </button>
                    )}
                    {m.status !== 'archived' && (
                      <button onClick={() => setStatus(m, 'archived')} title="Archive" className="p-2 rounded-sm hover:bg-muted text-muted-foreground">
                        <Archive className="h-4 w-4" />
                      </button>
                    )}
                    <button onClick={() => remove(m)} title="Delete" className="p-2 rounded-sm hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {expanded === m.id && (
                  <div className="border-t border-border bg-muted/40 px-4 sm:px-5 py-4 text-sm leading-relaxed whitespace-pre-wrap break-words">
                    {m.message}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
