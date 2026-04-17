#!/usr/bin/env bash
set -o errexit

# Build the React frontend
cd frontend
npm install
npm run build
cd ..

# Install Python dependencies for the backend
cd backend
pip install -r requirements.txt
