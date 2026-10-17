jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// The native audio, speech and speech recognition modules, faked (src/test-utils).
jest.mock('expo-speech-recognition', () => require('./src/test-utils/fakeRecognizer').mockModule);
jest.mock('expo-audio', () => require('./src/test-utils/fakeAudio').mockAudio);
jest.mock('expo-speech', () => require('./src/test-utils/fakeAudio').mockSpeech);
