// Абстракция канала доставки уведомлений (docs/ARCHITECTURE.md, компонент
// Notifications). Дев/тест — ConsoleNotificationChannel; прод email/SMS —
// вторая реализация того же интерфейса, вместе с хостингом.
export const NOTIFICATION_CHANNEL = Symbol('NOTIFICATION_CHANNEL');

export interface OutboundNotification {
  to: string;
  subject: string;
  body: string;
}

export interface NotificationChannel {
  send(message: OutboundNotification): Promise<void>;
}
