#!/bin/bash
# Script để xem debug logs cho chatbot và RAG
# Usage: ./scripts/view-logs.sh [rag|pipeline|transcript|chatbot] [options]

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

show_help() {
    echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  Log Viewer - Chatbot & RAG Debug Logs${NC}"
    echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "Usage: ./scripts/view-logs.sh [TYPE] [OPTIONS]"
    echo ""
    echo "Types:"
    echo "  rag              - Xem RAG logs (chatbot AI, JSON format)"
    echo "  pipeline         - Xem pipeline transcription logs"
    echo "  transcript       - Xem transcript debug logs"
    echo "  chatbot          - Xem chatbot/gemini service logs"
    echo "  all              - Liệt kê tất cả logs có sẵn"
    echo ""
    echo "Options:"
    echo "  -f, --follow     - Theo dõi logs real-time (tail -f)"
    echo "  -n NUM           - Hiển thị NUM dòng cuối (default: 50)"
    echo "  -d DATE          - Xem logs theo ngày (YYYY-MM-DD, chỉ cho RAG)"
    echo "  -i ID            - Xem logs theo CallID/MeetingID"
    echo "  -p, --pretty     - Format JSON đẹp hơn (cho RAG logs)"
    echo "  -h, --help       - Hiển thị help này"
    echo ""
    echo "Examples:"
    echo "  ./scripts/view-logs.sh rag -f                    # Follow RAG logs hôm nay"
    echo "  ./scripts/view-logs.sh rag -d 2025-10-26         # Xem RAG logs ngày 26/10"
    echo "  ./scripts/view-logs.sh pipeline -i abc123 -f     # Follow pipeline log của call abc123"
    echo "  ./scripts/view-logs.sh transcript -i meeting-1   # Xem transcript log của meeting-1"
    echo "  ./scripts/view-logs.sh all                       # Liệt kê tất cả logs"
    echo ""
}

# Default values
FOLLOW=false
NUM_LINES=50
DATE=$(date +%Y-%m-%d)
LOG_ID=""
PRETTY=false

# Parse arguments
LOG_TYPE="${1:-}"
shift || true

while [[ $# -gt 0 ]]; do
    case $1 in
        -f|--follow)
            FOLLOW=true
            shift
            ;;
        -n)
            NUM_LINES="$2"
            shift 2
            ;;
        -d)
            DATE="$2"
            shift 2
            ;;
        -i)
            LOG_ID="$2"
            shift 2
            ;;
        -p|--pretty)
            PRETTY=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            show_help
            exit 1
            ;;
    esac
done

