# Copyright (c) 2025 Amazon.com
# This file is licensed under the MIT License.
# See the LICENSE file in the project root for full license information.

"""AppSync Async IO Gql Client"""
from urllib.parse import urlparse

from gql.client import Client
from gql.transport.aiohttp import AIOHTTPTransport

try:
    from gql.transport.appsync_auth import AppSyncIAMAuthentication
    _IAM_AUTH_AVAILABLE = True
except ImportError:
    # Fallback for non-AWS environments - use simple auth
    _IAM_AUTH_AVAILABLE = False
    class AppSyncIAMAuthentication:
        """Minimal shim for non-AWS environments"""
        def __init__(self, host: str):
            self.host = host
        def get_headers(self, **kwargs):
            return {}


class AppsyncAioGqlClient(Client):
    """AppSync Async IO Gql Client"""

    def __init__(
        self,
        url: str,
        **kwargs,
    ):
        host = str(urlparse(url).netloc)
        auth = AppSyncIAMAuthentication(host=host)
        transport = AIOHTTPTransport(url=url, auth=auth)

        super().__init__(transport=transport, **kwargs)
