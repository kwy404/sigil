import { View, StyleSheet } from 'react-native';

import { ModelPanel } from '../../features/model-panel';
import { GUTTER } from '../../ui/theme';

/**
 * The on device model section: the model panel (tiers, download, memory),
 * kept as it is and framed by the page.
 */
export function ModelSlot() {
  return (
    <View style={styles.panel}>
      <ModelPanel />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { paddingHorizontal: GUTTER },
});
