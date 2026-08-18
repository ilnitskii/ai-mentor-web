---
schema_version: 1
id: sql.window-functions.intro
topic_id: sql.window-functions
title: Зачем нужны оконные функции
estimated_minutes: 5
check:
  question: "Какая конструкция сохраняет исходную детализацию строк: GROUP BY или OVER?"
  rule:
    mode: normalized
    expected_answers: [OVER, оконная функция, window function]
status: active
---

# Оконные функции

`GROUP BY` объединяет несколько строк в одну строку результата. Оконная функция считает значение по группе, но сохраняет каждую исходную строку.

```sql
SELECT
  sale_id,
  customer_id,
  amount,
  SUM(amount) OVER (PARTITION BY customer_id) AS customer_total
FROM sales;
```

Здесь `PARTITION BY` определяет независимые группы вычисления, но не меняет количество строк.

## Контрольный вопрос

Почему нельзя получить тот же набор колонок обычным `GROUP BY customer_id` без дополнительного соединения?
