export interface LkConfig {
    hdEnabled: boolean;
    chromiumPath?: string;
}
export declare function readConfig(): LkConfig;
export declare function writeConfig(config: LkConfig): void;
export declare function getConfigPath(): string;
