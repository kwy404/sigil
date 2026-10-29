import { Redirect } from 'expo-router';
import { useState } from 'react';

import { HomeScreen } from '@/home/home-screen';
import { readSettings } from '@/settings/store';
import { needsTutorial } from '@/tutorial/machine';

export default function Index() {
  // The guided tour comes first on the first launch, in the language already detected.
  const [firstRun] = useState(() => needsTutorial(readSettings().tutorial));
  if (firstRun) {
    return <Redirect href="/tutorial" />;
  }
  return <HomeScreen />;
}
