import { act, fireEvent, screen } from 'expo-router/testing-library';

import { SESSION_SETTLE_MS } from '../voice/engine';

/**
 * Lets the round's audio settle (see settleAudio in voice/engine.ts): the
 * session, the mic's start, and SESSION_SETTLE_MS later the host's first
 * line. The clock is held meanwhile, so the round loses no time.
 */
export async function settle() {
  await act(async () => {});
  await act(async () => { jest.advanceTimersByTime(SESSION_SETTLE_MS); });
  await act(async () => {});
}

/** Presses Başla and waits until the host has started the first clue. */
export async function pressStart() {
  await fireEvent.press(await screen.findByText('Başla'));
  await settle();
}
