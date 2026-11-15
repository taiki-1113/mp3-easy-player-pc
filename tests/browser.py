"""Real Edge/Chrome integration tests with test-only OPFS fixtures and picker override.
Run: python tests/browser.py [chrome|msedge]. No real user's music is accessed.
"""
import base64
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'test-results/browser-test-deps'))
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
CHANNEL = sys.argv[1] if len(sys.argv) > 1 else 'chrome'
AUDIO = ROOT / 'test-results/tone.mp3'
if not AUDIO.exists():
    sys.exit('Place a short valid MP3 at test-results/tone.mp3 before running.')
fixture = base64.b64encode(AUDIO.read_bytes()).decode()
with sync_playwright() as p:
    browser = p.chromium.launch(channel=CHANNEL, headless=True)
    context = browser.new_context()
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.add_init_script("""window.__permission = 'granted';
      FileSystemDirectoryHandle.prototype.queryPermission = async () => window.__permission;
      FileSystemDirectoryHandle.prototype.requestPermission = async function(options) {
        if(options.mode !== 'read') throw Error('write permission requested');
        return window.__permission = 'granted';
      };
      window.showDirectoryPicker = async options => {
        if(options.mode !== 'read') throw Error('write permission requested');
        if(window.__cancel) throw new DOMException('cancel', 'AbortError');
        return (await navigator.storage.getDirectory()).getDirectoryHandle('音楽');
      };""")
    page.goto('http://127.0.0.1:8766/')
    expect(page.locator('#app')).to_have_attribute('aria-busy', 'false')
    expect(page.get_by_role('heading', name='音楽プレーヤー', exact=True)).to_be_visible()
    page.evaluate("""async data => {
      const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('音楽', {create:true});
      const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
      for(const [folder, names] of [['歌手A', ['曲2.mp3','曲10.mp3']],['歌手B',['曲1.mp3']],['空',[]]]) {
        const dir = await root.getDirectoryHandle(folder,{create:true});
        for(const name of names) { const file = await dir.getFileHandle(name,{create:true}); const writer = await file.createWritable(); await writer.write(bytes); await writer.close(); }
      }
    }""", fixture)
    page.locator('#register').focus()
    page.keyboard.press('Enter')
    expect(page.locator('[data-track]')).to_have_count(3)
    expect(page.locator('#play')).to_be_focused()
    expect(page.locator('#playback-state')).to_have_text('停止中')
    page.keyboard.press('Space')
    expect(page.locator('#playback-state')).to_have_text('再生中')
    expect(page.locator('#current-name')).to_have_text('曲2.mp3')
    page.keyboard.press('Space')
    expect(page.locator('#playback-state')).to_have_text('一時停止中')
    position = page.locator('#audio').evaluate('(a) => a.currentTime')
    page.keyboard.press('Space')
    expect(page.locator('#playback-state')).to_have_text('再生中')
    assert page.locator('#audio').evaluate('(a) => a.currentTime') >= position
    page.locator('#next').click()
    expect(page.locator('#current-name')).to_have_text('曲10.mp3')
    page.locator('#previous').click()
    expect(page.locator('#current-name')).to_have_text('曲2.mp3')
    page.locator('#view-folders').click()
    expect(page.locator('#playback-state')).to_have_text('停止中')
    page.locator('#choose-folder').click()
    expect(page.locator('#screen-title')).to_be_focused()
    expect(page.get_by_role('button', name='空、0曲')).to_be_visible()
    page.get_by_role('button', name='歌手A、2曲').click()
    expect(page.locator('#play')).to_be_focused()
    expect(page.locator('#playback-state')).to_have_text('停止中')
    page.locator('#play-order').focus()
    page.keyboard.press('ArrowDown')
    expect(page.locator('#play-order')).to_have_value('shuffle')
    page.keyboard.press('Tab')
    expect(page.locator('#play')).to_be_focused()
    page.keyboard.press('Enter')
    expect(page.locator('#playback-state')).to_have_text('再生中')
    expect(page.locator('#queue-info')).to_contain_text('歌手A')
    first = page.locator('#current-name').inner_text()
    page.locator('#next').click()
    assert page.locator('#current-name').inner_text() != first
    page.locator('#next').click()
    expect(page.locator('#current-name')).to_have_text(first)
    # Real media ended event by seeking to the end of the short audio fixture.
    page.locator('#audio').evaluate('(a) => {a.currentTime = Math.max(0,a.duration - .08)}')
    page.wait_for_function('(old) => document.querySelector("#current-name").textContent !== old', arg=first)
    page.locator('#play').click()
    page.locator('#play-order').select_option('ordered')
    page.locator('[data-track]').first.click()
    expect(page.locator('#current-name')).to_have_text('曲2.mp3')
    page.locator('#play').click()
    # Structured-cloned directory handle restores on reload without copying songs.
    page.reload()
    expect(page.locator('[data-track]')).to_have_count(3)
    expect(page.locator('#playback-state')).to_have_text('停止中')
    # Revoked permission: query only on refresh, explicit button to request again.
    page.evaluate("window.__permission = 'prompt'")
    page.locator('#refresh').click()
    expect(page.locator('#grant')).to_be_focused()
    expect(page.locator('[data-track]')).to_have_count(0)
    expect(page.locator('#visible-error')).to_contain_text('アクセス')
    page.locator('#grant').press('Enter')
    expect(page.locator('[data-track]')).to_have_count(3)
    # Cancel reset preserves working library.
    page.evaluate('window.__cancel = true')
    page.locator('#register').click()
    expect(page.locator('[data-track]')).to_have_count(3)
    # Offline shell and permission-restored library.
    page.evaluate('navigator.serviceWorker.ready.then(() => true)')
    page.wait_for_function('!!navigator.serviceWorker.controller')
    context.set_offline(True)
    page.reload()
    expect(page.locator('[data-track]')).to_have_count(3)
    page.locator('#play').click()
    expect(page.locator('#playback-state')).to_have_text('再生中')
    page.locator('#play').click()
    page.screenshot(path=str(ROOT / f'test-results/{CHANNEL}.png'), full_page=True)
    assert not errors, errors
    print(json.dumps({'browser': CHANNEL, 'integration': 'passed', 'pageErrors': errors}, ensure_ascii=False))
    browser.close()
