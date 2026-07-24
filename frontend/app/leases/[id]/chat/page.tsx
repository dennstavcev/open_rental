'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { RequireAuth } from '@/components/RequireAuth';
import { TopBar } from '@/components/TopBar';
import { EmptyState, PageHeader } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { listMessages, Message, openAttachment, sendMessage } from '@/lib/chat';

function ChatInner() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [body, setBody] = useState('');
  const [official, setOfficial] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setMessages(await listMessages(id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка загрузки');
    } finally {
      setLoaded(true);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

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
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка отправки');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar />
      <div className="container">
        <PageHeader back={`/leases/${id}`} title="Чат по договору" />
        {error && <div className="error">{error}</div>}

        {loaded && messages.length === 0 ? (
          <EmptyState icon="chat" title="Сообщений пока нет" text="Обсуждайте вопросы по договору — переписка сохраняется для обеих сторон." />
        ) : (
          <div className="chat-thread">
            {messages.map((m) => {
              const mine = m.senderId === user?.id;
              return (
                <div key={m.id} className={`bubble ${mine ? 'mine' : 'theirs'} ${m.isOfficial ? 'official' : ''}`}>
                  {m.body}
                  {m.attachmentStorageKey && (
                    <button className="attach" onClick={() => openAttachment(m.id)}>
                      📎 {m.attachmentName ?? 'файл'}
                    </button>
                  )}
                  <div className="meta">
                    {m.createdAt.slice(11, 16)}
                    {m.isOfficial && ' · официальное'}
                    {m.editedAt && ' · изменено'}
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
        )}

        <form className="composer" onSubmit={onSend}>
          <label className="chip" style={{ cursor: 'pointer', flex: 'none' }} title="Прикрепить файл">
            📎
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,application/pdf" style={{ display: 'none' }} />
          </label>
          <input
            type="text"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Сообщение…"
          />
          <button type="submit" disabled={busy}>→</button>
        </form>
        <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
          <input type="checkbox" checked={official} onChange={(e) => setOfficial(e.target.checked)} style={{ width: 'auto' }} />
          Отметить как официальное сообщение
        </label>
      </div>
    </>
  );
}

export default function ChatPage() {
  return (
    <RequireAuth>
      <ChatInner />
    </RequireAuth>
  );
}
