import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../constants/scoring';
import { vi } from '../constants/vi';

interface Props {
  children: ReactNode;
  /** Extra context logged on catch (e.g. "SignalBoard scan results"). */
  scope?: string;
  /** Optional custom title when an error is caught. */
  fallbackTitle?: string;
}

interface State {
  error: string | null;
}

/**
 * Catches render crashes (e.g. undefined.charAt during scan card render)
 * and shows a friendly panel instead of a blank / red screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error: error?.message || String(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const scope = this.props.scope ? `[${this.props.scope}] ` : '';
    console.error(`TradeScore crash: ${scope}`, error, info.componentStack);
  }

  private handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <View style={styles.box}>
          <Text style={styles.title}>
            {this.props.fallbackTitle ?? vi.app.errorTitle}
          </Text>
          <Text style={styles.msg}>{this.state.error}</Text>
          <Text style={styles.hint}>
            Thử quét lại hoặc chọn tab khác. Nếu lỗi lặp lại, gửi log console.
          </Text>
          <Pressable
            onPress={this.handleRetry}
            style={({ pressed }) => [styles.retryBtn, pressed && styles.retryBtnPressed]}
            accessibilityRole="button"
          >
            <Text style={styles.retryText}>Thử lại</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  box: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 10,
    minHeight: 160,
  },
  title: {
    color: COLORS.bearish,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  msg: {
    color: COLORS.textSecondary,
    fontSize: 12,
    textAlign: 'center',
  },
  hint: {
    color: COLORS.textMuted,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4,
  },
  retryBtn: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  retryBtnPressed: {
    opacity: 0.8,
  },
  retryText: {
    color: COLORS.accent,
    fontSize: 13,
    fontWeight: '600',
  },
});
