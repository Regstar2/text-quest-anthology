package io.github.regstar2.textquestanthology

import android.content.Context
import android.view.View
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ReactShadowNode
import com.facebook.react.uimanager.ViewManager

private const val STORAGE_NAME = "story_saves"

class StorySaveStorageModule(
    reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
    private val preferences = reactContext.getSharedPreferences(
        STORAGE_NAME,
        Context.MODE_PRIVATE,
    )

    override fun getName(): String = "StorySaveStorage"

    @ReactMethod
    fun getItem(key: String, promise: Promise) {
        try {
            promise.resolve(preferences.getString(key, null))
        } catch (error: Exception) {
            promise.reject(
                "STORY_SAVE_READ_FAILED",
                "Failed to read local story save.",
                error,
            )
        }
    }

    @ReactMethod
    fun setItem(key: String, value: String, promise: Promise) {
        try {
            val committed = preferences.edit().putString(key, value).commit()

            if (!committed) {
                promise.reject(
                    "STORY_SAVE_WRITE_FAILED",
                    "Android refused to commit the local story save.",
                )
                return
            }

            promise.resolve(null)
        } catch (error: Exception) {
            promise.reject(
                "STORY_SAVE_WRITE_FAILED",
                "Failed to write local story save.",
                error,
            )
        }
    }

    @ReactMethod
    fun removeItem(key: String, promise: Promise) {
        try {
            val committed = preferences.edit().remove(key).commit()

            if (!committed) {
                promise.reject(
                    "STORY_SAVE_DELETE_FAILED",
                    "Android refused to delete the local story save.",
                )
                return
            }

            promise.resolve(null)
        } catch (error: Exception) {
            promise.reject(
                "STORY_SAVE_DELETE_FAILED",
                "Failed to delete local story save.",
                error,
            )
        }
    }
}

class StorySavePackage : ReactPackage {
    override fun createNativeModules(
        reactContext: ReactApplicationContext,
    ): MutableList<NativeModule> =
        listOf(StorySaveStorageModule(reactContext)).toMutableList()

    override fun createViewManagers(
        reactContext: ReactApplicationContext,
    ): MutableList<ViewManager<View, ReactShadowNode<*>>> = mutableListOf()
}
