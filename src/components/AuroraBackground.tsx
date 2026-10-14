import React from 'react';
import { StyleSheet, View, StyleProp, ViewStyle } from 'react-native';
import { COLORS } from '../theme/theme';

export function AuroraBackground({
  style,
  children,
}: {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  return (
    <View style={[styles.container, style]}>
      {children}
    </View>
  );
}

export default React.memo(AuroraBackground);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
});



