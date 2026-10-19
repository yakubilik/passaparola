import { router } from 'expo-router';
import { View } from 'react-native';

import { useSettings } from '../store/SettingsContext';
import { AudioDiagnostic } from '../ui/AudioDiagnostic';
import { BackLink } from '../ui/BackLink';
import { MicCheck } from '../ui/MicCheck';
import { Screen } from '../ui/Screen';

const back = () => (router.canGoBack() ? router.back() : router.replace('/menu'));

// The mic check on its own, from the menu, with the audio session diagnostic under it.
export default function Mic() {
  const { update } = useSettings();
  return (
    <Screen light="menu">
      <View style={{ paddingHorizontal: 22, paddingTop: 10 }}>
        <BackLink />
      </View>
      <MicCheck
        onDone={() => { update({ voice: true, micChecked: true }); back(); }}
        onTypeInstead={() => { update({ voice: false, micChecked: true }); back(); }}
      />
      <View style={{ paddingHorizontal: 24, paddingBottom: 12 }}>
        <AudioDiagnostic />
      </View>
    </Screen>
  );
}
