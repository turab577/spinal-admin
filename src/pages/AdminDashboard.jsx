import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FilePlus, Pencil, Eye, Trash2, Inbox } from 'lucide-react';

import { supabase } from '@/lib/supabase';
import ConfirmDialog from '@/components/ConfirmDialog';
import { formatDate, unwrap, PUBLIC_SITE_URL } from '@/lib/helpers';

async function countArticles(status) {
  let query = supabase.from('articles').select('id', { count: 'exact', head: true });
  if (status) query = query.eq('status', status);
  const { count, error } = await query;
  if (error) throw error;
  return count;
}

const statusStyles = {
  live: 'bg-accent/10 text-accent border-accent/20',
  scheduled: 'bg-amber-50 text-amber-700 border-amber-200',
  draft: 'bg-muted text-muted-foreground border-border',
};

// Published articles with a future date are scheduled: not visible on the site until then.
function articleState(a) {
  if (a.status !== 'published' || !a.published_date) return 'draft';
  return new Date(a.published_date) > new Date() ? 'scheduled' : 'live';
}

export default function AdminDashboard() {
  const qc = useQueryClient();

  const { data: counts } = useQuery({
    queryKey: ['admin-counts'],
    queryFn: async () => {
      const [total, published, drafts, inquiriesRes, guestPostsRes] = await Promise.all([
        countArticles(),
        countArticles('published'),
        countArticles('draft'),
        supabase.from('contact_submissions').select('id', { count: 'exact', head: true }).eq('status', 'new'),
        supabase.from('guest_post_submissions').select('id', { count: 'exact', head: true }).eq('status', 'new'),
      ]);
      if (inquiriesRes.error) throw inquiriesRes.error;
      if (guestPostsRes.error) throw guestPostsRes.error;
      return { total, published, drafts, inquiries: inquiriesRes.count, guestPosts: guestPostsRes.count };
    },
  });

  const { data: articles = [], isLoading } = useQuery({
    queryKey: ['admin-articles'],
    queryFn: async () =>
      unwrap(
        await supabase
          .from('articles')
          .select('id, title, slug, category, status, published_date, scheduled_at')
          .order('created_at', { ascending: false })
          .limit(50),
      ),
  });

  const updateArticle = async (id, changes) => {
    const { error } = await supabase.from('articles').update(changes).eq('id', id);
    if (error) alert(error.message);
  };

  // Live → Unpublish (back to draft). Scheduled → Cancel schedule (back to draft, time cleared).
  // Draft → Publish now.
  const togglePublish = async (article) => {
    const state = articleState(article);
    if (state === 'live') {
      await updateArticle(article.id, { status: 'draft' });
    } else if (state === 'scheduled') {
      await updateArticle(article.id, { status: 'draft', published_date: null });
    } else {
      await updateArticle(article.id, { status: 'published', published_date: new Date().toISOString() });
    }
    qc.invalidateQueries({ queryKey: ['admin-articles'] });
    qc.invalidateQueries({ queryKey: ['admin-counts'] });
  };
  // Article awaiting delete confirmation (null when the dialog is closed).
  const [pendingDelete, setPendingDelete] = useState(null);
  const remove = async (article) => {
    const { error } = await supabase.from('articles').delete().eq('id', article.id);
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ['admin-articles'] });
    qc.invalidateQueries({ queryKey: ['admin-counts'] });
  };

  const stats = [
    { label: 'Total articles', value: counts?.total ?? '—' },
    { label: 'Published', value: counts?.published ?? '—' },
    { label: 'Drafts', value: counts?.drafts ?? '—' },
    { label: 'New inquiries', value: counts?.inquiries ?? '—', to: '/contact' },
    { label: 'New proposals', value: counts?.guestPosts ?? '—', to: '/guest-posts' },
  ];

  return (
    <div className="px-5 sm:px-8 py-8 max-w-[1100px]">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your articles, inquiries, and Write for Us proposals.</p>
        </div>
        <Link to="/articles/new" className="inline-flex items-center gap-2 rounded-sm bg-foreground px-4 py-2.5 text-sm font-semibold text-background hover:bg-accent transition-colors">
          <FilePlus className="h-4 w-4" /> New article
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-10">
        {stats.map((s) => {
          const content = (
            <>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{s.label}</p>
              <p className="mt-2 font-heading text-3xl font-semibold">{s.value}</p>
            </>
          );
          return s.to ? (
            <Link key={s.label} to={s.to} className="rounded-sm border border-border bg-white p-5 transition-colors hover:border-accent">{content}</Link>
          ) : (
            <div key={s.label} className="rounded-sm border border-border bg-white p-5">{content}</div>
          );
        })}
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="font-heading text-xl font-semibold">Articles</h2>
        <Link to="/contact" className="inline-flex items-center gap-2 text-sm font-medium text-accent hover:underline">
          <Inbox className="h-4 w-4" /> Inquiries
        </Link>
      </div>

      <div className="rounded-sm border border-border bg-white overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>
        ) : articles.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-muted-foreground">No articles yet.</p>
            <Link to="/articles/new" className="mt-3 inline-block text-sm font-semibold text-accent">Create your first article</Link>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {articles.map((a) => (
              <li key={a.id} className="flex items-center gap-4 px-4 sm:px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <Link to={`/articles/${a.id}/edit`} className="block truncate font-medium text-foreground hover:text-accent transition-colors">{a.title}</Link>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {a.category ? `${a.category} · ` : ''}{articleState(a) === 'scheduled' ? `Scheduled for ${new Date(a.published_date).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}` : formatDate(a.published_date) || 'Not published'}{articleState(a) === 'live' && a.scheduled_at ? ` · Update scheduled for ${new Date(a.scheduled_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}
                  </p>
                </div>
                <span className={`hidden sm:inline-block shrink-0 rounded-sm border px-2 py-0.5 text-xs font-medium capitalize ${statusStyles[articleState(a)]}`}>{articleState(a)}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => togglePublish(a)}
                    title={{ live: 'Take this article off the site', scheduled: 'Cancel the scheduled publish', draft: 'Publish now' }[articleState(a)]}
                    className="p-2 rounded-sm hover:bg-muted text-muted-foreground"
                  >
                    {{ live: 'Unpublish', scheduled: 'Cancel schedule', draft: 'Publish' }[articleState(a)]}
                  </button>
                  {articleState(a) === 'live' && PUBLIC_SITE_URL && (
                    <a href={`${PUBLIC_SITE_URL}/blogs/${a.slug}`} target="_blank" rel="noopener noreferrer" title="View" className="p-2 rounded-sm hover:bg-muted text-muted-foreground">
                      <Eye className="h-4 w-4" />
                    </a>
                  )}
                  <Link to={`/articles/${a.id}/edit`} title="Edit" className="p-2 rounded-sm hover:bg-muted text-muted-foreground">
                    <Pencil className="h-4 w-4" />
                  </Link>
                  <button onClick={() => setPendingDelete(a)} title="Delete" className="p-2 rounded-sm hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => { if (!open) setPendingDelete(null); }}
        title="Delete this article?"
        description={pendingDelete && <>“{pendingDelete.title}” will be permanently deleted{pendingDelete.status === 'published' ? ' and removed from the live site' : ''}. This cannot be undone.</>}
        confirmLabel="Delete article"
        onConfirm={() => remove(pendingDelete)}
      />
    </div>
  );
}
