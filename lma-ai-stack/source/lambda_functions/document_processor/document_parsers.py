#!/usr/bin/env python3
# Copyright (c) 2025
# This file is licensed under the MIT License.

"""
Document Parsers for RAG Knowledge Base
Supports: PDF, DOCX, PPTX, XLSX, TXT, MD
"""

import os
import re
import io
import logging
from typing import List, Dict, Any, Optional
from pathlib import Path

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def num_tokens_from_string(text: str) -> int:
    """Estimate token count (rough approximation: 1 token ≈ 4 characters)"""
    return len(text) // 4


class TextParser:
    """Parser for plain text files"""
    
    @staticmethod
    def parse(file_content: bytes, filename: str) -> str:
        """Parse text file"""
        try:
            # Try UTF-8 first
            return file_content.decode('utf-8')
        except UnicodeDecodeError:
            # Fallback to latin-1
            return file_content.decode('latin-1', errors='ignore')


class MarkdownParser:
    """Parser for Markdown files"""
    
    @staticmethod
    def parse(file_content: bytes, filename: str) -> str:
        """Parse markdown file"""
        try:
            text = file_content.decode('utf-8')
            # Remove code blocks for cleaner indexing
            text = re.sub(r'```[\s\S]*?```', '[CODE BLOCK]', text)
            # Remove inline code
            text = re.sub(r'`[^`]+`', '[CODE]', text)
            # Remove images
            text = re.sub(r'!\[([^\]]*)\]\([^\)]+\)', r'[Image: \1]', text)
            return text
        except Exception as e:
            logger.error(f"Error parsing markdown: {str(e)}")
            return file_content.decode('utf-8', errors='ignore')


class PDFParser:
    """Parser for PDF files using PyPDF2"""
    
    @staticmethod
    def parse(file_content: bytes, filename: str) -> str:
        """Parse PDF file"""
        try:
            import PyPDF2
            
            pdf_file = io.BytesIO(file_content)
            pdf_reader = PyPDF2.PdfReader(pdf_file)
            
            text_parts = []
            for page_num, page in enumerate(pdf_reader.pages):
                text = page.extract_text()
                if text.strip():
                    text_parts.append(f"[Page {page_num + 1}]\n{text}")
            
            return "\n\n".join(text_parts)
        
        except Exception as e:
            logger.error(f"Error parsing PDF with PyPDF2: {str(e)}")
            # Fallback to pdfplumber if available
            try:
                import pdfplumber
                
                pdf_file = io.BytesIO(file_content)
                text_parts = []
                
                with pdfplumber.open(pdf_file) as pdf:
                    for page_num, page in enumerate(pdf.pages):
                        text = page.extract_text()
                        if text:
                            text_parts.append(f"[Page {page_num + 1}]\n{text}")
                
                return "\n\n".join(text_parts)
            
            except Exception as e2:
                logger.error(f"Error parsing PDF with pdfplumber: {str(e2)}")
                return f"Error parsing PDF: {str(e2)}"


class DOCXParser:
    """Parser for DOCX files using python-docx"""
    
    @staticmethod
    def parse(file_content: bytes, filename: str) -> str:
        """Parse DOCX file"""
        try:
            from docx import Document
            
            docx_file = io.BytesIO(file_content)
            doc = Document(docx_file)
            
            text_parts = []
            
            # Extract paragraphs
            for para in doc.paragraphs:
                if para.text.strip():
                    text_parts.append(para.text)
            
            # Extract tables
            for table_idx, table in enumerate(doc.tables):
                table_text = f"\n[Table {table_idx + 1}]\n"
                for row in table.rows:
                    row_text = " | ".join([cell.text.strip() for cell in row.cells])
                    if row_text.strip():
                        table_text += row_text + "\n"
                text_parts.append(table_text)
            
            return "\n\n".join(text_parts)
        
        except Exception as e:
            logger.error(f"Error parsing DOCX: {str(e)}")
            return f"Error parsing DOCX: {str(e)}"


class PPTXParser:
    """Parser for PPTX files using python-pptx"""
    
    @staticmethod
    def parse(file_content: bytes, filename: str) -> str:
        """Parse PPTX file"""
        try:
            from pptx import Presentation
            
            pptx_file = io.BytesIO(file_content)
            prs = Presentation(pptx_file)
            
            text_parts = []
            
            for slide_num, slide in enumerate(prs.slides):
                slide_text = f"[Slide {slide_num + 1}]\n"
                
                for shape in slide.shapes:
                    if hasattr(shape, "text") and shape.text.strip():
                        slide_text += shape.text + "\n"
                    
                    # Extract table content
                    if shape.has_table:
                        table = shape.table
                        for row in table.rows:
                            row_text = " | ".join([cell.text.strip() for cell in row.cells])
                            if row_text.strip():
                                slide_text += row_text + "\n"
                
                if slide_text.strip() != f"[Slide {slide_num + 1}]":
                    text_parts.append(slide_text)
            
            return "\n\n".join(text_parts)
        
        except Exception as e:
            logger.error(f"Error parsing PPTX: {str(e)}")
            return f"Error parsing PPTX: {str(e)}"


