import * as Brightness from 'expo-brightness';
import { Linking, Platform } from 'react-native';

import type { ControlOutcome, WindowNode } from '../../modules/sigil-control';
import type { GlobalAction, MediaAction, SystemPanel } from '../app-profiles/schema';
import type { Direction } from '../gesture-engine/gestures';
import {
  nodeMatches,
  type AppLaunch,
  type ControlResult,
  type DeviceController,
  type NodeQuery,
  type UiNode,
} from '../sigil-core/executor';
import type { BrightnessCommand, VolumeCommand } from '../sigil-core/steps';
import type { NativeControl } from './native';

const SNAPSHOT_LIMIT = 400;

/** Percent of the brightness slider a spoken "brighter" or "darker" moves. */
export const VOICE_BRIGHTNESS_STEP = 10;

export function toUiNode(node: WindowNode): UiNode {
  return {
    id: node.id,
    text: node.text ?? undefined,
    description: node.description ?? undefined,
    resourceId: node.resourceId ?? undefined,
    className: node.className ?? undefined,
    bounds: { left: node.left, top: node.top, right: node.right, bottom: node.bottom },
    clickable: node.clickable,
    editable: node.editable,
    focused: node.focused,
  };
}

/** Maps the native outcome of a system control to the core's result. */
export function toControlResult(outcome: ControlOutcome): ControlResult {
  switch (outcome) {
    case 'done':
      return { ok: true };
    case 'write_settings':
    case 'media_access':
      return { ok: false, reason: 'needs_permission', permission: outcome };
    case 'unsupported':
      return { ok: false, reason: 'unsupported' };
    case 'busy':
      return { ok: false, reason: 'busy' };
    default:
      return { ok: false, reason: 'failed' };
  }
}

/**
 * DeviceController on Android. Opening apps, timers, alarms, the flashlight,
 * the volume and the brightness work through the native module alone; taps,
 * typing, scrolling and navigation need the accessibility service and fail
 * without it. Nodes are matched in JavaScript against a snapshot of the active
 * window, so selectors behave the same here and in the tests.
 */
export class AndroidDeviceController implements DeviceController {
  /** systemWide is true when the accessibility service is on. */
  constructor(
    private readonly native: NativeControl,
    readonly systemWide = true,
  ) {}

  openApp(launch: AppLaunch): Promise<boolean> {
    if (launch.role && !launch.packageName && !launch.url) {
      return this.native.openRole(launch.role);
    }
    return this.native.openApp(launch.packageName ?? null, launch.url ?? null, launch.packageName ? null : launch.label);
  }

  async foregroundPackage(): Promise<string | null> {
    return this.native.getStatus().foregroundPackage;
  }

  async findNode(query: NodeQuery): Promise<UiNode | null> {
    const nodes = await this.native.snapshotWindow(SNAPSHOT_LIMIT);
    for (const node of nodes) {
      const candidate = toUiNode(node);
      if (nodeMatches(candidate, query)) {
        return candidate;
      }
    }
    return null;
  }

  tapNode(node: UiNode): Promise<boolean> {
    const { left, top, right, bottom } = node.bounds;
    return this.native.tap((left + right) / 2, (top + bottom) / 2);
  }

  typeText(text: string, _node: UiNode, submit: boolean): Promise<boolean> {
    // The executor focuses the node first; the service types into the focused input.
    return this.native.typeText(text, submit);
  }

  scroll(direction: Direction): Promise<boolean> {
    return this.native.scroll(direction);
  }

  navigate(action: GlobalAction): Promise<boolean> {
    return this.native.globalAction(action);
  }

  media(action: MediaAction): Promise<boolean> {
    return this.native.mediaKey(action);
  }

  async seek(seconds: number): Promise<ControlResult> {
    return toControlResult(await this.native.seekBy(seconds));
  }

  async setSpeed(rate: number): Promise<ControlResult> {
    return toControlResult(await this.native.setPlaybackSpeed(rate));
  }

