import AVFoundation
import ExpoModulesCore

// Reads the shared AVAudioSession as it is right now, for the diagnostic on
// the mic check screen. Never changes the session. Also the two small calls
// the self-test mode needs: its launch flag and writing its log.
public class AudioSessionInfoModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AudioSessionInfo")

    Function("get") { () -> [String: Any] in
      let session = AVAudioSession.sharedInstance()
      let route = session.currentRoute
      return [
        "category": session.category.rawValue,
        "mode": session.mode.rawValue,
        "categoryOptions": Int(session.categoryOptions.rawValue),
        "outputs": route.outputs.map { "\($0.portType.rawValue) (\($0.portName))" },
        "inputs": route.inputs.map { "\($0.portType.rawValue) (\($0.portName))" },
        "outputVolume": Double(session.outputVolume),
        "sampleRate": session.sampleRate,
        "otherAudioPlaying": session.isOtherAudioPlaying,
      ]
    }

    // The self-test mode (src/voice/selfTest.ts): on when the app was launched
    // with the argument `-harfiyenSelfTest 1` (launch arguments land in the
    // user defaults' argument domain).
    Function("selfTest") { () -> String? in
      return UserDefaults.standard.string(forKey: "harfiyenSelfTest")
    }

    // Writes the self-test log to the app's Documents folder (pulled with
    // `xcrun devicectl device copy from` / the simulator's data container).
    Function("writeDocument") { (name: String, text: String) -> String in
      let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
      let url = dir.appendingPathComponent(name)
      try text.write(to: url, atomically: true, encoding: .utf8)
      return url.path
    }
  }
}
