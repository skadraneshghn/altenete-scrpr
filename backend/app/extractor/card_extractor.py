"""
Card Extractor — parses free-form text and extracts credit/debit card details.

Supports multiple layouts:
  - Pipe-delimited:  NUM|MM/YY|CVV  or  NUM|MM|YYYY|CVV  (various orderings)
  - Labelled blocks: CardNum: ...\nCardExp: ...\nCardCVV: ...
  - Mixed garbage text: extract by pattern proximity heuristics

Output format for every found card:
  CARD_NUMBER|MM|YY|CVV
"""

import re
import logging
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)

# ─────────────────────────── Patterns ────────────────────────────────────────

# 13-19 digit card numbers (spaces/dashes stripped later)
_RAW_CARD = re.compile(r"\b(\d[ \-]*){13,19}\d\b")

# Expiry: 01/27, 01-27, 01 27, 01/2027, 2027/01 etc.
_EXP_SLASH  = re.compile(r"\b([01]\d)[\/\-\.](\d{2,4})\b")
_EXP_SPACE  = re.compile(r"\b([01]\d)\s+(\d{2,4})\b")
_EXP_LABEL  = re.compile(
    r"(?:cardexp|exp(?:iry|iration)?|valid\s+(?:thru|through)?)\s*[:\-=]?\s*"
    r"([01]\d)[\/\-\. ](\d{2,4})",
    re.IGNORECASE,
)

# CVV: 3-4 digits, often labelled
_CVV_LABEL  = re.compile(
    r"(?:cvv2?|cvc2?|cid|security\s+code)\s*[:\-=]?\s*(\d{3,4})\b",
    re.IGNORECASE,
)

# Pipe/bar delimited row  →  grab all token groups
_PIPE_ROW   = re.compile(
    r"(\d{13,19})\s*[\|]\s*([\d/\-. ]+)\s*[\|]\s*(\d{3,4})"
    r"(?:\s*[\|]\s*([^\|^\n]*))?"
)

# Labelled block: recognise key–value pairs that belong to the same card
_LABEL_KV   = re.compile(
    r"(cardnum(?:ber)?|card\s*(?:num|number)|number)\s*[:\-=]?\s*([\d \-]{13,23})",
    re.IGNORECASE,
)


# ─────────────────────────── Helpers ─────────────────────────────────────────

def _strip_digits(s: str) -> str:
    """Remove all non-digit characters from a string."""
    return re.sub(r"\D", "", s)


def _normalise_year(yy: str) -> str:
    """Convert a 2- or 4-digit year to 2-digit YY form."""
    y = yy.strip()
    if len(y) == 4:
        return y[2:]   # 2027 → 27
    return y.zfill(2)


def _is_valid_card(num: str) -> bool:
    """Basic Luhn check + length check."""
    num = _strip_digits(num)
    if not (13 <= len(num) <= 19):
        return False
    # Luhn
    total = 0
    reverse = num[::-1]
    for i, ch in enumerate(reverse):
        n = int(ch)
        if i % 2 == 1:
            n *= 2
            if n > 9:
                n -= 9
        total += n
    return total % 10 == 0


@dataclass
class ExtractedCard:
    card_number: str
    exp_month: str      # MM
    exp_year: str       # YY
    cvv: str

    def to_pipe(self) -> str:
        """Return canonical  CARD|MM|YY|CVV  format."""
        return f"{self.card_number}|{self.exp_month}|{self.exp_year}|{self.cvv}"

    def __eq__(self, other):
        return (
            isinstance(other, ExtractedCard)
            and self.card_number == other.card_number
        )

    def __hash__(self):
        return hash(self.card_number)


# ─────────────────────────── Pipe-row extractor ───────────────────────────────

def _try_pipe_row(line: str) -> Optional[ExtractedCard]:
    """
    Try to parse a single pipe-delimited line.
    Handles:
      NUM|MM/YY|CVV
      NUM|MM/YYYY|CVV
      NUM|MM|YYYY|CVV
      NUM|MM|YY|CVV
      NUM|MM/YY|CVV|name|...
    """
    parts = [p.strip() for p in line.split("|")]
    parts = [p for p in parts if p]  # drop empty

    if len(parts) < 3:
        return None

    # First part should be the card number
    card_raw = _strip_digits(parts[0])
    if not (13 <= len(card_raw) <= 19):
        return None

    # Try to find exp and cvv in remaining parts
    mm = yy = cvv = None

    cleaned_parts = [p.strip() for p in parts[1:]]

    # Explicitly check for 4-part format: CARD|MM|YY|CVV or CARD|MM|YYYY|CVV
    if len(cleaned_parts) >= 3:
        p1, p2, p3 = cleaned_parts[0], cleaned_parts[1], cleaned_parts[2]
        if p1.isdigit() and p2.isdigit() and p3.isdigit():
            val1 = int(p1)
            val2 = int(p2)
            if 1 <= val1 <= 12 and len(p3) in (3, 4):
                if (len(p2) == 2 and 20 <= val2 <= 45) or (len(p2) == 4 and 2020 <= val2 <= 2045):
                    mm = p1.zfill(2)
                    yy = _normalise_year(p2)
                    cvv = p3

    # Fallback to scanning parts
    if None in (mm, yy, cvv):
        for part in cleaned_parts:
            # CVV: standalone 3-4 digit token
            if re.fullmatch(r"\d{3,4}", part):
                if cvv is None:
                    cvv = part
                continue

            # Expiry slash-separated
            m = re.fullmatch(r"([01]?\d)[\/\-\.](\d{2,4})", part)
            if m and mm is None:
                mm = m.group(1).zfill(2)
                yy = _normalise_year(m.group(2))
                continue

            # Two separate numeric tokens inside one part (e.g. "10 2029")
            tokens = re.findall(r"\d+", part)
            if len(tokens) == 2:
                a, b = tokens
                # month | year
                if len(a) <= 2 and len(b) in (2, 4) and mm is None:
                    mm = a.zfill(2)
                    yy = _normalise_year(b)
                    continue
                # year | month (less common)
                if len(b) <= 2 and len(a) in (2, 4) and mm is None:
                    mm = b.zfill(2)
                    yy = _normalise_year(a)
                    continue

    if None in (mm, yy, cvv):
        return None

    card = ExtractedCard(card_number=card_raw, exp_month=mm, exp_year=yy, cvv=cvv)
    return card if _is_valid_card(card_raw) else None



