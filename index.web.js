// Web entry: Skia draws with CanvasKit, which has to load before any module
// that imports Skia is evaluated. The routes are required only once it is
// ready, which is why this entry does not import them at the top.
import '@expo/metro-runtime';
import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';

// canvaskit-wasm in package-lock.json. The web build is a preview, so the binary comes from the CDN.
const CANVASKIT_VERSION = '0.41.0';

function start() {
  const { App } = require('expo-router/build/qualified-entry');
  const { renderRootComponent } = require('expo-router/build/renderRootComponent');
  renderRootComponent(App);
}

LoadSkiaWeb({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/canvaskit-wasm@${CANVASKIT_VERSION}/bin/full/${file}`,
}).then(start, start);
