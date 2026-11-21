ALTER TABLE notifications ADD COLUMN available_at timestamptz NOT NULL DEFAULT now();
-- Already-generated future repetitions become visible at their scheduled opening.
UPDATE notifications n SET available_at=(o.operation_day + COALESCE(
 cfg.data #>> ARRAY['weeklySchedule',EXTRACT(ISODOW FROM o.operation_day)::int::text,'open'],
 lpad(COALESCE(cfg.data->>'open','6'),2,'0') || ':00'
 )::time) AT TIME ZONE 'America/Bogota',revision=n.revision+1,read=false
FROM orders o,settings cfg WHERE cfg.id=1 AND n.order_id=o.id AND n.status='pending' AND NOT n.dismissed
AND o.operation_day>(now() AT TIME ZONE 'America/Bogota')::date
AND EXISTS(SELECT 1 FROM schedule_runs sr WHERE sr.order_id=o.id AND sr.status='created');
