# Copyright (c) 2025 Amazon.com
# This file is licensed under the MIT License.
# See the LICENSE file in the project root for full license information.

"""
ECS Task Manager for Virtual Participants
Handles direct termination of ECS containers using stored ARNs
"""

import logging
from typing import Dict, Optional

logger = logging.getLogger(__name__)

# Conditional boto3 import
try:
    import boto3  # type: ignore
    _BOTO3_AVAILABLE = True
except ImportError:
    boto3 = None  # type: ignore
    _BOTO3_AVAILABLE = False

class ECSTaskManager:
    """
    Manages ECS tasks for Virtual Participants using stored ARNs
    """
    
    def __init__(self):
        if _BOTO3_AVAILABLE and boto3:
            try:
                self.ecs_client = boto3.client('ecs')  # type: ignore
                logger.info("ECSTaskManager initialized for direct termination using stored ARNs")
            except Exception as e:
                logger.warning(f"ECS client creation failed: {e}")
                self.ecs_client = None  # type: ignore
        else:
            self.ecs_client = None  # type: ignore
            logger.warning("ECS not available, task termination will be skipped")
    
    def stop_vp_task_by_arn(self, task_arn: str, cluster_arn: str, vp_id: str, reason: str = "User requested termination") -> bool:
        """
        Stop the ECS task using stored task ARN and cluster ARN
        
        Args:
            task_arn: ECS Task ARN from registry
            cluster_arn: ECS Cluster ARN from registry
            vp_id: Virtual Participant ID (for logging)
            reason: Reason for stopping the task
            
        Returns:
            True if task was stopped successfully, False otherwise
        """
        try:
            logger.info(f"Stopping ECS task for VP {vp_id}")
            logger.info(f"Task ARN: {task_arn}")
            logger.info(f"Cluster ARN: {cluster_arn}")
            
            if not self.ecs_client:
                logger.warning(f"ECS client not available, cannot stop task for VP {vp_id}")
                return False
            
            if not task_arn or not cluster_arn:
                logger.error(f"Missing ARNs for VP {vp_id}")
                return False
            
            # Stop the task directly using stored ARNs
            response = self.ecs_client.stop_task(  # type: ignore
                cluster=cluster_arn,
                task=task_arn,
                reason=reason
            )
            
            logger.info(f"Successfully stopped ECS task for VP {vp_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error stopping ECS task for VP {vp_id}: {str(e)}")
            return False
