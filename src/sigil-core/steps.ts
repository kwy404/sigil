import type { GlobalAction, MediaAction } from '../app-profiles/schema';
import type { Direction } from '../gesture-engine/gestures';

/** How a step finds a control in the active window. */
export type StepTarget =
  | { by: 'selector'; app: string; name: string }
  | { by: 'text'; value: string }
  | { by: 'description'; value: string }
  | { by: 'focused' };

export type ConfirmReason = 'send' | 'post' | 'commit';

/**
 * One step of a plan. Plans are flat lists with no loops or branches, so every
 * plan is finite and can be shown to the user before it runs.
 */
export type PlanStep =
  | { kind: 'open_app'; app: string; label: string; packageName?: string; url?: string }
  | { kind: 'wait'; until: { app: string } | { target: StepTarget }; timeoutMs: number }
  | { kind: 'find'; target: StepTarget; scroll: boolean; timeoutMs: number }
  | { kind: 'tap'; target: StepTarget; commit: boolean }
  | { kind: 'type'; text: string; target: StepTarget; submit: boolean }
  | { kind: 'scroll'; direction: Direction }
  | { kind: 'navigate'; action: GlobalAction }
  | { kind: 'media'; action: MediaAction }
  | { kind: 'confirm'; summary: string; reason: ConfirmReason };

export type StepKind = PlanStep['kind'];

export function describeTarget(target: StepTarget): string {
  switch (target.by) {
    case 'selector':
      return `${target.name} in ${target.app}`;
    case 'text':
      return `"${target.value}"`;
    case 'description':
      return `the ${target.value} control`;
    case 'focused':
      return 'the focused field';
  }
}

/** One line description of a step, shown while the plan runs. */
export function describeStep(step: PlanStep): string {
  switch (step.kind) {
    case 'open_app':
      return `Open ${step.label}`;
    case 'wait':
      return 'app' in step.until ? `Wait for ${step.until.app}` : `Wait for ${describeTarget(step.until.target)}`;
    case 'find':
      return `Find ${describeTarget(step.target)}${step.scroll ? ', scrolling if needed' : ''}`;
    case 'tap':
      return `Tap ${describeTarget(step.target)}`;
    case 'type':
      return `Type "${step.text}"${step.submit ? ' and submit' : ''}`;
    case 'scroll':
      return `Scroll ${step.direction}`;
    case 'navigate':
      return `Go ${step.action.replace('_', ' ')}`;
    case 'media':
      return step.action === 'play_pause' ? 'Play or pause' : `${step.action === 'next' ? 'Next' : 'Previous'} track`;
    case 'confirm':
      return `Ask: ${step.summary}`;
  }
}