# Function to list all available logs
list_all_logs() {
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  Available Debug Logs${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo ""
    
    # RAG logs
    echo -e "${YELLOW}📊 RAG Logs (Chatbot/AI):${NC}"
    if [ -d "@log" ]; then
        find @log -name "*.jsonl" -type f -exec ls -lh {} \; 2>/dev/null | awk '{print "   ", $9, "(" $5 ")"}'
    else
        echo "   No RAG logs found"
    fi
    echo ""
    
    # Pipeline logs
    echo -e "${YELLOW}🔄 Pipeline Logs (Transcription):${NC}"
    if [ -d "debug-logs" ]; then
        find debug-logs -name "pipeline-*.txt" -type f -exec ls -lh {} \; 2>/dev/null | awk '{print "   ", $9, "(" $5 ")"}'
    else
        echo "   No pipeline logs found"
    fi
    echo ""
    
    # Transcript logs
    echo -e "${YELLOW}📝 Transcript Debug Logs:${NC}"
    if [ -d "debug-logs" ]; then
        find debug-logs -name "transcript-*.txt" -type f -exec ls -lh {} \; 2>/dev/null | awk '{print "   ", $9, "(" $5 ")"}'
    else
        echo "   No transcript logs found"
    fi
    echo ""
}

# Function to view RAG logs
view_rag_logs() {
    local log_dir="@log/$DATE"
    local log_file="$log_dir/rag.jsonl"
    
    if [ ! -f "$log_file" ]; then
        echo -e "${RED}Không tìm thấy RAG log cho ngày $DATE${NC}"
        echo -e "${YELLOW}Các ngày có logs:${NC}"
        if [ -d "@log" ]; then
            ls -1 @log/ 2>/dev/null || echo "   Chưa có logs"
        else
            echo "   Chưa có thư mục @log"
        fi
        exit 1
    fi
    
    echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  RAG Logs - $DATE${NC}"
    echo -e "${GREEN}  File: $log_file${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
    echo ""
    
    if [ "$FOLLOW" = true ]; then
        if [ "$PRETTY" = true ]; then
            tail -f "$log_file" | while read -r line; do
                echo "$line" | jq -C '.' 2>/dev/null || echo "$line"
            done
        else
            tail -f "$log_file"
        fi
    else
        if [ "$PRETTY" = true ]; then
            tail -n "$NUM_LINES" "$log_file" | while read -r line; do
                echo "$line" | jq -C '.' 2>/dev/null || echo "$line"
            done
        else
            tail -n "$NUM_LINES" "$log_file"
        fi
    fi
}

# Function to view pipeline logs
view_pipeline_logs() {
    local log_pattern="debug-logs/pipeline-*.txt"
    
    if [ -n "$LOG_ID" ]; then
        local sanitized_id="${LOG_ID//[^a-zA-Z0-9-]/_}"
        log_pattern="debug-logs/pipeline-${sanitized_id}.txt"
    fi
    
    local log_files=($(ls -t $log_pattern 2>/dev/null))
    
    if [ ${#log_files[@]} -eq 0 ]; then
        echo -e "${RED}Không tìm thấy pipeline logs${NC}"
        if [ -n "$LOG_ID" ]; then
            echo -e "${YELLOW}Không tìm thấy log cho CallID: $LOG_ID${NC}"
        fi
        exit 1
    fi
    
    local log_file="${log_files[0]}"
    
    echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  Pipeline Logs${NC}"
    echo -e "${GREEN}  File: $log_file${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
    echo ""
    
    if [ "$FOLLOW" = true ]; then
        tail -f "$log_file"
    else
        tail -n "$NUM_LINES" "$log_file"
    fi
}

# Function to view transcript logs
view_transcript_logs() {
    local log_pattern="debug-logs/transcript-*.txt"
    
    if [ -n "$LOG_ID" ]; then
        log_pattern="debug-logs/transcript-${LOG_ID}.txt"
    fi
    
    local log_files=($(ls -t $log_pattern 2>/dev/null))
    
    if [ ${#log_files[@]} -eq 0 ]; then
        echo -e "${RED}Không tìm thấy transcript logs${NC}"
        if [ -n "$LOG_ID" ]; then
            echo -e "${YELLOW}Không tìm thấy log cho MeetingID: $LOG_ID${NC}"
        fi
        exit 1
    fi
    
    local log_file="${log_files[0]}"
    
    echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  Transcript Logs${NC}"
    echo -e "${GREEN}  File: $log_file${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
    echo ""
    
    if [ "$FOLLOW" = true ]; then
        tail -f "$log_file"
    else
        tail -n "$NUM_LINES" "$log_file"
    fi
}

# Function to view chatbot/gemini logs
view_chatbot_logs() {
    # Chatbot logs are also RAG logs with service_name="gemini_chat_service"
    local log_dir="@log/$DATE"
    local log_file="$log_dir/rag.jsonl"
    
    if [ ! -f "$log_file" ]; then
        echo -e "${RED}Không tìm thấy chatbot log cho ngày $DATE${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  Chatbot Logs - $DATE${NC}"
    echo -e "${GREEN}  File: $log_file${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
    echo ""
    
    # Filter for gemini_chat_service logs only
    if [ "$FOLLOW" = true ]; then
        tail -f "$log_file" | grep "gemini_chat_service" | while read -r line; do
            if [ "$PRETTY" = true ]; then
                echo "$line" | jq -C '.' 2>/dev/null || echo "$line"
            else
                echo "$line"
            fi
        done
    else
        grep "gemini_chat_service" "$log_file" | tail -n "$NUM_LINES" | while read -r line; do
            if [ "$PRETTY" = true ]; then
                echo "$line" | jq -C '.' 2>/dev/null || echo "$line"
            else
                echo "$line"
            fi
        done
    fi
}

# Main logic
case "$LOG_TYPE" in
    rag)
        view_rag_logs
        ;;
    pipeline)
        view_pipeline_logs
        ;;
    transcript)
        view_transcript_logs
        ;;
    chatbot)
        view_chatbot_logs
        ;;
    all)
        list_all_logs
        ;;
    "")
        show_help
        ;;
    *)
        echo -e "${RED}Unknown log type: $LOG_TYPE${NC}"
        echo ""
        show_help
        exit 1
        ;;
esac

