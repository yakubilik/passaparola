#!/usr/bin/env python3
"""Fills the App Store Connect fields of Harfiyen 1.0 that the API can set, idempotently:

    uv run --with pyjwt --with cryptography --with requests python3 app/scripts/asc-store-setup.py [check]

- content rights: no third-party content
- categories: Games, subcategories Trivia and Word
- age rating: every question answered "None" / "No" (4+)
- price: free (price point 0 for every territory, base USA); availability: all territories
- App Review contact + notes (no sign-in); the phone is the one on Suall unless HARFIYEN_REVIEW_PHONE is set
- version: renamed to 1.0.0 to match app.json, copyright, no IDFA

`check` only prints the current values. Uses the App Store Connect API key, no browser.
App Privacy ("Data Not Collected") is web only. Never submits anything for review.
"""
import os, sys, time

import jwt
import requests

KEY_ID = '8JZ7JZN7Z9'
ISSUER = '62d07b1a-10e1-471f-8372-36397d375ba6'
KEY = os.path.expanduser(f'~/.ascelerate/AuthKey_{KEY_ID}.p8')
BUNDLE = 'com.skolalabs.harfiyen'
VERSION = '1.0.0'  # = expo.version in app.json, the build's CFBundleShortVersionString
API = 'https://api.appstoreconnect.apple.com'
REVIEW_NOTES = (
    "1. Screen recording (launch, menu, settings, categories, level map, a single-player round "
    "with answers, a wrong answer and a pass, then a pass-and-play round): "
    "https://yakupkeskin.dev/review/harfiyen.mp4\n"
    "2. Purpose and audience: Harfiyen is a Turkish word and general-knowledge quiz for Turkish "
    "speakers of all ages. Each round has 28 questions, one per letter of the Turkish alphabet, "
    "and a 3-minute clock; it trains vocabulary and general culture in a short, playful format.\n"
    "3. How to use: no sign-in, no account, no sample files. Tap Başla, then Bölüm 1 (or Hızlı oyun "
    "or Çok oyunculu). A host voice reads each question; type the answer and tap the arrow, or tap "
    "PAS to come back to that letter later. Voice answers (Ayarlar > Sesli oyun) and the front "
    "camera picture inside the letter ring (Ayarlar > Ön kamera) are optional; the camera image is "
    "processed on the device only and never stored or sent.\n"
    "4. External services: none of our own; no server, analytics or ads. Optional voice answers use "
    "Apple's speech recognition (SFSpeechRecognizer). Everything else works offline.\n"
    "5. Regions: the app works the same in every region; its content is in Turkish.\n"
    "6. Not a regulated industry. All questions, the host voice recordings and the sound effects "
    "were made by us; no third-party protected material."
)


def token():
    now = int(time.time())
    return jwt.encode({'iss': ISSUER, 'iat': now, 'exp': now + 1100, 'aud': 'appstoreconnect-v1'},
                      open(KEY).read(), algorithm='ES256', headers={'kid': KEY_ID, 'typ': 'JWT'})


S = requests.Session()
S.headers['Authorization'] = f'Bearer {token()}'


def call(method, path, **kw):
    r = S.request(method, API + path, **kw)
    if r.status_code >= 400:
        sys.exit(f'✗ {method} {path}: {r.status_code} {r.text[:800]}')
    return r.json() if r.text else {}


def existing_review_phone():
    """The App Review contact phone Yakup already gave on his released app (Suall)."""
    app = call('GET', '/v1/apps', params={'filter[bundleId]': 'com.yakupkeskin.ikraai'})['data'][0]
    for v in call('GET', f"/v1/apps/{app['id']}/appStoreVersions")['data']:
        d = call('GET', f"/v1/appStoreVersions/{v['id']}/appStoreReviewDetail").get('data')
        if d and d['attributes'].get('contactPhone'):
            return d['attributes']['contactPhone']
    sys.exit('✗ no review phone: set HARFIYEN_REVIEW_PHONE')


