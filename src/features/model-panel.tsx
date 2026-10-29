import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import type { TierId } from '../adapters/catalog';
import { DEFAULT_RESERVE_BYTES, type DownloadState, type OnDeviceModel, type TierOption } from '../adapters/model';
import { useI18n, type Messages, type NumberFormatter } from '../i18n';
import { Button, Card, Chip, Row, textStyles } from '../ui/primitives';
import { tokens, type Tone } from '../ui/tokens';
import { useOnDeviceModel } from './use-on-device-model';

type ModelMessages = Messages['model'];

/** Sizes in decimal units, as Android's storage settings show them. */
function formatBytes(bytes: number, format: NumberFormatter, units: ModelMessages['units']): string {
  if (bytes >= 1e9) {
    return units.gb(format.number(bytes / 1e9, 1));
  }
  return units.mb(format.number(Math.max(1, Math.round(bytes / 1e6)), 0));
}

function progressPercent(state: DownloadState): number | null {
  if (state.status === 'downloading' || state.status === 'paused') {
    return state.total > 0 ? Math.min(100, Math.floor((state.bytes / state.total) * 100)) : 0;
  }
  if (state.status === 'failed' && state.bytes > 0) {
    return Math.min(100, Math.floor((state.bytes / state.total) * 100));
  }
  return state.status === 'verifying' ? 100 : null;
}

function statusText(state: DownloadState, t: ModelMessages, size: (bytes: number) => string, format: NumberFormatter): string {
  switch (state.status) {
    case 'absent':
      return t.status.absent;
    case 'downloading':
      return t.status.downloading(size(state.bytes), size(state.total), format.percent(progressPercent(state) ?? 0));
    case 'paused':
      return t.status.paused[state.reason](size(state.bytes), size(state.total));
    case 'verifying':
      return t.status.verifying;
    case 'ready':
      return t.status.ready;
    case 'failed': {
      const message = t.status.failed[state.error];
      return typeof message === 'function' ? message(size(state.total - state.bytes + DEFAULT_RESERVE_BYTES)) : message;
    }
  }
}

function statusTone(state: DownloadState): Tone {
  switch (state.status) {
    case 'ready':
      return 'success';
    case 'failed':
      return state.error === 'checksum' || state.error === 'storage' ? 'danger' : 'warning';
    case 'paused':
      return 'warning';
    default:
      return 'neutral';
  }
}

