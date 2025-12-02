from PIL import Image
import pytesseract

pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

img = Image.open("test_text.png")  # tegyél ide egy képet nagy, jól olvasható felirattal
text = pytesseract.image_to_string(img)
print("OCR TEXT:")
print(repr(text))
