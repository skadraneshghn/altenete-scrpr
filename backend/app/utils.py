def sanitize_mysql_string(s: str | None) -> str | None:
    """
    Strip 4-byte UTF-8 characters (emojis, mathematical symbols, etc. with ord > 0xFFFF)
    to prevent "1366 Incorrect string value" errors when saving to legacy MySQL utf8 columns.
    """
    if s is None:
        return None
    if not isinstance(s, str):
        return s
    return "".join(c for c in s if ord(c) <= 0xFFFF)
