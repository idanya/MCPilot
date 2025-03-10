/**
 * Example of loading and using configuration
 */

import { ConfigLoader } from '../src/services/config/config-loader';
import { LogLevel } from '../src/interfaces/base/session';
import * as path from 'path';

async function testConfig() {
    try {
        // Create loader with JSON config file
        const configPath = path.join(__dirname, 'config.json');
        const loader = new ConfigLoader({
            configPath,
            env: process.env,
            overrides: {
                logging: {
                    level: 'DEBUG',
                    format: 'json'
                }
            }
        });

        // Load and validate configuration
        const config = await loader.load();
        console.log('Configuration loaded successfully:');
        console.log(JSON.stringify(config, null, 2));

        // Example of accessing configuration values
        if (config.providers.openai) {
            console.log('\nOpenAI Configuration:');
            console.log('Model:', config.providers.openai.model);
            console.log('API Key:', config.providers.openai.apiKey?.substring(0, 8) + '...');
        }

        if (config.providers.anthropic) {
            console.log('\nAnthropic Configuration:');
            console.log('Model:', config.providers.anthropic.model);
            console.log('API Key:', config.providers.anthropic.apiKey?.substring(0, 8) + '...');
        }

        console.log('\nSession Configuration:');
        console.log('Context Size:', config.session.contextSize);
        console.log('Max Queue Size:', config.session.maxQueueSize);

        console.log('\nLogging Configuration:');
        console.log('Level:', config.logging.level);
        console.log('Format:', config.logging.format);

        if (config.mcp?.extensions) {
            console.log('\nMCP Extensions:');
            for (const [name, ext] of Object.entries(config.mcp.extensions)) {
                console.log(`- ${name}:`, ext.enabled ? 'enabled' : 'disabled');
                console.log('  Command:', ext.cmd);
                if (ext.args) console.log('  Args:', ext.args);
            }
        }

    } catch (error) {
        console.error('Error loading configuration:');
        if (error instanceof Error) {
            console.error(error.message);
            console.error(error.stack);
        } else {
            console.error(error);
        }
        process.exit(1);
    }
}

// Example configuration file to create
const exampleConfig = {
    providers: {
        openai: {
            model: 'gpt-4',
            apiKey: process.env.OPENAI_API_KEY || 'your-api-key-here',
            maxRetries: 3
        },
        anthropic: {
            model: 'claude-2',
            apiKey: process.env.ANTHROPIC_API_KEY || 'your-api-key-here',
            maxTokensToSample: 1000
        }
    },
    session: {
        contextSize: 4096,
        maxQueueSize: 100,
        defaultProvider: 'openai'
    },
    logging: {
        level: 'INFO' as const,
        format: 'json' as const,
        maxFiles: 5,
        maxSize: '10mb'
    },
    mcp: {
        extensions: {
            python: {
                cmd: 'python',
                args: ['-u'],
                enabled: true,
                type: 'stdio' as const
            },
            node: {
                cmd: 'node',
                enabled: true,
                type: 'stdio' as const
            }
        }
    }
};

// Write example config if it doesn't exist
import * as fs from 'fs/promises';

async function createExampleConfig() {
    const configPath = path.join(__dirname, 'config.json');
    try {
        await fs.access(configPath);
        console.log('Config file already exists, skipping creation');
    } catch {
        await fs.writeFile(
            configPath,
            JSON.stringify(exampleConfig, null, 2),
            'utf8'
        );
        console.log('Created example config file:', configPath);
    }
}

// Run the example
if (require.main === module) {
    createExampleConfig()
        .then(testConfig)
        .catch(console.error);
}