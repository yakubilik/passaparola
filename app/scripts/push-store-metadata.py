#!/usr/bin/env python3
"""Pushes the Turkish store listing in docs/store/tr.md to App Store Connect.

    python3 app/scripts/push-store-metadata.py [--privacy-url URL]

Uses ascelerate (App Store Connect API key, no browser): app name, subtitle and, when given,
the privacy policy URL on the app info (categories are set by asc-store-setup.py);
description, keywords, promotional text and (the privacy page, which carries the contact
address) the support URL on version 1.0.0. What's New is left out: Apple
does not accept it on an app's first version. Never submits anything for review.
"""
import argparse, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BUNDLE = 'com.skolalabs.harfiyen'


def section(md, heading):
    m = re.search(r'^## ' + re.escape(heading) + r'\n(.*?)(?=^## |\Z)', md, re.S | re.M)
    if not m:
        sys.exit(f'no "## {heading}" in tr.md')
    return m.group(1).strip()


def run(*args):
    print('→ ascelerate', ' '.join(a if len(a) < 60 else a[:57] + '...' for a in args), file=sys.stderr)
    subprocess.run(['ascelerate', *args], check=True, input='y\n', text=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--privacy-url')
    a = ap.parse_args()
    md = open(os.path.join(ROOT, 'docs', 'store', 'tr.md'), encoding='utf-8').read()
    info = ['apps', 'app-info', 'update', BUNDLE, '--locale', 'tr',
            '--name', section(md, 'Name'), '--subtitle', section(md, 'Subtitle'),
            '--yes']
    if a.privacy_url:
        info += ['--privacy-policy-url', a.privacy_url]
    run(*info)
    run('apps', 'localizations', 'update', BUNDLE, '--locale', 'tr',
        '--description', section(md, 'Description'), '--keywords', section(md, 'Keywords'),
        '--promotional-text', section(md, 'Promotional text'),
        *(['--support-url', a.privacy_url] if a.privacy_url else []))


if __name__ == '__main__':
    main()
