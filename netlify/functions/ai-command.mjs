// Netlify Function: /.netlify/functions/ai-command
import { timingSafeEqual } from 'node:crypto';
const SYSTEM_PROMPT = `You are SEM Brain Real AI Backend v0.6. Return strict JSON only with strategicGoal, summary, riskLevel, tasks, approvals, memories. Tasks must be atomic, testable, approval-gated when risky.`;
function extractText(j){ if(typeof j.output_text==='string') return j.output_text; for(const item of j.output||[]) for(const c of item.content||[]) if(c.type==='output_text'&&c.text) return c.text; return JSON.stringify(j); }
// See api/ai-command.js for why this exists: no user session on this endpoint otherwise,
// so anyone with the URL could burn the OpenAI budget. Fails closed if unset.
function verifySharedSecret(providedKey){
  const expected = process.env.AI_COMMAND_SHARED_SECRET;
  if(!expected) return false;
  const a = Buffer.from(String(providedKey||'')); const b = Buffer.from(expected);
  if(a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
export async function handler(event) {
  if(event.httpMethod !== 'POST') return {statusCode:405, body:JSON.stringify({error:'POST only'})};
  if(!verifySharedSecret((event.headers||{})['x-sem-ai-key'])) return {statusCode:401, body:JSON.stringify({error:'Unauthorized'})};
  try{
    const body=JSON.parse(event.body||'{}');
    if(!process.env.OPENAI_API_KEY) return {statusCode:500, body:JSON.stringify({error:'OPENAI_API_KEY is not configured'})};
    const model=process.env.OPENAI_MODEL || body.tokenPlan?.model || 'gpt-4.1-mini';
    const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model,input:[{role:'system',content:SYSTEM_PROMPT},{role:'user',content:JSON.stringify(body,null,2)}],temperature:0.2})});
    const j=await r.json(); if(!r.ok) return {statusCode:r.status, body:JSON.stringify({error:j.error?.message||'OpenAI API error',details:j})};
    const text=extractText(j).trim(); let result; try{result=JSON.parse(text)}catch(e){return {statusCode:502,body:JSON.stringify({error:'Model returned invalid JSON',raw:text})}};
    return {statusCode:200, body:JSON.stringify({result,model,usage:j.usage||null})};
  }catch(e){return {statusCode:500,body:JSON.stringify({error:e.message})};}
}
