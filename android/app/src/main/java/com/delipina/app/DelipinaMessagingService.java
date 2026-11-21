package com.delipina.app;

import android.app.*;
import android.content.*;
import android.graphics.*;
import android.os.Build;
import com.google.firebase.messaging.*;
import androidx.core.app.NotificationCompat;
import java.util.Map;

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
    static String tag(Map<String,String> data){return data.get("id")+":"+data.getOrDefault("status","");}
    static void show(Context context,Map<String,String> data){
        NotificationManager manager=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
        if(Build.VERSION.SDK_INT>=26)manager.createNotificationChannel(new NotificationChannel("orders","Pedidos y entregas",NotificationManager.IMPORTANCE_DEFAULT));
        String id=data.get("id"), target=data.getOrDefault("targetId","");
        Intent intent=new Intent(context,MainActivity.class).putExtra("notice",id).putExtra("revision",data.get("revision")).putExtra("module",data.get("module"));
        if(!target.isEmpty() && ("credits".equals(data.get("module")) || "orders".equals(data.get("module"))))intent.putExtra("credits".equals(data.get("module"))?"credit":"order",target);
        intent.setData(android.net.Uri.parse("delipina://notification/"+id));
        PendingIntent tap=PendingIntent.getActivity(context,0,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        String client=data.getOrDefault("clientName",""), window=data.getOrDefault("deliveryWindow",""), title=data.getOrDefault("title","Delipiña");
        String body=data.getOrDefault("body","Toca para consultar el detalle.");
        var builder=new NotificationCompat.Builder(context,"orders")
            .setSmallIcon(R.drawable.ic_notification).setColor(Color.rgb(22,64,46))
            .setContentTitle(client.isEmpty()?title:client+" · "+title)
            .setContentText(window.isEmpty()?body:window)
            .setSubText(data.getOrDefault("statusLabel","Delipiña"))
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(tap).setAutoCancel(true).setOnlyAlertOnce(true)
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
        manager.notify(tag(data),0,builder.build());
    }
    private static PendingIntent action(Context context,Map<String,String> data,String action){
        Intent intent=new Intent(context,NotificationActionReceiver.class).setAction("com.delipina.app.NOTICE_ACTION");
        for(var entry:data.entrySet())intent.putExtra(entry.getKey(),entry.getValue());
        intent.putExtra("decision",action).setData(android.net.Uri.parse("delipina://notification/"+data.get("id")+"/"+data.get("revision")+"/"+action));
        return PendingIntent.getBroadcast(context,0,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    }
}
