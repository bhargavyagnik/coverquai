from fastapi import FastAPI, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import PyPDF2
import io
import json
from typing import Optional
from pydantic import BaseModel
import httpx
import os
import csv
from datetime import datetime
import logging
import uuid

app = FastAPI()

master_prompt = """
You are a professional cover letter writer. Provide only the cover letter content without any additional commentary, explanations, or formatting instructions. 
Do not included any extra text like [general purpose fill in the blank], or any other instructions in your response.
"""

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["chrome-extension://*","http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    filename='api_calls.log'
)
logger = logging.getLogger(__name__)

class JobDetails(BaseModel):
    title: str
    company: str
    description: str

class CoverLetterRequest(BaseModel):
    job_details: JobDetails
    resume_text: str
    model: str = "llama-3.1-8b-instruct"
    system_prompt: str

@app.post("/upload-resume")
async def upload_resume(file: UploadFile):
    try:
        content = await file.read()
        
        if file.filename.endswith('.pdf'):
            # Parse PDF
            pdf_reader = PyPDF2.PdfReader(io.BytesIO(content))
            text = ""
            for page in pdf_reader.pages:
                text += page.extract_text()
        elif file.filename.endswith('.txt'):
            # Parse text file
            text = content.decode('utf-8')
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type")
        
        return {"success": True, "resume_text": text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def log_to_csv(data: dict):
    fieldnames = ['timestamp', 'request_id', 'model', 'resume_preview', 'job_title', 'company', 'status']
    try:
        file_exists = os.path.isfile('api_calls.csv')
        with open('api_calls.csv', 'a', newline='') as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            if not file_exists:
                writer.writeheader()
            writer.writerow(data)
    except Exception as e:
        logger.error(f"Error writing to CSV: {str(e)}")

async def generate_cover_letter_stream(job_details: JobDetails, resume_text: str, model: str, system_prompt: str):
    request_id = str(uuid.uuid4())
    logger.info(f"Starting generation for request {request_id}")
    
    # Log the request to CSV
    log_data = {
        'timestamp': datetime.now().isoformat(),
        'request_id': request_id,
        'model': model,
        'resume_preview': resume_text[:100],
        'job_title': job_details.title,
        'company': job_details.company,
        'status': 'started'
    }
    log_to_csv(log_data)

    async with httpx.AsyncClient() as client:
        try:
            if model == "llama-3.1-8b-instruct":
                logger.info(f"Calling Perplexity API for request {request_id}")
                response = await client.post(
                    "https://api.perplexity.ai/chat/completions",
                    headers={
                        "Authorization": f"Bearer {os.getenv('PERPLEXITY_API_KEY')}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": model,
                        "messages": [
                            {
                                "role": "system",
                                "content": master_prompt+system_prompt.format(position=job_details.title, company=job_details.company, description=job_details.description)
                            },
                            {
                                "role": "user",
                                "content": f"Write a professional cover letter for a {job_details.title} position at {job_details.company}. Use my resume details to highlight relevant experience. Format it as a standard business letter. Job description: {job_details.description}. Resume: {resume_text}"
                            }
                        ],
                        "stream": True
                    },
                    timeout=None)
                # Update CSV with completion status
                log_data['status'] = 'completed'
                log_to_csv(log_data)
                
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        try:
                            data = json.loads(line[6:])
                            if content := data.get("choices", [{}])[0].get("delta", {}).get("content"):
                                yield f"data: {json.dumps({'content': content})}\n\n"
                        except json.JSONDecodeError:
                            continue
            else:
                logger.info(f"Calling Groq API for request {request_id}")
                response = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={
                    "Authorization": f"Bearer {os.getenv('GROQ_API_KEY')}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "mixtral-8x7b-32768",
                    "messages": [
                        {
                            "role": "system",
"content": master_prompt+system_prompt.format(position=job_details.title, company=job_details.company, description=job_details.description)
                        },
                        {
                            "role": "user",
                            "content": f"Write a professional cover letter for a {job_details.title} position at {job_details.company}. Use my resume details to highlight relevant experience. Format it as a standard business letter. Job description: {job_details.description}. Resume: {resume_text}"
                        }
                    ],
                    "stream": True,
                })
                # Update CSV with completion status
                log_data['status'] = 'completed'
                log_to_csv(log_data)
                
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        try:
                            if line.strip() == "data: [DONE]":
                                break
                                
                            data = json.loads(line[6:])  # Remove "data: " prefix
                            if content := data.get("choices", [{}])[0].get("delta", {}).get("content"):
                                yield f"data: {json.dumps({'content': content})}\n\n"
                        except json.JSONDecodeError:
                            continue

        except Exception as e:
            logger.error(f"Error in request {request_id}: {str(e)}")
            # Log error status to CSV
            log_data['status'] = f'error: {str(e)}'
            log_to_csv(log_data)
            yield f"data: {json.dumps({'error': str(e)})}\n\n"


@app.post("/generate-cover-letter")
async def generate_cover_letter(request: CoverLetterRequest):
    logger.info(f"Received cover letter request for {request.job_details.company}")
    return StreamingResponse(
        generate_cover_letter_stream(
            request.job_details, 
            request.resume_text,
            request.model,
            request.system_prompt
        ),
        media_type="text/event-stream"
    )

@app.get("/health")
async def health_check():
    return {
        "status": "alive",
        "service": "cover-letter-generator"
    }