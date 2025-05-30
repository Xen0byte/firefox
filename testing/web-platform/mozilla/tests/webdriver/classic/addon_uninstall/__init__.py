ADDON_ID = "1FC7D53C-0B0A-49E7-A8C0-47E77496A919@web-platform-tests.org"


def install_addon(session, method, value, temp=False, allow_private_browsing=False):
    arg = {"temporary": temp, "allowPrivateBrowsing": allow_private_browsing}
    arg[method] = value
    return session.transport.send(
        "POST",
        f"/session/{session.session_id}/moz/addon/install",
        arg,
    )


def uninstall_addon(session, addon_id):
    return session.transport.send(
        "POST",
        f"/session/{session.session_id}/moz/addon/uninstall",
        {"id": addon_id},
    )
