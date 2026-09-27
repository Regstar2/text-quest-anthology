package io.github.regstar2.textquestanthology

import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.yandex.mobile.ads.banner.BannerAdEventListener
import com.yandex.mobile.ads.banner.BannerAdSize
import com.yandex.mobile.ads.banner.BannerAdView
import com.yandex.mobile.ads.common.AdRequest
import com.yandex.mobile.ads.common.AdRequestError
import com.yandex.mobile.ads.common.ImpressionData
import java.lang.ref.WeakReference
import kotlin.math.roundToInt

class MainActivity : ReactActivity() {
    private var bannerContainer: FrameLayout? = null
    private var bannerAdView: BannerAdView? = null
    private var bannerAdUnitId: String? = null
    private var bannerHeightDp: Int = 0
    private var bannerLoaded = false
    private var bannerFailed = false
    private var bannerRequestedVisible = false
    private var bannerEventSink: ((String, Int) -> Unit)? = null

    override fun getMainComponentName(): String = "TextQuestAnthology"

    override fun createReactActivityDelegate(): ReactActivityDelegate =
        DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        activeActivity = WeakReference(this)
    }

    override fun onResume() {
        super.onResume()
        activeActivity = WeakReference(this)
    }

    override fun onDestroy() {
        if (activeActivity?.get() === this) {
            activeActivity = null
        }

        bannerEventSink = null
        bannerAdView?.destroy()
        bannerAdView = null
        bannerContainer = null
        super.onDestroy()
    }

    fun prepareNativeBanner(
        adUnitId: String,
        eventSink: (String, Int) -> Unit,
    ) {
        runOnUiThread {
            if (isDestroyed) {
                return@runOnUiThread
            }

            bannerEventSink = eventSink
            ensureBanner(adUnitId)
        }
    }

    fun setNativeBannerVisible(
        visible: Boolean,
        eventSink: (String, Int) -> Unit,
    ) {
        runOnUiThread {
            if (isDestroyed) {
                return@runOnUiThread
            }

            bannerEventSink = eventSink
            bannerRequestedVisible = visible

            if (visible && bannerLoaded) {
                bannerContainer?.visibility = View.VISIBLE
                emitBannerState("shown")
            } else {
                bannerContainer?.visibility = View.INVISIBLE
                when {
                    !visible -> emitBannerState(
                        "hidden",
                        if (bannerLoaded) bannerHeightDp else 0,
                    )
                    bannerFailed -> emitBannerState("failed", 0)
                    else -> emitBannerState("loading", 0)
                }
            }
        }
    }

    private fun ensureBanner(adUnitId: String) {
        val root = findViewById<FrameLayout>(android.R.id.content) ?: return

        if (bannerAdView != null && bannerAdUnitId == adUnitId) {
            when {
                bannerLoaded -> emitBannerState("loaded")
                bannerFailed -> emitBannerState("failed", 0)
                else -> emitBannerState("loading", 0)
            }
            return
        }

        bannerAdView?.destroy()
        bannerAdView = null
        bannerContainer?.let(root::removeView)
        bannerLoaded = false
        bannerFailed = false
        bannerHeightDp = 0

        val container = FrameLayout(this).apply {
            visibility = View.INVISIBLE
            elevation = 1000f
            setOnApplyWindowInsetsListener { view, insets ->
                val layoutParams = view.layoutParams as FrameLayout.LayoutParams
                layoutParams.topMargin = insets.systemWindowInsetTop
                view.layoutParams = layoutParams
                insets
            }
        }
        root.addView(
            container,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.TOP,
            ),
        )
        container.requestApplyInsets()

        val displayMetrics = resources.displayMetrics
        val adWidthDp = (displayMetrics.widthPixels / displayMetrics.density)
            .roundToInt()
            .coerceAtLeast(1)
        val adSize = BannerAdSize.sticky(this, adWidthDp)
        bannerHeightDp = adSize.height

        val banner = BannerAdView(this).apply {
            setAdSize(adSize)
            setBannerAdEventListener(
                object : BannerAdEventListener {
                    override fun onAdLoaded() {
                        if (isDestroyed) {
                            bannerAdView?.destroy()
                            return
                        }

                        bannerLoaded = true
                        bannerFailed = false
                        if (bannerRequestedVisible) {
                            container.visibility = View.VISIBLE
                        }
                        emitBannerState("loaded")
                        if (bannerRequestedVisible) {
                            emitBannerState("shown")
                        }
                    }

                    override fun onAdFailedToLoad(adRequestError: AdRequestError) {
                        bannerLoaded = false
                        bannerFailed = true
                        container.visibility = View.INVISIBLE
                        emitBannerState("failed", 0)
                    }

                    override fun onAdClicked() = Unit

                    override fun onImpression(impressionData: ImpressionData?) = Unit
                },
            )
            loadAd(AdRequest.Builder(adUnitId).build())
        }

        container.addView(
            banner,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.TOP or Gravity.CENTER_HORIZONTAL,
            ),
        )

        bannerContainer = container
        bannerAdView = banner
        bannerAdUnitId = adUnitId
        emitBannerState("loading", 0)
    }

    private fun emitBannerState(
        state: String,
        heightDp: Int = bannerHeightDp,
    ) {
        bannerEventSink?.invoke(state, heightDp.coerceAtLeast(0))
    }

    companion object {
        private var activeActivity: WeakReference<MainActivity>? = null

        fun withActiveActivity(block: (MainActivity) -> Unit) {
            activeActivity?.get()?.let(block)
        }
    }
}
