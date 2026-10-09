"""Machine-readable "do not train" signals written into the saved PNG.

- IPTC / PLUS "Data Mining" (plus:DataMining), the IPTC Photo Metadata field for
  AI/ML training permissions, plus a human-readable plus:OtherConstraints.
- W3C TDM Reservation Protocol (tdm:reservation = 1), the machine-readable
  opt-out from text and data mining under Article 4 of the EU DSM Directive.
- XMP rights (dc:rights, xmpRights:Marked, xmpRights:UsageTerms) and "noai" /
  "noimageai" keywords, the tags DeviantArt and others use.
- The same notice in EXIF (Copyright, Artist, ImageDescription) and in PNG text
  chunks, for tools that only read those.

These only work when whoever collects the image chooses to honour them; they
don't stop anyone technically.
"""

import io
from datetime import datetime, timezone
from typing import Optional
from xml.sax.saxutils import escape

from PIL import Image, PngImagePlugin

DATA_MINING_PROHIBITED = "http://ns.useplus.org/ldf/vocab/DMI-PROHIBITED-AIMLTRAINING"
NOTICE = "Not for AI/ML training, fine-tuning or dataset use (noai, noimageai)."
KEYWORDS = ("noai", "noimageai", "no-ai-training", "do-not-train")


def rights_text(creator: Optional[str], copyright_notice: Optional[str]) -> str:
    if copyright_notice:
        return copyright_notice
    year = datetime.now(timezone.utc).year
    return f"© {year} {creator}. All rights reserved." if creator else "All rights reserved."


def build_xmp(creator: Optional[str], copyright_notice: Optional[str]) -> str:
    rights = escape(rights_text(creator, copyright_notice))
    notice = escape(NOTICE)
    keywords = "".join(f"<rdf:li>{escape(word)}</rdf:li>" for word in KEYWORDS)
    creator_xml = (
        f"<dc:creator><rdf:Seq><rdf:li>{escape(creator)}</rdf:li></rdf:Seq></dc:creator>" if creator else ""
    )
    return f"""<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/"
    xmlns:plus="http://ns.useplus.org/ldf/xmp/1.0/"
    xmlns:tdm="http://www.w3.org/ns/tdmrep/"
    plus:DataMining="{DATA_MINING_PROHIBITED}"
    xmpRights:Marked="True"
    tdm:reservation="1">
   {creator_xml}
   <dc:rights><rdf:Alt><rdf:li xml:lang="x-default">{rights}</rdf:li></rdf:Alt></dc:rights>
   <dc:subject><rdf:Bag>{keywords}</rdf:Bag></dc:subject>
   <xmpRights:UsageTerms><rdf:Alt><rdf:li xml:lang="x-default">{notice}</rdf:li></rdf:Alt></xmpRights:UsageTerms>
   <plus:OtherConstraints><rdf:Alt><rdf:li xml:lang="x-default">{notice}</rdf:li></rdf:Alt></plus:OtherConstraints>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>"""


def save_png(
    image: Image.Image,
    creator: Optional[str] = None,
    copyright_notice: Optional[str] = None,
    add_notice: bool = True,
    icc_profile: Optional[bytes] = None,
) -> bytes:
    """Save as PNG, with the do-not-train notice unless add_notice is False"""
    options = {"optimize": False}
    if icc_profile:
        options["icc_profile"] = icc_profile
    if add_notice:
        rights = rights_text(creator, copyright_notice)
        info = PngImagePlugin.PngInfo()
        info.add_itxt("XML:com.adobe.xmp", build_xmp(creator, copyright_notice))
        info.add_itxt("Copyright", rights)
        info.add_itxt("Disclaimer", NOTICE)
        if creator:
            info.add_itxt("Author", creator)
        exif = Image.Exif()
        exif[0x8298] = rights  # Copyright
        exif[0x010E] = NOTICE  # ImageDescription
        if creator:
            exif[0x013B] = creator  # Artist
        options["pnginfo"] = info
        options["exif"] = exif
    output = io.BytesIO()
    image.save(output, format="PNG", **options)
    return output.getvalue()
