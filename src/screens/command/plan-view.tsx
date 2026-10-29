import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { describeNotice, describePlan, describeStep, useDescribeContext, useI18n } from '../../i18n';
import type { PlanOutcome } from '../../sigil-core';
import { StatusChip, Tag } from '../../ui/chip';
import { color, continuous, type StatusTone } from '../../ui/theme';
import { Txt } from '../../ui/type';
import { registry } from '../shared';

function outcomeTone(outcome: PlanOutcome): StatusTone {
  switch (outcome.status) {
    case 'planned':
      return 'success';
    case 'clarify':
      return 'info';
    case 'blocked':
      return 'danger';
    default:
      return 'warning';
  }
}

/** A dry run plan: its status, one line for the whole plan and the numbered steps, with the confirmations marked. */
export function PlanView({ outcome, request }: { outcome: PlanOutcome; request: string }) {
  const { messages: m } = useI18n();
  const ctx = useDescribeContext(registry);
  const t = m.ui.command;
  const planned = outcome.status === 'planned' ? outcome.plan : null;
  const message =
    outcome.status === 'planned' ? '' : outcome.status === 'clarify' ? outcome.question : describeNotice(outcome.notice, ctx);

  return (
    <Animated.View entering={FadeInDown.duration(240)} style={[styles.card, continuous]}>
      <View style={styles.head}>
        <StatusChip tone={outcomeTone(outcome)} label={t.status[outcome.status] ?? outcome.status} />
        {planned ? <Tag label={t.source[planned.source] ?? planned.source} /> : null}
      </View>
      <Txt variant="footnote" tone="tertiary" numberOfLines={2}>
        {m.quote(request)}
      </Txt>
      {planned ? (
        <>
          <Txt variant="title3">{describePlan(planned, ctx)}</Txt>
          <View style={styles.steps}>
            {planned.steps.map((step, index) => {
              const asks = step.kind === 'confirm';
              return (
                <View key={`${index}-${step.kind}`} style={styles.step}>
                  <Txt variant="mono" tone={asks ? 'warning' : 'tertiary'} style={styles.number}>
                    {String(index + 1).padStart(2, '0')}
                  </Txt>
                  <View style={styles.stepText}>
                    <Txt variant="callout" tone={asks ? 'warning' : 'primary'}>
                      {describeStep(step, ctx, planned, index)}
                    </Txt>
                    {asks ? <Tag label={t.asksFirst} icon="confirm-action" /> : null}
                  </View>
                </View>
              );
            })}
          </View>
          <Txt variant="monoTag" tone="tertiary">
            {t.steps(planned.steps.length)}
          </Txt>
        </>
      ) : (
        <Txt variant="callout" tone="secondary">
          {message}
        </Txt>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    gap: 10,
    borderRadius: 20,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairlineStrong,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  steps: { gap: 10, marginTop: 4 },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  number: { width: 22, paddingTop: 2 },
  stepText: { flex: 1, gap: 6 },
});
