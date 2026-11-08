package io.github.theupdoge.nostalgem

import android.annotation.SuppressLint
import android.app.Activity
import android.content.pm.ApplicationInfo
import android.graphics.Bitmap
import android.graphics.Color
import android.net.ConnectivityManager
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.InputDevice
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import java.net.Inet4Address
import java.net.NetworkInterface

/**
 * NostalGem for Google TV, Android TV and Fire TV.
 *
 * The whole TV is the web app. The app opens the published site, so fixes and the daily lineup arrive
 * without reinstalling, and falls back to the copy bundled in assets/www (served from a private https
 * origin, so it behaves exactly like the website) when the site can't be reached. This activity only
 * adds what a web page can't do alone: a home-screen banner, the screen kept awake, remote buttons
 * (channel up/down, play/pause, guide, info, the colored keys, Back) handed to the page, and this TV's
 * Wi-Fi address, so a phone remote on the same Wi-Fi can reach it directly.
 *
 * The secret link-out stations (777's arcade and friends) open their sites right here on the TV. While
 * one is on screen, every key and controller button goes to it, so its games play with a controller;
 * the remote's Back steps back through the site and then home to NostalGem.
 */
class MainActivity : Activity() {

    private lateinit var web: WebView
    private val main = Handler(Looper.getMainLooper())
    private var usingBundled = false
    private var siteLoaded = false

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

