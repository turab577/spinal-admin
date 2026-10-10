import React, { useState } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { AlertTriangle, Loader2 } from 'lucide-react';

/**
 * Themed confirmation modal for destructive actions.
 * `onConfirm` may be async; the dialog shows a spinner and stays open until it finishes,
 * and shows the error message if it throws.
 */
export default function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = 'Delete', onConfirm }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleOpenChange = (next) => {
    if (busy) return;
    if (!next) setError('');
    onOpenChange(next);
  };

  const confirm = async (e) => {
    e.preventDefault(); // keep the dialog open while the action runs
    setBusy(true);
    setError('');
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (err) {
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog.Root open={open} onOpenChange={handleOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-[#0B1018]/50 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <AlertDialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-sm border border-border bg-white p-6 shadow-[0_24px_64px_-24px_rgba(11,16,24,0.45)] focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
        >
          <div className="flex gap-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <AlertDialog.Title className="font-heading text-lg font-semibold leading-snug">{title}</AlertDialog.Title>
              <AlertDialog.Description className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</AlertDialog.Description>
            </div>
          </div>

          {error && <div className="mt-4 rounded-sm border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div>}

          <div className="mt-6 flex justify-end gap-2">
            <AlertDialog.Cancel
              disabled={busy}
              className="rounded-sm border border-border px-4 py-2 text-sm font-semibold transition-colors hover:border-foreground disabled:opacity-50"
            >
              Cancel
            </AlertDialog.Cancel>
            <AlertDialog.Action
              onClick={confirm}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-sm bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {confirmLabel}
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
