'use strict';
const { createHash } = require('node:crypto');
const unsafe = new Set(['__proto__', 'prototype', 'constructor']);
class ConnectorError extends Error {
 constructor(code, retryAfterMs) {
  super(code); this.name='ConnectorError'; this.code=code;
  this.retryable=['NETWORK','TIMEOUT','RATE_LIMIT','TEMPORARY'].includes(code);
  this.retryAfterMs=retryAfterMs;
 }
}
function canonical(value) {
 if (value === null || typeof value !== 'object') return JSON.stringify(value);
 if (Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
 return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
}
function fingerprint(value) { return createHash('sha256').update(canonical(value)).digest('hex'); }
function validatePolicy(p) {
 if (!p || !Number.isSafeInteger(p.maxAttempts) || p.maxAttempts<1 ||
 !Number.isSafeInteger(p.baseDelayMs) || p.baseDelayMs<1 ||
 !Number.isSafeInteger(p.maxDelayMs) || p.maxDelayMs<p.baseDelayMs || p.maxDelayMs>2147483647 ||
 !Number.isSafeInteger(p.timeoutMs) || p.timeoutMs<1 || p.timeoutMs>2147483647 ||
 !Number.isFinite(p.jitter) || p.jitter<0 || p.jitter>1) throw Error('INVALID_RETRY_POLICY');
}
function retryDelay(p, attempt, random, retryAfterMs=0) {
 validatePolicy(p);
 if (!Number.isSafeInteger(attempt)||attempt<1||!Number.isFinite(random)||random<0||random>1||!Number.isSafeInteger(retryAfterMs)||retryAfterMs<0) throw Error('INVALID_RETRY_POLICY');
 const base=Math.min(p.maxDelayMs,p.baseDelayMs*2**Math.min(attempt-1,31));
 return Math.max(retryAfterMs,Math.floor(Math.min(p.maxDelayMs,base*(1-p.jitter+2*p.jitter*random))));
}
function mapRecord(input, rules) {
 if (!Array.isArray(rules)||!rules.length) throw new ConnectorError('MAPPING_INVALID');
 const output={}; const targets=new Set();
 for (const rule of rules) {
  if (!rule || !Array.isArray(rule.from)||!rule.from.length||rule.from.some(k=>typeof k!=='string'||!k||unsafe.has(k))||typeof rule.to!=='string'||!rule.to||unsafe.has(rule.to)||targets.has(rule.to)) throw new ConnectorError('MAPPING_INVALID');
  targets.add(rule.to);
  let value=input;
  for (const key of rule.from) value=value && typeof value==='object' && Object.hasOwn(value,key)?value[key]:undefined;
  if (value===undefined) { if(rule.required) throw new ConnectorError('MAPPING_MISSING'); continue; }
  if (rule.dictionary) {
   if(!Object.hasOwn(rule.dictionary,String(value))) throw new ConnectorError('MAPPING_UNKNOWN');
   value=rule.dictionary[String(value)];
  }
  output[rule.to]=value;
 }
 return output;
}
exports.ConnectorError=ConnectorError;
exports.fingerprint=fingerprint;
exports.validatePolicy=validatePolicy;
exports.retryDelay=retryDelay;
exports.mapRecord=mapRecord;
