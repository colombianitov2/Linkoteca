package com.wolframica.linkoteca;

import android.content.Intent;
import android.os.Handler;
import android.os.Looper;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MainActivity extends BridgeActivity {
    private static final Pattern URL_PATTERN = Pattern.compile("https?://\\S+", Pattern.CASE_INSENSITIVE);
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleSharedIntent(intent);
    }

    private void handleSharedIntent(Intent intent) {
        if (intent == null) return;

        String action = intent.getAction();
        String sharedText = null;

        if (Intent.ACTION_SEND.equals(action)) {
            CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
            sharedText = text == null ? null : text.toString();
        } else if (Intent.ACTION_VIEW.equals(action) && intent.getDataString() != null) {
            sharedText = intent.getDataString();
        }

        String url = extractFirstUrl(sharedText);
        if (url == null) return;

        String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        dispatchSharedLink(url, subject, sharedText);
    }

    private String extractFirstUrl(String value) {
        if (value == null) return null;
        Matcher matcher = URL_PATTERN.matcher(value);
        if (!matcher.find()) return null;
        return matcher.group()
            .replaceAll("[\\s)\\]}>,.;]+$", "");
    }

    private void dispatchSharedLink(String url, String title, String text) {
        try {
            JSONObject payload = new JSONObject();
            payload.put("url", url);
            payload.put("title", title == null ? "" : title);
            payload.put("text", text == null ? "" : text);
            payload.put("source", "android-share");

            String json = payload.toString();
            String script =
                "window.__linkotecaPendingShare = " + json + ";" +
                "window.dispatchEvent(new CustomEvent('linkoteca:shared-link', { detail: " + json + " }));";

            // The page can still be loading when Android opens the app from the share sheet.
            // Run the dispatch a few times; the web app also reads __linkotecaPendingShare on boot.
            for (int delay : new int[] { 150, 700, 1500 }) {
                mainHandler.postDelayed(() -> {
                    if (getBridge() != null && getBridge().getWebView() != null) {
                        getBridge().getWebView().evaluateJavascript(script, null);
                    }
                }, delay);
            }
        } catch (Exception ignored) {
            // Sharing should never prevent Linkoteca from opening normally.
        }
    }
}