def main():
    check = sys.argv[1:] == ['check']
    app = call('GET', '/v1/apps', params={'filter[bundleId]': BUNDLE})['data'][0]
    app_id = app['id']
    info = next(i for i in call('GET', f'/v1/apps/{app_id}/appInfos')['data']
                if i['attributes'].get('appStoreState') != 'READY_FOR_SALE')
    version = call('GET', f'/v1/apps/{app_id}/appStoreVersions', params={'filter[platform]': 'IOS'})['data'][0]
    age = call('GET', f"/v1/appInfos/{info['id']}/ageRatingDeclaration")['data']
    print('app', app_id, 'appInfo', info['id'], 'version', version['id'], version['attributes']['versionString'])
    if check:
        print('age', age['attributes'])
        print('version', version['attributes'])
        for rel in ('primaryCategory', 'primarySubcategoryOne', 'primarySubcategoryTwo', 'secondaryCategory'):
            print(rel, call('GET', f"/v1/appInfos/{info['id']}/{rel}").get('data'))
        return

    # Content rights: every question, clue and clip is our own (no third-party content).
    call('PATCH', f'/v1/apps/{app_id}', json={'data': {'type': 'apps', 'id': app_id,
         'attributes': {'contentRightsDeclaration': 'DOES_NOT_USE_THIRD_PARTY_CONTENT'}}})
    print('✓ content rights: no third-party content')

    # Categories.
    cat = lambda c: {'data': {'type': 'appCategories', 'id': c}}
    call('PATCH', f"/v1/appInfos/{info['id']}", json={'data': {'type': 'appInfos', 'id': info['id'], 'relationships': {
        'primaryCategory': cat('GAMES'), 'primarySubcategoryOne': cat('GAMES_TRIVIA'),
        'primarySubcategoryTwo': cat('GAMES_WORD')}}})
    print('✓ categories: Games > Trivia, Word')

    # Age rating: everything off.
    flags = ('advertising', 'ageAssurance', 'gambling', 'healthOrWellnessTopics', 'lootBox', 'messagingAndChat',
             'parentalControls', 'socialMedia', 'socialMediaAgeRestricted', 'unrestrictedWebAccess', 'userGeneratedContent')
    levels = ('alcoholTobaccoOrDrugUseOrReferences', 'contests', 'gamblingSimulated', 'gunsOrOtherWeapons',
              'medicalOrTreatmentInformation', 'profanityOrCrudeHumor', 'sexualContentGraphicAndNudity',
              'sexualContentOrNudity', 'horrorOrFearThemes', 'matureOrSuggestiveThemes', 'violenceCartoonOrFantasy',
              'violenceRealisticProlongedGraphicOrSadistic', 'violenceRealistic')
    attrs = {k: False for k in flags if k in age['attributes']}
    attrs.update({k: 'NONE' for k in levels if k in age['attributes']})
    call('PATCH', f"/v1/ageRatingDeclarations/{age['id']}",
         json={'data': {'type': 'ageRatingDeclarations', 'id': age['id'], 'attributes': attrs}})
    print('✓ age rating: all None / No')

    # Version: copyright, no IDFA.
    call('PATCH', f"/v1/appStoreVersions/{version['id']}", json={'data': {'type': 'appStoreVersions', 'id': version['id'],
         'attributes': {'versionString': VERSION, 'copyright': '2026 Skola Labs', 'usesIdfa': False}}})
    print(f'✓ version {VERSION}: copyright, no IDFA')

    # App Review details.
    detail = call('GET', f"/v1/appStoreVersions/{version['id']}/appStoreReviewDetail").get('data')
    phone = os.environ.get('HARFIYEN_REVIEW_PHONE') or existing_review_phone()
    review = {'contactFirstName': 'Yakup', 'contactLastName': 'Keskin', 'contactEmail': 'yakuupkeskin@gmail.com',
              'contactPhone': phone, 'demoAccountRequired': False, 'notes': REVIEW_NOTES}
    review = {k: v for k, v in review.items() if v is not None}
    if detail:
        call('PATCH', f"/v1/appStoreReviewDetails/{detail['id']}",
             json={'data': {'type': 'appStoreReviewDetails', 'id': detail['id'], 'attributes': review}})
    else:
        call('POST', '/v1/appStoreReviewDetails', json={'data': {'type': 'appStoreReviewDetails', 'attributes': review,
             'relationships': {'appStoreVersion': {'data': {'type': 'appStoreVersions', 'id': version['id']}}}}})
    print('✓ App Review contact and notes')

    # Price: free.
    free = next(p for p in call('GET', f'/v1/apps/{app_id}/appPricePoints',
                                params={'filter[territory]': 'USA', 'limit': 200})['data']
                if p['attributes']['customerPrice'] in ('0', '0.0', '0.00'))
    call('POST', '/v1/appPriceSchedules', json={
        'data': {'type': 'appPriceSchedules', 'relationships': {
            'app': {'data': {'type': 'apps', 'id': app_id}},
            'baseTerritory': {'data': {'type': 'territories', 'id': 'USA'}},
            'manualPrices': {'data': [{'type': 'appPrices', 'id': '${free}'}]}}},
        'included': [{'type': 'appPrices', 'id': '${free}', 'attributes': {'startDate': None},
                      'relationships': {'appPricePoint': {'data': {'type': 'appPricePoints', 'id': free['id']}}}}]})
    print('✓ price: free')

    # Availability: every territory, and new ones as Apple adds them.
    r = S.get(f'{API}/v1/apps/{app_id}/appAvailabilityV2')
    if r.status_code == 404 or not r.json().get('data'):
        territories = [t['id'] for t in call('GET', '/v1/territories', params={'limit': 200})['data']]
        call('POST', '/v2/appAvailabilities', json={
            'data': {'type': 'appAvailabilities', 'attributes': {'availableInNewTerritories': True},
                     'relationships': {'app': {'data': {'type': 'apps', 'id': app_id}},
                                       'territoryAvailabilities': {'data': [{'type': 'territoryAvailabilities', 'id': f'${{{t}}}'} for t in territories]}}},
            'included': [{'type': 'territoryAvailabilities', 'id': f'${{{t}}}', 'attributes': {'available': True},
                          'relationships': {'territory': {'data': {'type': 'territories', 'id': t}}}} for t in territories]})
        print(f'✓ available in all {len(territories)} territories')
    else:
        print('✓ availability already set')


if __name__ == '__main__':
    main()
