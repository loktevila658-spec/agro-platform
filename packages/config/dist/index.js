export const runtimeEnvironments = [
    'development',
    'test',
    'staging',
    'production',
];
export const deploymentModes = ['LOCAL_PRIMARY'];
export class ConfigValidationError extends Error {
    issues;
    constructor(issues) {
        super(`Invalid runtime configuration:\n${issues
            .map((issue) => `- ${issue.variable}: ${issue.message}`)
            .join('\n')}`);
        this.name = 'ConfigValidationError';
        this.issues = Object.freeze([...issues]);
    }
}
const requiredVariables = [
    'AGRO_ENV',
    'AGRO_DEPLOYMENT_MODE',
    'AGRO_SITE_TIME_ZONE',
    'AGRO_LOCAL_WRITE_ENABLED',
    'AGRO_CLOUD_WRITE_ENABLED',
    'PORT',
];
function isRuntimeEnvironment(value) {
    return runtimeEnvironments.includes(value);
}
function isDeploymentMode(value) {
    return deploymentModes.includes(value);
}
function isIanaTimeZone(value) {
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
        return true;
    }
    catch {
        return false;
    }
}
function parseBoolean(value) {
    if (value === 'true')
        return true;
    if (value === 'false')
        return false;
    return undefined;
}
function readRequired(source, issues) {
    const values = {};
    for (const variable of requiredVariables) {
        const value = source[variable];
        if (value === undefined || value.trim() === '') {
            issues.push({ variable, message: 'is required' });
        }
        else {
            values[variable] = value.trim();
        }
    }
    return values;
}
export function parseRuntimeConfig(source) {
    const issues = [];
    const values = readRequired(source, issues);
    const environment = values.AGRO_ENV;
    if (environment !== undefined && !isRuntimeEnvironment(environment)) {
        issues.push({
            variable: 'AGRO_ENV',
            message: `must be one of: ${runtimeEnvironments.join(', ')}`,
        });
    }
    const deploymentMode = values.AGRO_DEPLOYMENT_MODE;
    if (deploymentMode !== undefined && !isDeploymentMode(deploymentMode)) {
        issues.push({
            variable: 'AGRO_DEPLOYMENT_MODE',
            message: 'must be LOCAL_PRIMARY',
        });
    }
    const siteTimeZone = values.AGRO_SITE_TIME_ZONE;
    if (siteTimeZone !== undefined && !isIanaTimeZone(siteTimeZone)) {
        issues.push({
            variable: 'AGRO_SITE_TIME_ZONE',
            message: 'must be a valid IANA time zone',
        });
    }
    const localWrite = values.AGRO_LOCAL_WRITE_ENABLED;
    const parsedLocalWrite = localWrite === undefined ? undefined : parseBoolean(localWrite);
    if (localWrite !== undefined && parsedLocalWrite === undefined) {
        issues.push({
            variable: 'AGRO_LOCAL_WRITE_ENABLED',
            message: 'must be the boolean true or false',
        });
    }
    else if (parsedLocalWrite === false) {
        issues.push({
            variable: 'AGRO_LOCAL_WRITE_ENABLED',
            message: 'must be true in LOCAL_PRIMARY mode',
        });
    }
    const cloudWrite = values.AGRO_CLOUD_WRITE_ENABLED;
    const parsedCloudWrite = cloudWrite === undefined ? undefined : parseBoolean(cloudWrite);
    if (cloudWrite !== undefined && parsedCloudWrite === undefined) {
        issues.push({
            variable: 'AGRO_CLOUD_WRITE_ENABLED',
            message: 'must be the boolean true or false',
        });
    }
    else if (parsedCloudWrite === true) {
        issues.push({
            variable: 'AGRO_CLOUD_WRITE_ENABLED',
            message: 'must be false; cloud writes are not authoritative',
        });
    }
    const rawPort = values.PORT;
    let port;
    if (rawPort !== undefined) {
        if (!/^[0-9]+$/.test(rawPort)) {
            issues.push({
                variable: 'PORT',
                message: 'must be a base-10 integer from 1 to 65535',
            });
        }
        else {
            port = Number(rawPort);
            if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
                issues.push({
                    variable: 'PORT',
                    message: 'must be a base-10 integer from 1 to 65535',
                });
            }
        }
    }
    if (issues.length > 0) {
        throw new ConfigValidationError(issues);
    }
    const authority = Object.freeze({
        localWrite: true,
        cloudWrite: false,
    });
    return Object.freeze({
        environment: environment,
        deploymentMode: deploymentMode,
        siteTimeZone: siteTimeZone,
        port: port,
        authority,
    });
}
//# sourceMappingURL=index.js.map