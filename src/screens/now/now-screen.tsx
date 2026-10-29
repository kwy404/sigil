import { router, type Href } from 'expo-router';

import { albumById, QUICK_ALBUMS } from '../../catalog/gestures';
import { useFeed } from '../../history/store';
import { useI18n } from '../../i18n';
import { useSigilSession } from '../../session';
import { Tag } from '../../ui/chip';
import { EmptyState } from '../../ui/empty';
import { Screen, Section } from '../../ui/screen';
import { Shelf } from '../../ui/shelf';
import { AlbumCard } from '../gestures/album-card';
import { tabHref, useOpen } from '../shared';
import { missingItems } from '../status';
import { CommandCard, type VoiceCategory } from '../voice/command-card';
import { FeedList } from '../voice/feed-list';
import { HeroCard } from './hero-card';
import { QuickActions } from './quick-actions';
import { SetupShelf } from './setup-shelf';

/** The first tab: start Sigil, finish setup, learn the first signs, say something, act fast, see what happened. */
export function NowScreen() {
  const { messages: m } = useI18n();
  const session = useSigilSession();
  const feed = useFeed();
  const open = useOpen();
  const t = m.ui.now;
  const missing = missingItems(session.checklist);
  const examples = m.ui.voice.examples;
  const say: { text: string; category: VoiceCategory }[] = [
    { text: examples.apps[0], category: 'apps' },
    { text: examples.media[3], category: 'media' },
    { text: examples.system[0], category: 'system' },
    { text: examples.messages[0], category: 'messages' },
    { text: examples.media[2], category: 'media' },
    { text: examples.apps[2], category: 'apps' },
  ];

  return (
    <Screen title={t.title} accessory={<Tag label={m.ui.common.onDevice} icon="privacy-shield" />}>
      <HeroCard session={session} />

      {missing.length > 0 ? (
        <Section
          title={t.setupTitle}
          caption={t.setupCaption(missing.length)}
          action={{ label: m.ui.common.seeAll, onPress: () => router.push('/(tabs)/(settings)/settings/permissions' as Href) }}>
          <SetupShelf missing={missing} fix={session.fix} />
        </Section>
      ) : null}

      <Section
        title={t.gesturesTitle}
        caption={t.gesturesCaption}
        action={{ label: m.ui.common.seeAll, onPress: () => router.navigate(tabHref('gestures')) }}>
        <Shelf itemWidth={150}>
          {QUICK_ALBUMS.map((id) => {
            const album = albumById(id);
            return album ? <AlbumCard key={id} album={album} width={150} onPress={() => open.gesture(id)} /> : null;
          })}
        </Shelf>
      </Section>

      <Section title={t.sayTitle} caption={t.sayCaption} action={{ label: m.ui.common.seeAll, onPress: () => router.navigate(tabHref('voice')) }}>
        <Shelf itemWidth={232}>
          {say.map((item) => (
            <CommandCard key={item.text} text={item.text} category={item.category} width={232} onPress={() => open.command(item.text)} />
          ))}
        </Shelf>
      </Section>

      <Section title={t.actionsTitle}>
        <QuickActions session={session} />
      </Section>

      <Section title={t.recentTitle}>
        {feed.length > 0 ? (
          <FeedList entries={feed.slice(0, 5)} />
        ) : (
          <EmptyState icon="clock" title={t.recentEmptyTitle} body={t.recentEmptyBody} />
        )}
      </Section>
    </Screen>
  );
}
