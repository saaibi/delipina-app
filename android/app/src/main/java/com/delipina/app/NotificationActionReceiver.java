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
        if(!Arrays.asList("confirm","reject","dismiss").contains(action)||id==null||!id.matches("[a-f0-9-]{36}")||(!"dismiss".equals(action)&&(order==null||!order.matches("[a-f0-9-]{36}"))))return;
        PendingResult pending=goAsync();
        new Thread(()->{
            HttpURLConnection connection=null;
            try{
                String session=NativeSession.read(context);if(session==null)throw new IllegalStateException();
                JSONObject body=new JSONObject().put("revision",Integer.parseInt(intent.getStringExtra("revision")));
                if(!"dismiss".equals(action))body.put("action",action).put("notificationId",id);
                String path="dismiss".equals(action)?"/notifications/"+id+"/dismiss":"/orders/"+order+"/action";
                connection=(HttpURLConnection)new URL(DelipinaNativePlugin.ORIGIN+"/api"+path).openConnection();
                connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(8000);connection.setReadTimeout(12000);connection.setRequestMethod("POST");
                connection.setRequestProperty("Origin",DelipinaNativePlugin.ORIGIN);connection.setRequestProperty("Cookie","session="+session);connection.setRequestProperty("Content-Type","application/json");connection.setDoOutput(true);
                try(var output=connection.getOutputStream()){output.write(body.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));}
                int status=connection.getResponseCode();
                if(status<200||status>=300)throw new IllegalStateException(status==409?"changed":"failed");
                NotificationManager manager=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
                Map<String,String> data=new HashMap<>();
                if(intent.getExtras()!=null)for(String key:intent.getExtras().keySet())data.put(key,intent.getStringExtra(key));
                if("dismiss".equals(action))manager.cancel(DelipinaMessagingService.tag(data),0);
                else {
                    String response;
                    try(var reader=new java.io.BufferedReader(new java.io.InputStreamReader(connection.getInputStream(),java.nio.charset.StandardCharsets.UTF_8))){StringBuilder value=new StringBuilder();String line;while((line=reader.readLine())!=null){if(value.length()>16000)throw new java.io.IOException();value.append(line);}response=value.toString();}
                    JSONObject notice=new JSONObject(response).getJSONObject("notification");
                    for(String key:new String[]{"id","title","status","statusLabel","revision"})data.put(key,notice.get(key).toString());
                    data.put("canRespond","false");
                    DelipinaMessagingService.show(context,data);
                }
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
