package com.delipina.app;

import android.Manifest;
import android.app.NotificationManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.CancellationSignal;
import android.util.Base64;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.core.app.NotificationManagerCompat;
import androidx.credentials.*;
import androidx.credentials.exceptions.GetCredentialException;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import com.google.android.libraries.identity.googleid.*;
import com.google.firebase.messaging.FirebaseMessaging;
import org.json.*;
import java.net.*;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;
import java.lang.ref.WeakReference;

@CapacitorPlugin(name="DelipinaNative",permissions={@Permission(alias="notifications",strings={Manifest.permission.POST_NOTIFICATIONS})})
public class DelipinaNativePlugin extends Plugin {
    static final String ORIGIN="https://delipina-app-z9br.onrender.com";
    private static final String WEB_CLIENT_ID="20419055689-cs1qov50doo5tehee9gsdu2nl63qtmct.apps.googleusercontent.com";
    private static WeakReference<DelipinaNativePlugin> current=new WeakReference<>(null);
    private final ExecutorService network=Executors.newFixedThreadPool(3);
    @Override public void load(){current=new WeakReference<>(this);}
    static void refresh(){DelipinaNativePlugin plugin=current.get();if(plugin!=null)plugin.notifyListeners("refresh",new JSObject());}
    void action(Intent intent){JSObject notice=notice(intent);if(notice.has("id"))notifyListeners("notificationAction",notice,true);}
    private JSObject notice(Intent intent){JSObject value=new JSObject();if(intent!=null&&intent.hasExtra("notice")){value.put("id",intent.getStringExtra("notice"));value.put("revision",intent.getStringExtra("revision"));value.put("module",intent.getStringExtra("module"));value.put("target_id",intent.getStringExtra("order")!=null?intent.getStringExtra("order"):intent.getStringExtra("credit"));intent.removeExtra("notice");}return value;}
    @PluginMethod public void launchNotice(PluginCall call){call.resolve(notice(getActivity().getIntent()));}

