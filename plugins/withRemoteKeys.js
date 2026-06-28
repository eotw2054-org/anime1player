// Expo config plugin：將遙控／D-pad／滑鼠滾輪嘅原生鍵盤處理注入 MainActivity.kt。
// android/ 係 gitignored 兼每次 `expo prebuild --clean` 會重生，所以靠呢個 plugin
// 每次 prebuild 自動注入，唔會再因 prebuild 整冇咗（之前手改 MainActivity 就係咁失咗）。
//
// 行為：
//   onKeyDown        → 向 JS 發 DeviceEventEmitter 'hwKey'（up/down/left/right/ok），
//                      全螢幕 overlay 靠呢個事件做 播放/暫停、上下集、快進退。
//   onGenericMotionEvent → 空中滑鼠滾輪轉成 D-pad 上/下（focus 導航 + 全螢幕上下集）。
const { withMainActivity } = require('expo/config-plugins');

const IMPORTS = `import android.view.KeyEvent
import android.view.MotionEvent
import android.view.InputDevice
import com.facebook.react.ReactApplication
import com.facebook.react.modules.core.DeviceEventManagerModule`;

const METHODS = `
  private fun emitHwKey(name: String) {
    try {
      val reactContext = (application as ReactApplication).reactHost?.currentReactContext
      reactContext
        ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        ?.emit("hwKey", name)
    } catch (e: Exception) {}
  }

  override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
    val name = when (keyCode) {
      KeyEvent.KEYCODE_DPAD_UP -> "up"
      KeyEvent.KEYCODE_DPAD_DOWN -> "down"
      KeyEvent.KEYCODE_DPAD_LEFT -> "left"
      KeyEvent.KEYCODE_DPAD_RIGHT -> "right"
      KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER, KeyEvent.KEYCODE_BUTTON_A -> "ok"
      else -> null
    }
    if (name != null) emitHwKey(name)
    return super.onKeyDown(keyCode, event)
  }

  override fun onGenericMotionEvent(event: MotionEvent): Boolean {
    if ((event.source and InputDevice.SOURCE_CLASS_POINTER) != 0 && event.action == MotionEvent.ACTION_SCROLL) {
      val v = event.getAxisValue(MotionEvent.AXIS_VSCROLL)
      if (v != 0f) {
        val code = if (v < 0f) KeyEvent.KEYCODE_DPAD_DOWN else KeyEvent.KEYCODE_DPAD_UP
        dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, code))
        dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_UP, code))
        return true
      }
    }
    return super.onGenericMotionEvent(event)
  }
`;

module.exports = function withRemoteKeys(config) {
  return withMainActivity(config, (cfg) => {
    if (cfg.modResults.language !== 'kt') {
      throw new Error('withRemoteKeys: 預期 Kotlin MainActivity，搵到 ' + cfg.modResults.language);
    }
    let src = cfg.modResults.contents;

    if (!src.includes('DeviceEventManagerModule')) {
      src = src.replace(/(^package .+\n)/m, `$1\n${IMPORTS}\n`);
    }
    if (!src.includes('fun emitHwKey')) {
      const idx = src.lastIndexOf('}');
      src = src.slice(0, idx) + METHODS + '}\n';
    }

    cfg.modResults.contents = src;
    return cfg;
  });
};
