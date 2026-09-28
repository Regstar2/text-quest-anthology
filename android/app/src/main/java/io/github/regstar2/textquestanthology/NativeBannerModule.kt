package io.github.regstar2.textquestanthology

import android.view.View
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ReactShadowNode
import com.facebook.react.uimanager.ViewManager
import kotlin.math.roundToInt

class NativeBannerModule(
    reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
    override fun getName(): String = "NativeBannerController"

    override fun getConstants(): MutableMap<String, Any> =
        mutableMapOf(
            "distribution" to BuildConfig.YANDEX_AD_DISTRIBUTION,
            "bannerAdUnitId" to BuildConfig.YANDEX_BANNER_AD_UNIT_ID,
            "interstitialAdUnitId" to BuildConfig.YANDEX_INTERSTITIAL_AD_UNIT_ID,
        )

    @ReactMethod
    fun setVisible(
        visible: Boolean,
        adUnitId: String,
        maxHeightDp: Double,
    ) {
        MainActivity.withActiveActivity { activity ->
            activity.setNativeBannerVisible(
                visible = visible,
                adUnitId = adUnitId,
                maxHeightDp = maxHeightDp.roundToInt(),
            )
        }
    }
}

class NativeBannerPackage : ReactPackage {
    override fun createNativeModules(
        reactContext: ReactApplicationContext,
    ): MutableList<NativeModule> =
        listOf(NativeBannerModule(reactContext)).toMutableList()

    override fun createViewManagers(
        reactContext: ReactApplicationContext,
    ): MutableList<ViewManager<View, ReactShadowNode<*>>> = mutableListOf()
}
