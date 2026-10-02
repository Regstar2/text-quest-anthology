package io.github.regstar2.textquestanthology

import android.view.View
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.uimanager.ReactShadowNode
import com.facebook.react.uimanager.ViewManager

class NativeBannerModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
    private var lastState: String = "hidden"
    private var lastHeightDp: Int = 0

    override fun getName(): String = "NativeBannerController"

    override fun getConstants(): MutableMap<String, Any> =
        mutableMapOf(
            "distribution" to BuildConfig.YANDEX_AD_DISTRIBUTION,
            "bannerAdUnitId" to BuildConfig.YANDEX_BANNER_AD_UNIT_ID,
            "interstitialAdUnitId" to BuildConfig.YANDEX_INTERSTITIAL_AD_UNIT_ID,
        )

    @ReactMethod
    fun prepare(adUnitId: String) {
        MainActivity.withActiveActivity { activity ->
            activity.prepareNativeBanner(adUnitId, ::emitState)
        }
    }

    @ReactMethod
    fun setVisible(visible: Boolean) {
        MainActivity.withActiveActivity { activity ->
            activity.setNativeBannerVisible(visible, ::emitState)
        }
    }

    @ReactMethod
    fun getState(promise: Promise) {
        promise.resolve(createStatePayload(lastState, lastHeightDp))
    }

    private fun emitState(state: String, heightDp: Int) {
        lastState = state
        lastHeightDp = heightDp
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(EVENT_NAME, createStatePayload(state, heightDp))
    }

    private fun createStatePayload(state: String, heightDp: Int) =
        Arguments.createMap().apply {
            putString("state", state)
            putInt("heightDp", heightDp)
        }

    companion object {
        const val EVENT_NAME = "NativeBannerStateChanged"
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
