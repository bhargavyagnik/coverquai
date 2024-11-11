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
app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["chrome-extension://*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class JobDetails(BaseModel):
    title: str
    company: str
    description: str

class CoverLetterRequest(BaseModel):
    job_details: JobDetails
    resume_text: str
    model: str = "llama-3.1-8b-instruct"  # default value

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

async def generate_cover_letter_stream(job_details: JobDetails,resume_text: str, model: str):
    async with httpx.AsyncClient() as client:
        try:
            if model == "llama-3.1-8b-instruct":

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
                            "content": "You are a professional cover letter writer. Provide only the cover letter content without any additional commentary, explanations, or formatting instructions. Start with 'Dear Hiring Manager,'. and end with 'Sincerely,'. Do not included [general purpose fill in the blank] in your response."
                        },
                        {
                            "role": "user",
                            "content": f"Write a professional cover letter for a {job_details.title} position at {job_details.company}. Use my resume details to highlight relevant experience. Format it as a standard business letter. Job description: {job_details.description}. Resume: {resume_text}"
                        }
                    ],
                    "stream": True
                },
                timeout=None
                )
            elif model =='mixtral-8x7b-32768':
                response = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={
                    "Authorization": f"Bearer {os.getenv('GROQ_API_KEY')}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": model,
                    "messages": [
                        {
                            "role": "system",
                            "content": "You are a professional cover letter writer. Provide only the cover letter content without any additional commentary, explanations, or formatting instructions. Start with 'Dear Hiring Manager,'. and end with 'Sincerely,'. Do not included [general purpose fill in the blank] in your response."
                        },
                        {
                            "role": "user",
                            "content": f"Write a professional cover letter for a {job_details.title} position at {job_details.company}. Use my resume details to highlight relevant experience. Format it as a standard business letter. Job description: {job_details.description}. Resume: {resume_text}"
                        }
                    ],
                    "stream": True
                },
                timeout=None
                )
            
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    try:
                        data = json.loads(line[6:])
                        if content := data.get("choices", [{}])[0].get("delta", {}).get("content"):
                            yield f"data: {json.dumps({'content': content})}\n\n"
                    except json.JSONDecodeError:
                        continue

                            
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"


@app.post("/generate-cover-letter")
async def generate_cover_letter(request: CoverLetterRequest):
    return StreamingResponse(
        generate_cover_letter_stream(
            request.job_details, 
            request.resume_text,
            request.model
        ),
        media_type="text/event-stream"
    )

@app.get("/health")
async def health_check():
    return {
        "status": "alive",
        "service": "cover-letter-generator"
    }