  async volume(command: VolumeCommand): Promise<ControlResult> {
    return toControlResult(await this.native.changeVolume(command.stream, command.action, command.level ?? 0));
  }

  async brightness(command: BrightnessCommand): Promise<ControlResult> {
    const amount = command.action === 'set' ? (command.level ?? 0) : VOICE_BRIGHTNESS_STEP;
    return toControlResult(await this.native.changeBrightness(command.action, amount));
  }

  async openPanel(panel: SystemPanel): Promise<boolean> {
    return this.native.openPanel(panel);
  }

  swipe(fromX: number, fromY: number, toX: number, toY: number, durationMs: number): Promise<boolean> {
    return this.native.swipe(fromX, fromY, toX, toY, durationMs);
  }

  async setTimer(seconds: number): Promise<ControlResult> {
    return toControlResult(await this.native.setTimer(seconds));
  }

  async setAlarm(hour: number, minute: number): Promise<ControlResult> {
    return toControlResult(await this.native.setAlarm(hour, minute));
  }

  async setTorch(on: boolean): Promise<ControlResult> {
    return toControlResult(await this.native.setTorch(on));
  }
}

/**
 * DeviceController where Sigil cannot reach other apps: iOS, Expo Go and the
 * web. It can still open deep links and, where the platform allows it, change
 * the screen brightness; everything else reports failure so plans stop at the
 * first step they cannot do instead of pretending. iOS gives apps no way to set
 * the system volume (only the system volume view) or to control the player of
 * another app.
 */
export class InAppDeviceController implements DeviceController {
  readonly systemWide = false;

  /** iOS opens apps only through their links: the app's own URL scheme first, then a web link. */
  async openApp(launch: AppLaunch): Promise<boolean> {
    const url = Platform.OS === 'ios' ? (launch.iosUrl ?? launch.url) : launch.url;
    if (!url) {
      return false;
    }
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      return false;
    }
  }

  async foregroundPackage(): Promise<string | null> {
    return null;
  }

  async findNode(): Promise<UiNode | null> {
    return null;
  }

  async tapNode(): Promise<boolean> {
    return false;
  }

  async typeText(): Promise<boolean> {
    return false;
  }

  async scroll(): Promise<boolean> {
    return false;
  }

  async navigate(): Promise<boolean> {
    return false;
  }

  async media(): Promise<boolean> {
    return false;
  }

  async seek(): Promise<ControlResult> {
    return { ok: false, reason: 'unsupported' };
  }

  async setSpeed(): Promise<ControlResult> {
    return { ok: false, reason: 'unsupported' };
  }

  async volume(): Promise<ControlResult> {
    return { ok: false, reason: 'unsupported' };
  }

  /**
   * On iOS this is the screen brightness of the phone; on Android without the
   * native module only Sigil's own window gets brighter or darker.
   */
  async brightness(command: BrightnessCommand): Promise<ControlResult> {
    try {
      if (!(await Brightness.isAvailableAsync())) {
        return { ok: false, reason: 'unsupported' };
      }
      const current = await Brightness.getBrightnessAsync();
      const next =
        command.action === 'set'
          ? (command.level ?? 0) / 100
          : current + ((command.action === 'up' ? 1 : -1) * VOICE_BRIGHTNESS_STEP) / 100;
      await Brightness.setBrightnessAsync(Math.min(1, Math.max(0, next)));
      return { ok: true };
    } catch {
      return { ok: false, reason: 'failed' };
    }
  }

  async openPanel(): Promise<boolean> {
    // iOS has no public link to the Wi-Fi, Bluetooth or Focus settings.
    return false;
  }

  async swipe(): Promise<boolean> {
    return false;
  }

  /** iOS has no public way for an app to start a timer or an alarm in the Clock app. */
  async setTimer(): Promise<ControlResult> {
    return { ok: false, reason: 'unsupported' };
  }

  async setAlarm(): Promise<ControlResult> {
    return { ok: false, reason: 'unsupported' };
  }

  async setTorch(): Promise<ControlResult> {
    return { ok: false, reason: 'unsupported' };
  }
}
