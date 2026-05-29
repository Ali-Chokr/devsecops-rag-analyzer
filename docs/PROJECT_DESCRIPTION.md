Automated DevSecOps Log & Incident Analyzer
Modern production systems generate massive amounts of logs across distributed infrastructure. When an outage occurs, engineers often spend hours manually searching through CI/CD logs, Kubernetes events, Ansible playbooks, and deployment histories.

This project introduces an AI‑powered, hybrid‑search RAG system designed specifically for DevSecOps workflows. It correlates infrastructure configuration, deployment history, and real‑time logs to instantly identify the most likely root cause of an incident.

🚀 Overview
The system ingests:

Infrastructure configuration files (Ansible, Terraform, Kubernetes)

CI/CD pipeline logs

Real‑time server logs and error traces

It then uses a Hybrid Retrieval strategy:

Dense vector search for semantic understanding of logs

Sparse BM25 keyword search for exact matches (error codes, IPs, IDs)

This enables queries like:

“We got error code X‑402 on the production server. Based on our deployment scripts and past logs, what configuration change likely caused this?”

🏗️ Architecture
Core Components
Component	Technology	Reason
Frontend UI	Angular	Real‑time dashboards, incident timelines, chat interface
Backend API	NestJS	Modular, scalable API gateway for logs, webhooks, and frontend requests
RAG / AI Engine	Python (FastAPI + LangChain)	Strong AI ecosystem, built‑in hybrid retrievers
Database	PostgreSQL + pgvector	Stores metadata, logs, embeddings, and supports BM25‑like search
Infrastructure Sources	Kubernetes, Ansible, GitLab CI/CD	Primary ingestion sources
Deployment	Docker + AWS	Containerized microservices deployed on EC2/EKS


🗺️ Implementation Plan
Phase 1 — Data Ingestion & Processing Pipeline
1. Webhooks & Log Forwarding
Configure GitLab CI/CD to send pipeline logs to the NestJS backend.

Forward runtime logs from servers or Kubernetes clusters.

2. Infrastructure State Scraping
Periodically fetch:

Kubernetes manifests

Ansible playbooks

Deployment scripts

Store raw versions + parsed metadata.

3. Chunking Strategy
Configs: Chunk by logical units (e.g., one Ansible task or one K8s Deployment).

Logs: Chunk by timestamp windows or traceback boundaries.

4. Metadata Tagging
Each chunk is tagged with:

Timestamp

Environment (prod/staging/dev)

Source type (K8s, Ansible, CI/CD)

Related service or microservice

This enables pre‑filtering before retrieval.

Phase 2 — Hybrid RAG Engine (The Twist)
1. Dense Embeddings
Use models like text-embedding-3-small or BGE-m3.

Store vectors in PostgreSQL via pgvector.

2. Sparse Keyword Indexing
Apply BM25 indexing to the same chunks.

Ensures exact matches for:

Error codes

IP addresses

Database IDs

Stack trace signatures

3. Ensemble Retriever
Use LangChain’s hybrid retriever or build a custom one.

Run dense + sparse searches in parallel.

4. Reciprocal Rank Fusion (RRF)
Merge results mathematically.

Ensures the most semantically relevant and keyword‑matching chunks rise to the top.

Phase 3 — Backend Orchestration & AI Agent
1. NestJS API Gateway
Exposes endpoints for:

Querying incidents

Receiving logs

Triggering ingestion

Streaming AI responses

2. Context Assembly
When a user queries an error:

Python engine retrieves top‑ranked chunks.

Backend assembles a structured prompt:

Code
You are a DevSecOps assistant. The user reported error X‑402.
Here are the most relevant deployment logs and configuration files:
[Top Chunks]
What is the most likely root cause?
3. LLM Response Streaming
Stream the answer back to the Angular frontend for real‑time interaction.

Phase 4 — Frontend Dashboard
1. Chat Interface
Engineers can query errors, logs, or incidents.

Supports natural language queries.

2. Context Visualizer
Highlights which files/logs the AI used.

Shows exact lines referenced.

Builds trust and transparency.

3. Real‑Time Updates
WebSockets/Socket.IO push:

New CI/CD failures

New error logs

Deployment events

Phase 5 — Containerization & Deployment
1. Dockerization
Create Dockerfiles for:

Angular frontend

NestJS backend

Python RAG engine

Local development uses docker-compose.

2. Cloud Deployment (AWS)
Deploy containers to EC2 or EKS.

Use S3 for:

Long‑term log storage

Historical audit data

3. Local LLM Hosting
Run an open‑source model locally for privacy.

Ensures infrastructure logs never leave your environment.