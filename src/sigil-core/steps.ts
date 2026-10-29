import type { GlobalAction, MediaAction, SystemPanel, VolumeStream } from '../app-profiles/schema';
import type { Direction } from '../gesture-engine/gestures';

/** How a step finds a control in the active window. */
export type StepTarget =
  | { by: 'selector'; app: string; name: string }
  | { by: 'text'; value: string }
  | { by: 'description'; value: string }
  | { by: 'focused' };

export type ConfirmReason = 'send' | 'post' | 'commit';

export type VolumeAction = 'up' | 'down' | 'set' | 'mute' | 'unmute';
export type BrightnessAction = 'up' | 'down' | 'set';

/** A volume change. level is a percent and comes only with set. */
export interface VolumeCommand {
  stream: VolumeStream;
  action: VolumeAction;
  level?: number;
}

/** A brightness change. level is a percent of the system slider and comes only with set. */
export interface BrightnessCommand {
  action: BrightnessAction;
  level?: number;
}

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
  /** Moves the playing media by this many seconds, back when negative. */
  | { kind: 'seek'; seconds: number }
  | { kind: 'speed'; rate: number }
  | ({ kind: 'volume' } & VolumeCommand)
  | ({ kind: 'brightness' } & BrightnessCommand)
  | { kind: 'panel'; panel: SystemPanel }
  | { kind: 'sphere'; action: 'open' | 'close' }
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

const MEDIA_LABELS: Record<MediaAction, string> = {
  play_pause: 'Play or pause',
  play: 'Play',
  pause: 'Pause',
  next: 'Next track',
  previous: 'Previous track',
};

const STREAM_LABELS: Record<VolumeStream, string> = { media: 'media', ring: 'ring', alarm: 'alarm' };

const PANEL_LABELS: Record<SystemPanel, string> = {
  wifi: 'Wi-Fi',
  bluetooth: 'Bluetooth',
  do_not_disturb: 'Do Not Disturb',
};

export function describeVolume(command: VolumeCommand): string {
  const stream = STREAM_LABELS[command.stream];
  switch (command.action) {
    case 'up':
      return `Turn the ${stream} volume up`;
    case 'down':
      return `Turn the ${stream} volume down`;
    case 'set':
      return `Set the ${stream} volume to ${command.level ?? 0}%`;
    case 'mute':
      return `Mute the ${stream} volume`;
    case 'unmute':
      return `Unmute the ${stream} volume`;
  }
}

export function describeBrightness(command: BrightnessCommand): string {
  switch (command.action) {
    case 'up':
      return 'Turn the brightness up';
    case 'down':
      return 'Turn the brightness down';
    case 'set':
      return `Set the brightness to ${command.level ?? 0}%`;
  }
}

/**
 * One line English description of a step, for logs, tests and the model. The
 * screens show the translated descriptions of src/i18n.
 */
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
      return MEDIA_LABELS[step.action];
    case 'seek':
      return step.seconds >= 0 ? `Skip forward ${step.seconds} s` : `Skip back ${-step.seconds} s`;
    case 'speed':
      return `Play at ${step.rate}x speed`;
    case 'volume':
      return describeVolume(step);
    case 'brightness':
      return describeBrightness(step);
    case 'panel':
      return `Open the ${PANEL_LABELS[step.panel]} panel`;
    case 'sphere':
      return step.action === 'open' ? 'Open the Control Sphere' : 'Close the Control Sphere';
    case 'confirm':
      return `Ask: ${step.summary}`;
  }
}
