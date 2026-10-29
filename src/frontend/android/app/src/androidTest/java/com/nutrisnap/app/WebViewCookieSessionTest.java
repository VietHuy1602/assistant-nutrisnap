package com.nutrisnap.app;

import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

/** Tests Chromium cookie policy on Android, using only a synthetic non-secret cookie. */
@RunWith(AndroidJUnit4.class)
public class WebViewCookieSessionTest {
    private static final String COOKIE = "nutrisnap_policy_test=synthetic";

    public static class Result {
        final CountDownLatch done = new CountDownLatch(1);
        String value;
        @JavascriptInterface public void finish(String value) {
            this.value = value;
            done.countDown();
        }
    }

    private String runPage(String origin, int port, boolean login) throws Exception {
        Result result = new Result();
        AtomicReference<WebView> view = new AtomicReference<>();
        String api = "http://127.0.0.1:" + port;
        String script = "(async()=>{try{"
            + (login ? "await fetch('" + api + "/login',{method:'POST',credentials:'include'});" : "")
            + "const r=await fetch('" + api + "/me',{credentials:'include'});"
            + "Result.finish(r.status+':'+document.cookie.includes('nutrisnap_policy_test'));"
            + "}catch(e){Result.finish('network-error')}})()";
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            WebView webView = new WebView(InstrumentationRegistry.getInstrumentation().getTargetContext());
            view.set(webView);
            webView.getSettings().setJavaScriptEnabled(true);
            // Reproduce the previous debug app's policy, so SameSite is the only changed variable.
            webView.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
            webView.addJavascriptInterface(result, "Result");
            webView.loadDataWithBaseURL(origin + "/", "<script>" + script + "</script>", "text/html", "UTF-8", null);
        });
        try {
            assertTrue("WebView request timed out", result.done.await(20, TimeUnit.SECONDS));
            return result.value;
        } finally {
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> view.get().destroy());
        }
    }

    @Test public void laxCookieIsRejectedCrossSiteButStoredAndSentSameSite() throws Exception {
        // A minimal local API records cookie presence, never cookie values or credentials.
        try (ServerSocket server = new ServerSocket(0, 10, InetAddress.getByName("127.0.0.1"))) {
            ExecutorService worker = Executors.newSingleThreadExecutor();
            worker.submit(() -> {
                while (!server.isClosed()) {
                    try (Socket socket = server.accept()) {
                        BufferedReader input = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
                        String request = input.readLine();
                        String origin = "";
                        boolean hasCookie = false;
                        String line;
                        while ((line = input.readLine()) != null && !line.isEmpty()) {
                            if (line.toLowerCase().startsWith("origin:")) origin = line.substring(7).trim();
                            if (line.toLowerCase().startsWith("cookie:")) hasCookie = line.contains(COOKIE);
                        }
                        boolean login = request.startsWith("POST /login ");
                        int status = login || hasCookie || request.startsWith("OPTIONS ") ? 200 : 401;
                        String headers = "HTTP/1.1 " + status + " Test\r\n"
                            + "Access-Control-Allow-Origin: " + origin + "\r\nAccess-Control-Allow-Credentials: true\r\n"
                            + "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
                            + (login ? "Set-Cookie: " + COOKIE + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600\r\n" : "")
                            + "Content-Length: 2\r\nConnection: close\r\n\r\n{}";
                        socket.getOutputStream().write(headers.getBytes(StandardCharsets.UTF_8));
                    } catch (IOException e) {
                        if (!server.isClosed()) throw new RuntimeException(e);
                    }
                }
            });
            try {
                CountDownLatch cleared = new CountDownLatch(1);
                InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
                    CookieManager.getInstance().setCookie("http://127.0.0.1", COOKIE + "; Path=/; Max-Age=0", ok -> cleared.countDown()));
                assertTrue(cleared.await(5, TimeUnit.SECONDS));
                assertEquals("Cross-site login must not establish a Lax cookie session", "401:false",
                    runPage("https://localhost", server.getLocalPort(), true));
                assertEquals("Same-site login must send the HttpOnly cookie to /me", "200:false",
                    runPage("http://127.0.0.1", server.getLocalPort(), true));
                CookieManager.getInstance().flush();
                assertEquals("A recreated WebView must retain the session without logging in again", "200:false",
                    runPage("http://127.0.0.1", server.getLocalPort(), false));
            } finally {
                server.close();
                worker.shutdownNow();
                CookieManager.getInstance().setCookie("http://127.0.0.1", COOKIE + "; Path=/; Max-Age=0");
                CookieManager.getInstance().flush();
            }
        }
    }
}
