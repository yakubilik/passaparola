# Simulator walk-through (Maestro)

`screens.yaml` walks intro → menu → category → level map → a seeded game
(seed 7, typed answers) → round end → level map, taking a screenshot of each.

    npx expo run:ios --device <simulator> --no-bundler   # Debug build
    npx expo start                                       # Metro on 8081
    maestro --device <simulator> test e2e/screens.yaml

Regenerate it after the questions change:

    node e2e/flow.mjs "$(node e2e/answers.mjs assets/questions/tarih.json 7)" > e2e/screens.yaml

(`flow.mjs` writes the base flow; the committed file also taps away the iOS
"open in Harfiyen?" dialog and matches labels by regex.)

`camera.yaml` checks the camera circle on a simulator (no front camera): the
Ayarlar screen with the camera switch, and a round with the placeholder in
the ring.

    maestro --device <simulator> test e2e/camera.yaml
