import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Caught crash:', error, errorInfo);
  }

  handleReload = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.reload();
    } else {
      this.setState({ hasError: false, error: undefined });
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.subtitle}>
            Claimr encountered an unexpected error while loading.
          </Text>
          <TouchableOpacity
            style={styles.button}
            onPress={this.handleReload}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>Reload Claimr</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#EDEDEB',
    marginBottom: 8,
    textAlign: 'center',
    fontFamily: 'sans-serif',
  },
  subtitle: {
    fontSize: 14,
    color: '#86868B',
    textAlign: 'center',
    marginBottom: 24,
    maxWidth: 320,
    fontFamily: 'sans-serif',
    lineHeight: 20,
  },
  button: {
    backgroundColor: '#EDEDEB',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  buttonText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'sans-serif',
  },
});

