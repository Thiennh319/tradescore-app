import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

/** Block web keyboard shortcuts while trade app is disabled (interaction lock only). */
export function useTradeAppKeyboardLock(locked: boolean): void {
  useEffect(() => {
    if (!locked || Platform.OS !== 'web') return;

    const blockKeys = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener('keydown', blockKeys, true);
    window.addEventListener('keyup', blockKeys, true);
    return () => {
      window.removeEventListener('keydown', blockKeys, true);
      window.removeEventListener('keyup', blockKeys, true);
    };
  }, [locked]);
}

export function TradeAppDisabledOverlay() {
  return (
    <View
      style={styles.overlay}
      pointerEvents="auto"
      accessibilityViewIsModal
      importantForAccessibility="yes"
    />
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.72)',
    zIndex: 5000,
    elevation: 5000,
  },
});
