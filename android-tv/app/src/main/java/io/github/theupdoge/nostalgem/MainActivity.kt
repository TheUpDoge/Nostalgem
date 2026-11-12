package io.github.theupdoge.nostalgem

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.pm.ApplicationInfo
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.media.AudioManager
import android.net.ConnectivityManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.InputDevice
import android.view.KeyCharacterMap
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
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
 * The secret link-out stations (777's arcade and friends) open their sites right here on the TV, in a
 * second view over NostalGem, so NostalGem keeps running underneath and the phone remote stays linked.
 * While one is on screen, every key and controller button goes to it, so its games play with a
 * controller; the remote's Back steps back through the site and then home to NostalGem.
 *
 * The phone remote's Mouse page (js/pointer.js): the page hands its messages to this activity, which draws
 * a pointer over whatever is on screen and presses there for real — a touch for a click, a mouse hovering
 * for a move, the wheel for a scroll, a keyboard's keys and letters — on NostalGem, the YouTube player
 * or a link-out station's site alike.
 */
class MainActivity : Activity() {

    private lateinit var stage: FrameLayout
    private lateinit var web: WebView
    private lateinit var pointer: PointerView
    private var away: WebView? = null
    private var pageReply: JavaScriptReplyProxy? = null
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

                // The TV stays on NostalGem. (An older page sends the TV itself to a link-out station's site;
                // while one of those is on screen, its frames, a game's player, may load from anywhere.)
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

            webChromeClient = quietPosters()
        }

        // The page asks for this TV's Wi-Fi address, opens link-out sites and passes on the phone's
        // pointer; only pages from this app or its site are heard.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "NostalGemTV", setOf("https://$APP_HOST", "https://$SITE_HOST")) { _, message, _, isMainFrame, reply ->
                if (isMainFrame) {
                    pageReply = reply
                    fromPage(message.data ?: "", reply)
                }
            }
        }

        pointer = PointerView(this)
        stage = FrameLayout(this).apply {
            setBackgroundColor(Color.BLACK)
            addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
            addView(pointer, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        }
        setContentView(stage)
        hideSystemBars()
        web.loadUrl(SITE_URL)
        // A slow network: don't sit on a black screen.
        main.postDelayed({ if (!siteLoaded) useBundled() }, SITE_TIMEOUT_MS)
        web.requestFocus()
    }

    private fun quietPosters() = object : WebChromeClient() {
        // Without this, WebView paints a grey play-button poster before every program starts.
        override fun getDefaultVideoPoster(): Bitmap = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888)
    }

    private fun isOurs(url: Uri): Boolean =
        url.host == APP_HOST || (url.host == SITE_HOST && (url.path ?: "").startsWith(SITE_PATH))

    /** A link-out station's site (https only): the arcade, South Park, ASCII City. */
    private fun isAway(url: Uri): Boolean {
        val host = url.host ?: return false
        return url.scheme == "https" && AWAY_HOSTS.any { host == it || host.endsWith(".$it") }
    }

    /** Is the TV showing NostalGem (rather than a link-out station's site) right now? */
    private fun home(): Boolean = away == null && (web.url?.let { isOurs(Uri.parse(it)) } ?: true)

    private fun useBundled() {
        if (usingBundled) return
        usingBundled = true
        web.stopLoading()
        web.loadUrl(BUNDLED_URL)
    }

    /** {"lan":["192.168.1.23"],"app":"1.0.21","can":["open","overlay","pointer"]}: this TV's IPv4 addresses on
     * the local network, the app's version, and what it can do for the page ("open": link-out sites right
     * here; "overlay": over NostalGem, which keeps running; "pointer": the phone's Mouse page). */
    private fun hello(): String {
        val ips = lanAddresses().joinToString(",") { "\"" + it + "\"" }
        val version = try {
            packageManager.getPackageInfo(packageName, 0).versionName ?: ""
        } catch (e: Exception) {
            ""
        }
        return "{\"lan\":[" + ips + "],\"app\":\"" + version.replace("\"", "") + "\",\"can\":[\"open\",\"overlay\",\"pointer\"]}"
    }

    // ---------- what the page asks for ----------
    private fun fromPage(data: String, reply: JavaScriptReplyProxy) {
        val m: JSONObject? = try {
            if (data.startsWith("{")) JSONObject(data) else null
        } catch (e: Exception) {
            null
        }
        if (m == null) {
            reply.postMessage(hello()) // "hello" (all an older page ever sends)
            return
        }
        when (m.optString("t")) {
            "open" -> openAway(m.optString("url"))
            "close" -> closeAway(true)
            "back" -> comeHome()
            "mute" -> muteAway()
            "ptr" -> movePointer(m.optDouble("dx", 0.0), m.optDouble("dy", 0.0))
            "click" -> click()
            "press" -> press(m.optBoolean("down", false))
            "scroll" -> scroll(m.optDouble("dx", 0.0), m.optDouble("dy", 0.0))
            "kbd" -> kbd(m.optString("key"), if (!m.has("down") || m.isNull("down")) null else m.optBoolean("down"))
            "text" -> type(m.optString("s").take(200))
        }
    }

    private fun tellPage(json: String) {
        try {
            pageReply?.postMessage(json)
        } catch (e: Exception) {
            // the page is reloading; it asks again when it's back
        }
    }

    // ---------- a link-out station's site, over NostalGem ----------
    @SuppressLint("SetJavaScriptEnabled")
    private fun openAway(url: String) {
        val uri = Uri.parse(url)
        if (!isAway(uri)) return
        closeAway(false)
        letGo()
        val v = WebView(this).apply {
            setBackgroundColor(Color.BLACK)
            isFocusable = true
            isFocusableInTouchMode = true
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            webViewClient = object : WebViewClient() {
                // The site's own pages; its frames (a game's player) may load from anywhere.
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                    !isAway(request.url) && request.isForMainFrame

                override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                    if (request.isForMainFrame) closeAway(true)
                }

                override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: WebResourceResponse) {
                    if (request.isForMainFrame && response.statusCode >= 400) closeAway(true)
                }
            }
            webChromeClient = quietPosters()
        }
        away = v
        stage.addView(v, stage.indexOfChild(pointer), FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        v.loadUrl(uri.toString())
        v.requestFocus()
        tellPage("{\"t\":\"away\"}")
    }

    /** Close the site and show NostalGem again; tell: let the page know, so its program comes back. */
    private fun closeAway(tell: Boolean) {
        val v = away ?: return
        letGo()
        away = null
        stage.removeView(v)
        v.stopLoading()
        v.destroy()
        if (mutedAway) {
            mutedAway = false
            audio()?.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_UNMUTE, 0)
        }
        web.requestFocus()
        if (tell) tellPage("{\"t\":\"home\"}")
    }

    // The phone's mute while a site is up: the site's sound, put back on coming home.
    private var mutedAway = false

    private fun audio(): AudioManager? = getSystemService(Context.AUDIO_SERVICE) as? AudioManager

    private fun muteAway() {
        if (away == null) return
        mutedAway = !mutedAway
        audio()?.adjustStreamVolume(AudioManager.STREAM_MUSIC, if (mutedAway) AudioManager.ADJUST_MUTE else AudioManager.ADJUST_UNMUTE, AudioManager.FLAG_SHOW_UI)
    }

    // ---------- the phone's pointer and keys ----------
    /** Whatever is on screen: a link-out station's site, or NostalGem. */
    private fun front(): WebView = away ?: web

    private val hidePointer = Runnable { pointer.visibility = View.GONE }

    private fun showPointer() {
        if (pointer.px < 0) {
            pointer.px = stage.width / 2f
            pointer.py = stage.height / 2f
        }
        pointer.visibility = View.VISIBLE
        pointer.invalidate()
        main.removeCallbacks(hidePointer)
        main.postDelayed(hidePointer, POINTER_HIDE_MS)
    }

    private fun movePointer(dx: Double, dy: Double) {
        val w = stage.width.toFloat()
        val h = stage.height.toFloat()
        if (w <= 0f || h <= 0f) return
        showPointer()
        // Fractions of the TV's width both ways, so a swipe goes as far up as across.
        pointer.px = (pointer.px + (dx.coerceIn(-1.0, 1.0) * w).toFloat()).coerceIn(0f, w - 1f)
        pointer.py = (pointer.py + (dy.coerceIn(-1.0, 1.0) * w).toFloat()).coerceIn(0f, h - 1f)
        pointer.invalidate()
        if (pressing) touch(MotionEvent.ACTION_MOVE) else hover()
    }

    // A mouse moving over the page (its :hover and mousemove): no button down.
    private fun hover() {
        val now = SystemClock.uptimeMillis()
        val ev = mouseEvent(now, MotionEvent.ACTION_HOVER_MOVE, 0f, 0f)
        front().dispatchGenericMotionEvent(ev)
        ev.recycle()
    }

    private fun mouseEvent(at: Long, action: Int, vscroll: Float, hscroll: Float): MotionEvent {
        val props = arrayOf(MotionEvent.PointerProperties().apply {
            id = 0
            toolType = MotionEvent.TOOL_TYPE_MOUSE
        })
        val coords = arrayOf(MotionEvent.PointerCoords().apply {
            x = pointer.px
            y = pointer.py
            pressure = 0f
            size = 1f
            setAxisValue(MotionEvent.AXIS_VSCROLL, vscroll)
            setAxisValue(MotionEvent.AXIS_HSCROLL, hscroll)
        })
        return MotionEvent.obtain(at, at, action, 1, props, coords, 0, 0, 1f, 1f, 0, 0, InputDevice.SOURCE_MOUSE, 0)
    }

    // A click is a tap where the pointer is: every page and player takes a tap.
    private var pressDownAt = 0L
    private var pressing = false

    private fun touch(action: Int) {
        val now = SystemClock.uptimeMillis()
        if (action == MotionEvent.ACTION_DOWN) pressDownAt = now
        val props = arrayOf(MotionEvent.PointerProperties().apply {
            id = 0
            toolType = MotionEvent.TOOL_TYPE_FINGER
        })
        val coords = arrayOf(MotionEvent.PointerCoords().apply {
            x = pointer.px
            y = pointer.py
            pressure = 1f
            size = 1f
        })
        val ev = MotionEvent.obtain(pressDownAt, now, action, 1, props, coords, 0, 0, 1f, 1f, 0, 0, InputDevice.SOURCE_TOUCHSCREEN, 0)
        front().dispatchTouchEvent(ev)
        ev.recycle()
    }

    private fun click() {
        showPointer()
        if (pressing) return
        touch(MotionEvent.ACTION_DOWN)
        main.postDelayed({ touch(MotionEvent.ACTION_UP) }, CLICK_MS)
    }

    // Hold the button down to drag (a slider, a game's dragging), and let go.
    private fun press(down: Boolean) {
        showPointer()
        if (down && !pressing) {
            pressing = true
            touch(MotionEvent.ACTION_DOWN)
        } else if (!down && pressing) {
            pressing = false
            touch(MotionEvent.ACTION_UP)
        }
    }

    // The wheel. Down the page is negative on Android's scroll axis.
    private fun scroll(dx: Double, dy: Double) {
        showPointer()
        val w = stage.width.toDouble()
        val notch = if (Build.VERSION.SDK_INT >= 26) ViewConfiguration.get(this).scaledVerticalScrollFactor.toDouble() else 64.0 * resources.displayMetrics.density
        if (w <= 0.0 || notch <= 0.0) return
        val v = (-dy.coerceIn(-2.0, 2.0) * w / notch).toFloat()
        val hz = (dx.coerceIn(-2.0, 2.0) * w / notch).toFloat()
        val ev = mouseEvent(SystemClock.uptimeMillis(), MotionEvent.ACTION_SCROLL, v, hz)
        front().dispatchGenericMotionEvent(ev)
        ev.recycle()
    }

    // Keys: down true holds one (arrows and ⌫ repeat while held, as a keyboard's do), false lets go, null
    // presses it. A held key the phone never lets go of (a lost message) lets go by itself.
    private class Held(val code: Int, val downAt: Long, var until: Long, var repeats: Int = 0)

    private val held = HashMap<String, Held>()

    private fun key(code: Int, action: Int, downAt: Long, repeat: Int) {
        val now = SystemClock.uptimeMillis()
        val ev = KeyEvent(downAt, now, action, code, repeat, 0, KeyCharacterMap.VIRTUAL_KEYBOARD, 0, 0, InputDevice.SOURCE_KEYBOARD)
        front().dispatchKeyEvent(ev)
    }

    private fun kbd(name: String, down: Boolean?) {
        val code = keyCodeFor(name)
        if (code == KeyEvent.KEYCODE_UNKNOWN) return
        val now = SystemClock.uptimeMillis()
        val h = held[name]
        when (down) {
            null -> {
                if (h != null) return
                key(code, KeyEvent.ACTION_DOWN, now, 0)
                key(code, KeyEvent.ACTION_UP, now, 0)
            }
            true -> {
                if (h != null) {
                    h.until = now + HOLD_LIMIT_MS
                    return
                }
                val nh = Held(code, now, now + HOLD_LIMIT_MS)
                held[name] = nh
                key(code, KeyEvent.ACTION_DOWN, now, 0)
                main.postDelayed({ holdTick(name, nh) }, if (REPEATS.contains(name)) REPEAT_DELAY_MS else 1000L)
            }
            false -> release(name)
        }
    }

    private fun holdTick(name: String, h: Held) {
        if (held[name] !== h) return
        val now = SystemClock.uptimeMillis()
        if (now > h.until) {
            release(name)
            return
        }
        if (REPEATS.contains(name)) {
            h.repeats++
            key(h.code, KeyEvent.ACTION_DOWN, h.downAt, h.repeats)
            main.postDelayed({ holdTick(name, h) }, REPEAT_EVERY_MS)
        } else {
            main.postDelayed({ holdTick(name, h) }, 1000L)
        }
    }

    private fun release(name: String) {
        val h = held.remove(name) ?: return
        key(h.code, KeyEvent.ACTION_UP, h.downAt, 0)
    }

    /** Let go of every held key and the button (before the screen changes under them). */
    private fun letGo() {
        held.keys.toList().forEach { release(it) }
        if (pressing) {
            pressing = false
            touch(MotionEvent.ACTION_UP)
        }
    }

    // Typed text: each letter as a keyboard would send it; anything a keyboard can't (an emoji, a letter
    // this TV's keymap lacks) goes straight into the text field.
    private val keymap: KeyCharacterMap by lazy { KeyCharacterMap.load(KeyCharacterMap.VIRTUAL_KEYBOARD) }

    private fun type(text: String) {
        val target = front()
        var i = 0
        while (i < text.length) {
            val n = if (Character.isHighSurrogate(text[i]) && i + 1 < text.length) 2 else 1
            val part = text.substring(i, i + n)
            i += n
            val events = if (n == 1) keymap.getEvents(part.toCharArray()) else null
            if (events != null) {
                events.forEach { target.dispatchKeyEvent(it) }
            } else {
                target.evaluateJavascript("document.execCommand('insertText',false," + JSONObject.quote(part) + ")", null)
            }
        }
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
        // A hand on the TV's remote: the phone's pointer gets out of the way.
        if (pointer.visibility == View.VISIBLE) {
            main.removeCallbacks(hidePointer)
            pointer.visibility = View.GONE
        }
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
        val v = away
        if (v != null) {
            if (v.canGoBack()) v.goBack() else closeAway(true)
            return
        }
        val list = web.copyBackForwardList()
        val i = list.currentIndex
        val prev = if (i > 0) list.getItemAtIndex(i - 1)?.url else null
        if (prev != null) web.goBack() else goHome()
    }

    // Straight home to NostalGem: close the site over it, or (an older page that sent the TV itself
    // away) back to its page in this visit's history, or load it afresh.
    private fun goHome() {
        if (away != null) {
            closeAway(true)
            return
        }
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
        letGo()
        web.evaluateJavascript("window.NP && NP.suspend()", null)
        away?.onPause()
        web.onPause()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
        away?.onResume()
        hideSystemBars()
        web.evaluateJavascript("window.NP && NP.resume()", null)
    }

    override fun onDestroy() {
        main.removeCallbacksAndMessages(null)
        closeAway(false)
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

    /** The phone's pointer: a mouse arrow in NostalGem's colors, drawn over whatever is on screen. It never
     * takes a touch itself (it isn't clickable), and fades out when it hasn't moved for a few seconds. */
    private class PointerView(context: Context) : View(context) {
        var px = -1f
        var py = -1f
        private val k = 1.15f * context.resources.displayMetrics.density
        private val arrow = Path().apply {
            // 24 × 32 units, the tip at (2, 2): the same arrow as the page's own (css/app.css .pointer)
            moveTo(2f, 2f)
            lineTo(2f, 26f)
            lineTo(8.4f, 19.8f)
            lineTo(12.9f, 30.1f)
            lineTo(17f, 28.3f)
            lineTo(12.6f, 18.3f)
            lineTo(21f, 18.3f)
            close()
        }
        private val glow = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.argb(170, 255, 42, 109)
            style = Paint.Style.STROKE
            strokeWidth = 5f
            strokeJoin = Paint.Join.ROUND
        }
        private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            style = Paint.Style.FILL
        }
        private val edge = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.rgb(13, 2, 33)
            style = Paint.Style.STROKE
            strokeWidth = 1.6f
            strokeJoin = Paint.Join.ROUND
        }

        init {
            isClickable = false
            isFocusable = false
            visibility = View.GONE
        }

        override fun onDraw(canvas: Canvas) {
            if (px < 0f) return
            canvas.save()
            canvas.translate(px - 2f * k, py - 2f * k)
            canvas.scale(k, k)
            canvas.drawPath(arrow, glow)
            canvas.drawPath(arrow, fill)
            canvas.drawPath(arrow, edge)
            canvas.restore()
        }
    }

    companion object {
        const val APP_HOST = WebViewAssetLoader.DEFAULT_DOMAIN
        const val SITE_HOST = "theupdoge.github.io"
        const val SITE_PATH = "/Nostalgem/"
        const val SITE_URL = "https://$SITE_HOST$SITE_PATH?tv=android"
        const val SITE_TIMEOUT_MS = 15000L
        const val SELECT_HOLD_MS = 1500L
        const val POINTER_HIDE_MS = 4000L
        const val CLICK_MS = 40L
        const val HOLD_LIMIT_MS = 8000L
        const val REPEAT_DELAY_MS = 400L
        const val REPEAT_EVERY_MS = 60L

        /** Held keys that repeat, as a keyboard's do. */
        val REPEATS = setOf("ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Backspace", "Delete")

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

        /** The phone's keys (js/link.js KBD_KEYS) as Android key codes: a keyboard's, which the page reads
         * as ArrowUp, Enter, Escape … and letters. */
        fun keyCodeFor(name: String): Int = when (name) {
            "ArrowUp" -> KeyEvent.KEYCODE_DPAD_UP
            "ArrowDown" -> KeyEvent.KEYCODE_DPAD_DOWN
            "ArrowLeft" -> KeyEvent.KEYCODE_DPAD_LEFT
            "ArrowRight" -> KeyEvent.KEYCODE_DPAD_RIGHT
            "Enter" -> KeyEvent.KEYCODE_ENTER
            "Escape" -> KeyEvent.KEYCODE_ESCAPE
            " " -> KeyEvent.KEYCODE_SPACE
            "Tab" -> KeyEvent.KEYCODE_TAB
            "Backspace" -> KeyEvent.KEYCODE_DEL
            "Delete" -> KeyEvent.KEYCODE_FORWARD_DEL
            "Home" -> KeyEvent.KEYCODE_MOVE_HOME
            "End" -> KeyEvent.KEYCODE_MOVE_END
            "PageUp" -> KeyEvent.KEYCODE_PAGE_UP
            "PageDown" -> KeyEvent.KEYCODE_PAGE_DOWN
            else -> {
                val c = if (name.length == 1) name[0] else ' '
                when (c) {
                    in 'a'..'z' -> KeyEvent.KEYCODE_A + (c - 'a')
                    in '0'..'9' -> KeyEvent.KEYCODE_0 + (c - '0')
                    else -> KeyEvent.KEYCODE_UNKNOWN
                }
            }
        }
    }
}
