import React from 'react';
import { Modal, ModalProps, Platform, View, StyleSheet } from 'react-native';

/**
 * ContainedModal:
 * - On iOS/Android: uses native Modal with complete platform fidelity.
 * - On Web (Mobile Preview chassis or desktop browser): renders in-place inside
 *   the component's container hierarchy using StyleSheet.absoluteFillObject
 *   instead of portaling to document.body. This prevents modal sheets, filter
 *   dialogs, and sort popovers from breaking out of the mobile frame onto the desktop screen.
 */
export const ContainedModal: React.FC<ModalProps> = ({
  visible,
  children,
  animationType,
  transparent,
  onRequestClose,
  ...rest
}) => {
  if (Platform.OS !== 'web') {
    return (
      <Modal
        visible={visible}
        animationType={animationType}
        transparent={transparent}
        onRequestClose={onRequestClose}
        {...rest}
      >
        {children}
      </Modal>
    );
  }

  if (!visible) return null;

  return (
    <View
      style={[
        StyleSheet.absoluteFill as any,
        {
          zIndex: 99999,
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          height: '100%',
          overflow: 'hidden',
        },
      ]}
      pointerEvents="box-none"
    >
      {children}
    </View>
  );
};

export default ContainedModal;
