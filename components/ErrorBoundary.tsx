import { Component, type ErrorInfo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../constants/scoring';
import { vi } from '../constants/vi';

interface Props {
  children: ReactNode;
}

interface State {
  error: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('TradeScore crash:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.box}>
          <Text style={styles.title}>{vi.app.errorTitle}</Text>
          <Text style={styles.msg}>{this.state.error}</Text>
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
  },
  title: {
    color: COLORS.bearish,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  msg: {
    color: COLORS.textSecondary,
    fontSize: 12,
    textAlign: 'center',
  },
});
