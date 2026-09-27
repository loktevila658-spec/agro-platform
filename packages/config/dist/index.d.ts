export declare const runtimeEnvironments: readonly ["development", "test", "staging", "production"];
export type RuntimeEnvironment = (typeof runtimeEnvironments)[number];
export declare const deploymentModes: readonly ["LOCAL_PRIMARY"];
export type DeploymentMode = (typeof deploymentModes)[number];
export interface RuntimeAuthority {
    readonly localWrite: true;
    readonly cloudWrite: false;
}
export interface RuntimeConfig {
    readonly environment: RuntimeEnvironment;
    readonly deploymentMode: DeploymentMode;
    readonly siteTimeZone: string;
    readonly port: number;
    readonly authority: RuntimeAuthority;
}
export type EnvironmentSource = Readonly<Record<string, string | undefined>>;
export interface ConfigValidationIssue {
    readonly variable: string;
    readonly message: string;
}
export declare class ConfigValidationError extends Error {
    readonly issues: readonly ConfigValidationIssue[];
    constructor(issues: readonly ConfigValidationIssue[]);
}
export declare function parseRuntimeConfig(source: EnvironmentSource): RuntimeConfig;
