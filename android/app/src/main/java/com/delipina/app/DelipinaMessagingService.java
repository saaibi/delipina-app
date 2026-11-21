package com.delipina.app;

import android.app.*;
import android.content.*;
import android.graphics.*;
import android.os.Build;
import com.google.firebase.messaging.*;
import androidx.core.app.NotificationCompat;
import java.util.Map;
import java.util.HashMap;
import org.json.*;

public class DelipinaMessagingService extends FirebaseMessagingService {
    @Override public void onMessageReceived(RemoteMessage message) {
        DelipinaNativePlugin.refresh();
        var data=message.getData(); String id=data.get("id"); if(id==null)return;
        int revision;try{revision=Integer.parseInt(data.get("revision"));}catch(Exception invalid){return;}
        var revisions=getSharedPreferences("notice-revisions",MODE_PRIVATE);
        if(revision<=revisions.getInt(id,0))return;
        if(androidx.core.app.NotificationManagerCompat.from(this).areNotificationsEnabled()) {
            show(this,data);
            revisions.edit().putInt(id,revision).apply();
        }
    }
    static String tag(Map<String,String> data){return "orders".equals(data.get("module")) && !data.getOrDefault("targetId","").isEmpty() ? "order:"+data.get("targetId") : data.get("id");}
    static void show(Context context,Map<String,String> data){
        NotificationManager manager=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
        if(Build.VERSION.SDK_INT>=26)manager.createNotificationChannel(new NotificationChannel("orders","Pedidos y entregas",NotificationManager.IMPORTANCE_DEFAULT));
        String id=data.get("id"), target=data.getOrDefault("targetId","");
        Intent intent=new Intent(context,MainActivity.class).putExtra("notice",id).putExtra("revision",data.get("revision")).putExtra("module",data.get("module"));
        if(!target.isEmpty() && ("credits".equals(data.get("module")) || "orders".equals(data.get("module"))))intent.putExtra("credits".equals(data.get("module"))?"credit":"order",target);
        intent.setData(android.net.Uri.parse("delipina://notification/"+id));
        PendingIntent tap=PendingIntent.getActivity(context,0,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        String client=data.getOrDefault("clientName",""), window=data.getOrDefault("deliveryWindow",""), title=data.getOrDefault("title","Delipiña");
        if("orders".equals(data.get("module")) && !title.startsWith("No se")) title="pending".equals(data.get("status"))?"Nuevo pedido":"Pedido";
        String body=data.getOrDefault("body","Toca para consultar el detalle.");
        var builder=new NotificationCompat.Builder(context,"orders")
            .setSmallIcon(R.drawable.ic_notification).setColor(Color.rgb(22,64,46))
            .setContentTitle(client.isEmpty()?title:client+" · "+title)
            .setContentText(window.isEmpty()?body:window)
            .setSubText(data.getOrDefault("statusLabel","Delipiña"))
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(tap).setDeleteIntent(action(context,data,"dismiss")).setAutoCancel(true).setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_EVENT).setVisibility(NotificationCompat.VISIBILITY_PRIVATE);
        try {
            var logo=context.getDrawable(R.mipmap.ic_launcher);
            Bitmap bitmap=Bitmap.createBitmap(128,128,Bitmap.Config.ARGB_8888);
            logo.setBounds(0,0,128,128);logo.draw(new Canvas(bitmap));builder.setLargeIcon(bitmap);
        }catch(Exception ignored){}
        if("true".equals(data.get("canRespond")) && "pending".equals(data.get("status"))) {
            builder.addAction(android.R.drawable.checkbox_on_background,"Aceptar",action(context,data,"confirm"));
            builder.addAction(android.R.drawable.ic_menu_close_clear_cancel,"Rechazar",action(context,data,"reject"));
        }
        android.os.Bundle metadata=new android.os.Bundle();metadata.putString("delipina.data",new JSONObject(data).toString());builder.addExtras(metadata);
        builder.setSilent("true".equals(data.get("silent")));
        manager.cancel(id,0);
        for(String state:new String[]{"pending","confirmed","preparing","ready","enroute","delivered","rejected","cancelled"})manager.cancel(id+":"+state,0);
        manager.notify(tag(data),0,builder.build());
    }
    static void syncInbox(Context context,JSONArray rows){
        if(Build.VERSION.SDK_INT<23)return;
        NotificationManager manager=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
        for(var active:manager.getActiveNotifications()){
            try{
                String stored=active.getNotification().extras.getString("delipina.data");
                JSONObject data=stored==null?null:new JSONObject(stored),row=null;
                String id=data==null?active.getTag():data.optString("id");
                if(id==null)continue;
                if(data==null && id.matches("[a-f0-9-]{36}:.*"))id=id.substring(0,36);
                for(int i=0;i<rows.length();i++)if(id.equals(rows.getJSONObject(i).optString("id"))){row=rows.getJSONObject(i);break;}
                if(row==null){manager.cancel(active.getTag(),active.getId());continue;}
                if(data==null) {
                    // Retire notices from older APKs; current pushes use one stable order tag.
                    if(active.getTag().contains(":"))manager.cancel(active.getTag(),active.getId());
                    continue;
                }
                if(data.optInt("revision")==row.optInt("revision"))continue;
                Map<String,String> updated=new HashMap<>();
                for(var keys=data.keys();keys.hasNext();){String key=keys.next();updated.put(key,data.optString(key));}
                for(String key:new String[]{"id","title","status","revision"})updated.put(key,row.optString(key));
                updated.put("silent","true");
                updated.put("canRespond",String.valueOf("true".equals(data.optString("canRespond"))&&"pending".equals(row.optString("current_status"))));
                updated.put("statusLabel",statusLabel(row.optString("status")));
                show(context,updated);
            }catch(Exception ignored){}
        }
    }
    static String statusLabel(String value){
        switch(value){case "pending":return "Por confirmar";case "confirmed":return "Confirmado";case "preparing":return "En preparación";case "ready":return "Listo para despacho";case "enroute":return "En camino";case "delivered":return "Entregado";case "rejected":return "Rechazado";case "cancelled":return "Cancelado";default:return value;}
    }
    private static PendingIntent action(Context context,Map<String,String> data,String action){
        Intent intent=new Intent(context,NotificationActionReceiver.class).setAction("com.delipina.app.NOTICE_ACTION");
        for(var entry:data.entrySet())intent.putExtra(entry.getKey(),entry.getValue());
        intent.putExtra("decision",action).setData(android.net.Uri.parse("delipina://notification/"+data.get("id")+"/"+data.get("revision")+"/"+action));
        return PendingIntent.getBroadcast(context,0,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    }
}
