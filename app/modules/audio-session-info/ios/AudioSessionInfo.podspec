Pod::Spec.new do |s|
  s.name           = 'AudioSessionInfo'
  s.version        = '1.0.0'
  s.summary        = 'Reads the iOS audio session for the mic check diagnostic'
  s.description    = 'Category, mode, options, route and output volume of AVAudioSession, read only.'
  s.author         = 'Skola Labs'
  s.homepage       = 'https://skolalabs.com'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }

  s.source_files = '**/*.{h,m,swift}'
end
