#!/usr/bin/env python3
# Copyright (c) 2025
# This file is licensed under the MIT License.

"""
Supabase Client Manager
Centralized Supabase client with connection pooling
"""

import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Lazy import Supabase
_supabase_client = None
_client_initialized = False

def get_supabase_client():
    """
    Get or create Supabase client (singleton pattern)
    
    Returns:
        Supabase Client instance or None if not available
    """
    global _supabase_client, _client_initialized
    
    if _client_initialized:
        return _supabase_client
    
    try:
        from supabase import create_client, Client  # type: ignore
        
        SUPABASE_URL = os.environ.get('SUPABASE_URL')
        SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
        
        if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
            logger.warning("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set")
            _supabase_client = None
        else:
            _supabase_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
            logger.info("Supabase client initialized successfully")
        
        _client_initialized = True
        return _supabase_client
        
    except ImportError:
        logger.warning("supabase-py not installed, Supabase operations unavailable")
        _client_initialized = True
        _supabase_client = None
        return None
    except Exception as e:
        logger.error(f"Failed to initialize Supabase client: {e}")
        _client_initialized = True
        _supabase_client = None
        return None


class SupabaseClient:
    """
    Wrapper class for Supabase operations with error handling
    """
    
    def __init__(self):
        self.client = get_supabase_client()
        self.available = self.client is not None
    
    def is_available(self) -> bool:
        """Check if Supabase is available"""
        return self.available
    
    def table(self, table_name: str):
        """Get table reference with error handling"""
        if not self.available:
            raise RuntimeError("Supabase client not available")
        return self.client.table(table_name)  # type: ignore
    
    def rpc(self, function_name: str, params: dict):
        """Call RPC function with error handling"""
        if not self.available:
            raise RuntimeError("Supabase client not available")
        return self.client.rpc(function_name, params)  # type: ignore
    
    def storage(self):
        """Get storage reference"""
        if not self.available:
            raise RuntimeError("Supabase client not available")
        return self.client.storage  # type: ignore

