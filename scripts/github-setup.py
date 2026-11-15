"""Setup only taiki-1113/mp3-easy-player-pc; credentials never leave memory."""
import json
import subprocess
import sys
import urllib.request
import urllib.error

REPO = 'taiki-1113/mp3-easy-player-pc'
credential = subprocess.run(['git', 'credential', 'fill'], input='protocol=https\nhost=github.com\n\n', text=True, capture_output=True, check=True)
fields = dict(line.split('=', 1) for line in credential.stdout.splitlines() if '=' in line)
token = fields.get('password')
if not token:
    sys.exit('GitHub credential unavailable')

def api(path, method='GET', data=None):
    request = urllib.request.Request('https://api.github.com/' + path, method=method,
        data=json.dumps(data).encode() if data is not None else None,
        headers={'Authorization': 'Bearer ' + token, 'User-Agent': 'mp3-pc-setup', 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)

action = sys.argv[1]
if action == 'create':
    assert api('user')['login'] == 'taiki-1113'
    try:
        existing = api('repos/' + REPO)
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
        result = api('user/repos', 'POST', {'name': 'mp3-easy-player-pc', 'description': 'Windows向け・読み取り専用フォルダ直接参照のアクセシブルなMP3プレーヤー PWA', 'private': False, 'auto_init': False})
        print('Created:', result['html_url'])
    else:
        print('Already exists:', existing['html_url'], 'size:', existing['size'])
elif action == 'pages':
    try:
        result = api('repos/' + REPO + '/pages')
        print('Existing Pages:', result['html_url'], result.get('source'))
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
        result = api('repos/' + REPO + '/pages', 'POST', {'build_type': 'legacy', 'source': {'branch': 'main', 'path': '/docs'}})
        print('Pages configured:', result['html_url'])
elif action == 'status':
    result = api('repos/' + REPO + '/pages')
    print('Pages:', result['html_url'], 'status:', result.get('status'))
    try:
        build = api('repos/' + REPO + '/pages/builds/latest')
        print('Build:', build.get('status'), 'commit:', build.get('commit'), 'error:', build.get('error'))
    except urllib.error.HTTPError as e:
        print('Build status HTTP', e.code)
else:
    sys.exit('Unknown action')
