'use strict';

const baseHeaders = Object.freeze({
  'Content-Security-Policy': "default-src 'none'; base-uri 'none'; object-src 'none'; form-action 'self'; frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
});

class SecurityHeaderConfigError extends Error {
  constructor(field, reason) {
    super(`Invalid security header configuration ${field}: ${reason}`);
    this.name = 'SecurityHeaderConfigError';
    this.field = field;
  }
}

function createBaselineSecurityHeaders(environment = process.env) {
  const httpsReady = environment.AGRO_HTTPS_READY;
  if (httpsReady !== undefined && httpsReady !== 'true' && httpsReady !== 'false') {
    throw new SecurityHeaderConfigError('AGRO_HTTPS_READY', 'must be true or false');
  }
  if (httpsReady === 'true' && environment.AGRO_ENV !== 'production') {
    throw new SecurityHeaderConfigError('AGRO_HTTPS_READY', 'may be true only in production');
  }

  return Object.freeze({
    ...baseHeaders,
    ...(environment.AGRO_ENV === 'production' && httpsReady === 'true'
      ? { 'Strict-Transport-Security': 'max-age=31536000' }
      : {}),
  });
}

function installBaselineSecurityHeaders(application, environment = process.env) {
  const headers = createBaselineSecurityHeaders(environment);
  application.use((_request, response, next) => {
    for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
    next();
  });
}

module.exports = {
  SecurityHeaderConfigError,
  createBaselineSecurityHeaders,
  installBaselineSecurityHeaders,
};
