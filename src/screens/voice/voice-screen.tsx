import { router, type Href } from 'expo-router';

import { useFeed } from '../../history/store';
import { useI18n } from '../../i18n';
import { useSigilSession } from '../../session';
import { StatusChip } from '../../ui/chip';
import { EmptyState } from '../../ui/empty';
import { Screen, Section } from '../../ui/screen';
import { Shelf } from '../../ui/shelf';
import { useOpen } from '../shared';
import { sessionStatus } from '../status';
import { CommandCard, VOICE_CATEGORIES } from './command-card';
import { FeedList } from './feed-list';
import { MicHero } from './mic-hero';

/** Voice: the big mic, commands to try by category, and the history of requests. */
export function VoiceScreen() {
  const { messages: m } = useI18n();
  const session = useSigilSession();
  const feed = useFeed();
  const open = useOpen();
  const status = sessionStatus(session, m);
  const t = m.ui.voice;
  const history = feed.filter((entry) => entry.kind === 'command');

  return (
    <Screen title={t.title} accessory={<StatusChip tone={status.tone} label={status.label} live={status.live} />}>
      <MicHero session={session} />
      {VOICE_CATEGORIES.map((category) => (
        <Section
          key={category}
          title={t.categories[category]}
          caption={t.categoryCaptions[category]}
          action={{ label: m.ui.common.seeAll, onPress: () => router.push(`/voice/${category}` as Href) }}>
          <Shelf itemWidth={224}>
            {t.examples[category].map((text) => (
              <CommandCard key={text} text={text} category={category} width={224} plain onPress={() => open.command(text)} />
            ))}
          </Shelf>
        </Section>
      ))}
      <Section title={t.historyTitle} caption={t.historyCaption}>
        {history.length > 0 ? (
          <FeedList entries={history} />
        ) : (
          <EmptyState icon="voice" title={t.historyEmptyTitle} body={t.historyEmptyBody} />
        )}
      </Section>
    </Screen>
  );
}
