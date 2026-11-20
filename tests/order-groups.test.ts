import {test} from 'node:test';
import assert from 'node:assert/strict';
import {groupOrders} from '../shared/order-groups.js';
import {singleFlight} from '../shared/refresh-task.js';
const order=(id:string,extra:any={})=>({id,client_id:'client',client_name:'Cliente',address:'Calle 10 #20-30',city:'Bucaramanga',status:'confirmed',total:500,window_start:'2026-11-20T12:00:00Z',window_end:'2026-11-20T15:00:00Z',items:[{name:'Piña (kg)',quantity:.1}],...extra});
test('Agrupa cliente/dirección sin mezclar otros clientes ni direcciones; conserva pedidos y cantidades',()=>{
 const orders=[order('a'),order('b',{address:'Calle 10 # 20-30',items:[{name:'Piña (kg)',quantity:.2}],status:'rejected'}),order('c',{client_id:'other'}),order('d',{address:'Calle 11 #20-30'})];
 const groups=groupOrders(orders);assert.equal(groups.length,3);assert.deepEqual(groups[0].members.map(o=>o.id),['a','b']);assert.equal(groups[0].summary.items[0].quantity,.3);assert.equal(groups[0].summary.total,1000);assert.equal(orders[0].items[0].quantity,.1);assert.equal(orders[1].status,'rejected');
});
test('Planta agrupa por identificador opaco, manteniendo direcciones privadas fuera del resultado',()=>{
 const groups=groupOrders([order('a',{address:undefined,delivery_group:'opaque-1'}),order('b',{address:undefined,delivery_group:'opaque-1'}),order('c',{address:undefined,delivery_group:'opaque-2'})]);assert.equal(groups.length,2);assert.equal(groups[0].members.length,2);assert.equal(groups[0].summary.address,undefined);
});
test('Recargar comparte llamadas simultáneas y permite reintentar tras un fallo',async()=>{
 let count=0,release:any;const reload=singleFlight(async()=>{count++;await new Promise<void>(r=>release=r);return count;});const a=reload(),b=reload();await Promise.resolve();assert.equal(count,1);release();assert.deepEqual(await Promise.all([a,b]),[1,1]);const c=reload();await Promise.resolve();assert.equal(count,2);release();assert.equal(await c,2);
 let fail=true;const retry=singleFlight(async()=>{if(fail)throw Error('sin red');return 'ok';});await assert.rejects(retry());fail=false;assert.equal(await retry(),'ok');
});
