# Coverquai - AI Cover Letter Generator

<p align="center">
  <img src="src/extension/icons/icon128.png" alt="Extension Logo" width="200"/>
</p>

[![Release](https://github.com/bhargavyagnik/coverquai/actions/workflows/release.yml/badge.svg)](https://github.com/bhargavyagnik/coverquai/actions/workflows/release.yml)
[![GitHub release (latest by date)](https://img.shields.io/github/v/release/bhargavyagnik/coverquai)](https://github.com/bhargavyagnik/coverquai/releases)
[![License](https://img.shields.io/github/license/bhargavyagnik/coverquai)](LICENSE)

A Chrome extension that automatically generates personalized cover letters using AI, based on your resume and job descriptions.

## ✨ Features

- 🤖 AI-powered cover letter generation using Llama and Mixtral models
- 📄 PDF resume parsing and storage
- 🔄 Automatic job description scraping from LinkedIn, many more to come.
- 💾 Save and manage default resume
- 📝 Real-time cover letter preview
- ⬇️ Export to PDF with customizable formatting
- 🎨 Clean, modern user interface

## 📥 Installation

### From Chrome Web Store
1. Visit the [Chrome Web Store](#)
2. Click "Add to Chrome"
3. Follow the installation prompts

### Manual Installation (Developer Mode)
1. Download the latest release from the [Releases page](https://github.com/bhargavyagnik/coverquai/releases)
2. Unzip the downloaded file
3. Open Chrome and go to `chrome://extensions/`
4. Enable "Developer mode" in the top right
5. Click "Load unpacked"
6. Select the unzipped folder

## 🔧 Developer Mode

### Prerequisites
- Python 3.8+
- Perplexity API / Groq API or any LLM API

### Backend setup
```bash
cd src/backend
pip install -r requirements.txt
uvicorn main:app --reload
```

## ☕️ Support

If you find this project helpful, consider [buying me a coffee](https://buymeacoffee.com/bhargavyagnik)!

## 🙏 Acknowledgments

- [FastAPI](https://fastapi.tiangolo.com/) for the backend framework
- [Perplexity AI](https://www.perplexity.ai/) and [Groq](https://groq.com/) for AI models
- [jsPDF](https://github.com/parallax/jsPDF) for PDF generation
- [Freepik](https://www.freepik.com/icon/cover-letter_8521804#fromView=keyword&page=1&position=56&uuid=97ebf9ad-e466-45a4-9430-57a5f3d436db) for Icon