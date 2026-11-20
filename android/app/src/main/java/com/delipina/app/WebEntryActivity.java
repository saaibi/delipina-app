package com.delipina.app;

import android.app.Activity;
import android.os.Bundle;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.widget.TextView;
import androidx.browser.customtabs.CustomTabsIntent;

/** Published HTTPS app, with browser-owned Google sign-in and session cookies. */
public class WebEntryActivity extends Activity {
    private static final Uri APP = Uri.parse("https://delipina-app-z9br.onrender.com/");
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        try {
            new CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(this, APP);
            finish();
        } catch (ActivityNotFoundException unavailable) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, APP));
                finish();
            } catch (ActivityNotFoundException noBrowser) {
                TextView message = new TextView(this);
                message.setText("Instala un navegador para abrir Delipiña.");
                message.setGravity(android.view.Gravity.CENTER);
                setContentView(message);
            }
        }
    }
}
