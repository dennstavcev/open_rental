// Копирование в буфер обмена с запасным путём.
//
// `navigator.clipboard` доступен не всегда: его нет на http-страницах вне
// localhost (небезопасный контекст), а writeText отклоняется, если окно не в
// фокусе. Поэтому пробуем современный API, затем execCommand, и только потом
// признаём неудачу — вызывающий код показывает пользователю сообщение вместо
// молча не сработавшей кнопки.
export async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* пробуем запасной путь ниже */
  }

  try {
    const area = document.createElement('textarea');
    area.value = value;
    // Вне видимой области, но доступен для выделения.
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