function TierChoice({
  label,
  description,
  selected,
  enabled,
  chips,
  onPress,
}: {
  label: string;
  description: string;
  selected: boolean;
  enabled: boolean;
  chips: { label: string; tone: Tone }[];
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        selected ? styles.choiceSelected : null,
        !enabled ? styles.choiceDisabled : null,
        pressed ? styles.pressed : null,
      ]}>
      <View style={styles.choiceHeader}>
        <View style={[styles.radio, selected ? styles.radioSelected : null]}>{selected ? <View style={styles.radioDot} /> : null}</View>
        <Text style={[styles.choiceLabel, selected ? styles.choiceLabelSelected : null]}>{label}</Text>
      </View>
      <Text style={styles.choiceText}>{description}</Text>
      {chips.length > 0 ? (
        <View style={styles.chips}>
          {chips.map((chip) => (
            <Chip key={chip.label} label={chip.label} tone={chip.tone} />
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

function ModelActions({ model, option, t, size }: { model: OnDeviceModel; option: TierOption; t: ModelMessages; size: (bytes: number) => string }) {
  const state = option.download;
  const confirmDelete = () => {
    Alert.alert(t.confirmDelete.title, t.confirmDelete.message(size(option.downloadBytes)), [
      { text: t.confirmDelete.keep, style: 'cancel' },
      { text: t.confirmDelete.confirm, style: 'destructive', onPress: () => void model.deleteModel() },
    ]);
  };
  switch (state.status) {
    case 'absent':
      return <Button label={t.buttons.download(size(option.downloadBytes))} onPress={() => void model.download()} />;
    case 'downloading':
      return (
        <View style={styles.buttons}>
          <Button label={t.buttons.pause} tone="neutral" onPress={() => void model.pause()} />
          <Button label={t.buttons.cancel} tone="warning" onPress={() => model.cancel()} />
        </View>
      );
    case 'paused':
      return (
        <View style={styles.buttons}>
          <Button label={t.buttons.resume} onPress={() => void model.download()} />
          <Button label={t.buttons.cancel} tone="warning" onPress={() => model.cancel()} />
        </View>
      );
    case 'verifying':
      return null;
    case 'ready':
      return <Button label={t.buttons.delete} tone="danger" onPress={confirmDelete} />;
    case 'failed':
      return (
        <View style={styles.buttons}>
          <Button label={t.buttons.retry} onPress={() => void model.download()} />
          {state.bytes > 0 ? <Button label={t.buttons.cancel} tone="warning" onPress={() => model.cancel()} /> : null}
        </View>
      );
  }
}

/**
 * Settings of the on device language model: the tier for the phone's memory,
 * the one time download of its model, and what runs when there is none.
 */
export function ModelPanel() {
  const { messages: m, format } = useI18n();
  const { model, snapshot } = useOnDeviceModel();
  const t = m.model;
  const size = (bytes: number) => formatBytes(bytes, format, t.units);
  const memory = (megabytes: number) => t.units.gb(format.number(megabytes / 1024));
  const tierName = (id: TierId) => t.tiers[id].name;
  const active = snapshot.options.find((option) => option.tier.id === snapshot.tier);
  const asset = active?.model ?? null;
  const percent = active ? progressPercent(active.download) : null;

  const chipsFor = (option: TierOption) => {
    const chips: { label: string; tone: Tone }[] = [];
    if (option.tier.id === snapshot.recommended) chips.push({ label: t.chips.recommended, tone: 'accent' });
    if (option.download.status === 'ready') chips.push({ label: t.chips.downloaded, tone: 'success' });
    if (option.download.status === 'paused' || (option.download.status === 'failed' && option.download.bytes > 0)) {
      chips.push({ label: t.chips.partial, tone: 'warning' });
    }
    if (!option.fits) chips.push({ label: t.chips.needsMemory(memory(option.tier.minDeviceRamMb)), tone: 'neutral' });
    return chips;
  };

  return (
    <Card title={t.title} caption={t.caption} right={<Chip label={tierName(snapshot.tier)} tone={snapshot.tier === 'rules' ? 'neutral' : 'accent'} />}>
      {snapshot.supported ? null : <Text style={textStyles.muted}>{t.unsupported}</Text>}
      <View style={styles.rows}>
        <Row label={t.rows.memory} value={snapshot.ramClassMb === null ? m.system.values.unknown : memory(snapshot.ramClassMb)} />
        <Row label={t.rows.recommended} value={tierName(snapshot.recommended)} />
      </View>

      <View style={styles.choices} accessibilityRole="radiogroup">
        <TierChoice
          label={t.auto(tierName(snapshot.recommended))}
          description={t.tiers[snapshot.recommended].description}
          selected={snapshot.choice === 'auto'}
          enabled
          chips={[]}
          onPress={() => model.selectTier('auto')}
        />
        {snapshot.options.map((option) => (
          <TierChoice
            key={option.tier.id}
            label={tierName(option.tier.id)}
            description={t.tiers[option.tier.id].description}
            selected={snapshot.choice === option.tier.id}
            enabled={option.fits}
            chips={chipsFor(option)}
            onPress={() => model.selectTier(option.tier.id)}
          />
        ))}
      </View>

      {active && asset?.file && snapshot.supported ? (
        <View style={styles.section}>
          <View style={styles.rows}>
            <Row label={t.rows.model} value={asset.label} />
            <Row label={t.rows.size} value={size(active.downloadBytes)} />
            <Row label={t.rows.peak} value={size(active.peakMemoryMb * 1024 * 1024)} />
            <Row label={t.rows.license} value={asset.file.license} />
          </View>
          <Text style={[styles.status, toneStyle(statusTone(active.download))]}>{statusText(active.download, t, size, format)}</Text>
          {percent !== null ? (
            <View
              style={styles.track}
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: percent }}>
              <View style={[styles.fill, { width: `${percent}%` }]} />
            </View>
          ) : null}
          {active.download.status === 'ready' ? <Text style={textStyles.muted}>{t.engine[snapshot.engine]}</Text> : null}
          <ModelActions model={model} option={active} t={t} size={size} />
          {active.download.status === 'ready' ? null : (
            <View style={styles.toggle}>
              <View style={styles.toggleText}>
                <Text style={styles.toggleLabel}>{t.cellular.label}</Text>
                <Text style={textStyles.muted}>{t.cellular.caption}</Text>
              </View>
              <Switch
                accessibilityLabel={t.cellular.label}
                value={snapshot.allowCellular}
                onValueChange={(allow) => model.setAllowCellular(allow)}
                trackColor={{ false: tokens.color.surfaceRaised, true: tokens.color.accentDeep }}
                thumbColor={snapshot.allowCellular ? tokens.color.accent : tokens.color.textMuted}
              />
            </View>
          )}
        </View>
      ) : null}

      <Text style={textStyles.muted}>{t.privacy}</Text>
    </Card>
  );
}

function toneStyle(tone: Tone) {
  switch (tone) {
    case 'success':
      return styles.success;
    case 'warning':
      return styles.warning;
    case 'danger':
      return styles.danger;
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  rows: { gap: tokens.space.sm },
  choices: { gap: tokens.space.sm },
  choice: {
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.space.md,
    gap: tokens.space.xs,
  },
  choiceSelected: { borderColor: tokens.color.accent, backgroundColor: tokens.color.accentSoft },
  choiceDisabled: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
  choiceHeader: { flexDirection: 'row', alignItems: 'center', gap: tokens.space.sm },
  radio: {
    width: 18,
    height: 18,
    borderRadius: tokens.radius.pill,
    borderWidth: 1.5,
    borderColor: tokens.color.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: tokens.color.accent },
  radioDot: { width: 8, height: 8, borderRadius: tokens.radius.pill, backgroundColor: tokens.color.accent },
  choiceLabel: { color: tokens.color.text, fontSize: 15, fontWeight: '600', flexShrink: 1 },
  choiceLabelSelected: { color: tokens.color.accent },
  choiceText: { color: tokens.color.textMuted, fontSize: tokens.font.size.caption, lineHeight: 17, paddingLeft: 26 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space.xs, paddingLeft: 26 },
  section: {
    gap: tokens.space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tokens.color.border,
    paddingTop: tokens.space.md,
  },
  status: { color: tokens.color.text, fontSize: 14, lineHeight: 20 },
  success: { color: tokens.color.success },
  warning: { color: tokens.color.warning },
  danger: { color: tokens.color.danger },
  track: { height: 6, borderRadius: tokens.radius.pill, backgroundColor: tokens.color.surfaceRaised, overflow: 'hidden' },
  fill: { height: 6, borderRadius: tokens.radius.pill, backgroundColor: tokens.color.accent },
  buttons: { gap: tokens.space.sm },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: tokens.space.md },
  toggleText: { flex: 1, gap: 2 },
  toggleLabel: { color: tokens.color.text, fontSize: 14, fontWeight: '600' },
});
