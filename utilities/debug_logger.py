"""
Centralized Debug Logger for RAG & Chatbot Systems
Provides step-by-step execution tracing with detailed logging
"""

import logging
import json
import time
import traceback
import os
from datetime import datetime
from functools import wraps
from typing import Any, Dict, Optional, Callable
from pathlib import Path

# Color codes for console output
class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

class StepTracer:
    """Step-by-step execution tracer for flow visualization"""
    
    def __init__(self, system_name: str, session_id: str = None):
        self.system_name = system_name
        self.session_id = session_id or f"{system_name}_{int(time.time())}"
        self.steps = []
        self.current_step = 0
        self.start_time = time.time()
        self.step_start_time = None
        
    def start_step(self, step_name: str, description: str = "", metadata: Dict = None):
        """Start tracking a new step"""
        self.current_step += 1
        self.step_start_time = time.time()
        
        step_info = {
            "step_number": self.current_step,
            "step_name": step_name,
            "description": description,
            "start_time": datetime.now().isoformat(),
            "metadata": metadata or {}
        }
        
        self.steps.append(step_info)
        
        # Console output with color
        print(f"\n{Colors.OKCYAN}{'='*80}{Colors.ENDC}")
        print(f"{Colors.BOLD}STEP {self.current_step}: {step_name}{Colors.ENDC}")
        if description:
            print(f"{Colors.OKBLUE}📝 {description}{Colors.ENDC}")
        if metadata:
            print(f"{Colors.OKBLUE}📊 Metadata: {json.dumps(metadata, indent=2, ensure_ascii=False)}{Colors.ENDC}")
        print(f"{Colors.OKCYAN}{'='*80}{Colors.ENDC}")
        
        return step_info
    
    def end_step(self, result: Any = None, error: Exception = None):
        """End current step and log result"""
        if not self.steps:
            return
            
        current_step = self.steps[-1]
        duration = time.time() - self.step_start_time if self.step_start_time else 0
        
        current_step["end_time"] = datetime.now().isoformat()
        current_step["duration_ms"] = round(duration * 1000, 2)
        current_step["status"] = "error" if error else "success"
        
        if error:
            current_step["error"] = {
                "type": type(error).__name__,
                "message": str(error),
                "traceback": traceback.format_exc()
            }
            print(f"{Colors.FAIL}❌ STEP {self.current_step} FAILED: {error}{Colors.ENDC}")
        else:
            current_step["result"] = self._serialize_result(result)
            print(f"{Colors.OKGREEN}✅ STEP {self.current_step} COMPLETED in {duration*1000:.2f}ms{Colors.ENDC}")
            
        if result and not error:
            print(f"{Colors.OKGREEN}📤 Result: {self._format_result(result)}{Colors.ENDC}")
    
    def add_checkpoint(self, name: str, data: Any = None):
        """Add checkpoint within current step"""
        if not self.steps:
            return
            
        if "checkpoints" not in self.steps[-1]:
            self.steps[-1]["checkpoints"] = []
            
        checkpoint = {
            "name": name,
            "timestamp": datetime.now().isoformat(),
            "data": self._serialize_result(data)
        }
        
        self.steps[-1]["checkpoints"].append(checkpoint)
        print(f"{Colors.WARNING}🔹 Checkpoint: {name}{Colors.ENDC}")
        if data:
            print(f"   Data: {self._format_result(data)}")
    
    def get_summary(self) -> Dict:
        """Get execution summary"""
        total_duration = time.time() - self.start_time
        
        summary = {
            "system": self.system_name,
            "session_id": self.session_id,
            "total_steps": self.current_step,
            "total_duration_ms": round(total_duration * 1000, 2),
            "total_duration_s": round(total_duration, 2),
            "success_steps": len([s for s in self.steps if s.get("status") == "success"]),
            "failed_steps": len([s for s in self.steps if s.get("status") == "error"]),
            "steps": self.steps
        }
        
        return summary
    
    def print_summary(self):
        """Print execution summary to console"""
        summary = self.get_summary()
        
        print(f"\n{Colors.HEADER}{'='*80}{Colors.ENDC}")
        print(f"{Colors.BOLD}{Colors.HEADER}EXECUTION SUMMARY - {self.system_name}{Colors.ENDC}")
        print(f"{Colors.HEADER}{'='*80}{Colors.ENDC}")
        print(f"Session ID: {self.session_id}")
        print(f"Total Steps: {summary['total_steps']}")
        print(f"Success: {Colors.OKGREEN}{summary['success_steps']}{Colors.ENDC} | Failed: {Colors.FAIL}{summary['failed_steps']}{Colors.ENDC}")
        print(f"Total Duration: {summary['total_duration_s']:.2f}s ({summary['total_duration_ms']:.2f}ms)")
        print(f"{Colors.HEADER}{'='*80}{Colors.ENDC}\n")
        
        # Step breakdown
        for step in self.steps:
            status_icon = "✅" if step.get("status") == "success" else "❌"
            color = Colors.OKGREEN if step.get("status") == "success" else Colors.FAIL
            print(f"{color}{status_icon} Step {step['step_number']}: {step['step_name']} ({step.get('duration_ms', 0):.2f}ms){Colors.ENDC}")
    
    def _serialize_result(self, result: Any) -> Any:
        """Serialize result for JSON logging"""
        if result is None:
            return None
        if isinstance(result, (str, int, float, bool)):
            return result
        if isinstance(result, (list, tuple)):
            return [self._serialize_result(item) for item in result[:10]]  # Limit to 10 items
        if isinstance(result, dict):
            return {k: self._serialize_result(v) for k, v in list(result.items())[:20]}  # Limit to 20 keys
        return str(result)[:500]  # Limit string length
    
    def _format_result(self, result: Any) -> str:
        """Format result for console display"""
        if result is None:
            return "None"
        if isinstance(result, str):
            return result[:200] + "..." if len(result) > 200 else result
        if isinstance(result, (list, tuple)):
            return f"[{len(result)} items]"
        if isinstance(result, dict):
            return json.dumps(result, indent=2, ensure_ascii=False)[:300]
        return str(result)[:200]


