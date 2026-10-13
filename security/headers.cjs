'use strict';

const baseHeaders = Object.freeze({
  'Content-Security-Policy': "default-src 'none'; base-uri 'none'; object-src 'none'; form-action 'self'; frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
});

function createBaselineSecurityHeaders(environment = process.env) {
  return Object.freeze({
    ...baseHeaders,
    ...(environment.AGRO_ENV === 'production'
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
  createBaselineSecurityHeaders,
  installBaselineSecurityHeaders,
};
