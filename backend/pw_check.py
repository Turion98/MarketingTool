from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    pg.set_content("<h1>Hello PDF</h1>", wait_until="networkidle")
    data = pg.pdf(format="A4", print_background=True)
    b.close()
print("OK – Playwright fut, PDF bájtok:", len(data))
