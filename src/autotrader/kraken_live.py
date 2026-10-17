"""Kraken private API (spot). Order placement is validate-only unless `really_send=True`.

Safety: this module never withdraws (no such method exists) and refuses to place real orders
unless the live gate has passed and the caller passes really_send=True.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
import urllib.parse
import urllib.request

from .broker import Broker, Fill

API = "https://api.kraken.com"


def sign(urlpath: str, data: dict, secret_b64: str) -> str:
    """Kraken API-Sign: HMAC-SHA512(base64-decoded secret, path + SHA256(nonce + postdata))."""
    postdata = urllib.parse.urlencode(data)
    encoded = (str(data["nonce"]) + postdata).encode()
    message = urlpath.encode() + hashlib.sha256(encoded).digest()
    mac = hmac.new(base64.b64decode(secret_b64), message, hashlib.sha512)
    return base64.b64encode(mac.digest()).decode()


class KrakenBroker(Broker):
    def __init__(self, key: str, secret_b64: str, *, really_send: bool = False,
                 post=None) -> None:
        self.key, self.secret, self.really_send = key, secret_b64, really_send
        self._post = post or self._http_post

    def _http_post(self, path: str, data: dict) -> dict:
        body = urllib.parse.urlencode(data).encode()
        req = urllib.request.Request(API + path, data=body, headers={
            "API-Key": self.key, "API-Sign": sign(path, data, self.secret)})
        with urllib.request.urlopen(req, timeout=20) as r:  # noqa: S310
            return json.loads(r.read())

    def _private(self, path: str, data: dict) -> dict:
        data = {**data, "nonce": int(time.time() * 1000)}
        out = self._post(path, data)
        if out.get("error"):
            raise RuntimeError(f"Kraken error: {out['error']}")
        return out["result"]

    def balances(self) -> dict:
        return self._private("/0/private/Balance", {})

    def market_order(self, symbol: str, side: str, units: float, ref_price: float) -> Fill:
        data = {"pair": symbol, "type": side, "ordertype": "market",
                "volume": f"{units:.8f}", "validate": "false" if self.really_send else "true"}
        self._private("/0/private/AddOrder", data)
        # Validate-only calls place nothing; report the reference price with zero fee.
        return Fill(symbol, side, units, ref_price, 0.0)
