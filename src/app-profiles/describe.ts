import type { ProfileAction } from './schema';

const GLOBAL_LABELS: Record<string, string> = {
  back: 'Back',
  home: 'Home',
  recents: 'Recent apps',
  notifications: 'Notifications',
  quick_settings: 'Quick settings',
  lock_screen: 'Lock screen',
  screenshot: 'Screenshot',
};

const MEDIA_LABELS: Record<string, string> = {
  play_pause: 'Play or pause',
  next: 'Next track',
  previous: 'Previous track',
};

/** Short label for an action, for lists and the cursor hint. */
export function describeAction(action: ProfileAction): string {
  switch (action.type) {
    case 'tap':
      return 'Tap at cursor';
    case 'double_tap':
      return 'Double tap at cursor';
    case 'long_press':
      return 'Long press at cursor';
    case 'drag':
      return 'Drag from cursor';
    case 'scroll':
      return `Scroll ${action.direction}`;
    case 'swipe':
      return `Swipe ${action.direction}${action.origin === 'cursor' ? ' from cursor' : ''}`;
    case 'global':
      return GLOBAL_LABELS[action.action] ?? action.action;
    case 'media':
      return MEDIA_LABELS[action.action] ?? action.action;
    case 'volume':
      return `Volume ${action.direction}`;
    case 'open_app':
      return `Open ${action.app}`;
    case 'sphere':
      return action.action === 'toggle' ? 'Control Sphere' : `${action.action === 'open' ? 'Open' : 'Close'} Control Sphere`;
    case 'voice':
      return 'Listen for a request';
    case 'cursor':
      return action.action === 'toggle' ? 'Show or hide cursor' : 'Recenter cursor';
    case 'pause':
      return 'Pause gestures';
    case 'none':
      return 'Nothing';
  }
}
