import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Reply, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatDate, gmailComposeUrl, unwrap } from '@/lib/helpers';
import { Select } from '@/components/ui/select';

const STATUSES = ['new', 'reviewing', 'accepted', 'declined'];
const FILTERS = [...STATUSES, 'all'];
const STATUS_OPTIONS = STATUSES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }));

const statusStyles = {
  new: 'bg-accent/10 text-accent border-accent/20',
  reviewing: 'bg-amber-50 text-amber-700 border-amber-200',
  accepted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  declined: 'bg-muted text-muted-foreground border-border',
};

export default function AdminGuestPosts() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState('new');
  const [expanded, setExpanded] = useState(null);

  const { data: proposals = [], isLoading } = useQuery({
    queryKey: ['admin-guest-posts', filter],
    queryFn: async () => {
      let query = supabase.from('guest_post_submissions').select('*').order('created_at', { ascending: false }).limit(200);
      if (filter !== 'all') query = query.eq('status', filter);
      return unwrap(await query);
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin-guest-posts'] });
    qc.invalidateQueries({ queryKey: ['admin-counts'] });
  };

  const setStatus = async (proposal, status) => {
    const { error } = await supabase.from('guest_post_submissions').update({ status }).eq('id', proposal.id);
    if (error) alert(error.message);
    refresh();
  };

  const remove = async (proposal) => {
    if (!confirm(`Delete the proposal from ${proposal.name}? This cannot be undone.`)) return;
    const { error } = await supabase.from('guest_post_submissions').delete().eq('id', proposal.id);
    if (error) alert(error.message);
    refresh();
  };

  return (
    <div className="px-5 sm:px-8 py-8 max-w-[1100px]">
      <div className="mb-8">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Write for us</h1>
        <p className="text-sm text-muted-foreground mt-1">Proposals sent through the public Write for Us page. Reach out to the sender to discuss next steps.</p>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => { setFilter(f); setExpanded(null); }}
            className={`rounded-sm border px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
              filter === f ? 'border-foreground bg-foreground text-background' : 'border-border text-foreground/70 hover:border-foreground/40'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="rounded-sm border border-border bg-white overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>
        ) : proposals.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">No proposals here.</div>
        ) : (
          <ul className="divide-y divide-border">
            {proposals.map((p) => (
              <li key={p.id}>
                <div className="flex items-center gap-4 px-4 sm:px-5 py-3.5">
                  <button onClick={() => setExpanded(expanded === p.id ? null : p.id)} className="min-w-0 flex-1 text-left">
                    <p className={`truncate ${p.status === 'new' ? 'font-semibold' : 'font-medium'} text-foreground`}>{p.proposed_title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {p.name}{p.credentials ? ` · ${p.credentials}` : ''} · {formatDate(p.created_at)}
                    </p>
                  </button>
                  <div className="hidden sm:block shrink-0">
                    <Select
                      size="sm"
                      value={p.status}
                      onChange={(value) => setStatus(p, value)}
                      options={STATUS_OPTIONS}
                      triggerClassName={statusStyles[p.status] || statusStyles.declined}
                      aria-label="Status"
                    />
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <a
                      href={gmailComposeUrl({ to: p.email, subject: `Your Write for Us proposal: ${p.proposed_title}` })}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Reply by email"
                      className="p-2 rounded-sm hover:bg-muted text-muted-foreground"
                    >
                      <Reply className="h-4 w-4" />
                    </a>
                    <button onClick={() => remove(p)} title="Delete" className="p-2 rounded-sm hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {expanded === p.id && (
                  <div className="border-t border-border bg-muted/40 px-4 sm:px-5 py-4 text-sm leading-relaxed space-y-3">
                    <p className="whitespace-pre-wrap break-words">{p.pitch}</p>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground">
                      <span>{p.email}</span>
                      {p.website && <a href={p.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">Website <ExternalLink className="h-3 w-3" /></a>}
                      {p.sample_url && <a href={p.sample_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">Writing sample <ExternalLink className="h-3 w-3" /></a>}
                    </div>
                    <div className="sm:hidden">
                      <Select
                        size="sm"
                        value={p.status}
                        onChange={(value) => setStatus(p, value)}
                        options={STATUS_OPTIONS}
                        triggerClassName={statusStyles[p.status] || statusStyles.declined}
                        aria-label="Status"
                      />
                    </div>
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
