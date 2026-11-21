package com.delipina.app;

import android.app.NotificationManager;
import android.content.*;
import org.json.JSONObject;
import java.net.*;
import java.util.*;

/** Explicit, app-private intents only. Server enforces ownership, revision and order permissions. */
public class NotificationActionReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context,Intent intent){
        String action=intent.getStringExtra("decision"),id=intent.getStringExtra("id"),order=intent.getStringExtra("targetId");
        if(!Arrays.asList("confirm","reject").contains(action)||id==null||order==null||!id.matches("[a-f0-9-]{36}")||!order.matches("[a-f0-9-]{36}"))return;
        PendingResult pending=goAsync();
        new Thread(()->{
            HttpURLConnection connection=null;
            try{
                String session=NativeSession.read(context);if(session==null)throw new IllegalStateException();
                JSONObject body=new JSONObject().put("action",action).put("notificationId",id).put("revision",Integer.parseInt(intent.getStringExtra("revision")));
                connection=(HttpURLConnection)new URL(DelipinaNativePlugin.ORIGIN+"/api/orders/"+order+"/action").openConnection();
                connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(8000);connection.setReadTimeout(12000);connection.setRequestMethod("POST");
                connection.setRequestProperty("Origin",DelipinaNativePlugin.ORIGIN);connection.setRequestProperty("Cookie","session="+session);connection.setRequestProperty("Content-Type","application/json");connection.setDoOutput(true);
                try(var output=connection.getOutputStream()){output.write(body.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));}
                int status=connection.getResponseCode();
                if(status<200||status>=300)throw new IllegalStateException(status==409?"changed":"failed");
                NotificationManager manager=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
                manager.cancel(id+":pending",0);manager.cancel(id,0);
                DelipinaNativePlugin.refresh();
            }catch(Exception error){
                Map<String,String> data=new HashMap<>();
                if(intent.getExtras()!=null)for(String key:intent.getExtras().keySet())data.put(key,intent.getStringExtra(key));
                data.put("title","No se completó la respuesta");
                data.put("body","Abre el pedido para revisar su estado antes de volver a intentar.");
                data.put("canRespond","false");
                DelipinaMessagingService.show(context,data);
            }finally{if(connection!=null)connection.disconnect();pending.finish();}
        },"delipina-notice-action").start();
    }
}
