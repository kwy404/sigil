import { describeFailure, describeStep, type DescribeContext } from '../i18n';
import type { ExecutionResult, Plan } from '../sigil-core';

/** One line on how a run ended, in the app language. */
export function resultText(result: ExecutionResult, plan: Plan, ctx: DescribeContext): string {
  const { m } = ctx;
  if (result.status === 'completed') {
    return m.planner.result.completed;
  }
  const step = plan.steps[result.completedSteps];
  const reason = describeFailure(result, step, ctx);
  if (reason) {
    return reason;
  }
  if (result.permission) {
    return result.permission === 'write_settings' ? m.system.access.brightness : m.system.access.media;
  }
  if (result.status === 'cancelled') {
    return m.planner.result.cancelled;
  }
  if (result.status === 'refused') {
    return m.planner.result.refused;
  }
  return m.planner.result.failed(step ? describeStep(step, ctx, plan, result.completedSteps) : '');
}

