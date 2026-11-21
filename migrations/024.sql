ALTER TABLE notifications ADD COLUMN dismissed boolean NOT NULL DEFAULT false;
-- Keep historical IDs valid, but show only the latest notice for each order/user.
WITH ranked AS (
 SELECT n.id,row_number() OVER(PARTITION BY n.user_id,n.order_id ORDER BY (n.status=o.status) DESC NULLS LAST,n.updated_at DESC,n.id DESC) position
 FROM notifications n JOIN orders o ON o.id=n.order_id
)
UPDATE notifications n SET dismissed=true,read=true FROM ranked r WHERE n.id=r.id AND r.position>1;
UPDATE notifications SET event_key='legacy-order:' || id::text WHERE order_id IS NOT NULL;
UPDATE notifications n SET event_key='order:' || n.order_id::text,
 title=CASE WHEN o.status='pending' THEN 'Nuevo pedido' ELSE 'Pedido: ' || CASE o.status WHEN 'confirmed' THEN 'Confirmado' WHEN 'preparing' THEN 'En preparación' WHEN 'ready' THEN 'Listo para despacho' WHEN 'enroute' THEN 'En camino' WHEN 'delivered' THEN 'Entregado' WHEN 'rejected' THEN 'Rechazado' WHEN 'cancelled' THEN 'Cancelado' ELSE o.status END END,
 read=CASE WHEN n.status IS DISTINCT FROM o.status THEN false ELSE n.read END,
 status=o.status,revision=n.revision+1
 FROM orders o WHERE n.order_id=o.id AND NOT n.dismissed;
