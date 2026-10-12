# Generations Covered — Frontend (v3)

## User flow

1. **Eligibility** — Enter name, address, hospital, bill total, household size, income  
2. **Complete application** — If eligible, fill missing fields (SSN, DOB, email, facility, etc.)  
3. **Generate PDF + next steps** — Download a pre-filled hospital application PDF, see required documents, print or email

## Run locally

```bash
cd generations-covered-frontend
python3 -m http.server 5500
# open http://localhost:5500
```

Must be served over HTTP (not `file://`) so the fillable PDFs can load for generation.

## Deploy

Static site on Vercel (or any static host). Include the three PDF files in the deployment.

## API

`https://generations-covered-api.onrender.com`
# test-frontend
