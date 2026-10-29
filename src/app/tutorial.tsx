import { useLocalSearchParams } from 'expo-router';

import { TutorialScreen } from '@/tutorial/tutorial-screen';

/** The guided tour. replay=1 starts it from the top, as from the redo button or the voice command. */
export default function Tutorial() {
  const { replay } = useLocalSearchParams<{ replay?: string }>();
  return <TutorialScreen replay={replay === '1'} />;
}