                // The TV stays on NostalGem, except for the link-out stations' own sites. While one of those is
                // on screen, its frames (a game's player) may load from anywhere.
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    if (isOurs(request.url) || isAway(request.url)) return false
                    return request.isForMainFrame || home()
                }

                override fun onPageFinished(view: WebView, url: String) {
                    if (Uri.parse(url).host == SITE_HOST) siteLoaded = true
                }

                // No network, or the site is down: run the copy inside the app. (A link-out site that won't
                // load just brings you home.)
                override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                    if (!request.isForMainFrame) return
                    if (isAway(request.url)) goHome() else useBundled()
                }

                override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: WebResourceResponse) {
                    if (!request.isForMainFrame || response.statusCode < 400) return
                    if (isAway(request.url)) goHome() else useBundled()
                }
            }

            webChromeClient = object : WebChromeClient() {
                // Without this, WebView paints a grey play-button poster before every program starts.
                override fun getDefaultVideoPoster(): Bitmap = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888)
            }
        }

        // The page asks for this TV's Wi-Fi address; only pages from this app or its site get an answer.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "NostalGemTV", setOf("https://$APP_HOST", "https://$SITE_HOST")) { _, _, _, isMainFrame, reply ->
                if (isMainFrame) reply.postMessage(hello())
            }
        }

        setContentView(web)
        hideSystemBars()
        web.loadUrl(SITE_URL)
        // A slow network: don't sit on a black screen.
        main.postDelayed({ if (!siteLoaded) useBundled() }, SITE_TIMEOUT_MS)
        web.requestFocus()
    }

    private fun isOurs(url: Uri): Boolean =
        url.host == APP_HOST || (url.host == SITE_HOST && (url.path ?: "").startsWith(SITE_PATH))

    /** A link-out station's site (https only): the arcade, South Park, ASCII City. */
    private fun isAway(url: Uri): Boolean {
        val host = url.host ?: return false
        return url.scheme == "https" && AWAY_HOSTS.any { host == it || host.endsWith(".$it") }
    }

    /** Is the TV showing NostalGem (rather than a link-out station's site) right now? */
    private fun home(): Boolean = web.url?.let { isOurs(Uri.parse(it)) } ?: true

    private fun useBundled() {
        if (usingBundled) return
        usingBundled = true
        web.stopLoading()
        web.loadUrl(BUNDLED_URL)
    }

    /** {"lan":["192.168.1.23"],"app":"1.0.21","can":["open"]}: this TV's IPv4 addresses on the local
     * network, the app's version, and what it can do for the page ("open": link-out sites, right here). */
    private fun hello(): String {
        val ips = lanAddresses().joinToString(",") { "\"" + it + "\"" }
        val version = try {
            packageManager.getPackageInfo(packageName, 0).versionName ?: ""
        } catch (e: Exception) {
            ""
        }
        return "{\"lan\":[" + ips + "],\"app\":\"" + version.replace("\"", "") + "\",\"can\":[\"open\"]}"
    }

    private fun lanAddresses(): List<String> {
        val out = LinkedHashSet<String>()
        try {
            val cm = getSystemService(ConnectivityManager::class.java)
            cm?.getLinkProperties(cm.activeNetwork)?.linkAddresses?.forEach { la ->
                val a = la.address
                if (a is Inet4Address && !a.isLoopbackAddress && !a.isLinkLocalAddress) a.hostAddress?.let { out.add(it) }
            }
        } catch (e: Exception) {
            // no permission or no network: try the interfaces
        }
        if (out.isEmpty()) {
            try {
                NetworkInterface.getNetworkInterfaces()?.toList()?.forEach { ni ->
                    if (ni.isUp && !ni.isLoopback) {
                        ni.inetAddresses.toList().forEach { a ->
                            if (a is Inet4Address && a.isSiteLocalAddress) a.hostAddress?.let { out.add(it) }
                        }
                    }
                }
            } catch (e: Exception) {
                // none to offer
            }
        }
        return out.toList().take(4)
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (!home()) return awayKey(event)
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

    // On a link-out station's site: the site gets every key and controller button (its games play), and
    // only the remote's Back comes home. A controller's B turns into Back when a page doesn't use it,
    // which would drop you out of a game, so Back from a controller is left alone; holding the
    // controller's Select for a second and a half comes home instead.
    private var selectDownAt = 0L

    private fun awayKey(event: KeyEvent): Boolean {
        if (event.keyCode == KeyEvent.KEYCODE_BACK) {
            val pad = (event.source and InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD ||
                (event.source and InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK ||
                (event.flags and KeyEvent.FLAG_FALLBACK) != 0
            if (!pad && event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) comeHome()
            return true
        }
        if (event.keyCode == KeyEvent.KEYCODE_BUTTON_SELECT) {
            if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) selectDownAt = event.eventTime
            if (event.action == KeyEvent.ACTION_UP && selectDownAt > 0 && event.eventTime - selectDownAt >= SELECT_HOLD_MS) {
                selectDownAt = 0
                goHome()
                return true
            }
        }
        return super.dispatchKeyEvent(event)
    }

    // Back through the site's own pages, then home to NostalGem.
    private fun comeHome() {
        val list = web.copyBackForwardList()
        val i = list.currentIndex
        val prev = if (i > 0) list.getItemAtIndex(i - 1)?.url else null
        if (prev != null) web.goBack() else goHome()
    }

    // Straight home to NostalGem: back to its page in this visit's history, or load it afresh.
    private fun goHome() {
        val list = web.copyBackForwardList()
        for (k in list.currentIndex - 1 downTo 0) {
            val u = list.getItemAtIndex(k)?.url ?: continue
            if (isOurs(Uri.parse(u))) {
                web.goBackOrForward(k - list.currentIndex)
                return
            }
        }
        web.loadUrl(if (usingBundled) BUNDLED_URL else SITE_URL)
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
        main.removeCallbacksAndMessages(null)
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
        const val SITE_HOST = "theupdoge.github.io"
        const val SITE_PATH = "/Nostalgem/"
        const val SITE_URL = "https://$SITE_HOST$SITE_PATH?tv=android"
        const val SITE_TIMEOUT_MS = 15000L
        const val SELECT_HOLD_MS = 1500L

        /** The link-out stations' sites, which open right here on the TV (and their subdomains). */
        val AWAY_HOSTS = listOf("retrogames.cc", "southpark.cc.com", "asciicity.com")
        val BUNDLED_URL: String = Uri.Builder()
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
