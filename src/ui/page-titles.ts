import { useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';

/** For each stack, the title of the page that was in front last. */
const frontTitle = new Map<string, string>();

/**
 * Every page notes its title whenever it comes to the front of its stack, so
 * a page pushed above it can name it on the back button, the way iOS does.
 * Returns the title of the page this one opened from, if it is known.
 */
export function usePageTitle(title: string): string | undefined {
  const navigation = useNavigation();
  const stack = navigation.getState()?.key ?? '';
  // The page in front when this one opened is the one Back returns to. It
  // stays the same for the life of the page.
  const [parent] = useState(() => frontTitle.get(stack));

  useEffect(() => {
    const mark = () => {
      frontTitle.set(stack, title);
    };
    if (navigation.isFocused()) mark();
    return navigation.addListener('focus', mark);
  }, [navigation, stack, title]);

  return parent;
}
