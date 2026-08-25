import Image from 'next/image';
import { cn } from './ui/cn';

/**
 * Фирменный знак. Два начертания из `softrent_brand_assets`:
 *
 * - `mark` — только знак (дом с бесконечностью) рядом с типографической
 *   словомаркой. Используется в оболочке приложения: на 28–32px
 *   растровая словомарка из лок-апа читалась бы хуже, чем текст Manrope.
 * - `lockup` — официальный лок-ап целиком (знак, словомарка, слоган).
 *   Для брендовых моментов: экраны входа, мастер, стартовый экран.
 *
 * Знак оставлен в фирменных цветах (коралл → синий) намеренно: логотип
 * живёт по правилам бренда, а не по правилу единственного акцента —
 * оно про элементы интерфейса.
 */
export function Logo({
  variant = 'mark',
  className,
  markSize = 28,
}: {
  variant?: 'mark' | 'lockup';
  className?: string;
  markSize?: number;
}) {
  if (variant === 'lockup') {
    return (
      <Image
        src="/brand/logo-lockup.png"
        alt="SoftRent — аренда проще, жизнь комфортнее"
        width={560}
        height={409}
        priority
        className={cn('h-auto w-44', className)}
      />
    );
  }

  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <Image
        src="/brand/logo-mark.png"
        alt=""
        aria-hidden
        width={128}
        height={113}
        priority
        style={{ width: markSize, height: 'auto' }}
      />
      <span className="text-base font-bold tracking-wide text-content">SoftRent</span>
    </span>
  );
}
