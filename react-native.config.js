/** v1: tắt Skia native trên Android — tránh crash khi mở app (panel nâng cao dùng fallback View). */
module.exports = {
  dependencies: {
    '@shopify/react-native-skia': {
      platforms: {
        android: null,
        ios: null,
      },
    },
  },
};
