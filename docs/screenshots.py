"""Regenerate the screenshots in docs/screenshots (needs: npm run build && npm run bundle, and `pip install playwright`).

    python3 docs/screenshots.py
"""
import subprocess, sys, time, pathlib
from playwright.sync_api import sync_playwright

root = pathlib.Path(__file__).resolve().parent.parent
out = root / "docs" / "screenshots"
out.mkdir(parents=True, exist_ok=True)
server = subprocess.Popen([sys.executable, "-m", "http.server", "8765", "--bind", "127.0.0.1"], cwd=root, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
base = "http://127.0.0.1:8765/docs/demo/demo.html"

try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(device_scale_factor=2, viewport={"width": 980, "height": 700}, locale="en-US", timezone_id="Europe/Berlin")
        page = ctx.new_page()

        def shot(scene, name, wait, after=None):
            page.goto(f"{base}#{scene}")
            page.reload()
            page.wait_for_selector(wait)
            if after:
                after()
            page.locator("#stage").screenshot(path=str(out / name))
            print("wrote", name)

        shot("before", "01-vote-before.png", "quorum-vote button.approve")

        def vote():
            page.locator("quorum-vote button.approve").click()
            page.wait_for_selector("quorum-vote .bar")
            page.wait_for_timeout(400)  # let the bar transition finish
        shot("after", "02-vote-after.png", "quorum-vote button.approve", vote)

        shot("states", "03-states-and-theming.png", "quorum-vote .bar")
        shot("moderation", "04-moderation-queue.png", "quorum-moderation li.case")
        browser.close()
finally:
    server.terminate()
