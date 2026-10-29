import { DMMono_400Regular } from '@expo-google-fonts/dm-mono/400Regular';
import { DMMono_500Medium } from '@expo-google-fonts/dm-mono/500Medium';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Sora_400Regular } from '@expo-google-fonts/sora/400Regular';
import { Sora_600SemiBold } from '@expo-google-fonts/sora/600SemiBold';
import { useFonts } from 'expo-font';

/**
 * The brand faces, loaded once at start under the names theme.family uses.
 * Only the weights the type scale needs are bundled. Returns true once they
 * are ready, or when loading failed, so the app never waits forever.
 */
export function useBrandFonts(): boolean {
  const [loaded, error] = useFonts({
    Sora_400Regular,
    Sora_600SemiBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    DMMono_400Regular,
    DMMono_500Medium,
  });
  return loaded || error !== null;
}
