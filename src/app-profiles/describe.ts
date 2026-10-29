import type { GlobalAction, MediaAction, ProfileAction } from './schema';

const GLOBAL_LABELS: Record<GlobalAction, string> = {
  back: 'Back',
  home: 'Home',
  recents: 'Recent apps',
  notifications: 'Notifications',
  quick_settings: 'Quick settings',
  lock_screen: 'Lock screen',
  screenshot: 'Screenshot',
  power_menu: 'Power menu',
};

const MEDIA_LABELS: Record<MediaAction, string> = {
  play_pause: 'Play or pause',
  play: 'Play',
  pause: 'Pause',
  next: 'Next track',
  previous: 'Previous track',
};

/**
 * Short English label for an action, for logs and tests. The screens use the
 * translated labels of src/i18n.
 */
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
      return GLOBAL_LABELS[action.action];
    case 'media':
      return MEDIA_LABELS[action.action];
    case 'volume':
      return `Volume ${action.direction}`;
    case 'brightness':
      return `Brightness ${action.direction}`;
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
