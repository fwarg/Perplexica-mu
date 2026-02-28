import os
from typing import List
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from rlm import RLM

app = FastAPI()

SYSTEM_PROMPT = """You are given a set of web search results in the `context` variable (a list of strings).
Your task is to extract and synthesise the key facts relevant to the query.
Use llm_query to process chunks of results and accumulate relevant information.
Preserve specific facts, numbers, and citations (result index numbers).
When done, output a concise but complete synthesis using FINAL(your_answer)."""

RLM_MODEL = os.environ.get("RLM_MODEL", "")
OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "local")


class Finding(BaseModel):
    title: str
    content: str


class SummarizeRequest(BaseModel):
    findings: List[Finding]
    query: str


class SummarizeResponse(BaseModel):
    condensed: str


@app.post("/summarize", response_model=SummarizeResponse)
async def summarize(req: SummarizeRequest):
    if not RLM_MODEL:
        raise HTTPException(status_code=500, detail="RLM_MODEL env var not set")

    context_str = "\n\n".join(
        f"[{i + 1}] {f.title}\n{f.content}" for i, f in enumerate(req.findings)
    )

    backend_kwargs: dict = {"model_name": RLM_MODEL}
    if OPENAI_BASE_URL:
        backend_kwargs["base_url"] = OPENAI_BASE_URL
    if OPENAI_API_KEY:
        backend_kwargs["api_key"] = OPENAI_API_KEY

    try:
        rlm = RLM(
            backend="openai",
            backend_kwargs=backend_kwargs,
            environment="local",
            max_depth=1,
            max_iterations=8,
            custom_system_prompt=SYSTEM_PROMPT,
            compaction=False,
        )
        result = rlm.completion(prompt=context_str, root_prompt=req.query)
        return SummarizeResponse(condensed=result.response)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
