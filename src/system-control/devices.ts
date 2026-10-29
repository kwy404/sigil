import { Linking } from 'react-native';

import type { WindowNode } from '../../modules/sigil-control';
import type { GlobalAction, MediaAction } from '../app-profiles/schema';
import type { Direction } from '../gesture-engine/gestures';
import { nodeMatches, type AppLaunch, type DeviceController, type NodeQuery, type UiNode } from '../sigil-core/executor';
import type { NativeControl } from './native';

const SNAPSHOT_LIMIT = 400;

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

/**
 * DeviceController on Android, through the accessibility service. Nodes are
 * matched in JavaScript against a snapshot of the active window, so selectors
 * behave the same here and in the tests.
 */
export class AndroidDeviceController implements DeviceController {
  readonly systemWide = true;

  constructor(private readonly native: NativeControl) {}

  openApp(launch: AppLaunch): Promise<boolean> {
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
}

/**
 * DeviceController where Sigil cannot reach other apps: iOS, Expo Go and the
 * web. It can still open deep links; everything else reports false so plans
 * stop at the first step they cannot do instead of pretending.
 */
export class InAppDeviceController implements DeviceController {
  readonly systemWide = false;

  async openApp(launch: AppLaunch): Promise<boolean> {
    if (!launch.url) {
      return false;
    }
    try {
      await Linking.openURL(launch.url);
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
}
