import { test } from "node:test";
import assert from "node:assert/strict";
import { notificationPayload } from "../server/notification-payload.js";
test("Push incluye cliente y horario colombiano; acciones solo para pendientes autorizados",()=>{
 const row={id:"notice",order_id:"order",target_id:"order",title:"Nuevo pedido",status:"pending",current_status:"pending",revision:2,client_name:"Cliente prueba",window_start:"2026-11-21T12:00:00Z",window_end:"2026-11-21T20:00:00Z",can_respond:true};
 const data=notificationPayload(row);
 assert.equal(data.canRespond,"true");assert.equal(data.clientName,"Cliente prueba");assert.match(data.deliveryWindow,/07:00/);assert.match(data.deliveryWindow,/03:00/);assert.match(data.body,/Cliente prueba/);
 assert.equal(notificationPayload({...row,can_respond:false}).canRespond,"false");
 assert.equal(notificationPayload({...row,current_status:"confirmed"}).canRespond,"false");
 assert.equal(notificationPayload({...row,order_id:null}).canRespond,"false");
 assert.ok(Object.values(data).every(v=>typeof v==="string"));
});
