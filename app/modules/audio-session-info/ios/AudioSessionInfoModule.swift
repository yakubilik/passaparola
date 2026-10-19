import AVFoundation
import ExpoModulesCore

// Reads the shared AVAudioSession as it is right now, for the diagnostic on
// the mic check screen. Never changes the session.
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
  }
}