class XLSXParser:
    """Parser for XLSX files using openpyxl"""
    
    @staticmethod
    def parse(file_content: bytes, filename: str) -> str:
        """Parse XLSX file"""
        try:
            from openpyxl import load_workbook
            
            xlsx_file = io.BytesIO(file_content)
            workbook = load_workbook(xlsx_file, data_only=True)
            
            text_parts = []
            
            for sheet_name in workbook.sheetnames:
                sheet = workbook[sheet_name]
                sheet_text = f"[Sheet: {sheet_name}]\n"
                
                for row in sheet.iter_rows(values_only=True):
                    row_text = " | ".join([str(cell) if cell is not None else "" for cell in row])
                    if row_text.strip():
                        sheet_text += row_text + "\n"
                
                if sheet_text.strip() != f"[Sheet: {sheet_name}]":
                    text_parts.append(sheet_text)
            
            return "\n\n".join(text_parts)
        
        except Exception as e:
            logger.error(f"Error parsing XLSX: {str(e)}")
            return f"Error parsing XLSX: {str(e)}"


class DocumentParserFactory:
    """Factory to get the appropriate parser for a file type"""
    
    PARSERS = {
        '.txt': TextParser,
        '.md': MarkdownParser,
        '.pdf': PDFParser,
        '.docx': DOCXParser,
        '.pptx': PPTXParser,
        '.xlsx': XLSXParser,
    }
    
    @classmethod
    def get_parser(cls, filename: str):
        """Get parser based on file extension"""
        ext = Path(filename).suffix.lower()
        parser = cls.PARSERS.get(ext)
        
        if not parser:
            raise ValueError(f"Unsupported file type: {ext}")
        
        return parser
    
    @classmethod
    def parse_document(cls, file_content: bytes, filename: str) -> str:
        """Parse document and return extracted text"""
        parser = cls.get_parser(filename)
        return parser.parse(file_content, filename)


class TextChunker:
    """Chunk text into smaller pieces for embedding"""
    
    def __init__(self, chunk_size: int = 512, overlap: int = 50):
        """
        Initialize chunker
        
        Args:
            chunk_size: Target chunk size in tokens
            overlap: Number of tokens to overlap between chunks
        """
        self.chunk_size = chunk_size
        self.overlap = overlap
    
    def chunk_by_sentences(self, text: str) -> List[str]:
        """
        Chunk text by sentences with overlap
        
        Args:
            text: Text to chunk
        
        Returns:
            List of text chunks
        """
        # Split into sentences
        sentence_pattern = r'(?<=[.!?])\s+'
        sentences = re.split(sentence_pattern, text)
        
        chunks = []
        current_chunk = []
        current_tokens = 0
        
        for sentence in sentences:
            sentence_tokens = num_tokens_from_string(sentence)
            
            # If adding this sentence exceeds chunk size, save current chunk
            if current_tokens + sentence_tokens > self.chunk_size and current_chunk:
                chunks.append(" ".join(current_chunk))
                
                # Keep last few sentences for overlap
                overlap_sentences = []
                overlap_tokens = 0
                for s in reversed(current_chunk):
                    s_tokens = num_tokens_from_string(s)
                    if overlap_tokens + s_tokens <= self.overlap:
                        overlap_sentences.insert(0, s)
                        overlap_tokens += s_tokens
                    else:
                        break
                
                current_chunk = overlap_sentences
                current_tokens = overlap_tokens
            
            current_chunk.append(sentence)
            current_tokens += sentence_tokens
        
        # Add final chunk
        if current_chunk:
            chunks.append(" ".join(current_chunk))
        
        return chunks
    
    def chunk_by_paragraphs(self, text: str) -> List[str]:
        """
        Chunk text by paragraphs with size limits
        
        Args:
            text: Text to chunk
        
        Returns:
            List of text chunks
        """
        paragraphs = text.split('\n\n')
        chunks = []
        current_chunk = []
        current_tokens = 0
        
        for para in paragraphs:
            para = para.strip()
            if not para:
                continue
            
            para_tokens = num_tokens_from_string(para)
            
            # If paragraph itself is too large, split it by sentences
            if para_tokens > self.chunk_size:
                # Save current chunk first
                if current_chunk:
                    chunks.append("\n\n".join(current_chunk))
                    current_chunk = []
                    current_tokens = 0
                
                # Split large paragraph
                para_chunks = self.chunk_by_sentences(para)
                chunks.extend(para_chunks)
                continue
            
            # If adding this paragraph exceeds chunk size, save current chunk
            if current_tokens + para_tokens > self.chunk_size and current_chunk:
                chunks.append("\n\n".join(current_chunk))
                current_chunk = [para]
                current_tokens = para_tokens
            else:
                current_chunk.append(para)
                current_tokens += para_tokens
        
        # Add final chunk
        if current_chunk:
            chunks.append("\n\n".join(current_chunk))
        
        return chunks
    
    def chunk_text(self, text: str, strategy: str = 'paragraphs') -> List[str]:
        """
        Chunk text using specified strategy
        
        Args:
            text: Text to chunk
            strategy: 'sentences' or 'paragraphs'
        
        Returns:
            List of text chunks
        """
        if strategy == 'sentences':
            return self.chunk_by_sentences(text)
        else:
            return self.chunk_by_paragraphs(text)


# For testing
if __name__ == "__main__":
    # Test text parser
    test_text = "This is a test document.\n\nIt has multiple paragraphs.\n\nEach paragraph is separated by blank lines."
    
    chunker = TextChunker(chunk_size=20, overlap=5)
    chunks = chunker.chunk_text(test_text, strategy='paragraphs')
    
    print(f"Original text length: {len(test_text)}")
    print(f"Number of chunks: {len(chunks)}")
    for i, chunk in enumerate(chunks):
        print(f"\nChunk {i+1}:")
        print(chunk)


