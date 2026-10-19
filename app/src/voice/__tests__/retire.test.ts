import { act } from '@testing-library/react-native';

import { audio } from '../../test-utils/fakeAudio';
import { host, sounds } from '../engine';
import { retiredCount } from '../sounds';

// expo-audio deactivates the iOS session 100 ms after remove() takes away the
// last player that kept it active while nothing plays (AudioModule.swift,
// remove -> unregisterAudioSessionActivityKeeper -> deactivateSession). The
// fake models that; a round start must never get there (#361).

const wait = (ms: number) => act(() => jest.advanceTimersByTime(ms));

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('players let go at a round start are removed only once a newer one plays: expo-audio never runs out of players keeping the session active', async () => {
  audio.session.active = true;
  sounds.play('theme');
  expect(audio.keepers.size).toBe(1);
  sounds.hushCues();
  // A round start lets every player that is not sounding go (settleAudio)...
  sounds.renew();
  host.renew();
  expect(retiredCount()).toBe(1);
  // ...and for as long as nothing new plays, they are kept: removing the
  // theme player here would leave expo-audio with no keeper and nothing
  // playing, and it would deactivate the session 100 ms later.
  await wait(500);
  expect(audio.log.filter((e) => e.e === 'deactivated')).toEqual([]);
  expect(audio.session.active).toBe(true);
  // The next sound starts: the old player goes now, the new one keeps the session.
  sounds.play('pas');
  expect(retiredCount()).toBe(0);
  await wait(500);
  expect(audio.log.filter((e) => e.e === 'deactivated')).toEqual([]);
  expect(audio.session.active).toBe(true);
  expect(audio.players.filter((p) => p.removed)).toHaveLength(1);
});
