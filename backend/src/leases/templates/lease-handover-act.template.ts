// Приложение №1 к договору аренды — акт приёма-передачи имущества
// (ADR-0018). Опись техники/мебели, передаваемой вместе с помещением;
// сознательно не содержит персональных данных сторон (ФИО/паспорт/адрес/
// телефон), только описание вещей — прочерки для подписи, как в основном
// тексте договора (ADR-0017). Рендерится в HTML (print-ready), тем же
// механизмом, что и LEASE_CONTRACT_TEMPLATE.
export const LEASE_HANDOVER_ACT_TEMPLATE = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<title>Акт приёма-передачи имущества</title>
<style>
  body { font-family: "Times New Roman", serif; font-size: 12pt; line-height: 1.4; color: #000; max-width: 800px; margin: 24px auto; }
  h1 { font-size: 14pt; text-align: center; }
  h2 { font-size: 12pt; text-align: center; font-weight: normal; margin-top: 0; }
  table.items { width: 100%; border-collapse: collapse; margin: 16px 0; }
  table.items th, table.items td { border: 1px solid #000; padding: 6px; text-align: left; }
  table.items th { background: #f0f0f0; }
  .parties { width: 100%; border-collapse: collapse; margin: 12px 0; }
  .parties td { border: none; padding-top: 32px; vertical-align: top; width: 50%; }
  p { margin: 6px 0; }
  .muted { color: #444; }
</style>
</head>
<body>
<h1>Приложение №1</h1>
<h2>к Договору аренды помещения для проживания<br/>Акт приёма-передачи имущества</h2>

<table class="parties" style="margin-bottom:0">
  <tr>
    <td style="padding-top:0"><b>г. {{city}}</b></td>
    <td style="padding-top:0; text-align:right">_____________ 202_ г.</td>
  </tr>
</table>

<p>Арендодатель передаёт, а Арендатор принимает во временное пользование
вместе с Помещением по адресу: {{propertyAddress}} — указанное ниже
имущество. Состояние имущества на момент передачи Стороны признают
исправным и пригодным к использованию, если иное не отмечено отдельно.</p>

{{#if items.length}}
<table class="items">
  <tr>
    <th>№</th>
    <th>Тип техники / предмета</th>
    <th>Бренд</th>
    <th>Модель</th>
    <th>Кол-во</th>
  </tr>
  {{#each items}}
  <tr>
    <td>{{this.position}}</td>
    <td>{{this.type}}</td>
    <td>{{this.brand}}</td>
    <td>{{this.model}}</td>
    <td>{{this.quantity}}</td>
  </tr>
  {{/each}}
</table>
{{else}}
<p class="muted">Опись пуста — имущество, передаваемое вместе с Помещением,
Сторонами не зафиксировано.</p>
{{/if}}

<p>Настоящий Акт составлен в двух экземплярах, имеющих равную юридическую
силу, по одному для каждой из Сторон, и является неотъемлемой частью
Договора аренды помещения для проживания.</p>

<table class="parties">
  <tr>
    <td><b>Арендодатель:</b><br/><br/>Подпись: _____________________________</td>
    <td><b>Арендатор:</b><br/><br/>Подпись: _____________________________</td>
  </tr>
</table>

<p class="muted" style="font-size:9pt">Сформировано сервисом SoftRent {{generatedDate}}.</p>
</body>
</html>`;
