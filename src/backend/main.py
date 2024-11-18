from fastapi import FastAPI, UploadFile, HTTPException, Depends, Header, Request
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
from datetime import datetime, date

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
    allow_origins=[
        "chrome-extension://*",
        "http://localhost:8000",
        "https://accounts.google.com",
        "https://*.googleusercontent.com",
        "https://oauth2.googleapis.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "X-Requested-With",
        "Accept",
        "Origin",
        "Access-Control-Request-Method",
        "Access-Control-Request-Headers",
        "Access-Control-Allow-Origin",
    ],
    expose_headers=["*"],
    max_age=600,  # Cache preflight requests for 10 minutes
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

class RefreshTokenRequest(BaseModel):
    refresh_token: str

# Add new auth model
class GoogleAuthRequest(BaseModel):
    credential: str  # This will be the ID token from Google

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
        print(e)
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

@app.post("/auth/google")
async def google_auth(request: GoogleAuthRequest):
    try:
        print(request.credential)
        # Verify the Google token and sign in/up with Supabase
        response = supabase.auth.sign_in_with_id_token({
            "provider": "google",
            "token": request.credential
        })
        print(response.dict())
        return response.dict()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/upload-resume")
async def upload_resume(file: UploadFile,user = Depends(verify_token)):
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
    userid: str,
    status: str = 'started',
    error: str = None,
):
    try:
        data = {
            'id': request_id,
            'job_title': job_details.title,
            'company': job_details.company,
            'job_descr': job_details.description,
            'model': model,
            'resume_preview': resume_preview,
            'userid': userid,
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

async def generate_cover_letter_stream(job_details: JobDetails, resume_text: str, model: str, system_prompt: str,userid:str):
    request_id = str(uuid.uuid4())
    
    # Store initial request
    await store_generation_request(request_id, job_details, model,resume_text[:500],userid)
    
    logger.info(
        f"Starting generation for request {request_id} | "
        f"Model: {model} | "
        f"Resume Preview: {resume_text[:10]} | "
        f"User ID: {userid}"
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
async def generate_cover_letter(request: CoverLetterRequest,user = Depends(verify_token)):
    logger.info(f"Received cover letter request for {request.job_details.company}")
    return StreamingResponse(
        generate_cover_letter_stream(
            request.job_details, 
            request.resume_text,
            request.model,
            request.system_prompt,
            user.user.id
        ),
        media_type="text/event-stream"
    )

@app.get("/health")
async def health_check():
    return {
        "status": "alive",
        "service": "cover-letter-generator"
    }

@app.get("/auth/verify")
async def verify_access_token(user = Depends(verify_token)):
    try:
        return {
            "valid": True,
            "user": {
                "id": user.user.id,
                "email": user.user.email
            }
        }
    except Exception as e:
        logger.error(f"Token verification failed: {str(e)}")
        raise HTTPException(status_code=401, detail="Invalid token")
    
@app.post("/auth/refresh")
async def refresh_token(request: RefreshTokenRequest):
    try:
        response = supabase.auth.refresh_session(request.refresh_token)
        return {
            "access_token": response.session.access_token,
            "refresh_token": response.session.refresh_token
        }
    except Exception as e:
        logger.error(f"Token refresh failed: {str(e)}")
        raise HTTPException(status_code=401, detail="Invalid refresh token")

@app.get("/countgenerations")
async def count_generations(user = Depends(verify_token)):
    try:
        # Get today's date in UTC
        today = datetime.now().strftime('%Y-%m-%d')
        
        # Query Supabase using proper timestamp comparison
        response = supabase.table('cover_letter_requests')\
            .select('id')\
            .eq('userid', user.user.id)\
            .gte('created_at', f'{today}T00:00:00')\
            .lt('created_at', f'{today}T23:59:59')\
            .execute()
            
        count = len(response.data)
        return {"count": count}
    except Exception as e:
        logger.error(f"Failed to count generations: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))