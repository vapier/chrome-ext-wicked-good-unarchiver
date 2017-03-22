#!/usr/bin/python3

"""Translate messages.json using Google Translate.

The `trans` tool can be found here:
  https://www.soimort.org/translate-shell/
or on Debian systems:
  $ sudo apt-get install translate-shell
"""

import collections
import json
import os
import shutil
import subprocess
import sys


LANG_MAP = {
    'ar': 'arabic',
    'bg': 'Bulgarian',
    'ca': 'Catalan',
    'cs': 'Czech',
    'da': 'Danish',
    'de': 'german',
    'el': 'Greek',
    'es': 'spanish',
    'es_419': 'spanish',
    'et': 'Estonian',
    'fa': 'Persian',
    'fi': 'finnish',
    'fil': 'tgl',
    'fr': 'french',
    'he': 'Hebrew',
    'hi': 'Hindi',
    'hr': 'Croatian',
    'hu': 'Hungarian',
    'id': 'Indonesian',
    'it': 'italian',
    'ja': 'japanese',
    'ko': 'Korean',
    'lt': 'Lithuanian',
    'lv': 'Latvian',
    'ms': 'Malay',
    'nl': 'Dutch',
    'no': 'Norwegian',
    'pl': 'Polish',
    'pt_BR': 'pt',
    'pt_PT': 'Portuguese',
    'ro': 'Romanian',
    'ru': 'Russian',
    'sk': 'Slovak',
    'sl': 'Slovenian',
    'sr': 'sr-Cyrl',
    'sv': 'Swedish',
    'th': 'Thai',
    'tr': 'Turkish',
    'uk': 'Ukrainian',
    'vi': 'Vietnamese',
    'zh_CN': 'zh-CN',
    'zh_TW': 'zh-TW',
}


def load(lang):
    with open('%s/messages.json' % lang) as fp:
        return json.JSONDecoder(object_pairs_hook=collections.OrderedDict).decode(fp.read())


def trans_one(lang, msg):
    return subprocess.check_output(
        ['trans', '-b', '-s', 'en', '-t', LANG_MAP[lang], msg]).decode('utf-8').strip()


def trans(lang, en_data, data):
    ret = data.copy()
    for k in en_data.keys():
        if k not in data:
            ret[k] = d = collections.OrderedDict()
            d['message'] = trans_one(lang, en_data[k]['message'])
            d['description'] = en_data[k]['description']
    return ret


def format(data):
    return json.dumps(data, ensure_ascii=False, indent=2)


def save(lang, data):
    print('saving: %s' % lang)
    path = '%s/messages.json' % lang
    with open(path + '.tmp', 'w') as fp:
        fp.write(format(data))
    shutil.move(path + '.tmp', path)


def main(argv):
    root = os.path.join(os.path.dirname(os.path.realpath(__file__)),
                        '_locales')
    os.chdir(root)

    en_data = load('en')
    #shutil.copy('en/messages.json', 'en_GB/messages.json')

    for lkey, lname in LANG_MAP.items():
        if not lname:
            print('unknown lang: %s' % lkey)
            continue
        print('checking', lname)
        data = load(lkey)
        new_data = trans(lkey, en_data, data)
        if data != new_data:
            save(lkey, new_data)


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
