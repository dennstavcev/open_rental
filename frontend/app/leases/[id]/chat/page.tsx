'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertTriangle, ArrowUp, MessageSquare, Paperclip, Stamp } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { EmptyState } from '@/components/EmptyState';
import { LeaseTabs } from '@/components/LeaseTabs';
import { PageHeader } from '@/components/PageHeader';
import { RequireAuth } from '@/components/RequireAuth';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { listMessages, Message, openAttachment, sendMessage } from '@/lib/chat';
import { getLease, Lease } from '@/lib/leases';
import { usePolling } from '@/lib/usePolling';

function ChatInner() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [lease, setLease] = useState<Lease | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [body, setBody] = useState('');
  const [official, setOfficial] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attachment, setAttachment] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const archived = lease?.status === 'terminated';

  const load = useCallback(async () => {
    setError(null);
    try {
      const [nextLease, nextMessages] = await Promise.all([
        getLease(id),
        listMessages(id),
      ]);
      setLease(nextLease);
      setMessages(nextMessages);
      setLoaded(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка загрузки');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);
  usePolling(load, 15000);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function onSend(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await sendMessage(id, body, official, fileRef.current?.files?.[0]);
      setBody('');
      setOfficial(false);
      if (fileRef.current) fileRef.current.value = '';
      setAttachment(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка отправки');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <PageHeader back={`/leases/${id}`} backLabel="Договор" title="Чат" />
      <LeaseTabs id={id} archived={archived} />

      {error && (
        <p
          role="alert"
          className="mb-4 flex items-center gap-2 rounded-md border border-danger-line bg-danger-weak px-4 py-3 text-sm text-danger"
        >
          <AlertTriangle aria-hidden className="size-4 shrink-0" />
          {error}
        </p>
      )}

      <div className="mx-auto flex max-w-3xl flex-col">
        {loaded && messages.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="Сообщений пока нет"
            text="Обсуждайте вопросы по договору — переписка сохраняется для обеих сторон."
          />
        ) : (
          <div className="flex flex-col gap-3 py-2">
            {messages.map((m) => {
              const mine = m.senderId === user?.id;
              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}
                >
                  {/* Своё сообщение отличается от чужого контрастом
                      поверхности, а не акцентным цветом: фиолетовый в
                      системе означает действие, а не автора. */}
                  <div
                    className={`max-w-[85%] rounded-lg px-4 py-3 sm:max-w-[70%] ${
                      mine
                        ? 'rounded-br-sm bg-ink-950 text-cream-50'
                        : 'rounded-bl-sm border border-line bg-surface text-content'
                    }`}
                  >
                    {m.isOfficial && (
                      <span
                        className={`mb-2 inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-semibold ${
                          mine ? 'bg-cream-50/15 text-cream-50' : 'bg-surface-icon text-content-secondary'
                        }`}
                      >
                        <Stamp aria-hidden className="size-3.5" />
                        Официальное
                      </span>
                    )}
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    {m.attachmentStorageKey && (
                      <button
                        type="button"
                        onClick={() => openAttachment(m.id)}
                        className={`mt-2 flex items-center gap-2 rounded-pill px-3 py-1.5 text-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                          mine ? 'bg-cream-50/15' : 'bg-surface-icon'
                        }`}
                      >
                        <Paperclip aria-hidden className="size-4" />
                        {m.attachmentName ?? 'файл'}
                      </button>
                    )}
                  </div>
                  <p className="mt-1 px-1 text-xs text-content-muted">
                    {m.createdAt.slice(11, 16)}
                    {m.isOfficial && ' · официальное'}
                    {m.editedAt && ' · изменено'}
                  </p>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
        )}

        {!lease ? (
          <p className="mt-4 text-content-muted">Загрузка…</p>
        ) : (
        <form onSubmit={onSend} className="sticky bottom-0 mt-4 bg-surface-sticky pb-2 pt-3 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <label
              className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-pill border border-line text-content-secondary transition-colors duration-fast hover:bg-surface-hover focus-within:ring-2 focus-within:ring-focus"
              title="Прикрепить файл"
            >
              <Paperclip aria-hidden className="size-5" />
              <span className="sr-only">Прикрепить файл</span>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                className="sr-only"
                onChange={(e) => setAttachment(e.target.files?.[0]?.name ?? null)}
              />
            </label>

            <Input
              type="text"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Сообщение…"
              aria-label="Сообщение"
            />

            <Button type="submit" size="icon" disabled={busy} aria-label="Отправить">
              <ArrowUp aria-hidden />
            </Button>
          </div>

          {attachment && (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-content-muted">
              <Paperclip aria-hidden className="size-4" />
              {attachment}
            </p>
          )}

          <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-content-muted">
            <Checkbox
              checked={official}
              onCheckedChange={(checked) => setOfficial(checked === true)}
            />
            Отметить как официальное сообщение
          </label>
        </form>
        )}
      </div>
    </AppShell>
  );
}

export default function ChatPage() {
  return (
    <RequireAuth>
      <ChatInner />
    </RequireAuth>
  );
}
