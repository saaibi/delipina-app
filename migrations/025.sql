-- Identify existing pending repetitions without changing orders or their schedules.
UPDATE notifications n SET title='Pedido por frecuencia',revision=n.revision+1
WHERE n.order_id IS NOT NULL AND n.status='pending' AND n.title<>'Pedido por frecuencia'
AND EXISTS(SELECT 1 FROM schedule_runs r WHERE r.order_id=n.order_id AND r.status='created');
