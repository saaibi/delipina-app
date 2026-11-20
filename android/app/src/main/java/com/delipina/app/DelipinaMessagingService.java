package com.delipina.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import androidx.core.app.NotificationCompat;

public class DelipinaMessagingService extends FirebaseMessagingService {
    @Override public void onMessageReceived(RemoteMessage message){
        var data=message.getData();String id=data.get("id");if(id==null)return;
        int revision;try{revision=Integer.parseInt(data.get("revision"));}catch(Exception invalid){return;}
        var revisions=getSharedPreferences("notice-revisions",MODE_PRIVATE);if(revision<=revisions.getInt(id,0))return;
        NotificationManager manager=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
        if(Build.VERSION.SDK_INT>=26)manager.createNotificationChannel(new NotificationChannel("orders","Pedidos y entregas",NotificationManager.IMPORTANCE_DEFAULT));
        Intent intent=new Intent(this,WebEntryActivity.class).putExtra("notice",id).putExtra("revision",data.get("revision")).putExtra("module",data.get("module"));
        String target=data.get("targetId");if(target!=null&&!target.isEmpty() && ("credits".equals(data.get("module")) || "orders".equals(data.get("module"))))intent.putExtra("credits".equals(data.get("module"))?"credit":"order",target);
        intent.setData(android.net.Uri.parse("delipina://notification/"+id));
        PendingIntent tap=PendingIntent.getActivity(this,0,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        var notification=new NotificationCompat.Builder(this,"orders").setSmallIcon(R.drawable.ic_notification).setContentTitle("Delipiña").setContentText(data.get("title")).setStyle(new NotificationCompat.BigTextStyle().bigText(data.get("title"))).setContentIntent(tap).setAutoCancel(true).setOnlyAlertOnce(true).build();
        if(androidx.core.app.NotificationManagerCompat.from(this).areNotificationsEnabled()){manager.notify(id,0,notification);revisions.edit().putInt(id,revision).apply();}
    }
}
