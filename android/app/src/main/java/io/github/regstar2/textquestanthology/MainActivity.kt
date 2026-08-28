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
import com.yandex.mobile.ads.banner.BannerAdSize
import com.yandex.mobile.ads.banner.BannerAdView
import com.yandex.mobile.ads.common.AdRequest
import java.lang.ref.WeakReference
import kotlin.math.roundToInt

class MainActivity : ReactActivity() {
    private var bannerContainer: FrameLayout? = null
    private var bannerAdView: BannerAdView? = null
    private var bannerAdUnitId: String? = null
    private var bannerMaxHeightDp: Int? = null

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

        bannerAdView?.destroy()
        bannerAdView = null
        bannerContainer = null
        super.onDestroy()
    }

    fun setNativeBannerVisible(
        visible: Boolean,
        adUnitId: String,
        maxHeightDp: Int,
    ) {
        runOnUiThread {
            if (isDestroyed) {
                return@runOnUiThread
            }

            if (visible) {
                ensureBanner(adUnitId, maxHeightDp)
                bannerContainer?.visibility = View.VISIBLE
            } else {
                bannerContainer?.visibility = View.INVISIBLE
            }
        }
    }

    private fun ensureBanner(adUnitId: String, maxHeightDp: Int) {
        val root = findViewById<FrameLayout>(android.R.id.content) ?: return
        val safeMaxHeightDp = maxHeightDp.coerceAtLeast(50)

        if (
            bannerAdView != null &&
            bannerAdUnitId == adUnitId &&
            bannerMaxHeightDp == safeMaxHeightDp
        ) {
            return
        }

        bannerAdView?.destroy()
        bannerAdView = null
        bannerContainer?.let(root::removeView)

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
        val adSize = BannerAdSize.inline(this, adWidthDp, safeMaxHeightDp)
        val banner = BannerAdView(this).apply {
            setAdSize(adSize)
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
        bannerMaxHeightDp = safeMaxHeightDp
    }

    companion object {
        private var activeActivity: WeakReference<MainActivity>? = null

        fun withActiveActivity(block: (MainActivity) -> Unit) {
            activeActivity?.get()?.let(block)
        }
    }
}
