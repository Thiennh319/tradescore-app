/**
 * Node preload: stub RN AsyncStorage so V4 services can load under tsx
 * without transforming react-native source.
 *
 * Usage:
 *   node --require ./scripts/node-async-storage-shim.cjs --import tsx scripts/backtest-v4-near-90d.ts
 */
const Module = require('module');

const asyncStorageStub = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
  clear: async () => {},
  getAllKeys: async () => [],
  multiGet: async (keys) => keys.map((k) => [k, null]),
  multiSet: async () => {},
  multiRemove: async () => {},
};

const rnWebStub = {
  Platform: {
    OS: 'web',
    select: (spec) => spec.web ?? spec.native ?? spec.default,
  },
  StyleSheet: { create: (s) => s },
  View: 'div',
  Text: 'span',
  Image: 'img',
  ScrollView: 'div',
  Dimensions: { get: () => ({ width: 1280, height: 720 }) },
  NativeModules: {},
  TurboModuleRegistry: { getEnforcing: () => ({}) },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (
    request === '@react-native-async-storage/async-storage' ||
    request.includes('@react-native-async-storage/async-storage')
  ) {
    return { ...asyncStorageStub, default: asyncStorageStub };
  }
  if (request === 'react-native' || request === 'react-native/index') {
    try {
      return originalLoad.call(this, 'react-native-web', parent, isMain);
    } catch {
      return { ...rnWebStub, default: rnWebStub };
    }
  }
  return originalLoad.apply(this, arguments);
};
