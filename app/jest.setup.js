jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-vision-camera', () => require('./src/test-utils/visionCamera'));

// The native audio, speech and speech recognition modules, faked (src/test-utils).
jest.mock('expo-speech-recognition', () => require('./src/test-utils/fakeRecognizer').mockModule);
jest.mock('expo-audio', () => require('./src/test-utils/fakeAudio').mockAudio);
jest.mock('expo-speech', () => require('./src/test-utils/fakeAudio').mockSpeech);

// The screen tests drive whole rounds through the router and get slow when the
// Mac is busy (other tickets run their suites at the same time): a file's own
// jest.setTimeout is raised to at least TIMEOUT_FLOOR_MS, so a loaded machine
// shows up as a slow run rather than as timeouts. jest.setTimeout stores its
// value under this symbol on the test environment's global; jest-circus reads
// it when the file's run starts.
const TIMEOUT_FLOOR_MS = 20 * 60_000;
const TEST_TIMEOUT = Symbol.for('TEST_TIMEOUT_SYMBOL');
let testTimeout = TIMEOUT_FLOOR_MS;
Object.defineProperty(globalThis, TEST_TIMEOUT, {
  configurable: true,
  get: () => testTimeout,
  set: (ms) => { testTimeout = Math.max(Number(ms) || 0, TIMEOUT_FLOOR_MS); },
});