# ─────────────────────────── Labelled-block extractor ────────────────────────

_BLOCK_CARD = re.compile(
    r"(?:cardnum(?:ber)?|card\s*(?:num|number)?|number)\s*[:\-=]?\s*([\d\s\-]{13,23})",
    re.IGNORECASE,
)
_BLOCK_EXP  = re.compile(
    r"(?:cardexp|exp(?:iry|iration)?|valid\s+(?:thru|through)?)?\s*[:\-=]?\s*"
    r"([01]?\d)[\/\-\. ](\d{2,4})",
    re.IGNORECASE,
)
_BLOCK_CVV  = re.compile(
    r"(?:cvv2?|cvc2?|cid|security\s+code)\s*[:\-=]?\s*(\d{3,4})\b",
    re.IGNORECASE,
)
_EXP_LABEL_BLOCK = re.compile(
    r"(?:cardexp|exp(?:iry|iration)?)\s*[:\-=]?\s*([01]?\d)[\/\-\. ](\d{2,4})",
    re.IGNORECASE,
)

def _extract_labelled_blocks(text: str) -> list[ExtractedCard]:
    """
    Find card data described in key-value style, potentially multi-line blocks.
    Uses a sliding window: when a CardNum is found, look ahead up to ~10 lines
    for exp and cvv.
    """
    results: list[ExtractedCard] = []
    lines = text.splitlines()

    i = 0
    while i < len(lines):
        line = lines[i]

        cm = _BLOCK_CARD.search(line)
        if not cm:
            i += 1
            continue

        card_raw = _strip_digits(cm.group(1))
        if not (13 <= len(card_raw) <= 19):
            i += 1
            continue

        # Look ahead up to 12 lines for exp + cvv
        window = "\n".join(lines[i:i+12])
        mm = yy = cvv = None

        # Exp
        em = _EXP_LABEL_BLOCK.search(window)
        if not em:
            em = _BLOCK_EXP.search(window)
        if em:
            mm = em.group(1).zfill(2)
            yy = _normalise_year(em.group(2))

        # CVV
        cvm = _BLOCK_CVV.search(window)
        if cvm:
            cvv = cvm.group(1)

        if mm and yy and cvv and _is_valid_card(card_raw):
            results.append(ExtractedCard(card_number=card_raw, exp_month=mm, exp_year=yy, cvv=cvv))

        i += 1

    return results


# ─────────────────────────── Main extractor ──────────────────────────────────

def extract_cards(text: str) -> list[ExtractedCard]:
    """
    Primary public API.

    Processes arbitrary free-form text (forum post, dump, etc.) and returns
    all unique valid credit/debit card records found in canonical format.

    :param text: Raw post content string.
    :returns:    List of ExtractedCard; deduplicated by card number.
    """
    if not text or not text.strip():
        return []

    seen: set[str] = set()
    results: list[ExtractedCard] = []

    def _add(card: Optional[ExtractedCard]):
        if card and card.card_number not in seen:
            seen.add(card.card_number)
            results.append(card)

    # Strategy 1: pipe-delimited rows
    for line in text.splitlines():
        line = line.strip()
        if "|" in line and re.search(r"\d{13,19}", line):
            _add(_try_pipe_row(line))

    # Strategy 2: labelled key-value blocks (handles multi-line blocks)
    for card in _extract_labelled_blocks(text):
        _add(card)

    # Strategy 3: proximity heuristic — scan for bare card numbers and look
    # for an expiry + cvv within a 200-char radius
    for m in _RAW_CARD.finditer(text):
        card_raw = _strip_digits(m.group(0))
        if not _is_valid_card(card_raw):
            continue
        if card_raw in seen:
            continue

        start = max(0, m.start() - 50)
        end   = min(len(text), m.end() + 200)
        ctx   = text[start:end]

        # Try labelled exp
        em = _EXP_LABEL.search(ctx)
        if not em:
            em = _EXP_SLASH.search(ctx)
        if not em:
            em = _EXP_SPACE.search(ctx)
        if not em:
            continue

        mm = em.group(1).zfill(2)
        yy = _normalise_year(em.group(2))

        cvm = _CVV_LABEL.search(ctx)
        if not cvm:
            # Look for a standalone 3-4 digit group near the card/exp
            for cvv_m in re.finditer(r"\b(\d{3,4})\b", ctx):
                candidate = cvv_m.group(1)
                # Skip if it's a year
                if re.fullmatch(r"20\d{2}", candidate):
                    continue
                cvv = candidate
                break
            else:
                continue
        else:
            cvv = cvm.group(1)

        _add(ExtractedCard(card_number=card_raw, exp_month=mm, exp_year=yy, cvv=cvv))

    logger.debug(f"extract_cards: found {len(results)} card(s) in {len(text)} chars of text")
    return results
