'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { RequireAuth } from '@/components/RequireAuth';
import { TopBar } from '@/components/TopBar';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { listMessages, Message, openAttachment, sendMessage } from '@/lib/chat';

function ChatInner() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState('');
  const [official, setOfficial] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setMessages(await listMessages(id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка загрузки');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

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
        <h1>Чат по договору</h1>
        {error && <div className="error">{error}</div>}

        {messages.length === 0 ? (
          <p className="muted">Сообщений пока нет.</p>
        ) : (
          messages.map((m) => (
            <div
              className="card"
              key={m.id}
              style={{
                borderColor: m.isOfficial ? 'var(--accent)' : undefined,
              }}
            >
              <div className="muted">
                {m.senderId === user?.id ? 'Вы' : 'Собеседник'} ·{' '}
                {m.createdAt.slice(0, 16).replace('T', ' ')}
                {m.isOfficial && ' · официальное'}
                {m.editedAt && ' · изменено'}
              </div>
              <div>{m.body}</div>
              {m.attachmentStorageKey && (
                <button
                  className="secondary"
                  style={{ marginTop: 6 }}
                  onClick={() => openAttachment(m.id)}
                >
                  Вложение: {m.attachmentName ?? 'файл'}
                </button>
              )}
            </div>
          ))
        )}

        <form className="card" onSubmit={onSend}>
          <div className="field">
            <label>Сообщение</label>
            <input value={body} onChange={(e) => setBody(e.target.value)} required />
          </div>
          <label className="muted" style={{ display: 'block', marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={official}
              onChange={(e) => setOfficial(e.target.checked)}
            />{' '}
            официальное сообщение
          </label>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,application/pdf" />
          <div style={{ marginTop: 8 }}>
            <button type="submit" disabled={busy}>
              {busy ? 'Отправка…' : 'Отправить'}
            </button>
          </div>
        </form>
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
