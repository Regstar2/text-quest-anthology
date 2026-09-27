package io.github.regstar2.textquestanthology

import android.view.View
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.uimanager.ReactShadowNode
import com.facebook.react.uimanager.ViewManager

class NativeBannerModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
    override fun getName(): String = "NativeBannerController"

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
    fun addListener(eventName: String) = Unit

    @ReactMethod
    fun removeListeners(count: Double) = Unit

    private fun emitState(state: String, heightDp: Int) {
        val payload = Arguments.createMap().apply {
            putString("state", state)
            putInt("heightDp", heightDp)
        }
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(EVENT_NAME, payload)
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
