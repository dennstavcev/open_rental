'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { getPrivacyPolicy, PrivacyPolicy } from '@/lib/legal';
import { formatDateRu } from '@/lib/party-info';

export default function PrivacyPolicyPage() {
  const [policy, setPolicy] = useState<PrivacyPolicy | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPrivacyPolicy()
      .then(setPolicy)
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : 'Ошибка загрузки политики'),
      );
  }, []);

  return (
    <main className="container">
      <PageHeader back="/" title="Политика обработки персональных данных" />
      {error && <div className="error">{error}</div>}
      {!policy && !error ? (
        <p className="muted">Загрузка…</p>
      ) : policy ? (
        <>
          <p className="muted">
            Редакция {policy.version} от {formatDateRu(policy.updatedAt)}
          </p>
          <div
            className="legal"
            dangerouslySetInnerHTML={{ __html: policy.html }}
          />
        </>
      ) : null}
    </main>
  );
}
