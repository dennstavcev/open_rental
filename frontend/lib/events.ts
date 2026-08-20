// Мгновенное обновление счётчиков в навигации после действия пользователя.
//
// `TopBar` опрашивает приглашения и уведомления раз в 30 секунд
// (ADR-0016), и этого достаточно для чужих изменений. Но своё собственное
// действие должно отражаться сразу: после «Принять» пункт «Приглашения»
// обязан исчезнуть (ADR-0020), а не висеть до следующего опроса, ведя на
// пустой экран.
export const INVITATIONS_CHANGED = 'softrent:invitations-changed';

export function notifyInvitationsChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(INVITATIONS_CHANGED));
}
