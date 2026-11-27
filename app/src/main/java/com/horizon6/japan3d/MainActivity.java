package com.horizon6.japan3d;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.graphics.Color;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.Display;
import android.view.Surface;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.util.Base64;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Collections;

public class MainActivity extends Activity implements SensorEventListener {

    private static final String TAG = "Horizon6Main";
    private static final String JS_TAG = "Horizon6JS";
    private static final String ENTRY_URL = "file:///android_asset/index.html";
    private static final float MAX_TILT_RAD = (float) Math.toRadians(35.0);
    private static final float TILT_DEADZONE = 0.03f;
    private static final float ACCEL_LPF_ALPHA = 0.25f;

    private WebView webView;
    private SensorManager sensorManager;
    private Sensor activeSensor;
    private int activeSensorType = -1;

    private final Object sensorLock = new Object();
    private volatile boolean gyroEnabled = false;
    private volatile boolean sensorRegistered = false;
    private volatile boolean isPaused = false;

    private final float[] rotationMatrix = new float[9];
    private final float[] filteredAccel = new float[3];
    private boolean hasAccelInit = false;

    private volatile float lastRawTiltRad = 0.0f;
    private volatile float zeroOffsetRad = 0.0f;
    private volatile float currentTilt = 0.0f;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);

        Window window = getWindow();
        window.addFlags(
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                        | WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED
        );
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = window.getAttributes();
            lp.layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(lp);
        }

        initSensors();
        initWebView();
        setContentView(webView);
        applyImmersiveMode();
        webView.loadUrl(ENTRY_URL);
    }

    private void initSensors() {
        sensorManager = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
        if (sensorManager == null) {
            return;
        }
        Sensor sensor = sensorManager.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR);
        if (sensor != null) {
            activeSensor = sensor;
            activeSensorType = Sensor.TYPE_GAME_ROTATION_VECTOR;
            return;
        }
        sensor = sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);
        if (sensor != null) {
            activeSensor = sensor;
            activeSensorType = Sensor.TYPE_ROTATION_VECTOR;
            return;
        }
        sensor = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        if (sensor != null) {
            activeSensor = sensor;
            activeSensorType = Sensor.TYPE_ACCELEROMETER;
        }
    }

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    private void initWebView() {
        webView = new WebView(this);
        webView.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        webView.setBackgroundColor(Color.BLACK);
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setLongClickable(false);
        webView.setHapticFeedbackEnabled(false);
        webView.setOnLongClickListener(v -> true);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        configureFileUrlAccess(settings);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setBlockNetworkLoads(true);
        settings.setBlockNetworkImage(true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request != null ? request.getUrl() : null;
                if (isBlockedNetworkUri(url)) {
                    Log.w(TAG, "Blocked external network request: " + url);
                    return new WebResourceResponse(
                            "text/plain",
                            "UTF-8",
                            403,
                            "Offline Only",
                            Collections.emptyMap(),
                            new ByteArrayInputStream(new byte[0])
                    );
                }
                return super.shouldInterceptRequest(view, request);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request != null ? request.getUrl() : null;
                if (url == null) {
                    return true;
                }
                String scheme = url.getScheme();
                return !"file".equalsIgnoreCase(scheme);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                applyImmersiveMode();
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                if (consoleMessage == null) {
                    return false;
                }
                String msg = consoleMessage.message()
                        + " (" + consoleMessage.sourceId()
                        + ":" + consoleMessage.lineNumber() + ")";
                ConsoleMessage.MessageLevel level = consoleMessage.messageLevel();
                if (level == ConsoleMessage.MessageLevel.ERROR) {
                    Log.e(JS_TAG, msg);
                } else if (level == ConsoleMessage.MessageLevel.WARNING) {
                    Log.w(JS_TAG, msg);
                } else {
                    Log.d(JS_TAG, msg);
                }
                return true;
            }
        });

        webView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");
    }

    @SuppressWarnings("deprecation")
    private static void configureFileUrlAccess(WebSettings settings) {
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(false);
    }

    private static boolean isBlockedNetworkUri(Uri url) {
        if (url == null) {
            return false;
        }
        String scheme = url.getScheme();
        return "http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme);
    }

    private void applyImmersiveMode() {
        Window window = getWindow();
        if (window == null) {
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false);
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(
                        WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                );
            }
        } else {
            applyLegacyImmersiveFlags(window);
        }
    }

    @SuppressWarnings("deprecation")
    private static void applyLegacyImmersiveFlags(Window window) {
        View decor = window.getDecorView();
        decor.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
        );
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            applyImmersiveMode();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        isPaused = false;
        applyImmersiveMode();
        if (webView != null) {
            webView.resumeTimers();
            webView.onResume();
            webView.evaluateJavascript(
                    "if(window.HorizonBridge&&typeof window.HorizonBridge.onAppResume==='function'){window.HorizonBridge.onAppResume();}",
                    null
            );
        }
        if (gyroEnabled) {
            registerSensorListener();
        }
    }

    @Override
    protected void onPause() {
        isPaused = true;
        unregisterSensorListener();
        if (webView != null) {
            webView.evaluateJavascript(
                    "if(window.HorizonBridge&&typeof window.HorizonBridge.onAppPause==='function'){window.HorizonBridge.onAppPause();}",
                    null
            );
            webView.onPause();
            webView.pauseTimers();
        }
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        unregisterSensorListener();
        if (webView != null) {
            webView.stopLoading();
            webView.removeJavascriptInterface("AndroidBridge");
            ViewGroup parent = (ViewGroup) webView.getParent();
            if (parent != null) {
                parent.removeView(webView);
            }
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (webView == null) {
            super.onBackPressed();
            return;
        }
        webView.evaluateJavascript(
                "(function(){if(window.HorizonBridge&&typeof window.HorizonBridge.onBackPressed==='function'){window.HorizonBridge.onBackPressed();return true;}return false;})()",
                value -> {
                    if (!"true".equals(value)) {
                        showFallbackExitDialog();
                    }
                }
        );
    }

    private void showFallbackExitDialog() {
        if (isFinishing() || isDestroyed()) {
            return;
        }
        new AlertDialog.Builder(this)
                .setTitle("Выход из игры")
                .setMessage("Завершить сеанс Horizon 6: Япония 3D?")
                .setPositiveButton("Выйти", (dialog, which) -> finishAffinity())
                .setNegativeButton("Остаться", (dialog, which) -> applyImmersiveMode())
                .setOnDismissListener(dialog -> applyImmersiveMode())
                .show();
    }

    private void registerSensorListener() {
        synchronized (sensorLock) {
            if (sensorManager == null || activeSensor == null || sensorRegistered || isPaused) {
                return;
            }
            hasAccelInit = false;
            sensorRegistered = sensorManager.registerListener(
                    this,
                    activeSensor,
                    SensorManager.SENSOR_DELAY_GAME
            );
        }
    }

    private void unregisterSensorListener() {
        synchronized (sensorLock) {
            if (sensorManager != null && sensorRegistered) {
                sensorManager.unregisterListener(this);
                sensorRegistered = false;
            }
        }
    }

    private int getDisplayRotationSafe() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Display display = getDisplay();
            if (display != null) {
                return display.getRotation();
            }
        }
        return getLegacyDisplayRotation();
    }

    @SuppressWarnings("deprecation")
    private int getLegacyDisplayRotation() {
        WindowManager wm = getWindowManager();
        if (wm == null) {
            return Surface.ROTATION_90;
        }
        Display display = wm.getDefaultDisplay();
        return display != null ? display.getRotation() : Surface.ROTATION_90;
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (event == null || !gyroEnabled) {
            return;
        }

        float upX;
        float upY;
        if (event.sensor.getType() == Sensor.TYPE_GAME_ROTATION_VECTOR
                || event.sensor.getType() == Sensor.TYPE_ROTATION_VECTOR) {
            SensorManager.getRotationMatrixFromVector(rotationMatrix, event.values);
            upX = rotationMatrix[6];
            upY = rotationMatrix[7];
        } else if (event.sensor.getType() == Sensor.TYPE_ACCELEROMETER) {
            if (!hasAccelInit) {
                filteredAccel[0] = event.values[0];
                filteredAccel[1] = event.values[1];
                filteredAccel[2] = event.values[2];
                hasAccelInit = true;
            } else {
                filteredAccel[0] += ACCEL_LPF_ALPHA * (event.values[0] - filteredAccel[0]);
                filteredAccel[1] += ACCEL_LPF_ALPHA * (event.values[1] - filteredAccel[1]);
                filteredAccel[2] += ACCEL_LPF_ALPHA * (event.values[2] - filteredAccel[2]);
            }
            float mag = (float) Math.sqrt(
                    filteredAccel[0] * filteredAccel[0]
                            + filteredAccel[1] * filteredAccel[1]
                            + filteredAccel[2] * filteredAccel[2]
            );
            if (mag < 1e-3f) {
                return;
            }
            upX = filteredAccel[0] / mag;
            upY = filteredAccel[1] / mag;
        } else {
            return;
        }

        // Steering convention: positive tilt = turn LEFT, negative tilt = turn RIGHT
        int rotation = getDisplayRotationSafe();
        float lateralSin;
        if (rotation == Surface.ROTATION_90) {
            lateralSin = -upY;
        } else if (rotation == Surface.ROTATION_270) {
            lateralSin = upY;
        } else if (rotation == Surface.ROTATION_180) {
            lateralSin = -upX;
        } else {
            lateralSin = upX;
        }

        lateralSin = clamp(lateralSin, -1.0f, 1.0f);
        float rawRad = (float) Math.asin(lateralSin);
        lastRawTiltRad = rawRad;

        float deltaRad = rawRad - zeroOffsetRad;
        float norm = clamp(deltaRad / MAX_TILT_RAD, -1.0f, 1.0f);
        if (Math.abs(norm) < TILT_DEADZONE) {
            norm = 0.0f;
        } else {
            float sign = Math.signum(norm);
            norm = sign * ((Math.abs(norm) - TILT_DEADZONE) / (1.0f - TILT_DEADZONE));
        }
        currentTilt = clamp(norm, -1.0f, 1.0f);
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {
        // No-op
    }

    private static float clamp(float value, float min, float max) {
        return Math.max(min, Math.min(max, value));
    }

    public final class AndroidBridge {

        @JavascriptInterface
        public boolean isNativeAndroid() {
            return true;
        }

        @JavascriptInterface
        public void setGyroEnabled(boolean enabled) {
            gyroEnabled = enabled;
            if (enabled) {
                registerSensorListener();
            } else {
                unregisterSensorListener();
                currentTilt = 0.0f;
            }
        }

        @JavascriptInterface
        public float getTilt() {
            return gyroEnabled ? currentTilt : 0.0f;
        }

        @JavascriptInterface
        public void calibrateGyro() {
            zeroOffsetRad = lastRawTiltRad;
            currentTilt = 0.0f;
        }

        @JavascriptInterface
        public String readAssetBase64(String assetPath) {
            if (assetPath == null) {
                return null;
            }
            String clean = assetPath.trim();
            while (clean.startsWith("/") || clean.startsWith("./")) {
                clean = clean.startsWith("/") ? clean.substring(1) : clean.substring(2);
            }
            if (clean.isEmpty() || clean.contains("..") || clean.contains("\\")) {
                Log.w(TAG, "Rejected invalid asset path: " + assetPath);
                return null;
            }
            try (InputStream in = getAssets().open(clean);
                 ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buf = new byte[16384];
                int n;
                while ((n = in.read(buf)) != -1) {
                    out.write(buf, 0, n);
                }
                return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
            } catch (IOException e) {
                Log.w(TAG, "Failed to read asset: " + clean, e);
                return null;
            }
        }

        @JavascriptInterface
        public void exitApp() {
            runOnUiThread(() -> {
                if (!isFinishing() && !isDestroyed()) {
                    finishAffinity();
                }
            });
        }
    }
}
