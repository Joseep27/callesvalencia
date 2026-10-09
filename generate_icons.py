"""Rasterize the code-native street icon for PWA install targets."""
from PIL import Image, ImageDraw


def make_icon(size: int) -> None:
    scale = size / 512
    def box(coords):
        return tuple(round(value * scale) for value in coords)

    image = Image.new("RGB", (size, size), "#11172b")
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle(box((0, 0, 511, 511)), radius=round(108 * scale), fill="#11172b")
    for y in (137, 256, 375):
        draw.line(box((110, y, 402, y)), fill="#2d3d68", width=round(17 * scale))
    for x in (178, 334):
        draw.line(box((x, 96, x, 416)), fill="#2d3d68", width=round(17 * scale))
    draw.ellipse(box((117, 129, 251, 263)), fill="#a979ff", outline="#f4f7ff", width=round(9 * scale))
    draw.polygon([box((117, 211))[:2], box((184, 326))[:2], box((251, 211))[:2]], fill="#a979ff")
    draw.ellipse(box((161, 170, 207, 216)), fill="#11172b")
    draw.line([box((291, 343))[:2], box((322, 374))[:2], box((392, 293))[:2]],
              fill="#10b36e", width=round(23 * scale), joint="curve")
    image.save(f"icon-{size}.png")


for dimension in (192, 512):
    make_icon(dimension)
