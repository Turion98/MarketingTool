from generate_image import _run_image_safety

if __name__ == "__main__":
    # 1) kép, amin VAN szöveg
    res_text = _run_image_safety(
        "test_text.png",         # ide tedd a feliratos képet
        page_id="test_page",
        story_slug="test_story",
        prompt="dummy"
    )
    print("TEXT-ES KÉP RESULT:", res_text)

    # 2) kép, amin NINCS szöveg (valami landscape / absztrakt)
    res_clean = _run_image_safety(
        "test_clean.png",
        page_id="test_page",
        story_slug="test_story",
        prompt="dummy"
    )
    print("TEXT NÉLKÜLI KÉP RESULT:", res_clean)
