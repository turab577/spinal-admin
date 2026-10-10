import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Plus, Trash2, Upload, UserRound, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { unwrap, uploadImage } from '@/lib/helpers';
import ConfirmDialog from '@/components/ConfirmDialog';

const blank = { name: '', role: '', bio: '', avatar_url: '' };

export async function fetchAuthors() {
  return unwrap(await supabase.from('authors').select('*').order('name'));
}

export default function AdminAuthors() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(null); // null | 'new' | author id
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);

  const { data: authors = [], isLoading } = useQuery({ queryKey: ['authors'], queryFn: fetchAuthors });

  const { data: articleCounts = {} } = useQuery({
    queryKey: ['author-article-counts'],
    queryFn: async () => {
      const rows = unwrap(await supabase.from('articles').select('author_id').not('author_id', 'is', null));
      return rows.reduce((acc, r) => ({ ...acc, [r.author_id]: (acc[r.author_id] || 0) + 1 }), {});
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['authors'] });
    qc.invalidateQueries({ queryKey: ['author-article-counts'] });
  };

  const startNew = () => { setForm(blank); setEditing('new'); setError(''); };
  const startEdit = (a) => {
    setForm({ name: a.name, role: a.role, bio: a.bio, avatar_url: a.avatar_url });
    setEditing(a.id);
    setError('');
  };
  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const uploadAvatar = async (file) => {
    setUploading(true);
    try {
      const url = await uploadImage(file, 'authors');
      setForm((f) => ({ ...f, avatar_url: url }));
    } catch (err) {
      console.error(err);
      setError('Photo upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('A name is required.'); return; }
    setSaving(true);
    const payload = { name: form.name.trim(), role: form.role.trim(), bio: form.bio.trim(), avatar_url: form.avatar_url };
    const { error: saveError } = editing === 'new'
      ? await supabase.from('authors').insert(payload)
      : await supabase.from('authors').update(payload).eq('id', editing);
    setSaving(false);
    if (saveError) { setError(saveError.message); return; }
    setEditing(null);
    refresh();
  };

  const remove = async (author) => {
    // Clear the copied name on their articles too, so nothing still shows the deleted author.
    const { error: clearError } = await supabase.from('articles').update({ author: '' }).eq('author_id', author.id);
    if (clearError) throw clearError;
    const { error: deleteError } = await supabase.from('authors').delete().eq('id', author.id);
    if (deleteError) throw deleteError;
    if (editing === author.id) setEditing(null);
    refresh();
  };

  const inputCls = 'w-full rounded-sm border border-border bg-white px-3 py-2.5 text-sm focus:outline-none focus:border-accent';

  return (
    <div className="px-5 sm:px-8 py-8 max-w-[1000px]">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Authors</h1>
          <p className="text-sm text-muted-foreground mt-1">Authors you can select when writing an article. Their bio appears at the end of their articles.</p>
        </div>
        <button onClick={startNew} className="inline-flex items-center gap-2 rounded-sm bg-foreground px-4 py-2.5 text-sm font-semibold text-background hover:bg-accent transition-colors">
          <Plus className="h-4 w-4" /> New author
        </button>
      </div>

      {editing && (
        <form onSubmit={save} className="mb-8 rounded-sm border border-border bg-white p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">{editing === 'new' ? 'New author' : 'Edit author'}</h2>
            <button type="button" onClick={() => setEditing(null)} className="p-1 text-muted-foreground hover:text-foreground" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          {error && <div className="rounded-sm border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>}

          <div className="flex flex-col gap-5 sm:flex-row">
            <div className="shrink-0">
              <p className="block text-xs font-medium mb-1.5 text-muted-foreground">Photo</p>
              <div className="relative h-24 w-24 overflow-hidden rounded-full border border-border bg-muted">
                {form.avatar_url ? (
                  <img src={form.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <UserRound className="absolute inset-0 m-auto h-10 w-10 text-muted-foreground/60" />
                )}
                {uploading && <div className="absolute inset-0 flex items-center justify-center bg-white/70"><Loader2 className="h-5 w-5 animate-spin" /></div>}
              </div>
              <div className="mt-2 flex gap-3 text-xs">
                <label className="inline-flex cursor-pointer items-center gap-1 font-semibold text-accent hover:underline">
                  <Upload className="h-3.5 w-3.5" /> {form.avatar_url ? 'Change' : 'Upload'}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); e.target.value = ''; }} />
                </label>
                {form.avatar_url && (
                  <button type="button" onClick={() => setForm((f) => ({ ...f, avatar_url: '' }))} className="text-muted-foreground hover:text-destructive">Remove</button>
                )}
              </div>
            </div>

            <div className="flex-1 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium mb-1.5 text-muted-foreground">Name</label>
                  <input value={form.name} onChange={update('name')} className={inputCls} placeholder="e.g. Dr Sarah Lee" required />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5 text-muted-foreground">Role / credentials <span className="font-normal">(optional)</span></label>
                  <input value={form.role} onChange={update('role')} className={inputCls} placeholder="e.g. Consultant spine surgeon" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5 text-muted-foreground">Bio</label>
                <textarea value={form.bio} onChange={update('bio')} rows={4} className={`${inputCls} resize-y`} placeholder="A short bio shown at the end of this author's articles." />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(null)} className="rounded-sm border border-border px-4 py-2 text-sm font-semibold hover:border-foreground">Cancel</button>
            <button type="submit" disabled={saving || uploading} className="inline-flex items-center gap-2 rounded-sm bg-foreground px-4 py-2 text-sm font-semibold text-background hover:bg-accent disabled:opacity-60">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save author
            </button>
          </div>
        </form>
      )}

      <div className="rounded-sm border border-border bg-white overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>
        ) : authors.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">No authors yet. Add one to select it when writing articles.</div>
        ) : (
          <ul className="divide-y divide-border">
            {authors.map((a) => (
              <li key={a.id} className="flex items-center gap-4 px-4 sm:px-5 py-3.5">
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted">
                  {a.avatar_url ? (
                    <img src={a.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center font-heading text-sm font-semibold text-muted-foreground">
                      {a.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground truncate">{a.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {[a.role, `${articleCounts[a.id] || 0} article${articleCounts[a.id] === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => startEdit(a)} title="Edit" className="p-2 rounded-sm hover:bg-muted text-muted-foreground"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => setPendingDelete(a)} title="Delete" className="p-2 rounded-sm hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => { if (!open) setPendingDelete(null); }}
        title="Delete this author?"
        description={pendingDelete && (
          articleCounts[pendingDelete.id]
            ? <>“{pendingDelete.name}” will be deleted. Their {articleCounts[pendingDelete.id]} article{articleCounts[pendingDelete.id] === 1 ? '' : 's'} will stay published but show no author.</>
            : <>“{pendingDelete.name}” will be permanently deleted.</>
        )}
        confirmLabel="Delete author"
        onConfirm={() => remove(pendingDelete)}
      />
    </div>
  );
}
