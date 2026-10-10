import React, { useEffect, useState } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { CalendarClock, Loader2 } from 'lucide-react';

const pad = (n) => String(n).padStart(2, '0');
const toDateInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toTimeInput = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Default suggestion: the existing scheduled time if it's still ahead, otherwise tomorrow at 09:00. */
function initialDate(current) {
  const existing = current ? new Date(current) : null;
  if (existing && existing > new Date()) return existing;
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

/**
 * Asks for the date and time an article should go live.
 * `onSchedule(isoString)` may be async; the dialog stays open with a spinner until it finishes.
 */
export default function ScheduleDialog({ open, onOpenChange, current, onSchedule, description }) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const d = initialDate(current);
    setDate(toDateInput(d));
    setTime(toTimeInput(d));
    setError('');
  }, [open, current]);

  const when = date && time ? new Date(`${date}T${time}`) : null;
  const preview = when && !isNaN(when)
    ? when.toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '';

  const submit = async (e) => {
    e.preventDefault();
    if (!when || isNaN(when)) { setError('Choose a date and time.'); return; }
    if (when <= new Date()) { setError('Choose a time in the future, or use Publish to go live now.'); return; }
    setBusy(true);
    setError('');
    try {
      await onSchedule(when.toISOString());
      onOpenChange(false);
    } catch (err) {
      setError(err?.message || 'Could not schedule the article.');
    } finally {
      setBusy(false);
    }
  };

  const inputCls = 'w-full rounded-sm border border-border bg-white px-3 py-2.5 text-sm focus:outline-none focus:border-accent';

  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-[#0B1018]/50 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-sm border border-border bg-white p-6 shadow-[0_24px_64px_-24px_rgba(11,16,24,0.45)] focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95">
          <form onSubmit={submit}>
            <div className="flex gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                <CalendarClock className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <AlertDialog.Title className="font-heading text-lg font-semibold leading-snug">Schedule this article</AlertDialog.Title>
                <AlertDialog.Description className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {description || 'It is saved now and goes live on the site automatically at the time you choose.'}
                </AlertDialog.Description>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-[1fr_auto] gap-3">
              <div>
                <label htmlFor="schedule-date" className="block text-xs font-medium mb-1.5 text-muted-foreground">Date</label>
                <input id="schedule-date" type="date" required min={toDateInput(new Date())} value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label htmlFor="schedule-time" className="block text-xs font-medium mb-1.5 text-muted-foreground">Time</label>
                <input id="schedule-time" type="time" required value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} />
              </div>
            </div>
            {preview && <p className="mt-3 text-sm text-foreground">Goes live <span className="font-semibold">{preview}</span></p>}

            {error && <div className="mt-4 rounded-sm border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div>}

            <div className="mt-6 flex justify-end gap-2">
              <AlertDialog.Cancel disabled={busy} className="rounded-sm border border-border px-4 py-2 text-sm font-semibold transition-colors hover:border-foreground disabled:opacity-50">
                Cancel
              </AlertDialog.Cancel>
              <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-sm bg-foreground px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-accent disabled:opacity-60">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Schedule
              </button>
            </div>
          </form>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
