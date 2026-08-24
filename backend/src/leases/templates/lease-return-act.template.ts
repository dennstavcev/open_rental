// Акт возврата зеркален Приложению №1, но фиксирует состояние вещей и
// согласованный денежный результат. Персональные данные здесь не нужны.
export const LEASE_RETURN_ACT_TEMPLATE = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<title>Акт возврата имущества</title>
<style>
  body { font-family: "Times New Roman", serif; font-size: 11pt; line-height: 1.35; color: #000; max-width: 1000px; margin: 24px auto; }
  h1 { font-size: 15pt; text-align: center; margin-bottom: 4px; }
  h2 { font-size: 12pt; text-align: center; font-weight: normal; margin-top: 0; }
  table.items { width: 100%; border-collapse: collapse; margin: 16px 0; }
  table.items th, table.items td { border: 1px solid #000; padding: 5px; text-align: left; vertical-align: top; }
  table.items th { background: #f0f0f0; }
  table.parties { width: 100%; border-collapse: collapse; margin: 12px 0; }
  table.parties td { border: none; padding-top: 28px; vertical-align: top; width: 50%; }
  table.totals { margin: 16px 0 16px auto; border-collapse: collapse; min-width: 380px; }
  table.totals td { border: 1px solid #000; padding: 6px 10px; }
  table.totals td:last-child { text-align: right; white-space: nowrap; }
  p { margin: 6px 0; }
  .muted { color: #444; }
  .status { border: 1px solid #555; padding: 8px; margin: 14px 0; font-weight: bold; }
</style>
</head>
<body>
<h1>Акт возврата имущества</h1>
<h2>к Договору аренды помещения для проживания</h2>

<table class="parties" style="margin-bottom:0">
  <tr>
    <td style="padding-top:0"><b>г. {{city}}</b></td>
    <td style="padding-top:0; text-align:right">{{generatedDate}}</td>
  </tr>
</table>

<p>Стороны зафиксировали состояние имущества, переданного вместе с
Помещением по адресу: {{propertyAddress}}.</p>

{{#if items.length}}
<table class="items">
  <tr>
    <th>№</th>
    <th>Тип / предмет</th>
    <th>Бренд</th>
    <th>Модель</th>
    <th>Кол-во</th>
    <th>Состояние</th>
    <th>Примечание</th>
    <th>Сумма ущерба</th>
  </tr>
  {{#each items}}
  <tr>
    <td>{{this.position}}</td>
    <td>{{this.type}}</td>
    <td>{{this.brand}}</td>
    <td>{{this.model}}</td>
    <td>{{this.quantity}}</td>
    <td>{{this.returnStatus}}</td>
    <td>{{this.returnNote}}</td>
    <td>{{this.damageAmount}}</td>
  </tr>
  {{/each}}
</table>
{{else}}
<p class="muted">Опись пуста — имущество, переданное вместе с Помещением,
Сторонами не фиксировалось.</p>
{{/if}}

<table class="totals">
  <tr><td><b>Итого ущерб</b></td><td>{{totalDamage}} ₽</td></tr>
  <tr><td><b>Депозит к возврату</b></td><td>{{depositReturn}} ₽</td></tr>
  {{#if hasUncovered}}
  <tr><td><b>Задолженность сверх депозита</b></td><td>{{uncovered}} ₽</td></tr>
  {{/if}}
</table>

<p class="status">{{statusText}}</p>

<p>Настоящий Акт составлен в двух экземплярах, имеющих равную юридическую
силу, по одному для каждой из Сторон.</p>

<table class="parties">
  <tr>
    <td><b>Арендодатель:</b><br/><br/>Подпись: _____________________________</td>
    <td><b>Арендатор:</b><br/><br/>Подпись: _____________________________</td>
  </tr>
</table>

<p class="muted" style="font-size:9pt">Сформировано сервисом SoftRent {{generatedDate}}.</p>
</body>
</html>`;
