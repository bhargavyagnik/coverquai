from fastapi import FastAPI, UploadFile, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import PyPDF2
import io
import json
from typing import Optional, Annotated
from pydantic import BaseModel
import httpx
import os
import logging
import uuid
from supabase import create_client, Client
from datetime import datetime

app = FastAPI()

master_prompt = """
You are a professional cover letter writer. Provide only the cover letter content without any additional commentary, explanations, or formatting instructions. 
Do not included any extra text like [general purpose fill in the blank], or any other instructions in your response.
"""

# Initialize Supabase client
supabase: Client = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_KEY")
)

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
    handlers=[
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Initialize Supabase client
supabase = create_client(
    os.getenv('SUPABASE_URL'),
    os.getenv('SUPABASE_KEY')
)

class JobDetails(BaseModel):
    title: str
    company: str
    description: str

class CoverLetterRequest(BaseModel):
    job_details: JobDetails
    resume_text: str
    model: str = "llama-3.1-8b-instruct"
    system_prompt: str

# New auth models
class SignUpRequest(BaseModel):
    email: str
    password: str

class SignInRequest(BaseModel):
    email: str
    password: str

# Auth dependency
async def verify_token(authorization: Annotated[str | None, Header()] = None):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    
    token = authorization.split(" ")[1]
    try:
        user = supabase.auth.get_user(token)
        return user
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid token")

# New auth endpoints
@app.post("/auth/signup")
async def signup(request: SignUpRequest):
    try:
        response = supabase.auth.sign_up({
            "email": request.email,
            "password": request.password
        })
        return response.dict()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/auth/login")
async def login(request: SignInRequest):
    try:
        response = supabase.auth.sign_in_with_password({
            "email": request.email,
            "password": request.password
        })
        return response.dict()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/auth/logout")
async def logout(user = Depends(verify_token)):
    try:
        response = supabase.auth.sign_out()
        return {"message": "Successfully logged out"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/upload-resume")
async def upload_resume(file: UploadFile, user = Depends(verify_token)):
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

async def store_generation_request(
    request_id: str,
    job_details: JobDetails,
    model: str,
    resume_preview: str,
    status: str = 'started',
    error: str = None,
):
    try:
        data = {
            'id': request_id,
            'job_title': job_details.title,
            'company': job_details.company,
            'model': model,
            'resume_preview': resume_preview,
            'response_status': status,
            'error': error,
            'created_at': datetime.utcnow().isoformat(),
        }
        supabase.table('cover_letter_requests').insert(data).execute()
    except Exception as e:
        logger.error(f"Failed to store request in Supabase: {str(e)}")

async def update_generation_status(request_id: str, status: str, error: str = None):
    try:
        data = {
            'response_status': status,
            'error': error,
            'updated_at': datetime.utcnow().isoformat()
        }
        supabase.table('cover_letter_requests').update(data).eq('id', request_id).execute()
    except Exception as e:
        logger.error(f"Failed to update request status in Supabase: {str(e)}")

async def generate_cover_letter_stream(job_details: JobDetails, resume_text: str, model: str, system_prompt: str):
    request_id = str(uuid.uuid4())
    
    # Store initial request
    await store_generation_request(request_id, job_details, model,resume_text[:500])
    
    logger.info(
        f"Starting generation for request {request_id} | "
        f"Model: {model} | "
        f"Resume Preview: {resume_text[:10]}"
    )

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
                logger.info(f"Request {request_id} completed successfully")
                await update_generation_status(request_id, 'completed')
                
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
                logger.info(f"Request {request_id} completed successfully")
                await update_generation_status(request_id, 'completed')
                
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
            logger.error(f"Error in request {request_id}: {str(e)}", exc_info=True)
            await update_generation_status(request_id, 'failed', str(e))
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