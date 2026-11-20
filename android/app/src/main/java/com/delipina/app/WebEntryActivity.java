package com.delipina.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.os.Bundle;
import android.os.Build;
import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.widget.TextView;
import androidx.browser.customtabs.CustomTabsIntent;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;
import org.json.JSONObject;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.SecureRandom;

/** Browser-owned Google session, linked to native FCM only after explicit confirmation. */
public class WebEntryActivity extends Activity {
    private static final String ORIGIN = "https://delipina-app-z9br.onrender.com";
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        TextView loading = new TextView(this);
        loading.setText("Abriendo Delipiña…");loading.setGravity(android.view.Gravity.CENTER);setContentView(loading);
        if (getIntent().hasExtra("notice")) { open(notificationUrl()); return; }
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
        } else register();
    }
    @Override public void onRequestPermissionsResult(int requestCode,String[] permissions,int[] results){
        super.onRequestPermissionsResult(requestCode,permissions,results);
        if(requestCode==1) {if(results.length>0 && results[0]==PackageManager.PERMISSION_GRANTED)register();else open(Uri.parse(ORIGIN));}
    }
    private void register(){
        if(FirebaseApp.getApps(this).isEmpty()){open(Uri.parse(ORIGIN));return;}
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task->{
            if(!task.isSuccessful()){open(Uri.parse(ORIGIN));return;}
            final String token=task.getResult();
            new Thread(()->{
                try{
                    var prefs=getSharedPreferences("push",MODE_PRIVATE);
                    String key=prefs.getString("deviceKey",null);
                    if(key==null){byte[] bytes=new byte[32];new SecureRandom().nextBytes(bytes);StringBuilder hex=new StringBuilder();for(byte b:bytes)hex.append(String.format("%02x",b&255));key=hex.toString();prefs.edit().putString("deviceKey",key).apply();}
                    JSONObject body=new JSONObject().put("token",token).put("deviceKey",key);
                    HttpURLConnection c=(HttpURLConnection)new URL(ORIGIN+"/api/native-push/pair").openConnection();
                    c.setConnectTimeout(10000);c.setReadTimeout(10000);c.setRequestMethod("POST");c.setRequestProperty("Content-Type","application/json");c.setDoOutput(true);
                    try(var out=c.getOutputStream()){out.write(body.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));}
                    JSONObject reply;
                    try(var in=c.getInputStream()){java.io.ByteArrayOutputStream buffer=new java.io.ByteArrayOutputStream();byte[] chunk=new byte[4096];int length;while((length=in.read(chunk))!=-1)buffer.write(chunk,0,length);reply=new JSONObject(buffer.toString("UTF-8"));}finally{c.disconnect();}
                    final String code=reply.getString("code"),verification=reply.getString("verification");
                    runOnUiThread(()->new AlertDialog.Builder(this).setTitle("Avisos en este teléfono: "+verification).setMessage("Al abrir Delipiña confirma este mismo código para vincular los avisos a tu cuenta.").setPositiveButton("Continuar",(d,w)->open(Uri.parse(ORIGIN).buildUpon().appendQueryParameter("pushPair",code).build())).setNegativeButton("Ahora no",(d,w)->open(Uri.parse(ORIGIN))).setOnCancelListener(d->open(Uri.parse(ORIGIN))).show());
                }catch(Exception error){runOnUiThread(()->open(Uri.parse(ORIGIN)));}
            }).start();
        });
    }
    private Uri notificationUrl(){
        Uri.Builder url=Uri.parse(ORIGIN).buildUpon();
        for(String name:new String[]{"notice","revision","module","order","credit"}){String value=getIntent().getStringExtra(name);if(value!=null)url.appendQueryParameter(name,value);}
        return url.build();
    }
    private void open(Uri url){
        if(isFinishing())return;
        try {new CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(this,url);finish();}
        catch(ActivityNotFoundException unavailable){try{startActivity(new Intent(Intent.ACTION_VIEW,url));finish();}catch(ActivityNotFoundException noBrowser){TextView message=new TextView(this);message.setText("Instala un navegador para abrir Delipiña.");message.setGravity(android.view.Gravity.CENTER);setContentView(message);}}
    }
}
