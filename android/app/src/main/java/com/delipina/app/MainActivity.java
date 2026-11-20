package com.delipina.app;
import android.os.Bundle;
import android.content.Intent;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle state){registerPlugin(DelipinaNativePlugin.class);super.onCreate(state);}
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);var plugin=getBridge().getPlugin("DelipinaNative");if(plugin!=null)((DelipinaNativePlugin)plugin.getInstance()).action(intent);}
}