class DebugLogger:
    """Centralized debug logger with step tracing"""
    
    def __init__(self, name: str, log_dir: str = None):
        self.name = name
        self.log_dir = log_dir or "/home/quangnh58/dev/amazon-transcribe-live-meeting-assistant/log"
        self.tracers = {}  # session_id -> StepTracer
        
        # Create log directory if not exists
        Path(self.log_dir).mkdir(parents=True, exist_ok=True)
        
        # Setup logger
        self.logger = self._setup_logger()
    
    def _setup_logger(self) -> logging.Logger:
        """Setup logger with file and console handlers"""
        logger = logging.getLogger(self.name)
        logger.setLevel(logging.DEBUG)
        
        # Remove existing handlers
        logger.handlers.clear()
        
        # File handler - detailed logs
        log_file = os.path.join(self.log_dir, f"{self.name}_{datetime.now().strftime('%Y%m%d')}.log")
        file_handler = logging.FileHandler(log_file, encoding='utf-8')
        file_handler.setLevel(logging.DEBUG)
        
        # Console handler - important logs only
        console_handler = logging.StreamHandler()
        console_handler.setLevel(logging.INFO)
        
        # Formatter
        formatter = logging.Formatter(
            '%(asctime)s | %(name)s | %(levelname)s | %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        
        file_handler.setFormatter(formatter)
        console_handler.setFormatter(formatter)
        
        logger.addHandler(file_handler)
        logger.addHandler(console_handler)
        
        return logger
    
    def start_trace(self, system_name: str, session_id: str = None) -> StepTracer:
        """Start a new execution trace"""
        tracer = StepTracer(system_name, session_id)
        self.tracers[tracer.session_id] = tracer
        
        self.logger.info(f"Started trace for {system_name} | Session: {tracer.session_id}")
        
        return tracer
    
    def end_trace(self, session_id: str, save_to_file: bool = True):
        """End execution trace and save to file"""
        if session_id not in self.tracers:
            self.logger.warning(f"No tracer found for session: {session_id}")
            return
        
        tracer = self.tracers[session_id]
        summary = tracer.get_summary()
        
        # Print summary to console
        tracer.print_summary()
        
        # Save to file
        if save_to_file:
            trace_file = os.path.join(self.log_dir, f"trace_{session_id}.json")
            with open(trace_file, 'w', encoding='utf-8') as f:
                json.dump(summary, f, indent=2, ensure_ascii=False)
            
            self.logger.info(f"Trace saved to: {trace_file}")
        
        # Log summary
        self.logger.info(
            f"Trace completed | Session: {session_id} | "
            f"Steps: {summary['total_steps']} | "
            f"Duration: {summary['total_duration_s']:.2f}s | "
            f"Success: {summary['success_steps']} | Failed: {summary['failed_steps']}"
        )
        
        # Cleanup
        del self.tracers[session_id]
    
    def debug(self, message: str, **kwargs):
        """Log debug message"""
        extra_data = json.dumps(kwargs, ensure_ascii=False) if kwargs else ""
        self.logger.debug(f"{message} {extra_data}")
    
    def info(self, message: str, **kwargs):
        """Log info message"""
        extra_data = json.dumps(kwargs, ensure_ascii=False) if kwargs else ""
        self.logger.info(f"{message} {extra_data}")
    
    def warning(self, message: str, **kwargs):
        """Log warning message"""
        extra_data = json.dumps(kwargs, ensure_ascii=False) if kwargs else ""
        self.logger.warning(f"{message} {extra_data}")
    
    def error(self, message: str, error: Exception = None, **kwargs):
        """Log error message"""
        extra_data = json.dumps(kwargs, ensure_ascii=False) if kwargs else ""
        if error:
            self.logger.error(f"{message} | Error: {error} | {extra_data}", exc_info=True)
        else:
            self.logger.error(f"{message} {extra_data}")


def trace_step(step_name: str, description: str = ""):
    """Decorator to trace function execution as a step"""
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Try to find tracer in function context
            tracer = None
            
            # Check if first arg has tracer attribute (for class methods)
            if args and hasattr(args[0], 'tracer'):
                tracer = args[0].tracer
            # Check if tracer passed in kwargs
            elif 'tracer' in kwargs:
                tracer = kwargs.pop('tracer')
            
            if tracer:
                # Extract metadata from kwargs
                metadata = {
                    'function': func.__name__,
                    'module': func.__module__,
                }
                
                tracer.start_step(step_name, description, metadata)
                
                try:
                    result = func(*args, **kwargs)
                    tracer.end_step(result=result)
                    return result
                except Exception as e:
                    tracer.end_step(error=e)
                    raise
            else:
                # No tracer, execute normally
                return func(*args, **kwargs)
        
        return wrapper
    return decorator


def log_execution_time(logger: DebugLogger):
    """Decorator to log execution time"""
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            start_time = time.time()
            
            logger.debug(f"Started: {func.__name__}")
            
            try:
                result = func(*args, **kwargs)
                duration = time.time() - start_time
                
                logger.info(
                    f"Completed: {func.__name__}",
                    duration_ms=round(duration * 1000, 2),
                    status="success"
                )
                
                return result
            except Exception as e:
                duration = time.time() - start_time
                
                logger.error(
                    f"Failed: {func.__name__}",
                    error=e,
                    duration_ms=round(duration * 1000, 2),
                    status="error"
                )
                
                raise
        
        return wrapper
    return decorator


# Global logger instances for different systems
lma_rag_logger = DebugLogger("LMA_RAG")
ragflow_logger = DebugLogger("RAGFlow")
meeting_assistant_logger = DebugLogger("MeetingAssistant")


if __name__ == "__main__":
    # Test the debug logger
    print(f"{Colors.HEADER}Testing Debug Logger...{Colors.ENDC}\n")
    
    # Test LMA RAG Logger
    logger = lma_rag_logger
    tracer = logger.start_trace("TEST_LMA_RAG")
    
    # Step 1
    tracer.start_step("Query Processing", "Parse and validate user query", {"query": "What is RAG?"})
    time.sleep(0.1)
    tracer.add_checkpoint("Query validated")
    tracer.end_step(result={"parsed_query": "What is RAG?", "valid": True})
    
    # Step 2
    tracer.start_step("Embedding Generation", "Generate query embedding")
    time.sleep(0.2)
    tracer.add_checkpoint("Called Gemini API")
    tracer.end_step(result={"embedding_dim": 768, "embedding": [0.1, 0.2, "..."]})
    
    # Step 3
    tracer.start_step("Hybrid Search", "Search knowledge base")
    time.sleep(0.15)
    tracer.add_checkpoint("Vector search completed")
    tracer.add_checkpoint("Full-text search completed")
    tracer.end_step(result={"matches": 5, "top_score": 0.89})
    
    # Step 4
    tracer.start_step("Answer Generation", "Generate answer with Gemini")
    time.sleep(0.3)
    tracer.end_step(result={"answer": "RAG is Retrieval Augmented Generation..."})
    
    # End trace
    logger.end_trace(tracer.session_id)
    
    print(f"\n{Colors.OKGREEN}Test completed! Check log directory for output files.{Colors.ENDC}")