    @PluginMethod public void signInGoogle(PluginCall call){
        getActivity().runOnUiThread(()->{
            try{
                GetSignInWithGoogleOption option=new GetSignInWithGoogleOption.Builder(WEB_CLIENT_ID).setNonce(UUID.randomUUID().toString()).build();
                GetCredentialRequest request=new GetCredentialRequest.Builder().addCredentialOption(option).build();
                CredentialManager.create(getContext()).getCredentialAsync(getActivity(),request,new CancellationSignal(),ContextCompat.getMainExecutor(getContext()),new CredentialManagerCallback<GetCredentialResponse,GetCredentialException>(){
                    @Override public void onResult(GetCredentialResponse response){
                        try{Credential credential=response.getCredential();if(!(credential instanceof CustomCredential))throw new IllegalStateException();
                            String idToken=GoogleIdTokenCredential.createFrom(credential.getData()).getIdToken();
                            network.execute(()->{try{JSObject body=new JSObject().put("credential",idToken);JSObject result=request("/auth/google","POST",body,new JSObject());if(result.getInteger("status",500)>=400){call.reject("No fue posible iniciar sesión: "+result.getJSObject("data",new JSObject()).getString("error","revisa la cuenta"));return;}call.resolve(result.getJSObject("data"));}catch(Exception error){call.reject("No fue posible conectar con Delipiña. Intenta nuevamente.");}});
                        }catch(Exception invalid){call.reject("Google no devolvió una cuenta válida.");}
                    }
                    @Override public void onError(GetCredentialException error){call.reject("No se completó el acceso. Selecciona una cuenta de Google del teléfono.");}
                });
            }catch(Exception unavailable){call.reject("El selector de Google no está disponible. Revisa los servicios de Google Play.");}
        });
    }
    @PluginMethod public void request(PluginCall call){network.execute(()->{try{call.resolve(request(call.getString("path"),call.getString("method","GET"),call.getObject("body"),call.getObject("headers",new JSObject())));}catch(Exception error){call.reject("No fue posible conectar con Delipiña. Revisa la conexión e intenta nuevamente.");}});}
    private JSObject request(String path,String method,JSObject body,JSObject headers) throws Exception {
        if(path==null||!path.startsWith("/")||path.startsWith("//")||path.contains("\\")||path.contains("#")||!Arrays.asList("GET","POST","PUT","PATCH","DELETE").contains(method))throw new IllegalArgumentException("Solicitud inválida");
        URL url=new URI(ORIGIN+"/api"+path).toURL();
        HttpURLConnection connection=(HttpURLConnection)url.openConnection();connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(20000);connection.setReadTimeout(30000);connection.setRequestMethod(method);connection.setRequestProperty("Accept","application/json");connection.setRequestProperty("Origin",ORIGIN);
        String session=NativeSession.read(getContext());if(session!=null)connection.setRequestProperty("Cookie","session="+session);
        String idempotency=headers.getString("Idempotency-Key");if(idempotency!=null&&idempotency.length()<=100)connection.setRequestProperty("Idempotency-Key",idempotency);
        try{
            if(body!=null&&!method.equals("GET")){connection.setRequestProperty("Content-Type","application/json");connection.setDoOutput(true);try(OutputStream output=connection.getOutputStream()){output.write(body.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));}}
            int status=connection.getResponseCode();
            if(status==401)NativeSession.clear(getContext());
            if(status<400){for(var entry:connection.getHeaderFields().entrySet())if("Set-Cookie".equalsIgnoreCase(entry.getKey()))for(String cookie:entry.getValue())if(cookie.startsWith("session=")){String value=cookie.substring(8).split(";",2)[0];if(value.matches("[a-f0-9]{64}"))NativeSession.save(getContext(),value);}}
            byte[] bytes;InputStream input=status>=400?connection.getErrorStream():connection.getInputStream();try(ByteArrayOutputStream output=new ByteArrayOutputStream()){if(input!=null)try(input){byte[] chunk=new byte[8192];int n;while((n=input.read(chunk))!=-1){if(output.size()+n>16000000)throw new IOException("Respuesta demasiado grande");output.write(chunk,0,n);}}bytes=output.toByteArray();}
            JSObject result=new JSObject().put("status",status);String type=connection.getContentType();
            if(type!=null&&type.contains("application/json"))result.put("data",bytes.length==0?JSONObject.NULL:new JSONTokener(new String(bytes,java.nio.charset.StandardCharsets.UTF_8)).nextValue());
            else result.put("base64",Base64.encodeToString(bytes,Base64.NO_WRAP)).put("mime",type==null?"application/octet-stream":type.split(";",2)[0]);
            if(path.equals("/logout")&&status<400){NativeSession.clear(getContext());((NotificationManager)getContext().getSystemService(android.content.Context.NOTIFICATION_SERVICE)).cancelAll();CredentialManager.create(getContext()).clearCredentialStateAsync(new ClearCredentialStateRequest(),null,ContextCompat.getMainExecutor(getContext()),new CredentialManagerCallback<Void,androidx.credentials.exceptions.ClearCredentialException>(){public void onResult(Void ignored){}public void onError(androidx.credentials.exceptions.ClearCredentialException ignored){}});}
            return result;
        }finally{connection.disconnect();}
    }
    @PluginMethod public void openAttachment(PluginCall call){network.execute(()->{try{String path=call.getString("path","");if(!path.matches("/(payments/[a-f0-9-]+/proof|invoices/[a-f0-9-]+/photo)"))throw new IllegalArgumentException();JSObject r=request(path,"GET",null,new JSObject());String mime=r.getString("mime","");if(r.getInteger("status",500)!=200||!Arrays.asList("image/png","image/jpeg").contains(mime))throw new IOException();File dir=new File(getContext().getCacheDir(),"receipts");dir.mkdirs();for(File stale:Objects.requireNonNull(dir.listFiles()))stale.delete();File file=new File(dir,UUID.randomUUID()+(mime.equals("image/png")?".png":".jpg"));try(FileOutputStream output=new FileOutputStream(file)){output.write(Base64.decode(r.getString("base64"),Base64.DEFAULT));}Uri uri=FileProvider.getUriForFile(getContext(),getContext().getPackageName()+".fileprovider",file);getActivity().runOnUiThread(()->{try{getActivity().startActivity(new Intent(Intent.ACTION_VIEW).setDataAndType(uri,mime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));call.resolve();}catch(Exception unavailable){call.reject("No hay una aplicación para ver el comprobante.");}});}catch(Exception error){call.reject("No fue posible abrir el comprobante.");}});}
    @PluginMethod public void pushStatus(PluginCall call){call.resolve(new JSObject().put("granted",NotificationManagerCompat.from(getContext()).areNotificationsEnabled()));}
    @PluginMethod public void pushToken(PluginCall call){if(Build.VERSION.SDK_INT>=33&&getPermissionState("notifications")!=PermissionState.GRANTED){requestPermissionForAlias("notifications",call,"pushPermission");return;}token(call);}
    @PermissionCallback private void pushPermission(PluginCall call){if(getPermissionState("notifications")!=PermissionState.GRANTED){call.reject("Permiso de notificaciones pendiente o bloqueado.");return;}token(call);}
    private void token(PluginCall call){FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task->{if(!task.isSuccessful()){call.reject("No fue posible registrar las notificaciones Android.");return;}var prefs=getContext().getSharedPreferences("push",android.content.Context.MODE_PRIVATE);String key=prefs.getString("deviceKey",null);if(key==null){byte[] random=new byte[32];new java.security.SecureRandom().nextBytes(random);StringBuilder value=new StringBuilder();for(byte b:random)value.append(String.format("%02x",b&255));key=value.toString();prefs.edit().putString("deviceKey",key).apply();}call.resolve(new JSObject().put("token",task.getResult()).put("deviceKey",key));});}
}
