"""Capture README screenshots for each page."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

BASE = "http://localhost:5173"
OUT = Path("/Users/kanuj/regime-radar/docs/screenshots")
OUT.mkdir(parents=True, exist_ok=True)

PAGES = [
    ("current-state",    "/",                None),
    ("history",          "/history",         None),
    ("event-replay",     "/event-replay",    None),
    ("model-drivers",    "/model-drivers",   None),
    ("scenario-explorer", "/scenario",       "crisis_peak"),
]

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(
            viewport={"width": 1440, "height": 860},
            device_scale_factor=2,
        )
        page = await ctx.new_page()
        # Hide scrollbars globally
        await page.add_style_tag(content="""
            ::-webkit-scrollbar { display: none !important; }
            * { scrollbar-width: none !important; }
        """)

        for slug, path, preset in PAGES:
            print(f"  {slug}...")
            await page.goto(f"{BASE}{path}", wait_until="networkidle")
            # Wait for any loading states to resolve
            await page.wait_for_timeout(2500)

            # For scenario explorer, click the Crisis Peak preset then wait
            if preset == "crisis_peak":
                try:
                    await page.click("text=Crisis Peak", timeout=4000)
                    await page.wait_for_timeout(2500)
                except Exception:
                    pass

            # For event replay, click the COVID 2020 event if available
            if slug == "event-replay":
                try:
                    await page.click("text=COVID", timeout=3000)
                    await page.wait_for_timeout(1500)
                except Exception:
                    pass

            await page.screenshot(
                path=str(OUT / f"{slug}.png"),
                full_page=False,
                clip={"x": 0, "y": 0, "width": 1440, "height": 860},
            )
            print(f"  ✓ {slug}.png saved")

        await browser.close()
    print("Done.")

asyncio.run(main())
