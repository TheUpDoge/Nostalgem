package io.github.theupdoge.nostalgem

import android.annotation.SuppressLint
import android.app.Activity
import android.content.pm.ApplicationInfo
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader

/**
 * NostalGem for Google TV, Android TV and Fire TV.
 *
 * The whole TV is the web app bundled in assets/www, served from a private https origin so it
 * behaves exactly like the website. This activity only adds what a web page can't do alone:
 * a home-screen banner, the screen kept awake, and remote buttons (channel up/down, play/pause,
 * guide, info, the colored keys, Back) handed to the page.
 */
class MainActivity : Activity() {

    private lateinit var web: WebView

    private val assetLoader by lazy {
        WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        if (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) {
            WebView.setWebContentsDebuggingEnabled(true)
        }

        web = WebView(this).apply {
            setBackgroundColor(Color.BLACK)
            isFocusable = true
            isFocusableInTouchMode = true
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            settings.allowFileAccess = false
            settings.allowContentAccess = false

            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                    assetLoader.shouldInterceptRequest(request.url)

                // The TV never navigates away from itself.
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                    request.url.host != APP_HOST
            }

            webChromeClient = object : WebChromeClient() {
                // Without this, WebView paints a grey play-button poster before every program starts.
                override fun getDefaultVideoPoster(): Bitmap = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888)
            }
        }

        setContentView(web)
        hideSystemBars()
        web.loadUrl(START_URL)
        web.requestFocus()
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val action = remoteAction(event.keyCode) ?: return super.dispatchKeyEvent(event)
        if (event.action == KeyEvent.ACTION_DOWN) {
            if (action == "back") {
                if (event.repeatCount == 0) back()
            } else {
                // Held channel buttons repeat, so you can flip through quickly.
                web.evaluateJavascript("window.NP && NP.remote('$action')", null)
            }
        }
        return true
    }

    // Back closes whatever is open; with nothing open the page says so and the app exits
    // (after a second press, so one stray press doesn't drop you out).
    private fun back() {
        web.evaluateJavascript("window.NP ? NP.back() : false") { result ->
            if (result != "true") finish()
        }
    }

    override fun onPause() {
        web.evaluateJavascript("window.NP && NP.suspend()", null)
        web.onPause()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
        hideSystemBars()
        web.evaluateJavascript("window.NP && NP.resume()", null)
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    // On a phone or tablet: full screen, no status or navigation bar. (TVs have none to hide.)
    @Suppress("DEPRECATION")
    private fun hideSystemBars() {
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            )
    }

    companion object {
        const val APP_HOST = WebViewAssetLoader.DEFAULT_DOMAIN
        val START_URL: String = Uri.Builder()
            .scheme("https")
            .authority(APP_HOST)
            .path("/assets/www/index.html")
            .appendQueryParameter("tv", "android")
            .build()
            .toString()

        /** Remote buttons the page can't receive on its own. D-pad, OK and digits reach it as keys. */
        fun remoteAction(keyCode: Int): String? = when (keyCode) {
            KeyEvent.KEYCODE_BACK -> "back"
            KeyEvent.KEYCODE_CHANNEL_UP, KeyEvent.KEYCODE_PAGE_UP -> "chup"
            KeyEvent.KEYCODE_CHANNEL_DOWN, KeyEvent.KEYCODE_PAGE_DOWN -> "chdown"
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, KeyEvent.KEYCODE_HEADSETHOOK -> "playpause"
            KeyEvent.KEYCODE_MEDIA_PLAY -> "play"
            KeyEvent.KEYCODE_MEDIA_PAUSE, KeyEvent.KEYCODE_MEDIA_STOP -> "pause"
            KeyEvent.KEYCODE_MEDIA_NEXT, KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> "chup"
            KeyEvent.KEYCODE_MEDIA_PREVIOUS, KeyEvent.KEYCODE_MEDIA_REWIND -> "chdown"
            KeyEvent.KEYCODE_INFO -> "info"
            KeyEvent.KEYCODE_GUIDE -> "guide"
            KeyEvent.KEYCODE_MENU -> "menu"
            KeyEvent.KEYCODE_CAPTIONS -> "cc"
            KeyEvent.KEYCODE_LAST_CHANNEL -> "last"
            KeyEvent.KEYCODE_PROG_RED -> "red"
            KeyEvent.KEYCODE_PROG_GREEN -> "green"
            KeyEvent.KEYCODE_PROG_YELLOW -> "yellow"
            KeyEvent.KEYCODE_PROG_BLUE -> "blue"
            else -> null
        }
    }
}
