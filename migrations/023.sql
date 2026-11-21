-- Preserve existing notices while adopting one notice per order and state.
UPDATE notifications SET event_key=event_key || ':' || status WHERE order_id IS NOT NULL AND status IS NOT NULL AND event_key='order:' || order_id::text;
