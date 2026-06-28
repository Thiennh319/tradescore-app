const { withAndroidManifest } = require('@expo/config-plugins');

const FG_SERVICE = 'com.asterinet.react.bgactions.RNBackgroundActionsTask';

function ensurePermission(permissions, name) {
  if (!permissions.some((p) => p.$?.['android:name'] === name)) {
    permissions.push({ $: { 'android:name': name } });
  }
}

function withBackgroundScanService(config) {
  return withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;
    manifest['uses-permission'] = manifest['uses-permission'] ?? [];
    ensurePermission(manifest['uses-permission'], 'android.permission.FOREGROUND_SERVICE');
    ensurePermission(
      manifest['uses-permission'],
      'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
    );

    const application = manifest.application?.[0];
    if (!application) return modConfig;

    application.service = application.service ?? [];
    const existing = application.service.find((s) => s.$?.['android:name'] === FG_SERVICE);
    if (existing) {
      existing.$['android:foregroundServiceType'] = 'dataSync';
      existing.$['android:exported'] = 'false';
    } else {
      application.service.push({
        $: {
          'android:name': FG_SERVICE,
          'android:foregroundServiceType': 'dataSync',
          'android:exported': 'false',
        },
      });
    }

    return modConfig;
  });
}

module.exports = withBackgroundScanService;
